/**
 * 水印烧录：把 GSZD 斜水印 + 底部信息条真烧进图片/视频帧像素里，不是只显示一层。
 * 版式（已确认）：
 *  - GSZD：大号半透明白色，约 -30°，居中斜压在画面中间
 *  - 底部：半透明黑条，自上而下写：项目名称 / 时间 / 经纬度（度分秒）/ 地址（拿不到留空）
 */
import { toDMS, formatTime } from './geo.js'

export const MAX_EDGE = 2400
export const JPEG_QUALITY = 0.92

/**
 * 在已画好画面的 canvas 上叠加水印。照片、视频帧、实时预览共用同一函数，
 * 保证所见即所得：预览里看到的水印，就是烧进文件里的水印。
 * @param {CanvasRenderingContext2D} ctx
 * @param {number} w 画布宽
 * @param {number} h 画布高
 * @param {{project:string, time:string, lon:number|null, lat:number|null, address:string}} meta
 */
export function drawWatermark(ctx, w, h, meta) {
  // ---- GSZD 大号斜水印：居中，-30°，半透明白色 ----
  ctx.save()
  ctx.translate(w / 2, h / 2)
  ctx.rotate((-30 * Math.PI) / 180)
  const fontSize = Math.round(w * 0.16)
  ctx.font = `900 ${fontSize}px "Arial Black", Arial, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  ctx.fillStyle = 'rgba(255,255,255,0.55)'
  ctx.fillText('GSZD', 0, 0)
  ctx.restore()

  // ---- 底部信息条 ----
  const lines = []
  if (meta.project) lines.push(meta.project)
  lines.push(meta.time || formatTime())
  if (meta.lon != null && meta.lat != null) {
    lines.push(`${toDMS(meta.lon, false)}  ${toDMS(meta.lat, true)}`)
  }
  if (meta.address) lines.push(meta.address)
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
    ctx.font = `${i === 0 ? '700' : '400'} ${Math.round(lineH * 0.72)}px Arial, "PingFang SC", "Microsoft YaHei", sans-serif`
    ctx.fillText(line, padX, h - barH + padY + lineH * i + lineH / 2, w - padX * 2)
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
 * @param {string} src 图片 dataURL / blobURL / http(s) 地址
 * @param {object} meta 同 drawWatermark
 * @returns {Promise<{blob:Blob, dataUrl:string, width:number, height:number}>}
 */
export async function burnPhotoWatermark(src, meta) {
  const img = await loadImage(src)
  let w = img.naturalWidth, h = img.naturalHeight
  const maxEdge = Math.max(w, h)
  if (maxEdge > MAX_EDGE) {
    const k = MAX_EDGE / maxEdge
    w = Math.round(w * k); h = Math.round(h * k)
  }
  const canvas = document.createElement('canvas')
  canvas.width = w; canvas.height = h
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0, w, h)
  drawWatermark(ctx, w, h, meta)
  const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY))
  if (!blob) throw new Error('水印导出失败')
  return { blob, dataUrl: canvas.toDataURL('image/jpeg', JPEG_QUALITY), width: w, height: h }
}
