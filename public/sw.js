/* 长江现场水印相机 — PWA service worker（仅网页版注册，原生 App 不注册）
 * 策略：首次联网访问时把应用外壳缓存下来，之后没网也能打开拍照；
 * 页面（导航请求）走网络优先、失败回退缓存；静态资源走缓存优先、后台更新。
 * 跨域请求（高德/ Nominatim 逆地理编码）不拦截，直接走网络。
 * 更新机制：新 SW 安装后立即接管，页面监听到接管后自动刷新一次。
 */
const CACHE = 'fw-pwa-v13'
const CORE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './privacy.html',
  './terms.html',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
]

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((cache) => cache.addAll(CORE)).catch(() => {}).then(() => self.skipWaiting())
  )
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  )
})

self.addEventListener('fetch', (event) => {
  const req = event.request
  if (req.method !== 'GET') return
  const url = new URL(req.url)
  if (url.origin !== self.location.origin) return // 跨域放行，不缓存

  // 页面导航：网络优先，断网时回退缓存的 index.html
  if (req.mode === 'navigate' || (req.headers.get('accept') || '').includes('text/html')) {
    event.respondWith(
      fetch(req)
        .then((res) => {
          const copy = res.clone()
          caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {})
          return res
        })
        .catch(() => caches.match('./index.html').then((r) => r || caches.match(req)))
    )
    return
  }

  // 静态资源：缓存优先，后台更新
  event.respondWith(
    caches.match(req).then((cached) => {
      const net = fetch(req)
        .then((res) => {
          if (res && res.ok) {
            const copy = res.clone()
            caches.open(CACHE).then((cache) => cache.put(req, copy)).catch(() => {})
          }
          return res
        })
        .catch(() => cached)
      return cached || net
    })
  )
})
