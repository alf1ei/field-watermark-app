package com.gszd.capacitor.camera2

import android.content.Context
import android.graphics.ImageFormat
import android.graphics.Matrix
import android.graphics.Rect
import android.graphics.RectF
import android.graphics.SurfaceTexture
import android.hardware.camera2.CameraAccessException
import android.hardware.camera2.CameraCaptureSession
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraDevice
import android.hardware.camera2.CameraManager
import android.hardware.camera2.CameraMetadata
import android.hardware.camera2.CaptureRequest
import android.hardware.camera2.CaptureResult
import android.hardware.camera2.TotalCaptureResult
import android.hardware.camera2.params.OutputConfiguration
import android.hardware.camera2.params.SessionConfiguration
import android.media.ImageReader
import android.os.Build
import android.os.Handler
import android.os.HandlerThread
import android.util.Log
import android.util.Size
import android.util.SparseIntArray
import android.view.Surface
import android.view.TextureView
import android.view.WindowManager
import java.io.File
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale
import java.util.concurrent.Semaphore
import java.util.concurrent.TimeUnit
import kotlin.math.max

/** Result of a still capture: a JPEG file on disk (no base64 round-trip). */
data class CaptureFile(val path: String, val width: Int, val height: Int)

/**
 * Camera2 engine: owns the CameraDevice / capture session / preview surface.
 *
 * Design notes (see INTEGRATION.md for the full picture):
 * - All Camera2 calls run on a dedicated background HandlerThread ("GszdCamera2").
 * - The preview is a TextureView owned by the plugin (added to a container
 *   behind the WebView, like the old camera-preview plugin). The engine only
 *   uses its SurfaceTexture.
 * - Still capture goes through an ImageReader (JPEG) and is written straight
 *   to a file in the app cache dir; the JS side reads the file for the
 *   watermark burn (no base64 over the bridge).
 * - Zoom: CONTROL_ZOOM_RATIO on API 30+ when the camera reports a range,
 *   otherwise SCALER_CROP_REGION (digital zoom). On a logical multi-camera,
 *   a zoom ratio < 1 zooms out to the ultra-wide lens and > 1 switches to
 *   the telephoto lens automatically.
 * - The plugin (GszdCamera2Plugin) owns lifecycle: it calls start()/stop()
 *   and forwards handleOnPause/handleOnResume.
 */
class Camera2Engine(private val context: Context) {

    interface Listener {
        /** First preview frame delivered (startPreview may resolve). */
        fun onPreviewFirstFrame()
        fun onError(message: String)
        fun onCameraDisconnected()
    }

    var listener: Listener? = null

    companion object {
        private const val TAG = "GszdCamera2"
        private const val THREAD_NAME = "GszdCamera2"
        private const val FIRST_FRAME_TIMEOUT_MS = 10_000L
        private const val MAX_PREVIEW_LONG_EDGE = 1920
        private const val ORIENTATION_UNKNOWN = -1

        /** JPEG orientation mapping (Camera2Basic sample). */
        private val ORIENTATIONS = SparseIntArray().apply {
            append(Surface.ROTATION_0, 90)
            append(Surface.ROTATION_90, 0)
            append(Surface.ROTATION_180, 270)
            append(Surface.ROTATION_270, 180)
        }
    }

    // ---- background thread ----
    private val cameraThread = HandlerThread(THREAD_NAME).apply { start() }
    private val backgroundHandler = Handler(cameraThread.looper)

    // ---- camera state (guarded by the camera-open semaphore where noted) ----
    private val cameraOpenCloseLock = Semaphore(1)
    /**
     * Nullable on purpose: getSystemService can return null on devices
     * without a camera service, and the `as` cast would otherwise throw
     * in the constructor (killing plugin load). Call sites check null
     * and fail the start cleanly instead of crashing.
     */
    private var cameraManager: CameraManager? =
        try {
            context.getSystemService(Context.CAMERA_SERVICE) as? CameraManager
        } catch (e: Exception) {
            Log.w(TAG, "no camera service", e)
            null
        }
    private var cameraDevice: CameraDevice? = null
    private var captureSession: CameraCaptureSession? = null
    private var previewRequestBuilder: CaptureRequest.Builder? = null
    private var previewRequest: CaptureRequest? = null
    private var imageReader: ImageReader? = null
    private var textureView: TextureView? = null

    private var characteristics: CameraCharacteristics? = null
    private var sensorOrientation: Int = 0
    private var sensorActiveArray: Rect? = null
    private var previewSize: Size? = null
    private var captureSize: Size? = null

    /** Current camera id / info (set on open). */
    @Volatile var currentCameraId: String? = null
        private set
    @Volatile var currentInfo: CameraInfo? = null
        private set
    @Volatile var isRunning: Boolean = false
        private set

    /** Zoom state. */
    @Volatile var zoomRatio: Float = 1f
        private set
    private var zoomMin: Float = 1f
    private var zoomMax: Float = 1f
    private var maxDigitalZoom: Float = 1f
    private var useZoomRatio: Boolean = false

    /** Flash / exposure state. */
    @Volatile var flashMode: String = "off"
        private set
    private var exposureValue: Float = 0f
    private var exposureRange: IntRange = 0..0
    private var exposureStep: Float = 1f

    /** Sensor rect currently visible in the preview (for tap-to-focus mapping). */
    private var visibleRect: Rect? = null

    /** Written from the UI thread (stop()) and read on the background thread. */
    @Volatile
    private var firstFrameReported: Boolean = false
    private var firstFrameTimeoutPosted: Boolean = false
    private var pendingCapture: ((Result<CaptureFile>) -> Unit)? = null
    private var pendingCaptureSize: Size? = null

    /** True while a start() is in flight (prevents two overlapping opens). */
    @Volatile
    private var starting: Boolean = false

    // ------------------------------------------------------------------
    // Public API (called by the plugin; camera work is posted to the
    // background handler, callbacks arrive there too).
    // ------------------------------------------------------------------

    /**
     * Open [cameraId] and start the preview on [view].
     * [onReady] is invoked on the background thread with (true, null) on the
     * first preview frame, or (false, reason) on failure / timeout.
     */
    fun start(
        cameraId: String,
        view: TextureView,
        captureWidth: Int?,
        captureHeight: Int?,
        onReady: (Boolean, String?) -> Unit
    ) {
        // Reject a second start while one is still opening (the plugin also
        // guards this, but the engine must not let two opens interleave —
        // the second would leave the first camera leaked).
        if (starting) {
            onReady(false, "camera is already starting")
            return
        }
        starting = true
        // onReady must fire exactly once: several paths below (open error,
        // session failure, first frame, timeout) can each try to report,
        // and a double resolve/reject is a bug. Guard it here so every
        // caller — including the top-level catch below — is safe.
        var reported = false
        val wrappedReady: (Boolean, String?) -> Unit = { ok, err ->
            if (!reported) {
                reported = true
                starting = false
                onReady(ok, err)
            }
        }
        backgroundHandler.post {
            try {
                startOnBackground(cameraId, view, captureWidth, captureHeight, wrappedReady)
            } catch (e: Exception) {
                // Uncaught exceptions on this thread kill the whole process
                // (v3.1.0 crash). Turn them into a clean start failure.
                Log.w(TAG, "start failed", e)
                wrappedReady(false, "start failed: ${e.message}")
            }
        }
    }

    fun stop() {
        backgroundHandler.post { closeCameraInternal() }
        // Also drop any pending start callback so a late first-frame can't
        // resolve a start call after the user already stopped.
        firstFrameReported = true
    }

    /** Change the zoom ratio. Returns the ratio actually applied (clamped). */
    fun setZoomRatio(ratio: Float, done: (Float) -> Unit) {
        backgroundHandler.post {
            try {
                val applied = applyZoomRatio(ratio)
                done(applied)
            } catch (e: Exception) {
                Log.w(TAG, "setZoomRatio", e)
                done(zoomRatio)
            }
        }
    }

    fun getZoomRange(): Pair<Float, Float> = zoomMin to zoomMax

    fun setFlashMode(mode: String, done: (Boolean) -> Unit) {
        backgroundHandler.post {
            try {
                flashMode = mode
                val ok = updatePreviewRequest()
                done(ok)
            } catch (e: Exception) {
                Log.w(TAG, "setFlashMode", e)
                done(false)
            }
        }
    }

    fun getSupportedFlashModes(): List<String> {
        val c = characteristics ?: return listOf("off")
        val flashAvailable = c.get(CameraCharacteristics.FLASH_INFO_AVAILABLE) ?: false
        val aeModes = c.get(CameraCharacteristics.CONTROL_AE_AVAILABLE_MODES) ?: intArrayOf()
        val out = mutableListOf("off")
        if (flashAvailable) {
            out.add("on")
            out.add("torch")
        }
        if (aeModes.contains(CaptureRequest.CONTROL_AE_MODE_ON_AUTO_FLASH)) out.add("auto")
        return out
    }

    fun setExposureCompensation(value: Float, done: (Float) -> Unit) {
        backgroundHandler.post {
            try {
                val clamped = value.coerceIn(exposureRange.first.toFloat(), exposureRange.last.toFloat())
                exposureValue = clamped
                updatePreviewRequest()
                done(clamped)
            } catch (e: Exception) {
                Log.w(TAG, "setExposureCompensation", e)
                done(exposureValue)
            }
        }
    }

    fun getExposureRange(): Triple<Int, Int, Float> =
        Triple(exposureRange.first, exposureRange.last, exposureStep)

    /**
     * Focus (and meter) at a point in the preview. [nx]/[ny] are normalized
     * 0..1 in the preview view. Fire-and-forget.
     */
    fun tapToFocus(nx: Float, ny: Float) {
        backgroundHandler.post { tapToFocusOnBackground(nx, ny) }
    }

    /**
     * Capture a still photo to a file. [quality] is JPEG quality 0-100.
     * The result callback runs on the background thread.
     */
    fun capture(quality: Int, onResult: (Result<CaptureFile>) -> Unit) {
        backgroundHandler.post { captureOnBackground(quality, onResult) }
    }

    /** Re-apply the preview transform after the view was resized / rotated. */
    fun updatePreviewTransform(viewWidth: Int, viewHeight: Int) {
        val view = textureView ?: return
        view.post { configureTransform(viewWidth, viewHeight) }
    }

    /** Shut the background thread down (called from the plugin's onDestroy). */
    fun shutdown() {
        try {
            closeCameraInternal()
        } catch (e: Exception) {
            Log.w(TAG, "shutdown close failed", e)
        }
        cameraThread.quitSafely()
    }

    // ------------------------------------------------------------------
    // Open / session
    // ------------------------------------------------------------------

    private fun startOnBackground(
        cameraId: String,
        view: TextureView,
        captureWidth: Int?,
        captureHeight: Int?,
        onReady: (Boolean, String?) -> Unit
    ) {
        // If a preview is already running, close it first (switchCamera path
        // calls stop() first, but be safe).
        if (cameraDevice != null) closeCameraInternal()
        textureView = view
        firstFrameReported = false
        firstFrameTimeoutPosted = false
        val info = try {
            val all = CameraInfoUtil.listCameras(context)
            all.firstOrNull { it.id == cameraId }
        } catch (e: Exception) {
            null
        }
        currentInfo = info
        currentCameraId = cameraId
        zoomRatio = 1f
        try {
            val mgr = cameraManager ?: run {
                onReady(false, "camera service unavailable")
                return
            }
            characteristics = mgr.getCameraCharacteristics(cameraId)
        } catch (e: Exception) {
            onReady(false, "cannot read camera $cameraId: ${e.message}")
            return
        }
        val chars = characteristics ?: run {
            onReady(false, "cannot read camera $cameraId")
            return
        }
        sensorOrientation = chars.get(CameraCharacteristics.SENSOR_ORIENTATION) ?: 0
        sensorActiveArray = chars.get(CameraCharacteristics.SENSOR_INFO_ACTIVE_ARRAY_SIZE)
        maxDigitalZoom = chars.get(CameraCharacteristics.SCALER_AVAILABLE_MAX_DIGITAL_ZOOM) ?: 1f
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
            val range = chars.get(CameraCharacteristics.CONTROL_ZOOM_RATIO_RANGE)
            if (range != null) {
                useZoomRatio = true
                zoomMin = range.lower
                zoomMax = range.upper
            } else {
                useZoomRatio = false
                zoomMin = 1f
                zoomMax = maxDigitalZoom.coerceAtLeast(1f)
            }
        } else {
            useZoomRatio = false
            zoomMin = 1f
            zoomMax = maxDigitalZoom.coerceAtLeast(1f)
        }
        val aeRange = chars.get(CameraCharacteristics.CONTROL_AE_COMPENSATION_RANGE)
        if (aeRange != null) {
            exposureRange = aeRange.lower..aeRange.upper
            val step = chars.get(CameraCharacteristics.CONTROL_AE_COMPENSATION_STEP)
            if (step != null) exposureStep = step.toFloat()
        }
        // Choose preview + capture sizes from the view size.
        val viewW = if (view.width > 0) view.width else 1080
        val viewH = if (view.height > 0) view.height else 1440
        previewSize = choosePreviewSize(chars, viewW, viewH)
        val preview = previewSize ?: Size(viewW, viewH)
        captureSize = chooseCaptureSize(chars, captureWidth, captureHeight, preview)
        // First-frame timeout: resolve the start call even if the preview
        // never produces a frame, so the JS side never hangs forever.
        if (!firstFrameTimeoutPosted) {
            firstFrameTimeoutPosted = true
            backgroundHandler.postDelayed({
                if (!firstFrameReported) {
                    firstFrameReported = true
                    onReady(false, "preview timed out (no first frame in ${FIRST_FRAME_TIMEOUT_MS}ms)")
                }
            }, FIRST_FRAME_TIMEOUT_MS)
        }
        // Wait for the TextureView surface, then open the camera.
        val surfaceReady = view.isAvailable
        if (surfaceReady) {
            openCameraInternal(onReady)
        } else {
            view.surfaceTextureListener = object : TextureView.SurfaceTextureListener {
                override fun onSurfaceTextureAvailable(st: SurfaceTexture, w: Int, h: Int) {
                    backgroundHandler.post { openCameraInternal(onReady) }
                }

                override fun onSurfaceTextureSizeChanged(st: SurfaceTexture, w: Int, h: Int) {
                    configureTransform(w, h)
                }

                override fun onSurfaceTextureDestroyed(st: SurfaceTexture): Boolean = true
                override fun onSurfaceTextureUpdated(st: SurfaceTexture) {}
            }
        }
    }

    private fun openCameraInternal(onReady: (Boolean, String?) -> Unit) {
        val id = currentCameraId ?: run {
            onReady(false, "no camera id")
            return
        }
        val mgr = cameraManager ?: run {
            onReady(false, "camera service unavailable")
            return
        }
        // Permission is requested by the plugin (Capacitor permission flow)
        // before start() is called; openCamera throws SecurityException if
        // it was revoked meanwhile.
        // tryAcquire throws InterruptedException — it must be caught here:
        // an uncaught exception on this thread kills the whole process.
        val acquired = try {
            cameraOpenCloseLock.tryAcquire(2500, TimeUnit.MILLISECONDS)
        } catch (e: InterruptedException) {
            Thread.currentThread().interrupt()
            onReady(false, "camera open interrupted")
            return
        }
        if (!acquired) {
            onReady(false, "camera busy (open lock timeout)")
            return
        }
        try {
            mgr.openCamera(id, deviceStateCallback(onReady), backgroundHandler)
        } catch (e: CameraAccessException) {
            cameraOpenCloseLock.release()
            onReady(false, "openCamera failed: ${e.message}")
        } catch (e: SecurityException) {
            cameraOpenCloseLock.release()
            onReady(false, "camera permission denied")
        } catch (e: IllegalArgumentException) {
            cameraOpenCloseLock.release()
            onReady(false, "unknown camera id $id")
        }
    }

    private fun deviceStateCallback(onReady: (Boolean, String?) -> Unit) =
        object : CameraDevice.StateCallback() {
            override fun onOpened(camera: CameraDevice) {
                cameraOpenCloseLock.release()
                cameraDevice = camera
                createCaptureSession(onReady)
            }

            override fun onDisconnected(camera: CameraDevice) {
                cameraOpenCloseLock.release()
                camera.close()
                cameraDevice = null
                isRunning = false
                listener?.onCameraDisconnected()
            }

            override fun onError(camera: CameraDevice, error: Int) {
                cameraOpenCloseLock.release()
                camera.close()
                cameraDevice = null
                isRunning = false
                if (!firstFrameReported) {
                    firstFrameReported = true
                    onReady(false, "camera error $error")
                }
                listener?.onError("camera error $error")
            }
        }

    private fun createCaptureSession(onReady: (Boolean, String?) -> Unit) {
        val camera = cameraDevice ?: run {
            onReady(false, "camera closed before session")
            return
        }
        val view = textureView ?: run {
            onReady(false, "preview view gone")
            return
        }
        val size = previewSize ?: run {
            onReady(false, "no preview size")
            return
        }
        try {
            // The preview SurfaceTexture must be sized to the preview stream.
            if (view.isAvailable) {
                view.surfaceTexture?.setDefaultBufferSize(size.width, size.height)
            }
            // surfaceTexture can be null if the view was detached between
            // the isAvailable check and here (e.g. Activity paused). A null
            // SurfaceTexture makes Surface() throw NPE — fail cleanly.
            val surfaceTexture = view.surfaceTexture ?: run {
                onReady(false, "preview surface gone")
                return
            }
            val previewSurface = Surface(surfaceTexture)
            // (Re)create the ImageReader for still capture.
            try {
                imageReader?.close()
            } catch (e: Exception) {
                Log.w(TAG, "close old ImageReader", e)
            }
            val capSize = captureSize ?: size
            val reader = ImageReader.newInstance(capSize.width, capSize.height, ImageFormat.JPEG, 2)
            reader.setOnImageAvailableListener(imageAvailableListener, backgroundHandler)
            imageReader = reader
            val targets = listOf(previewSurface, reader.surface)
            val sessionCallback = object : CameraCaptureSession.StateCallback() {
                override fun onConfigured(session: CameraCaptureSession) {
                    captureSession = session
                    try {
                        previewRequestBuilder =
                            camera.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW).apply {
                                addTarget(previewSurface)
                                set(
                                    CaptureRequest.CONTROL_AF_MODE,
                                    CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_PICTURE
                                )
                            }
                        applyFlashToBuilder(previewRequestBuilder!!, forPreview = true)
                        applyZoomToBuilder(previewRequestBuilder!!)
                        applyExposureToBuilder(previewRequestBuilder!!)
                        previewRequest = previewRequestBuilder!!.build()
                        session.setRepeatingRequest(previewRequest!!, previewCaptureCallback(onReady), backgroundHandler)
                        isRunning = true
                        updateVisibleRect()
                        view.post { configureTransform(view.width, view.height) }
                    } catch (e: CameraAccessException) {
                        onReady(false, "start preview failed: ${e.message}")
                    } catch (e: IllegalStateException) {
                        // Camera/session closed between open and configure
                        // (e.g. Activity paused mid-start): fail cleanly.
                        onReady(false, "start preview failed: camera closed")
                    } catch (e: Exception) {
                        onReady(false, "start preview failed: ${e.message}")
                    }
                }

                override fun onConfigureFailed(session: CameraCaptureSession) {
                    onReady(false, "capture session configuration failed")
                }
            }
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                val config = SessionConfiguration(
                    SessionConfiguration.SESSION_REGULAR,
                    targets.map { OutputConfiguration(it) },
                    { command -> backgroundHandler.post(command) },
                    sessionCallback
                )
                camera.createCaptureSession(config)
            } else {
                @Suppress("DEPRECATION")
                camera.createCaptureSession(targets, sessionCallback, backgroundHandler)
            }
        } catch (e: CameraAccessException) {
            onReady(false, "createCaptureSession failed: ${e.message}")
        } catch (e: IllegalArgumentException) {
            onReady(false, "createCaptureSession failed: ${e.message}")
        } catch (e: IllegalStateException) {
            // Camera closed between open and session creation.
            onReady(false, "createCaptureSession failed: camera closed")
        } catch (e: Exception) {
            onReady(false, "createCaptureSession failed: ${e.message}")
        }
    }

    /** First-frame callback: resolves the pending startPreview call once. */
    private fun previewCaptureCallback(onReady: (Boolean, String?) -> Unit) =
        object : CameraCaptureSession.CaptureCallback() {
            override fun onCaptureCompleted(
                session: CameraCaptureSession,
                request: CaptureRequest,
                result: TotalCaptureResult
            ) {
                if (!firstFrameReported) {
                    firstFrameReported = true
                    onReady(true, null)
                    listener?.onPreviewFirstFrame()
                }
            }
        }

    private fun closeCameraInternal() {
        try {
            captureSession?.close()
        } catch (e: Exception) {
            Log.w(TAG, "close session", e)
        }
        captureSession = null
        try {
            cameraDevice?.close()
        } catch (e: Exception) {
            Log.w(TAG, "close device", e)
        }
        cameraDevice = null
        try {
            imageReader?.close()
        } catch (e: Exception) {
            Log.w(TAG, "close ImageReader", e)
        }
        imageReader = null
        previewRequestBuilder = null
        previewRequest = null
        isRunning = false
        zoomRatio = 1f
    }

    // ------------------------------------------------------------------
    // Zoom
    // ------------------------------------------------------------------

    private fun applyZoomRatio(ratio: Float): Float {
        val clamped = ratio.coerceIn(zoomMin, zoomMax)
        zoomRatio = clamped
        val builder = previewRequestBuilder ?: return clamped
        applyZoomToBuilder(builder)
        updatePreviewRequest()
        updateVisibleRect()
        return clamped
    }

    private fun applyZoomToBuilder(builder: CaptureRequest.Builder) {
        if (useZoomRatio) {
            // API 30+: the camera switches lenses on a logical multi-camera
            // by itself (ratio < 1 -> ultra-wide, ratio > 1 -> telephoto).
            builder.set(CaptureRequest.CONTROL_ZOOM_RATIO, zoomRatio)
        } else {
            val active = sensorActiveArray ?: return
            val ratio = zoomRatio.coerceIn(1f, maxDigitalZoom.coerceAtLeast(1f))
            val cropW = (active.width() / ratio).toInt().coerceAtLeast(1)
            val cropH = (active.height() / ratio).toInt().coerceAtLeast(1)
            val left = active.left + (active.width() - cropW) / 2
            val top = active.top + (active.height() - cropH) / 2
            builder.set(
                CaptureRequest.SCALER_CROP_REGION,
                Rect(left, top, left + cropW, top + cropH)
            )
        }
    }

    /** Re-submit the preview request after a builder change. Returns false if not running. */
    private fun updatePreviewRequest(): Boolean {
        val session = captureSession ?: return false
        val builder = previewRequestBuilder ?: return false
        return try {
            applyFlashToBuilder(builder, forPreview = true)
            applyExposureToBuilder(builder)
            previewRequest = builder.build()
            session.setRepeatingRequest(previewRequest!!, previewCaptureCallback { _, _ -> }, backgroundHandler)
            true
        } catch (e: CameraAccessException) {
            Log.w(TAG, "updatePreviewRequest", e)
            false
        } catch (e: IllegalStateException) {
            // Session closed (e.g. stop() raced a zoom/flash change).
            Log.w(TAG, "updatePreviewRequest: session closed", e)
            false
        } catch (e: Exception) {
            Log.w(TAG, "updatePreviewRequest", e)
            false
        }
    }

    /** Sensor rect currently visible in the preview (for tap-to-focus mapping). */
    private fun updateVisibleRect() {
        val active = sensorActiveArray ?: return
        val size = previewSize ?: return
        // Start from the active array cropped to the preview stream aspect.
        var rect = cropRectToAspect(active, size.width.toFloat() / size.height)
        // Then apply the zoom crop.
        if (useZoomRatio) {
            val ratio = zoomRatio.coerceAtLeast(0.01f)
            val w = (rect.width() / ratio).toInt().coerceAtLeast(1)
            val h = (rect.height() / ratio).toInt().coerceAtLeast(1)
            val left = rect.left + (rect.width() - w) / 2
            val top = rect.top + (rect.height() - h) / 2
            rect = Rect(left, top, left + w, top + h)
        } else {
            // SCALER_CROP_REGION path: the visible rect IS the crop region.
            val ratio = zoomRatio.coerceIn(1f, maxDigitalZoom.coerceAtLeast(1f))
            val w = (active.width() / ratio).toInt().coerceAtLeast(1)
            val h = (active.height() / ratio).toInt().coerceAtLeast(1)
            val left = active.left + (active.width() - w) / 2
            val top = active.top + (active.height() - h) / 2
            rect = Rect(left, top, left + w, top + h)
        }
        visibleRect = rect
    }

    private fun cropRectToAspect(rect: Rect, aspect: Float): Rect {
        val w = rect.width()
        val h = rect.height()
        val currentAspect = w.toFloat() / h
        return if (currentAspect > aspect) {
            // Too wide: crop left/right.
            val newW = (h * aspect).toInt()
            val left = rect.left + (w - newW) / 2
            Rect(left, rect.top, left + newW, rect.bottom)
        } else {
            // Too tall: crop top/bottom.
            val newH = (w / aspect).toInt()
            val top = rect.top + (h - newH) / 2
            Rect(rect.left, top, rect.right, top + newH)
        }
    }

    // ------------------------------------------------------------------
    // Flash / exposure
    // ------------------------------------------------------------------

    private fun applyFlashToBuilder(builder: CaptureRequest.Builder, forPreview: Boolean) {
        when (flashMode) {
            "torch" -> {
                builder.set(CaptureRequest.FLASH_MODE, CaptureRequest.FLASH_MODE_TORCH)
                builder.set(CaptureRequest.CONTROL_AE_MODE, CaptureRequest.CONTROL_AE_MODE_ON)
            }
            "on" -> {
                if (forPreview) {
                    builder.set(CaptureRequest.FLASH_MODE, CaptureRequest.FLASH_MODE_OFF)
                    builder.set(CaptureRequest.CONTROL_AE_MODE, CaptureRequest.CONTROL_AE_MODE_ON)
                } else {
                    builder.set(CaptureRequest.FLASH_MODE, CaptureRequest.FLASH_MODE_SINGLE)
                    builder.set(CaptureRequest.CONTROL_AE_MODE, CaptureRequest.CONTROL_AE_MODE_ON)
                }
            }
            "auto" -> {
                if (forPreview) {
                    builder.set(CaptureRequest.FLASH_MODE, CaptureRequest.FLASH_MODE_OFF)
                    builder.set(
                        CaptureRequest.CONTROL_AE_MODE,
                        CaptureRequest.CONTROL_AE_MODE_ON_AUTO_FLASH
                    )
                } else {
                    builder.set(CaptureRequest.FLASH_MODE, CaptureRequest.FLASH_MODE_SINGLE)
                    builder.set(
                        CaptureRequest.CONTROL_AE_MODE,
                        CaptureRequest.CONTROL_AE_MODE_ON_AUTO_FLASH
                    )
                }
            }
            else -> { // "off"
                builder.set(CaptureRequest.FLASH_MODE, CaptureRequest.FLASH_MODE_OFF)
                builder.set(CaptureRequest.CONTROL_AE_MODE, CaptureRequest.CONTROL_AE_MODE_ON)
            }
        }
    }

    private fun applyExposureToBuilder(builder: CaptureRequest.Builder) {
        if (exposureRange.first == 0 && exposureRange.last == 0) return
        builder.set(
            CaptureRequest.CONTROL_AE_EXPOSURE_COMPENSATION,
            exposureValue.toInt()
        )
    }

    // ------------------------------------------------------------------
    // Still capture
    // ------------------------------------------------------------------

    private fun captureOnBackground(quality: Int, onResult: (Result<CaptureFile>) -> Unit) {
        val camera = cameraDevice
        val session = captureSession
        val reader = imageReader
        if (camera == null || session == null || reader == null) {
            onResult(Result.failure(IllegalStateException("preview is not running")))
            return
        }
        if (pendingCapture != null) {
            onResult(Result.failure(IllegalStateException("a capture is already in progress")))
            return
        }
        pendingCapture = onResult
        pendingCaptureSize = captureSize
        try {
            val builder = camera.createCaptureRequest(CameraDevice.TEMPLATE_STILL_CAPTURE).apply {
                addTarget(reader.surface)
                set(CaptureRequest.JPEG_ORIENTATION, jpegOrientation())
                set(CaptureRequest.JPEG_QUALITY, quality.coerceIn(0, 100).toByte())
                set(
                    CaptureRequest.CONTROL_AF_MODE,
                    CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_PICTURE
                )
                applyFlashToBuilder(this, forPreview = false)
                applyZoomToBuilder(this)
                applyExposureToBuilder(this)
            }
            session.capture(builder.build(), object : CameraCaptureSession.CaptureCallback() {
                override fun onCaptureFailed(
                    session: CameraCaptureSession,
                    request: CaptureRequest,
                    failure: android.hardware.camera2.CaptureFailure
                ) {
                    val cb = pendingCapture
                    pendingCapture = null
                    cb?.invoke(Result.failure(IllegalStateException("capture failed: ${failure.reason}")))
                }
            }, backgroundHandler)
            // The ImageReader listener delivers the JPEG bytes and resolves
            // pendingCapture. If it never arrives, the call would hang, so
            // guard with a timeout. The timeout must only fail *this*
            // capture: an earlier timeout must never kill a later capture
            // that started after this one completed.
            val thisCapture = onResult
            backgroundHandler.postDelayed({
                if (pendingCapture === thisCapture) {
                    pendingCapture = null
                    thisCapture(Result.failure(IllegalStateException("capture timed out (no JPEG frame)")))
                }
            }, 10_000L)
        } catch (e: CameraAccessException) {
            pendingCapture = null
            onResult(Result.failure(e))
        } catch (e: IllegalStateException) {
            // Camera/session closed mid-capture (e.g. stop() raced it).
            pendingCapture = null
            onResult(Result.failure(e))
        } catch (e: Exception) {
            pendingCapture = null
            onResult(Result.failure(e))
        }
    }

    private val imageAvailableListener = ImageReader.OnImageAvailableListener { reader ->
        val cb = pendingCapture ?: run {
            // Spurious frame (e.g. a late image after a timeout): drain it.
            try {
                reader.acquireLatestImage()?.close()
            } catch (e: Exception) {
                Log.w(TAG, "drain image", e)
            }
            return@OnImageAvailableListener
        }
        pendingCapture = null
        val size = pendingCaptureSize
        pendingCaptureSize = null
        val image = try {
            reader.acquireLatestImage()
        } catch (e: Exception) {
            cb(Result.failure(e))
            return@OnImageAvailableListener
        }
        if (image == null) {
            cb(Result.failure(IllegalStateException("no image from ImageReader")))
            return@OnImageAvailableListener
        }
        try {
            val buffer = image.planes[0].buffer
            val bytes = ByteArray(buffer.remaining())
            buffer.get(bytes)
            // Write straight to the cache root (not a subdirectory) so the
            // app's existing deleteCaptureTempFile() helper (which deletes
            // by basename from Directory.Cache) can remove it after the
            // watermark burn. The OS may also clear the cache dir.
            val stamp = SimpleDateFormat("yyyyMMddHHmmssSSS", Locale.US).format(Date())
            val file = File(context.cacheDir, "GSZD_$stamp.jpg")
            file.writeBytes(bytes)
            cb(
                Result.success(
                    CaptureFile(
                        path = file.absolutePath,
                        width = size?.width ?: 0,
                        height = size?.height ?: 0
                    )
                )
            )
        } catch (e: Exception) {
            cb(Result.failure(e))
        } finally {
            try {
                image.close()
            } catch (e: Exception) {
                Log.w(TAG, "close image", e)
            }
        }
    }

    // ------------------------------------------------------------------
    // Tap to focus
    // ------------------------------------------------------------------

    private fun tapToFocusOnBackground(nx: Float, ny: Float) {
        val session = captureSession
        val builder = previewRequestBuilder
        val view = textureView
        if (session == null || builder == null || view == null) return
        val active = sensorActiveArray ?: return
        val visible = visibleRect ?: active
        // Map the tap point (view coords) back to sensor coords through the
        // inverse of the TextureView transform, then into the visible rect.
        val matrix = Matrix()
        view.getTransform(matrix)
        val inverse = Matrix()
        if (!matrix.invert(inverse)) return
        val pt = floatArrayOf(
            nx.coerceIn(0f, 1f) * view.width,
            ny.coerceIn(0f, 1f) * view.height
        )
        inverse.mapPoints(pt)
        val size = previewSize ?: return
        if (size.width <= 0 || size.height <= 0) return
        val sx = (pt[0] / size.width).coerceIn(0f, 1f)
        val sy = (pt[1] / size.height).coerceIn(0f, 1f)
        val sensorX = (visible.left + sx * visible.width()).toInt()
        val sensorY = (visible.top + sy * visible.height()).toInt()
        // AF / AE region: ~1/6 of the active array around the point.
        val halfW = (active.width() / 12).coerceAtLeast(1)
        val halfH = (active.height() / 12).coerceAtLeast(1)
        val region = Rect(
            (sensorX - halfW).coerceIn(active.left, active.right - 1),
            (sensorY - halfH).coerceIn(active.top, active.bottom - 1),
            (sensorX + halfW).coerceIn(active.left + 1, active.right),
            (sensorY + halfH).coerceIn(active.top + 1, active.bottom)
        )
        val meteringRect = android.hardware.camera2.params.MeteringRectangle(region, 1000)
        try {
            builder.set(CaptureRequest.CONTROL_AF_REGIONS, arrayOf(meteringRect))
            builder.set(CaptureRequest.CONTROL_AE_REGIONS, arrayOf(meteringRect))
            builder.set(CaptureRequest.CONTROL_AF_MODE, CaptureRequest.CONTROL_AF_MODE_AUTO)
            builder.set(CaptureRequest.CONTROL_AF_TRIGGER, CameraMetadata.CONTROL_AF_TRIGGER_START)
            session.setRepeatingRequest(builder.build(), null, backgroundHandler)
            // Reset the trigger so the next tap can fire again, and return
            // to continuous focus afterwards.
            backgroundHandler.postDelayed({
                try {
                    builder.set(CaptureRequest.CONTROL_AF_TRIGGER, CameraMetadata.CONTROL_AF_TRIGGER_IDLE)
                    builder.set(
                        CaptureRequest.CONTROL_AF_MODE,
                        CaptureRequest.CONTROL_AF_MODE_CONTINUOUS_PICTURE
                    )
                    session.setRepeatingRequest(builder.build(), null, backgroundHandler)
                } catch (e: Exception) {
                    Log.w(TAG, "reset AF trigger", e)
                }
            }, 500L)
        } catch (e: CameraAccessException) {
            Log.w(TAG, "tapToFocus", e)
        } catch (e: IllegalStateException) {
            Log.w(TAG, "tapToFocus: session closed", e)
        } catch (e: Exception) {
            Log.w(TAG, "tapToFocus", e)
        }
    }

    // ------------------------------------------------------------------
    // Size selection / orientation / transform
    // ------------------------------------------------------------------

    private fun choosePreviewSize(
        chars: CameraCharacteristics,
        viewW: Int,
        viewH: Int
    ): Size {
        val map = chars.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP)
        val sizes = map?.getOutputSizes(SurfaceTexture::class.java)?.toList() ?: return Size(viewW, viewH)
        val targetAspect = viewW.toFloat() / viewH.coerceAtLeast(1)
        // Prefer the largest size whose aspect matches the view (3:4 etc.)
        // and whose long edge fits under MAX_PREVIEW_LONG_EDGE.
        val matching = sizes.filter { s ->
            s.width > 0 && s.height > 0 &&
                kotlin.math.abs(s.width.toFloat() / s.height - targetAspect) < 0.02f
        }
        val pool = matching.ifEmpty { sizes }
        val sorted = pool.sortedByDescending { it.width * it.height }
        return sorted.firstOrNull { max(it.width, it.height) <= MAX_PREVIEW_LONG_EDGE }
            ?: sorted.firstOrNull()
            ?: Size(viewW, viewH)
    }

    private fun chooseCaptureSize(
        chars: CameraCharacteristics,
        wantW: Int?,
        wantH: Int?,
        previewSize: Size
    ): Size {
        val map = chars.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP)
        val sizes = map?.getOutputSizes(ImageFormat.JPEG)?.toList() ?: return previewSize
        if (wantW != null && wantH != null && wantW > 0 && wantH > 0) {
            val wantAspect = wantW.toFloat() / wantH
            val matching = sizes.filter { s ->
                kotlin.math.abs(s.width.toFloat() / s.height - wantAspect) < 0.02f
            }
            val pool = matching.ifEmpty { sizes }
            // Closest by pixel count to the requested size. If the camera
            // reports no JPEG sizes at all, fall back to the preview size
            // instead of crashing on a null (!! was here in v3.1.0).
            val wantPx = wantW * wantH
            return pool.minByOrNull { kotlin.math.abs(it.width * it.height - wantPx) }
                ?: sizes.maxByOrNull { it.width * it.height }
                ?: previewSize
        }
        return sizes.maxByOrNull { it.width * it.height } ?: previewSize
    }

    /** JPEG orientation for the still capture (Camera2Basic sample). */
    private fun jpegOrientation(): Int {
        val rotation = try {
            val wm = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
            @Suppress("DEPRECATION")
            wm.defaultDisplay.rotation
        } catch (e: Exception) {
            Surface.ROTATION_0
        }
        return (ORIENTATIONS.get(rotation) + sensorOrientation + 270) % 360
    }

    /**
     * Preview transform (Camera2Basic sample): rotates / scales the
     * TextureView so the preview fills the view without distortion.
     */
    private fun configureTransform(viewWidth: Int, viewHeight: Int) {
        val view = textureView ?: return
        val size = previewSize ?: return
        if (viewWidth <= 0 || viewHeight <= 0) return
        val rotation = try {
            val wm = context.getSystemService(Context.WINDOW_SERVICE) as WindowManager
            @Suppress("DEPRECATION")
            wm.defaultDisplay.rotation
        } catch (e: Exception) {
            Surface.ROTATION_0
        }
        val matrix = Matrix()
        val viewRect = RectF(0f, 0f, viewWidth.toFloat(), viewHeight.toFloat())
        val bufferRect = RectF(0f, 0f, size.height.toFloat(), size.width.toFloat())
        val centerX = viewRect.centerX()
        val centerY = viewRect.centerY()
        if (rotation == Surface.ROTATION_90 || rotation == Surface.ROTATION_270) {
            bufferRect.offset(centerX - bufferRect.centerX(), centerY - bufferRect.centerY())
            matrix.setRectToRect(viewRect, bufferRect, Matrix.ScaleToFit.FILL)
            val scale = max(
                viewHeight.toFloat() / size.height,
                viewWidth.toFloat() / size.width
            )
            matrix.postScale(scale, scale, centerX, centerY)
            matrix.postRotate((90 * (rotation - 2)).toFloat(), centerX, centerY)
        } else if (rotation == Surface.ROTATION_180) {
            matrix.postRotate(180f, centerX, centerY)
        }
        view.setTransform(matrix)
    }
}
