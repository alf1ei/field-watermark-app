import Foundation
import Capacitor

/**
 * iOS stub for GszdCamera2 (v1.0.0).
 *
 * The Android implementation (Camera2) is complete; iOS is intentionally a
 * stub in v1 so the Xcode build stays green and the JS side can detect the
 * missing native implementation and fall back to the web viewfinder path
 * (getUserMedia + enumerateDevices), exactly as the app does today.
 *
 * Full iOS implementation plan (AVFoundation) is in INTEGRATION.md:
 * AVCaptureDevice.DiscoverySession enumerates all lenses
 * (builtInWideAngleCamera / builtInUltraWideCamera / builtInTelephotoCamera),
 * AVCaptureVideoPreviewLayer renders the preview behind the WebView,
 * videoZoomFactor drives slide zoom, AVCapturePhotoOutput captures to a file.
 * Until that lands, every method below rejects with a clear message.
 */
@objc(GszdCamera2)
public class GszdCamera2: CAPPlugin, CAPBridgedPlugin {

    public let identifier = "GszdCamera2Plugin"
    public let jsName = "GszdCamera2"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "listCameras", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "startPreview", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "stopPreview", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "switchCamera", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setZoomRatio", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getZoomRatio", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "capture", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setFlashMode", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "getSupportedFlashModes", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "tapToFocus", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setExposureCompensation", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "isPreviewStarted", returnType: CAPPluginReturnPromise),
        CAPPluginMethod(name: "setPreviewRect", returnType: CAPPluginReturnPromise)
    ]

    private static let notImplemented =
        "GszdCamera2 is not implemented on iOS yet (Android Camera2 only in v1). Use the web viewfinder path."

    @objc func listCameras(_ call: CAPPluginCall) {
        call.reject(Self.notImplemented)
    }

    @objc func startPreview(_ call: CAPPluginCall) {
        call.reject(Self.notImplemented)
    }

    @objc func stopPreview(_ call: CAPPluginCall) {
        call.reject(Self.notImplemented)
    }

    @objc func switchCamera(_ call: CAPPluginCall) {
        call.reject(Self.notImplemented)
    }

    @objc func setZoomRatio(_ call: CAPPluginCall) {
        call.reject(Self.notImplemented)
    }

    @objc func getZoomRatio(_ call: CAPPluginCall) {
        call.reject(Self.notImplemented)
    }

    @objc func capture(_ call: CAPPluginCall) {
        call.reject(Self.notImplemented)
    }

    @objc func setFlashMode(_ call: CAPPluginCall) {
        call.reject(Self.notImplemented)
    }

    @objc func getSupportedFlashModes(_ call: CAPPluginCall) {
        call.resolve(["result": []])
    }

    @objc func tapToFocus(_ call: CAPPluginCall) {
        call.reject(Self.notImplemented)
    }

    @objc func setExposureCompensation(_ call: CAPPluginCall) {
        call.reject(Self.notImplemented)
    }

    @objc func isPreviewStarted(_ call: CAPPluginCall) {
        call.resolve(["value": false])
    }

    @objc func setPreviewRect(_ call: CAPPluginCall) {
        call.reject(Self.notImplemented)
    }
}
