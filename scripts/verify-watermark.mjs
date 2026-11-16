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
import { toDMS, wgs84ToGcj02, gcj02ToWgs84, formatTime, withTimeout, isPermissionDenied, saveLastFix, loadLastFix, getCachedAddress, saveCachedAddress, distMeters, getPosition } from '../src/utils/geo.js'
import { drawWatermark, centerCropRect } from '../src/utils/watermark.js'
import { pushBackOverlay, removeBackOverlay, popBackOverlay, backOverlayCount, clearBackOverlays } from '../src/utils/backstack.js'

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
check('项目名已写进水印', texts.includes('项目名称：庆阳生活水采样'))
check('时间已写进水印', texts.includes('时间：2026-11-15 17:30:00'))
check('经度 DMS 已写进水印', texts.some((t) => t === '经度：106°56′09″E'))
check('纬度 DMS 已写进水印', texts.some((t) => t === '纬度：36°03′21″N'))
check('地址已写进水印', texts.includes('地址：甘肃省庆阳市西峰区测试路 1 号'))
const barTexts = texts.slice(1) // 第 1 个是斜水印 GSZD，后面是信息条
check('信息条带类型标签、顺序为时间/经度/纬度/地址/项目名称', barTexts.length === 5 && barTexts[0].startsWith('时间：') && barTexts[1].startsWith('经度：') && barTexts[2].startsWith('纬度：') && barTexts[3].startsWith('地址：') && barTexts[4].startsWith('项目名称：'), `bar=${JSON.stringify(barTexts)}`)
// 自定义水印文字：设置里改了就用改后的；留空回落 GSZD
const ctx3 = mockCtx()
drawWatermark(ctx3, 1920, 1080, { ...meta, watermarkText: '中德检测' })
const texts3 = ctx3.calls.filter((c) => c[0] === 'fillText').map((c) => c[1])
check('自定义水印文字已绘制', texts3.includes('中德检测') && !texts3.includes('GSZD'))
const ctx4 = mockCtx()
drawWatermark(ctx4, 1920, 1080, { ...meta, watermarkText: '   ' })
const texts4 = ctx4.calls.filter((c) => c[0] === 'fillText').map((c) => c[1])
check('水印文字留空时回落 GSZD', texts4.includes('GSZD'))
const ctx2 = mockCtx()
drawWatermark(ctx2, 1920, 1080, { ...meta, address: '' })
const texts2 = ctx2.calls.filter((c) => c[0] === 'fillText').map((c) => c[1])
check('地址为空时不编造地址行', !texts2.some((t) => t.includes('测试路')) && texts2.length === 5, `共 ${texts2.length} 行`)

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

// ---------- 5. 竖屏中心裁剪 ----------
console.log('5) 竖屏中心裁剪 centerCropRect')
const c34 = centerCropRect(1920, 1080, 3 / 4)
check('横屏 1920×1080 裁 3:4 → 810×1080 居中', c34.sw === 810 && c34.sh === 1080 && c34.sx === 555 && c34.sy === 0, JSON.stringify(c34))
const c916 = centerCropRect(1920, 1080, 9 / 16)
check('横屏 1920×1080 裁 9:16 → 608×1080 居中', c916.sw === 608 && c916.sh === 1080 && c916.sx === 656 && c916.sy === 0, JSON.stringify(c916))
const c11 = centerCropRect(1080, 1920, 1)
check('竖屏 1080×1920 裁 1:1 → 1080×1080 居中', c11.sw === 1080 && c11.sh === 1080 && c11.sx === 0 && c11.sy === 420, JSON.stringify(c11))
const cFull = centerCropRect(1080, 1920, 9 / 16)
check('竖屏 1080×1920 裁 9:16 → 全幅不裁', cFull.sw === 1080 && cFull.sh === 1920 && cFull.sx === 0 && cFull.sy === 0, JSON.stringify(cFull))
check('裁剪框不超出原图', [c34, c916, c11, cFull].every((c) => c.sx >= 0 && c.sy >= 0))

// ---------- 6. GCJ-02 逆变换（Nominatim 前先把 GCJ-02 转回 WGS-84） ----------
console.log('6) GCJ-02 → WGS-84 逆变换')
const back = gcj02ToWgs84(gcj.lon, gcj.lat)
const dLon2 = (back.lon - 116.3974) * 111320 * Math.cos((39.9093 * Math.PI) / 180)
const dLat2 = (back.lat - 39.9093) * 110540
check('往返换算误差 < 2 米', Math.hypot(dLon2, dLat2) < 2, `误差约 ${Math.hypot(dLon2, dLat2).toFixed(2)} 米`)
const backOutside = gcj02ToWgs84(-73.9857, 40.7484)
check('境外坐标逆变换不变', backOutside.lon === -73.9857 && backOutside.lat === 40.7484)

// ---------- 7. 定位超时兜底（手动超时 + 上次定位 + 地址缓存） ----------
// 原生端 Capacitor 的 getCurrentPosition 不保证执行 timeout，室内等不到 GPS 会永远挂起；
// 每一级定位/地址查询都必须包手动超时，绝不无限等。
console.log('7) 定位超时兜底 withTimeout / 上次定位 / 地址缓存')
{
  const t0 = Date.now()
  const v = await withTimeout(Promise.resolve(42), 1000, '快')
  check('withTimeout 快速 promise 原值返回', v === 42)
  let timedOut = false
  let codeOk = false
  try {
    await withTimeout(new Promise(() => {}), 50, '永不结束')
  } catch (e) {
    timedOut = true
    codeOk = e && e.code === 'TIMEOUT'
  }
  const elapsed = Date.now() - t0
  check('withTimeout 永不结束的 promise 会超时拒绝（code=TIMEOUT）', timedOut && codeOk, `elapsed=${elapsed}ms`)
  check('withTimeout 超时在合理时间内（< 2 秒）', elapsed < 2000, `elapsed=${elapsed}ms`)
  // getPosition 在 Node 里没有定位能力，应快速拒绝而不是无限挂起
  const g0 = Date.now()
  let threw = false
  try {
    await getPosition()
  } catch { threw = true }
  const gElapsed = Date.now() - g0
  check('getPosition 无定位环境时快速失败不挂起', threw && gElapsed < 8000, `elapsed=${gElapsed}ms`)
  // 上次定位 / 地址缓存的读写在无 localStorage 时不抛错
  check('无 localStorage 时 loadLastFix 返回 null 不抛错', loadLastFix() === null)
  check('无 localStorage 时 getCachedAddress 返回空串不抛错', getCachedAddress(106.9359, 36.0559) === '')
  check('saveLastFix / saveCachedAddress 在无 localStorage 时不抛错', (() => { saveLastFix({ lon: 106.9, lat: 36.0 }); saveCachedAddress(106.9, 36.0, '测试地址'); return true })())
  check('isPermissionDenied 识别拒绝错误', isPermissionDenied(new Error('定位权限被拒绝')) && isPermissionDenied({ code: 1 }) && !isPermissionDenied(new Error('定位超时')))
  check('distMeters 同点为 0、1 度纬度约 111 公里', distMeters(106.9, 36.0, 106.9, 36.0) === 0 && distMeters(106.9, 36.0, 106.9, 37.0) > 100000 && distMeters(106.9, 36.0, 106.9, 37.0) < 120000)
}

// ---------- 8. 返回键弹层栈（LIFO：后打开的先关） ----------
// 安卓返回键 bug（真机 2.1.1）：弹层关不掉、主页面也退不出。backstack 是纯 JS，Node 里直接测顺序。
console.log('8) 返回键弹层栈 backstack（后打开先关）')
{
  clearBackOverlays()
  check('空栈 pop 返回 false', popBackOverlay() === false && backOverlayCount() === 0)
  const closed = []
  pushBackOverlay('a', () => closed.push('a'))
  pushBackOverlay('b', () => closed.push('b'))
  pushBackOverlay('c', () => closed.push('c'))
  check('push 三个后栈深为 3', backOverlayCount() === 3)
  check('pop 先关最后打开的 c', popBackOverlay() === true && closed.join(',') === 'c' && backOverlayCount() === 2)
  removeBackOverlay('a')
  check('remove 能按 id 注销中间层', backOverlayCount() === 1)
  check('pop 关掉剩下的 b', popBackOverlay() === true && closed.join(',') === 'c,b')
  check('栈空后 pop 返回 false', popBackOverlay() === false)
  pushBackOverlay('x', () => closed.push('x1'))
  pushBackOverlay('x', () => closed.push('x2'))
  check('同 id 重复 push 只保留最新一条', backOverlayCount() === 1)
  popBackOverlay()
  check('重复 push 后关掉的是最新注册的', closed[closed.length - 1] === 'x2')
  pushBackOverlay('boom', () => { throw new Error('boom') })
  check('close 里抛错时 pop 仍返回 true、不抛错', popBackOverlay() === true)
  clearBackOverlays()
  check('clear 清空栈', backOverlayCount() === 0)
}

console.log(`\n结果：${pass} 通过，${fail} 失败`)
if (fail) process.exit(1)
