/**
 * 定位 / 坐标换算 / 逆地理编码
 * 规则：地址只能来自逆地理编码服务返回的结果，拿不到就留空，绝不凭坐标编造。
 * WGS-84（GPS 原始）→ GCJ-02（国内地图坐标系）→ 再调逆地理编码。
 */

// ---- WGS-84 → GCJ-02（国家测绘局加密算法，公开实现） ----
const PI = Math.PI
const A = 6378245.0
const EE = 0.00669342162296594323

function outOfChina(lon, lat) {
  return lon < 72.004 || lon > 137.8347 || lat < 0.8293 || lat > 55.8271
}
function transformLat(lon, lat) {
  let ret = -100.0 + 2.0 * lon + 3.0 * lat + 0.2 * lat * lat + 0.1 * lon * lat + 0.2 * Math.sqrt(Math.abs(lon))
  ret += (20.0 * Math.sin(6.0 * lon * PI) + 20.0 * Math.sin(2.0 * lon * PI)) * 2.0 / 3.0
  ret += (20.0 * Math.sin(lat * PI) + 40.0 * Math.sin(lat / 3.0 * PI)) * 2.0 / 3.0
  ret += (160.0 * Math.sin(lat / 12.0 * PI) + 320 * Math.sin(lat * PI / 30.0)) * 2.0 / 3.0
  return ret
}
function transformLng(lon, lat) {
  let ret = 300.0 + lon + 2.0 * lat + 0.1 * lon * lon + 0.1 * lon * lat + 0.1 * Math.sqrt(Math.abs(lon))
  ret += (20.0 * Math.sin(6.0 * lon * PI) + 20.0 * Math.sin(2.0 * lon * PI)) * 2.0 / 3.0
  ret += (20.0 * Math.sin(lon * PI) + 40.0 * Math.sin(lon / 3.0 * PI)) * 2.0 / 3.0
  ret += (150.0 * Math.sin(lon / 12.0 * PI) + 300.0 * Math.sin(lon / 30.0 * PI)) * 2.0 / 3.0
  return ret
}

/** @returns {{lon:number, lat:number}} GCJ-02 坐标 */
export function wgs84ToGcj02(lon, lat) {
  if (outOfChina(lon, lat)) return { lon, lat }
  const dLat = transformLat(lon - 105.0, lat - 35.0)
  const dLon = transformLng(lon - 105.0, lat - 35.0)
  const radLat = (lat / 180.0) * PI
  let magic = Math.sin(radLat)
  magic = 1 - EE * magic * magic
  const sqrtMagic = Math.sqrt(magic)
  const adjLat = (dLat * 180.0) / ((A * (1 - EE)) / (magic * sqrtMagic) * PI)
  const adjLon = (dLon * 180.0) / ((A / sqrtMagic) * Math.cos(radLat) * PI)
  return { lon: lon + adjLon, lat: lat + adjLat }
}

/** GCJ-02 → WGS-84（逆变换，两次迭代逼近，往返误差 < 1 米；中国境外直接返回原值） */
export function gcj02ToWgs84(lon, lat) {
  if (outOfChina(lon, lat)) return { lon, lat }
  // 迭代逼近：从目标点出发猜一个 WGS 点，正向加密后与目标比，差多少就反向修正猜测；
  // 2 轮后残差在厘米级。注意不能用“最后一次残差”直接减目标点，那会把结果还原回输入。
  let wLon = lon, wLat = lat
  for (let i = 0; i < 2; i++) {
    const g = wgs84ToGcj02(wLon, wLat)
    wLon -= g.lon - lon
    wLat -= g.lat - lat
  }
  return { lon: wLon, lat: wLat }
}

// ---- 度分秒 ----
// 106.9359 → 106°56′09″E ；36.0559 → 36°03′21″N
export function toDMS(value, isLat) {
  const dir = isLat ? (value >= 0 ? 'N' : 'S') : (value >= 0 ? 'E' : 'W')
  const abs = Math.abs(value)
  const deg = Math.floor(abs)
  const minFloat = (abs - deg) * 60
  const min = Math.floor(minFloat)
  let sec = Math.round((minFloat - min) * 60)
  let m = min, d = deg
  if (sec === 60) { sec = 0; m += 1 }
  if (m === 60) { m = 0; d += 1 }
  const pad = (n) => String(n).padStart(2, '0')
  return `${d}°${pad(m)}′${pad(sec)}″${dir}`
}

// ---- 时间 ----
export function formatTime(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ${p(date.getHours())}:${p(date.getMinutes())}:${p(date.getSeconds())}`
}

// 详情页 7 次点击编辑文字时的时间输入归一化：接受 datetime-local 的
// "YYYY-MM-DDTHH:mm:ss"（或缺秒的 "YYYY-MM-DDTHH:mm"）和已有的 "YYYY-MM-DD HH:mm:ss"，
// 返回标准 "YYYY-MM-DD HH:mm:ss"；格式不对（或日期不存在，如 2026-02-30）返回 ''。
export function normalizeTimeText(s) {
  const m = String(s || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})(?::(\d{2}))?$/)
  if (!m) return ''
  const [, y, mo, d, h, mi, sec] = m
  const dt = new Date(+y, +mo - 1, +d, +h, +mi, +(sec || '00'))
  if (dt.getFullYear() !== +y || dt.getMonth() !== +mo - 1 || dt.getDate() !== +d ||
      dt.getHours() !== +h || dt.getMinutes() !== +mi || dt.getSeconds() !== +(sec || '00')) return ''
  return formatTime(dt)
}

// ---- 定位（v3.0.0：只走浏览器 navigator.geolocation，不再用 @capacitor/geolocation——
// 后者安卓走 Google Play 服务定位（FusedLocationProvider），会把 play-services-location
// 打进安装包，手机提示启用谷歌框架；浏览器定位不依赖谷歌框架，国内安卓同样能用）：
// 高精度 → 普通精度（Wi-Fi/基站）→ 缓存位置，三级兜底，不只试一次就放弃。
// 关键：navigator.geolocation 的 timeout 在部分 WebView 上不保证执行，
// 室内等不到 GPS 时会挂起；所以每一级都包一层手动超时（Promise.race），绝不无限等。

// 通用超时包装：promise 在 ms 内没结果就拒绝（code 为 'TIMEOUT'）。
// 超时后底层请求若稍后才成功，其结果会被丢弃（调用方负责关掉多余的流/监听）。
export function withTimeout(promise, ms, label) {
  let timer = null
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const err = new Error((label || '操作') + '超时')
      err.code = 'TIMEOUT'
      reject(err)
    }, ms)
  })
  return Promise.race([promise, timeout]).finally(() => { if (timer) clearTimeout(timer) })
}

export function isPermissionDenied(e) {
  if (!e) return false
  if (e.code === 'LOC_DENIED' || e.code === 1) return true
  const msg = String((e && e.message) || e)
  return /denied|permission|权限被拒绝|PERMISSION_DENIED/i.test(msg)
}

// 上次定位（localStorage）：全部尝试都失败时兜底用，界面会明确标“上次位置”。
const LAST_FIX_KEY = 'fw_last_loc'
export function saveLastFix(pos) {
  try {
    if (pos && pos.lon != null && pos.lat != null) {
      localStorage.setItem(LAST_FIX_KEY, JSON.stringify({ lon: pos.lon, lat: pos.lat, accuracy: pos.accuracy || null, at: Date.now() }))
    }
  } catch { /* ignore */ }
}
export function loadLastFix() {
  try {
    const raw = localStorage.getItem(LAST_FIX_KEY)
    if (!raw) return null
    const f = JSON.parse(raw)
    if (!f || f.lon == null || f.lat == null) return null
    return f
  } catch { return null }
}

// 两点间距离（米，Haversine 公式）
export function distMeters(lon1, lat1, lon2, lat2) {
  const R = 6371000
  const dLat = ((lat2 - lat1) * Math.PI) / 180
  const dLon = ((lon2 - lon1) * Math.PI) / 180
  const a = Math.sin(dLat / 2) ** 2 + Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLon / 2) ** 2
  return 2 * R * Math.asin(Math.sqrt(a))
}

// 地址缓存（localStorage）：同一地点 500 米内的上次地址先显示，新的回来再替换。
const LAST_ADDR_KEY = 'fw_last_addr'
export function getCachedAddress(gcjLon, gcjLat) {
  try {
    const raw = localStorage.getItem(LAST_ADDR_KEY)
    if (!raw) return ''
    const c = JSON.parse(raw)
    if (!c || !c.address || c.lon == null || c.lat == null) return ''
    return distMeters(gcjLon, gcjLat, c.lon, c.lat) <= 500 ? c.address : ''
  } catch { return '' }
}
export function saveCachedAddress(gcjLon, gcjLat, address) {
  try {
    if (!address) return
    localStorage.setItem(LAST_ADDR_KEY, JSON.stringify({ lon: gcjLon, lat: gcjLat, address, at: Date.now() }))
  } catch { /* ignore */ }
}

// 显式看一眼定位权限状态（v3.0.0：不再调 Capacitor 的 requestPermissions）：
//  - 已拒绝 → 直接报 LOC_DENIED（不再往下试，也不再弹框）；
//  - 未决定 → 返回，让接下来的 getCurrentPosition 触发 WebView 首次调用时的系统弹框；
//  - Permissions API 不可用（部分 WebView）→ 直接返回，同样交给 getCurrentPosition 弹框。
// 注意：这里只“看”不“要”，真正的系统弹框发生在第一次 getCurrentPosition 调用时。
export async function ensureLocationPermission() {
  try {
    if (typeof navigator !== 'undefined' && navigator.permissions && typeof navigator.permissions.query === 'function') {
      const st = await navigator.permissions.query({ name: 'geolocation' })
      if (st && st.state === 'denied') {
        const err = new Error('定位权限被拒绝')
        err.code = 'LOC_DENIED'
        throw err
      }
    }
  } catch (e) {
    if (e && e.code === 'LOC_DENIED') throw e
    // Permissions API 不可用/不支持该名称：忽略，交给 getCurrentPosition 时的系统弹框
  }
}

function browserPosition(opts) {
  if (typeof navigator === 'undefined' || !navigator.geolocation) throw new Error('当前环境不支持定位')
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lon: pos.coords.longitude, lat: pos.coords.latitude, accuracy: pos.coords.accuracy, source: 'browser' }),
      (err) => reject(err),
      opts
    )
  })
}
// 单级定位：浏览器 API + 手动超时（WebView 上 timeout 不保证执行，绝不无限等）。
async function tryPosition(opts, ms) {
  return await withTimeout(browserPosition(opts), ms, '定位')
}

export async function getPosition(onRefine) {
  // 权限被拒直接抛 LOC_DENIED（不再试，也不用缓存兜底——用户明确拒绝了定位）
  await ensureLocationPermission()
  // 两路并行：低精度（网络定位，通常 1–3 秒就有粗位置）+ 高精度 GPS（室内可能很久才定）；
  // 谁先回来先用谁，不让用户先对着“正在定位…”等十几秒；
  // 后到的那一路如果精度更好，用 onRefine 回调精修（调用方更新界面/地址）。
  const lowP = tryPosition({ enableHighAccuracy: false, timeout: 8000, maximumAge: 60000 }, 8000)
  const highP = tryPosition({ enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }, 20000)
  const first = await Promise.race([
    lowP.then((pos) => ({ ok: true, pos })),
    highP.then((pos) => ({ ok: true, pos })),
    Promise.allSettled([lowP, highP]).then((rs) => {
      const rej = rs.find((r) => r.status === 'rejected')
      return { ok: false, err: rej ? rej.reason : new Error('定位失败') }
    })
  ])
  if (!first.ok) {
    // 两路都失败：用上次定位兜底（带 stale 标记，界面会标“上次位置”），再没有才报错
    const stale = loadLastFix()
    if (stale) return { lon: stale.lon, lat: stale.lat, accuracy: stale.accuracy, source: 'cached', stale: true }
    throw first.err || new Error('定位失败')
  }
  let best = first.pos
  saveLastFix(best)
  // 后到的那一路如果精度更好，回调精修；精度没更好就不打扰调用方。
  const maybeRefine = (p) => {
    if (!p || p.accuracy == null) return
    if (best.accuracy != null && p.accuracy >= best.accuracy) return
    best = p
    saveLastFix(p)
    if (typeof onRefine === 'function') { try { onRefine(p) } catch { /* ignore */ } }
  }
  lowP.then(maybeRefine).catch(() => {})
  highP.then(maybeRefine).catch(() => {})
  return { ...best, stale: false }
}

// 后台持续监听：GPS 热起来后自动补上经纬度/地址。返回停止函数。
// 只走浏览器 watchPosition（v3.0.0 起不再用 Capacitor watchPosition，不依赖谷歌框架）。
export function watchPosition(onUpdate, onError) {
  const opts = { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
  let stopped = false
  let watchId = null
  if (typeof navigator === 'undefined' || !navigator.geolocation) {
    if (typeof onError === 'function') {
      try { onError(new Error('当前环境不支持定位')) } catch { /* ignore */ }
    }
    return () => {}
  }
  watchId = navigator.geolocation.watchPosition(
    (pos) => {
      if (stopped) return
      try { onUpdate({ lon: pos.coords.longitude, lat: pos.coords.latitude, accuracy: pos.coords.accuracy, source: 'browser' }) } catch { /* 回调异常不中断监听 */ }
    },
    (err) => { if (!stopped && onError) onError(err) },
    opts
  )
  return () => {
    stopped = true
    if (watchId != null && navigator.geolocation) navigator.geolocation.clearWatch(watchId)
  }
}

// ---- 地址短格式（2026-11-16 用户要求）：5 级——省 + 市 + 区县 + 下一级（街道/镇）
// + 再详细一级（道路/小区/派出所/社区），不拼门牌号等长串。超过 5 段只留前 5 段。
export function shortenAddressFromParts(parts) {
  const seen = new Set()
  const out = []
  for (const p of parts) {
    const s = String(p || '').trim()
    if (!s || s === '中国' || s === '中华人民共和国') continue
    if (seen.has(s)) continue
    seen.add(s)
    out.push(s)
    if (out.length >= 5) break
  }
  return out.join('')
}

// 高德 regeocode → 5 级短地址；第 5 级是道路名（不带门牌号），有小区/建筑名就接着拼上，
// 街道和地点都没有时用最近的 POI（常是派出所/小区）兜底。
export function formatAmapAddress(regeocode, pois = []) {
  const ac = (regeocode && regeocode.addressComponent) || {}
  const township = (ac.township || '').replace(/办事处$/, '')
  const street = ac.street || ''
  const place = (ac.building && ac.building.name) || (ac.neighborhood && ac.neighborhood.name) || ''
  let detail = ''
  if (street && place && place !== street) detail = street + place
  else detail = street || place
  if (!detail && pois && pois.length) detail = (pois[0] && pois[0].name) || ''
  const short = shortenAddressFromParts([ac.province, ac.city, ac.district, township, detail])
  return short || (regeocode && regeocode.formatted_address) || ''
}

// Nominatim address 对象（addressdetails=1）→ 5 级短地址；无结构化字段时把 display_name
//（由细到粗的逗号串）倒过来取前 5 段，同样是省 + 市 + 区县 + 下一级 + 再详细一级。
export function formatNominatimAddress(j) {
  const a = (j && j.address) || {}
  if (a && (a.state || a.city || a.county)) {
    const city = a.city || a.town || a.municipality || ''
    const county = a.county || a.state_district || ''
    const district = a.city_district || a.district || a.suburb || ''
    const road = a.road || a.pedestrian || ''
    const place = a.neighbourhood || a.amenity || a.building || a.village || a.hamlet || ''
    const detail = road && place && place !== road ? road + place : (road || place)
    return shortenAddressFromParts([a.state, city, county, district, detail])
  }
  if (j && j.display_name) {
    const parts = j.display_name.split(',').map((s) => s.trim()).reverse()
    return shortenAddressFromParts(parts)
  }
  return ''
}
// 高德 Key（v3.0.0 起内置）：用户提供的 Web 服务 Key，写在 geo 模块这一个配置处，
// 不写进 README 或任何文档。之前在设置里自填过 Key 的用户，填过的仍优先用。
const EMBEDDED_AMAP_KEY = 'e80e0ddc2ad2bd51a19f2d0132983391'
export function getAmapKey() {
  try { return localStorage.getItem('fw_amap_key') || EMBEDDED_AMAP_KEY } catch { return EMBEDDED_AMAP_KEY }
}
export function setAmapKey(key) {
  try { localStorage.setItem('fw_amap_key', (key || '').trim()) } catch { /* ignore */ }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

// 带重试的 JSON 拉取：每次请求单独超时；失败后按退避等待再试；
// 预算（deadline）由调用方给，超过预算不再发起新请求。
// 国内网络很慢时（用户实测只有几十 B/s），一次 8 秒经常不够，必须重试——
// 之前每路只试一次、总预算 12 秒，Nominatim 从国内经常不通，地址就一直拿不到。
async function fetchJsonWithRetry(url, { timeoutMs = 15000, attempts = 3, backoffMs = 1000, deadline = 0 } = {}) {
  let lastErr = null
  for (let i = 0; i < attempts; i++) {
    if (deadline && Date.now() >= deadline) break
    const remain = deadline ? deadline - Date.now() : timeoutMs
    if (remain <= 0) break
    try {
      const ctrl = new AbortController()
      const t = setTimeout(() => ctrl.abort(), Math.min(timeoutMs, remain))
      try {
        const r = await fetch(url, { signal: ctrl.signal })
        if (!r.ok) throw new Error('http ' + r.status)
        return await r.json()
      } finally { clearTimeout(t) }
    } catch (e) {
      lastErr = e
      if (i < attempts - 1) {
        const wait = Math.min(backoffMs * (i + 1), deadline ? Math.max(0, deadline - Date.now()) : backoffMs * (i + 1))
        if (wait > 0) await sleep(wait)
      }
    }
  }
  throw lastErr || new Error('fetch 失败')
}

/**
 * @param {number} gcjLon GCJ-02 经度
 * @param {number} gcjLat GCJ-02 纬度
 * @param {object} [opts] 可注入的预算（测试用小值；默认总预算 45 秒）
 * @returns {Promise<string>} 地址文本，拿不到返回 ''
 */
export async function reverseGeocode(gcjLon, gcjLat, opts = {}) {
  const budgetMs = opts.budgetMs || 45000
  const deadline = Date.now() + budgetMs
  // 1) 高德（需自填 Key，否则跳过；填了 Key 一定先走这路，国内最可靠）
  const amapKey = getAmapKey()
  if (amapKey) {
    try {
      const j = await fetchJsonWithRetry(
        `https://restapi.amap.com/v3/geocode/regeo?key=${encodeURIComponent(amapKey)}&location=${gcjLon},${gcjLat}&extensions=base&output=json`,
        { timeoutMs: opts.amapTimeoutMs || 10000, attempts: opts.amapAttempts || 2, backoffMs: 1000, deadline }
      )
      if (j && j.status === '1' && j.regeocode) {
        const short = formatAmapAddress(j.regeocode, j.regeocode.pois || [])
        if (short) return short
      }
    } catch { /* 掉到下一个源 */ }
  }
  // 2) Nominatim（OpenStreetMap，无需 Key；入参用 WGS-84，先把 GCJ-02 转回去再调，
  //    否则国内会有约几百米偏移；从国内访问经常很慢/不通，所以多试几次、每次放宽到 15 秒）
  try {
    const wgs = gcj02ToWgs84(gcjLon, gcjLat)
    const j = await fetchJsonWithRetry(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${wgs.lat}&lon=${wgs.lon}&accept-language=zh-CN&zoom=18&addressdetails=1`,
      { timeoutMs: opts.nominatimTimeoutMs || 15000, attempts: opts.nominatimAttempts || 3, backoffMs: 1500, deadline }
    )
    const short = formatNominatimAddress(j)
    if (short) return short
  } catch { /* ignore */ }
  return ''
}
