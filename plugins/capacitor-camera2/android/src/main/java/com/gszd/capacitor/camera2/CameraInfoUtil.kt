package com.gszd.capacitor.camera2

import android.content.Context
import android.hardware.camera2.CameraCharacteristics
import android.hardware.camera2.CameraManager
import android.hardware.camera2.CameraMetadata
import android.os.Build
import android.util.Range
import android.util.SizeF
import kotlin.math.sqrt

/**
 * One camera as seen by Android Camera2.
 * Mirrors the `CameraInfo` TypeScript interface in src/definitions.d.ts.
 */
data class CameraInfo(
    val id: String,
    val facing: String, // "front" | "back" | "external"
    val type: String, // "main" | "ultrawide" | "telephoto" | "front" | "external"
    val label: String,
    val focalLengthMm: Float,
    val zoomMin: Float,
    val zoomMax: Float,
    val maxDigitalZoom: Float,
    val logical: Boolean,
    val physicalIds: List<String>
)

object CameraInfoUtil {

    /** 35mm-equivalent focal length thresholds (mm) used to classify back lenses. */
    private const val ULTRAWIDE_MAX_EQUIV_MM = 20f
    private const val MAIN_MAX_EQUIV_MM = 35f

    /** Diagonal of a 35mm full-frame sensor, used for the crop-factor conversion. */
    private const val FULL_FRAME_DIAGONAL_MM = 43.27f

    fun listCameras(context: Context): List<CameraInfo> {
        val manager = context.getSystemService(Context.CAMERA_SERVICE) as CameraManager
        val ids = try {
            manager.cameraIdList
        } catch (e: Exception) {
            return emptyList()
        }
        // First pass: gather raw facts for every camera id.
        data class Raw(
            val id: String,
            val facing: Int,
            val focalMm: Float,
            val equivMm: Float?,
            val zoomMin: Float,
            val zoomMax: Float,
            val maxDigitalZoom: Float,
            val logical: Boolean,
            val physicalIds: List<String>
        )
        val raws = ids.mapNotNull { id ->
            val c = try {
                manager.getCameraCharacteristics(id)
            } catch (e: Exception) {
                return@mapNotNull null
            }
            val facing = c.get(CameraCharacteristics.LENS_FACING)
                ?: CameraMetadata.LENS_FACING_BACK
            val focalLengths = c.get(CameraCharacteristics.LENS_INFO_AVAILABLE_FOCAL_LENGTHS)
            val focalMm = focalLengths?.firstOrNull() ?: 0f
            val sensorSize: SizeF? = c.get(CameraCharacteristics.SENSOR_INFO_PHYSICAL_SIZE)
            val equivMm = if (focalMm > 0f && sensorSize != null && sensorSize.width > 0f && sensorSize.height > 0f) {
                val diag = sqrt(sensorSize.width * sensorSize.width + sensorSize.height * sensorSize.height)
                if (diag > 0f) focalMm * FULL_FRAME_DIAGONAL_MM / diag else null
            } else {
                null
            }
            val maxDigitalZoom = c.get(CameraCharacteristics.SCALER_AVAILABLE_MAX_DIGITAL_ZOOM) ?: 1f
            var zoomMin = 1f
            var zoomMax = maxDigitalZoom.coerceAtLeast(1f)
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) {
                val range: Range<Float>? = c.get(CameraCharacteristics.CONTROL_ZOOM_RATIO_RANGE)
                if (range != null) {
                    zoomMin = range.lower
                    zoomMax = range.upper
                }
            }
            val caps = c.get(CameraCharacteristics.REQUEST_AVAILABLE_CAPABILITIES)
            val logical = caps != null &&
                caps.contains(CameraMetadata.REQUEST_AVAILABLE_CAPABILITIES_LOGICAL_MULTI_CAMERA)
            val physicalIds: List<String> = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.P) {
                try {
                    c.physicalCameraIds.toList()
                } catch (e: Exception) {
                    emptyList()
                }
            } else {
                emptyList()
            }
            Raw(id, facing, focalMm, equivMm, zoomMin, zoomMax, maxDigitalZoom, logical, physicalIds)
        }

        // Classify back lenses. Prefer the 35mm-equivalent focal length when
        // the sensor size is known; fall back to ranking by physical focal
        // length among the back cameras.
        val backRaws = raws.filter { it.facing == CameraMetadata.LENS_FACING_BACK }
        val typeById = mutableMapOf<String, String>()
        if (backRaws.isNotEmpty()) {
            if (backRaws.size == 1) {
                typeById[backRaws[0].id] = "main"
            } else if (backRaws.all { it.equivMm != null }) {
                for (raw in backRaws) {
                    val equiv = raw.equivMm!!
                    typeById[raw.id] = when {
                        equiv < ULTRAWIDE_MAX_EQUIV_MM -> "ultrawide"
                        equiv <= MAIN_MAX_EQUIV_MM -> "main"
                        else -> "telephoto"
                    }
                }
            } else {
                // Relative ranking by physical focal length.
                val sorted = backRaws.sortedBy { it.focalMm }
                if (sorted.size == 2) {
                    typeById[sorted[0].id] = "ultrawide"
                    typeById[sorted[1].id] = "main"
                } else {
                    typeById[sorted.first().id] = "ultrawide"
                    typeById[sorted.last().id] = "telephoto"
                    for (raw in sorted.drop(1).dropLast(1)) typeById[raw.id] = "main"
                }
            }
        }

        return raws.map { raw ->
            val facingStr = when (raw.facing) {
                CameraMetadata.LENS_FACING_FRONT -> "front"
                CameraMetadata.LENS_FACING_EXTERNAL -> "external"
                else -> "back"
            }
            val type = when (raw.facing) {
                CameraMetadata.LENS_FACING_FRONT -> "front"
                CameraMetadata.LENS_FACING_EXTERNAL -> "external"
                else -> typeById[raw.id] ?: "main"
            }
            val label = when (type) {
                "ultrawide" -> "后置 · 超广角"
                "telephoto" -> "后置 · 长焦"
                "main" -> "后置 · 主摄"
                "front" -> "前置"
                else -> "外置"
            }
            CameraInfo(
                id = raw.id,
                facing = facingStr,
                type = type,
                label = label,
                focalLengthMm = raw.focalMm,
                zoomMin = raw.zoomMin,
                zoomMax = raw.zoomMax,
                maxDigitalZoom = raw.maxDigitalZoom,
                logical = raw.logical,
                physicalIds = raw.physicalIds
            )
        }
    }

    /** Pick the default back camera: the "main" one, else the first back camera, else the first camera. */
    fun defaultBackCamera(cameras: List<CameraInfo>): CameraInfo? {
        return cameras.firstOrNull { it.facing == "back" && it.type == "main" }
            ?: cameras.firstOrNull { it.facing == "back" }
            ?: cameras.firstOrNull()
    }

    fun defaultFrontCamera(cameras: List<CameraInfo>): CameraInfo? {
        return cameras.firstOrNull { it.facing == "front" }
    }
}
