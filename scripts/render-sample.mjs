/**
 * 真实像素渲染验证（需要 node-canvas，仅开发机自验用）：
 * 用 node-canvas 画一张模拟现场照片，调真正的 drawWatermark() 烧水印，
 * 输出 scripts/sample-watermarked.jpg，并做像素级断言：
 *  - 底部黑条区域明显变暗
 *  - 画面中央 GSZD 区域出现亮色像素（白字）
 */
import { createCanvas } from 'canvas'
import fs from 'node:fs'
import { drawWatermark } from '../src/utils/watermark.js'

const W = 1920, H = 1080
const canvas = createCanvas(W, H)
const ctx = canvas.getContext('2d')

// 模拟现场：蓝天草地 + 一个深色采样点
const sky = ctx.createLinearGradient(0, 0, 0, H)
sky.addColorStop(0, '#7ec8f7')
sky.addColorStop(0.6, '#cfeefb')
sky.addColorStop(0.6, '#4f9e4d')
sky.addColorStop(1, '#2f7a33')
ctx.fillStyle = sky
ctx.fillRect(0, 0, W, H)
ctx.fillStyle = '#5b4636'
ctx.fillRect(200, 700, 500, 380) // 采样设备
ctx.fillStyle = '#eeeeee'
ctx.beginPath()
ctx.arc(1500, 300, 90, 0, Math.PI * 2)
ctx.fill() // 太阳

const meta = {
  project: '庆阳生活水采样',
  time: '2026-11-15 17:30:00',
  lon: 106.9359,
  lat: 36.0559,
  address: '甘肃省庆阳市西峰区测试路 1 号'
}
drawWatermark(ctx, W, H, meta)

const out = '/home/hatch/workspace/field-watermark-app/scripts/sample-watermarked.jpg'
fs.writeFileSync(out, canvas.toBuffer('image/jpeg', { quality: 0.92 }))

// 像素断言
const img = ctx.getImageData(0, 0, W, H).data
const px = (x, y) => {
  const i = (y * W + x) * 4
  return [img[i], img[i + 1], img[i + 2]]
}
const lum = ([r, g, b]) => 0.2126 * r + 0.7152 * g + 0.0722 * b
// 底部黑条中部应明显偏暗（原图草地亮度 ~120+，黑条 0.55 透明度应压到 ~70 以下）
const barLum = lum(px(960, H - 60))
console.log('底部黑条亮度:', Math.round(barLum))
// 中央区域找最亮像素（GSZD 白字应接近 255）
let maxLum = 0
for (let y = 380; y < 700; y += 4) {
  for (let x = 600; x < 1320; x += 4) {
    maxLum = Math.max(maxLum, lum(px(x, y)))
  }
}
console.log('中央区域最亮像素:', Math.round(maxLum))
let fail = 0
if (!(barLum < 90)) { console.log('FAIL: 底部黑条不够暗'); fail++ }
if (!(maxLum > 200)) { console.log('FAIL: 中央未见 GSZD 亮字'); fail++ }
console.log(fail ? 'RENDER FAIL' : 'RENDER PASS — 样图已写入 scripts/sample-watermarked.jpg')
process.exit(fail ? 1 : 0)
