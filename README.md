# 长江现场水印相机

独立跨平台现场拍照 App（iOS + Android），不依赖 LIMS，不用登录，打开就能拍。

## 功能（已和用户确认，v1.0.0）

- **只填项目名称**：拍照界面顶部点一下输入，记住上次输入的，支持历史快速选。
- **拍照**：一次拍一张，拍完预览，能删了重拍。照片同时存在 App 内作品列表和手机相册里，没网也能拍、存手机。
- **水印（真烧进像素）**：GSZD 大号半透明白色，约 -30° 居中斜压在画面中间；底部半透明黑条写项目名称、时间（`YYYY-MM-DD HH:mm:ss` 本地时间）、经纬度（度分秒，如 `106°56′09″E 36°03′21″N`）、地址。
  - 定位：GPS（WGS-84）→ 转 GCJ-02 → 逆地理编码。
  - 地址只能来自逆地理编码服务返回的结果，拿不到就留空，绝不凭坐标编造。没网时地址留空，有网后打开页面会自动补上（后台持续定位）。作品页已取消「补地址」（v1.0.3，用户要求）。
  - 地址短格式：省＋市＋县区＋下一级（街道/小区等），如“甘肃省庆阳市西峰区南街街道”。
  - 定位三级兜底：高精度 → 普通定位（Wi-Fi/基站）→ 缓存位置；打开页面后后台持续监听，拍照时定位没完会等它完成再拍。
  - 逆地理编码顺序：高德 restapi（需在作品页自填 Key，没有 Key 直接跳过，不写死假 Key）→ Nominatim（OpenStreetMap，无需 Key）。
  - 照片最长边 >2400px 等比缩小，导出 JPEG 0.92。
- **视频**：也要水印，同一版式，1080p（1920×1080 画布逐帧烧录后经 `canvas.captureStream + MediaRecorder` 录制），拍完能预览、能删，时长不限。输出为 webm（Chrome/WebView 的 MediaRecorder 原生格式；iOS 端如需 mp4 见下文“已知限制”）。
- **作品列表**：按项目名分组，缩略图，点开大图/播放视频，单张删除、分享/导出。
- **QQ 群自动上传：已砍掉**（QQ 没有官方接口能让第三方 App 自动同步到群里）。

## 技术栈

Vue 3 + Vite 6 + Capacitor 7（`@capacitor/core 7.6`）。包名 `com.gszd.fieldwatermark`，应用名 `长江现场水印相机`，版本 2.1.1。

- 相机：App 内 `getUserMedia` 实时取景（可叠加实时水印预览，所见即所得）+ 系统相机/相册兜底（`@capacitor/camera`，选图后同样烧水印）。
- 定位：`@capacitor/geolocation`，失败回退浏览器 Geolocation。
- 存储：`@capacitor/filesystem`（`Directory.Data/works/`）+ localStorage 记录列表；相册保存用 `@capacitor-community/media`（走系统 MediaStore），失败时退到外部共享目录，再失败则只存 App 内并明确提示。
- 原图留存：照片另存一份无水印原图（`_orig.jpg`，仅 App 内，不进相册），目前未被界面功能使用，留作备用。

## 目录结构

```
field-watermark-app/
├── src/
│   ├── App.vue                  拍摄 / 作品 两个 Tab
│   ├── main.js / style.css
│   ├── components/
│   │   ├── CameraView.vue       拍摄主界面（取景、水印预览、拍照、录像、系统相机兜底）
│   │   └── WorksList.vue        作品列表（分组、查看、删除、分享、高德 Key 设置）
│   └── utils/
│       ├── geo.js               WGS-84→GCJ-02、度分秒、时间格式、定位、逆地理编码
│       ├── watermark.js         drawWatermark / burnPhotoWatermark / drawVideoFrame
│       └── store.js             记录列表、App 内存储、相册保存、分享
├── scripts/
│   ├── verify-watermark.mjs     自验：DMS、GCJ-02、水印绘制指令（15 项）
│   ├── render-sample.mjs        真实像素渲染验证（需 node-canvas）
│   └── sample-watermarked.jpg   渲染出的水印样图
├── android/                     Capacitor Android 工程（Gradle）
├── ios/                         Capacitor iOS 工程（Xcode）
├── dist-apk/                    打好的 APK
└── capacitor.config.json
```

## 本地运行（H5 预览）

```bash
npm install
npm run dev        # http://localhost:5173，用电脑/手机浏览器打开可测拍照水印（需允许相机与定位权限，须用 https 或 localhost）
npm run verify     # 自验 15 项：DMS / GCJ-02 / 水印绘制指令
```

> H5 预览说明：浏览器里拍照用水印同样烧录；相册保存、系统相机属于真机能力，H5 下会提示并只存 App 内（浏览器 localStorage/IndexedDB 模拟的 Filesystem）。

## 打安卓 APK（已验证的流程）

> ⚠️ **2026-11-15 本机实测受阻（不是代码问题）**：这台 Linux 沙箱默认拦截 Java 进程的回环 TCP，Gradle Daemon 靠回环 TCP 和客户端通信，一连就被注入一段提示并断开：
> `muse: Other TCP connections is turned off for this assistant. To allow it, ask the user to open Muse settings -> Permissions -> Direct network protocols and switch other_tcp from Deny to Ask.`
> 已用最小 Java Socket 程序复现确认（Python 回环通信正常，只有 Java 进程被拦截；`Could not receive a message from the daemon` / `Unexpected type tag 109 ('M')` 都是这个原因）。**解法**：让用户在 Muse 设置里把 `other_tcp` 从 Deny 改为 Ask，然后直接跑一键脚本即可：
> ```bash
> bash scripts/build-apk.sh
> ```
> 脚本内容就是下面这套流程。SDK、JDK、Gradle、源码、自验都已就绪，权限一开就能打出 APK，不用再改代码。
> 另外：VM 中途重启过一次（`uptime` 只有 1 分钟、`/usr/lib/jvm` 被清空），JDK 和 Gradle 缓存已改放到持久目录（`~/jdk17`、`~/gradle-home`），重启不再丢。

环境：Node 24、JDK 17、Android SDK（platform-tools + platforms android-34/android-35 + build-tools 34.0.0/35.0.0）。

```bash
source ~/android-env.sh   # ANDROID_HOME=$HOME/Android，JAVA_HOME=JDK17
npm run build
npx cap sync android
cd android && ./gradlew assembleDebug --no-daemon
cp app/build/outputs/apk/debug/app-debug.apk ../dist-apk/现场水印byccj-1.0.0.apk
```

验证 APK：

```bash
~/Android/build-tools/35.0.0/aapt2 dump badging dist-apk/现场水印byccj-1.0.0.apk | grep -E "package:|application-label|launchable-activity"
unzip -l dist-apk/现场水印byccj-1.0.0.apk | grep -E "lib/arm64|lib/armeabi"
```

注意：Capacitor 7.6 默认 `compileSdk/targetSdk = 35`，所以本机装的是 android-35 + build-tools 35.0.0（android-34 也装了，但工程默认用 35；如需改 34，改 `android/variables.gradle` 里的 `compileSdkVersion/targetSdkVersion`）。
Gradle 下载依赖要走代理：`~/.gradle/gradle.properties` 里已配好 `systemProp.http(s).proxyHost/Port/User/Password`（从本机 `https_proxy` 环境变量生成）。

## 打 iOS（必须在 Mac + Xcode 上做，Linux 上打不出 IPA）

```bash
npm run build
npx cap sync ios     # 需要 CocoaPods，会装 Capacitor 各插件的 Pod
# 用 Xcode 打开 ios/App/App.xcworkspace
# 选 Team（苹果开发者账号），真机或 Archive → Distribute App → App Store Connect / TestFlight
```

iOS 工程已就绪：Bundle ID `com.gszd.fieldwatermark`，显示名 `长江现场水印相机`，`Info.plist` 已写好相机/麦克风/定位/相册权限说明。

## 上架应用商店（本次未做，需要用户准备）

- 苹果 App Store：苹果开发者账号（公司型 99 美元/年）、App Store Connect 上架、隐私政策链接。
- 安卓各家（华为、小米、OPPO、vivo、应用宝等）：各家开发者账号 + 营业执照 + 软件著作权（部分商店要求）+ 隐私政策。
- 本次交付的是可安装的 debug APK（可直接装到安卓手机上用）；上架用的 release 包需要签名（`keystore`，发布时生成，切勿丢失）+ 各商店要求的资料。

## 已验证

- `npm run verify`：15/15 通过。DMS：`106.9359, 36.0559 → 106°56′09″E / 36°03′21″N`；水印绘制指令：GSZD -30° 旋转、底部黑条、项目名/时间/经纬度/地址均已写入，地址为空时不编造；GCJ-02：天安门偏移约 555 米（正常量级），境外坐标不偏移。
- 真实像素渲染：`scripts/render-sample.mjs`（node-canvas）输出样图 `scripts/sample-watermarked.jpg`，像素断言通过（底部黑条亮度 47、中央 GSZD 亮字 244）。
- `vite build` 通过；`npx cap sync android` 通过（versionName 1.0.0、包名、权限清单均已核对）；APK 待权限放开后跑 `bash scripts/build-apk.sh` 打出，见上节。

## 未真机验证（需要真机复核）

- 真机相机取景、GPS 定位精度、逆地理编码在现场网络下的表现
- 相册保存（Media 插件在各品牌手机上的表现）、视频在相册里的播放
- 视频水印实拍效果、长时间录制的发热/文件大小
- iOS 真机：`getUserMedia` 在 WKWebView 里的表现、IPA 打包与 TestFlight
- 不同安卓版本（尤其是 Android 14/15）的权限弹窗与分区存储行为

## 图标说明（待补）
定制图标 assets/icon.png / assets/splash.png（GSZD 蓝底白字）是二进制文件，未随本次云端打包快照推送；GitHub Actions 构建先用 Capacitor 默认图标打通出包，定制图标后续再替换回 android/ios 的 mipmap/AppIcon 资源后重打。
