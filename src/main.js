import { createApp } from 'vue'
import App from './App.vue'
import './style.css'
import { Capacitor } from '@capacitor/core'

createApp(App).mount('#app')

// PWA：只在网页端注册 service worker（原生 App 不注册，避免干扰 Capacitor 内嵌页面）。
// 要求 HTTPS（或 localhost）；HTTP 下 'serviceWorker' 不可用，会静默跳过。
if (!Capacitor.isNativePlatform() && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => {})
  })
  // 新版本 SW 接管后自动刷新一次，让用户用上新版
  let swReloaded = false
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!swReloaded) {
      swReloaded = true
      window.location.reload()
    }
  })
}
