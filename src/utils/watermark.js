/**
 * 水印烧录：把斜水印 + 底部信息条真烧进图片/视频帧像素里，不是只显示一层。
 * 版式（2026-11-16 用户反馈后调整）：
 *  - 斜水印：大号淡白，约 -30°，居中斜压在画面中间；默认文字 GSZD，
 *    用户可在设置里改成别的文字（meta.watermarkText，空则回落 GSZD）
 *  - 底部：半透明黑条，每行前面带类型标签，自上而下写：
 *    时间 / 经度（度分秒）/ 纬度（度分秒）/ 地址（拿不到留空）/ 项目名称（未填时写“（未填）”）
 */
import { toDMS, formatTime } from './geo.js'

export const MAX_EDGE = 2400
export const JPEG_QUALITY = 0.92
export const DEFAULT_WATERMARK_TEXT = 'GSZD'
// 斜水印透明度默认值（v3.0.0：0.2，比原来的 0.26 更透；设置页滑块 0.1–0.6 可调）。
// 注意：字号仍是画布宽的 0.26（v2.1.6 定下的大小不动），只有透明度可调。
export const DEFAULT_WATERMARK_OPACITY = 0.2
export function clampWatermarkOpacity(v) {
  const n = Number(v)
  if (!Number.isFinite(n)) return DEFAULT_WATERMARK_OPACITY
  return Math.min(0.6, Math.max(0.1, n))
}

/**
 * 按目标宽高比对画面中心裁剪，返回源图上的裁剪矩形（纯函数，可单测）。
 * ratio 是宽/高（如 3:4 竖版 = 0.75，9:16 = 0.5625，1:1 = 1）。
 * @returns {{sx:number, sy:number, sw:number, sh:number}}
 */
export function centerCropRect(srcW, srcH, ratio) {
  let sw = srcW, sh = srcH
  if (sw / sh > ratio) sw = Math.round(sh * ratio)
  else sh = Math.round(sw / ratio)
  return { sx: Math.round((srcW - sw) / 2), sy: Math.round((srcH - sh) / 2), sw, sh }
}

/**
 * 在已画好画面的 canvas 上叠加水印。照片、视频帧、实时预览共用同一函数，
 * 保证所见即所得：预览里看到的水印，就是烧进文件里的水印。
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w 画布宽
 * @param {number} h 画布高
 * @param {{project:string, time:string, lon:number|null, lat:number|null, address:string, watermarkText?:string, opacity?:number}} meta
 *   opacity：斜水印透明度（0.1–0.6），不传用默认 0.2；字号固定是画布宽的 0.26。
 */
export function drawWatermark(ctx, w, h, meta) {
  // ---- 斜水印：居中，-30°，大号淡白 ----
  const wmText = (meta.watermarkText || '').trim() || DEFAULT_WATERMARK_TEXT
  const wmOpacity = clampWatermarkOpacity(meta.opacity)
  ctx.save()
  ctx.translate(w / 2, h / 2)
  ctx.rotate((-30 * Math.PI) / 180)
  const fontSize = Math.round(w * 0.26)
  ctx.font = `900 ${fontSize}px "Arial Black", Arial, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = `rgba(255,255,255,${wmOpacity})`
  ctx.fillText(wmText, 0, 0)
  ctx.restore()

  // ---- 底部信息条：每行带类型标签，顺序：时间 / 经度 / 纬度 / 地址 / 项目名称 ----
  const lines = []
  lines.push({ text: `时间：${meta.time || formatTime()}`, bold: false })
  if (meta.lon != null) lines.push({ text: `经度：${toDMS(meta.lon, false)}`, bold: false })
  if (meta.lat != null) lines.push({ text: `纬度：${toDMS(meta.lat, true)}`, bold: false })
  if (meta.address) lines.push({ text: `地址：${meta.address}`, bold: false })
  lines.push({ text: `项目名称：${meta.project || '（未填）'}`, bold: true })
  if (lines.length === 0) return

  const lineH = Math.max(28, Math.round(w * 0.032))
  const padY = Math.round(lineH * 0.55)
  const padX = Math.round(w * 0.03)
  const barH = lines.length * lineH + padY * 2
  ctx.save()
  ctx.fillStyle = 'rgba(0,0,0,0.55)'
  ctx.fillRect(0, h - barH, w, barH)
  ctx.fillStyle = '#ffffff'
  ctx.textAlign = 'left'
  ctx.textBaseline = 'middle'
  lines.forEach((line, i) => {
    ctx.font = `${line.bold ? '700' : '400'} ${Math.round(lineH * 0.72)}px Arial, "PingFang SC", "Microsoft YaHei", sans-serif`
    ctx.fillText(line.text, padX, h - barH + padY + lineH * i + lineH / 2, w - padX * 2)
  })
  ctx.restore()
}

/** 按视频画面等比绘制（cover 裁剪），再叠水印；视频录制每帧调用 */
export function drawVideoFrame(ctx, video, w, h, meta) {
  const vw = video.videoWidth, vh = video.videoHeight
  if (!vw || !vh) return false
  const scale = Math.max(w / vw, h / vh)
  const dw = vw * scale, dh = vh * scale
  ctx.drawImage(video, (w - dw) / 2, (h - dh) / 2, dw, dh)
  drawWatermark(ctx, w, h, meta)
  return true
}

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = (e) => reject(e || new Error('图片加载失败'))
    img.src = src
  })
}

/**
 * 把一张照片烧上水印，返回 JPEG Blob。
 * 最长边 >2400px 时等比缩小，导出 JPEG 0.92。
 * 传 ratio（宽/高，如 3:4 竖版 = 0.75）时先对画面中心裁剪到该比例再烧水印。
 * @param {string} src 图片 dataURL / blobURL / http(s) 地址
 * @param {object} meta 同 drawWatermark
 * @param {number} [ratio] 目标宽高比，不传则保持原图比例
 * @returns {Promise<{blob:Blob, dataUrl:string, rawDataUrl:string, width:number, height:number}>}
 *   rawDataUrl 是烧水印之前的无水印原图（已按 ratio 裁剪、已缩放），供详情页编辑文字时重烧用
 */
export async function burnPhotoWatermark(src, meta, ratio) {
  const img = await loadImage(src)
  let sx = 0, sy = 0, sw = img.naturalWidth, sh = img.naturalHeight
  if (ratio && ratio > 0) {
    const c = centerCropRect(sw, sh, ratio)
    sx = c.sx; sy = c.sy; sw = c.sw; sh = c.sh
  }
  let w = sw, h = sh
  const maxEdge = Math.max(w, h)
  if (maxEdge > MAX_EDGE) {
    const k = MAX_EDGE / maxEdge
    w = Math.round(w * k); h = Math.round(h * k)
  }
  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, w, h)
  // 烧水印之前的画面就是无水印原图：先留一份 rawDataUrl，供详情页 7 次点击编辑文字时重烧
  const rawDataUrl = canvas.toDataURL('image/jpeg', JPEG_QUALITY)
  drawWatermark(ctx, w, h, meta)
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY))
  if (!blob) throw new Error('水印导出失败')
  return { blob, dataUrl: canvas.toDataURL('image/jpeg', JPEG_QUALITY), rawDataUrl, width: w, height: h }
}
