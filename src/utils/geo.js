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

// ---- 定位 ----
// 策略（2026-11-16 用户反馈：个别手机一次高精度定位拿不到）：
// 高精度 → 普通精度（Wi-Fi/基站）→ 缓存位置，三级兜底，不只试一次就放弃。
// 关键：原生端 Capacitor 的 getCurrentPosition 不保证执行 timeout（
// 安卓上 timeout 只用作 watch 的更新间隔），室内等不到 GPS 时会永远挂起；
// 所以每一级都包一层手动超时（Promise.race），绝不无限等。

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

// 显式要定位权限：原生端没授权时会弹系统授权框；已拒绝返回 denied，
// 直接报清楚（不再往下试）；网页端 requestPermissions 未实现会抛错，直接忽略继续试。
// 权限框是用户点按的，最多等 30 秒，超时也不阻塞后续定位尝试。
async function ensureLocationPermission() {
  let Geolocation
  try {
    ({ Geolocation } = await import('@capacitor/geolocation'))
  } catch { return }
  if (!Geolocation || typeof Geolocation.requestPermissions !== 'function') return
  let status = null
  try {
    status = await withTimeout(Geolocation.requestPermissions(), 30000, '请求定位权限')
  } catch { return }
  const locState = status && status.location
  const coarseState = status && status.coarseLocation
  if (locState === 'denied' && coarseState !== 'granted') {
    const err = new Error('定位权限被拒绝')
    err.code = 'LOC_DENIED'
    throw err
  }
}

function capacitorPosition(opts) {
  return import('@capacitor/geolocation').then(({ Geolocation }) =>
    Geolocation.getCurrentPosition(opts).then((pos) => ({
      lon: pos.coords.longitude, lat: pos.coords.latitude, accuracy: pos.coords.accuracy, source: 'capacitor'
    }))
  )
}
function browserPosition(opts) {
  if (!navigator.geolocation) throw new Error('当前环境不支持定位')
  return new Promise((resolve, reject) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lon: pos.coords.longitude, lat: pos.coords.latitude, accuracy: pos.coords.accuracy, source: 'browser' }),
      (err) => reject(err),
      opts
    )
  })
}
// 单级定位：先走 Capacitor（真机原生定位），包一层手动超时；
// 原生端超时不回退浏览器（同个 provider 也会卡），交给下一级兜底；
// Capacitor 快速失败时回退浏览器 API（网页版走的就是它）。
async function tryPosition(opts, ms) {
  try {
    return await withTimeout(capacitorPosition(opts), ms, '定位')
  } catch (e) {
    if (e && e.code === 'TIMEOUT') throw e
    if (isPermissionDenied(e)) throw e
    return await withTimeout(browserPosition(opts), ms, '定位')
  }
}

export async function getPosition() {
  // 权限被拒直接抛 LOC_DENIED（不再试，也不用缓存兜底——用户明确拒绝了定位）
  await ensureLocationPermission()
  const attempts = [
    { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000, ms: 12000 },
    { enableHighAccuracy: false, timeout: 15000, maximumAge: 5000, ms: 12000 },
    { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000, ms: 8000 }
  ]
  let lastErr = null
  for (const a of attempts) {
    const { ms, ...opts } = a
    try {
      const pos = await tryPosition(opts, ms)
      saveLastFix(pos)
      return pos
    } catch (e) {
      if (isPermissionDenied(e)) throw e
      lastErr = e
    }
  }
  // 全部失败：用上次定位兜底（带 stale 标记，界面会标“上次位置”），再没有才报错
  const stale = loadLastFix()
  if (stale) return { lon: stale.lon, lat: stale.lat, accuracy: stale.accuracy, source: 'cached', stale: true }
  throw lastErr || new Error('定位失败')
}

// 后台持续监听：GPS 热起来后自动补上经纬度/地址。返回停止函数。
// 优先 Capacitor watchPosition（真机/网页都可用）；原生监听 20 秒还不出位置
//（如室内 GPS 迟迟不定）时，再开一路浏览器监听补网络定位；原生监听报错时也一样。
export function watchPosition(onUpdate, onError) {
  const opts = { enableHighAccuracy: true, timeout: 15000, maximumAge: 5000 }
  let stopped = false
  let gotFix = false
  let stopCap = null
  let watchId = null
  let watchdog = null
  const emit = (lon, lat, accuracy, source) => {
    gotFix = true
    try { onUpdate({ lon, lat, accuracy, source }) } catch { /* 回调异常不中断监听 */ }
  }
  const startBrowserWatch = () => {
    if (stopped || !navigator.geolocation || watchId != null) return
    watchId = navigator.geolocation.watchPosition(
      (pos) => emit(pos.coords.longitude, pos.coords.latitude, pos.coords.accuracy, 'browser'),
      (err) => { if (onError) onError(err) },
      opts
    )
  }
  import('@capacitor/geolocation').then(({ Geolocation }) =>
    Geolocation.watchPosition(opts, (pos, err) => {
      if (stopped) return
      if (err) {
        startBrowserWatch()
        if (onError) onError(err)
        return
      }
      if (pos) emit(pos.coords.longitude, pos.coords.latitude, pos.coords.accuracy, 'capacitor')
    }).then((id) => { stopCap = id }).catch(startBrowserWatch)
  ).catch(startBrowserWatch)
  watchdog = setTimeout(() => { if (!stopped && !gotFix) startBrowserWatch() }, 20000)
  return () => {
    stopped = true
    if (watchdog) clearTimeout(watchdog)
    if (watchId != null && navigator.geolocation) navigator.geolocation.clearWatch(watchId)
    if (stopCap != null) {
      import('@capacitor/geolocation').then(({ Geolocation }) => Geolocation.clearWatch({ id: stopCap })).catch(() => {})
    }
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
// 高德 Key 由使用者在设置里自填，存在 localStorage；没有 Key 时直接跳过，不写死假 Key。
export function getAmapKey() {
  try { return localStorage.getItem('fw_amap_key') || '' } catch { return '' }
}
export function setAmapKey(key) {
  try { localStorage.setItem('fw_amap_key', (key || '').trim()) } catch { /* ignore */ }
}

async function fetchWithTimeout(url, ms = 8000) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  try {
    const r = await fetch(url, { signal: ctrl.signal })
    if (!r.ok) throw new Error('http ' + r.status)
    return await r.json()
  } finally { clearTimeout(t) }
}

/**
 * @param {number} gcjLon GCJ-02 经度
 * @param {number} gcjLat GCJ-02 纬度
 * @returns {Promise<string>} 地址文本，拿不到返回 ''
 */
export async function reverseGeocode(gcjLon, gcjLat) {
  // 1) 高德（需自填 Key，否则跳过）
  const amapKey = getAmapKey()
  if (amapKey) {
    try {
      const j = await fetchWithTimeout(
        `https://restapi.amap.com/v3/geocode/regeo?key=${encodeURIComponent(amapKey)}&location=${gcjLon},${gcjLat}&extensions=base&output=json`
      )
      if (j && j.status === '1' && j.regeocode) {
        const short = formatAmapAddress(j.regeocode, j.regeocode.pois || [])
        if (short) return short
      }
    } catch { /* 掉到下一个源 */ }
  }
  // 2) Nominatim（OpenStreetMap，无需 Key；入参用 WGS-84，先把 GCJ-02 转回去再调，
  //    否则国内会有约几百米偏移；无 Key 时仍尽力返回一个地址，拿不到则留空）
  try {
    const wgs = gcj02ToWgs84(gcjLon, gcjLat)
    const j = await fetchWithTimeout(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${wgs.lat}&lon=${wgs.lon}&accept-language=zh-CN&zoom=18&addressdetails=1`,
      8000
    )
    const short = formatNominatimAddress(j)
    if (short) return short
  } catch { /* ignore */ }
  return ''
}
