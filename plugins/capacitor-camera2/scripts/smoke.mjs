// Smoke test for @gszd/capacitor-camera2 (runs in plain Node, no Android).
// 1. The ESM wrapper imports and exposes all 12 plugin methods.
// 2. The web fallback maps enumerateDevices() output to CameraInfo entries.
import { GszdCamera2 } from '../dist/esm/index.js';
import { GszdCamera2Web } from '../dist/esm/web.js';

const METHODS = [
  'listCameras', 'startPreview', 'stopPreview', 'switchCamera',
  'setZoomRatio', 'getZoomRatio', 'capture', 'setFlashMode',
  'getSupportedFlashModes', 'tapToFocus', 'setExposureCompensation',
  'isPreviewStarted', 'setPreviewRect',
];

let failures = 0;
for (const m of METHODS) {
  if (typeof GszdCamera2[m] !== 'function') {
    console.error('MISSING method on GszdCamera2:', m);
    failures++;
  }
}
console.log(`GszdCamera2 methods: ${METHODS.length - failures}/${METHODS.length} present`);

// Web fallback: stub enumerateDevices with a fake 3-lens phone.
// (Node 24 exposes a getter-only global `navigator`, so override it via
// defineProperty instead of assigning to it.)
Object.defineProperty(globalThis, 'navigator', {
  value: {
    mediaDevices: {
      enumerateDevices: async () => [
        { kind: 'videoinput', label: 'Back Camera', deviceId: 'back-main' },
        { kind: 'videoinput', label: 'Front Camera', deviceId: 'front' },
        { kind: 'audioinput', label: 'Mic', deviceId: 'mic' },
      ],
    },
  },
  configurable: true,
});
const web = new GszdCamera2Web();
const { cameras } = await web.listCameras();
if (cameras.length !== 2) {
  console.error('web listCameras: expected 2 video inputs, got', cameras.length);
  failures++;
} else {
  console.log('web listCameras: 2 cameras ->', cameras.map((c) => `${c.label} (${c.facing})`).join(', '));
}
const started = await web.isPreviewStarted();
if (started.value !== false) {
  console.error('web isPreviewStarted: expected false');
  failures++;
}
try {
  await web.startPreview({});
  console.error('web startPreview: expected it to throw');
  failures++;
} catch (e) {
  console.log('web startPreview: correctly rejects ->', String(e.message).slice(0, 60));
}

if (failures > 0) {
  console.error(`SMOKE FAILED (${failures})`);
  process.exit(1);
}
console.log('SMOKE PASSED');
