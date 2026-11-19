<template>
  <div class="works" ref="worksEl" :class="{ selecting: selectMode }">
    <div class="search-bar">
      <span aria-hidden="true">🔍</span>
      <input v-model="searchText" type="search" placeholder="搜索项目名称、地址、日期…" enterkeyhint="search" />
      <span v-if="isSearching" class="search-count">{{ filteredRecords.length }} 张</span>
      <button v-if="searchText" class="search-clear" @click="searchText = ''" title="清空搜索">✕</button>
    </div>
    <div v-if="selectMode" class="sel-bar">
      <span>已选 {{ selected.size }} 张</span>
      <span class="sel-hint">按住拖到文件夹上松手</span>
      <button class="danger" @click="askBatchDelete">删除</button>
      <button class="ghost" @click="exitSelectMode">取消</button>
      <button class="primary" @click="exitSelectMode">完成</button>
    </div>
    <div class="folder-bar">
      <button class="ghost" @click="showNewFolder = !showNewFolder">＋新建文件夹</button>
    </div>
    <div v-if="showNewFolder" class="folder-new">
      <input v-model="newFolderName" placeholder="文件夹名字，比如：西峰区采样" @keyup.enter="doCreateFolder" />
      <button class="primary wide" @click="doCreateFolder">创建</button>
    </div>

    <template v-for="f in visibleFolders" :key="f.id">
      <div class="folder-card" :data-folder-id="f.id" :class="{ 'drop-hot': dropTarget === f.id }">
        <button class="folder-head" @click="toggleFolder(f.id)">
          <span class="folder-ic">📁</span>
          <span class="folder-name">{{ f.name }}</span>
          <span class="count-badge">{{ f.items.length }}</span>
          <span class="folder-toggle">{{ expandedFolders.has(f.id) ? '收起' : '展开' }}</span>
        </button>
        <template v-if="expandedFolders.has(f.id)">
          <div class="grid">
            <button v-for="it in f.items" :key="it.id" class="cell" :class="{ selected: isSelected(it.id) }"
              @click="onCellClick(it)" @pointerdown="onCellPointerDown(it, $event)" @pointermove="onCellPointerMove"
              @pointerup="onCellPointerUp" @pointercancel="onCellPointerCancel" @contextmenu.prevent>
              <img v-if="it.type === 'photo' && it.thumb" :src="it.thumb" />
              <video v-else-if="it.type === 'video'" :src="videoUrl(it)" muted playsinline preload="metadata"></video>
              <span v-else class="tag">照片</span>
              <span class="vtag" v-if="it.type === 'video'">▶ 视频</span>
              <span class="tag">{{ it.time.slice(5, 16) }}</span>
              <span v-if="isSelected(it.id)" class="sel-check">✓</span>
            </button>
          </div>
          <button class="ghost folder-del" @click="doDeleteFolder(f)">删除文件夹（照片回到日期列表）</button>
        </template>
      </div>
    </template>

    <template v-for="g in visibleDateGroups" :key="g.date">
      <template v-if="g.date === today">
        <h2>{{ g.date }}（今天，{{ g.items.length }}）</h2>
        <div class="grid">
          <button v-for="it in g.items" :key="it.id" class="cell" :class="{ selected: isSelected(it.id) }"
            @click="onCellClick(it)" @pointerdown="onCellPointerDown(it, $event)" @pointermove="onCellPointerMove"
            @pointerup="onCellPointerUp" @pointercancel="onCellPointerCancel" @contextmenu.prevent>
            <img v-if="it.type === 'photo' && it.thumb" :src="it.thumb" />
            <video v-else-if="it.type === 'video'" :src="videoUrl(it)" muted playsinline preload="metadata"></video>
            <span v-else class="tag">照片</span>
            <span class="vtag" v-if="it.type === 'video'">▶ 视频</span>
            <span class="tag">{{ it.time.slice(5, 16) }}</span>
            <span v-if="isSelected(it.id)" class="sel-check">✓</span>
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
          <button v-for="it in g.items" :key="it.id" class="cell" :class="{ selected: isSelected(it.id) }"
            @click="onCellClick(it)" @pointerdown="onCellPointerDown(it, $event)" @pointermove="onCellPointerMove"
            @pointerup="onCellPointerUp" @pointercancel="onCellPointerCancel" @contextmenu.prevent>
            <img v-if="it.type === 'photo' && it.thumb" :src="it.thumb" />
            <video v-else-if="it.type === 'video'" :src="videoUrl(it)" muted playsinline preload="metadata"></video>
            <span v-else class="tag">照片</span>
            <span class="vtag" v-if="it.type === 'video'">▶ 视频</span>
            <span class="tag">{{ it.time.slice(5, 16) }}</span>
            <span v-if="isSelected(it.id)" class="sel-check">✓</span>
          </button>
        </div>
        <button class="ghost stack-collapse" @click="expandedStacks.delete(g.date)">收起堆叠</button>
      </template>
    </template>

    <div v-if="records.length === 0" class="empty">
      还没有相册<br />去“拍摄”拍第一张带 GSZD 水印的照片或视频吧
    </div>
    <div v-if="isSearching && filteredRecords.length === 0" class="empty">
      没有找到相关照片<br />换个项目名称、地址或日期试试
    </div>

    <div class="settings-card">
      <h2>设置</h2>
      <label class="field-label">斜水印文字（默认 GSZD，可改成其他文字）</label>
      <div class="field-row">
        <input v-model="wmText" @change="saveWmText" placeholder="GSZD" />
        <button class="ghost" @click="resetWmText">恢复默认</button>
      </div>
      <label class="field-label">水印透明度（{{ wmOpacity.toFixed(2) }}，范围 0.10–0.60，默认 0.20）</label>
      <div class="field-row">
        <input type="range" min="0.1" max="0.6" step="0.05" v-model.number="wmOpacity" @input="saveWmOpacity" class="wm-slider" />
        <button class="ghost" @click="resetWmOpacity">恢复默认</button>
      </div>
      <div class="field-desc">拖动时取景上的水印实时变化；新拍的照片和视频按这个透明度烧水印。</div>
      <div class="field-desc">地址服务已内置（高德逆地理编码优先，拿不到时用 OpenStreetMap）。地址格式：省＋市＋区县＋下一级（街道/镇）＋再详细一级（道路/小区/派出所/社区）。无网络时地址留空是正常的。</div>
      <label class="field-label">版本</label>
      <div class="version-rows">
        <div class="version-row"><span>当前版本</span><b>v{{ APP_VERSION.version }}</b></div>
        <div class="version-row"><span>更新时间</span><b>{{ APP_VERSION.releaseDate }}</b></div>
        <div class="version-row"><span>联系邮箱</span><b>w4yne@foxmail.com</b></div>
      </div>
      <div class="field-row">
        <button class="ghost" @click="onCheckUpdate" :disabled="checkingUpdate">{{ checkingUpdate ? '检查中…' : '检查更新' }}</button>
      </div>
      <div class="field-desc" v-if="updateStatus">{{ updateStatus }}</div>
      <label class="field-label">隐私与协议</label>
      <div class="field-row">
        <button class="ghost" @click="policyDoc = 'privacy'">隐私政策</button>
        <button class="ghost" @click="policyDoc = 'terms'">用户协议</button>
      </div>
      <div class="field-desc">本应用不注册、不登录，不收集账号信息；没有广告，没有第三方统计。照片、视频只保存在本机和系统相册。</div>
    </div>
  </div>

  <PolicyViewer v-if="policyDoc" :doc="policyDoc" @close="policyDoc = null" />

  <UpdatePrompt v-if="updateRemote" :remote="updateRemote" @close="updateRemote = null" />

  <div v-if="detail" class="modal-mask">
    <div class="view" @pointerdown="onDetailPointerDown" @pointerup="onDetailPointerUp" @pointercancel="onDetailPointerCancel">
      <button v-if="swipeList.length > 1" class="detail-nav prev" @click.stop="goDetailPrev" title="上一张">‹</button>
      <img v-if="detail.type === 'photo'" :src="detailUrl" @click="onDetailImageTap" />
      <video v-else :src="detailUrl" controls autoplay></video>
      <button v-if="swipeList.length > 1" class="detail-nav next" @click.stop="goDetailNext" title="下一张">›</button>
      <span v-if="swipeList.length > 1" class="detail-counter">{{ detailIndex + 1 }} / {{ swipeList.length }}</span>
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

  <!-- 详情页连点 7 次编辑文字：项目名称 / 时间 / 地址可改，经纬度是实测记录不给改 -->
  <!-- v3.0.0 键盘避让：输入法弹起时弹层按键盘高度上移（mask padding-bottom 来自 visualViewport），
       输入框不被键盘盖住；顶部实时同步行显示完整内容（输入框只负责显示尾部和光标，
       获得焦点时光标移到文字最后、横向滚到末尾）。 -->
  <div v-if="editSheet" class="modal-mask" :style="{ paddingBottom: kbHeight + 'px' }" @click.self="editSheet = null">
    <div class="sheet panel-sheet">
      <div class="sheet-head"><h2>编辑照片文字</h2><button class="sheet-close" @click="editSheet = null">✕</button></div>
      <div class="live-preview">
        <div>项目名称：<b>{{ editProject || '（未填）' }}</b></div>
        <div>时间：{{ editTimeLocal ? editTimeLocal.replace('T', ' ') : '（未选）' }}</div>
        <div>地址：{{ editAddress || '（留空则不显示地址行）' }}</div>
      </div>
      <label class="field-label">项目名称</label>
      <div class="field-row"><input v-model="editProject" placeholder="项目名称" @focus="onEditTextFocus" /></div>
      <label class="field-label">时间</label>
      <div class="field-row"><input type="datetime-local" step="1" v-model="editTimeLocal" /></div>
      <label class="field-label">地址</label>
      <div class="field-row"><input v-model="editAddress" placeholder="地址（留空则不显示地址行）" @focus="onEditTextFocus" /></div>
      <div class="field-desc">经纬度是实测记录，不能改。保存后用留存的无水印原图重新烧水印，App 内和相册里的照片都会更新。</div>
      <div class="field-desc">经度：{{ editLonText }}　纬度：{{ editLatText }}</div>
      <div style="height:8px"></div>
      <button class="primary wide" :disabled="editSaving" @click="saveDetailEdit">{{ editSaving ? '保存中…' : '保存' }}</button>
    </div>
  </div>

  <div v-if="dragging" class="drag-badge" :style="{ left: dragging.x + 'px', top: dragging.y + 'px' }">📁 {{ dragging.n }} 张</div>

  <!-- 批量删除确认：多选模式里删选中的照片/视频，删前确认并说明系统相册那份删不掉 -->
  <div v-if="batchDeleteAsk" class="modal-mask" @click.self="batchDeleteAsk = false">
    <div class="sheet panel-sheet">
      <div class="sheet-head"><h2>删除选中的内容？</h2><button class="sheet-close" @click="batchDeleteAsk = false">✕</button></div>
      <div class="field-desc">将删除 App 内的 {{ selected.size }} 项（含照片原图），删除后无法恢复。</div>
      <div class="field-desc danger-text">注意：系统相册里的那份 App 删不掉，请去系统相册里手动删除。</div>
      <div style="height:8px"></div>
      <button class="danger-wide" :disabled="batchDeleting" @click="doBatchDelete">{{ batchDeleting ? '删除中…' : `确认删除 ${selected.size} 项` }}</button>
      <div style="height:8px"></div>
      <button class="ghost wide" @click="batchDeleteAsk = false">取消</button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onBeforeUnmount, watch } from 'vue'
import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { pushBackOverlay, removeBackOverlay, clearBackOverlays } from '../utils/backstack.js'
import {
  loadRecords, saveRecords, deleteAppFile, readAppFile, shareFile,
  getFolders, createFolder, deleteFolder, getPhotoFolderMap, getPhotoFolder, setPhotoFolder,
  getWatermarkText, setWatermarkText, getWatermarkOpacity, setWatermarkOpacity, saveToAppStorage, saveToGallery
} from '../utils/store.js'
import { toDMS, formatTime, normalizeTimeText } from '../utils/geo.js'
import { burnPhotoWatermark } from '../utils/watermark.js'
import { APP_VERSION } from '../version.js'
import { checkForUpdate } from '../utils/ota.js'
import { useKeyboardHeight, focusInputAtEnd } from '../utils/keyboard.js'
import PolicyViewer from './PolicyViewer.vue'
import UpdatePrompt from './UpdatePrompt.vue'

const emit = defineEmits(['saved'])

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
const wmOpacity = ref(getWatermarkOpacity())
// 输入法键盘高度（v3.0.0）：供详情编辑弹层上移避让
const kbHeight = useKeyboardHeight()
// OTA 手动检查更新（v3.0.0）：updateRemote 有值时弹更新提示框
const updateRemote = ref(null)
const checkingUpdate = ref(false)
const updateStatus = ref('')
// 隐私政策 / 用户协议全文查看（v2.1.8）：打开打包进 App 的本地副本，离线也能看
const policyDoc = ref(null)
const today = formatTime().slice(0, 10)
const worksEl = ref(null)

// ---- 相册搜索（v3.0.0）：按项目名称、地址、日期实时过滤，不区分大小写；
// 项目名称优先（排前面），再是地址，最后是日期；分组和文件夹结构保持不变，只过滤内容。
// 日期直接对 time（"YYYY-MM-DD HH:mm:ss"）做包含匹配，输 "11-19" 也能命中当天。
const searchText = ref('')
const searchQuery = computed(() => searchText.value.trim().toLowerCase())
const isSearching = computed(() => searchQuery.value !== '')
function matchScore(rec, q) {
  const project = String(rec.project || '').toLowerCase()
  if (project.includes(q)) return 0 // 项目名称优先
  const address = String(rec.address || '').toLowerCase()
  if (address.includes(q)) return 1
  const time = String(rec.time || '').toLowerCase()
  if (time.includes(q)) return 2
  return -1
}
const filteredRecords = computed(() => {
  const q = searchQuery.value
  if (!q) return records.value
  return records.value
    .map((r) => ({ r, score: matchScore(r, q) }))
    .filter((x) => x.score >= 0)
    .sort((a, b) => (a.score - b.score) || (a.r.time < b.r.time ? 1 : -1))
    .map((x) => x.r)
})

// ---- 详情页连点 7 次编辑文字 ----
// 点进一张照片，在详情大图上 3 秒内连续点 7 次，打开编辑：项目名称 / 时间 / 地址可改，
// 经纬度是实测记录不给改。时间用日期时间输入（保持 YYYY-MM-DD HH:mm:ss 格式）。
// 保存后用 App 内留存的无水印原图（_orig.jpg）重新烧水印并替换这张照片。
// 第 3、4 次点击给轻提示“再点 N 次可编辑文字”；只对照片生效（视频没有原图可重烧）。
const editSheet = ref(null) // 正在编辑的记录
const editProject = ref('')
const editTimeLocal = ref('') // datetime-local 的值：YYYY-MM-DDTHH:mm:ss
const editAddress = ref('')
const editLonText = ref('')
const editLatText = ref('')
const editSaving = ref(false)
let detailTapCount = 0
let detailTapLast = 0
let lastSwipeAt = 0 // 刚滑过一张照片：300ms 内那次 click 不算连点
function onDetailImageTap() {
  if (!detail.value || detail.value.type !== 'photo') return
  if (Date.now() - lastSwipeAt < 500) return // 滑动结束后的 click 不累计 7 击
  const now = Date.now()
  if (now - detailTapLast > 3000) detailTapCount = 0 // 超过 3 秒没点：清零重数
  detailTapLast = now
  detailTapCount++
  if (detailTapCount === 3 || detailTapCount === 4) {
    showToast(`再点 ${7 - detailTapCount} 次可编辑文字`)
    return
  }
  if (detailTapCount >= 7) {
    detailTapCount = 0
    openDetailEdit()
  }
}
function openDetailEdit() {
  const rec = detail.value
  if (!rec) return
  // 老照片没存原图（v2.1.6 之前拍的）：没法重烧，明确提示
  if (!rec.origPath) {
    showToast('这张老照片没有留存原图，无法编辑文字（新拍的照片可以）')
    return
  }
  editProject.value = rec.project || ''
  editTimeLocal.value = (rec.time || '').replace(' ', 'T')
  editAddress.value = rec.address || ''
  editLonText.value = rec.lon != null ? toDMS(rec.lon, false) : '未定位'
  editLatText.value = rec.lat != null ? toDMS(rec.lat, true) : '未定位'
  editSheet.value = rec
}
function thumbFromDataUrl(dataUrl) {
  return new Promise((resolve) => {
    const img = new Image()
    img.onload = () => {
      const k = Math.min(1, 320 / Math.max(img.naturalWidth, img.naturalHeight))
      const c = document.createElement('canvas')
      c.width = Math.round(img.naturalWidth * k)
      c.height = Math.round(img.naturalHeight * k)
      c.getContext('2d').drawImage(img, 0, 0, c.width, c.height)
      resolve(c.toDataURL('image/jpeg', 0.8))
    }
    img.onerror = () => resolve('')
    img.src = dataUrl
  })
}
async function saveDetailEdit() {
  const rec = editSheet.value
  if (!rec || editSaving.value) return
  const time = normalizeTimeText(editTimeLocal.value)
  if (!time) { showToast('时间格式不对，请选一个有效的时间'); return }
  editSaving.value = true
  try {
    // 读无水印原图（App 内 _orig.jpg）
    let origDataUrl = ''
    try {
      origDataUrl = await readAppFile(rec.origPath, 'image/jpeg')
    } catch {
      showToast('原图找不到了，无法编辑文字')
      return
    }
    const meta = {
      project: editProject.value.trim(),
      time,
      lon: rec.gcjLon != null ? rec.gcjLon : rec.lon,
      lat: rec.gcjLat != null ? rec.gcjLat : rec.lat,
      address: editAddress.value.trim(),
      watermarkText: getWatermarkText(),
      opacity: getWatermarkOpacity()
    }
    // 原图已是裁剪好的画面，不再按比例裁剪，直接重烧
    const { blob, dataUrl } = await burnPhotoWatermark(origDataUrl, meta)
    // 覆盖 App 内原文件（同名同路径），再存一份到相册
    const saved = await saveToAppStorage(blob, rec.path.split('/').pop())
    const gal = await saveToGallery({ fileUri: saved.uri, isVideo: false })
    const thumb = await thumbFromDataUrl(dataUrl)
    const list = loadRecords()
    const hit = list.find((x) => x.id === rec.id)
    if (hit) {
      hit.project = meta.project
      hit.time = meta.time
      hit.address = meta.address
      hit.thumb = thumb
      hit.gallery = gal.where
      hit.galleryNote = gal.reason || gal.note || ''
      saveRecords(list)
    }
    detail.value = hit || { ...rec, project: meta.project, time: meta.time, address: meta.address, thumb }
    detailUrl.value = dataUrl
    editSheet.value = null
    refresh()
    showToast('已更新，照片已重新烧水印')
  } catch (e) {
    showToast('保存失败：' + (e && e.message ? e.message : e))
  } finally {
    editSaving.value = false
  }
}
watch(editSheet, (open) => {
  if (open) pushBackOverlay('works-edit-text', () => { editSheet.value = null })
  else removeBackOverlay('works-edit-text')
})

// ---- 长按多选 + 拖进文件夹 ----
// 长按一张照片（500ms 不动）进入多选模式并选中它；多选模式下点按切换选择；
// 在已选中的照片上按住拖动，拖到某个文件夹上松手，所有选中的一起移进去。
// 返回键先退出多选（走现有的返回栈）；顶部栏有取消/完成入口。
const selected = ref(new Set())
const selectMode = computed(() => selected.value.size > 0)
const dropTarget = ref(null) // 手指正经过的文件夹 id（高亮用）
const dragging = ref(null) // { n, x, y }：拖动中的数量角标位置
let lpTimer = null
let lpState = null // { id, startX, startY }：长按计时中的手指
let cellDragState = null // { id, startX, startY, active }：多选模式下拖动中的手指
let suppressCellClick = false // 长按/拖动结束后的那次 click 要吞掉，否则会打开详情或误切换选择

watch(selectMode, (open) => {
  if (open) pushBackOverlay('works-multiselect', exitSelectMode)
  else removeBackOverlay('works-multiselect')
})
function exitSelectMode() {
  selected.value = new Set()
  dropTarget.value = null
  dragging.value = null
}
function isSelected(id) {
  return selected.value.has(id)
}
function toggleSelect(id) {
  const s = new Set(selected.value)
  if (s.has(id)) s.delete(id)
  else s.add(id)
  selected.value = s
}
function onCellPointerDown(it, e) {
  if (e.button != null && e.button !== 0) return
  if (selectMode.value) {
    // 多选模式下：只在已选中的照片上准备拖动；未选中的交给点按切换
    if (isSelected(it.id)) {
      cellDragState = { id: it.id, startX: e.clientX, startY: e.clientY, active: false }
    }
    return
  }
  lpState = { id: it.id, startX: e.clientX, startY: e.clientY }
  clearTimeout(lpTimer)
  lpTimer = setTimeout(() => {
    lpTimer = null
    lpState = null
    // 长按进入多选：选中这一张；抑制随后的 click（否则会打开详情）
    suppressCellClick = true
    toggleSelect(it.id)
    try { if (navigator.vibrate) navigator.vibrate(20) } catch { /* ignore */ }
  }, 500)
}
function onCellPointerMove(e) {
  if (lpState) {
    // 长按计时中手指动了 > 10px：当成滚动，取消长按
    if (Math.hypot(e.clientX - lpState.startX, e.clientY - lpState.startY) > 10) {
      clearTimeout(lpTimer)
      lpTimer = null
      lpState = null
    }
    return
  }
  if (!cellDragState) return
  const dx = e.clientX - cellDragState.startX
  const dy = e.clientY - cellDragState.startY
  if (!cellDragState.active) {
    if (Math.hypot(dx, dy) < 12) return
    cellDragState.active = true
    dragging.value = { n: selected.value.size, x: e.clientX, y: e.clientY }
    try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* ignore */ }
  }
  dragging.value = { n: selected.value.size, x: e.clientX, y: e.clientY }
  updateDropTarget(e.clientX, e.clientY)
  autoScrollWorks(e.clientY)
}
function onCellPointerUp() {
  clearTimeout(lpTimer)
  lpTimer = null
  lpState = null
  if (cellDragState && cellDragState.active) {
    const target = dropTarget.value
    cellDragState = null
    dragging.value = null
    dropTarget.value = null
    suppressCellClick = true
    setTimeout(() => { suppressCellClick = false }, 1000) // 兜底：click 没触发时 1 秒后清掉
    if (target) moveSelectedToFolder(target)
    return
  }
  cellDragState = null
}
function onCellPointerCancel() {
  clearTimeout(lpTimer)
  lpTimer = null
  lpState = null
  cellDragState = null
  dragging.value = null
  dropTarget.value = null
}
function updateDropTarget(x, y) {
  const el = document.elementFromPoint(x, y)
  const card = el && el.closest ? el.closest('.folder-card') : null
  dropTarget.value = card ? card.getAttribute('data-folder-id') : null
}
function autoScrollWorks(clientY) {
  const el = worksEl.value
  if (!el) return
  // 拖到上下边缘时慢慢滚动列表，让屏幕外的文件夹也能拖到
  if (clientY < 110) el.scrollBy(0, -16)
  else if (clientY > window.innerHeight - 130) el.scrollBy(0, 16)
}
function moveSelectedToFolder(folderId) {
  const folder = folders.value.find((f) => f.id === folderId)
  if (!folder || selected.value.size === 0) return
  const ids = [...selected.value]
  ids.forEach((id) => setPhotoFolder(id, folderId))
  const n = ids.length
  exitSelectMode()
  expandedFolders.value.add(folderId) // 打开目标文件夹，让用户直接看到移进去的照片
  refresh()
  showToast(`已将 ${n} 张移入「${folder.name}」`)
}

// ---- 批量删除（多选模式）----
// 顶栏“删除”按钮 → 确认框（显示项数 + 说明系统相册那份删不掉）→ 确认后把选中的
// 照片/视频连同原图一起从 App 内删掉，列表刷新、退出多选。
// 系统相册里的那份没有按文件删除的接口，App 删不掉，确认框和提示里都写清楚。
const batchDeleteAsk = ref(false)
const batchDeleting = ref(false)
function askBatchDelete() {
  if (!selected.value.size) return
  batchDeleteAsk.value = true
}
async function doBatchDelete() {
  if (batchDeleting.value) return
  const ids = [...selected.value]
  if (!ids.length) { batchDeleteAsk.value = false; return }
  batchDeleting.value = true
  try {
    const list = loadRecords()
    const targets = list.filter((r) => ids.includes(r.id))
    for (const rec of targets) {
      await deleteAppFile(rec.path)
      if (rec.origPath) await deleteAppFile(rec.origPath)
      setPhotoFolder(rec.id, '')
    }
    records.value = list.filter((r) => !ids.includes(r.id))
    saveRecords(records.value)
    batchDeleteAsk.value = false
    exitSelectMode()
    emit('saved') // 相册 tab 角标跟着更新
    refresh()
    showToast(`已删除 ${ids.length} 项（App 内），系统相册里的请手动删`)
  } finally {
    batchDeleting.value = false
  }
}
watch(batchDeleteAsk, (open) => {
  if (open) pushBackOverlay('works-batch-delete', () => { batchDeleteAsk.value = false })
  else removeBackOverlay('works-batch-delete')
})
function onCellClick(it) {
  if (suppressCellClick) { suppressCellClick = false; return }
  if (selectMode.value) { toggleSelect(it.id); return }
  openDetail(it)
}

// 返回键弹层栈：详情弹层和新建文件夹输入区开/关时注册/注销，App.vue 的 backButton 按打开顺序倒着关。
watch(detail, (open) => {
  if (open) pushBackOverlay('works-detail', () => { detail.value = null })
  else removeBackOverlay('works-detail')
})
watch(showNewFolder, (open) => {
  if (open) pushBackOverlay('works-newfolder', () => { showNewFolder.value = false })
  else removeBackOverlay('works-newfolder')
})

let toastTimer = null
function showToast(msg, ms = 3500) {
  toast.value = msg
  clearTimeout(toastTimer)
  toastTimer = setTimeout(() => (toast.value = ''), ms)
}

// 文件夹（带照片）+ 未归档照片按日期倒序分组；今天直接展开，前一天及更早默认堆叠。
// 搜索时只对过滤后的记录分组（分组结构本身不变）。
const foldersWithItems = computed(() =>
  folders.value.map((f) => ({
    ...f,
    items: filteredRecords.value.filter((r) => photoFolder.value[r.id] === f.id)
  }))
)
const dateGroups = computed(() => {
  const map = new Map()
  for (const r of filteredRecords.value) {
    if (photoFolder.value[r.id]) continue
    const d = (r.time || '').slice(0, 10) || '未知日期'
    if (!map.has(d)) map.set(d, { date: d, items: [] })
    map.get(d).items.push(r)
  }
  return [...map.values()].sort((a, b) => (a.date < b.date ? 1 : -1))
})
// 搜索时没有匹配照片的文件夹/日期组暂时隐藏（有匹配的组保持原样）；清空搜索后全部恢复。
const visibleFolders = computed(() => (isSearching.value ? foldersWithItems.value.filter((f) => f.items.length > 0) : foldersWithItems.value))
const visibleDateGroups = computed(() => (isSearching.value ? dateGroups.value.filter((g) => g.items.length > 0) : dateGroups.value))

function refresh() {
  records.value = loadRecords()
  folders.value = getFolders()
  photoFolder.value = getPhotoFolderMap()
  // 地址后来才拿到、回填了已保存的照片：如果详情正开着，跟着更新地址显示
  if (detail.value) {
    const fresh = records.value.find((r) => r.id === detail.value.id)
    if (fresh) detail.value = fresh
  }
}

function videoUrl(it) {
  // 列表里视频用 file:// 直链大多播不了，这里只给占位：用缩略图逻辑
  // 详情页用 convertFileSrc 的 http 链接播放
  return ''
}

async function fileSrc(it) {
  const mime = it.type === 'video' ? (it.mime || 'video/webm') : 'image/jpeg'
  // 网页/PWA（v3.0.1 修）：Filesystem.getUri() 在 web 上返回的是 IndexedDB 键
  // （/DATA/works/…），不是真路径，convertFileSrc 出来的链接打不开，详情页图片裂开；
  // 非原生平台直接读文件转 data URL。原生端不受影响，仍走 getUri + convertFileSrc。
  if (!Capacitor.isNativePlatform()) {
    return await readAppFile(it.path, mime)
  }
  try {
    const { uri } = await Filesystem.getUri({ path: it.path, directory: Directory.Data })
    return Capacitor.convertFileSrc(uri)
  } catch {
    return await readAppFile(it.path, mime)
  }
}

async function openDetail(it) {
  detailTapCount = 0 // 换一张照片重数，避免上一张的点击数带过来
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
  emit('saved') // 相册 tab 角标跟着更新
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
function saveWmOpacity() {
  wmOpacity.value = setWatermarkOpacity(wmOpacity.value)
  showToast(`水印透明度已调到 ${wmOpacity.value.toFixed(2)}，新拍的照片生效`)
}
function resetWmOpacity() {
  wmOpacity.value = setWatermarkOpacity(0.2)
  showToast('水印透明度已恢复默认 0.20')
}
// 输入框获得焦点：光标移到文字最后、横向滚到末尾（长项目名/地址只看尾部和光标；
// 完整内容靠弹层顶部的实时同步行看）
function onEditTextFocus(e) {
  focusInputAtEnd(e.target)
}
// 手动检查更新（v3.0.0）：有新版本弹更新提示框；网页版/iOS/没网只给文字说明
async function onCheckUpdate() {
  if (checkingUpdate.value) return
  checkingUpdate.value = true
  updateStatus.value = ''
  try {
    const res = await checkForUpdate()
    if (res.available && res.remote) {
      updateRemote.value = res.remote
    } else if (res.reason === 'web') {
      updateStatus.value = '当前是网页版：请刷新页面更新，或用安卓 App 检查更新安装新 APK。'
    } else if (res.reason === 'ios') {
      updateStatus.value = 'iOS 版暂不支持应用内更新，请用 PWA 方式更新。'
    } else if (res.reason === 'offline') {
      updateStatus.value = '没网或连不上更新服务，稍后再试。'
      showToast('检查更新失败：没网或连不上更新服务')
    } else {
      updateStatus.value = `已是最新版本（v${APP_VERSION.version}）。`
      showToast('已是最新版本')
    }
  } catch (e) {
    updateStatus.value = '检查更新失败：' + (e && e.message ? e.message : e)
  } finally {
    checkingUpdate.value = false
  }
}

// ---- 详情页左右滑动（v3.0.0）----
// 在详情大图上左/右滑切换上一张/下一张（按列表顺序：左滑看更早的，右滑看更新的），
// 到头给提示；也可以点图片两侧的 ‹ › 按钮切换。
const swipeList = computed(() => filteredRecords.value)
const detailIndex = computed(() => (detail.value ? swipeList.value.findIndex((r) => r.id === detail.value.id) : -1))
let detailSwipeStart = null // { x, y }：本次滑动的起点
function onDetailPointerDown(e) {
  detailSwipeStart = { x: e.clientX, y: e.clientY }
}
function onDetailPointerUp(e) {
  if (!detailSwipeStart) return
  const dx = e.clientX - detailSwipeStart.x
  const dy = e.clientY - detailSwipeStart.y
  detailSwipeStart = null
  if (Math.abs(dx) < 60 || Math.abs(dy) > 50) return // 横滑不够、或竖滑为主：不算切换
  lastSwipeAt = Date.now()
  if (dx < 0) goDetailNext()
  else goDetailPrev()
}
function onDetailPointerCancel() {
  detailSwipeStart = null
}
function goDetailPrev() {
  const i = detailIndex.value
  if (i <= 0) { showToast('已经是第一张了'); return }
  openDetail(swipeList.value[i - 1])
}
function goDetailNext() {
  const i = detailIndex.value
  if (i < 0 || i >= swipeList.value.length - 1) { showToast('已经是最后一张了'); return }
  openDetail(swipeList.value[i + 1])
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

// 拍摄页顶栏菜单按钮（v3.0.1）：打开设置页——滚到最底下的设置卡片
function scrollToSettings() {
  const el = worksEl.value
  if (!el) return
  const card = el.querySelector('.settings-card')
  if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' })
}

onMounted(() => {
  refresh()
  // 地址后来才拿到并回填了已保存的照片：刷新列表（详情正开着时地址也会跟着变）
  window.addEventListener('fw-records-changed', refresh)
})
onBeforeUnmount(() => {
  clearBackOverlays() // 兜底：切 tab 卸载时清掉本页残留的弹层注册
  window.removeEventListener('fw-records-changed', refresh)
})
defineExpose({ refresh, scrollToSettings })
</script>
