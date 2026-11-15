<template>
  <div class="project-bar">
    <label>项目名称</label>
    <input v-model="project" placeholder="点这里输入项目名称" @input="onProjectInput" @change="onProjectInput" />
    <select v-if="history.length" v-model="project" @change="onProjectInput" title="历史项目">
      <option value="" disabled>历史</option>
      <option v-for="h in history" :key="h" :value="h">{{ h }}</option>
    </select>
  </div>

  <div class="cam-wrap">
    <video v-show="camOk" ref="videoEl" autoplay muted playsinline></video>
    <div v-if="camOk" class="wm-overlay">
      <div class="gszd">GSZD</div>
      <div class="bar">
        <div class="p">{{ project || '（未填项目名称）' }}</div>
        <div>{{ nowText }}</div>
        <div>{{ locText }}</div>
        <div v-if="loc.address">{{ loc.address }}</div>
      </div>
    </div>
    <div v-if="!camOk" class="cam-off">
      <div>{{ camError || '相机未启动' }}</div>
      <div>
        <button class="primary" @click="startCamera" style="padding:10px 18px;border-radius:8px;border:none;background:#0b3d91;color:#fff;font-size:15px;">重试打开相机</button>
      </div>
      <div style="font-size:13px;">浏览器/真机上也可直接用系统相机拍照，水印同样会烧进去：</div>
      <div style="display:flex;gap:8px;">
        <button @click="systemCamera('camera')" style="padding:10px 14px;border-radius:8px;border:1px solid #3a4a5c;background:#0f141b;color:#fff;">系统相机拍照</button>
        <button @click="systemCamera('album')" style="padding:10px 14px;border-radius:8px;border:1px solid #3a4a5c;background:#0f141b;color:#fff;">从相册选图</button>
      </div>
    </div>
  </div>

  <div class="hint" :class="{ err: locError }">{{ locHint }}</div>

  <div class="controls">
    <div class="mode-row">
      <button :class="{ active: mode === 'photo' }" :disabled="recording" @click="switchMode('photo')">📷 拍照</button>
      <button :class="{ active: mode === 'video' }" :disabled="recording" @click="switchMode('video')">🎥 录像</button>
    </div>
    <div class="shutter-row">
      <button @click="toggleFacing" :disabled="recording || !camOk">🔄 前后切换</button>
      <button v-if="mode === 'photo'" class="shutter photo" :disabled="!camOk" @click="takePhoto">拍照</button>
      <button v-else class="shutter" :class="{ rec: recording }" :disabled="!camOk" @click="recording ? stopRecording() : startRecording()">
        {{ recording ? '停止' : '录像' }}
      </button>
      <button @click="toggleFlash" :disabled="!camOk">💡 闪光灯{{ flashOn ? '开' : '关' }}</button>
    </div>
    <div class="loc-line">
      <span v-if="recording" class="rec-time">● {{ recTimeText }}</span>
      <span v-else>{{ loc.address ? '地址：' + loc.address : (loc.lon != null ? '已定位，地址获取中/未获取到' : '正在定位…') }}</span>
    </div>
    <div class="tool-row">
      <button @click="refreshLocation" :disabled="locBusy">📍 重新定位</button>
      <button v-if="camOk" @click="systemCamera('camera')">系统相机拍照</button>
      <button v-if="camOk" @click="systemCamera('album')">从相册选图加水印</button>
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
      <div>地址：{{ preview.meta.address || '（未获取到，稍后可在作品里补地址）' }}</div>
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
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'
import { getPosition, wgs84ToGcj02, reverseGeocode, toDMS, formatTime } from '../utils/geo.js'
import { drawWatermark, drawVideoFrame, burnPhotoWatermark, MAX_EDGE, JPEG_QUALITY } from '../utils/watermark.js'
import { getLastProject, setLastProject, getProjectHistory, loadRecords, saveRecords, saveToAppStorage, saveToGallery, uid } from '../utils/store.js'

const emit = defineEmits(['saved'])
const videoEl = ref(null)
const project = ref(getLastProject())
const history = ref(getProjectHistory())
const mode = ref('photo')
const facing = ref('environment')
const flashOn = ref(false)
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

const locText = computed(() => {
  if (loc.value.lon == null) return '定位中…'
  return `${toDMS(loc.value.lon, false)}  ${toDMS(loc.value.lat, true)}`
})
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
    const constraints = {
      video: {
        facingMode: facing.value,
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      },
      audio: mode.value === 'video'
    }
    const s = await navigator.mediaDevices.getUserMedia(constraints)
    stream.value = s
    videoEl.value.srcObject = s
    await videoEl.value.play().catch(() => {})
    camOk.value = true
  } catch (e) {
    camOk.value = false
    camError.value = '无法打开相机：' + (e && e.message ? e.message : e) + '。请检查相机权限，或用下方系统相机。'
  }
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
  facing.value = facing.value === 'environment' ? 'user' : 'environment'
  await startCamera()
}
async function toggleFlash() {
  const track = stream.value && stream.value.getVideoTracks()[0]
  if (!track) return
  try {
    const caps = track.getCapabilities ? track.getCapabilities() : {}
    if (!caps.torch) { showToast('当前摄像头不支持闪光灯'); return }
    flashOn.value = !flashOn.value
    await track.applyConstraints({ advanced: [{ torch: flashOn.value }] })
  } catch (e) { showToast('闪光灯切换失败：' + e.message) }
}

async function refreshLocation() {
  locBusy.value = true
  locError.value = false
  locHint.value = '定位中…'
  try {
    const pos = await getPosition()
    const gcj = wgs84ToGcj02(pos.lon, pos.lat)
    loc.value = { lon: pos.lon, lat: pos.lat, gcjLon: gcj.lon, gcjLat: gcj.lat, address: loc.value.address }
    locHint.value = `已定位（精度约 ${pos.accuracy ? Math.round(pos.accuracy) + ' 米' : '未知'}），正在获取地址…`
    try {
      const addr = await reverseGeocode(gcj.lon, gcj.lat)
      loc.value.address = addr || ''
      locHint.value = addr ? '定位与地址已就绪' : '已定位，但地址未获取到（无网络或服务不可用），拍照时地址留空，稍后可在作品里补地址'
      if (!addr) locError.value = true
    } catch {
      locHint.value = '已定位，但地址未获取到，拍照时地址留空，稍后可在作品里补地址'
      locError.value = true
    }
  } catch (e) {
    locError.value = true
    locHint.value = '定位失败：' + (e && e.message ? e.message : e) + '。请打开定位权限；无定位时仍可拍照，经纬度/地址留空。'
  } finally {
    locBusy.value = false
  }
}

function currentMeta() {
  return {
    project: project.value.trim(),
    time: formatTime(),
    lon: loc.value.gcjLon != null ? loc.value.gcjLon : loc.value.lon,
    lat: loc.value.gcjLat != null ? loc.value.gcjLat : loc.value.lat,
    address: loc.value.address || ''
  }
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
    // 补地址时直接用这组值逆编码，不要再做 WGS-84→GCJ-02 转换。
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
  if (loc.value.lon == null) await refreshLocation()
  const meta = currentMeta()
  try {
    const vw = videoEl.value.videoWidth, vh = videoEl.value.videoHeight
    const k = Math.min(1, MAX_EDGE / Math.max(vw, vh))
    const w = Math.round(vw * k), h = Math.round(vh * k)
    // 原图（无水印，留着给“补地址”时重新烧录用）
    const rawCanvas = document.createElement('canvas')
    rawCanvas.width = w; rawCanvas.height = h
    rawCanvas.getContext('2d').drawImage(videoEl.value, 0, 0, w, h)
    const rawBlob = await new Promise((r) => rawCanvas.toBlob(r, 'image/jpeg', JPEG_QUALITY))
    // 烧水印
    const wmCtx = rawCanvas.getContext('2d')
    drawWatermark(wmCtx, w, h, meta)
    const blob = await new Promise((r) => rawCanvas.toBlob(r, 'image/jpeg', JPEG_QUALITY))
    const dataUrl = rawCanvas.toDataURL('image/jpeg', JPEG_QUALITY)
    const ts = meta.time.replace(/[-: ]/g, '')
    const fileName = `GSZD_${ts}.jpg`
    const thumb = await makeThumb(dataUrl)
    const rec = await persistRecord({ type: 'photo', blob, fileName, meta, thumb })
    // 原图另存一份（不进相册）
    try {
      const orig = await saveToAppStorage(rawBlob, fileName.replace('.jpg', '_orig.jpg'))
      const list = loadRecords()
      const hit = list.find((x) => x.id === rec.id)
      if (hit) { hit.origPath = orig.path; saveRecords(list) }
      rec.origPath = orig.path
    } catch { /* 原图保存失败不影响主流程 */ }
    preview.value = { kind: 'photo', url: dataUrl, meta, gallery: rec.gallery, galleryNote: rec.galleryNote, recordId: rec.id }
  } catch (e) {
    showToast('拍照失败：' + (e && e.message ? e.message : e))
  }
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
    if (loc.value.lon == null) await refreshLocation()
    const meta = currentMeta()
    const { blob, dataUrl } = await burnPhotoWatermark(photo.dataUrl, meta)
    const ts = meta.time.replace(/[-: ]/g, '')
    const fileName = `GSZD_${ts}.jpg`
    const thumb = await makeThumb(dataUrl)
    const rec = await persistRecord({ type: 'photo', blob, fileName, meta, thumb })
    try {
      const raw = await fetch(photo.dataUrl).then((r) => r.blob())
      const orig = await saveToAppStorage(raw, fileName.replace('.jpg', '_orig.jpg'))
      const list = loadRecords()
      const hit = list.find((x) => x.id === rec.id)
      if (hit) { hit.origPath = orig.path; saveRecords(list) }
      rec.origPath = orig.path
    } catch { /* ignore */ }
    preview.value = { kind: 'photo', url: dataUrl, meta, gallery: rec.gallery, galleryNote: rec.galleryNote, recordId: rec.id }
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
    if (loc.value.lon == null) await refreshLocation()
    recMeta = currentMeta()
    recCanvas = document.createElement('canvas')
    recCanvas.width = 1920; recCanvas.height = 1080
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
        drawVideoFrame(recCtx, videoEl.value, 1920, 1080, recMeta)
      }
      recRaf = requestAnimationFrame(drawLoop)
    }
    recording.value = true
    recSeconds.value = 0
    recTimer = setInterval(() => { recSeconds.value += 1 }, 1000)
    mediaRecorder.start(500)
    drawLoop()
    showToast('开始录像（1080p，水印实时烧录中）')
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

async function deletePreview() {
  if (!preview.value) return
  const list = loadRecords()
  const hit = list.find((x) => x.id === preview.value.recordId)
  if (hit) {
    const { deleteAppFile } = await import('../utils/store.js')
    await deleteAppFile(hit.path)
    if (hit.origPath) await deleteAppFile(hit.origPath)
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

onMounted(() => {
  clockTimer = setInterval(() => { nowText.value = formatTime() }, 1000)
  startCamera()
  refreshLocation()
})
onBeforeUnmount(() => {
  clearInterval(clockTimer)
  clearInterval(recTimer)
  cancelAnimationFrame(recRaf)
  stopStream()
})
</script>
