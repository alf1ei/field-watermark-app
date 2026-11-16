<template>
  <div class="app">
    <div v-if="showA2hs" class="a2hs">
      <span>{{ a2hsText }}</span>
      <button v-if="a2hsInstall" class="a2hs-install" @click="installPwa">安装</button>
      <button class="a2hs-close" @click="dismissA2hs">✕</button>
    </div>
    <main>
      <!-- 注意：CameraView 是多根节点组件（project-bar/stage/hint/controls/弹窗），
           v-show 只会作用到第一个根节点、其余根节点藏不住（真机 2.1.0 的 bug：
           切到“作品”后拍摄 UI 仍显示在作品列表上方），所以必须用 v-if 整体挂载/卸载；
           卸载时 onBeforeUnmount 会停掉相机流、定位监听和定时器。 -->
      <CameraView v-if="tab === 'shoot'" @saved="onSaved" />
      <WorksList v-if="tab === 'works'" ref="worksRef" />
    </main>
    <nav class="tabs">
      <button :class="{ active: tab === 'shoot' }" @click="tab = 'shoot'">
        <span class="tab-ic">◉</span>拍摄
      </button>
      <button :class="{ active: tab === 'works' }" @click="tab = 'works'; worksCount++">
        <span class="tab-ic">▦</span>作品
        <span class="count-badge" v-if="count > 0">{{ count }}</span>
      </button>
    </nav>
    <div v-if="appToast" class="toast">{{ appToast }}</div>
  </div>
</template>

<script setup>
import { ref, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'
import { popBackOverlay } from './utils/backstack.js'
import CameraView from './components/CameraView.vue'
import WorksList from './components/WorksList.vue'
import { loadRecords } from './utils/store.js'

const tab = ref('shoot')
const worksRef = ref(null)
const worksCount = ref(0)
const count = ref(loadRecords().length)

// App 级轻提示：复用已有的 .toast 样式（和拍摄页/作品页的 toast 同一套），
// 只用于“再按一次退出应用”这类全局提示。
const appToast = ref('')
let appToastTimer = null
function showAppToast(msg, ms = 2000) {
  appToast.value = msg
  clearTimeout(appToastTimer)
  appToastTimer = setTimeout(() => (appToast.value = ''), ms)
}

// 安卓返回键：只在这里注册一次，按优先级处理——
//  1. 有弹层开着：先关最上层（backstack 按打开顺序倒着关）；
//  2. 在“作品”tab：先回“拍摄”tab（拍摄页 v-if 重新挂载，相机会重开）；
//  3. 在“拍摄”tab 且什么都没开：第一次按提示“再按一次退出应用”，2 秒内再按一次才退出。
// 网页版/PWA 没有系统返回键，不注册，别干扰浏览器自己的返回。
const lastBackAt = ref(0)
let backHandle = null
function onBackButton() {
  if (popBackOverlay()) return
  if (tab.value === 'works') {
    tab.value = 'shoot'
    return
  }
  const now = Date.now()
  if (now - lastBackAt.value < 2000) {
    lastBackAt.value = 0
    try { App.exitApp() } catch { /* iOS 上 exitApp 本来就是空操作 */ }
    return
  }
  lastBackAt.value = now
  showAppToast('再按一次退出应用')
}

// PWA 安装提示：iOS 手动添加到主屏幕；安卓用 beforeinstallprompt 弹安装按钮。只提示一次。
const showA2hs = ref(false)
const a2hsInstall = ref(false)
const a2hsText = ref('')
let deferredPrompt = null
function dismissA2hs() {
  showA2hs.value = false
  try { localStorage.setItem('fw_a2hs_dismissed', '1') } catch { /* ignore */ }
}
async function installPwa() {
  if (!deferredPrompt) return
  deferredPrompt.prompt()
  try { await deferredPrompt.userChoice } catch { /* ignore */ }
  deferredPrompt = null
  showA2hs.value = false
}
onMounted(() => {
  // 安卓返回键只注册一次；网页版/PWA 没有系统返回键，不注册。
  if (Capacitor.isNativePlatform()) {
    try { backHandle = App.addListener('backButton', onBackButton) } catch { /* ignore */ }
  }
  try { if (localStorage.getItem('fw_a2hs_dismissed')) return } catch { /* ignore */ }
  const ua = navigator.userAgent || ''
  const isIOS = /iPhone|iPad|iPod/.test(ua)
  const standalone = window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches
  if (isIOS && !standalone) {
    a2hsText.value = '点底部分享按钮 → 添加到主屏幕，下次像 App 一样打开，离线也能拍'
    showA2hs.value = true
  } else if (!standalone) {
    window.addEventListener('beforeinstallprompt', (e) => {
      e.preventDefault()
      deferredPrompt = e
      a2hsText.value = '把长江现场水印相机装到手机上，离线也能打开拍照'
      a2hsInstall.value = true
      showA2hs.value = true
    })
  }
})

async function onSaved() {
  count.value = loadRecords().length
  await nextTick()
  if (worksRef.value) worksRef.value.refresh()
}

onBeforeUnmount(() => {
  try { if (backHandle && backHandle.remove) backHandle.remove() } catch { /* ignore */ }
  clearTimeout(appToastTimer)
})
</script>
