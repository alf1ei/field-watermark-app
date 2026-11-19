<template>
  <div class="modal-mask" @click.self="close">
    <div class="sheet panel-sheet">
      <div class="sheet-head"><h2>发现新版本 v{{ remote.version }}</h2><button class="sheet-close" @click="close">✕</button></div>
      <div class="field-desc" v-if="remote.releaseDate">更新时间：{{ remote.releaseDate }}</div>
      <div class="field-desc" v-if="remote.notes">{{ remote.notes }}</div>
      <div class="field-desc" v-if="status === 'idle'">点“立即更新”会下载新安装包（约 7MB），下完自动调起系统安装器，按提示完成安装即可。首次更新时，安装前需要到设置里允许一次“安装未知应用”（只需开一次，以后更新不用再开）。</div>
      <div v-if="status === 'downloading'" class="ota-progress">
        <div class="ota-bar"><div class="ota-fill" :style="{ width: progress + '%' }"></div></div>
        <div class="field-desc">正在下载安装包… {{ progress }}%</div>
      </div>
      <div v-if="status === 'need-permission'" class="field-desc">
        安装新版本前，需要先在系统设置里允许本应用“安装未知应用”。<br />
        这是安卓系统硬性要求，跳不过；只需开一次，以后更新不用再开。<br />
        点“去设置开启”会直接跳到本应用的设置页，打开开关后回来就能装。
        <span v-if="permHint"><br />{{ permHint }}</span>
      </div>
      <div v-if="status === 'installing'" class="field-desc">已下载完，正在调起系统安装器…如果安装器提示需要允许“安装未知应用”，按提示去设置里开一次即可（只需开一次）。</div>
      <div v-if="status === 'done'" class="field-desc">已调起系统安装器，请按提示完成安装。装完打开就是新版本。</div>
      <div v-if="status === 'error'" class="field-desc danger-text">
        更新失败：{{ errorMsg }}<br />
        可以手动下载安装：复制下面地址到浏览器打开，下载 APK 后点安装：<br />
        <span class="ota-url">{{ remote.apkUrl }}</span>
      </div>
      <div style="height:8px"></div>
      <button v-if="status === 'idle' || status === 'error'" class="primary wide" :disabled="busy" @click="doUpdate">{{ status === 'error' ? '重试下载' : '立即更新' }}</button>
      <button v-if="status === 'need-permission'" class="primary wide" :disabled="busy" @click="goEnablePermission">去设置开启</button>
      <div v-if="status === 'need-permission'" style="height:8px"></div>
      <button v-if="status === 'need-permission'" class="ghost wide" :disabled="busy" @click="recheckAfterEnable">我已开启，继续安装</button>
      <div style="height:8px"></div>
      <button class="ghost wide" @click="close">{{ status === 'downloading' ? '后台下载（稍后在设置里再看）' : '稍后再说' }}</button>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { pushBackOverlay, removeBackOverlay } from '../utils/backstack.js'
import { downloadApk, installApk, canInstallUnknownApps, requestInstallPermission } from '../utils/ota.js'

const props = defineProps({ remote: { type: Object, required: true } })
const emit = defineEmits(['close'])

// idle | downloading | need-permission | installing | done | error
const status = ref('idle')
const progress = ref(0)
const errorMsg = ref('')
const busy = ref(false)
// 已下载好的包（权限引导前后复用，不用重新下载）
const downloaded = ref(null)
// 权限引导页里的补充提示（如“还没开启”）
const permHint = ref('')

function close() {
  if (status.value === 'downloading') {
    // 下载继续在后台跑（downloadApk 的 promise 不取消）；关掉弹窗即可
  }
  emit('close')
}

async function startInstall() {
  status.value = 'installing'
  try {
    await installApk(downloaded.value && downloaded.value.uri)
    status.value = 'done'
  } catch (e) {
    if (e && e.code === 'NO_INSTALL_PERMISSION') {
      // 安装器也被系统拦住了：回到引导页，让用户去设置开一次
      permHint.value = '安装器提示需要先允许“安装未知应用”，请去设置里开一次再回来。'
      status.value = 'need-permission'
      return
    }
    status.value = 'error'
    errorMsg.value = (e && e.message) || String(e || '未知错误')
  }
}

async function doUpdate() {
  if (busy.value) return
  busy.value = true
  status.value = 'downloading'
  errorMsg.value = ''
  permHint.value = ''
  progress.value = 0
  try {
    downloaded.value = await downloadApk(props.remote, (p) => { progress.value = p })
    // 安装前先查“安装未知应用”权限：没开不直接调安装器，先弹引导
    const allowed = await canInstallUnknownApps()
    if (allowed === false) {
      status.value = 'need-permission'
      return
    }
    // 已开或查不到（查不到时 installApk 内部还会再查一次 / 由系统自己拦）
    await startInstall()
  } catch (e) {
    status.value = 'error'
    errorMsg.value = (e && e.message) || String(e || '未知错误')
  } finally {
    busy.value = false
  }
}

// “去设置开启”：直接跳到本应用的“安装未知应用”设置页；
// 用户开完返回 App 后 requestInstallPermission 直接返回最新状态。
async function goEnablePermission() {
  if (busy.value) return
  busy.value = true
  try {
    const granted = await requestInstallPermission()
    if (granted === true) {
      permHint.value = ''
      await startInstall()
      return
    }
    if (granted === false) {
      permHint.value = '还没开启：请在设置页打开“允许安装未知应用”开关，回来点“我已开启，继续安装”。'
      return
    }
    permHint.value = '没能打开设置页：请手动到系统设置 → 应用 → 长江现场水印相机 → 安装未知应用，打开开关后再回来点“我已开启，继续安装”。'
  } finally {
    busy.value = false
  }
}

// “我已开启，继续安装”：用户说已在设置里开好了，再查一次确认，确认开了才调安装器。
async function recheckAfterEnable() {
  if (busy.value) return
  busy.value = true
  try {
    const allowed = await canInstallUnknownApps()
    if (allowed === true) {
      permHint.value = ''
      await startInstall()
      return
    }
    if (allowed === false) {
      permHint.value = '还是没开：请确认设置页里的开关已打开，再点一次。'
      return
    }
    // 查不到：直接试调安装器，系统会自己处理
    await startInstall()
  } finally {
    busy.value = false
  }
}

onMounted(() => {
  pushBackOverlay('ota-update', close)
})
onBeforeUnmount(() => {
  removeBackOverlay('ota-update')
})
</script>

<style scoped>
.ota-progress { margin: 12px 0 4px; }
.ota-bar {
  height: 10px; border-radius: 999px; overflow: hidden;
  background: rgba(255,255,255,.12);
  border: 1px solid rgba(255,255,255,.14);
}
.ota-fill {
  height: 100%; border-radius: 999px;
  background: linear-gradient(135deg, #2f8cff, #0a64d8);
  transition: width .2s;
}
.ota-url { word-break: break-all; color: #9fc6ff; font-size: 12px; }
</style>
