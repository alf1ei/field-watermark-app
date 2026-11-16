<template>
  <div class="project-bar">
    <label>项目名称</label>
    <input v-model="project" placeholder="点这里输入项目名称" @input="onProjectInput" @change="onProjectInput" />
    <select v-if="history.length" v-model="project" @change="onProjectInput" title="历史项目">
      <option value="" disabled>历史</option>
      <option v-for="h in history" :key="h" :value="h">{{ h }}</option>
    </select>
  </div>

  <div class="stage" ref="stageEl">
    <div class="cam-wrap" :style="camWrapStyle">
    <video v-show="camOk" ref="videoEl" autoplay muted playsinline></video>
    <div v-if="camOk" class="wm-overlay">
      <div class="gszd">{{ wmText }}</div>
      <div class="bar" @click="openProjectEdit" title="点一下改项目名称">
        <div>时间：{{ nowText }}</div>
        <div>经度：{{ dispLoc.lon != null ? toDMS(dispLoc.lon, false) : '未定位' }}</div>
        <div>纬度：{{ dispLoc.lat != null ? toDMS(dispLoc.lat, true) : '未定位' }}</div>
        <div v-if="loc.address">地址：{{ loc.address }}</div>
        <div class="p">项目名称：{{ project || '（未填）' }}</div>
      </div>
    </div>
    <button v-if="camOk" class="flash-btn" @click="cycleFlashMode" title="闪光灯：点一下切换 自动/常开/关闭">闪光灯·{{ flashLabel }}</button>
    <div v-if="!camOk" class="cam-off">
      <div>{{ camError || '相机未启动' }}</div>
      <div>
        <button class="primary" @click="startCamera" style="padding:10px 18px;border-radius:8px;border:none;background:#0b3d91;color:#fff;font-size:15px;">重试打开相机</button>
      </div>
      <div style="font-size:13px;">浏览器/真机上也可直接用系统相机拍照，水印同样会烧进去：</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;">
        <button @click="systemCamera('camera')" style="padding:10px 14px;border-radius:8px;border:1px solid #3a4a5c;background:#0f141b;color:#fff;">系统相机拍照</button>
        <button @click="systemCamera('album')" style="padding:10px 14px;border-radius:8px;border:1px solid #3a4a5c;background:#0f141b;color:#fff;">从相册选图</button>
        <button @click="systemVideo" style="padding:10px 14px;border-radius:8px;border:1px solid #3a4a5c;background:#0f141b;color:#fff;">系统相机录像</button>
      </div>
      <input ref="videoFileInput" type="file" accept="video/*" capture="environment" style="display:none" @change="onVideoFilePicked" />
    </div>
    </div>
  </div>

  <div class="hint" :class="{ err: locError }" @click="openProjectEdit" title="点一下改项目名称">{{ locHint }}</div>

  <div class="controls">
    <div class="ctrl-row">
      <button class="circle-btn" @click="showRatioPanel = true" title="照片比例">{{ ratio }}</button>
      <div class="mode-row">
        <button :class="{ active: mode === 'photo' }" :disabled="recording" @click="switchMode('photo')">📷 拍照</button>
        <button :class="{ active: mode === 'video' }" :disabled="recording" @click="switchMode('video')">🎥 录像</button>
      </div>
      <button class="circle-btn" @click="showLensPanel = true" title="镜头 / 变焦">{{ zoomLabel }}</button>
    </div>
    <div class="shutter-row">
      <button @click="toggleFacing" :disabled="recording || !camOk">🔄 前后切换</button>
      <button v-if="mode === 'photo'" class="shutter photo" :disabled="!camOk" @click="takePhoto">拍照</button>
      <button v-else class="shutter" :class="{ rec: recording }" :disabled="!camOk" @click="recording ? stopRecording() : startRecording()">
        {{ recording ? '停止' : '录像' }}
      </button>
      <button @click="systemCamera('album')" :disabled="!camOk">相册选图</button>
    </div>
    <div class="loc-line" @click="openProjectEdit" title="点一下改项目名称">
      <span v-if="recording" class="rec-time">● {{ recTimeText }}</span>
      <span v-else>{{ loc.address ? '地址：' + loc.address : (loc.lon != null ? '已定位，地址获取中/未获取到' : '正在定位…') }}</span>
    </div>
    <div class="tool-row">
      <button @click="refreshLocation" :disabled="locBusy">📍 重新定位</button>
      <button v-if="camOk" @click="systemCamera('camera')">系统相机拍照</button>
      <button v-if="!camOk" @click="systemVideo">系统相机录像</button>
    </div>
  </div>

  <!-- 比例选择 -->
  <div v-if="showRatioPanel" class="modal-mask" @click.self="showRatioPanel = false">
    <div class="sheet panel-sheet">
      <div class="sheet-head"><h2>照片比例（竖屏）</h2><button class="sheet-close" @click="showRatioPanel = false">✕</button></div>
      <div class="pick-row">
        <button v-for="r in RATIO_OPTIONS" :key="r.label" :class="{ active: ratio === r.label }" @click="setRatio(r.label); showRatioPanel = false">{{ r.label }}</button>
      </div>
      <div class="field-desc">默认 3:4；9:16 取景铺满上下，3:4 / 1:1 只占对应区域、外面留空。</div>
    </div>
  </div>

  <!-- 镜头 / 变焦 -->
  <div v-if="showLensPanel" class="modal-mask" @click.self="showLensPanel = false">
    <div class="sheet panel-sheet">
      <div class="sheet-head"><h2>镜头 / 变焦</h2><button class="sheet-close" @click="showLensPanel = false">✕</button></div>
      <div class="field-label">变焦</div>
      <div class="pick-row" v-if="zoomOptions.length">
        <button v-for="z in zoomOptions" :key="z" :class="{ active: zoom === z }" @click="applyZoom(z)">{{ formatZoom(z) }}</button>
      </div>
      <div class="field-desc" v-else>当前摄像头不支持网页变焦（iPhone 网页版通常没有变焦能力）。</div>
      <div class="field-label">摄像头（读取手机能提供的全部摄像头）</div>
      <div class="pick-col" v-if="cameras.length">
        <button v-for="c in cameras" :key="c.deviceId" :class="{ active: cameraId === c.deviceId }" @click="switchCameraById(c.deviceId)">{{ c.label }}</button>
      </div>
      <div class="field-desc" v-else>正在枚举摄像头…</div>
      <div class="field-desc">iPhone 网页版只给前/后两个摄像头，长焦/超广角苹果不开放给网页，想用长焦请用“系统相机拍照”。</div>
    </div>
  </div>

  <!-- 改项目名称：常驻 DOM（v-show 只切换位移），点水印信息条时在点击手势内同步聚焦，直接弹输入法 -->
  <div class="edit-sheet" :class="{ open: editSheet }">
    <div class="sheet">
      <div class="sheet-head"><h2>项目名称</h2><button class="sheet-close" @click="editSheet = false">✕</button></div>
      <div class="field-row">
        <input ref="editInput" v-model="editProject" placeholder="输入项目名称" enterkeyhint="done" @keyup.enter="saveProjectEdit" />
      </div>
      <div style="height:12px"></div>
      <button class="primary wide" @click="saveProjectEdit">保存</button>
    </div>
  </div>

  <!-- 拍完预览：保留 / 删除 / 重拍 -->
  <div v-if="preview" class="modal-mask">
    <div class="view">
      <img v-if="preview.kind === 'photo'" :src="preview.url" />
      <video v-else :src="preview.url" controls autoplay loop></video>
    </div>
    <div class="modal-meta">
      <div>项目：{{ preview.meta.project || '（未填）' }}</div>
      <div>时间：{{ preview.meta.time }}</div>
      <div>经纬度：{{ preview.meta.lon != null ? `${toDMS(preview.meta.lon, false)} ${toDMS(preview.meta.lat, true)}` : '未定位' }}</div>
      <div>地址：{{ preview.meta.address || '（未获取到）' }}</div>
      <div>保存：App 内 ✓　{{ preview.gallery === 'gallery' ? '手机相册 ✓' : '手机相册 ✗（' + (preview.galleryNote || '仅存 App 内') + '）' }}</div>
    </div>
    <div class="modal-actions">
      <button class="primary" @click="preview = null">保留</button>
      <button class="danger" @click="deletePreview">删除这张</button>
      <button @click="retake">重拍</button>
    </div>
  </div>

  <div v-if="toast" class="toast">{{ toast }}</div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { Capacitor } from '@capacitor/core'
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'
import { getPosition, watchPosition, wgs84ToGcj02, reverseGeocode, toDMS, formatTime } from '../utils/geo.js'
import { drawWatermark, drawVideoFrame, burnPhotoWatermark, centerCropRect, MAX_EDGE, JPEG_QUALITY } from '../utils/watermark.js'
import { getLastProject, setLastProject, getProjectHistory, loadRecords, saveRecords, saveToAppStorage, saveToGallery, uid, getWatermarkText, deleteAppFile } from '../utils/store.js'

const emit = defineEmits(['saved'])
const videoEl = ref(null)
const project = ref(getLastProject())
const wmText = ref(getWatermarkText())
const history = ref(getProjectHistory())
const mode = ref('photo')
const facing = ref('environment')
// 闪光灯：默认自动（暗了自动补光），点一下在 自动→常开→关闭 之间切换
const flashMode = ref(localStorage.getItem('fw_flash_mode') || 'auto')
const flashOn = ref(false)
// 照片比例：竖屏，默认 3:4，可切 9:16 / 1:1（直播拍照、系统相机、相册选图都按所选比例中心裁剪）
const RATIO_OPTIONS = [
  { label: '3:4', value: 3 / 4 },
  { label: '9:16', value: 9 / 16 },
  { label: '1:1', value: 1 }
]
function migrateRatio(stored) {
  if (stored === '4:3') return '3:4'
  if (stored === '16:9') return '9:16'
  if (RATIO_OPTIONS.some((r) => r.label === stored)) return stored
  return '3:4'
}
const ratio = ref(migrateRatio(localStorage.getItem('fw_photo_ratio') || ''))
// 镜头：枚举到的摄像头（手机上常有主摄/超广角/长焦，浏览器能看到几个就列几个）
const cameras = ref([])
const cameraId = ref(localStorage.getItem('fw_camera_device') || '')
// 变焦：从当前视频轨的能力里读（0.5×–10× 按手机实际支持的过滤）
const zoom = ref(1)
const zoomCaps = ref(null)
// 取景舞台：按比例适配（苹果相机式），9:16 铺满上下，3:4 / 1:1 只占对应区域
const stageEl = ref(null)
const stageBox = ref({ w: 0, h: 0 })
const showRatioPanel = ref(false)
const showLensPanel = ref(false)
// 改项目名称弹层：常驻 DOM，靠位移隐藏，点水印信息条时在点击手势内同步聚焦，直接弹输入法
const editSheet = ref(false)
const editProject = ref('')
const editInput = ref(null)
const camOk = ref(false)
const camError = ref('')
const stream = ref(null)
const recording = ref(false)
const recSeconds = ref(0)
const preview = ref(null)
const toast = ref('')
const loc = ref({ lon: null, lat: null, gcjLon: null, gcjLat: null, address: '' })
const locBusy = ref(false)
const locError = ref(false)
const locHint = ref('正在定位…')
const nowText = ref(formatTime())

let toastTimer = null
let recTimer = null
let clockTimer = null
let mediaRecorder = null
let recChunks = []
let recCanvas = null
let recCtx = null
let recRaf = null
let recMeta = null
// 正在进行的定位（单次 + 后台监听共用）：拍照/录像前等它完成再拍，不丢经纬度。
let locPending = null
let stopWatch = null
let addrFetching = false
let lastAddrAt = 0

// 取景比例：拍照用所选竖版比例，录像固定竖屏 9:16
const stageRatio = computed(() => {
  if (mode.value === 'video') return 9 / 16
  return (RATIO_OPTIONS.find((r) => r.label === ratio.value) || RATIO_OPTIONS[0]).value
})
// 取景框尺寸：按比例放进舞台里，居中；9:16 高度顶满上下，3:4 / 1:1 只占对应区域
const camWrapStyle = computed(() => {
  const { w, h } = stageBox.value
  if (!w || !h) return {}
  const r = stageRatio.value
  const boxW = Math.min(w, Math.round(h * r))
  const boxH = Math.round(boxW / r)
  return { width: boxW + 'px', height: boxH + 'px' }
})
const zoomLabel = computed(() => formatZoom(zoom.value))
const zoomOptions = computed(() => {
  const caps = zoomCaps.value
  if (!caps) return []
  return [0.5, 1, 2, 3, 5, 10].filter((z) => z >= caps.min - 1e-9 && z <= caps.max + 1e-9)
})
const flashLabel = computed(() => (flashMode.value === 'auto' ? '自动' : flashMode.value === 'on' ? '常开' : '关闭'))
// 预览里显示的经纬度与烧进照片里的一致：优先 GCJ-02（currentMeta 同款）
const dispLoc = computed(() => ({
  lon: loc.value.gcjLon != null ? loc.value.gcjLon : loc.value.lon,
  lat: loc.value.gcjLat != null ? loc.value.gcjLat : loc.value.lat
}))
const recTimeText = computed(() => {
  const m = String(Math.floor(recSeconds.value / 60)).padStart(2, '0')
  const s = String(recSeconds.value % 60).padStart(2, '0')
  return `${m}:${s}`
})

function showToast(msg, ms = 3500) {
  toast.value = msg
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toast.value = ''), ms)
}
function onProjectInput() {
  setLastProject(project.value.trim())
  history.value = getProjectHistory()
}

async function startCamera() {
  stopStream()
  camError.value = ''
  try {
    const videoConstraints = {
      width: { ideal: 1920 },
      height: { ideal: 1080 }
    }
    // 选了具体镜头就按 deviceId 开（长焦/超广角就靠这个）；没选才按前后方向开
    if (cameraId.value) videoConstraints.deviceId = { exact: cameraId.value }
    else videoConstraints.facingMode = facing.value
    const constraints = {
      video: videoConstraints,
      audio: mode.value === 'video'
    }
    const s = await navigator.mediaDevices.getUserMedia(constraints)
    stream.value = s
    videoEl.value.srcObject = s
    await videoEl.value.play().catch(() => {})
    camOk.value = true
    listCameras()
    readTrackCaps()
    // 换镜头后变焦会回到 1×，之前选过的倍数尽量恢复
    if (zoom.value !== 1 && zoomCaps.value) {
      const track = s.getVideoTracks()[0]
      if (track) track.applyConstraints({ advanced: [{ zoom: zoom.value }] }).catch(() => {})
    }
    applyAutoFlashOnce()
  } catch (e) {
    camOk.value = false
    camError.value = '无法打开相机：' + (e && e.message ? e.message : e) + '。请检查相机权限，或用下方系统相机。'
  }
}
// 枚举摄像头：浏览器能看到几个就列几个（安卓常有主摄/超广角/长焦；
// iPhone 网页只给前后两个，长焦/超广角苹果不开放给网页，见下方说明）
async function listCameras() {
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) return
    const devices = await navigator.mediaDevices.enumerateDevices()
    const inputs = devices.filter((d) => d.kind === 'videoinput')
    if (!inputs.length) return
    cameras.value = inputs.map((d, i) => {
      const label = (d.label || '').trim()
      const low = label.toLowerCase()
      let face = 'environment'
      if (low.includes('front') || label.includes('前置')) face = 'user'
      else if (low.includes('back') || low.includes('rear') || label.includes('后置')) face = 'environment'
      else face = i === 0 ? 'environment' : 'user'
      return { deviceId: d.deviceId, label: label || `摄像头 ${i + 1}`, facing: face }
    })
    // 已存的镜头还在列表里就沿用；否则按当前这路的 deviceId 认领
    if (!cameras.value.some((c) => c.deviceId === cameraId.value)) {
      const track = stream.value && stream.value.getVideoTracks()[0]
      const settings = track && track.getSettings ? track.getSettings() : {}
      const current = settings.deviceId && cameras.value.find((c) => c.deviceId === settings.deviceId)
      if (current) cameraId.value = current.deviceId
      else if (cameras.value.length === 1) cameraId.value = cameras.value[0].deviceId
    }
  } catch { /* 枚举失败不影响拍摄 */ }
}
function setRatio(label) {
  ratio.value = label
  try { localStorage.setItem('fw_photo_ratio', label) } catch {}
}
function fitStage() {
  const el = stageEl.value
  if (!el) return
  stageBox.value = { w: el.clientWidth, h: el.clientHeight }
}
function formatZoom(z) {
  return (Number.isInteger(z) ? String(z) : z.toFixed(1)) + '×'
}
// 从当前视频轨读能力：变焦范围 + 是否支持闪光灯；换镜头后重新读。
function readTrackCaps() {
  const track = stream.value && stream.value.getVideoTracks()[0]
  if (!track || !track.getCapabilities) { zoomCaps.value = null; return }
  try {
    const caps = track.getCapabilities()
    zoomCaps.value = caps.zoom ? { min: caps.zoom.min, max: caps.zoom.max, step: caps.zoom.step || 0.1 } : null
    if (zoomCaps.value) {
      if (zoom.value < zoomCaps.value.min) zoom.value = zoomCaps.value.min
      if (zoom.value > zoomCaps.value.max) zoom.value = zoomCaps.value.max
    }
    track._torchSupported = !!caps.torch
  } catch { zoomCaps.value = null }
}
async function applyZoom(z) {
  zoom.value = z
  const track = stream.value && stream.value.getVideoTracks()[0]
  if (!track) return
  try {
    await track.applyConstraints({ advanced: [{ zoom: z }] })
  } catch (e) {
    showToast('变焦失败：' + (e && e.message ? e.message : e))
    readTrackCaps()
  }
}
// 改项目名称：弹层常驻 DOM，靠位移隐藏；点水印信息条时在点击手势内同步聚焦，手机输入法直接弹出来。
function openProjectEdit() {
  editProject.value = project.value
  editSheet.value = true
  const input = editInput.value
  if (input) {
    try { input.focus({ preventScroll: true }) } catch { input.focus() }
    try { input.select() } catch { /* ignore */ }
  }
}
function saveProjectEdit() {
  project.value = editProject.value.trim()
  onProjectInput()
  editSheet.value = false
  showToast('项目名称已更新')
}
// ---- 闪光灯：默认自动，采样取景画面亮度，暗了自动开补光 ----
let flashTimer = null
let flashCanvas = null
function sampleBrightness() {
  try {
    const v = videoEl.value
    if (!v || !v.videoWidth) return null
    if (!flashCanvas) flashCanvas = document.createElement('canvas')
    flashCanvas.width = 32; flashCanvas.height = 32
    const c = flashCanvas.getContext('2d', { willReadFrequently: true })
    c.drawImage(v, 0, 0, 32, 32)
    const d = c.getImageData(0, 0, 32, 32).data
    let sum = 0
    for (let i = 0; i < d.length; i += 4) sum += 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
    return sum / (d.length / 4)
  } catch { return null }
}
async function setTorch(on) {
  const track = stream.value && stream.value.getVideoTracks()[0]
  if (!track) return false
  try {
    await track.applyConstraints({ advanced: [{ torch: !!on }] })
    flashOn.value = !!on
    return true
  } catch { return false }
}
function torchSupported() {
  const track = stream.value && stream.value.getVideoTracks()[0]
  return !!(track && track._torchSupported)
}
async function applyAutoFlashOnce() {
  if (flashMode.value !== 'auto' || !camOk.value) return
  if (!torchSupported()) return
  const luma = sampleBrightness()
  if (luma == null) return
  await setTorch(luma < 45)
}
function startFlashTimer() {
  stopFlashTimer()
  flashTimer = setInterval(() => { applyAutoFlashOnce() }, 1500)
}
function stopFlashTimer() {
  if (flashTimer) { clearInterval(flashTimer); flashTimer = null }
}
async function cycleFlashMode() {
  flashMode.value = flashMode.value === 'auto' ? 'on' : flashMode.value === 'on' ? 'off' : 'auto'
  try { localStorage.setItem('fw_flash_mode', flashMode.value) } catch {}
  if (flashMode.value === 'on') {
    if (!torchSupported()) { showToast('当前摄像头不支持闪光灯'); return }
    await setTorch(true)
  } else if (flashMode.value === 'off') {
    await setTorch(false)
  } else {
    await applyAutoFlashOnce()
  }
  showToast('闪光灯：' + flashLabel.value)
}
async function switchCameraById(id) {
  if (id) cameraId.value = id
  try { localStorage.setItem('fw_camera_device', cameraId.value) } catch {}
  const hit = cameras.value.find((c) => c.deviceId === cameraId.value)
  if (hit) facing.value = hit.facing
  zoom.value = 1
  showLensPanel.value = false
  await startCamera()
}
function stopStream() {
  if (stream.value) {
    stream.value.getTracks().forEach((t) => t.stop())
    stream.value = null
  }
}
async function switchMode(m) {
  if (recording.value) return
  mode.value = m
  await startCamera()
}
async function toggleFacing() {
  if (cameras.value.length > 1) {
    // 有镜头列表时切到另一个方向的镜头（前后切换）
    const current = cameras.value.findIndex((c) => c.deviceId === cameraId.value)
    const cur = cameras.value[current >= 0 ? current : 0]
    const next = cameras.value.find((c) => c.facing !== cur.facing) || cameras.value[(current + 1) % cameras.value.length]
    cameraId.value = next.deviceId
    try { localStorage.setItem('fw_camera_device', next.deviceId) } catch {}
    facing.value = next.facing
  } else {
    facing.value = facing.value === 'environment' ? 'user' : 'environment'
  }
  zoom.value = 1
  await startCamera()
}

async function refreshLocation() {
  if (locPending) return locPending
  locBusy.value = true
  locError.value = false
  locHint.value = '定位中…'
  locPending = (async () => {
    try {
      const pos = await getPosition()
      const gcj = wgs84ToGcj02(pos.lon, pos.lat)
      loc.value = { lon: pos.lon, lat: pos.lat, gcjLon: gcj.lon, gcjLat: gcj.lat, address: loc.value.address }
      locHint.value = `已定位（精度约 ${pos.accuracy ? Math.round(pos.accuracy) + ' 米' : '未知'}），正在获取地址…`
      try {
        const addr = await reverseGeocode(gcj.lon, gcj.lat)
        loc.value.address = addr || ''
        locHint.value = addr ? '定位与地址已就绪' : '已定位，但地址未获取到（无网络或服务不可用），拍照时地址留空'
        if (!addr) locError.value = true
      } catch {
        locHint.value = '已定位，但地址未获取到，拍照时地址留空'
        locError.value = true
      }
    } catch (e) {
      locError.value = true
      locHint.value = '定位失败：' + (e && e.message ? e.message : e) + '。请打开定位权限；无定位时仍可拍照，经纬度/地址留空。'
    } finally {
      locBusy.value = false
      locPending = null
    }
  })()
  return locPending
}

// 拍照/录像前调用：定位正在进行就等它完成（最多等 8 秒），没定位过就先定位一次。
async function waitForLocation() {
  if (locPending) {
    await Promise.race([locPending, new Promise((r) => setTimeout(r, 8000))])
    return
  }
  if (loc.value.lon == null) await refreshLocation()
}

// 后台持续监听：GPS 热起来后自动补上经纬度；地址还是空时顺带补一次（30 秒内只补一次）。
function startLocationWatch() {
  if (stopWatch) return
  stopWatch = watchPosition(async (pos) => {
    const gcj = wgs84ToGcj02(pos.lon, pos.lat)
    const hadAddr = !!loc.value.address
    loc.value = { lon: pos.lon, lat: pos.lat, gcjLon: gcj.lon, gcjLat: gcj.lat, address: loc.value.address }
    if (locError.value) { locError.value = false; locHint.value = '定位与地址已就绪' }
    if (!hadAddr && !addrFetching && Date.now() - lastAddrAt > 30000) {
      addrFetching = true
      lastAddrAt = Date.now()
      try {
        const addr = await reverseGeocode(gcj.lon, gcj.lat)
        if (addr) { loc.value.address = addr; locHint.value = '定位与地址已就绪' }
      } catch { /* 下次监听到新位置再试 */ } finally { addrFetching = false }
    }
  })
}

function currentMeta() {
  return {
    project: project.value.trim(),
    time: formatTime(),
    lon: loc.value.gcjLon != null ? loc.value.gcjLon : loc.value.lon,
    lat: loc.value.gcjLat != null ? loc.value.gcjLat : loc.value.lat,
    address: loc.value.address || '',
    watermarkText: wmText.value
  }
}

function refreshWmText() {
  wmText.value = getWatermarkText()
}

function makeThumb(dataUrl, mime = 'image/jpeg') {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const k = Math.min(1, 320 / Math.max(img.naturalWidth, img.naturalHeight))
      const c = document.createElement('canvas')
      c.width = Math.round(img.naturalWidth * k)
      c.height = Math.round(img.naturalHeight * k)
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
      resolve(c.toDataURL(mime, 0.8))
    }
    img.onerror = () => resolve('')
    img.src = dataUrl
  })
}

async function persistRecord({ type, blob, fileName, meta, thumb, mime }) {
  const saved = await saveToAppStorage(blob, fileName)
  const gal = await saveToGallery({ fileUri: saved.uri, isVideo: type === 'video' })
  const rec = {
    id: uid(), type, project: meta.project, time: meta.time,
    // 注意：meta.lon/meta.lat 在拍摄时已是 GCJ-02（currentMeta 用 gcjLon/gcjLat），记录直接存 GCJ-02；
    // meta.lon/meta.lat 在拍摄时已是 GCJ-02，记录直接存 GCJ-02。
    lon: meta.lon, lat: meta.lat, gcjLon: meta.lon, gcjLat: meta.lat, address: meta.address,
    path: saved.path, uri: saved.uri, thumb: thumb || '',
    gallery: gal.where, galleryNote: gal.reason || gal.note || '', mime: mime || blob.type
  }
  const list = loadRecords()
  list.unshift(rec)
  saveRecords(list)
  emit('saved', rec)
  return rec
}

async function takePhoto() {
  if (!videoEl.value || !videoEl.value.videoWidth) { showToast('相机画面还没准备好'); return }
  await waitForLocation()
  const meta = currentMeta()
  try {
    const vw = videoEl.value.videoWidth, vh = videoEl.value.videoHeight
    // 按所选竖版比例对画面中心裁剪（默认 3:4），再按最长边 2400 缩放
    const targetRatio = (RATIO_OPTIONS.find((r) => r.label === ratio.value) || RATIO_OPTIONS[0]).value
    const { sx, sy, sw, sh } = centerCropRect(vw, vh, targetRatio)
    const k = Math.min(1, MAX_EDGE / Math.max(sw, sh))
    const w = Math.round(sw * k), h = Math.round(sh * k)
    // 自动闪光灯：拍之前先按当前画面亮度补一次光
    await applyAutoFlashOnce()
    const rawCanvas = document.createElement('canvas')
    rawCanvas.width = w; rawCanvas.height = h
    rawCanvas.getContext('2d').drawImage(videoEl.value, sx, sy, sw, sh, 0, 0, w, h)
    // 烧水印
    const wmCtx = rawCanvas.getContext('2d')
    drawWatermark(wmCtx, w, h, meta)
    const blob = await new Promise((r) => rawCanvas.toBlob(r, 'image/jpeg', JPEG_QUALITY))
    const dataUrl = rawCanvas.toDataURL('image/jpeg', JPEG_QUALITY)
    const ts = meta.time.replace(/[-: ]/g, '')
    const fileName = `GSZD_${ts}.jpg`
    const thumb = await makeThumb(dataUrl)
    const rec = await persistRecord({ type: 'photo', blob, fileName, meta, thumb })
    // 拍照后不弹分享、不跳预览页，留在拍摄界面直接继续拍
    await afterPhotoSaved({ rec })
  } catch (e) {
    showToast('拍照失败：' + (e && e.message ? e.message : e))
  }
}

// 拍照后存相册：原生直接写相册；网页版浏览器没有直接写相册的权限，
// 照片先存在 App 的作品里，需要进相册时去作品点分享、选“存储到照片”。
async function afterPhotoSaved({ rec }) {
  if (Capacitor.isNativePlatform()) {
    if (rec.gallery === 'gallery') showToast('已保存到相册 ✓，继续拍吧')
    else showToast('已存 App 内，相册保存失败（可在作品里分享导出）')
    return
  }
  showToast('已保存 ✓，继续拍吧')
}

async function systemCamera(source) {
  try {
    const photo = await Camera.getPhoto({
      quality: 90,
      resultType: CameraResultType.DataUrl,
      source: source === 'album' ? CameraSource.Photos : CameraSource.Camera,
      saveToGallery: false
    })
    if (!photo || !photo.dataUrl) return
    await waitForLocation()
    const meta = currentMeta()
    // 系统相机/相册的图也在烧水印前按所选竖版比例中心裁剪
    const targetRatio = (RATIO_OPTIONS.find((r) => r.label === ratio.value) || RATIO_OPTIONS[0]).value
    const { blob, dataUrl } = await burnPhotoWatermark(photo.dataUrl, meta, targetRatio)
    const ts = meta.time.replace(/[-: ]/g, '')
    const fileName = `GSZD_${ts}.jpg`
    const thumb = await makeThumb(dataUrl)
    const rec = await persistRecord({ type: 'photo', blob, fileName, meta, thumb })
    // 系统相机拍照同样不跳预览页，留在拍摄界面；照片同时进相册
    await afterPhotoSaved({ rec })
  } catch (e) {
    if (String(e && e.message).includes('cancel')) return
    showToast('系统相机失败：' + (e && e.message ? e.message : e))
  }
}

// ---- 视频：canvas.captureStream + MediaRecorder，每帧烧水印 ----
async function ensureVideoStream() {
  if (stream.value && stream.value.getAudioTracks().length > 0) return
  await startCamera() // video 模式下 getUserMedia 带 audio:true
}
async function startRecording() {
  try {
    await ensureVideoStream()
    await waitForLocation()
    recMeta = currentMeta()
    recCanvas = document.createElement('canvas')
    recCanvas.width = 1080; recCanvas.height = 1920
    recCtx = recCanvas.getContext('2d')
    const canvasStream = recCanvas.captureStream(30)
    const tracks = [...canvasStream.getVideoTracks()]
    if (stream.value) {
      const audio = stream.value.getAudioTracks()
      if (audio.length) tracks.push(audio[0])
    }
    const combined = new MediaStream(tracks)
    const mimeCandidates = ['video/webm;codecs=vp9,opus', 'video/webm;codecs=vp8,opus', 'video/webm', 'video/mp4']
    const mime = mimeCandidates.find((m) => { try { return MediaRecorder.isTypeSupported(m) } catch { return false } }) || ''
    mediaRecorder = mime ? new MediaRecorder(combined, { mimeType: mime, videoBitsPerSecond: 8_000_000 }) : new MediaRecorder(combined, { videoBitsPerSecond: 8_000_000 })
    recChunks = []
    mediaRecorder.ondataavailable = (e) => { if (e.data && e.data.size) recChunks.push(e.data) }
    mediaRecorder.onstop = onRecordStop
    const drawLoop = () => {
      if (!recording.value) return
      if (videoEl.value && videoEl.value.videoWidth) {
        drawVideoFrame(recCtx, videoEl.value, 1080, 1920, recMeta)
      }
      recRaf = requestAnimationFrame(drawLoop)
    }
    recording.value = true
    recSeconds.value = 0
    recTimer = setInterval(() => { recSeconds.value += 1 }, 1000)
    mediaRecorder.start(500)
    drawLoop()
    showToast('开始录像（竖屏 1080×1920，水印实时烧录中）')
  } catch (e) {
    recording.value = false
    showToast('录像启动失败：' + (e && e.message ? e.message : e))
  }
}
function stopRecording() {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop()
  }
  recording.value = false
  clearInterval(recTimer)
  cancelAnimationFrame(recRaf)
}
async function onRecordStop() {
  try {
    const mime = (mediaRecorder && mediaRecorder.mimeType) || 'video/webm'
    const blob = new Blob(recChunks, { type: mime })
    if (!blob.size) { showToast('录像为空，未保存'); return }
    const ext = mime.includes('mp4') ? 'mp4' : 'webm'
    const ts = recMeta.time.replace(/[-: ]/g, '')
    const fileName = `GSZD_${ts}.${ext}`
    const rec = await persistRecord({ type: 'video', blob, fileName, meta: recMeta, thumb: '', mime })
    const url = URL.createObjectURL(blob)
    preview.value = { kind: 'video', url, meta: recMeta, gallery: rec.gallery, galleryNote: rec.galleryNote, recordId: rec.id }
  } catch (e) {
    showToast('录像保存失败：' + (e && e.message ? e.message : e))
  }
}

const videoFileInput = ref(null)

// ---- 网页版录像兜底：直播取景打不开时（如 iOS 主屏幕 PWA），用系统相机录一段，
// 再把文件逐帧过一遍 canvas 烧水印、重编码保存。处理耗时约等于视频时长，处理时请勿离开页面。----
function systemVideo() {
  if (videoFileInput.value) videoFileInput.value.click()
}
async function onVideoFilePicked(e) {
  const file = e.target.files && e.target.files[0]
  e.target.value = ''
  if (!file) return
  await waitForLocation()
  const meta = currentMeta()
  showToast('正在给视频烧水印，耗时约等于视频时长，请勿离开页面…', 8000)
  let url = ''
  try {
    url = URL.createObjectURL(file)
    const srcVideo = document.createElement('video')
    srcVideo.playsInline = true
    srcVideo.preload = 'auto'
    srcVideo.src = url
    // 同步调 play()：落在用户选文件的手势里，iOS 才允许带声音播放；播不起来再退到静音
    const playPromise = srcVideo.play().catch(() => null)
    await new Promise((resolve, reject) => {
      srcVideo.onloadedmetadata = resolve
      srcVideo.onerror = () => reject(new Error('视频读取失败'))
    })
    await playPromise
    if (srcVideo.paused) {
      srcVideo.muted = true
      await srcVideo.play().catch(() => {})
    }
    const canvas = document.createElement('canvas')
    canvas.width = 1080
    canvas.height = 1920
    const ctx = canvas.getContext('2d')
    const canvasStream = canvas.captureStream(30)
    const tracks = [...canvasStream.getVideoTracks()]
    try {
      const srcStream = srcVideo.captureStream ? srcVideo.captureStream() : null
      const audio = srcStream && srcStream.getAudioTracks()
      if (audio && audio.length) tracks.push(audio[0])
    } catch { /* 取不到音频轨时只录画面 */ }
    const combined = new MediaStream(tracks)
    const mimeCandidates = ['video/mp4', 'video/webm;codecs=vp8,opus', 'video/webm']
    const mime = mimeCandidates.find((m) => { try { return MediaRecorder.isTypeSupported(m) } catch { return false } }) || ''
    const mr = mime
      ? new MediaRecorder(combined, { mimeType: mime, videoBitsPerSecond: 8_000_000 })
      : new MediaRecorder(combined, { videoBitsPerSecond: 8_000_000 })
    const chunks = []
    mr.ondataavailable = (ev) => { if (ev.data && ev.data.size) chunks.push(ev.data) }
    const done = new Promise((resolve) => { mr.onstop = resolve })
    mr.start(500)
    let stopped = false
    const loop = () => {
      if (stopped || srcVideo.ended) return
      if (srcVideo.videoWidth) drawVideoFrame(ctx, srcVideo, 1080, 1920, meta)
      requestAnimationFrame(loop)
    }
    loop()
    srcVideo.onended = () => {
      stopped = true
      if (mr.state !== 'inactive') mr.stop()
    }
    await done
    srcVideo.pause()
    URL.revokeObjectURL(url)
    url = ''
    const outMime = mr.mimeType || 'video/webm'
    const blob = new Blob(chunks, { type: outMime })
    if (!blob.size) { showToast('视频处理失败，未保存'); return }
    const ext = outMime.includes('mp4') ? 'mp4' : 'webm'
    const ts = meta.time.replace(/[-: ]/g, '')
    const fileName = `GSZD_${ts}.${ext}`
    const rec = await persistRecord({ type: 'video', blob, fileName, meta, thumb: '', mime: outMime })
    preview.value = { kind: 'video', url: URL.createObjectURL(blob), meta, gallery: rec.gallery, galleryNote: rec.galleryNote, recordId: rec.id }
  } catch (err) {
    if (url) URL.revokeObjectURL(url)
    showToast('视频加水印失败：' + (err && err.message ? err.message : err))
  }
}

async function deletePreview() {
  if (!preview.value) return
  const list = loadRecords()
  const hit = list.find((x) => x.id === preview.value.recordId)
  if (hit) {
    await deleteAppFile(hit.path)
    saveRecords(list.filter((x) => x.id !== hit.id))
    emit('saved', null)
  }
  preview.value = null
  showToast('已删除')
}
function retake() {
  preview.value = null
  startCamera()
}

let stageObserver = null
onMounted(() => {
  clockTimer = setInterval(() => { nowText.value = formatTime() }, 1000)
  window.addEventListener('fw-settings-changed', refreshWmText)
  if (window.ResizeObserver && stageEl.value) {
    stageObserver = new ResizeObserver(() => fitStage())
    stageObserver.observe(stageEl.value)
  }
  fitStage()
  startCamera()
  refreshLocation()
  startLocationWatch()
  startFlashTimer()
})
onBeforeUnmount(() => {
  clearInterval(clockTimer)
  clearInterval(recTimer)
  cancelAnimationFrame(recRaf)
  stopFlashTimer()
  if (stageObserver) { stageObserver.disconnect(); stageObserver = null }
  window.removeEventListener('fw-settings-changed', refreshWmText)
  if (stopWatch) { stopWatch(); stopWatch = null }
  stopStream()
})
</script>
