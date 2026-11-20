package com.gszd.capacitor.camera2

import android.Manifest
import android.content.pm.ActivityInfo
import android.graphics.Color
import android.graphics.Rect
import android.util.DisplayMetrics
import android.util.TypedValue
import android.view.GestureDetector
import android.view.MotionEvent
import android.view.ScaleGestureDetector
import android.view.TextureView
import android.view.View
import android.view.ViewGroup
import android.widget.FrameLayout
import com.getcapacitor.JSArray
import com.getcapacitor.JSObject
import com.getcapacitor.PermissionState
import com.getcapacitor.Plugin
import com.getcapacitor.PluginCall
import com.getcapacitor.PluginMethod
import com.getcapacitor.annotation.CapacitorPlugin
import com.getcapacitor.annotation.Permission

/**
 * Capacitor plugin: Android Camera2 preview + capture for 长江现场水印相机.
 *
 * Why this plugin exists: @capacitor-community/camera-preview only exposes
 * front/back + flip (no lens list, no slide zoom) and returns base64 photos
 * capped under 2MP. This plugin enumerates every physical camera
 * (main / ultra-wide / telephoto / front), supports slide zoom
 * (CONTROL_ZOOM_RATIO on API 30+, SCALER_CROP_REGION below) and captures
 * straight to a JPEG file.
 *
 * Preview embedding follows the old plugin's approach: a FrameLayout
 * container is added to the WebView's parent, the WebView background is
 * set transparent, and (when toBack) the WebView is brought to front so
 * the preview sits behind the HTML overlays. Touches on the preview rect
 * are forwarded to a ScaleGestureDetector (pinch zoom) and a
 * GestureDetector (tap to focus); the listener returns false so the
 * WebView still handles HTML buttons.
 *
 * Permission: the app requests CAMERA itself (via @capacitor/camera) before
 * calling startPreview; this plugin only checks the state and rejects when
 * it is not granted.
 *
 * Lifecycle: handleOnPause closes the camera (frees it for other apps);
 * handleOnResume reopens it when the preview was running. The app's own
 * resumeCameraView() is the backstop (it checks isPreviewStarted()).
 */
@CapacitorPlugin(
    name = "GszdCamera2",
    permissions = [Permission(strings = [Manifest.permission.CAMERA], alias = "camera")]
)
class GszdCamera2Plugin : Plugin() {

    private lateinit var engine: Camera2Engine
    private var containerView: FrameLayout? = null
    private var textureView: TextureView? = null
    private var containerViewId: Int = 0

    /** Preview rect in physical pixels (used for touch hit-testing). */
    private var previewRectPx = Rect(0, 0, 0, 0)

    private var currentCameraId: String? = null
    private var currentFacing: String = "back"
    private var lastCaptureWidth: Int? = null
    private var lastCaptureHeight: Int? = null
    private var lockOrientation: Boolean = true
    private var previousOrientationRequest: Int = -1
    private var wasRunningBeforePause: Boolean = false

    @Volatile
    private var pendingStartCall: PluginCall? = null
    private var scaleDetector: ScaleGestureDetector? = null
    private var tapDetector: GestureDetector? = null
    private var gestureStartZoom: Float = 1f
    private var lastPinchApplied: Float = 1f

    override fun load() {
        super.load()
        containerViewId = View.generateViewId()
        engine = Camera2Engine(bridge.activity.applicationContext)
        engine.listener = object : Camera2Engine.Listener {
            override fun onPreviewFirstFrame() {}
            override fun onError(message: String) {
                android.util.Log.w("GszdCamera2", message)
            }

            override fun onCameraDisconnected() {
                android.util.Log.w("GszdCamera2", "camera disconnected")
            }
        }
    }

    // ------------------------------------------------------------------
    // Enumeration
    // ------------------------------------------------------------------

    @PluginMethod
    fun listCameras(call: PluginCall) {
        val activity = bridge.activity ?: run {
            call.reject("no activity")
            return
        }
        val cameras = try {
            CameraInfoUtil.listCameras(activity)
        } catch (e: Exception) {
            call.reject("listCameras failed: ${e.message}")
            return
        }
        val arr = JSArray()
        for (c in cameras) {
            val o = JSObject()
            o.put("id", c.id)
            o.put("facing", c.facing)
            o.put("type", c.type)
            o.put("label", c.label)
            o.put("focalLengthMm", c.focalLengthMm.toDouble())
            val zr = JSObject()
            zr.put("min", c.zoomMin.toDouble())
            zr.put("max", c.zoomMax.toDouble())
            o.put("zoomRatioRange", zr)
            o.put("maxDigitalZoom", c.maxDigitalZoom.toDouble())
            o.put("logical", c.logical)
            val phys = JSArray()
            for (id in c.physicalIds) phys.put(id)
            o.put("physicalIds", phys)
            arr.put(o)
        }
        val res = JSObject()
        res.put("cameras", arr)
        call.resolve(res)
    }

    // ------------------------------------------------------------------
    // Preview
    // ------------------------------------------------------------------

    @PluginMethod
    fun startPreview(call: PluginCall) {
        val activity = bridge.activity ?: run {
            call.reject("no activity")
            return
        }
        if (getPermissionState("camera") != PermissionState.GRANTED) {
            call.reject("camera permission not granted. Request it first (e.g. via @capacitor/camera).")
            return
        }
        if (pendingStartCall != null) {
            call.reject("preview is already starting")
            return
        }
        val cameras = try {
            CameraInfoUtil.listCameras(activity)
        } catch (e: Exception) {
            call.reject("listCameras failed: ${e.message}")
            return
        }
        val requestedId = call.getString("cameraId")
        val facing = call.getString("facing", "back") ?: "back"
        val target = when {
            !requestedId.isNullOrEmpty() -> cameras.firstOrNull { it.id == requestedId }
            facing == "front" -> CameraInfoUtil.defaultFrontCamera(cameras)
            else -> CameraInfoUtil.defaultBackCamera(cameras)
        } ?: run {
            call.reject("no camera found")
            return
        }
        val metrics = activity.resources.displayMetrics
        val x = dipToPx(call.getInt("x", 0) ?: 0, metrics)
        val y = dipToPx(call.getInt("y", 0) ?: 0, metrics)
        val w = dipToPx(call.getInt("width", 0) ?: 0, metrics).let { if (it <= 0) metrics.widthPixels else it }
        val h = dipToPx(call.getInt("height", 0) ?: 0, metrics).let { if (it <= 0) metrics.heightPixels else it }
        val toBack = call.getBoolean("toBack", true) ?: true
        val enableZoom = call.getBoolean("enableZoom", true) ?: true
        lockOrientation = call.getBoolean("lockAndroidOrientation", true) ?: true
        lastCaptureWidth = call.getInt("captureWidth")
        lastCaptureHeight = call.getInt("captureHeight")
        currentFacing = if (target.facing == "front") "front" else "back"
        currentCameraId = target.id

        activity.runOnUiThread {
            try {
                val view = ensurePreviewContainer(x, y, w, h, toBack)
                previewRectPx = Rect(x, y, x + w, y + h)
                if (enableZoom) installTouchForwarding() else uninstallTouchForwarding()
                if (lockOrientation) {
                    previousOrientationRequest = activity.requestedOrientation
                    activity.requestedOrientation = ActivityInfo.SCREEN_ORIENTATION_LOCKED
                }
                call.setKeepAlive(true)
                pendingStartCall = call
                engine.start(target.id, view, lastCaptureWidth, lastCaptureHeight) { ok, reason ->
                    val pending = pendingStartCall
                    pendingStartCall = null
                    if (pending == null) return@start
                    if (ok) pending.resolve(startResult(target)) else pending.reject(reason ?: "preview failed to start")
                }
            } catch (e: Exception) {
                call.reject("startPreview failed: ${e.message}")
            }
        }
    }

    @PluginMethod
    fun stopPreview(call: PluginCall) {
        // A start that never produced a first frame must not hang the JS side.
        pendingStartCall?.let {
            it.reject("preview stopped")
            pendingStartCall = null
        }
        val activity = bridge.activity
        activity?.runOnUiThread {
            removePreviewContainer()
            if (lockOrientation && previousOrientationRequest != -1) {
                try {
                    activity.requestedOrientation = previousOrientationRequest
                } catch (e: Exception) {
                    // ignore
                }
                previousOrientationRequest = -1
            }
        }
        engine.stop()
        wasRunningBeforePause = false
        call.resolve()
    }

    @PluginMethod
    fun switchCamera(call: PluginCall) {
        val activity = bridge.activity ?: run {
            call.reject("no activity")
            return
        }
        if (textureView == null || !engine.isRunning) {
            call.reject("preview is not running")
            return
        }
        if (pendingStartCall != null) {
            call.reject("a camera switch is already in progress")
            return
        }
        val cameras = try {
            CameraInfoUtil.listCameras(activity)
        } catch (e: Exception) {
            call.reject("listCameras failed: ${e.message}")
            return
        }
        val requestedId = call.getString("cameraId")
        val facing = call.getString("facing")
        val target = when {
            !requestedId.isNullOrEmpty() -> cameras.firstOrNull { it.id == requestedId }
            facing == "front" -> CameraInfoUtil.defaultFrontCamera(cameras)
            facing == "back" -> CameraInfoUtil.defaultBackCamera(cameras)
            else -> {
                // No target given: flip front/back (mirrors the old flip()).
                if (currentFacing == "front") CameraInfoUtil.defaultBackCamera(cameras)
                else CameraInfoUtil.defaultFrontCamera(cameras)
            }
        } ?: run {
            call.reject("no camera found")
            return
        }
        if (target.id == currentCameraId) {
            call.resolve(startResult(target))
            return
        }
        currentFacing = if (target.facing == "front") "front" else "back"
        currentCameraId = target.id
        call.setKeepAlive(true)
        pendingStartCall = call
        val view = textureView!!
        engine.start(target.id, view, lastCaptureWidth, lastCaptureHeight) { ok, reason ->
            val pending = pendingStartCall
            pendingStartCall = null
            if (pending == null) return@start
            if (ok) pending.resolve(startResult(target)) else pending.reject(reason ?: "switch camera failed")
        }
    }

    private fun startResult(info: CameraInfo): JSObject {
        val res = JSObject()
        res.put("cameraId", info.id)
        res.put("facing", info.facing)
        res.put("type", info.type)
        res.put("label", info.label)
        res.put("focalLengthMm", info.focalLengthMm.toDouble())
        val (zmin, zmax) = engine.getZoomRange()
        val zr = JSObject()
        zr.put("min", zmin.toDouble())
        zr.put("max", zmax.toDouble())
        res.put("zoomRatioRange", zr)
        val (emin, emax, estep) = engine.getExposureRange()
        val er = JSObject()
        er.put("min", emin)
        er.put("max", emax)
        er.put("step", estep.toDouble())
        res.put("exposureCompensationRange", er)
        return res
    }

    @PluginMethod
    fun setPreviewRect(call: PluginCall) {
        val activity = bridge.activity ?: run {
            call.reject("no activity")
            return
        }
        val metrics = activity.resources.displayMetrics
        val x = dipToPx(call.getInt("x", 0) ?: 0, metrics)
        val y = dipToPx(call.getInt("y", 0) ?: 0, metrics)
        val w = dipToPx(call.getInt("width", 0) ?: 0, metrics)
        val h = dipToPx(call.getInt("height", 0) ?: 0, metrics)
        if (w <= 0 || h <= 0) {
            call.reject("width and height must be > 0")
            return
        }
        activity.runOnUiThread {
            val container = containerView
            if (container != null) {
                val params = FrameLayout.LayoutParams(w, h)
                params.leftMargin = x
                params.topMargin = y
                container.layoutParams = params
                previewRectPx = Rect(x, y, x + w, y + h)
                engine.updatePreviewTransform(w, h)
            }
        }
        call.resolve()
    }

    // ------------------------------------------------------------------
    // Zoom / capture / flash / focus / exposure
    // ------------------------------------------------------------------

    @PluginMethod
    fun setZoomRatio(call: PluginCall) {
        val ratio = call.getDouble("zoomRatio")?.toFloat()
        if (ratio == null || ratio <= 0f) {
            call.reject("zoomRatio must be a number > 0")
            return
        }
        if (!engine.isRunning) {
            call.reject("preview is not running")
            return
        }
        engine.setZoomRatio(ratio) { applied ->
            val res = JSObject()
            res.put("zoomRatio", applied.toDouble())
            call.resolve(res)
        }
    }

    @PluginMethod
    fun getZoomRatio(call: PluginCall) {
        val (min, max) = engine.getZoomRange()
        val res = JSObject()
        res.put("zoomRatio", engine.zoomRatio.toDouble())
        res.put("min", min.toDouble())
        res.put("max", max.toDouble())
        call.resolve(res)
    }

    @PluginMethod
    fun capture(call: PluginCall) {
        if (!engine.isRunning) {
            call.reject("preview is not running")
            return
        }
        val quality = call.getInt("quality", 90) ?: 90
        call.setKeepAlive(true)
        engine.capture(quality) { result ->
            result.onSuccess { file ->
                val res = JSObject()
                res.put("path", file.path)
                res.put("width", file.width)
                res.put("height", file.height)
                call.resolve(res)
            }.onFailure { e ->
                call.reject("capture failed: ${e.message}")
            }
        }
    }

    @PluginMethod
    fun setFlashMode(call: PluginCall) {
        val mode = call.getString("flashMode", "off") ?: "off"
        if (mode !in setOf("off", "on", "auto", "torch")) {
            call.reject("flashMode must be one of off/on/auto/torch")
            return
        }
        if (!engine.isRunning) {
            // Remember it for the next start (the app sets flash before the
            // preview is up in some flows); the engine applies it on start.
            call.resolve()
            return
        }
        engine.setFlashMode(mode) { ok ->
            if (ok) call.resolve() else call.reject("setFlashMode failed")
        }
    }

    @PluginMethod
    fun getSupportedFlashModes(call: PluginCall) {
        val modes = engine.getSupportedFlashModes()
        val arr = JSArray()
        for (m in modes) arr.put(m)
        val res = JSObject()
        res.put("result", arr)
        call.resolve(res)
    }

    @PluginMethod
    fun tapToFocus(call: PluginCall) {
        val x = call.getDouble("x")?.toFloat()
        val y = call.getDouble("y")?.toFloat()
        if (x == null || y == null) {
            call.reject("x and y (normalized 0..1) are required")
            return
        }
        engine.tapToFocus(x, y)
        call.resolve()
    }

    @PluginMethod
    fun setExposureCompensation(call: PluginCall) {
        val value = call.getDouble("value")?.toFloat()
        if (value == null) {
            call.reject("value (EV) is required")
            return
        }
        engine.setExposureCompensation(value) { applied ->
            val res = JSObject()
            res.put("value", applied.toDouble())
            call.resolve(res)
        }
    }

    @PluginMethod
    fun isPreviewStarted(call: PluginCall) {
        val res = JSObject()
        res.put("value", engine.isRunning)
        call.resolve(res)
    }

    // ------------------------------------------------------------------
    // Lifecycle
    // ------------------------------------------------------------------

    override fun handleOnPause() {
        super.handleOnPause()
        if (engine.isRunning) {
            wasRunningBeforePause = true
            engine.stop()
        }
    }

    override fun handleOnResume() {
        super.handleOnResume()
        if (!wasRunningBeforePause) return
        wasRunningBeforePause = false
        val view = textureView
        val id = currentCameraId
        if (view != null && id != null) {
            // Best effort: the app's resumeCameraView() also checks
            // isPreviewStarted() and restarts when needed.
            engine.start(id, view, lastCaptureWidth, lastCaptureHeight) { ok, reason ->
                if (!ok) android.util.Log.w("GszdCamera2", "resume reopen failed: $reason")
            }
        }
    }

    override fun handleOnConfigurationChanged(newConfig: android.content.res.Configuration) {
        super.handleOnConfigurationChanged(newConfig)
        val view = textureView
        if (view != null && engine.isRunning) {
            engine.updatePreviewTransform(view.width, view.height)
        }
    }

    override fun handleOnDestroy() {
        super.handleOnDestroy()
        try {
            engine.shutdown()
        } catch (e: Exception) {
            // ignore
        }
        val activity = bridge?.activity
        activity?.runOnUiThread { removePreviewContainer() }
    }

    // ------------------------------------------------------------------
    // Preview container + touch forwarding (private)
    // ------------------------------------------------------------------

    private fun dipToPx(dip: Int, metrics: DisplayMetrics): Int {
        return TypedValue.applyDimension(TypedValue.COMPLEX_UNIT_DIP, dip.toFloat(), metrics).toInt()
    }

    /** Create (or reuse) the container + TextureView behind the WebView. Runs on the UI thread. */
    private fun ensurePreviewContainer(x: Int, y: Int, w: Int, h: Int, toBack: Boolean): TextureView {
        val activity = bridge.activity!!
        val parent = bridge.webView.parent as ViewGroup
        var container = containerView
        var view = textureView
        if (container == null || view == null) {
            container = FrameLayout(activity)
            container.id = containerViewId
            view = TextureView(activity)
            container.addView(view, FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
            ))
            containerView = container
            textureView = view
            bridge.webView.setBackgroundColor(Color.TRANSPARENT)
            parent.addView(container)
            if (toBack) {
                parent.bringChildToFront(bridge.webView)
            }
        }
        val params = FrameLayout.LayoutParams(w, h)
        params.leftMargin = x
        params.topMargin = y
        container.layoutParams = params
        return view!!
    }

    private fun removePreviewContainer() {
        val parent = try {
            bridge.webView.parent as? ViewGroup
        } catch (e: Exception) {
            null
        }
        containerView?.let { parent?.removeView(it) }
        containerView = null
        textureView = null
        try {
            bridge.webView.setBackgroundColor(Color.WHITE)
        } catch (e: Exception) {
            // ignore
        }
        uninstallTouchForwarding()
    }

    /**
     * Forward touches that land inside the preview rect to the pinch-zoom
     * and tap-to-focus detectors. Returns false so the WebView still
     * handles the touch (HTML buttons keep working). Touches outside the
     * preview rect are not forwarded, so taps on the top bar / bottom
     * controls never trigger a focus.
     */
    private fun installTouchForwarding() {
        val activity = bridge.activity ?: return
        ensureDetectors(activity)
        bridge.webView.setOnTouchListener { _, event ->
            val r = previewRectPx
            if (event.x >= r.left && event.x < r.right && event.y >= r.top && event.y < r.bottom) {
                scaleDetector?.onTouchEvent(event)
                tapDetector?.onTouchEvent(event)
            }
            false
        }
    }

    private fun uninstallTouchForwarding() {
        try {
            bridge.webView.setOnTouchListener(null)
        } catch (e: Exception) {
            // ignore
        }
    }

    private fun ensureDetectors(activity: android.app.Activity) {
        if (scaleDetector == null) {
            scaleDetector = ScaleGestureDetector(
                activity,
                object : ScaleGestureDetector.SimpleOnScaleGestureListener() {
                    override fun onScaleBegin(detector: ScaleGestureDetector): Boolean {
                        gestureStartZoom = engine.zoomRatio
                        lastPinchApplied = gestureStartZoom
                        return true
                    }

                    override fun onScale(detector: ScaleGestureDetector): Boolean {
                        val (min, max) = engine.getZoomRange()
                        val target = (gestureStartZoom * detector.scaleFactor).coerceIn(min, max)
                        // Throttle: the engine round-trips to a background
                        // thread, so only forward meaningful changes.
                        if (kotlin.math.abs(target - lastPinchApplied) < 0.05f) return true
                        lastPinchApplied = target
                        engine.setZoomRatio(target) {}
                        return true
                    }
                }
            )
        }
        if (tapDetector == null) {
            tapDetector = GestureDetector(
                activity,
                object : GestureDetector.SimpleOnGestureListener() {
                    override fun onSingleTapConfirmed(e: MotionEvent): Boolean {
                        val r = previewRectPx
                        if (r.width() <= 0 || r.height() <= 0) return false
                        val nx = ((e.x - r.left) / r.width()).coerceIn(0f, 1f)
                        val ny = ((e.y - r.top) / r.height()).coerceIn(0f, 1f)
                        engine.tapToFocus(nx, ny)
                        return true
                    }
                }
            )
        }
    }
}
