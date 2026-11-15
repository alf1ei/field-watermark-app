#!/usr/bin/env bash
# 一键打安卓 APK（debug 版）
# 前置：JDK 17 在 ~/jdk17、Android SDK 在 ~/Android、Gradle 8.11.1 在 ~/gradle-dists
# 注意：本机沙箱默认拦截 Java 的回环 TCP（Gradle Daemon 通信需要），
# 首次运行前需按提示打开权限：Muse 设置 -> Permissions -> Direct network protocols，
# 把 other_tcp 从 Deny 改为 Ask（否则会报 "Could not receive a message from the daemon"）。
set -euo pipefail
cd "$(dirname "$0")/.."
source ~/android-env.sh
echo "== 1/4 vite build =="
npm run build
echo "== 2/4 cap sync android =="
npx cap sync android
echo "== 3/4 gradle assembleDebug =="
cd android
~/gradle-dists/gradle-8.11.1/bin/gradle assembleDebug --no-daemon --console=plain
echo "== 4/4 复制 APK =="
mkdir -p ../dist-apk
cp app/build/outputs/apk/debug/app-debug.apk "../dist-apk/现场水印byccj-1.0.0.apk"
ls -lh "../dist-apk/现场水印byccj-1.0.0.apk"
~/Android/build-tools/35.0.0/aapt2 dump badging "../dist-apk/现场水印byccj-1.0.0.apk" | grep -E "package:|application-label|launchable-activity"
echo "APK_OK"
