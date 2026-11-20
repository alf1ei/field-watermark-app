<template>
  <!-- v3.0.2 拍摄页（第七版效果图）：顶部项目名 + 四个椭圆控制按钮在黑区里，
       中间 3:4 取景，下方模式药丸 + 快门行；底部导航是 App.vue 的拍摄/相册。 -->
  <div class="shoot" :class="{ 'native-on': nativeActive }">
  <!-- 顶区实底（v3.0.2）：.app 顶部的安全区留白在原生预览下是透明的，相机画面会从项目名称上方透出来；
       这条固定色带从屏幕最顶端（y=0）盖住安全区，和顶栏同色 #0b1220；
       切到相册时 .cam-page display:none，连它一起藏起来；不挡点击。 -->
  <div class="top-fill" aria-hidden="true"></div>
  <!-- 顶部：项目名称（v3.0.3：直接在顶栏输入框里改，不再弹确认框；输入实时显示，
       字太多时前面藏进去、只看正在输入的尾部；点右边小箭头弹出最近项目快速选）+ 四个控制按钮 -->
  <div class="topbar">
    <div class="project-row">
      <span class="project-label">项目名称</span>
      <div class="project-field">
        <div class="project-box">
          <input ref="projectInput" v-model="project" placeholder="输入项目名称" enterkeyhint="done"
            @focus="onProjectInputFocus" @input="onProjectTyping" @blur="onProjectInputBlur" @keyup.enter="commitProjectAndBlur" />
          <button class="project-chev" @click="toggleHistoryDropdown" title="最近项目" aria-label="最近项目">
            <svg class="chev" viewBox="0 0 12 12" width="12" height="12" aria-hidden="true"><path d="M2 4l4 4 4-4" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </button>
        </div>
        <div v-if="historyOpen && history.length" class="project-history">
          <div class="project-history-title">最近项目</div>
          <button v-for="h in history.slice(0, 5)" :key="h" class="project-history-item" @click="pickHistory(h)">
            <svg class="hist-clock" viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2"/><path d="M12 7v5l3.5 2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>
            <span>{{ h }}</span>
          </button>
        </div>
      </div>
    </div>
    <div class="ctrl-row">
      <button class="ctrl-btn" @click="openSettings" title="菜单：打开设置" aria-label="菜单">
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M4 6h16M4 12h16M4 18h16" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/></svg>
      </button>
      <button class="ctrl-btn" @click="cycleFlashMode" :title="'闪光灯：' + flashLabel" aria-label="闪光灯">
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M13 2L4 14h6l-1 8 9-12h-6l1-8z" fill="none" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/></svg>
        <span v-if="flashMode === 'off'" class="flash-slash" aria-hidden="true"></span>
        <span v-if="flashMode === 'auto'" class="flash-badge" aria-hidden="true">A</span>
      </button>
      <button class="ctrl-btn" @click="toggleFacing" title="前后切换" aria-label="前后切换">
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M4 8h13l-3.5-3.5M20 16H7l3.5 3.5" fill="none" stroke="#fff" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"/></svg>
      </button>
      <button class="ctrl-btn" @click="showMoreMenu = true" title="更多" aria-label="更多">
        <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z" fill="none" stroke="#fff" stroke-width="1.8" stroke-linejoin="round"/><circle cx="8.5" cy="11.5" r="1" fill="#fff"/><circle cx="12" cy="11.5" r="1" fill="#fff"/><circle cx="15.5" cy="11.5" r="1" fill="#fff"/></svg>
      </button>
    </div>
  </div>
  <div class="stage" ref="stageEl"
    @pointerdown="onStagePointerDown" @pointermove="onStagePointerMove" @pointerup="onStagePointerUp" @pointercancel="onStagePointerCancel">
    <div class="cam-wrap" ref="camWrapEl" :style="camWrapStyle">
    <!-- 快门白闪（v3.0.3 提速）：点快门立刻闪一下，不等任何步骤，体感上一点就有反应 -->
    <!-- 网页取景（录像模式 / PWA / 原生预览的网页兜底）；原生拍照预览时隐藏，画面在 WebView 之后 -->
    <video v-show="camOk && !nativeActive" ref="videoEl" autoplay muted playsinline></video>
    <div v-if="camOk" class="wm-overlay" :style="{ '--wm-opacity': wmOpacity }">
      <div class="gszd">{{ wmText }}</div>
      <!-- 信息条：半透明悬浮条，点一下收起/展开；收起时只留一行项目名 -->
      <div class="bar" :class="{ collapsed: infoCollapsed }" @click="toggleInfoBar" title="点一下收起/展开信息">
        <template v-if="!infoCollapsed">
          <div>时间：{{ nowText }}</div>
          <div>经度：{{ dispLoc.lon != null ? toDMS(dispLoc.lon, false) : '未定位' }}</div>
          <div>纬度：{{ dispLoc.lat != null ? toDMS(dispLoc.lat, true) : '未定位' }}</div>
          <div v-if="loc.address">地址：{{ loc.address }}</div>
          <div class="p">项目名称：{{ project || '（未填）' }}</div>
        </template>
        <div v-else class="bar-mini">项目名称：{{ project || '（未填）' }} · 点一下展开信息</div>
      </div>
    </div>
    <!-- 取景框就是成片框（v3.0.3 所见即所得）：cam-wrap 跟随所选比例，不再画裁剪框提示 -->
    <div v-if="recording" class="rec-chip">● {{ recTimeText }}</div>
    <div v-if="focusBox" class="focus-box" :style="{ left: focusBox.x + 'px', top: focusBox.y + 'px' }"></div>
    <div v-if="expIndicator" class="exp-indicator">☀ {{ expText }}</div>
    <!-- 重新定位准星：取景右下角，点一下重新定位（信息条右侧留空，不压文字） -->
    <button v-if="camOk" class="relocate-btn" @click="refreshLocation" title="重新定位" aria-label="重新定位">
      <svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true"><circle cx="12" cy="12" r="6.5" fill="none" stroke="#fff" stroke-width="1.8"/><circle cx="12" cy="12" r="1.6" fill="#fff"/><path d="M12 1.5v4M12 18.5v4M1.5 12h4M18.5 12h4" stroke="#fff" stroke-width="1.8" stroke-linecap="round"/></svg>
    </button>
    <div v-if="!camOk" class="cam-off">
      <div v-if="camStarting" class="cam-starting"><span class="cam-spinner"></span>正在启动相机…</div>
      <div v-else>{{ camError || '相机未启动' }}</div>
      <div v-if="!camStarting">
        <button class="primary" @click="startPhotoCamera" style="padding:10px 18px;border-radius:8px;border:none;background:#0b3d91;color:#fff;font-size:15px;">重试打开相机</button>
      </div>
      <div style="font-size:13px;">浏览器/真机上也可直接用系统相机拍照，水印同样会烧进去：</div>
      <div style="display:flex;gap:8px;flex-wrap:wrap;justify-content:center;">
        <button @click="systemCamera('camera')" style="padding:10px 14px;border-radius:8px;border:1px solid #3a4a5c;background:#0f141b;color:#fff;">系统相机</button>
        <button @click="systemCamera('album')" style="padding:10px 14px;border-radius:8px;border:1px solid #3a4a5c;background:#0f141b;color:#fff;">从相册选图</button>
        <button @click="systemVideo" style="padding:10px 14px;border-radius:8px;border:1px solid #3a4a5c;background:#0f141b;color:#fff;">系统录像</button>
      </div>
      <input ref="videoFileInput" type="file" accept="video/*" capture="environment" style="display:none" @change="onVideoFilePicked" />
    </div>
    <div v-if="shutterFlash" class="shutter-flash" aria-hidden="true"></div>
    </div>
    <!-- 定位状态浮条：只在定位中 / 定位出错时显示，点一下聚焦顶栏项目名输入框；定位就绪后隐藏（坐标看底部信息条） -->
    <div v-if="locBusy || locError" class="hint" :class="{ err: locError }" @click="focusProjectInput" title="点一下改项目名称">{{ locHint }}</div>
  </div>
  <!-- 底部控制区：模式药丸 + 快门行（不在取景上悬浮；药丸与快门同一条竖直中线） -->
  <div class="bottom-ctrl">
    <div class="mode-row">
      <button :class="{ active: systemCamActive }" :disabled="recording" @click="switchMode('system')">系统相机</button>
      <button :class="{ active: mode === 'photo' && !systemCamActive }" :disabled="recording" @click="switchMode('photo')">拍照</button>
      <button :class="{ active: mode === 'video' }" :disabled="recording" @click="switchMode('video')">录像</button>
    </div>
    <div class="shutter-row">
      <button class="circle-btn" @click="showRatioPanel = true" title="照片比例">{{ ratio }}</button>
      <button v-if="mode !== 'video'" class="shutter photo" :disabled="!camOk" @click="takePhoto" title="拍照"></button>
      <button v-else class="shutter" :class="{ rec: recording }" :disabled="!camOk" @click="recording ? stopRecording() : startRecording()">
        {{ recording ? '停止' : '录像' }}
      </button>
      <button class="circle-btn zoom-btn" @click="onZoomBtnClick"
        @pointerdown="onZoomPressStart" @pointermove="onZoomPressMove" @pointerup="onZoomPressEnd" @pointercancel="onZoomPressEnd"
        :title="nativeActive ? '点一下打开镜头面板（双指捏合变焦）' : '镜头 / 变焦：点一下打开面板，长按后上下滑调变焦（上滑拉进、下滑缩小）'">{{ zoomLabel }}</button>
    </div>
    <div v-if="zoomDragging" class="zoom-bubble">{{ zoomLabel }}</div>
  </div>
  </div>

  <!-- 更多菜单：前后切换 / 相册选图 / 重新定位 / 改项目名称
       （系统相机已升为快门上方的模式段，不再放这里，避免重复） -->
  <div v-if="showMoreMenu" class="modal-mask" @click.self="showMoreMenu = false">
    <div class="sheet panel-sheet">
      <div class="sheet-head"><h2>更多</h2><button class="sheet-close" @click="showMoreMenu = false">✕</button></div>
      <div class="pick-col">
        <button @click="moreToggleFacing">前后切换</button>
        <button @click="moreSystemAlbum">相册选图</button>
        <button @click="moreRelocate">重新定位</button>
        <button @click="moreEditProject">改项目名称</button>
      </div>
      <div class="field-desc">系统相机已移到快门上方的模式切换里，点一下就打开手机原生相机，照片同样烧水印。</div>
    </div>
  </div>

  <!-- 比例选择 -->
  <div v-if="showRatioPanel" class="modal-mask" @click.self="showRatioPanel = false">
    <div class="sheet panel-sheet">
      <div class="sheet-head"><h2>照片比例（竖屏）</h2><button class="sheet-close" @click="showRatioPanel = false">✕</button></div>
      <div class="pick-row">
        <button v-for="r in RATIO_OPTIONS" :key="r.label" :class="{ active: ratio === r.label }" @click="setRatio(r.label); showRatioPanel = false">{{ r.label }}</button>
      </div>
      <div class="field-desc">默认 3:4；取景框跟随所选比例，成片与取景一致，所见即所得，不裁切。</div>
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
      <div class="field-desc" v-else>当前摄像头不支持网页变焦（这台手机没开放变焦能力，可在上方切换镜头，或用系统相机）。</div>
      <div class="field-label">摄像头（读取手机能提供的全部摄像头）</div>
      <!-- v3.1.0 原生镜头：Camera2 列出的全部镜头（主摄/超广角/长焦/前置），带焦距和变焦范围 -->
      <div class="pick-col" v-if="nativeActive && gszdCameras.length">
        <button v-for="c in gszdCameras" :key="c.id" :class="{ active: isCameraActive(c) }" @click="switchCamera(c)">{{ gszdCameraLabel(c) }}</button>
      </div>
      <div class="field-desc" v-else-if="nativeActive && gszdCamerasLoading">正在读取摄像头…</div>
      <div v-else-if="nativeActive">
        <div class="field-desc">没读到摄像头（这台手机暂时没把镜头列表交给 App）。</div>
        <button class="ghost" @click="refreshGszdCameras(true)">重新读取</button>
      </div>
      <div class="pick-col" v-else-if="cameras.length">
        <button v-for="c in cameras" :key="c.deviceId || ('face-' + c.facing)" :class="{ active: isCameraActive(c) }" @click="switchCamera(c)">{{ c.label }}</button>
      </div>
      <div class="field-desc" v-else-if="camerasLoading">正在读取摄像头…</div>
      <div v-else>
        <div class="field-desc">没读到摄像头（这台手机暂时没把摄像头列表交给网页）。</div>
        <button class="ghost" @click="listCameras(true)">重新读取</button>
      </div>
      <div class="field-desc" v-if="nativeActive">原生 Camera2 列出手机全部镜头，点一行切换；前后切换也在“更多”菜单里。</div>
      <div class="field-desc" v-else>iPhone 网页版只给前/后两个摄像头，长焦/超广角苹果不开放给网页，想用长焦请用“系统相机”。</div>
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
import { ref, computed, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import { Capacitor } from '@capacitor/core'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { Camera, CameraResultType, CameraSource } from '@capacitor/camera'
import { GszdCamera2 } from '@gszd/capacitor-camera2'
import { Haptics, ImpactStyle } from '@capacitor/haptics'
import { pushBackOverlay, removeBackOverlay, clearBackOverlays } from '../utils/backstack.js'
import { getPosition, watchPosition, wgs84ToGcj02, reverseGeocode, toDMS, formatTime, withTimeout, getCachedAddress, saveCachedAddress, distMeters, loadLastFix } from '../utils/geo.js'
import { drawWatermark, drawVideoFrame, burnPhotoWatermark, canvasToThumbDataUrl, centerCropRect, MAX_EDGE, JPEG_QUALITY } from '../utils/watermark.js'
import { getLastProject, setLastProject, getProjectHistory, loadRecords, saveRecords, saveToAppStorage, saveToGallery, copyCacheFileToData, uid, getWatermarkText, getWatermarkOpacity, deleteAppFile, backfillRecordsAddress } from '../utils/store.js'
import { focusInputAtEnd } from '../utils/keyboard.js'

const emit = defineEmits(['saved', 'open-settings'])
const videoEl = ref(null)
const project = ref(getLastProject())
const wmText = ref(getWatermarkText())
const wmOpacity = ref(getWatermarkOpacity())
const history = ref(getProjectHistory())
const mode = ref('photo')
// 系统相机段正在打开原生相机（药丸高亮用）：mode 保持 photo 不动，
// 这样系统相机回来后的恢复逻辑（按 mode 走原生/网页路线）不用改，也不会和
// visibilitychange 的 resume 抢；拍完/返回后 systemCamActive 清掉，药丸回到拍照。
const systemCamActive = ref(false)
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
const camerasLoading = ref(false) // 正在枚举摄像头（面板据此区分“读取中”和“没读到”）
const cameraId = ref(localStorage.getItem('fw_camera_device') || '')
let camEnumTimer = null // 枚举不到时的重试定时器
let camEnumAttempts = 0 // 本轮已重试次数（手动“重新读取”清零）
let camEnumRunning = false // 正在枚举（防重复调用；重试等待期间也算在内）
// 变焦：从当前视频轨的能力里读（0.5×–10× 按手机实际支持的过滤）
const zoom = ref(1)
const zoomCaps = ref(null)
// 曝光补偿能力（exposureCompensation 的 min/max/step），不支持的设备是 null
const expCaps = ref(null)
// 取景舞台：v3.0.3 所见即所得，cam-wrap 跟随所选比例（拍照模式）/ 3:4（录像模式），
// 在舞台里按最大内接矩形居中；stageBox 供 cam-wrap 尺寸和原生预览定位用
const stageEl = ref(null)
const camWrapEl = ref(null)
const stageBox = ref({ w: 0, h: 0 })
const showRatioPanel = ref(false)
const showLensPanel = ref(false)
// 更多菜单（v3.0.0）：前后切换 / 相册选图 / 重新定位 / 系统相机 / 改项目名称
const showMoreMenu = ref(false)
// 信息条收起状态（v3.0.0）：点一下收起只留一行项目名，再点展开
const infoCollapsed = ref(false)
// 项目名称：v3.0.3 直接在顶栏输入框里改，不再弹确认框；
// 输入实时显示，字太多时前面藏进去、只看正在输入的尾部（focusInputAtEnd 管光标和滚动）。
// 历史快速选择：history 是现成的 localStorage 记录（最多 10 条），点小箭头/聚焦输入框时弹出。
const projectInput = ref(null)
const historyOpen = ref(false)
let historyBlurTimer = null
// 快门白闪（v3.0.3 提速）：点快门立刻闪一下，不等任何步骤
const shutterFlash = ref(false)
const camOk = ref(false)
const camError = ref('')
const camStarting = ref(false)
const stream = ref(null)
const recording = ref(false)
const recSeconds = ref(0)
const preview = ref(null)
const toast = ref('')
const loc = ref({ lon: null, lat: null, gcjLon: null, gcjLat: null, address: '', accuracy: null })
const locBusy = ref(false)
const locError = ref(false)
const locHint = ref('正在定位…')
// locStale：当前显示的坐标是不是“上次位置”（缓存），界面会明确标出来；后台拿到新定位后清掉。
const locStale = ref(false)
// 地址状态：idle | fetching（联网取地址中）| cached（显示的是缓存地址）| ok | failed（取不到）
// 定位行据此区分“获取中”和“已失败”：失败后直接显示经纬度、地址留空，不一直卡在“获取中”。
const addrState = ref('idle')
let lastAddrCoords = null // { lon, lat }：当前显示地址所对应的 GCJ-02 坐标，移动超 500 米才重新取地址
const nowText = ref(formatTime())

// ---- 原生相机预览（v3.1.0，自研 @gszd/capacitor-camera2，Android Camera2）----
// 拍照模式在原生端走原生预览（toBack，WebView 背景透明，HTML 浮层在上）；
// 录像模式保留网页路线（水印要逐帧烧进 canvas，原生录像是无水印 mp4）。
// 插件 API（见 plugins/capacitor-camera2/src/definitions.d.ts）：
//  - startPreview({ cameraId, facing, x, y, width, height, toBack, enableZoom,
//    lockAndroidOrientation, captureWidth, captureHeight }) → 首帧出来后 resolve，
//    返回 { cameraId, facing, type, label, focalLengthMm, zoomRatioRange, exposureCompensationRange }；
//    x/y/宽高按 DIP（CSS 像素）传；captureWidth/Height 是拍照目标尺寸（3:4 → 1800×2400）；
//  - capture({ quality }) → { path, width, height }：JPEG 直接写缓存根目录，不走 base64；
//  - switchCamera({ cameraId / facing }) 前后切换或指定镜头；listCameras() 列全部镜头
//    （主摄/超广角/长焦/前置，按等效焦距分类）；setZoomRatio({ zoomRatio }) 滑动变焦；
//    getSupportedFlashModes() → { result: [] }；setFlashMode({ flashMode })，
//    不支持的模式会 reject（先读支持列表再设）；stopPreview()；isPreviewStarted()；
//    tapToFocus({ x, y })；setExposureCompensation({ value })；
//  - 启动竞态由插件处理：stopPreview() 会主动 reject 掉还没出首帧的 start 调用，
//    所以 v3.0.3 的手动 stop 标记不再需要；
//  - iOS 只有占位（方法全部 reject），起不来时 startPhotoCamera 退回网页路线。
const isNative = Capacitor.isNativePlatform()
const nativeActive = ref(false) // 原生预览正在跑（拍照模式 + 原生端）
const nativeFlashModes = ref([]) // 插件报的支持的闪光灯模式
let nativeStarting = false
// 原生镜头列表（v3.1.0）：GszdCamera2.listCameras() 的结果，作为镜头面板的数据源
// （替代 enumerateDevices 的 cameras；网页取景仍用 cameras）。
const gszdCameras = ref([]) // [{ id, facing, type, label, focalLengthMm, zoomRatioRange, ... }]
const gszdCameraId = ref(localStorage.getItem('fw_gszd_camera_id') || '')
let gszdCamerasLoading = false
// 插件 facing（front/back）和 App facing（user/environment）的互转
function gszdFacingToApp(f) { return f === 'front' ? 'user' : 'environment' }
function appFacingToGszd(f) { return f === 'user' ? 'front' : 'back' }
// startPreview / switchCamera 的返回值：镜头 id 存起来下次接着用，
// 前后方向、变焦范围、曝光范围写进现成的 facing / zoomCaps / expCaps。
function applyGszdStartResult(res) {
  if (!res) return
  if (res.cameraId) {
    gszdCameraId.value = res.cameraId
    try { localStorage.setItem('fw_gszd_camera_id', res.cameraId) } catch { /* ignore */ }
  }
  if (res.facing) facing.value = gszdFacingToApp(res.facing)
  if (res.zoomRatioRange) zoomCaps.value = { min: res.zoomRatioRange.min, max: res.zoomRatioRange.max, step: 0.1 }
  if (res.exposureCompensationRange) expCaps.value = { min: res.exposureCompensationRange.min, max: res.exposureCompensationRange.max, step: res.exposureCompensationRange.step || 0.1 }
}
async function refreshGszdCameras(force = false) {
  if (gszdCamerasLoading) return
  if (!force && gszdCameras.value.length) return
  gszdCamerasLoading = true
  try {
    const { cameras } = await GszdCamera2.listCameras()
    gszdCameras.value = cameras || []
  } catch { gszdCameras.value = [] }
  finally { gszdCamerasLoading = false }
}

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
// 地址后台重试：地址没拿到时 App 打开期间一直重试（退避 30 秒 → 60 秒 → 120 秒 → 300 秒上限），
// 拿到后停；网络恢复、重新定位时立刻重查一次。不依赖 watchPosition 的位置更新触发，
// 室内静止不动时也能重试。
let addrRetryTimer = null
let addrRetryDelay = 30000

// 返回键弹层栈：弹层开/关时注册/注销，App.vue 的 backButton 只读这个栈，
// 按打开顺序倒着关（后打开的先关）。遮罩点击、✕ 按钮、保存等任何关法都会触发 watcher 注销。
function trackOverlay(id, flagRef, close) {
  watch(flagRef, (open) => {
    if (open) pushBackOverlay(id, close)
    else removeBackOverlay(id)
  })
}
trackOverlay('cam-ratio', showRatioPanel, () => { showRatioPanel.value = false })
trackOverlay('cam-lens', showLensPanel, () => { showLensPanel.value = false })
trackOverlay('cam-more', showMoreMenu, () => { showMoreMenu.value = false })
trackOverlay('cam-history', historyOpen, () => { historyOpen.value = false })
trackOverlay('cam-preview', preview, () => { preview.value = null })
// 3:4 取景：v3.0.3 所见即所得——cam-wrap 按目标比例（拍照模式用所选比例，录像模式用 3:4）
// 在舞台里取最大内接矩形居中；取景框就是成片框，不再画裁剪框提示。
const camWrapStyle = computed(() => {
  const { w, h } = stageBox.value
  if (w <= 0 || h <= 0) return { width: '100%', height: '100%' }
  const targetR = mode.value === 'photo'
    ? (RATIO_OPTIONS.find((x) => x.label === ratio.value) || RATIO_OPTIONS[0]).value
    : 3 / 4
  let fw, fh
  if (w / h > targetR) { fh = h; fw = Math.round(h * targetR) }
  else { fw = w; fh = Math.round(w / targetR) }
  return { width: fw + 'px', height: fh + 'px' }
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
function toggleInfoBar() {
  infoCollapsed.value = !infoCollapsed.value
}
// 更多菜单里的动作：点完关菜单再执行
function moreToggleFacing() { showMoreMenu.value = false; toggleFacing() }
function moreSystemAlbum() { showMoreMenu.value = false; systemCamera('album') }
function moreRelocate() { showMoreMenu.value = false; refreshLocation() }
function moreEditProject() { showMoreMenu.value = false; focusProjectInput() }
// 顶栏菜单按钮：打开设置页（App.vue 切到相册 tab 并滚到设置卡片）
function openSettings() { emit('open-settings') }

// ---- 原生相机预览（v3.0.0）----
async function startNativePreview() {
  if (nativeActive.value || nativeStarting) return false
  nativeStarting = true
  camError.value = ''
  camStarting.value = true
  try {
    // 原生预览定位到 cam-wrap（取景框本身），不是整个 stage——v3.0.3 所见即所得，
    // cam-wrap 跟随所选比例，预览框和成片框是同一个矩形
    const wrapEl = camWrapEl.value || stageEl.value
    const rect = wrapEl ? wrapEl.getBoundingClientRect() : null
    const w = Math.round(rect && rect.width ? rect.width : window.innerWidth)
    const h = Math.round(rect && rect.height ? rect.height : window.innerHeight)
    const x = Math.round(rect ? rect.left : 0)
    const y = Math.round(rect ? rect.top : 0)
    // 拍照目标尺寸（v3.1.0）：startPreview 时就传进去，capture() 按这个尺寸拍满分辨率
    const targetRatio = (RATIO_OPTIONS.find((r) => r.label === ratio.value) || RATIO_OPTIONS[0]).value
    const { width: capW, height: capH } = captureSizeForRatio(targetRatio)
    // 先读镜头列表（有缓存跳过）：存的镜头 id 还在列表里就指定它开，不在就按前后方向让插件选默认镜头
    await refreshGszdCameras()
    const savedId = gszdCameraId.value
    const cameraId = savedId && gszdCameras.value.some((c) => c.id === savedId) ? savedId : undefined
    const res = await GszdCamera2.startPreview({
      cameraId,
      facing: appFacingToGszd(facing.value),
      x, y, width: w, height: h,
      toBack: true,
      enableZoom: true, // 双指捏合变焦（插件原生处理）
      lockAndroidOrientation: true,
      captureWidth: capW,
      captureHeight: capH
    })
    // 插件的启动竞态由它自己处理：stopPreview() 会 reject 掉还没出首帧的 start，
    // 走到这里就是正常启动成功（启动期间被停会直接抛错进 catch，不会误激活）
    applyGszdStartResult(res)
    zoom.value = 1
    nativeActive.value = true
    camOk.value = true
    camStarting.value = false
    nativeStarting = false
    try {
      const fm = await GszdCamera2.getSupportedFlashModes()
      nativeFlashModes.value = (fm && fm.result) || []
    } catch { nativeFlashModes.value = [] }
    await applyNativeFlashMode()
    return true
  } catch (e) {
    nativeActive.value = false
    camStarting.value = false
    nativeStarting = false
    return false
  }
}
async function stopNativePreview() {
  // v3.1.0：启动竞态由插件处理（stopPreview 会 reject 掉还没出首帧的 start），
  // 这里不用再记 stop 标记；先把 nativeActive 置 false、去掉透明背景。
  if (!nativeActive.value && !nativeStarting) return
  nativeActive.value = false
  try { await GszdCamera2.stopPreview() } catch { /* 已经停了 */ }
  try { document.body.classList.remove('native-preview') } catch { /* ignore */ }
}
// 原生预览的闪光灯：按支持列表设，自动→auto（不支持退 on）、常开→torch（不支持退 on）、关闭→off
// v3.1.0：新插件里 on/auto 只影响拍照那一帧（自动补光），torch 才常亮；want 映射逻辑不用改。
async function applyNativeFlashMode() {
  if (!nativeActive.value) return
  const supported = nativeFlashModes.value || []
  const has = (m) => supported.length === 0 || supported.includes(m)
  let want = 'off'
  if (flashMode.value === 'auto') want = has('auto') ? 'auto' : (has('on') ? 'on' : 'off')
  else if (flashMode.value === 'on') want = has('torch') ? 'torch' : (has('on') ? 'on' : 'off')
  try {
    await GszdCamera2.setFlashMode({ flashMode: want })
    flashOn.value = want === 'torch'
  } catch {
    try { await GszdCamera2.setFlashMode({ flashMode: 'off' }) } catch { /* ignore */ }
    flashOn.value = false
  }
}
// 拍照模式的相机入口（v3.0.0）：原生端先试原生预览 3 次，
// 都起不来退回网页路线（拍照仍能用，只是变焦/镜头能力受限）；网页端直接走网页路线。
async function startPhotoCamera() {
  if (isNative && mode.value === 'photo') {
    stopStream() // 先停网页流，避免两路抢同一个摄像头
    for (let attempt = 0; attempt < 3; attempt++) {
      if (await startNativePreview()) return
      await new Promise((r) => setTimeout(r, 500 * (attempt + 1)))
    }
    await startCamera() // 原生起不来：退回网页路线
    if (camOk.value) showToast('原生预览启动失败，已退回网页取景')
    return
  }
  await startCamera()
}
// 串行申请权限（v3.0.0，修首次启动权限弹窗撞在一起）：先定位、等它有了结果再申请相机，
// 两个系统弹窗不同时出现；定位被拒/超时不阻塞相机（后面定位流程会单独报）。
// 定位（v3.0.0 起不用 @capacitor/geolocation，不再走谷歌框架）：WebView 首次调
// navigator.geolocation 时弹系统框，所以这里用一次真实取位置探针触发弹框——
// 探针就是 getPosition()，拿到位置后 refreshLocation 会复用浏览器缓存，不用再取一次。
async function requestPermissionsSerially() {
  if (!isNative) return
  try {
    await withTimeout(getPosition(), 30000, '请求定位权限')
  } catch { /* 定位拒绝/超时不阻塞相机 */ }
  try {
    if (typeof Camera.requestPermissions === 'function') {
      await withTimeout(Camera.requestPermissions({ permissions: ['camera'] }), 30000, '请求相机权限')
    }
  } catch { /* 相机拒绝时后续启动会报清楚 */ }
}

// 打开相机：约束从严到宽逐级降级（OverconstrainedError 常见于存的 deviceId 失效、
// 或某镜头不支持指定分辨率），每级最多等 8 秒，绝不无限等；
// 降级成功后把失效的 deviceId 清掉，下次不再重复撞同一面墙。
// 注意：getUserMedia 约束里只放宽高（ideal）和前后方向/deviceId，
// zoom、对焦等能力一律在流起来之后用 track.applyConstraints 应用。
function buildCameraLevels() {
  // 录像不再重启相机流取音频（真机 2.1.5：切录像重开流常失败）：流永远只开视频，
  // 录像的音频另外单独取一路 getUserMedia({ audio: true }) 混进去。
  const audio = false
  const res = { width: { ideal: 1920 }, height: { ideal: 1080 } }
  const levels = []
  if (cameraId.value) {
    // 第 1 级：指定镜头（deviceId exact）+ 理想分辨率
    levels.push({ constraints: { video: { ...res, deviceId: { exact: cameraId.value } }, audio }, clearDeviceId: true })
    // 第 2 级：去掉 deviceId，改用前后方向 + 理想分辨率
    levels.push({ constraints: { video: { ...res, facingMode: facing.value }, audio }, clearDeviceId: true })
  } else {
    levels.push({ constraints: { video: { ...res, facingMode: facing.value }, audio }, clearDeviceId: false })
  }
  // 第 3 级：只留前后方向，不指定分辨率
  levels.push({ constraints: { video: { facingMode: facing.value }, audio }, clearDeviceId: true })
  // 第 4 级：任意摄像头
  levels.push({ constraints: { video: true, audio }, clearDeviceId: true })
  return levels
}
// getUserMedia 加手动超时：超时/失败后若底层请求稍后才成功，立刻关掉那路流，别让它占着摄像头。
async function openStream(constraints, ms) {
  const p = navigator.mediaDevices.getUserMedia(constraints) // 同步抛错时直接向上抛，无残留流
  try {
    return await withTimeout(p, ms, '打开相机')
  } catch (e) {
    p.then((stray) => stray.getTracks().forEach((t) => t.stop())).catch(() => {})
    throw e
  }
}
function cameraErrorText(e) {
  const name = (e && e.name) || ''
  if (name === 'NotAllowedError' || name === 'SecurityError') return '相机权限被拒绝，请在系统设置里给长江现场水印相机开相机权限'
  if (name === 'NotFoundError') return '没找到可用摄像头'
  if (name === 'NotReadableError' || name === 'AbortError') return '摄像头正被其他应用占用，稍后再试'
  if (e && e.code === 'TIMEOUT') return '打开相机超时（摄像头可能被其他应用占用），请重试'
  if (name === 'OverconstrainedError') return '该镜头打不开（OverconstrainedError），已试过放宽约束仍失败'
  return (e && e.message) || String(e || '未知错误')
}
// 网页路线开相机（录像模式 / PWA / 原生预览的兜底）：降级链逐级试
async function startCamera() {
  stopStream()
  // 刚停掉的流要给系统一点时间释放摄像头，立刻重开在安卓上常报
  // NotReadableError（摄像头正被占用），切镜头/重开失败多半是这个原因
  await new Promise((r) => setTimeout(r, 250))
  camError.value = ''
  camStarting.value = true
  const levels = buildCameraLevels()
  let lastErr = null
  for (let i = 0; i < levels.length; i++) {
    const level = levels[i]
    try {
      const s = await openStream(level.constraints, 8000)
      stream.value = s
      videoEl.value.srcObject = s
      // 流一拿到就亮取景，不等 play() 回来（play 慢会拖几秒才出画面）
      camOk.value = true
      camStarting.value = false
      try { await withTimeout(videoEl.value.play(), 5000, '播放取景') } catch { /* 播不起来也不阻塞，画面稍后自己起 */ }
      listCameras()
      readTrackCaps()
      // 换镜头后之前调过的曝光尽量保留（支持的镜头就恢复）
      if (exposure.value !== 0) applyExposure(exposure.value)
      // 换镜头后变焦会回到 1×，之前选过的倍数尽量恢复；新镜头不支持就回到 1×
      if (zoom.value !== 1 && zoomCaps.value) {
        const track = s.getVideoTracks()[0]
        if (track) {
          try { await track.applyConstraints({ advanced: [{ zoom: zoom.value }] }) }
          catch { zoom.value = 1 }
        }
      }
      applyFlashPreviewState()
      if (level.clearDeviceId && cameraId.value) {
        cameraId.value = ''
        try { localStorage.removeItem('fw_camera_device') } catch { /* ignore */ }
      }
      if (i > 0) showToast('指定镜头打不开，已自动用其他摄像头')
      return
    } catch (e) {
      lastErr = e
      // 权限被拒没必要继续降级，直接报错
      if (e && (e.name === 'NotAllowedError' || e.name === 'SecurityError')) break
    }
  }
  camOk.value = false
  camStarting.value = false
  camError.value = '无法打开相机：' + cameraErrorText(lastErr) + '。请检查相机权限，或用下方系统相机。'
}
// 枚举摄像头：浏览器能看到几个就列几个（安卓常有主摄/超广角/长焦；
// iPhone 网页只给前后两个，长焦/超广角苹果不开放给网页，见下方说明）。
// 真机 2.1.6：面板一直显示“正在枚举摄像头…”，镜头选不了、变焦也跟着没反应。
// 根因：listCameras 只在 startCamera 成功那一刻调一次、失败静默吞掉、再也不重试——
// 安卓 WebView 里设备列表/标签要在相机权限彻底落定后才出来，那一刻调可能正好拿到空列表，
// 之后整个会话就再也没镜头可选。修法：拿不到就带退避重试、打开面板时重读、
// 面板里给手动“重新读取”；label/deviceId 为空时用当前轨的 facingMode/序号兜底；
// 实在一个都拿不到时，用当前活着的视频轨合成“当前摄像头 + 反方向”两个条目，
// 保证面板里永远能前后切换（按 facingMode 切，不依赖 deviceId）。
async function listCameras(force = false) {
  if (!force && camEnumRunning) return
  if (force) { camEnumAttempts = 0; clearTimeout(camEnumTimer); camEnumTimer = null }
  camEnumRunning = true
  camerasLoading.value = true
  let retryPending = false
  try {
    if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
      synthesizeCamerasFromTrack()
    } else {
      const devices = await navigator.mediaDevices.enumerateDevices()
      const inputs = devices.filter((d) => d.kind === 'videoinput')
      if (!inputs.length && camEnumAttempts < 3) {
        // 空列表：权限/标签还没落定很常见，等一会儿再试几次，不要一次就判死刑
        camEnumAttempts++
        const delay = [600, 1500, 3000][camEnumAttempts - 1] || 3000
        clearTimeout(camEnumTimer)
        camEnumTimer = setTimeout(() => { camEnumRunning = false; listCameras() }, delay)
        retryPending = true
      } else if (!inputs.length) {
        synthesizeCamerasFromTrack()
      } else {
        camEnumAttempts = 0
        cameras.value = inputs.map((d, i) => {
          const label = (d.label || '').trim()
          const low = label.toLowerCase()
          let face = 'environment'
          if (low.includes('front') || label.includes('前置')) face = 'user'
          else if (low.includes('back') || low.includes('rear') || label.includes('后置')) face = 'environment'
          else face = i === 0 ? 'environment' : 'user'
          return { deviceId: d.deviceId || '', label: label || `${face === 'user' ? '前置' : '后置'}摄像头 ${i + 1}`, facing: face, synthetic: false }
        })
        adoptCurrentCamera()
      }
    }
  } catch {
    // 枚举抛错：也不要让面板一直卡在“读取中”，用当前轨合成兜底
    synthesizeCamerasFromTrack()
  } finally {
    camEnumRunning = retryPending
    if (!retryPending) camerasLoading.value = false
  }
}
// 按当前活着的视频轨认领正在用的镜头：deviceId 对得上就用它；对不上时按 facingMode 认。
function adoptCurrentCamera() {
  const track = stream.value && stream.value.getVideoTracks()[0]
  const settings = track && track.getSettings ? track.getSettings() : {}
  if (cameraId.value && cameras.value.some((c) => c.deviceId === cameraId.value)) return
  if (settings.deviceId) {
    const hit = cameras.value.find((c) => c.deviceId === settings.deviceId)
    if (hit) { cameraId.value = hit.deviceId; return }
  }
  if (settings.facingMode) {
    const hit = cameras.value.find((c) => c.facing === settings.facingMode)
    if (hit && hit.deviceId) cameraId.value = hit.deviceId
    else if (hit) facing.value = hit.facing
    return
  }
  if (cameras.value.length === 1 && cameras.value[0].deviceId) cameraId.value = cameras.value[0].deviceId
}
// 一个摄像头都枚举不到时的兜底：用当前活着的视频轨合成“当前摄像头 + 反方向”，
// 保证面板里永远能前后切换（按 facingMode 切，不依赖 deviceId）。
function synthesizeCamerasFromTrack() {
  const track = stream.value && stream.value.getVideoTracks()[0]
  if (!track) { cameras.value = []; return }
  const settings = track.getSettings ? track.getSettings() : {}
  const face = settings.facingMode || facing.value || 'environment'
  const other = face === 'user' ? 'environment' : 'user'
  const faceName = (f) => (f === 'user' ? '前置' : '后置')
  cameras.value = [
    { deviceId: settings.deviceId || '', label: `当前摄像头（${faceName(face)}）`, facing: face, synthetic: true },
    { deviceId: '', label: `切换到${faceName(other)}摄像头`, facing: other, synthetic: true }
  ]
}
function isCameraActive(c) {
  if (c.id) return gszdCameraId.value === c.id // v3.1.0 原生镜头
  if (c.deviceId) return cameraId.value === c.deviceId
  return facing.value === c.facing
}
// v3.1.0 原生镜头在面板里的一行：标签 + 焦距 + 变焦范围（如“后置 · 超广角 · 13mm · 0.5×–10×”）
function gszdCameraLabel(c) {
  let s = c.label || ''
  if (c.focalLengthMm) s += ` · ${c.focalLengthMm}mm`
  if (c.zoomRatioRange) s += ` · ${formatZoom(c.zoomRatioRange.min)}–${formatZoom(c.zoomRatioRange.max)}`
  return s
}
// 面板里点一个摄像头：有 deviceId 按 deviceId 切；没有（合成条目）按前后方向切。
function switchCamera(c) {
  if (!c) return
  if (c.id) return switchCameraById(c.id) // v3.1.0 原生镜头（GszdCamera2.listCameras）
  if (c.deviceId) return switchCameraById(c.deviceId)
  return switchCameraByFacing(c.facing)
}
// 没有可用 deviceId 时按前后方向切镜头（清掉存的 deviceId，约束里只用 facingMode）。
async function switchCameraByFacing(f) {
  if (nativeActive.value) {
    // v3.1.0：原生预览下按前后方向切镜头
    try {
      const res = await GszdCamera2.switchCamera({ facing: appFacingToGszd(f) })
      applyGszdStartResult(res)
      zoom.value = 1
    } catch (e) {
      showToast('切换镜头失败：' + (e && e.message ? e.message : e))
    }
    showLensPanel.value = false
    return
  }
  cameraId.value = ''
  try { localStorage.removeItem('fw_camera_device') } catch { /* ignore */ }
  facing.value = f
  zoom.value = 1
  showLensPanel.value = false
  await startCamera()
}
// 打开镜头面板时重读一次摄像头列表（启动时那次可能正好拿到空列表，面板里要能补上）。
watch(showLensPanel, (open) => {
  if (!open) return
  if (nativeActive.value) refreshGszdCameras()
  else if (!cameras.value.length) listCameras()
})
// 原生预览开/关时切换 WebView 透明背景（插件把预览放 WebView 之后，body 渐变背景必须透明才透得出来）
watch(nativeActive, (on) => {
  try { document.body.classList.toggle('native-preview', on) } catch { /* ignore */ }
})
async function setRatio(label) {
  const changed = ratio.value !== label
  ratio.value = label
  try { localStorage.setItem('fw_photo_ratio', label) } catch {}
  // 取景框跟随比例变了：原生预览要按新的 cam-wrap 位置重开，不然画面还留在旧框里
  if (changed && nativeActive.value && mode.value === 'photo') {
    await nextTick()
    await stopNativePreview()
    await startPhotoCamera()
  }
}
function fitStage() {
  const el = stageEl.value
  if (!el) return
  stageBox.value = { w: el.clientWidth, h: el.clientHeight }
}
function formatZoom(z) {
  return (Number.isInteger(z) ? String(z) : z.toFixed(1)) + '×'
}
// 从当前视频轨读能力：变焦范围 + 曝光补偿 + 是否支持闪光灯；换镜头后重新读。
function readTrackCaps() {
  const track = stream.value && stream.value.getVideoTracks()[0]
  if (!track || !track.getCapabilities) { zoomCaps.value = null; expCaps.value = null; return }
  // 换了镜头/流：变焦失败标记清掉，新镜头重新试；曝光不支持的提示也清掉重算
  zoomBroken = false
  expToastShown = false
  try {
    const caps = track.getCapabilities()
    // 真机 2.1.5：1× 按钮滑动和双指捏合都没反应——根因是这台手机的摄像头
    // 不在 getCapabilities 里报 zoom，zoomCaps 是 null，变焦入口直接就退出了。
    // 报不出来不等于不支持：先给一个默认范围（1×–10×），真调时 applyConstraints 试一次，
    // 失败再回滚并提示“不支持变焦”，不要一开始就把路堵死。
    zoomCaps.value = caps.zoom
      ? { min: caps.zoom.min, max: caps.zoom.max, step: caps.zoom.step || 0.1 }
      : { min: 1, max: 10, step: 0.1 }
    if (zoom.value < zoomCaps.value.min) zoom.value = zoomCaps.value.min
    if (zoom.value > zoomCaps.value.max) zoom.value = zoomCaps.value.max
    expCaps.value = caps.exposureCompensation
      ? { min: caps.exposureCompensation.min, max: caps.exposureCompensation.max, step: caps.exposureCompensation.step || 0.1 }
      : null
    track._torchSupported = !!caps.torch
    // 用轨的实际设置校准当前倍数（换镜头后 getSettings().zoom 就是这路的真实倍数）
    try {
      const settings = track.getSettings ? track.getSettings() : {}
      if (typeof settings.zoom === 'number' && Number.isFinite(settings.zoom)) {
        zoom.value = settings.zoom
        zoomLastGood = settings.zoom
      }
    } catch { /* ignore */ }
  } catch { zoomCaps.value = null; expCaps.value = null }
}
async function applyZoom(z) {
  const prev = zoom.value
  zoom.value = z
  const ok = await tryApplyZoom(z)
  if (!ok) {
    // 变焦失败不把流搞崩：倍数回到之前的值，界面不显示一个实际没生效的倍数
    zoom.value = prev
    if (!nativeActive.value) readTrackCaps() // 原生预览没有视频轨，别让 readTrackCaps 把插件的 zoomCaps 清掉
  }
}
// 拖动/捏合里调变焦共用：先试 applyConstraints，成功才算数；失败回滚到上次成功的倍数，
// 并记下来（同一路流不再反复试），提示一次“不支持变焦”。
let zoomBroken = false
let zoomLastGood = 1
async function tryApplyZoom(z) {
  // v3.1.0：原生预览下变焦走插件（setZoomRatio，滑动变焦），不走视频轨
  if (nativeActive.value) {
    try {
      const res = await GszdCamera2.setZoomRatio({ zoomRatio: z })
      zoom.value = res && typeof res.zoomRatio === 'number' ? res.zoomRatio : z
      zoomLastGood = zoom.value
      return true
    } catch {
      return false
    }
  }
  if (zoomBroken) return false
  const track = stream.value && stream.value.getVideoTracks()[0]
  if (!track || track.readyState !== 'live') return false
  try {
    await track.applyConstraints({ advanced: [{ zoom: z }] })
    zoomLastGood = z
    return true
  } catch {
    // 失败：真实上限可能比默认的 1×–10× 小（这台手机不报 zoom 能力），
    // 把上限收到上次成功的倍数，同一手势里不再反复试；下个新手势重读能力再试。
    // 连最小倍数之上都调不动时，说明这路根本不支持变焦，caps 清掉，面板显示“不支持变焦”。
    if (zoomCaps.value) {
      if (zoomLastGood > zoomCaps.value.min) zoomCaps.value = { ...zoomCaps.value, max: zoomLastGood }
      else zoomCaps.value = null
    }
    zoomBroken = true
    zoom.value = zoomLastGood
    showToast('当前摄像头不支持变焦')
    return false
  }
}

// ---- 变焦按钮长按上下滑（v2.1.6，用户反馈 v2.1.5 的按住就滑没反应）：----
// 按住 1× 圆钮约 350ms 后进入滑动变焦（震动一下 + 气泡提示），再上下滑调变焦
// （上滑拉进、下滑缩小）；没到长按时间就松手当点按，打开镜头/变焦面板。
// 原生预览下不用这套：变焦是插件的双指捏合，按钮只显示倍数，点一下给提示。
const zoomDragging = ref(false)
let zoomLongTimer = null
let zoomPressState = null // { startY, startZoom, active, lastApplied }
let zoomSuppressClick = false
function onZoomPressStart(e) {
  // v3.1.0：原生预览也走长按滑动变焦（调插件 setZoomRatio，取景器捏合是另一路），
  // 变焦范围用 startPreview 返回的 zoomCaps；网页路线才重读视频轨能力。
  if (!nativeActive.value) readTrackCaps()
  const caps = zoomCaps.value
  if (!caps) { zoomPressState = null; return } // 实在没有变焦能力：纯点按
  zoomPressState = { startY: e.clientY, startZoom: zoom.value, active: false, lastApplied: zoom.value }
  try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* ignore */ }
  clearTimeout(zoomLongTimer)
  zoomLongTimer = setTimeout(() => {
    zoomLongTimer = null
    if (!zoomPressState) return
    zoomPressState.active = true
    zoomDragging.value = true
    try { if (navigator.vibrate) navigator.vibrate(20) } catch { /* ignore */ }
  }, 350)
}
function onZoomPressMove(e) {
  if (!zoomPressState || !zoomPressState.active) return
  if (!nativeActive.value && zoomBroken) return // 网页路线变焦失败后同一手势不再反复试；原生走插件，不受 zoomBroken 影响
  const dy = zoomPressState.startY - e.clientY // 上滑为正（放大）
  const caps = zoomCaps.value
  if (!caps) return
  // 上滑 120px 变焦翻一倍（指数映射：低倍微调、高倍大步），夹到设备变焦范围
  let z = zoomPressState.startZoom * Math.pow(2, dy / 120)
  z = Math.min(caps.max, Math.max(caps.min, z))
  z = Math.round(z * 10) / 10
  if (Math.abs(z - zoomPressState.lastApplied) < 0.05 && z !== caps.min && z !== caps.max) return
  zoomPressState.lastApplied = z
  zoom.value = z // 右上角 1× 标签同步更新（zoomLabel 是 zoom 的 computed），拖动气泡也同步
  tryApplyZoom(z)
}
function onZoomPressEnd() {
  clearTimeout(zoomLongTimer)
  zoomLongTimer = null
  if (!zoomPressState) return
  const wasDrag = zoomPressState.active
  zoomPressState = null
  zoomDragging.value = false
  if (wasDrag) {
    // 拖过：接下来的 click 是长按滑动的收尾，不打开面板；click 晚于 pointerup 触发，
    // 所以先立 flag、由 click 处理里消费，1 秒后兜底清掉（防止 click 没触发时 flag 残留）
    zoomSuppressClick = true
    setTimeout(() => { zoomSuppressClick = false }, 1000)
  }
}
function onZoomBtnClick() {
  if (zoomSuppressClick) { zoomSuppressClick = false; return }
  if (nativeActive.value) {
    // v3.1.0：原生预览点按变焦按钮 = 打开镜头面板（主摄/超广角/长焦/前置随便点），
    // 前后切换挪到“更多”菜单（moreToggleFacing）。v3.0.2 是点按切换前后镜头，
    // 那时插件没有多镜头接口；现在 Camera2 插件列得出全部镜头，不用再绕路。
    showLensPanel.value = true
    return
  }
  showLensPanel.value = true
}

// ---- 取景器手势（v2.1.6，统一用 pointer 事件，按手指数量区分）：----
// 单指点按 = 对焦（对焦框 + 硬件对焦点）；单指竖向滑动 = 调曝光（上滑变亮、下滑变暗）；
// 双指 = 捏合缩放。两指按下后就不再走曝光逻辑；和 1× 按钮的长按滑动不冲突
// （按钮在控制区，手势在取景器 stage 上）。
// 原生预览下这套不跑：对焦/捏合由插件原生处理（tapToFocus + enableZoom），
// JS 再插手会和原生手势抢。
const focusBox = ref(null) // { x, y }：对焦框在取景框内的位置（px），短暂显示后自动消失
const expIndicator = ref(false) // 曝光指示（☀ + 数值）是否显示
const exposure = ref(0) // 当前曝光补偿值（EV），对焦/换位置不重置
const expText = computed(() => {
  const v = exposure.value
  return (v > 0 ? '+' : '') + (Number.isInteger(v) ? String(v) : v.toFixed(1))
})
let focusHideTimer = null
let expHideTimer = null
let stagePointers = new Map() // pointerId → { x, y }：当前按在取景器上的手指
let stageGesture = null // { kind:'tap', startX, startY } | { kind:'exposure', startY, startExp } | { kind:'pinch', startDist, startZoom, lastApplied }
let expToastShown = false // 不支持曝光补偿时只提示一次，避免滑动中反复弹

// 点按位置换算到取景框内的坐标（nx/ny 是归一化 0–1，给硬件对焦点用）；
// 点在取景框外的黑边上返回 null，不管。
function stagePoint(clientX, clientY) {
  const wrap = stageEl.value && stageEl.value.querySelector('.cam-wrap')
  if (!wrap) return null
  const r = wrap.getBoundingClientRect()
  const x = clientX - r.left
  const y = clientY - r.top
  if (x < 0 || y < 0 || x > r.width || y > r.height) return null
  return { x, y, nx: x / r.width, ny: y / r.height }
}
function showFocusBox(p) {
  focusBox.value = { x: p.x, y: p.y }
  clearTimeout(focusHideTimer)
  focusHideTimer = setTimeout(() => { focusBox.value = null }, 2000)
}
function showExpIndicator() {
  expIndicator.value = true
  clearTimeout(expHideTimer)
  expHideTimer = setTimeout(() => { expIndicator.value = false }, 1500)
}
async function applyExposure(v) {
  const track = stream.value && stream.value.getVideoTracks()[0]
  if (!track) return false
  try {
    await track.applyConstraints({ advanced: [{ exposureCompensation: v }] })
    exposure.value = v
    return true
  } catch { return false }
}
async function focusAt(p) {
  showFocusBox(p)
  const track = stream.value && stream.value.getVideoTracks()[0]
  if (!track || !track.getCapabilities) return // 不支持硬件对焦：只显示对焦框做视觉反馈
  let caps = null
  try { caps = track.getCapabilities() } catch { /* ignore */ }
  if (!caps || !caps.pointsOfInterest) return
  const focusMode = caps.focusMode && caps.focusMode.includes('single-shot')
    ? 'single-shot'
    : (caps.focusMode && caps.focusMode.includes('continuous') ? 'continuous' : null)
  if (!focusMode) return
  try {
    await track.applyConstraints({ advanced: [{ pointsOfInterest: [{ x: p.nx, y: p.ny }], focusMode }] })
  } catch { /* 硬件对焦失败也不影响拍摄，只留对焦框 */ }
}
function onStagePointerDown(e) {
  // 信息条（点它收起/展开）、重新定位准星、定位提示、相机未启动面板上的按钮：各有自己的点击，不触发对焦/曝光
  if (e.target && e.target.closest && e.target.closest('.bar, .relocate-btn, .cam-off, .hint')) return
  if (nativeActive.value) return // 原生预览：对焦/捏合由插件处理
  if (!camOk.value) return
  stagePointers.set(e.pointerId, { x: e.clientX, y: e.clientY })
  try { e.currentTarget.setPointerCapture(e.pointerId) } catch { /* ignore */ }
  if (stagePointers.size === 2) {
    // 第二指按下：转捏合缩放；之前那根手指的点按/曝光状态作废。
    // 捏合开始前重读一次变焦能力（之前读失败/没读到时这里补上），并清掉上次的
    // 变焦失败标记——否则一次失败就把捏合锁死到下次重启相机（真机 2.1.6 的坑）。
    readTrackCaps()
    const pts = [...stagePointers.values()]
    stageGesture = { kind: 'pinch', startDist: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y), startZoom: zoom.value, lastApplied: zoom.value }
    return
  }
  if (stagePointers.size === 1) {
    stageGesture = { kind: 'tap', startX: e.clientX, startY: e.clientY }
  }
}
function onStagePointerMove(e) {
  const pt = stagePointers.get(e.pointerId)
  if (!pt) return
  pt.x = e.clientX
  pt.y = e.clientY
  if (stagePointers.size === 2 && stageGesture && stageGesture.kind === 'pinch') {
    const pts = [...stagePointers.values()]
    const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y)
    if (!stageGesture.startDist) return
    if (zoomBroken) return
    const caps = zoomCaps.value
    if (!caps) return
    let z = stageGesture.startZoom * (d / stageGesture.startDist)
    z = Math.min(caps.max, Math.max(caps.min, z))
    z = Math.round(z * 10) / 10
    if (Math.abs(z - stageGesture.lastApplied) < 0.05) return
    stageGesture.lastApplied = z
    zoom.value = z
    tryApplyZoom(z)
    return
  }
  if (stagePointers.size === 1 && stageGesture) {
    const dx = e.clientX - stageGesture.startX
    const dy = e.clientY - stageGesture.startY
    if (stageGesture.kind === 'tap') {
      // 还没定性：竖向滑动超 12px 且以竖向为主 → 转调曝光；横向为主 → 取消点按（横滑不管）
      if (Math.abs(dy) > 12 && Math.abs(dy) > Math.abs(dx) * 1.2) {
        if (!expCaps.value) {
          if (!expToastShown) { expToastShown = true; showToast('当前摄像头不支持曝光调节') }
          stageGesture = null
          return
        }
        stageGesture = { kind: 'exposure', startY: e.clientY, startExp: exposure.value }
        showExpIndicator()
      } else if (Math.abs(dx) > 12 || Math.abs(dy) > 12) {
        stageGesture = null // 横滑/斜滑：不做对焦也不调曝光
      }
      return
    }
    if (stageGesture.kind === 'exposure') {
      const caps = expCaps.value
      if (!caps) return
      // 上滑 120px 加 1 EV，夹到设备曝光补偿范围，按 step 取整
      let v = stageGesture.startExp + (stageGesture.startY - e.clientY) / 120
      v = Math.min(caps.max, Math.max(caps.min, v))
      const step = caps.step || 0.1
      v = Math.round(v / step) * step
      v = Math.round(v * 100) / 100
      if (v === exposure.value) return
      exposure.value = v // 指示实时更新；硬件应用失败时不回写
      applyExposure(v)
      showExpIndicator()
    }
  }
}
function onStagePointerUp(e) {
  const wasTap = stageGesture && stageGesture.kind === 'tap'
  const tapX = wasTap ? stageGesture.startX : null
  const tapY = wasTap ? stageGesture.startY : null
  stagePointers.delete(e.pointerId)
  if (stageGesture && stageGesture.kind === 'pinch' && stagePointers.size === 1) {
    // 捏合剩一指：剩下的手指重新起一个点按状态，避免用旧的起点误触发曝光
    const rest = [...stagePointers.values()][0]
    stageGesture = { kind: 'tap', startX: rest.x, startY: rest.y }
    return
  }
  stageGesture = null
  // 单指点按（没滑动）：对着点按的位置对焦
  if (wasTap && tapX != null && tapY != null) {
    const p = stagePoint(tapX, tapY)
    if (p) focusAt(p)
  }
}
function onStagePointerCancel(e) {
  stagePointers.delete(e.pointerId)
  if (stagePointers.size < 2) stageGesture = null
}
// 项目名称：v3.0.3 直接在顶栏输入框里改，不再弹确认框。
// 输入时只更新本地值（不写历史，避免打字过程中半截词污染最近项目）；
// 失焦/回车/拍照时 commitProject 再写进 localStorage + 历史。
function focusProjectInput() {
  const input = projectInput.value
  if (input) focusInputAtEnd(input)
}
function onProjectInputFocus(e) {
  focusInputAtEnd(e.target)
  if (history.value.length) historyOpen.value = true
}
function onProjectTyping() {
  // 打字时不保存，只保证正在输入的尾部可见（输入框原生会跟随光标滚动）
}
function onProjectInputBlur() {
  // 失焦后稍等一下再关下拉，让点历史条目的 click 先触发
  clearTimeout(historyBlurTimer)
  historyBlurTimer = setTimeout(() => { historyOpen.value = false }, 150)
  commitProject()
}
function commitProject() {
  const name = (project.value || '').trim()
  project.value = name
  setLastProject(name)
  history.value = getProjectHistory()
}
function commitProjectAndBlur() {
  commitProject()
  historyOpen.value = false
  if (projectInput.value) projectInput.value.blur()
}
function toggleHistoryDropdown() {
  if (historyOpen.value) { historyOpen.value = false; return }
  if (!history.value.length) { showToast('还没有最近项目，先输一个吧'); return }
  historyOpen.value = true
  focusProjectInput()
}
function pickHistory(name) {
  clearTimeout(historyBlurTimer)
  project.value = name
  commitProject()
  historyOpen.value = false
  if (projectInput.value) projectInput.value.blur()
}

// ---- 闪光灯：自动模式下预览时补光灯保持关闭，只在按快门拍照那一刻才按亮度决定开不开灯 ----
// 之前每 1.5 秒采样、暗了就把灯开着的做法是错的：没拍照灯就自己亮了。
// “常开”才在预览时一直亮；“关闭”永远不亮；录像时自动模式在开录时按亮度决定，停录关灯。
// 原生预览下不走这套采样逻辑：直接按支持列表设插件的闪光模式（见 applyNativeFlashMode）。
let flashCanvas = null
// 录像时自动闪光灯是否亮着（停录时要关掉）
let recFlashLit = false
// 自动闪光的亮度阈值：取景画面是自动曝光提亮过的，暗场景的采样亮度也常在 50–70，
// 旧阈值 45 几乎永远判“不暗”，灯就一直不亮；提到 80 才能在暗光下真正触发。
const FLASH_LUMA_THRESHOLD = 80
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
    if (on) track._torchWorks = true
    return true
  } catch {
    // 只在“开灯”失败时记下来（关灯失败不说明没灯）；记下来后不再反复试
    if (on) track._torchWorks = false
    return false
  }
}
// 闪光灯支不支持：不只信 getCapabilities().torch（很多手机不报 torch，但灯其实能开），
// 没试过的先允许试一次，开灯失败才记为不支持。
function torchSupported() {
  const track = stream.value && stream.value.getVideoTracks()[0]
  if (!track) return false
  if (track._torchWorks === false) return false
  return true
}
// 采一帧新鲜画面再测亮度：等一帧取景刷新，避免读到旧帧
async function sampleFreshBrightness() {
  await new Promise((r) => requestAnimationFrame(r))
  return sampleBrightness()
}
// 按当前模式设置预览时的灯状态：常开→亮，其他→灭（自动模式预览不亮灯）
async function applyFlashPreviewState() {
  if (!camOk.value) return
  if (flashMode.value === 'on') {
    if (torchSupported()) await setTorch(true)
  } else {
    await setTorch(false)
  }
}
async function cycleFlashMode() {
  flashMode.value = flashMode.value === 'auto' ? 'on' : flashMode.value === 'on' ? 'off' : 'auto'
  try { localStorage.setItem('fw_flash_mode', flashMode.value) } catch {}
  if (nativeActive.value) {
    // 原生预览：按支持列表设插件闪光模式（常开→torch 常亮，自动→拍照时自动补光）
    await applyNativeFlashMode()
    showToast('闪光灯：' + flashLabel.value)
    return
  }
  if (flashMode.value === 'on') {
    const ok = await setTorch(true)
    if (!ok) { showToast('当前摄像头不支持闪光灯'); return }
  } else {
    await setTorch(false)
  }
  showToast('闪光灯：' + flashLabel.value)
}
// 拍照那一刻才用的自动闪光：暗了开灯、等灯亮（画面真的变亮）、拍完调用方马上关灯。
// 返回灯是否亮过（供 takePhoto 在 finally 里关灯）；不暗/不支持返回 false。
async function flashForCapture() {
  if (flashMode.value !== 'auto') return false
  if (!torchSupported()) return false
  const luma = await sampleFreshBrightness()
  if (luma == null || luma >= FLASH_LUMA_THRESHOLD) return false
  const ok = await setTorch(true)
  if (!ok) return false
  // 灯开了不等于灯亮了：等取景画面真的变亮（最多 800ms）再拍，
  // 否则 250ms 一到就拍，拍到的还是没补光的暗帧
  const t0 = Date.now()
  while (Date.now() - t0 < 800) {
    await new Promise((r) => setTimeout(r, 100))
    const now = sampleBrightness()
    if (now != null && now >= luma + 15) break
  }
  return true
}
async function switchCameraById(id) {
  if (nativeActive.value) {
    // v3.1.0：原生预览下镜头面板就是 GszdCamera2.listCameras() 的结果，
    // 点一行直接切到那个镜头（插件自己重开会话，不用 startCamera）
    if (!id) { showLensPanel.value = false; return }
    try {
      const res = await GszdCamera2.switchCamera({ cameraId: id })
      applyGszdStartResult(res)
      zoom.value = 1
    } catch (e) {
      showToast('切换镜头失败：' + (e && e.message ? e.message : e))
    }
    showLensPanel.value = false
    return
  }
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
// 切拍照/录像/系统相机（v3.0.0 + v3.0.1）：拍照和录像两路相机要换着开——
// 拍照模式原生端用原生预览，录像模式用网页流（水印逐帧烧进 canvas，原生录像是无水印 mp4）；
// 切模式时先停掉另一路再开这一路，不让两路同时占着摄像头。
// 系统相机段（v3.0.1）：点一下打开手机原生相机（走系统相机流程，带 hardened resume），
// 拍完/返回后 mode 本来就是 photo，药丸高亮回到拍照；录像时不响应。
async function switchMode(m) {
  if (recording.value) return
  if (m === 'system') {
    if (systemCamActive.value) return
    systemCamActive.value = true
    try {
      await systemCamera('camera')
    } finally {
      systemCamActive.value = false
    }
    return
  }
  if (m === mode.value) return
  if (m === 'video') {
    await stopNativePreview()
    mode.value = 'video'
    if (!stream.value) await startCamera()
    return
  }
  mode.value = 'photo'
  if (isNative) {
    stopStream()
    await startPhotoCamera()
  }
  // 网页端切回拍照不用重开流（cam-wrap 跟随比例自己变）
}
async function toggleFacing() {
  if (nativeActive.value) {
    // 原生预览：GszdCamera2.switchCamera({}) 无参数 = 前后翻转（等新镜头出首帧才 resolve）
    try {
      const res = await GszdCamera2.switchCamera({})
      applyGszdStartResult(res)
      zoom.value = 1
    } catch (e) {
      showToast('切换前后镜头失败：' + (e && e.message ? e.message : e))
    }
    return
  }
  if (cameras.value.length > 1) {
    // 有镜头列表时切到另一个方向的镜头（前后切换）
    const current = cameras.value.findIndex((c) => c.deviceId === cameraId.value)
    const cur = cameras.value[current >= 0 ? current : 0]
    const next = cameras.value.find((c) => c.facing !== cur.facing) || cameras.value[(current + 1) % cameras.value.length]
    if (next.deviceId) {
      cameraId.value = next.deviceId
      try { localStorage.setItem('fw_camera_device', next.deviceId) } catch {}
    } else {
      // 合成条目没有 deviceId：按前后方向切，清掉存的 deviceId
      cameraId.value = ''
      try { localStorage.removeItem('fw_camera_device') } catch {}
    }
    facing.value = next.facing
  } else {
    facing.value = facing.value === 'environment' ? 'user' : 'environment'
  }
  zoom.value = 1
  await startCamera()
}

// ---- 相机常驻后台（v2.1.5，用户要求）：从进入 App 就启动，切到相册页也不停，
// 直到退出 App 才关；切回拍摄不卡（不用重新 getUserMedia）。App.vue 的 tab 切换时调用。
// v3.0.0：网页流仍常驻（切 tab 不停）；原生预览切到相册时停掉——
// 相册页是半透明列表，预览留在后台会从列表后面透出来，还耗电，切回来再重开（原生启动很快）。
// 切到相册：只收起拍摄页的弹层、关掉预览补光灯（别在相册页一直亮着），定位/地址重试继续跑；
// 切回来：流还活着就不重开（只把取景播起来），死了才重开（走“正在启动相机…”状态）。
function suspendCameraView() {
  showRatioPanel.value = false
  showLensPanel.value = false
  showMoreMenu.value = false
  historyOpen.value = false
  preview.value = null
  if (flashOn.value) setTorch(false).catch(() => {})
  stopNativePreview()
}
async function resumeCameraView() {
  await resumeCameraIfNeeded()
  if (nativeActive.value) await applyNativeFlashMode()
  else applyFlashPreviewState()
}
defineExpose({ suspendCameraView, resumeCameraView })

// 系统相机/相册选图回来后（App 曾切到后台），直播流可能已被系统断掉；
// 回到前台时检查一次，流断了就重开，避免取景画面冻住。
// 原生预览模式：预览还活着就不动；停了才重开（切 tab / 从系统相机回来）。
// 网页模式：先判视频轨还活不活（readyState === 'live'），
// 活着就只把取景播起来（藏起 video 时可能停了），不重新 getUserMedia。
async function resumeCameraIfNeeded() {
  if (recording.value) return
  if (isNative && mode.value === 'photo') {
    if (nativeActive.value) {
      // 预览还活着就不动；先问插件一句首帧还在不在——系统相机回来/切后台回来后
      // 表面可能被系统收走了（v2.1.8 用户反馈的“回来卡住”），死了就强制重开
      try {
        const { value } = await GszdCamera2.isPreviewStarted()
        if (value) return
      } catch { return }
      await stopNativePreview()
      await startPhotoCamera()
      return
    }
    if (camOk.value) await startPhotoCamera()
    return
  }
  if (!camOk.value) return
  const track = stream.value && stream.value.getVideoTracks()[0]
  if (track && track.readyState === 'live') {
    if (videoEl.value && videoEl.value.paused) {
      try { await videoEl.value.play() } catch { /* 播不起来就等下一次 */ }
    }
    return
  }
  await startCamera()
}
function onVisibilityChange() {
  if (!document.hidden) resumeCameraIfNeeded()
}

// 取地址：先用同一地点 500 米内的缓存地址顶上，再联网取新的；
// 总预算 45 秒（慢网下一次 8 秒根本不够，要多试几次），超时/失败就保留缓存（或留空），
// 绝不一直卡在“获取中”。地址后来才拿到时，把已保存的同地点照片地址也补上。
async function resolveAddress(gcjLon, gcjLat) {
  const cached = getCachedAddress(gcjLon, gcjLat)
  loc.value.address = cached || ''
  addrState.value = cached ? 'cached' : 'fetching'
  try {
    const addr = await withTimeout(reverseGeocode(gcjLon, gcjLat), 50000, '获取地址')
    if (addr) {
      loc.value.address = addr
      addrState.value = 'ok'
      lastAddrCoords = { lon: gcjLon, lat: gcjLat }
      saveCachedAddress(gcjLon, gcjLat, addr)
      backfillRecordsAddress(gcjLon, gcjLat, addr)
      return addr
    }
  } catch { /* 超时/失败：留空或保留缓存 */ }
  if (loc.value.address) {
    lastAddrCoords = { lon: gcjLon, lat: gcjLat }
    addrState.value = 'cached'
  } else {
    addrState.value = 'failed'
  }
  return loc.value.address || ''
}

// 当前位置还需不需要地址：没地址要；有地址但已移动超 500 米也要（旧地址已不适用）。
function needsAddress() {
  if (loc.value.lon == null) return false
  if (!loc.value.address) return true
  if (!lastAddrCoords) return false
  const gcjLon = loc.value.gcjLon != null ? loc.value.gcjLon : loc.value.lon
  const gcjLat = loc.value.gcjLat != null ? loc.value.gcjLat : loc.value.lat
  return distMeters(gcjLon, gcjLat, lastAddrCoords.lon, lastAddrCoords.lat) > 500
}
function stopAddrRetry() {
  if (addrRetryTimer) { clearTimeout(addrRetryTimer); addrRetryTimer = null }
}
function scheduleAddrRetry() {
  stopAddrRetry()
  addrRetryTimer = setTimeout(addrRetryTick, addrRetryDelay)
}
// 后台地址重试的一次 tick：需要地址就查一次；拿到停（回到 30 秒慢轮询，等以后移动时再查）；
// 没拿到退避加长再约。App 打开期间一直跑，不依赖位置更新触发。
function addrRetryTick() {
  addrRetryTimer = null
  if (!needsAddress()) {
    addrRetryDelay = 30000
    scheduleAddrRetry()
    return
  }
  if (addrFetching) { scheduleAddrRetry(); return }
  addrFetching = true
  const gcjLon = loc.value.gcjLon != null ? loc.value.gcjLon : loc.value.lon
  const gcjLat = loc.value.gcjLat != null ? loc.value.gcjLat : loc.value.lat
  resolveAddress(gcjLon, gcjLat).then((addr) => {
    if (addr) {
      addrRetryDelay = 30000
      locHint.value = '定位与地址已就绪'
    } else {
      addrRetryDelay = Math.min(addrRetryDelay * 2, 300000)
    }
  }).catch(() => {
    addrRetryDelay = Math.min(addrRetryDelay * 2, 300000)
  }).finally(() => {
    addrFetching = false
    scheduleAddrRetry()
  })
}
function startAddrRetryLoop() {
  addrRetryDelay = 30000
  scheduleAddrRetry()
}
// 重新定位 / 网络恢复时调用：清掉退避，马上重查一次地址（有坐标、没地址、没在查时）。
function resetAddrRetryNow() {
  stopAddrRetry()
  addrRetryDelay = 30000
  if (loc.value.lon != null && !loc.value.address && !addrFetching) {
    addrFetching = true
    const gcjLon = loc.value.gcjLon != null ? loc.value.gcjLon : loc.value.lon
    const gcjLat = loc.value.gcjLat != null ? loc.value.gcjLat : loc.value.lat
    resolveAddress(gcjLon, gcjLat).finally(() => { addrFetching = false; scheduleAddrRetry() })
  } else {
    scheduleAddrRetry()
  }
}
function onOnline() {
  if (loc.value.lon != null && !loc.value.address) resetAddrRetryNow()
}

// 打开 App 立刻先显示上次缓存的坐标（标明是“上次位置”），再去取新的；
// 不让用户先对着“正在定位…”等十几秒才看到坐标。
function showCachedFixImmediately() {
  const cached = loadLastFix()
  if (!cached) return
  const gcj = wgs84ToGcj02(cached.lon, cached.lat)
  const cachedAddr = getCachedAddress(gcj.lon, gcj.lat)
  loc.value = { lon: cached.lon, lat: cached.lat, gcjLon: gcj.lon, gcjLat: gcj.lat, address: cachedAddr, accuracy: cached.accuracy || null }
  locStale.value = true
  addrState.value = cachedAddr ? 'cached' : 'idle'
  locHint.value = cachedAddr ? '已定位（上次位置），正在更新…' : '已定位（上次位置），正在更新并获取地址…'
}

async function refreshLocation() {
  if (locPending) return locPending
  locBusy.value = true
  locError.value = false
  // 有缓存坐标时先保留它显示，只把提示改成更新中；没坐标才显示“定位中…”
  locHint.value = loc.value.lon != null ? '正在更新位置…' : '定位中…'
  addrState.value = loc.value.address ? 'cached' : 'idle'
  resetAddrRetryNow() // 重新定位同时重查地址：清掉重试退避
  locPending = (async () => {
    try {
      const pos = await getPosition((refined) => {
        // 后台精修到了更准的坐标：更新界面；地址还没拿到或已移动超 500 米就重查地址。
        const gcj = wgs84ToGcj02(refined.lon, refined.lat)
        const better = loc.value.accuracy == null || (refined.accuracy != null && refined.accuracy < loc.value.accuracy)
        if (!better && loc.value.lon != null) return
        const prevAddr = loc.value.address
        loc.value = { lon: refined.lon, lat: refined.lat, gcjLon: gcj.lon, gcjLat: gcj.lat, address: prevAddr, accuracy: refined.accuracy }
        locStale.value = false
        const moved = !lastAddrCoords || distMeters(gcj.lon, gcj.lat, lastAddrCoords.lon, lastAddrCoords.lat) > 500
        if ((!prevAddr || moved) && !addrFetching) {
          addrFetching = true
          resolveAddress(gcj.lon, gcj.lat).finally(() => { addrFetching = false })
        }
      })
      const gcj = wgs84ToGcj02(pos.lon, pos.lat)
      loc.value = { lon: pos.lon, lat: pos.lat, gcjLon: gcj.lon, gcjLat: gcj.lat, address: loc.value.address, accuracy: pos.accuracy }
      locStale.value = !!pos.stale
      if (pos.stale) {
        locHint.value = '已定位（上次位置，可能不准确），正在获取地址…'
      } else {
        locHint.value = `已定位（精度约 ${pos.accuracy ? Math.round(pos.accuracy) + ' 米' : '未知'}），正在获取地址…`
      }
      const addr = await resolveAddress(gcj.lon, gcj.lat)
      if (addr) {
        locHint.value = addrState.value === 'cached' ? '定位已就绪，地址为缓存地址' : '定位与地址已就绪'
      } else {
        locHint.value = '已定位，但地址未获取到（无网络或服务不可用），拍照时地址留空'
        locError.value = true
        startAddrRetryLoop() // 地址没拿到：后台继续重试，拿到后补上
      }
    } catch (e) {
      locError.value = true
      if (e && (e.code === 'LOC_DENIED' || /权限被拒绝/.test(e.message || ''))) {
        locHint.value = '定位权限被拒绝：请在系统设置里给长江现场水印相机开启定位权限，开启后点“重新定位”重试；无定位时仍可拍照，经纬度/地址留空。'
      } else {
        locHint.value = '定位失败：' + (e && e.message ? e.message : e) + '。请打开定位权限；无定位时仍可拍照，经纬度/地址留空。'
      }
    } finally {
      locBusy.value = false
      locPending = null
    }
  })()
  return locPending
}

// 拍照/录像前调用：有坐标就直接拍（哪怕是“上次位置”的缓存坐标，后台正在更新），
// 不让用户等定位；完全没坐标时才等正在进行的定位，最多 5 秒。
async function waitForLocation() {
  if (loc.value.lon != null) return
  if (locPending) {
    await Promise.race([locPending, new Promise((r) => setTimeout(r, 5000))])
    return
  }
  await refreshLocation()
}

// 后台持续监听：GPS 热起来后自动补上经纬度；地址重试由独立的后台循环负责，
// 这里只更新位置（室内静止不动时监听不触发，不靠它重试地址）。
function startLocationWatch() {
  if (stopWatch) return
  stopWatch = watchPosition(async (pos) => {
    const gcj = wgs84ToGcj02(pos.lon, pos.lat)
    loc.value = { lon: pos.lon, lat: pos.lat, gcjLon: gcj.lon, gcjLat: gcj.lat, address: loc.value.address, accuracy: pos.accuracy }
    locStale.value = false
    if (locError.value) {
      locError.value = false
      locHint.value = loc.value.address ? '定位与地址已就绪' : '已定位，正在获取地址…'
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
    watermarkText: wmText.value,
    opacity: wmOpacity.value
  }
}

function refreshWmText() {
  wmText.value = getWatermarkText()
  wmOpacity.value = getWatermarkOpacity()
}

async function persistRecord({ type, blob, fileName, meta, thumb, mime, origBlob, origFile, origFileName, deferGallery }) {
  const saved = await saveToAppStorage(blob, fileName)
  // 无水印原图（仅照片）：另存一份 _orig.jpg 在 App 内，不进相册；
  // 详情页连点 7 次编辑文字时，用它重新烧水印替换（老照片没存原图的无法编辑）。
  // v3.1.0：原图直接用拍摄文件（不重新编码）：把缓存里的拍摄文件拷到 App 内，
  // 拷完调用方再删临时文件；拷失败退回原图缺失（照片本身不受影响，编辑文字会提示）。
  let origPath = ''
  if (origFile && origFileName) {
    try {
      origPath = await copyCacheFileToData(origFile, origFileName)
    } catch { /* 原图拷贝失败不阻塞主照片 */ }
  } else if (origBlob && origFileName) {
    try {
      const origSaved = await saveToAppStorage(origBlob, origFileName)
      origPath = origSaved.path
    } catch { /* 原图存失败不阻塞主照片 */ }
  }
  const recId = uid()
  // v3.1.0 提速：系统相册同步放后台——App 内已存好就立刻建记录、回界面继续拍，
  // 不等 MediaStore 慢慢写；写完后把记录的相册状态补上（失败则保持“仅 App 内”，详情页会写清楚）。
  // 只在原生端 defer：网页版本来就没有系统相册，saveToGallery 立刻返回，不用 defer。
  const useDefer = !!deferGallery && Capacitor.isNativePlatform()
  const saveGallery = () => saveToGallery({ fileUri: saved.uri, isVideo: type === 'video' })
    .catch(() => ({ where: 'app-only', reason: '相册保存失败，仅保存在 App 内，可用分享导出' }))
  let gal = { where: 'app-only', reason: useDefer ? '正在同步到系统相册…' : '' }
  if (!useDefer) {
    gal = await saveGallery()
  }
  const rec = {
    id: recId, type, project: meta.project, time: meta.time,
    // 注意：meta.lon/meta.lat 在拍摄时已是 GCJ-02（currentMeta 用 gcjLon/gcjLat），记录直接存 GCJ-02；
    // meta.lon/meta.lat 在拍摄时已是 GCJ-02，记录直接存 GCJ-02。
    lon: meta.lon, lat: meta.lat, gcjLon: meta.lon, gcjLat: meta.lat, address: meta.address,
    path: saved.path, uri: saved.uri, thumb: thumb || '',
    origPath,
    gallery: gal.where, galleryNote: gal.reason || gal.note || '', galleryPending: useDefer, mime: mime || blob.type
  }
  const list = loadRecords()
  list.unshift(rec)
  saveRecords(list)
  emit('saved', rec)
  if (useDefer) {
    // 后台写相册：写完更新记录的相册状态（再发一次 fw-records-changed 让相册页刷新）
    saveGallery().then((g) => {
      const l2 = loadRecords()
      const hit = l2.find((x) => x.id === recId)
      if (!hit) return
      hit.galleryPending = false
      if (g && g.ok) {
        hit.gallery = g.where
        hit.galleryNote = g.reason || g.note || ''
      } else {
        hit.gallery = 'app-only'
        hit.galleryNote = (g && g.reason) || '相册保存失败，仅保存在 App 内，可用分享导出'
      }
      saveRecords(l2)
      try { window.dispatchEvent(new Event('fw-records-changed')) } catch { /* ignore */ }
    }).catch(() => {})
  }
  return rec
}

// 拍照入口：原生预览在跑就用插件 capture() 取图，否则用网页取景抓帧（takePhotoWeb）
async function takePhoto() {
  // 即时快门反馈（v3.0.3 提速）：不等任何 await，点下去立刻震动 + 白闪，体感上一点就有反应
  triggerShutterFeedback()
  // 拍照时把当前项目名落到历史里（顶栏是直接输入，打字时不写历史，拍照是提交点）
  commitProject()
  if (nativeActive.value) return takeNativePhoto()
  return takePhotoWeb()
}
// 点快门立刻震动 + 白闪动画，不等任何 await；保存完成后的那一下震动仍在 afterPhotoSaved 里
function triggerShutterFeedback() {
  vibrateOnCapture() // 不 await，失败静默（函数内部已兜底）
  shutterFlash.value = true
  setTimeout(() => { shutterFlash.value = false }, 180)
}
// capture() 的目标宽高（v3.0.3 提速）：按当前比例算到长边 2400（和 MAX_EDGE 一致，
// 烧水印时不再二次缩放）；3:4 就是 1800×2400，比插件默认的 2MP 上限更清晰。
function captureSizeForRatio(targetRatio) {
  const LONG = 2400
  if (targetRatio >= 1) return { width: LONG, height: Math.round(LONG / targetRatio) }
  return { width: Math.round(LONG * targetRatio), height: LONG }
}
// capture() 的返回值：Camera2 插件返回缓存文件路径，系统相机/网页路线是 base64。
// 文件路径转成 WebView 能加载的地址给烧水印用；base64 拼成 dataURL。
function captureValueToSrc(value) {
  if (!value) return ''
  if (value.startsWith('/') || value.startsWith('file://') || value.startsWith('content://')) {
    try { return Capacitor.convertFileSrc(value) } catch { return value }
  }
  return `data:image/jpeg;base64,${value}`
}
// capture() 的临时文件用完就删（缓存目录，删失败也不影响，系统会清）
async function deleteCaptureTempFile(value) {
  if (!value || !(value.startsWith('/') || value.startsWith('file://'))) return
  const name = value.split('/').pop()
  if (!name) return
  try { await Filesystem.deleteFile({ path: name, directory: Directory.Cache }) } catch { /* 删不掉就留给系统清 */ }
}
// 原生预览拍照：capture() 取图 → 同一套 canvas 烧水印流程保存（和系统相机路径一致）
// v3.0.3 提速：拍照不等定位（用当前 currentMeta() 快照直接拍，地址后台补）；
// v3.1.0 提速：Camera2 插件拍照直接写文件（不走 base64），拍照尺寸在 startPreview 时已传进去，
// 这里不再传宽高；拍摄文件本身就是无水印原图，尺寸对得上时直接拿它当原图（省一次整图编码），
// 系统相册同步放后台，App 内一存好立刻就能继续拍。
async function takeNativePhoto() {
  const meta = currentMeta()
  const targetRatio = (RATIO_OPTIONS.find((r) => r.label === ratio.value) || RATIO_OPTIONS[0]).value
  let captureValue = ''
  try {
    const res = await GszdCamera2.capture({ quality: 90 })
    if (!res || !res.path) { showToast('拍照失败：没拿到照片'); return }
    captureValue = res.path
    const src = captureValueToSrc(captureValue)
    const { blob, rawBlob, thumb, origReused } = await burnPhotoWatermark(src, meta, targetRatio, { origFileDims: { width: res.width, height: res.height } })
    const ts = meta.time.replace(/[-: ]/g, '')
    const fileName = `GSZD_${ts}.jpg`
    const rec = await persistRecord({
      type: 'photo', blob, fileName, meta, thumb,
      origBlob: origReused ? null : rawBlob,
      origFile: origReused ? captureValue : '',
      origFileName: `GSZD_${ts}_orig.jpg`,
      deferGallery: true // v3.1.0 提速：相册同步放后台，App 内一存好立刻就能继续拍
    })
    // 烧完水印、原图拷完后临时文件就没用了，删掉（失败也不影响）
    deleteCaptureTempFile(captureValue)
    await afterPhotoSaved({ rec })
  } catch (e) {
    deleteCaptureTempFile(captureValue)
    showToast('拍照失败：' + (e && e.message ? e.message : e))
  }
}
async function takePhotoWeb() {
  if (!videoEl.value || !videoEl.value.videoWidth) { showToast('相机画面还没准备好'); return }
  const meta = currentMeta()
  let flashLit = false
  try {
    const vw = videoEl.value.videoWidth, vh = videoEl.value.videoHeight
    // 按所选竖版比例对画面中心裁剪（默认 3:4），再按最长边 2400 缩放
    const targetRatio = (RATIO_OPTIONS.find((r) => r.label === ratio.value) || RATIO_OPTIONS[0]).value
    const { sx, sy, sw, sh } = centerCropRect(vw, vh, targetRatio)
    const k = Math.min(1, MAX_EDGE / Math.max(sw, sh))
    const w = Math.round(sw * k), h = Math.round(sh * k)
    // 自动闪光灯：只在拍照这一刻按亮度决定，暗了开灯、等灯亮再拍，拍完马上关灯
    flashLit = await flashForCapture()
    const rawCanvas = document.createElement('canvas')
    rawCanvas.width = w; rawCanvas.height = h
    rawCanvas.getContext('2d').drawImage(videoEl.value, sx, sy, sw, sh, 0, 0, w, h)
    // 先留一份无水印原图（烧水印之前导出），再烧水印
    const origBlob = await new Promise((r) => rawCanvas.toBlob(r, 'image/jpeg', JPEG_QUALITY))
    // 烧水印
    const wmCtx = rawCanvas.getContext('2d')
    drawWatermark(wmCtx, w, h, meta)
    const blob = await new Promise((r) => rawCanvas.toBlob(r, 'image/jpeg', JPEG_QUALITY))
    // 缩略图复用同一块 canvas，不重新解码整图
    const thumb = canvasToThumbDataUrl(rawCanvas)
    const ts = meta.time.replace(/[-: ]/g, '')
    const fileName = `GSZD_${ts}.jpg`
    const rec = await persistRecord({ type: 'photo', blob, fileName, meta, thumb, origBlob, origFileName: `GSZD_${ts}_orig.jpg`, deferGallery: true })
    // 拍照后不弹分享、不跳预览页，留在拍摄界面直接继续拍
    await afterPhotoSaved({ rec })
  } catch (e) {
    showToast('拍照失败：' + (e && e.message ? e.message : e))
  } finally {
    if (flashLit) await setTorch(false)
  }
}

// 拍照后震动一下（v3.0.2，用户要求）：原生端用 Capacitor Haptics 轻触感，
// 网页版用 navigator.vibrate(50) 兜底；不支持震动的设备静默跳过。
// 只在拍照成功后震（afterPhotoSaved 里调），录像不震。
async function vibrateOnCapture() {
  try {
    if (Capacitor.isNativePlatform()) {
      await Haptics.impact({ style: ImpactStyle.Light })
      return
    }
  } catch { /* 原生震动失败就退到网页 vibrate */ }
  try { if (navigator.vibrate) navigator.vibrate(50) } catch { /* 不支持震动静默跳过 */ }
}

// 拍照后存相册：原生直接写相册；网页版浏览器没有直接写相册的权限，
// 照片先存在 App 的相册里，需要进相册时去相册点分享、选“存储到照片”。
async function afterPhotoSaved({ rec }) {
  vibrateOnCapture() // 拍完轻震一下（只在拍照成功后；录像不走这里）
  if (Capacitor.isNativePlatform()) {
    if (rec.gallery === 'gallery') showToast('已保存到相册 ✓，继续拍吧')
    else if (rec.galleryPending) showToast('已保存 ✓，继续拍吧') // v3.1.0：相册还在后台同步，不谎报失败
    else showToast('已存 App 内，相册保存失败（可在相册里分享导出）')
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
    const meta = currentMeta()
    // 系统相机/相册的图也在烧水印前按所选竖版比例中心裁剪
    const targetRatio = (RATIO_OPTIONS.find((r) => r.label === ratio.value) || RATIO_OPTIONS[0]).value
    const { blob, rawBlob, thumb } = await burnPhotoWatermark(photo.dataUrl, meta, targetRatio)
    const ts = meta.time.replace(/[-: ]/g, '')
    const fileName = `GSZD_${ts}.jpg`
    // 无水印原图：burnPhotoWatermark 直接给的 rawBlob（已按比例裁剪、已缩放）
    const rec = await persistRecord({ type: 'photo', blob, fileName, meta, thumb, origBlob: rawBlob, origFileName: `GSZD_${ts}_orig.jpg`, deferGallery: true })
    // 系统相机拍照同样不跳预览页，留在拍摄界面；照片同时进相册
    await afterPhotoSaved({ rec })
  } catch (e) {
    if (String(e && e.message).includes('cancel')) return
    showToast('系统相机失败：' + (e && e.message ? e.message : e))
  } finally {
    // 从系统相机/相册回来后直播流可能已被系统断掉，检查一次，断了就重开
    // （v2.1.8 用户反馈：回来后主界面卡住——原生预览回来先强制重开，不再只判“还活着”）
    if (nativeActive.value) {
      await stopNativePreview()
      await startPhotoCamera()
    } else {
      await resumeCameraIfNeeded()
    }
  }
}

// ---- 视频：canvas.captureStream + MediaRecorder，每帧烧水印 ----
let recAudioStream = null // 录像单独取的音频流（视频流常驻不动，只开视频不开音频）
// 录像的音频不从常驻视频流里拿（它只开了视频）：单独取一路纯音频流，
// 避免为了加音频轨重启整个相机（真机 2.1.5 录像点完拿不到摄像头的根因）。
// 没麦克风权限就返回 null，静音录制，不阻塞录像。
async function getRecAudioTrack() {
  try {
    recAudioStream = await navigator.mediaDevices.getUserMedia({ audio: true })
    return recAudioStream.getAudioTracks()[0] || null
  } catch { return null }
}
function stopRecAudioStream() {
  if (recAudioStream) {
    recAudioStream.getTracks().forEach((t) => t.stop())
    recAudioStream = null
  }
}
async function startRecording() {
  try {
    // 常驻流还活着就直接用；死了（比如切后台被系统断掉）才重开
    await resumeCameraIfNeeded()
    if (!stream.value) { showToast('相机未启动，无法录像'); return }
    await waitForLocation()
    recMeta = currentMeta()
    // 自动模式：录像需要持续补光，开录时按亮度决定，停录时关灯
    if (flashMode.value === 'auto' && torchSupported()) {
      const luma = await sampleFreshBrightness()
      if (luma != null && luma < FLASH_LUMA_THRESHOLD) recFlashLit = await setTorch(true)
    }
    recCanvas = document.createElement('canvas')
    recCanvas.width = 1080; recCanvas.height = 1920
    recCtx = recCanvas.getContext('2d')
    const canvasStream = recCanvas.captureStream(30)
    const tracks = [...canvasStream.getVideoTracks()]
    const audioTrack = await getRecAudioTrack()
    if (audioTrack) tracks.push(audioTrack)
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
    stopRecAudioStream()
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
  if (recFlashLit) { setTorch(false).catch(() => {}); recFlashLit = false }
}
async function onRecordStop() {
  try {
    if (recFlashLit) { recFlashLit = false; try { await setTorch(false) } catch { /* ignore */ } }
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
  } finally {
    stopRecAudioStream() // 录像用的单独音频流，录完就停，别一直占着麦克风
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
    if (hit.origPath) await deleteAppFile(hit.origPath)
    saveRecords(list.filter((x) => x.id !== hit.id))
    emit('saved', null)
  }
  preview.value = null
  showToast('已删除')
}
function retake() {
  preview.value = null
  // 常驻模式：预览时流没停，重拍不用重启相机；流万一死了才重开
  resumeCameraIfNeeded()
}

// 窗口尺寸变了（旋转/分屏）：舞台尺寸重算；原生预览在跑且宽度变了才按新尺寸重开一次。
// 只看宽度：输入法弹起只会压高度（键盘顶起不重开相机，否则一打字就重开取景）。
let resizeTimer = null
let lastWinW = 0
function onWindowResize() {
  fitStage()
  const w = window.innerWidth
  if (!nativeActive.value) { lastWinW = w; return }
  if (w === lastWinW) return // 只有高度变了（大概率是键盘）：不动原生预览
  lastWinW = w
  clearTimeout(resizeTimer)
  resizeTimer = setTimeout(async () => {
    if (!nativeActive.value) return
    await stopNativePreview()
    await startNativePreview()
  }, 300)
}

let stageObserver = null
onMounted(() => {
  clockTimer = setInterval(() => { nowText.value = formatTime() }, 1000)
  window.addEventListener('fw-settings-changed', refreshWmText)
  window.addEventListener('online', onOnline)
  window.addEventListener('resize', onWindowResize)
  document.addEventListener('visibilitychange', onVisibilityChange)
  if (window.ResizeObserver && stageEl.value) {
    stageObserver = new ResizeObserver(() => fitStage())
    stageObserver.observe(stageEl.value)
  }
  fitStage()
  showCachedFixImmediately() // 打开先显示上次缓存的坐标，再取新的
  // v3.0.0 启动顺序：先串行申请权限（定位→相机，不撞在一起），
  // 再开相机；定位在权限落定后立刻开始，不等相机启动完。
  ;(async () => {
    await requestPermissionsSerially()
    refreshLocation()
    startLocationWatch()
    startAddrRetryLoop()
    await startPhotoCamera()
  })()
})
onBeforeUnmount(() => {
  clearBackOverlays() // 兜底：App 退出卸载时清掉本页残留的弹层注册（切 tab 不再卸载，常驻不走这里）
  clearInterval(clockTimer)
  clearInterval(recTimer)
  cancelAnimationFrame(recRaf)
  clearTimeout(resizeTimer)
  stopAddrRetry()
  clearTimeout(camEnumTimer)
  if (stageObserver) { stageObserver.disconnect(); stageObserver = null }
  window.removeEventListener('fw-settings-changed', refreshWmText)
  window.removeEventListener('online', onOnline)
  window.removeEventListener('resize', onWindowResize)
  document.removeEventListener('visibilitychange', onVisibilityChange)
  if (stopWatch) { stopWatch(); stopWatch = null }
  stopNativePreview()
  try { document.body.classList.remove('native-preview') } catch { /* ignore */ }
  stopStream() // 只在退出 App 时停流（常驻模式下切 tab 不停）
})
</script>
