/**
 * OTA 更新（v3.0.0，Gitee 方案）：
 *  - 检查：启动时一次 + 设置页“检查更新”按钮；先从 Gitee raw 拉 version.json，
 *    远端 versionCode 大于本地才提示更新。Gitee raw 不稳定（实测一次 25 秒无响应、
 *    一次 302 跳转后 3.25 秒才拿到内容），所以每次尝试 15 秒超时，Gitee 失败/超时/
 *    格式不对就改拉 GitHub raw 备用；两条都失败再按同样顺序（Gitee → GitHub）
 *    重试一轮，最多 4 次尝试，第一次成功立即返回。
 *  - 安装：下载 APK 到缓存目录（@capacitor/filesystem），再调系统安装器。
 *    只在安卓原生端走这条路：iOS 没有侧载安装，网页版/PWA 请刷新页面更新。
 *  - 无网络时静默跳过（不弹、不报错）；下载失败给提示 + 手动下载说明。
 *  - “允许安装未知应用”权限（Android 8.0+）：安卓系统硬性要求，跳不过，但只用开一次。
 *    流程：安装前先查 canInstallUnknownApps()（@jwot/capacitor-apkupdater，
 *    原生调 PackageManager.canRequestPackageInstalls()）；没开就先弹引导，
 *    点“去设置开启”直接跳到本应用的设置页（Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES，
 *    带本应用包名），用户开完返回 App 后再查一次，确认开了才调安装器；
 *    安装器本身被系统拦住时同样回到引导页，不让用户对着报错干等。
 *
 * Gitee 仓库（用户已定，真实地址）：https://gitee.com/alf1e/field-watermark-app
 * 注意用户名是 alf1e（不是 GitHub 的 alf1ei）。发版时要同步做三件事：
 *  1. 把新 APK 作为附件发到 Gitee 发行版（release），tag 是 v<版本号>；
 *  2. 更新仓库根目录的 version.json（version / versionCode / releaseDate / apkUrl / notes）；
 *  3. apkUrl 按 Gitee 发行版附件地址格式：https://gitee.com/alf1e/field-watermark-app/releases/download/v<版本号>/<APK 文件名>
 */
import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { APP_VERSION } from '../version.js'

// Gitee 仓库地址（集中配置，改这里一处即可）
export const OTA_GITEE_REPO = 'https://gitee.com/alf1e/field-watermark-app'
// version.json 的 raw 地址（main 分支根目录）
export const OTA_VERSION_URL = `${OTA_GITEE_REPO}/raw/main/version.json`
// version.json 的 GitHub raw 备用地址（Gitee raw 不稳定时用；用户名是 alf1ei）
export const OTA_VERSION_URL_GITHUB = 'https://raw.githubusercontent.com/alf1ei/field-watermark-app/main/version.json'
// APK 下载地址（Gitee 发行版附件格式）
export function otaApkUrl(version) {
  return `${OTA_GITEE_REPO}/releases/download/v${version}/长江现场水印相机v${version}.apk`
}

/**
 * 拉远端 version.json（每次尝试 15 秒超时）。
 * 顺序：Gitee → GitHub 备用；两条都失败再按同样顺序重试一轮，最多 4 次尝试，
 * 第一次成功立即返回。每次拿到响应都校验格式（必须有 version 字符串和
 * 数字 versionCode），校验不过算这次失败、继续试下一个 URL，不直接抛错。
 * 全部失败才抛错（抛最后一次的错，调用方按“没网”静默跳过）。
 * 返回 { version, versionCode, releaseDate, apkUrl, notes }，apkUrl 缺失时
 * 用 otaApkUrl(j.version) 补。
 */
export async function fetchRemoteVersion() {
  const urls = [OTA_VERSION_URL, OTA_VERSION_URL_GITHUB]
  let lastError = null
  for (let round = 0; round < 2; round++) {
    for (const url of urls) {
      // 每轮每次都新建 controller，不复用已 abort 的
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), 15000)
      try {
        const res = await fetch(url, { signal: ctrl.signal, cache: 'no-store' })
        if (!res.ok) throw new Error('检查更新失败：HTTP ' + res.status)
        const j = await res.json()
        if (!j || typeof j.versionCode !== 'number' || !j.version) {
          throw new Error('version.json 格式不对（缺 version / versionCode）')
        }
        return {
          version: String(j.version),
          versionCode: j.versionCode,
          releaseDate: j.releaseDate || '',
          apkUrl: j.apkUrl || otaApkUrl(j.version),
          notes: j.notes || ''
        }
      } catch (e) {
        lastError = e
        // 这次失败，继续试下一个 URL（或下一轮）
      } finally {
        clearTimeout(t)
      }
    }
  }
  throw lastError || new Error('检查更新失败：拉不到 version.json')
}

/**
 * 检查更新。返回 { available, remote, reason }：
 *  - available=true：远端 versionCode 更大，有新版本
 *  - reason: 'web'（网页版/PWA，不走 APK 安装）/ 'ios'（iOS 不支持侧载安装）
 *    / 'offline'（没网或拉不到 version.json，静默跳过）/ 'bad-remote'（远端文件格式不对）
 */
export async function checkForUpdate() {
  if (!Capacitor.isNativePlatform()) return { available: false, remote: null, reason: 'web' }
  if (Capacitor.getPlatform() === 'ios') return { available: false, remote: null, reason: 'ios' }
  let remote = null
  try {
    remote = await fetchRemoteVersion()
  } catch {
    return { available: false, remote: null, reason: 'offline' }
  }
  if (!remote || typeof remote.versionCode !== 'number') {
    return { available: false, remote: null, reason: 'bad-remote' }
  }
  return { available: remote.versionCode > APP_VERSION.versionCode, remote, reason: null }
}

/**
 * 查本应用有没有“安装未知应用”权限（Android 8.0+ 的开关，只能用户手动开，App 跳不过）。
 * 原生调 PackageManager.canRequestPackageInstalls()（@jwot/capacitor-apkupdater，
 * 0.0.2，peer @capacitor/core >=7；Android 8.0 以下恒为 true）。
 * 返回 true（已开）/ false（没开）/ null（查不到：非安卓原生端，或插件不可用——
 * 调用方按“未知”处理，直接调安装器，让系统自己拦）。
 */
export async function canInstallUnknownApps() {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return null
  try {
    const { JustWeiApkUpdater } = await import('@jwot/capacitor-apkupdater')
    const st = await JustWeiApkUpdater.checkPermissions()
    if (!st || typeof st.canRequestPackageInstalls !== 'string') return null
    return st.canRequestPackageInstalls === 'granted'
  } catch { return null }
}

/**
 * 没开时引导用户去开：调插件 requestPermissions()，它直接跳到本应用的
 * “允许安装未知应用”设置页（Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES，
 * 带本应用包名），用户开完返回 App 后直接返回最新的开关状态。
 * 返回 true（已开）/ false（仍没开）/ null（打不开设置页）。
 * 注意：这个开关只需开一次，以后更新不用再开（调用方 UI 里要写清这句）。
 */
export async function requestInstallPermission() {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') return null
  try {
    const { JustWeiApkUpdater } = await import('@jwot/capacitor-apkupdater')
    const st = await JustWeiApkUpdater.requestPermissions()
    if (!st || typeof st.canRequestPackageInstalls !== 'string') return null
    return st.canRequestPackageInstalls === 'granted'
  } catch { return null }
}

/**
 * 只下载 APK 到缓存目录，返回 { uri, path }（uri 是 file:// 绝对地址，供安装器用）。
 * 下载失败抛错，调用方给提示 + 手动下载说明。
 * 注意：@capacitor/filesystem 7.1 起 progress 监听被标记为 deprecated（官方推荐
 * @capacitor/file-transfer），但 7.x 里仍可用；以后升级 Capacitor 大版本时再换。
 */
export async function downloadApk(remote, onProgress) {
  if (!remote || !remote.apkUrl) throw new Error('没有可下载的安装包地址')
  const fileName = `长江现场水印相机v${remote.version}.apk`
  const path = `update/${fileName}`
  let handle = null
  try {
    // 进度事件（Android/iOS 约每 100ms 节流一次）
    handle = await Filesystem.addListener('progress', (p) => {
      if (p && p.contentLength > 0 && typeof onProgress === 'function') {
        onProgress(Math.min(100, Math.round((p.bytes / p.contentLength) * 100)))
      }
    })
  } catch { /* 监听挂不上就只显示“下载中”，不阻塞下载 */ }
  try {
    if (typeof onProgress === 'function') onProgress(0)
    await Filesystem.downloadFile({
      path,
      directory: Directory.Cache,
      url: remote.apkUrl,
      progress: true,
      recursive: true
    })
  } finally {
    try { if (handle && handle.remove) await handle.remove() } catch { /* ignore */ }
  }
  if (typeof onProgress === 'function') onProgress(100)
  const { uri } = await Filesystem.getUri({ path, directory: Directory.Cache })
  return { uri, path }
}

/**
 * 调系统安装器装已下载好的 APK（uri 是 downloadApk 返回的 file:// 地址）。
 * 优先用 @jwot/capacitor-apkupdater 的 install()：它内部先查一次安装权限，
 * 没开直接拒绝（不调安装器、不等系统报错）；插件不可用时回退 FileOpener。
 * 没权限时抛 code 为 'NO_INSTALL_PERMISSION' 的错，调用方据此弹出去设置的引导。
 */
export async function installApk(uri) {
  if (!uri) throw new Error('没有可安装的文件')
  let plugin = null
  try {
    const mod = await import('@jwot/capacitor-apkupdater')
    plugin = mod && mod.JustWeiApkUpdater
  } catch { plugin = null }
  if (plugin && typeof plugin.install === 'function') {
    let res
    try {
      res = await plugin.install({ apkPath: uri })
    } catch (e) {
      // 插件明确报“没有安装权限”：转成 NO_INSTALL_PERMISSION，让调用方引导去设置
      if (e && /没有安装权限/.test(e.message || '')) {
        const err = new Error(e.message)
        err.code = 'NO_INSTALL_PERMISSION'
        throw err
      }
      throw e
    }
    if (res && res.success === false) {
      const err = new Error(res.error || '调起安装器失败')
      if (/没有安装权限/.test(res.error || '')) err.code = 'NO_INSTALL_PERMISSION'
      throw err
    }
    return
  }
  // 插件不可用：回退 FileOpener 调安装器（系统自己拦没权限的情况）
  const { FileOpener } = await import('@capacitor-community/file-opener')
  await FileOpener.open({
    filePath: uri,
    contentType: 'application/vnd.android.package-archive',
    openWithDefault: true
  })
}

/**
 * 下载 APK（带进度回调 onProgress(0-100)）并调系统安装器。
 * 安装前先查“安装未知应用”权限：没开不直接调安装器，抛 code 为
 * 'NO_INSTALL_PERMISSION' 的错（err.downloaded 带已下载的文件，调用方引导用户
 * 去设置开一次后可直接调 installApk，不用重新下载）；查不到时直接试安装。
 * 其他失败抛错，调用方给提示 + 手动下载说明。
 */
export async function downloadAndInstallApk(remote, onProgress) {
  const downloaded = await downloadApk(remote, onProgress)
  const allowed = await canInstallUnknownApps()
  if (allowed === false) {
    const err = new Error('需要先在系统设置里允许本应用“安装未知应用”（只需开一次）')
    err.code = 'NO_INSTALL_PERMISSION'
    err.downloaded = downloaded
    throw err
  }
  await installApk(downloaded.uri)
}
