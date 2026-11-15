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
export async function getPosition() {
  // 优先 Capacitor Geolocation（真机），失败回退浏览器 API
  try {
    const { Geolocation } = await import('@capacitor/geolocation')
    const pos = await Geolocation.getCurrentPosition({ enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 })
    return { lon: pos.coords.longitude, lat: pos.coords.latitude, accuracy: pos.coords.accuracy, source: 'capacitor' }
  } catch (e) { /* fall through */ }
  if (navigator.geolocation) {
    return await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({ lon: pos.coords.longitude, lat: pos.coords.latitude, accuracy: pos.coords.accuracy, source: 'browser' }),
        (err) => reject(err),
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
      )
    })
  }
  throw new Error('当前环境不支持定位')
}

// ---- 逆地理编码（拿不到就返回空字符串，绝不编造） ----
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
      if (j && j.status === '1' && j.regeocode && j.regeocode.formatted_address) {
        return j.regeocode.formatted_address
      }
    } catch { /* 掉到下一个源 */ }
  }
  // 2) Nominatim（OpenStreetMap，无需 Key；注意入参用 WGS-84，这里传入 GCJ-02 会有约几百米偏移，
  //    国内使用建议填高德 Key；无 Key 时仍尽力返回一个地址，拿不到则留空）
  try {
    const j = await fetchWithTimeout(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${gcjLat}&lon=${gcjLon}&accept-language=zh-CN&zoom=18`,
      8000
    )
    if (j && j.display_name) return j.display_name
  } catch { /* ignore */ }
  return ''
}
