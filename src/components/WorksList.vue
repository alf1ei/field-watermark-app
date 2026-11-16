<template>
  <div class="works">
    <div class="folder-bar">
      <button class="ghost" @click="showNewFolder = !showNewFolder">＋新建文件夹</button>
    </div>
    <div v-if="showNewFolder" class="folder-new">
      <input v-model="newFolderName" placeholder="文件夹名字，比如：西峰区采样" @keyup.enter="doCreateFolder" />
      <button class="primary wide" @click="doCreateFolder">创建</button>
    </div>

    <template v-for="f in foldersWithItems" :key="f.id">
      <div class="folder-card">
        <button class="folder-head" @click="toggleFolder(f.id)">
          <span class="folder-ic">📁</span>
          <span class="folder-name">{{ f.name }}</span>
          <span class="count-badge">{{ f.items.length }}</span>
          <span class="folder-toggle">{{ expandedFolders.has(f.id) ? '收起' : '展开' }}</span>
        </button>
        <template v-if="expandedFolders.has(f.id)">
          <div class="grid">
            <button v-for="it in f.items" :key="it.id" class="cell" @click="openDetail(it)">
              <img v-if="it.type === 'photo' && it.thumb" :src="it.thumb" />
              <video v-else-if="it.type === 'video'" :src="videoUrl(it)" muted playsinline preload="metadata"></video>
              <span v-else class="tag">照片</span>
              <span class="vtag" v-if="it.type === 'video'">▶ 视频</span>
              <span class="tag">{{ it.time.slice(5, 16) }}</span>
            </button>
          </div>
          <button class="ghost folder-del" @click="doDeleteFolder(f)">删除文件夹（照片回到日期列表）</button>
        </template>
      </div>
    </template>

    <template v-for="g in dateGroups" :key="g.date">
      <template v-if="g.date === today">
        <h2>{{ g.date }}（今天，{{ g.items.length }}）</h2>
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
      <template v-else-if="!expandedStacks.has(g.date)">
        <button class="stack-card" @click="expandedStacks.add(g.date)">
          <img v-if="g.items[0] && g.items[0].thumb" :src="g.items[0].thumb" />
          <span v-else class="stack-ph">▶</span>
          <span class="stack-info">{{ g.date }}<span class="count-badge">{{ g.items.length }}</span></span>
          <span class="stack-hint">点一下展开</span>
        </button>
      </template>
      <template v-else>
        <h2>{{ g.date }}（{{ g.items.length }}）</h2>
        <div class="grid">
          <button v-for="it in g.items" :key="it.id" class="cell" @click="openDetail(it)">
            <img v-if="it.type === 'photo' && it.thumb" :src="it.thumb" />
            <video v-else-if="it.type === 'video'" :src="videoUrl(it)" muted playsinline preload="metadata"></video>
            <span v-else class="tag">照片</span>
            <span class="vtag" v-if="it.type === 'video'">▶ 视频</span>
            <span class="tag">{{ it.time.slice(5, 16) }}</span>
          </button>
        </div>
        <button class="ghost stack-collapse" @click="expandedStacks.delete(g.date)">收起堆叠</button>
      </template>
    </template>

    <div v-if="records.length === 0" class="empty">
      还没有作品<br />去“拍摄”拍第一张带 GSZD 水印的照片或视频吧
    </div>

    <div class="settings-card">
      <h2>设置</h2>
      <label class="field-label">斜水印文字（默认 GSZD，可改成其他文字）</label>
      <div class="field-row">
        <input v-model="wmText" @change="saveWmText" placeholder="GSZD" />
        <button class="ghost" @click="resetWmText">恢复默认</button>
      </div>
      <label class="field-label">高德 Key（可选，用于更准的国内地址）</label>
      <input v-model="amapKey" @change="saveAmapKey" placeholder="没有可不填，将用 OpenStreetMap" />
      <div class="field-desc">地址格式：省＋市＋区县＋下一级（街道/镇）＋再详细一级（道路/小区/派出所/社区）。无网络时地址留空是正常的。</div>
    </div>
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
      <div class="folder-move">文件夹：
        <select v-model="detailFolder" @change="moveDetailFolder">
          <option value="">不归档（按日期显示）</option>
          <option v-for="f in folders" :key="f.id" :value="f.id">{{ f.name }}</option>
        </select>
      </div>
    </div>
    <div class="modal-actions">
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
import {
  loadRecords, saveRecords, deleteAppFile, readAppFile, shareFile,
  getFolders, createFolder, deleteFolder, getPhotoFolderMap, getPhotoFolder, setPhotoFolder,
  getWatermarkText, setWatermarkText
} from '../utils/store.js'
import { toDMS, getAmapKey, setAmapKey, formatTime } from '../utils/geo.js'

const records = ref([])
const detail = ref(null)
const detailUrl = ref('')
const detailFolder = ref('')
const toast = ref('')
const folders = ref([])
const photoFolder = ref({})
const expandedFolders = ref(new Set())
const expandedStacks = ref(new Set())
const showNewFolder = ref(false)
const newFolderName = ref('')
const wmText = ref(getWatermarkText())
const amapKey = ref(getAmapKey())
const today = formatTime().slice(0, 10)

let toastTimer = null
function showToast(msg, ms = 3500) {
  toast.value = msg
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toast.value = ''), ms)
}

// 文件夹（带照片）+ 未归档照片按日期倒序分组；今天直接展开，前一天及更早默认堆叠。
const foldersWithItems = computed(() =>
  folders.value.map((f) => ({
    ...f,
    items: records.value.filter((r) => photoFolder.value[r.id] === f.id)
  }))
)
const dateGroups = computed(() => {
  const map = new Map()
  for (const r of records.value) {
    if (photoFolder.value[r.id]) continue
    const d = (r.time || '').slice(0, 10) || '未知日期'
    if (!map.has(d)) map.set(d, { date: d, items: [] })
    map.get(d).items.push(r)
  }
  return [...map.values()].sort((a, b) => (a.date < b.date ? 1 : -1))
})

function refresh() {
  records.value = loadRecords()
  folders.value = getFolders()
  photoFolder.value = getPhotoFolderMap()
}

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
  detailFolder.value = getPhotoFolder(it.id)
  detailUrl.value = await fileSrc(it)
}

function doCreateFolder() {
  const f = createFolder(newFolderName.value)
  if (!f) { showToast('先输入文件夹名字'); return }
  newFolderName.value = ''
  showNewFolder.value = false
  expandedFolders.value.add(f.id)
  refresh()
  showToast(`已新建文件夹「${f.name}」`)
}

function doDeleteFolder(f) {
  deleteFolder(f.id)
  expandedFolders.value.delete(f.id)
  refresh()
  showToast(`已删除文件夹「${f.name}」，照片回到日期列表`)
}

function toggleFolder(id) {
  if (expandedFolders.value.has(id)) expandedFolders.value.delete(id)
  else expandedFolders.value.add(id)
}

function moveDetailFolder() {
  if (!detail.value) return
  setPhotoFolder(detail.value.id, detailFolder.value)
  refresh()
  showToast(detailFolder.value ? '已移动到文件夹' : '已移回日期列表')
}

async function deleteDetail() {
  if (!detail.value) return
  await deleteAppFile(detail.value.path)
  if (detail.value.origPath) await deleteAppFile(detail.value.origPath)
  setPhotoFolder(detail.value.id, '')
  records.value = records.value.filter((x) => x.id !== detail.value.id)
  saveRecords(records.value)
  detail.value = null
  refresh()
  showToast('已删除')
}

function saveWmText() {
  setWatermarkText(wmText.value)
  wmText.value = getWatermarkText()
  showToast('水印文字已更新，新拍的照片生效')
}
function resetWmText() {
  setWatermarkText('')
  wmText.value = getWatermarkText()
  showToast('水印文字已恢复默认 GSZD')
}
function saveAmapKey() {
  setAmapKey(amapKey.value)
  showToast('高德 Key 已保存')
}

async function shareDetail() {
  if (!detail.value) return
  // 原生 App：走 Capacitor 分享（可直接存相册/发微信）
  if (Capacitor.isNativePlatform()) {
    try {
      const { uri } = await Filesystem.getUri({ path: detail.value.path, directory: Directory.Data })
      await shareFile(uri, detail.value.path.split('/').pop())
    } catch (e) {
      showToast('分享失败：' + (e && e.message ? e.message : e))
    }
    return
  }
  // 网页版：优先用系统分享（iPhone 上可直接选“存储到照片/视频”进相册），不支持时退到下载
  try {
    const mime = detail.value.type === 'video' ? (detail.value.mime || 'video/webm') : 'image/jpeg'
    const dataUrl = await readAppFile(detail.value.path, mime)
    const blob = await (await fetch(dataUrl)).blob()
    const fileName = detail.value.path.split('/').pop()
    const file = new File([blob], fileName, { type: blob.type })
    if (navigator.canShare && navigator.canShare({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: fileName })
        return
      } catch (e) {
        if (e && e.name === 'AbortError') return // 用户自己取消分享，不算失败
      }
    }
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 5000)
    showToast('已开始下载；iPhone 上下载完点分享 → 存储到照片/视频即可进相册')
  } catch (e) {
    showToast('导出失败：' + (e && e.message ? e.message : e))
  }
}

onMounted(() => {
  refresh()
})
defineExpose({ refresh })
</script>
