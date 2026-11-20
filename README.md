# 长江现场水印相机

独立跨平台现场拍照 App（iOS + Android），不依赖 LIMS，不用登录，没有广告，完全免费，打开就能拍。

## 功能

- **只填项目名称**：点顶部项目名称输入，记住上次输入的，支持历史快速选。
- **拍照**：3:4 取景，拍照用原生相机预览（网页取景兜底），顶部项目名称 + 四个横向椭圆控制按钮（菜单/闪光灯/前后切换/更多），顶区从屏幕最顶端用实底深色填满不透预览；快门是 96×56 红色圆角矩形（无文字），在模式药丸下方居中，模式药丸、快门行、底部导航三行对齐；一次拍一张，拍完手机轻震一下，照片同时存在 App 内相册列表和手机相册里，没网也能拍、存手机。点取景器对焦、上下滑调曝光（原生预览下双指捏合变焦，点按变焦按钮切换前后镜头）。模式药丸三段：系统相机（点一下打开手机原生相机，拍完回到拍照）/ 拍照 / 录像。
- **水印（真烧进像素）**：GSZD 大号半透明白色，约 -30° 居中斜压在画面中间；底部半透明黑条写项目名称、时间（`YYYY-MM-DD HH:mm:ss` 本地时间）、经纬度（度分秒，如 `106°56′09″E 36°03′21″N`）、地址。斜水印透明度可在设置页滑块调（0.10–0.60，默认 0.20），取景实时预览，烧进照片和视频用同一数值。
  - 定位：GPS（WGS-84）→ 转 GCJ-02 → 逆地理编码。定位只用浏览器 Geolocation，不依赖谷歌服务框架（v3.0.0 起不再用 `@capacitor/geolocation`，安装包里不再含 play-services-location，不会再提示启用谷歌框架）。
  - 地址只能来自逆地理编码服务返回的结果，拿不到就留空，绝不凭坐标编造。没网时地址留空，有网后打开页面会自动补上（后台持续定位）。相册页已取消「补地址」（v1.0.3，用户要求）。
  - 地址短格式：省＋市＋县区＋下一级（街道/小区等），如“甘肃省庆阳市西峰区南街街道”。
  - 定位三级兜底：高精度 → 普通定位（Wi-Fi/基站）→ 缓存位置；打开页面后后台持续监听，拍照时定位没完会等它完成再拍。
  - 逆地理编码顺序：高德 restapi（Key 已内置在 App 里，不用再填）→ Nominatim（OpenStreetMap，无需 Key）。
  - 照片最长边 >2400px 等比缩小，导出 JPEG 0.92。
- **视频**：也要水印，同一版式，1080p（1920×1080 画布逐帧烧录后经 `canvas.captureStream + MediaRecorder` 录制），拍完能预览、能删，时长不限。输出为 webm（Chrome/WebView 的 MediaRecorder 原生格式；iOS 端如需 mp4 见下文“已知限制”）。
- **相册列表**：按项目名分组，缩略图，点开只显示大图/播放视频（信息上滑才出来），单张删除、分享/导出。长按多选，拖进文件夹批量归档，多选模式里可批量删除（只删 App 内的，系统相册里的需手动删）。顶部搜索框：按项目名称、地址、日期实时过滤（项目名称优先），不区分大小写；详情页左右滑动切换上一张/下一张。
- **QQ 群自动上传：已砍掉**（QQ 没有官方接口能让第三方 App 自动同步到群里）。

## 技术栈

Vue 3 + Vite 6 + Capacitor 7（`@capacitor/core 7.6`）。包名 `com.gszd.fieldwatermark`，应用名 `长江现场水印相机`，版本 3.0.3。

- 相机：拍照用 `@capacitor-community/camera-preview` 原生预览（toBack，WebView 背景透明，HTML 浮层在上；双指捏合变焦、前后切换、闪光灯走插件接口；录像仍走网页路线）；网页 `getUserMedia` 取景作兜底（镜头面板列出手机全部摄像头，可切换、调变焦；读不到时自动重试、打开面板重读、也可手动重读，实在读不到时按前后方向切换）+ 系统相机/相册兜底（`@capacitor/camera`，选图后同样烧水印）。
- 定位：浏览器 `navigator.geolocation`（v3.0.0 起不再用 `@capacitor/geolocation`，安装包不再含谷歌服务定位）；定位权限走 WebView 首次调用时的系统弹窗，相机权限仍走原生侧；首次启动先定位、再相机，两个弹窗错开。
- 存储：`@capacitor/filesystem`（`Directory.Data/works/`）+ localStorage 记录列表；相册保存用 `@capacitor-community/media`（走系统 MediaStore），失败时退到外部共享目录，再失败则只存 App 内并明确提示。
- 版本信息：`src/version.js` 集中维护 version / versionCode / releaseDate，设置页显示当前版本、更新时间、联系邮箱；OTA 的 `version.json` 跟着版本同步更新。
- OTA 自更新：`src/utils/ota.js` 从 Gitee（`https://gitee.com/alf1e/field-watermark-app`）raw 拉 `version.json`，远端 versionCode 更大时提示；下载 APK 到缓存目录后调系统安装器（`@jwot/capacitor-apkupdater`：安装前先查“安装未知应用”权限，没开先引导去设置开一次，只需开一次）。

## 目录结构

```
field-watermark-app/
├── src/
│   ├── App.vue                  拍摄 / 相册 两个 Tab
│   ├── main.js / style.css
│   ├── version.js               集中版本信息（version / versionCode / releaseDate）
│   ├── components/
│   │   ├── CameraView.vue       拍摄主界面（全屏取景、原生预览、拍照、录像、系统相机兜底）
│   │   ├── WorksList.vue        相册列表（搜索、分组、查看、删除、分享、设置）
│   │   └── UpdatePrompt.vue     OTA 更新提示框（下载进度、安装权限引导）
│   └── utils/
│       ├── geo.js               WGS-84→GCJ-02、度分秒、时间格式、定位、逆地理编码
│       ├── watermark.js         drawWatermark / burnPhotoWatermark / drawVideoFrame
│       ├── store.js             记录列表、App 内存储、相册保存、分享
│       ├── ota.js               OTA 检查 / 下载 / 安装（Gitee version.json + 安装权限）
│       └── keyboard.js          输入法键盘高度跟踪、输入框光标移到末尾
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

## 上架应用商店（v2.1.8 已做技术准备）

> **上架主体（用户已定）：个人名义上架，不是公司。**隐私政策/用户协议里的开发者写个人开发者，软件著作权和备案的申请人也是用户个人，不要写甘肃中德检验检测公司。

### 隐私合规（代码里已做）

- **首次启动同意弹窗**：App 第一次启动先弹同意页，简述收集什么（照片/视频只存本机和系统相册、定位经纬度用于水印地址、联网只调高德逆地理接口查地址），附隐私政策和用户协议全文入口；点“同意并继续”后才启动相机和定位，点“不同意”不启动相机/定位，只能浏览相册；同意状态记在本地，以后启动不再弹，不同后想改主意可以在拍摄页点“阅读并同意”。
- **隐私政策**：`public/privacy.html`（独立静态页），按 App 实际行为写：不注册不登录、不收集账号；照片/视频存在本机和系统相册；定位只用于水印，不上传到自己的服务器；联网只调高德逆地理编码（`restapi.amap.com`）和无 Key 时的 Nominatim；不含广告、不含第三方统计 SDK；用户可删除本机数据、撤回定位权限。
- **用户协议**：`public/terms.html`，同上，独立静态页。
- **App 内可看**：相册页设置卡有“隐私政策 / 用户协议”入口，打开的是打包进 App 的本地副本，离线也能看。
- **商店要的在线链接**：`privacy.html` 需部署到一个能直接打开的 HTTPS 地址（例如 `https://您的域名/privacy.html`）再填进各商店后台；公司官网是凡科闭合平台，**不能**直接托管，见 `~/workspace/goals/by-ccj-field-photo-app/files/DEPLOY-PWA.md` 的外部托管方案。隐私政策里的联系邮箱已填 w4yne@foxmail.com。

### Release 签名打包（工作流已改好）

上架用的 release 包必须签名，签名信息从 GitHub Secrets 读，**不要把 keystore 或密码写进仓库**。

**1. 生成 keystore（只做一次，妥善保管，丢了就再也更新不了已上架的 App）：**

```bash
keytool -genkeypair -v -keystore field-watermark-release.keystore \
  -alias gszd -keyalg RSA -keysize 2048 -validity 9125
# 按提示填密码、姓名等；-alias 建议就用 gszd；validity 9125 天 = 25 年
```

**2. 把 keystore 转成 base64（填 Secrets 用）：**

```bash
# macOS
base64 -i field-watermark-release.keystore | tr -d '\n'
# Linux
base64 -w0 field-watermark-release.keystore
```

**3. 填仓库 Secrets（仓库 → Settings → Secrets and variables → Actions → New repository secret）：**

| Secret 名 | 内容 |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | 上一步 base64 输出的整串 |
| `KEYSTORE_PASSWORD` | 生成 keystore 时设的密码 |
| `KEY_ALIAS` | `gszd`（和生成时 -alias 一致） |
| `KEY_PASSWORD` | key 的密码（一般和 keystore 密码相同） |

**工作流行为了如上**：`assembleDebug` 照常打（debug 包只进 artifact，供测试）；然后检查四个 Secrets，缺任何一个就**明确报错、整个构建失败，不悄悄回落到 debug 包**；齐全时打 `assembleRelease`，用 `apksigner` 签名并校验；Release 里只放签名后的 release 包（`长江现场水印相机v3.0.3.apk`）。另外工作流每次按 `major*10000+minor*100+patch` 自动算 `versionCode`（3.0.3 → 30003），商店更新要求 versionCode 递增，`cap add android` 每次都会把它重置成 1，不自动算就会被商店拒收更新。

### 上架物料

见 `docs/STORE-LISTING.md`：一句话简介、功能介绍、截图清单、各商店要填的字段清单（包名、版本、分类选工具/摄影、隐私政策链接占位）。

### 各商店账号与资料（用户准备）

- 华为、小米、OPPO、vivo、应用宝：各家开发者账号（个人名义实名）+ 软件著作权（申请人写用户个人）+ 隐私政策在线链接。
- 苹果 App Store：本次不做（用户已决定不交 99 美元/年开发者费，见 LIMS/现场水印 App 的分发记录）。

## OTA 自更新（Gitee + GitHub 备用，v3.0.3）

App 内自更新，不走应用商店：启动时自动检查一次，设置页也有“检查更新”按钮；先从 Gitee raw 拉 `version.json`，失败/超时改拉 GitHub raw 备用（15 秒超时，每轮两个地址都试，全部失败才报“没网或连不上更新服务”），远端 versionCode 更大时弹更新提示，点更新就下载 APK（带进度）后调系统安装器安装。

- Gitee 仓库：`https://gitee.com/alf1e/field-watermark-app`（用户名是 alf1e，不是 GitHub 的 alf1ei）。
- 检查地址：`https://gitee.com/alf1e/field-watermark-app/raw/main/version.json`；APK 下载地址按 Gitee 发行版附件格式：`https://gitee.com/alf1e/field-watermark-app/releases/download/v<版本号>/长江现场水印相机v<版本号>.apk`。
- “允许安装未知应用”开关：安卓系统硬性要求，跳不过，但只用开一次。安装前 App 会先查这个权限，没开就弹引导，点“去设置开启”直接跳到本应用的设置页，打开开关回来就能装。

### Gitee 那边还需要用户做的事（发版时同步做）

1. 在 Gitee 建好上面这个仓库（公开），把 GitHub 仓库同步/镜像过去；
2. 每次发版把新 APK 作为附件发到 Gitee 发行版（release），tag 是 `v<版本号>`；
3. 更新仓库根目录的 `version.json`（version / versionCode / releaseDate / apkUrl / notes），versionCode 每次递增；
4. 注意：`version.json` 和 `src/version.js` 里的版本号、versionCode、更新时间要保持一致。

## 已验证

- `npm run verify`：77/77 通过。DMS：`106.9359, 36.0559 → 106°56′09″E / 36°03′21″N`；水印绘制指令：GSZD -30° 旋转、底部黑条、项目名/时间/经纬度/地址均已写入，地址为空时不编造；GCJ-02：天安门偏移约 555 米（正常量级），境外坐标不偏移；水印透明度默认 0.2（0.1–0.6 可调，越界夹取）。
- `npm run verify:pwa`：228/228 通过（v3.0.3 全部新检查在内：OTA GitHub 备用地址、快门圆角矩形、详情苹果相册手势、项目名历史下拉、拍照提速关键点、烧水印 2 次编码、相册背景不透明；另含 v3.0.2 的顶区实底、椭圆按钮、三行对齐、点按切换镜头、拍照震动、详情仅图片+上滑信息板；另含 v3.0.1 的拍摄页新布局、模式药丸系统相机段、快门无文字、网页版详情页 data URL、菜单按钮打开设置页、原生相机预览、串行权限、OTA 安装权限引导、键盘避让、版本显示、相册搜索与滑动、去谷歌框架）。
- 真实像素渲染：`scripts/render-sample.mjs`（node-canvas）输出样图 `scripts/sample-watermarked.jpg`，像素断言通过（底部黑条亮度 47、中央 GSZD 亮字 244）。
- `vite build` 通过；`npx cap sync android` 通过（versionName 1.0.0、包名、权限清单均已核对）；APK 待权限放开后跑 `bash scripts/build-apk.sh` 打出，见上节。

## 未真机验证（需要真机复核）

- 真机相机取景、GPS 定位精度、逆地理编码在现场网络下的表现
- 相册保存（Media 插件在各品牌手机上的表现）、视频在相册里的播放
- 视频水印实拍效果、长时间录制的发热/文件大小
- iOS 真机：`getUserMedia` 在 WKWebView 里的表现、IPA 打包与 TestFlight
- 不同安卓版本（尤其是 Android 14/15）的权限弹窗与分区存储行为
- v3.0.0 新增（未真机验证）：原生相机预览（前后切换、闪光灯、双指捏合变焦手感）、OTA 下载安装与“安装未知应用”权限引导、Gitee raw 与发行版附件在国内网络下的可达性、相册搜索、浏览器定位在真机上是否还提示启用谷歌框架（v3.0.0 已去掉 Play 服务定位，理论上不再提示，需真机确认）
- v3.0.1 新增（未真机验证）：拍摄页新布局（顶部项目名称 + 四个圆钮、3:4 取景、模式药丸系统相机段走原生系统相机、快门无文字）、网页版详情页图片修复（需网页版复核）
- v3.0.2 新增（未真机验证）：拍摄页按第七版效果图（四个控制按钮、快门、比例、变焦全改横向椭圆，模式药丸/快门行/底部导航三行对齐，顶区实底不透预览）、点按变焦按钮切换前后镜头、相册详情只显示图片（上滑出信息板）、拍照后轻震一下
- v3.0.3 新增（未真机验证）：OTA 检查失败改走 GitHub 备用地址并重试；项目名直接在顶栏输入、最近项目下拉快速选择；预览所见即所得（取景框就是成片框）；快门改圆角矩形；相册详情改苹果相册手势（左右滑换照片、上下滑退出、点一下出信息板、删除放右上角）；拍照提速（点快门立刻震动+白闪、拍照不等定位、存储并行、3:4 输出 1800×2400）；修相册背景变相机预览的 bug

## 图标说明
App 图标是冰蓝色半透明浪花书法“长江”字 + 深蓝光圈泼墨底（assets/icon.png，1024×1024；自适应图标背景 assets/icon-background.png，深蓝 #001C40）。图标类文件是二进制，未随云端打包快照推送；GitHub Actions 构建时在 cap sync 之后跑 `npx @capacitor/assets generate --android`，从这两张图生成 Android 启动图标（mipmap ic_launcher / ic_launcher_foreground / ic_launcher_background）。
