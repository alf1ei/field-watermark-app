# @gszd/capacitor-camera2

Custom Capacitor plugin for 长江现场水印相机 (field-watermark-app).

## Why

`@capacitor-community/camera-preview` only exposes front/back + flip: no lens
list, no slide zoom, and `capture()` returns base64 photos capped under 2MP.
This plugin talks to Android Camera2 directly:

- **Enumerate every physical camera** — main / ultra-wide / telephoto / front
  (`CameraManager.getCameraIdList()` + focal-length classification).
- **Slide zoom** — `CONTROL_ZOOM_RATIO` on API 30+ (on a logical
  multi-camera a ratio < 1 zooms out to the ultra-wide lens and > 1 switches
  to the telephoto lens by itself), `SCALER_CROP_REGION` fallback below API 30.
- **Capture straight to a JPEG file** — no base64 round-trip over the bridge.
- **Pinch zoom + tap to focus** on the preview (touch forwarding from the
  WebView, same pattern as the old plugin).
- **Flash modes, exposure compensation, preview resize** included.

## Status

- **Android (Camera2, Kotlin): implemented** — see
  `android/src/main/java/com/gszd/capacitor/camera2/`.
- **iOS: stub only** — every method rejects with "not implemented on iOS yet"
  (except `getSupportedFlashModes` → `[]` and `isPreviewStarted` → `false`),
  so the Xcode build stays green and the app falls back to its web viewfinder
  path. Full AVFoundation plan is in `INTEGRATION.md`.

## Layout

```
plugins/capacitor-camera2/
├── package.json            # name @gszd/capacitor-camera2, capacitor.android/ios.src
├── src/                    # hand-authored JS wrapper + .d.ts (source of truth)
│   ├── index.js / index.d.ts
│   ├── definitions.d.ts    # CameraInfo, options, plugin interface
│   └── web.js / web.d.ts   # web fallback (listCameras via enumerateDevices)
├── dist/esm/               # build output (node scripts/build.mjs copies src/ here)
├── scripts/
│   ├── build.mjs           # copy src/ -> dist/esm/
│   └── smoke.mjs           # Node smoke test (no Android needed)
├── android/                # Kotlin library module (AGP 8.7.2, Kotlin 2.0.21)
│   └── src/main/java/com/gszd/capacitor/camera2/
│       ├── GszdCamera2Plugin.kt   # Capacitor plugin, preview embedding, gestures
│       ├── Camera2Engine.kt       # CameraDevice / session / zoom / capture / focus
│       └── CameraInfoUtil.kt      # enumeration + lens classification
├── ios/Sources/GszdCamera2Plugin/ # Swift stub
├── README.md               # this file
└── INTEGRATION.md          # how to swap camera-preview calls in CameraView.vue
```

## API

See `src/definitions.d.ts`. Summary:

| Method | What it does |
|---|---|
| `listCameras()` | Every camera Camera2 can see, with `facing`, `type` (main/ultrawide/telephoto/front), `label`, `focalLengthMm`, `zoomRatioRange`, `logical`, `physicalIds`. |
| `startPreview(options)` | Open a camera (`cameraId` wins, else `facing`) and start the preview behind the WebView. Resolves on the first preview frame. Returns camera info + zoom/exposure ranges. |
| `stopPreview()` | Stop preview, close camera, restore WebView background. |
| `switchCamera(options)` | Switch lens (by id or facing) keeping the preview rect. No-arg = flip front/back. |
| `setZoomRatio({ zoomRatio })` | Slide zoom. Clamped to the camera range. |
| `getZoomRatio()` | Current ratio + range. |
| `capture({ quality })` | Still photo straight to a file. Returns `{ path, width, height }`. |
| `setFlashMode({ flashMode })` | `off` / `on` / `auto` / `torch`. |
| `getSupportedFlashModes()` | Subset the current camera supports. |
| `tapToFocus({ x, y })` | Focus + meter at a normalized point (0..1) in the preview. |
| `setExposureCompensation({ value })` | EV, clamped to the camera range. Returns the applied value. |
| `isPreviewStarted()` | Whether the preview/camera is running. |
| `setPreviewRect({ x, y, width, height })` | Move/resize the preview without restarting. |

## Build / check

```bash
cd plugins/capacitor-camera2
npm run build   # copy src/ -> dist/esm/
npm run check   # node --check on the JS + smoke test
```

Android compilation cannot run in this sandbox (no Java); it is verified
through the GitHub Actions build — see `INTEGRATION.md` for the exact steps
and the list of things that must be checked on a real device.

## Notes / known limits

- The plugin is **Java-free Kotlin** for the Android side; the Gradle setup
  pins Kotlin 2.0.21 + AGP 8.7.2 to match the Actions build (Gradle 8.11.1).
  If the Actions build moves to a newer AGP/Gradle, re-check the pin.
- `capture()` writes to the app cache dir (`cacheDir/gszd-camera2/`). The
  caller (the app's watermark burn) reads the file and should delete it
  afterwards; the OS may also clear the cache dir.
- On some devices a physical camera id is not directly openable (the OEM
  only exposes the logical camera). In that case `listCameras()` still
  returns the logical camera, and zooming with a ratio < 1 / > 1 switches
  lenses inside it automatically.
- `setFlashMode('on' | 'auto')` affects the still capture; the preview
  itself never fires the flash (except `torch`, which is a constant light).
