# 长江现场水印相机

现场拍照用的 App，拍完照片直接把水印烧进去，不用事后一张张加。

## 这是干什么的

我做检测工作，现场采样拍照要留时间、经纬度、地址和项目名。以前要么手写，要么回去再处理，麻烦，就自己做了个 App：打开就能拍，拍完照片和视频上都有水印。

- 只填项目名称，别的都不用填。点取景下面那条信息栏就能改，会记住上次填的。
- 水印是 GSZD 大号斜字压在画面中间，透明度默认 0.2，设置里能调（0.1–0.6）。
- 底部黑条写项目名、时间、经纬度（度分秒）、地址。地址查不到就留空，不编。
- 拍照是 9:16 全屏取景，原生相机预览，点一下对焦、上下滑调曝光、双指捏合变焦。视频也是 1080p，同样烧水印，输出 webm。
- 照片同时存在 App 里和手机相册里，没网也能拍。相册按项目分组，能搜、能左右滑着看，长按多选可以批量删、批量归档（系统相册里那份要自己手动删）。
- 不用登录，没有广告。第一次打开会先弹同意页，同意了才开相机和定位。
- 更新不用走商店：App 启动时会从 Gitee 查一次新版本，有新版就提示下载安装。

现在版本 3.0.0，技术栈是 Vue 3 + Vite + Capacitor。包名 `com.gszd.fieldwatermark`。

## 怎么跑起来

```bash
npm install
npm run dev
```

浏览器打开 http://localhost:5173 就能试拍照和水印，需要允许相机和定位权限。

打安卓包走 GitHub Actions，Release 里拿签名好的 APK。自己本地打的话：

```bash
npm run build
npx cap sync android
cd android && ./gradlew assembleDebug --no-daemon
```

iOS 得在 Mac + Xcode 上弄，Linux 上打不出 IPA。

## 还有几句实话

- 定位只用浏览器自带的 geolocation，不依赖谷歌服务框架，装上不会再提示启用谷歌框架。
- 地址来自高德逆地理接口（Key 已内置，不用填），查不到就用 Nominatim 兜底，再查不到就留空。
- 上架走个人名义，华为、小米、OPPO、vivo、应用宝。苹果那边不做了，99 美元一年的开发者费不交。
- 联系邮箱：w4yne@foxmail.com

---

# Changjiang Field Watermark Camera

A field photo app that burns the watermark straight into the photo, so you don't have to add it afterwards.

## What it does

I work in testing, and field sampling photos need the time, latitude/longitude, address and project name on them. Doing that by hand afterwards was a pain, so I built this app: open it and shoot, and the watermark is already there.

- Only the project name needs filling in. Tap the info bar under the viewfinder to change it; it remembers the last one.
- The watermark is a big diagonal GSZD across the middle, opacity 0.2 by default, adjustable in settings (0.1–0.6).
- The black bar at the bottom shows the project name, time, coordinates in degrees/minutes/seconds, and address. If the address can't be looked up, it stays blank — nothing is made up.
- 9:16 full-screen viewfinder with the native camera preview. Tap to focus, slide up/down for exposure, pinch to zoom. Video is 1080p with the same watermark, saved as webm.
- Photos are saved in the app and in the phone album, and work offline. The album groups by project, supports search and swipe, and long-press multi-select for batch delete and filing (the copy in the system album has to be deleted manually).
- No login, no ads. The first launch asks for consent before the camera and location start.
- Updates don't go through a store: the app checks Gitee on launch and prompts when a new version is out.

Current version is 3.0.0, built with Vue 3 + Vite + Capacitor. Package name `com.gszd.fieldwatermark`.

## Run it

```bash
npm install
npm run dev
```

Open http://localhost:5173 in a browser to try the photo and watermark (allow camera and location permission).

The signed APK is in the GitHub Releases. To build Android locally:

```bash
npm run build
npx cap sync android
cd android && ./gradlew assembleDebug --no-daemon
```

iOS needs a Mac with Xcode; it can't be built on Linux.

## A few honest notes

- Location uses the browser's own geolocation, not Google Play services, so it won't ask you to enable the Google framework.
- The address comes from AMap reverse geocoding (key built in, nothing to fill in), with Nominatim as a fallback. If neither returns one, it stays blank.
- Store listing is under my personal name (Huawei, Xiaomi, OPPO, vivo, MyApp). No App Store — I'm not paying the $99/year developer fee.
- Contact: w4yne@foxmail.com
