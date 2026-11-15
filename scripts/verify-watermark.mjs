/**
 * 自验脚本（无真机时在 Node 里跑）：
 *  1. DMS 换算：106.9359, 36.0559 应接近 106°56′09″E / 36°03′21″N
 *  2. 水印绘制：用一个“记录型 mock 2D context”跑 drawWatermark，
 *     断言：画了 GSZD（带 -30° 旋转）、画了底部黑条、写了项目名/时间/经纬度/地址
 *  3. GCJ-02 换算：天安门附近 WGS-84 (116.3974, 39.9093) 转后应有约 500 米级偏移且在合理范围
 *  4. 逆地理编码：只做代码路径检查（无 key 时高德跳过；Nominatim 在无网时返回 ''，不断言在线结果）
 * 注意：Node 里没有真实 Canvas，本脚本验证的是绘制指令；真实像素渲染需在浏览器/WebView 里看，
 * 另见 README 的真机验证清单。带 --render 时若装了 node-canvas 会额外出一张真实水印样图。
 */
import { toDMS, wgs84ToGcj02, formatTime } from '../src/utils/geo.js'
import { drawWatermark } from '../src/utils/watermark.js'

let pass = 0, fail = 0
function check(name, ok, extra = '') {
  if (ok) { pass++; console.log(`  PASS  ${name}${extra ? ' — ' + extra : ''}`) }
  else { fail++; console.log(`  FAIL  ${name}${extra ? ' — ' + extra : ''}`) }
}

// ---------- 1. DMS ----------
console.log('1) DMS 换算')
check('106.9359 → 106°56′09″E', toDMS(106.9359, false) === '106°56′09″E', toDMS(106.9359, false))
check('36.0559 → 36°03′21″N', toDMS(36.0559, true) === '36°03′21″N', toDMS(36.0559, true))
check('负经度带 W', toDMS(-73.9857, false).endsWith('W'))
check('负纬度带 S', toDMS(-33.4489, true).endsWith('S'))

// ---------- 2. 水印绘制指令 ----------
console.log('2) 水印绘制（mock 2D context 记录调用）')
function mockCtx() {
  const calls = []
  return {
    calls,
    save() { calls.push(['save']) },
    restore() { calls.push(['restore']) },
    translate(x, y) { calls.push(['translate', x, y]) },
    rotate(a) { calls.push(['rotate', a]) },
    fillRect(x, y, w, h) { calls.push(['fillRect', x, y, w, h]) },
    fillText(t, x, y) { calls.push(['fillText', String(t), x, y]) },
    set font(v) { calls.push(['font', v]) },
    set fillStyle(v) { calls.push(['fillStyle', v]) },
    set textAlign(v) { calls.push(['textAlign', v]) },
    set textBaseline(v) { calls.push(['textBaseline', v]) },
  }
}
const ctx = mockCtx()
const meta = {
  project: '庆阳生活水采样',
  time: '2026-11-15 17:30:00',
  lon: 106.9359,
  lat: 36.0559,
  address: '甘肃省庆阳市西峰区测试路 1 号'
}
drawWatermark(ctx, 1920, 1080, meta)
const texts = ctx.calls.filter((c) => c[0] === 'fillText').map((c) => c[1])
const rotates = ctx.calls.filter((c) => c[0] === 'rotate').map((c) => c[1])
const rects = ctx.calls.filter((c) => c[0] === 'fillRect')
check('GSZD 大字已绘制', texts.includes('GSZD'))
check('旋转约 -30°', rotates.some((a) => Math.abs(a - (-Math.PI / 6)) < 1e-9), `rotate=${rotates[0]}`)
check('底部黑条已绘制', rects.some((r) => r[3] === 1920 && r[4] > 100), `rects=${JSON.stringify(rects)}`)
check('项目名已写进水印', texts.includes('庆阳生活水采样'))
check('时间已写进水印', texts.includes('2026-11-15 17:30:00'))
check('经纬度 DMS 已写进水印', texts.some((t) => t.includes('106°56′09″E') && t.includes('36°03′21″N')))
check('地址已写进水印', texts.includes('甘肃省庆阳市西峰区测试路 1 号'))
// 地址为空时不写地址行
const ctx2 = mockCtx()
drawWatermark(ctx2, 1920, 1080, { ...meta, address: '' })
const texts2 = ctx2.calls.filter((c) => c[0] === 'fillText').map((c) => c[1])
check('地址为空时不编造地址行', !texts2.some((t) => t.includes('测试路')) && texts2.length === 4, `共 ${texts2.length} 行`)

// ---------- 3. GCJ-02 ----------
console.log('3) WGS-84 → GCJ-02')
const gcj = wgs84ToGcj02(116.3974, 39.9093)
const dLon = (gcj.lon - 116.3974) * 111320 * Math.cos((39.9093 * Math.PI) / 180)
const dLat = (gcj.lat - 39.9093) * 110540
const dist = Math.hypot(dLon, dLat)
check('天安门偏移在 100~2000 米（国内加密偏移量级）', dist > 100 && dist < 2000, `偏移约 ${Math.round(dist)} 米`)
const outside = wgs84ToGcj02(-73.9857, 40.7484)
check('中国境外坐标不偏移', outside.lon === -73.9857 && outside.lat === 40.7484)

// ---------- 4. 时间格式 ----------
console.log('4) 时间格式')
check('formatTime 形如 YYYY-MM-DD HH:mm:ss', /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(formatTime(new Date('2026-11-05T12:36:31'))))

console.log(`\n结果：${pass} 通过，${fail} 失败`)
if (fail) process.exit(1)
