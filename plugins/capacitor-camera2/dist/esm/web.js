import { WebPlugin } from '@capacitor/core';

/**
 * Web fallback. The app already has a full web viewfinder (getUserMedia) that
 * it uses on non-native platforms, so this fallback only implements camera
 * enumeration (so the lens list can be shown) and rejects the native-only
 * methods with a clear message instead of pretending to work.
 */
export class GszdCamera2Web extends WebPlugin {
  async listCameras() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      return { cameras: [] };
    }
    const devices = await navigator.mediaDevices.enumerateDevices();
    const inputs = devices.filter((d) => d.kind === 'videoinput');
    const cameras = inputs.map((d, i) => {
      const label = (d.label || '').trim();
      const low = label.toLowerCase();
      const facing = low.includes('front') || label.includes('前置') ? 'front' : 'back';
      return {
        id: d.deviceId || String(i),
        facing,
        type: facing === 'front' ? 'front' : 'main',
        label: label || `${facing === 'front' ? '前置' : '后置'}摄像头 ${i + 1}`,
        focalLengthMm: 0,
        zoomRatioRange: { min: 1, max: 10 },
        maxDigitalZoom: 10,
        logical: false,
        physicalIds: [],
      };
    });
    return { cameras };
  }

  async startPreview() {
    throw new Error('GszdCamera2: native preview is not available on web, use the web viewfinder path');
  }

  async stopPreview() {
    throw new Error('GszdCamera2: native preview is not available on web, use the web viewfinder path');
  }

  async switchCamera() {
    throw new Error('GszdCamera2: native preview is not available on web, use the web viewfinder path');
  }

  async setZoomRatio() {
    throw new Error('GszdCamera2: native preview is not available on web, use the web viewfinder path');
  }

  async getZoomRatio() {
    throw new Error('GszdCamera2: native preview is not available on web, use the web viewfinder path');
  }

  async capture() {
    throw new Error('GszdCamera2: native capture is not available on web, use the web viewfinder path');
  }

  async setFlashMode() {
    throw new Error('GszdCamera2: native preview is not available on web, use the web viewfinder path');
  }

  async getSupportedFlashModes() {
    return { result: [] };
  }

  async tapToFocus() {
    throw new Error('GszdCamera2: native preview is not available on web, use the web viewfinder path');
  }

  async setExposureCompensation() {
    throw new Error('GszdCamera2: native preview is not available on web, use the web viewfinder path');
  }

  async isPreviewStarted() {
    return { value: false };
  }

  async setPreviewRect() {
    throw new Error('GszdCamera2: native preview is not available on web, use the web viewfinder path');
  }
}
