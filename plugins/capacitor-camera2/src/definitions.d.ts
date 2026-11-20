export type CameraFacing = 'front' | 'back' | 'external';
export type CameraLensType = 'main' | 'ultrawide' | 'telephoto' | 'front' | 'external';
export type FlashMode = 'off' | 'on' | 'auto' | 'torch';

export interface ZoomRange {
  min: number;
  max: number;
}

export interface ExposureRange {
  min: number;
  max: number;
  step: number;
}

/** One physical (or logical) camera as seen by Android Camera2. */
export interface CameraInfo {
  /** Camera2 camera id, e.g. "0", "1", "2". Pass it back to startPreview / switchCamera. */
  id: string;
  facing: CameraFacing;
  /** Classified from the physical focal length, compared across the back cameras. */
  type: CameraLensType;
  /** Human label, e.g. "后置 · 主摄" / "后置 · 超广角" / "后置 · 长焦" / "前置". */
  label: string;
  /** Physical focal length in mm (first value of LENS_INFO_AVAILABLE_FOCAL_LENGTHS). */
  focalLengthMm: number;
  /** Zoom ratio range (CONTROL_ZOOM_RATIO_RANGE on API 30+, else { 1, maxDigitalZoom }). */
  zoomRatioRange: ZoomRange;
  /** SCALER_AVAILABLE_MAX_DIGITAL_ZOOM. */
  maxDigitalZoom: number;
  /** True when this id is a logical multi-camera (API 28+). */
  logical: boolean;
  /** Physical camera ids behind a logical camera (API 28+, empty otherwise). */
  physicalIds: string[];
}

export interface StartPreviewOptions {
  /** Camera2 id from listCameras(). Takes precedence over `facing`. */
  cameraId?: string;
  /** Which direction to open when cameraId is omitted. Default 'back'. */
  facing?: 'front' | 'back';
  /** Preview rect in DIP (CSS pixels), like the old camera-preview plugin. Default 0/0/full window. */
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  /** Put the preview behind the WebView (transparent WebView, HTML overlays on top). Default true. */
  toBack?: boolean;
  /** Enable pinch-to-zoom on the preview surface. Default true. */
  enableZoom?: boolean;
  /** Lock the device orientation while the preview runs. Default true. */
  lockAndroidOrientation?: boolean;
  /** Desired still-capture size. Defaults to the largest available JPEG size. */
  captureWidth?: number;
  captureHeight?: number;
}

export interface StartPreviewResult {
  cameraId: string;
  facing: CameraFacing;
  type: CameraLensType;
  label: string;
  focalLengthMm: number;
  zoomRatioRange: ZoomRange;
  exposureCompensationRange: ExposureRange;
}

export interface SwitchCameraOptions {
  cameraId?: string;
  facing?: 'front' | 'back';
}

export interface CaptureOptions {
  /** JPEG quality 0-100. Default 90. */
  quality?: number;
}

export interface CaptureResult {
  /** Absolute file path of the captured JPEG, e.g. /data/user/0/com.gszd.fieldwatermark/cache/gszd-camera2/GSZD_....jpg */
  path: string;
  width: number;
  height: number;
}

export interface GszdCamera2Plugin {
  /** Enumerate every camera Camera2 can see (main / ultra-wide / telephoto / front). */
  listCameras(): Promise<{ cameras: CameraInfo[] }>;
  /** Open a camera and start the preview behind the WebView. Resolves on the first preview frame. */
  startPreview(options: StartPreviewOptions): Promise<StartPreviewResult>;
  /** Stop the preview, close the camera, restore the WebView background. */
  stopPreview(): Promise<void>;
  /** Switch to another camera (by id or facing) keeping the same preview rect. */
  switchCamera(options: SwitchCameraOptions): Promise<StartPreviewResult>;
  /** Set the zoom ratio (slide zoom). Clamped to the camera's range. */
  setZoomRatio(options: { zoomRatio: number }): Promise<{ zoomRatio: number }>;
  /** Current zoom ratio and the camera's range. */
  getZoomRatio(): Promise<{ zoomRatio: number; min: number; max: number }>;
  /** Capture a still photo straight to a file (no base64 round-trip). */
  capture(options?: CaptureOptions): Promise<CaptureResult>;
  /** Flash mode for still capture ('torch' also lights the preview). */
  setFlashMode(options: { flashMode: FlashMode }): Promise<void>;
  /** Flash modes the current camera supports (subset of off/on/auto/torch). */
  getSupportedFlashModes(): Promise<{ result: FlashMode[] }>;
  /** Focus (and meter) at a point in the preview. x/y are normalized 0..1 in the preview rect. */
  tapToFocus(options: { x: number; y: number }): Promise<void>;
  /** Exposure compensation in EV, clamped to the camera's range. Returns the applied value. */
  setExposureCompensation(options: { value: number }): Promise<{ value: number }>;
  /** Whether the preview / camera is currently running. */
  isPreviewStarted(): Promise<{ value: boolean }>;
  /** Move / resize the preview rect without restarting the camera. Values in DIP. */
  setPreviewRect(options: { x: number; y: number; width: number; height: number }): Promise<void>;
}
