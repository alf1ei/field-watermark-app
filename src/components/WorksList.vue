<template>
  <div class="works">
    <div v-if="groups.length === 0" class="empty">
      还没有作品<br />去“拍摄”拍第一张带 GSZD 水印的照片或视频吧
    </div>
    <template v-for="g in groups" :key="g.project">
      <h2>{{ g.project || '（未填项目名称）' }}（{{ g.items.length }}）</h2>
      <div class="grid">
        <button v-for="it in g.items" :key="it.id" class="cell" @click="openDetail(it)">
          <img v-if="it.type === 'photo' && it.thumb" :src="it.thumb" />
          <video v-else-if="it.type === 'video'" :src="videoUrl(it)" muted playsinline preload="metadata"></video>
          <span v-else class="tag">照片</span>
          <span class="vtag" v-if="it.type === 'video'">▶ 视频</span>
          <span class="tag">{{ it.time.slice(5, 16) }}</span>
        </button>
      </div>
    </template>

    <div class="settings">
      <span>高德 Key（可选，用于更准的国内地址）：</span>
      <input v-model="amapKey" placeholder="没有可不填，将用 OpenStreetMap" @change="saveAmapKey" />
    </div>
    <div class="hint">地址说明：无网络时地址留空是正常的；有网后点开作品 →“补地址”可重试获取。视频的地址只补记录文字，不重新渲染视频。</div>
  </div>

  <div v-if="detail" class="modal-mask">
    <div class="view">
      <img v-if="detail.type === 'photo'" :src="detailUrl" />
      <video v-else :src="detailUrl" controls autoplay></video>
    </div>
    <div class="modal-meta">
      <div>项目：{{ detail.project || '（未填）' }}</div>
      <div>时间：{{ detail.time }}</div>
      <div>经纬度：{{ detail.lon != null ? `${toDMS(detail.lon, false)} ${toDMS(detail.lat, true)}` : '未定位' }}</div>
      <div>地址：<span v-if="detail.address">{{ detail.address }}</span><span v-else class="miss">（未获取到）</span></div>
      <div>保存：App 内 ✓　{{ detail.gallery === 'gallery' ? '手机相册 ✓' : '手机相册 ✗（' + (detail.galleryNote || '仅存 App 内') + '）' }}</div>
      <div>文件：{{ detail.path }}</div>
    </div>
    <div class="modal-actions">
      <button class="primary" @click="fillAddress" :disabled="addrBusy">{{ addrBusy ? '获取中…' : '补地址' }}</button>
      <button @click="shareDetail">分享 / 导出</button>
      <button class="danger" @click="deleteDetail">删除</button>
      <button @click="detail = null">关闭</button>
    </div>
  </div>

  <div v-if="toast" class="toast">{{ toast }}</div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { loadRecords, saveRecords, deleteAppFile, readAppFile, shareFile } from '../utils/store.js'
import { toDMS, reverseGeocode } from '../utils/geo.js'
import { burnPhotoWatermark } from '../utils/watermark.js'

const records = ref([])
const detail = ref(null)
const detailUrl = ref('')
const toast = ref('')
const addrBusy = ref(false)
const amapKey = ref('')

let toastTimer = null
function showToast(msg, ms = 3500) {
  toast.value = msg
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toast.value = ''), ms)
}

const groups = computed(() => {
  const map = new Map()
  for (const r of records.value) {
    const k = r.project || ''
    if (!map.has(k)) map.set(k, { project: k, items: [] })
    map.get(k).items.push(r)
  }
  return [...map.values()]
})

function refresh() { records.value = loadRecords() }

function videoUrl(it) {
  // 列表里视频用 file:// 直链大多播不了，这里只给占位：用缩略图逻辑
  // 详情页用 convertFileSrc 的 http 链接播放
  return ''
}

async function fileSrc(it) {
  try {
    const { uri } = await Filesystem.getUri({ path: it.path, directory: Directory.Data })
    return Capacitor.convertFileSrc(uri)
  } catch {
    const mime = it.type === 'video' ? (it.mime || 'video/webm') : 'image/jpeg'
    return await readAppFile(it.path, mime)
  }
}

async function openDetail(it) {
  detail.value = it
  detailUrl.value = await fileSrc(it)
}

async function deleteDetail() {
  if (!detail.value) return
  await deleteAppFile(detail.value.path)
  if (detail.value.origPath) await deleteAppFile(detail.value.origPath)
  records.value = records.value.filter((x) => x.id !== detail.value.id)
  saveRecords(records.value)
  detail.value = null
  showToast('已删除')
}

async function fillAddress() {
  if (!detail.value || detail.value.lon == null) { showToast('这条记录没有经纬度，无法补地址'); return }
  addrBusy.value = true
  try {
    // 记录里的 lon/lat 已是 GCJ-02，直接逆编码，不要再转换
    const lon = detail.value.lon
    const lat = detail.value.lat
    const addr = await reverseGeocode(lon, lat)
    if (!addr) { showToast('还是拿不到地址，请检查网络后重试'); return }
    detail.value.address = addr
    if (detail.value.type === 'photo' && detail.value.origPath) {
      // 用原图重新烧录，把补上的地址写进图片
      const origUrl = await readAppFile(detail.value.origPath, 'image/jpeg')
      const meta = { project: detail.value.project, time: detail.value.time, lon, lat, address: addr }
      const { blob } = await burnPhotoWatermark(origUrl, meta)
      const base64 = await new Promise((resolve, reject) => {
        const r = new FileReader()
        r.onload = () => resolve(String(r.result).split(',')[1])
        r.onerror = reject
        r.readAsDataURL(blob)
      })
      await Filesystem.writeFile({ path: detail.value.path, data: base64, directory: Directory.Data })
      detailUrl.value = await fileSrc(detail.value)
      showToast('地址已补上，图片已重新烧录（相册里的旧图不变）')
    } else {
      showToast(detail.value.type === 'video' ? '地址已补到记录里（视频文件不重新渲染）' : '地址已补到记录里')
    }
    saveRecords(records.value)
  } catch (e) {
    showToast('补地址失败：' + (e && e.message ? e.message : e))
  } finally {
    addrBusy.value = false
  }
}

async function shareDetail() {
  if (!detail.value) return
  try {
    const { uri } = await Filesystem.getUri({ path: detail.value.path, directory: Directory.Data })
    await shareFile(uri, detail.value.path.split('/').pop())
  } catch (e) {
    showToast('分享失败：' + (e && e.message ? e.message : e))
  }
}

function saveAmapKey() {
  try { localStorage.setItem('fw_amap_key', amapKey.value.trim()) } catch { /* ignore */ }
  showToast(amapKey.value.trim() ? '高德 Key 已保存' : '已清除高德 Key')
}

onMounted(() => {
  refresh()
  try { amapKey.value = localStorage.getItem('fw_amap_key') || '' } catch { /* ignore */ }
})
defineExpose({ refresh })
</script>
