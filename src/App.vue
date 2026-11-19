<template>
  <div class="app">
    <div v-if="showA2hs" class="a2hs">
      <span>{{ a2hsText }}</span>
      <button v-if="a2hsInstall" class="a2hs-install" @click="installPwa">安装</button>
      <button class="a2hs-close" @click="dismissA2hs">✕</button>
    </div>
    <main>
      <!-- CameraView 常驻后台（v2.1.5，用户要求）：包一层单根 div 再 v-show 切换，
           切到“相册”也不卸载、不停流，切回来不卡；直接对多根节点的 CameraView 用
           v-show 会只藏第一个根节点（真机 2.1.0 的 bug：切到“相册”后拍摄 UI 仍显示
           在相册列表上方）。相机从 App 启动就开着，只在退出 App 时才停；
           切 tab 时 CameraView.suspendCameraView() 收起弹层、关预览补光灯。 -->
      <div class="cam-page" v-show="tab === 'shoot'">
        <!-- v2.1.8 隐私同意门：只有用户点了“同意并继续”才挂载 CameraView；
             CameraView 一挂载就开相机+定位，所以不同意/未决定时相机和定位都不会启动。
             注意这里是按同意状态 v-if，不是按 tab 卸载——切 tab 仍走 v-show 常驻。 -->
        <CameraView v-if="consent === 'accepted'" ref="camRef" @saved="onSaved" @open-settings="onOpenSettings" />
        <div v-else class="consent-gate">
          <h2>开始拍摄前，请先同意隐私政策</h2>
          <p class="field-desc">拍摄需要相机和定位权限，同意后才会启动相机和定位。不同意也可以先看看相册。</p>
          <button class="primary wide" @click="showConsent = true">阅读并同意</button>
          <div style="height:8px"></div>
          <button class="ghost wide" @click="tab = 'works'">仅浏览相册</button>
          <div style="height:8px"></div>
          <button class="ghost wide" @click="policyDoc = 'privacy'">查看隐私政策</button>
        </div>
      </div>
      <WorksList v-if="tab === 'works'" ref="worksRef" @saved="onSaved" />
    </main>
    <nav class="tabs">
      <button :class="{ active: tab === 'shoot' }" @click="tab = 'shoot'">
        <span class="tab-ic">◉</span>拍摄
      </button>
      <button :class="{ active: tab === 'works' }" @click="tab = 'works'; worksCount++">
        <span class="tab-ic">▦</span>相册
        <span class="count-badge" v-if="count > 0">{{ count }}</span>
      </button>
    </nav>
    <div v-if="appToast" class="toast">{{ appToast }}</div>
    <!-- 首次启动隐私同意页：还没选过就弹；同意/不同意都记下来，下次不再弹 -->
    <PrivacyConsent v-if="showConsent" @accept="onConsentAccept" @decline="onConsentDecline" />
    <PolicyViewer v-if="policyDoc" :doc="policyDoc" @close="policyDoc = null" />
    <!-- OTA 更新提示（启动检查发现新版本时弹） -->
    <UpdatePrompt v-if="launchUpdate" :remote="launchUpdate" @close="launchUpdate = null" />
  </div>
</template>

<script setup>
import { ref, watch, nextTick, onMounted, onBeforeUnmount } from 'vue'
import { Capacitor } from '@capacitor/core'
import { App } from '@capacitor/app'
import { popBackOverlay } from './utils/backstack.js'
import CameraView from './components/CameraView.vue'
import WorksList from './components/WorksList.vue'
import PrivacyConsent from './components/PrivacyConsent.vue'
import PolicyViewer from './components/PolicyViewer.vue'
import UpdatePrompt from './components/UpdatePrompt.vue'
import { loadRecords, getPrivacyConsent, setPrivacyConsent } from './utils/store.js'
import { checkForUpdate } from './utils/ota.js'

const tab = ref('shoot')
const camRef = ref(null)
const worksRef = ref(null)
const worksCount = ref(0)
const count = ref(loadRecords().length)

// 隐私同意状态（v2.1.8）：'accepted' | 'declined' | null（没选过）。
// null 时首次启动弹同意页；declined 时拍摄页显示占位，不挂载 CameraView。
const consent = ref(getPrivacyConsent())
const showConsent = ref(consent.value == null)
const policyDoc = ref(null)
// OTA 启动检查发现的新版本（有值时弹更新提示框；无网/没新版时一直是 null，不打扰）
const launchUpdate = ref(null)
function onConsentAccept() {
  setPrivacyConsent('accepted')
  consent.value = 'accepted'
  showConsent.value = false
  checkUpdateOnLaunch()
}
// OTA 启动检查（v3.0.0）：启动 2 秒后查一次，有新版本才弹提示；
// 没网/拉不到/没新版都静默跳过。只在已同意隐私（相机已启用）时做，
// 首次启动还没点同意时不弹，避免和同意页叠在一起。
function checkUpdateOnLaunch() {
  setTimeout(async () => {
    try {
      const res = await checkForUpdate()
      if (res.available && res.remote) launchUpdate.value = res.remote
    } catch { /* 静默跳过 */ }
  }, 2000)
}
function onConsentDecline() {
  setPrivacyConsent('declined')
  consent.value = 'declined'
  showConsent.value = false
}

// 相机常驻后台（v2.1.5）：切 tab 不卸载 CameraView、不停流；
// 切到相册时只收起拍摄页弹层、关预览补光灯，切回来只在流死了才重开（不卡）。
watch(tab, (t) => {
  if (!camRef.value) return
  if (t === 'works') camRef.value.suspendCameraView()
  else if (t === 'shoot') camRef.value.resumeCameraView()
})

// App 级轻提示：复用已有的 .toast 样式（和拍摄页/相册页的 toast 同一套），
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
//  2. 在“相册”tab：先回“拍摄”tab（拍摄页常驻不重开，相机会接着跑）；
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
  // 已同意过隐私才做启动 OTA 检查（没点过同意的，等用户点了同意后再查）
  if (consent.value === 'accepted') checkUpdateOnLaunch()
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

// 拍摄页顶栏菜单按钮（v3.0.1）：打开设置页——切到相册 tab，滚到最底下的设置卡片。
async function onOpenSettings() {
  tab.value = 'works'
  await nextTick()
  if (worksRef.value && worksRef.value.scrollToSettings) worksRef.value.scrollToSettings()
}

onBeforeUnmount(() => {
  try { if (backHandle && backHandle.remove) backHandle.remove() } catch { /* ignore */ }
  clearTimeout(appToastTimer)
})
</script>
