import { WebPlugin } from '@capacitor/core';
import type { GszdCamera2Plugin } from './definitions.js';

export declare class GszdCamera2Web extends WebPlugin implements GszdCamera2Plugin {
  listCameras(): Promise<{ cameras: import('./definitions.js').CameraInfo[] }>;
  startPreview(options: import('./definitions.js').StartPreviewOptions): Promise<import('./definitions.js').StartPreviewResult>;
  stopPreview(): Promise<void>;
  switchCamera(options: import('./definitions.js').SwitchCameraOptions): Promise<import('./definitions.js').StartPreviewResult>;
  setZoomRatio(options: { zoomRatio: number }): Promise<{ zoomRatio: number }>;
  getZoomRatio(): Promise<{ zoomRatio: number; min: number; max: number }>;
  capture(options?: import('./definitions.js').CaptureOptions): Promise<import('./definitions.js').CaptureResult>;
  setFlashMode(options: { flashMode: import('./definitions.js').FlashMode }): Promise<void>;
  getSupportedFlashModes(): Promise<{ result: import('./definitions.js').FlashMode[] }>;
  tapToFocus(options: { x: number; y: number }): Promise<void>;
  setExposureCompensation(options: { value: number }): Promise<{ value: number }>;
  isPreviewStarted(): Promise<{ value: boolean }>;
  setPreviewRect(options: { x: number; y: number; width: number; height: number }): Promise<void>;
}
