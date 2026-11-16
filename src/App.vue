<template>
  <div class="app">
    <div v-if="showA2hs" class="a2hs">
      <span>{{ a2hsText }}</span>
      <button v-if="a2hsInstall" class="a2hs-install" @click="installPwa">安装</button>
      <button class="a2hs-close" @click="dismissA2hs">✕</button>
    </div>
    <main>
      <CameraView v-show="tab === 'shoot'" @saved="onSaved" />
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
  </div>
</template>

<script setup>
import { ref, nextTick, onMounted } from 'vue'
import CameraView from './components/CameraView.vue'
import WorksList from './components/WorksList.vue'
import { loadRecords } from './utils/store.js'

const tab = ref('shoot')
const worksRef = ref(null)
const worksCount = ref(0)
const count = ref(loadRecords().length)

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
</script>
