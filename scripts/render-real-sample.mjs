/**
 * 用一张真实采样现场照片做底图，调真正的 drawWatermark() 烧水印，
 * 输出 scripts/sample-field-photo.jpg（给用户看效果的样张，时间/地址为示例数据）。
 */
import { createCanvas, loadImage } from 'canvas'
import fs from 'node:fs'
import { drawWatermark } from '../src/utils/watermark.js'

const img = await loadImage('/tmp/base-field.jpg')
const W = 1920, H = 1080
const canvas = createCanvas(W, H)
const ctx = canvas.getContext('2d')

// 等比铺满 1920x1080（多余裁掉，和手机拍照取景一致）
const s = Math.max(W / img.width, H / img.height)
const dw = img.width * s, dh = img.height * s
ctx.drawImage(img, (W - dw) / 2, (H - dh) / 2, dw, dh)

const parts = new Intl.DateTimeFormat('en-GB', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
}).formatToParts(new Date())
const get = (t) => parts.find((p) => p.type === t).value
const time = `${get('year')}-${get('month')}-${get('day')} ${get('hour')}:${get('minute')}:${get('second')}`

const meta = {
  project: '庆阳生活水采样',
  time,
  lon: 106.9359,
  lat: 36.0559,
  address: '甘肃省庆阳市西峰区测试路 1 号'
}
drawWatermark(ctx, W, H, meta)

const out = '/home/hatch/workspace/field-watermark-app/scripts/sample-field-photo.jpg'
fs.writeFileSync(out, canvas.toBuffer('image/jpeg', { quality: 0.92 }))
console.log('写出:', out, '时间:', time)
