/**
 * 作品存储：
 *  - 记录列表：localStorage（id、项目名、时间、经纬度、地址、文件路径、类型、缩略图）
 *  - 文件本体：Capacitor Filesystem Directory.Data/works/（App 内私有目录，卸载即删）
 *  - 相册：照片优先 @capacitor-community/media（走系统 MediaStore）；视频同理；
 *    相册保存失败时只存 App 内，并在界面明确提示，不静默假装成功。
 */
import { Filesystem, Directory } from '@capacitor/filesystem'
import { Capacitor } from '@capacitor/core'
import { distMeters } from './geo.js'
import { DEFAULT_WATERMARK_OPACITY, clampWatermarkOpacity } from './watermark.js'

const LS_KEY = 'fw_records_v1'
const LAST_PROJECT_KEY = 'fw_last_project'
const HISTORY_KEY = 'fw_project_history'
const WM_TEXT_KEY = 'fw_watermark_text'
const WM_OPACITY_KEY = 'fw_watermark_opacity'
const FOLDERS_KEY = 'fw_folders_v1'
const PHOTO_FOLDER_KEY = 'fw_photo_folder_v1'
const CONSENT_KEY = 'fw_privacy_consent_v1'

/**
 * 隐私同意状态（v2.1.8，应用商店上架要求）：
 *  - 'accepted'：用户点了“同意并继续”，可以启动相机和定位；
 *  - 'declined'：用户点了“不同意”，不启动相机/定位，只能浏览相册；
 *  - null：还没选过，首次启动要先弹同意页。
 *  App.vue 只在 'accepted' 时才挂载 CameraView（CameraView 一挂载就开相机+定位），
 *  所以不同意/未决定时相机和定位从头到尾都不会启动。
 */
export function getPrivacyConsent() {
  try { return localStorage.getItem(CONSENT_KEY) } catch { return null }
}
export function setPrivacyConsent(state) {
  try { localStorage.setItem(CONSENT_KEY, state) } catch { /* ignore */ }
}

/** 斜水印文字：默认 GSZD，用户可在设置里改；改后只影响新拍的照片/视频 */
export function getWatermarkText() {
  try { return (localStorage.getItem(WM_TEXT_KEY) || '').trim() || 'GSZD' } catch { return 'GSZD' }
}
export function setWatermarkText(text) {
  try {
    localStorage.setItem(WM_TEXT_KEY, (text || '').trim())
    window.dispatchEvent(new Event('fw-settings-changed'))
  } catch { /* ignore */ }
}

/** 斜水印透明度（v3.0.0）：设置页滑块 0.1–0.6，默认 0.2；改后实时影响预览和新拍照片/视频 */
export function getWatermarkOpacity() {
  try {
    const raw = localStorage.getItem(WM_OPACITY_KEY)
    if (raw == null || raw === '') return DEFAULT_WATERMARK_OPACITY
    return clampWatermarkOpacity(raw)
  } catch { return DEFAULT_WATERMARK_OPACITY }
}
export function setWatermarkOpacity(value) {
  const v = clampWatermarkOpacity(value)
  try {
    localStorage.setItem(WM_OPACITY_KEY, String(v))
    window.dispatchEvent(new Event('fw-settings-changed'))
  } catch { /* ignore */ }
  return v
}

export function loadRecords() {
  try { return JSON.parse(localStorage.getItem(LS_KEY) || '[]') } catch { return [] }
}
export function saveRecords(list) {
  try { localStorage.setItem(LS_KEY, JSON.stringify(list)) } catch { /* ignore */ }
}

/** 地址补填：地址后来才取到时，把同一地点（500 米内）且地址为空的已保存照片地址补上；
 *  返回补了几条；补上了就发 fw-records-changed 事件，让作品页刷新（详情页的地址也会跟着变）。 */
export function backfillRecordsAddress(lon, lat, address, radiusMeters = 500) {
  if (!address) return 0
  const list = loadRecords()
  let changed = 0
  for (const r of list) {
    if (r.address) continue
    const rLon = r.gcjLon != null ? r.gcjLon : r.lon
    const rLat = r.gcjLat != null ? r.gcjLat : r.lat
    if (rLon == null || rLat == null) continue
    if (distMeters(lon, lat, rLon, rLat) <= radiusMeters) {
      r.address = address
      changed++
    }
  }
  if (changed) {
    saveRecords(list)
    try { window.dispatchEvent(new Event('fw-records-changed')) } catch { /* 非浏览器环境 */ }
  }
  return changed
}
export function getLastProject() {
  try { return localStorage.getItem(LAST_PROJECT_KEY) || '' } catch { return '' }
}
export function setLastProject(name) {
  try {
    localStorage.setItem(LAST_PROJECT_KEY, name || '')
    if (name) {
      const h = getProjectHistory().filter((x) => x !== name)
      h.unshift(name)
      localStorage.setItem(HISTORY_KEY, JSON.stringify(h.slice(0, 10)))
    }
  } catch { /* ignore */ }
}
export function getProjectHistory() {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) || '[]') } catch { return [] }
}

/** ---- 作品文件夹（存在 localStorage）---- */
export function getFolders() {
  try {
    const list = JSON.parse(localStorage.getItem(FOLDERS_KEY) || '[]')
    return Array.isArray(list) ? list.filter((f) => f && f.id && f.name) : []
  } catch { return [] }
}
export function saveFolders(list) {
  try { localStorage.setItem(FOLDERS_KEY, JSON.stringify(list)) } catch { /* ignore */ }
}
export function createFolder(name) {
  const clean = (name || '').trim()
  if (!clean) return null
  const list = getFolders()
  const folder = { id: uid(), name: clean.slice(0, 20), createdAt: Date.now() }
  list.push(folder)
  saveFolders(list)
  return folder
}
export function deleteFolder(id) {
  saveFolders(getFolders().filter((f) => f.id !== id))
  // 文件夹里的照片回到日期列表（只清归属，不删照片）
  const map = getPhotoFolderMap()
  let changed = false
  for (const k of Object.keys(map)) {
    if (map[k] === id) { delete map[k]; changed = true }
  }
  if (changed) savePhotoFolderMap(map)
}
export function getPhotoFolderMap() {
  try {
    const m = JSON.parse(localStorage.getItem(PHOTO_FOLDER_KEY) || '{}')
    return m && typeof m === 'object' ? m : {}
  } catch { return {} }
}
export function savePhotoFolderMap(map) {
  try { localStorage.setItem(PHOTO_FOLDER_KEY, JSON.stringify(map || {})) } catch { /* ignore */ }
}
export function getPhotoFolder(recordId) {
  return getPhotoFolderMap()[recordId] || ''
}
export function setPhotoFolder(recordId, folderId) {
  const map = getPhotoFolderMap()
  if (folderId) map[recordId] = folderId
  else delete map[recordId]
  savePhotoFolderMap(map)
}

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => resolve(String(r.result).split(',')[1])
    r.onerror = reject
    r.readAsDataURL(blob)
  })
}

/** 把 Blob 存到 App 内 Data 目录，返回 {path, uri} */
export async function saveToAppStorage(blob, fileName) {
  const base64 = await blobToBase64(blob)
  const path = `works/${fileName}`
  const res = await Filesystem.writeFile({
    path, data: base64, directory: Directory.Data, recursive: true
  })
  return { path, uri: res.uri }
}

/** 读 App 内文件为 dataURL（列表缩略图/查看用） */
export async function readAppFile(path, mime = 'image/jpeg') {
  const res = await Filesystem.readFile({ path, directory: Directory.Data })
  const data = typeof res.data === 'string' ? res.data : await blobToBase64(res.data)
  return `data:${mime};base64,${data}`
}

export async function deleteAppFile(path) {
  try { await Filesystem.deleteFile({ path, directory: Directory.Data }) } catch { /* 已删或不存在 */ }
}

/**
 * 保存到系统相册。返回 {ok, where}，where: 'gallery' | 'app-only'
 * 照片用 Media.savePhoto，视频用 Media.saveVideo（需要文件路径时用 App 内文件的 uri）。
 */
export async function saveToGallery({ fileUri, isVideo }) {
  if (!Capacitor.isNativePlatform()) return { ok: false, where: 'app-only', reason: 'H5 环境无系统相册，请用下载/分享导出' }
  try {
    const { Media } = await import('@capacitor-community/media')
    if (isVideo) {
      await Media.saveVideo({ path: fileUri })
    } else {
      await Media.savePhoto({ path: fileUri })
    }
    return { ok: true, where: 'gallery' }
  } catch (e) {
    console.warn('相册保存失败（Media 插件）:', e)
    // 退路：写到外部共享目录（Android 10+ 可能受分区存储限制，失败即只存 App 内）
    try {
      const fileName = fileUri.split('/').pop()
      const src = await Filesystem.readFile({ path: `works/${fileName}`, directory: Directory.Data })
      const sub = isVideo ? 'Movies' : 'Pictures'
      await Filesystem.writeFile({
        path: `${sub}/长江现场水印相机/${fileName}`,
        data: src.data, directory: Directory.ExternalStorage, recursive: true
      })
      return { ok: true, where: 'gallery', note: '已写入共享存储，请到相册查看' }
    } catch (e2) {
      console.warn('外部存储写入失败:', e2)
      return { ok: false, where: 'app-only', reason: '相册保存失败，仅保存在 App 内，可用分享导出' }
    }
  }
}

/** 用系统分享把 App 内文件发出去（微信/QQ/保存到文件等） */
export async function shareFile(fileUri, fileName) {
  const { Share } = await import('@capacitor/share')
  await Share.share({ url: fileUri, title: fileName, dialogTitle: '分享 / 导出' })
}
