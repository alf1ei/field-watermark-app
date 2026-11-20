# INTEGRATION.md — 把 CameraView.vue 从 camera-preview 换成 GszdCamera2

> 目标版本：v3.1（在 v3.0.3 发版之后再集成，避免和 v3.0.3 的并行改动撞车）。
> 本文档写于 v3.0.3 实现进行中，行号以 2026-11-20 15:5x 的 CameraView.vue 为准；
> 集成时以实际文件为准，先搜 `CameraPreview` 再动手。

## 0. 接入插件（打包侧）

1. App 的 `package.json` 加一条依赖（`file:` 指向本地插件包，npm 会把它
   链接进 `node_modules`）：
   ```json
   "@gszd/capacitor-camera2": "file:plugins/capacitor-camera2"
   ```
   然后 `npm install`（或 `npm ci`，CI 上 `file:` 依赖会从仓库里刚推上去的
   `plugins/capacitor-camera2/` 目录解析——所以**推送时必须把整个插件目录
   纳入推送清单**，含 `dist/`、`android/`、`ios/`、`src/`、`package.json`；
   注意不要把它当成根目录的 `android/`、`ios/`、`dist/` 排除掉，那是另一回事）。
2. `npx cap sync android`（CI 的工作流已经是 `rm -rf android; npx cap add android; npx cap sync android`，
   同步后 `android/capacitor.settings.gradle` 里会出现
   `include ':gszd-camera2'` 一行；若没有，先确认第 1 步的依赖装上了）。
3. App 的 `AndroidManifest.xml` 已有 `CAMERA` 权限声明，不用再加。插件
   自己的 `AndroidManifest.xml` 是空的（权限别名只在代码里声明）。
4. 插件的 Android 构建钉了 Kotlin 2.0.21 + AGP 8.7.2（见
   `android/build.gradle`），与 CI 的 Gradle 8.11.1 / compileSdk 35 兼容。
   若 CI 升级 AGP/Gradle，先核对这个钉死版本。

## 1. CameraView.vue 逐个调用点替换

下表左列是现在（v3.0.2/v3.0.3）的 camera-preview 调用，右列是新插件的等价写法。
`nativeActive` 这个 ref 的语义不变（“原生预览正在跑”），只是生产者从
`CameraPreview` 换成 `GszdCamera2`。

| # | 现状（camera-preview） | 新插件（GszdCamera2） | 说明 |
|---|---|---|---|
| 1 | `import { CameraPreview } from '@capacitor-community/camera-preview'` | `import { GszdCamera2 } from '@gszd/capacitor-camera2'` | 旧 import 可删（或留着给录像兜底？录像不用它，直接删）。 |
| 2 | `startNativePreview()` 里的 `CameraPreview.start({ position, x, y, width, height, toBack, enableZoom, disableAudio, disableExifHeaderStripping, lockAndroidOrientation, storeToFile })` | `GszdCamera2.startPreview({ cameraId, facing, x, y, width, height, toBack, enableZoom, lockAndroidOrientation, captureWidth, captureHeight })` | `cameraId`：从 `gszdCameraId`（见第 2 节）取，取不到时传 `facing` 让插件选默认镜头。`captureWidth/Height` 传 `captureSizeForRatio(targetRatio)` 的结果（v3.0.3 已有这个 helper）。`storeToFile` 不用传——新插件拍照永远写文件。`disableAudio` / `disableExifHeaderStripping` 没有等价项（新插件不录音、不碰 EXIF，JPEG 方向用 `JPEG_ORIENTATION` 直接写对）。返回值多出 `zoomRatioRange`、`exposureCompensationRange`、`type`、`label`——存到 `zoomCaps` / `expCaps` 里（见第 2 节）。`nativeStopRequested` 的竞态处理可以删掉：新插件的 `stopPreview()` 会主动 reject 掉还没出首帧的 start 调用。 |
| 3 | `CameraPreview.getSupportedFlashModes()` → `nativeFlashModes` | `GszdCamera2.getSupportedFlashModes()` → 同名字段 | 返回值形状一样（`{ result: [...] }`）。 |
| 4 | `applyNativeFlashMode()` 里的 `CameraPreview.setFlashMode({ flashMode: want })` | `GszdCamera2.setFlashMode({ flashMode: want })` | 模式名一样（`off/on/auto/torch`）。注意：新插件里 `on/auto` 只影响拍照那一帧，`torch` 才常亮；`applyNativeFlashMode` 的 `want` 映射逻辑不用改。 |
| 5 | `stopNativePreview()` 里的 `CameraPreview.stop()` + 删 `native-preview` body class | `GszdCamera2.stopPreview()` + 同样删 body class | 新插件 `stopPreview()` 自己会恢复 WebView 背景（白），body class 照旧由 App 删。 |
| 6 | `toggleFacing()` 里的 `CameraPreview.flip()` | `GszdCamera2.switchCamera({})`（无参数 = 前后翻转） | 返回值带新镜头信息，顺手更新 `facing` / `zoom`（`zoom.value = 1` 保持）。 |
| 7 | `resumeCameraIfNeeded()` 里的 `CameraPreview.isCameraStarted()` | `GszdCamera2.isPreviewStarted()` | 返回值形状一样（`{ value: boolean }`）。 |
| 8 | `takeNativePhoto()` 里的 `CameraPreview.capture({ quality: 90, width: capW, height: capH })` → `captureValueToSrc(res.value)` → `burnPhotoWatermark(src, …)` → `deleteCaptureTempFile(captureValue)` | `GszdCamera2.capture({ quality: 90 })` → `captureValueToSrc(res.path)` → 其余不变 | **这是最顺的一处**：新插件返回的是绝对路径（`/data/.../cache/GSZD_....jpg`），`captureValueToSrc` 本来就认 `/` 开头的路径（`Capacitor.convertFileSrc`），`deleteCaptureTempFile` 本来就按 basename 从 `Directory.Cache` 删——新插件特意把文件写在缓存根目录就是为了对上这两个 helper，一行都不用改。`capW/capH` 不再传给 `capture()`，改在 `startPreview` 时当 `captureWidth/captureHeight` 传进去（见第 2 行）。 |
| 9 | `onZoomBtnClick()` 原生分支：`toggleFacing()`（v3.0.2：点按变焦按钮 = 前后切换，因为插件没有多镜头接口） | **改成打开镜头面板**（见第 2 节） | 新插件有了镜头列表，点按 1× 应该弹镜头面板（列出主摄/超广角/长焦/前置），而不是前后切换。前后切换挪到“更多”菜单里（已有 `moreToggleFacing`）。 |
| 10 | `switchCameraById(id)` 原生分支：`showLensPanel = false; return`（原生预览下镜头面板不开） | **删掉这个短路**，走正常流程 | 新插件的镜头面板就是 `listCameras()` 的结果，选一个就调 `GszdCamera2.switchCamera({ cameraId: id })`，再 `await startCamera()` 的等价逻辑（新插件 `switchCamera` 自己重开会话，不用 `startCamera()`）。`cameras` 这个 ref 的数据源从 `enumerateDevices()` 换成 `GszdCamera2.listCameras()`（见第 2 节）。 |
| 11 | 取景器手势（`onStagePointerDown/Move`）：原生预览下直接 `return`（“对焦/捏合由插件处理”） | **保持 return，不用改** | 新插件自己在原生侧处理了捏合变焦（ScaleGestureDetector）和点按对焦（GestureDetector），JS 侧继续袖手旁观。唯一变化：长按 1× 再滑动变焦在新插件下不需要了——滑动变焦直接在取景器上做（见第 3 节）。 |
| 12 | `suspendCameraView()` / `resumeCameraView()` | **不用改调用点**，只换里面调的函数（`stopNativePreview` → `GszdCamera2.stopPreview()`，`resumeCameraIfNeeded` 的 `isCameraStarted` → `isPreviewStarted`） | 插件自己的 `handleOnPause/handleOnResume` 会在 App 切后台时自动关/重开相机；App 切 tab 时仍走 `suspend/resumeCameraView`。 |

## 2. 镜头状态怎么接（新增的 ref / 流程）

```js
import { GszdCamera2 } from '@gszd/capacitor-camera2'

// 新增：原生镜头列表（替代 enumerateDevices 的 cameras，作为镜头面板的数据源）
const gszdCameras = ref([]) // [{ id, facing, type, label, focalLengthMm, zoomRatioRange, ... }]
const gszdCameraId = ref(localStorage.getItem('fw_gszd_camera_id') || '')

async function refreshGszdCameras() {
  try {
    const { cameras } = await GszdCamera2.listCameras()
    gszdCameras.value = cameras || []
  } catch { gszdCameras.value = [] }
}

// startNativePreview() 里：先 refreshGszdCameras()（无镜头时才调，有缓存可跳过），
// 再把 gszdCameraId.value（若在列表里）当 cameraId 传给 startPreview；
// startPreview 的返回值里有 zoomRatioRange / exposureCompensationRange，
// 分别写进现成的 zoomCaps / expCaps（结构一样：{ min, max, step? }），
// zoom.value 重置为 1（换镜头后倍数归 1，和现在 toggleFacing 的做法一致）。
// 选完镜头后把 id 存 localStorage('fw_gszd_camera_id')，下次启动接着用。
```

镜头面板（`showLensPanel` 的 sheet，现在只在网页取景下用）改成：
- 列表项用 `gszdCameras`：每行显示 `label`（后置 · 主摄 / 后置 · 超广角 / 后置 · 长焦 / 前置）
  + 焦距（`focalLengthMm`）+ 变焦范围（`zoomRatioRange.min–max`，如 `0.5–10×`）。
- 点一行 → `await GszdCamera2.switchCamera({ cameraId: id })` → `zoom.value = 1` → 关面板。
- 若 `gszdCameras` 为空（比如 iOS 占位拒绝、或老设备），面板显示“当前设备不支持镜头列表”，
  退回现在的前后切换。

变焦 UI（`zoom` / `zoomCaps` / `zoomLabel`）不用大改：
- `zoomCaps` 从新插件的 `zoomRatioRange` 来（min 可能 < 1，比如超广角 0.5×）。
- 滑动变焦：**新插件原生侧已经接管了取景器上的捏合**，JS 侧的 1× 按钮长按滑动
  可以保留（调 `GszdCamera2.setZoomRatio({ zoomRatio: z })`，和现在的
  `tryApplyZoom(z)` 同一个调用点，换个实现），也可以只留捏合。建议保留 1× 按钮
  的长按滑动（用户已经习惯），实现改成调新插件。
- `zoomOptions`（0.5/1/2/3/5/10 的候选）继续用 `zoomCaps` 过滤——超广角镜头的
  min 是 0.5，0.5 那个选项会自动出现。

## 3. 行为变化清单（集成后用户能感知到的）

- 点按 1×：原来是前后切换，改成弹镜头面板（主摄/超广角/长焦/前置随便点）。
- 前后切换：挪到“更多”菜单（已有入口）。
- 滑动变焦：取景器上直接滑（原生侧 `CONTROL_ZOOM_RATIO` / `SCALER_CROP_REGION`），
  不用再长按 1×；长按 1× 滑动保留作备用。
- 拍照：仍然是点快门 → 烧水印 → 保存，但照片不再被压到 2MP 以下（新插件按
  `captureWidth/captureHeight` 拍满分辨率，v3.0.3 的 2400 长边照旧）。
- 切后台再回来 / 从系统相机回来：插件自己重开相机（`handleOnResume`），
  App 的 `resumeCameraIfNeeded` 仍是兜底。

## 4. GitHub Actions 构建验证（本地沙箱跑不了安卓构建）

1. 按第 0 节把依赖和插件目录推上去（snapshot 推送要含插件目录）。
2. 在 GitHub 上看 Actions 的构建日志，确认这几点：
   - `npm ci` 成功（`file:plugins/capacitor-camera2` 解析到了，`node_modules/@gszd/capacitor-camera2` 存在）。
   - `npx cap sync android` 后 `android/capacitor.settings.gradle` 里有 `include ':gszd-camera2'`。
   - Gradle 构建成功（`assembleDebug` / `assembleRelease`），没有 Kotlin 插件
     相关的报错（若报 Kotlin 版本冲突，先看 `plugins/capacitor-camera2/android/build.gradle`
     里钉死的 Kotlin 2.0.21 / AGP 8.7.2 是否与工作流的 Gradle 8.11.1 冲突）。
   - APK 能正常安装启动；设置页能看到版本号（说明 JS 侧 `registerPlugin` 没炸）。
3. 若构建失败，先看是不是 `file:` 依赖没推全（最常见：`dist/` 漏推导致 JS 入口缺失，
   或 `android/` 漏推导致原生代码缺失）。

## 5. iOS 方案（AVFoundation，v1 只有占位）

v1 的 iOS 插件每个方法都 reject（`getSupportedFlashModes` → `[]`，
`isPreviewStarted` → `false`），App 在 iOS 上继续走现在的网页取景路线
（`isNative` 为真但插件不可用时，`startPhotoCamera` 应 catch 住
`startPreview` 的拒绝并退回 `startCamera()`——集成时把这个 fallback 写进去，
和现在“原生起不来退回网页路线”的逻辑共用一条路）。

完整 iOS 实现（后续专项）：
- `AVCaptureDevice.DiscoverySession(deviceTypes: [.builtInWideAngleCamera, .builtInUltraWideCamera, .builtInTelephotoCamera, .builtInTrueDepthCamera], mediaType: .video, position: .unspecified)` 列镜头。
- `AVCaptureVideoPreviewLayer` 放在 WebView 后面（和安卓的 toBack 同款做法）。
- 滑动变焦：`device.videoZoomFactor`（配合 `device.activeFormat.videoMaxZoomFactor` 钳制，
  切镜头时用 `device.virtualDeviceSwitchOverVideoZoomFactors` 找切换点）。
- 拍照：`AVCapturePhotoOutput` + `AVCapturePhotoSettings`，写文件回路径。
- 参考：camera-preview 的 `ios/Sources/CameraPreviewPlugin/CameraController.swift`
 （仓库里已有，在 `node_modules/@capacitor-community/camera-preview/ios/`）。

## 6. 必须真机验证的项（本地验证不了）

- [ ] 多镜头切换：主摄 / 超广角 / 长焦 / 前置都能打开、画面正常、切完首帧正常。
- [ ] 滑动变焦手感：取景器上双指捏合、单指滑动变焦是否顺滑；超广角（<1×）和长焦（>3×）切换时有没有跳变/黑屏。
- [ ] 逻辑多摄相机：`CONTROL_ZOOM_RATIO` 在逻辑镜头上切镜头时是否自动（0.5× 出超广角、3× 出长焦）。
- [ ] 各厂商兼容：小米 / 华为 / OPPO / vivo 上 `getCameraIdList` 是否都返回物理镜头；
  有的厂商只暴露逻辑镜头（此时靠变焦倍率切镜头，见 README 的说明）。
- [ ] 切后台再回来：相机是否自动重开、画面是否恢复（不要“回来卡住”）。
- [ ] 从系统相机回来：同上。
- [ ] 闪光灯：自动 / 常开 / 关闭 / 手电筒在新插件下是否正常（尤其拍照那一帧补光）。
- [ ] 前后切换：速度、手感、切完变焦是否归 1。
- [ ] 点按对焦：点取景器是否对焦（对焦框位置和实际对焦点是否一致）。
- [ ] 拍照清晰度：成片是否达到 `captureWidth/captureHeight` 指定的尺寸（不再是 2MP）。
- [ ] 拍照速度：和 v3.0.3 的提速优化一起测（storeToFile + 链路优化后）。
- [ ] 切到相册再回来：相册背景不再透出相机预览（v3.0.3 的竞态修复 + 新插件的 stop 是否都生效）。
- [ ] 权限被拒：相机权限被拒时 `startPreview` 是否干净地拒绝、App 是否正常退回网页取景。
- [ ] 低版本安卓（API 23–29）：`SCALER_CROP_REGION` 变焦、`createCaptureSession` 老接口是否正常。

## 7. 已知限制 / 风险

- 插件接管预览 + 拍照后，相机同一时间只能被一个客户端打开：不要再混用
  camera-preview（集成后应从依赖里去掉它，避免两路抢相机）。
- 有的厂商对物理镜头有限制（只能通过逻辑镜头访问）；此时 `listCameras()`
  只返回逻辑镜头，靠变焦倍率切镜头（见 README）。
- `tapToFocus` 的坐标映射依赖 TextureView 的 transform 矩阵求逆；若预览
  旋转/裁剪逻辑有偏差，对焦点会偏，需要真机核对。
- 拍照文件写在缓存根目录（`cacheDir/GSZD_*.jpg`），App 烧完水印后由
  `deleteCaptureTempFile` 删掉；若 App 崩溃，残留文件由系统清缓存处理。
- iOS v1 只有占位；iOS 真机仍走网页取景，直到 AVFoundation 实现落地。
