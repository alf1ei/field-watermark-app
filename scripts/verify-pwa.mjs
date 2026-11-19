/* PWA 检查：manifest、图标、SW、安装提示、录像兜底、构建产物。用法：npm run verify:pwa */
import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist')
let pass = 0
let fail = 0
function check(name, ok, extra = '') {
  if (ok) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${extra ? ' — ' + extra : ''}`) }
}
function pngSize(path) {
  const b = readFileSync(path)
  if (b.length < 24 || b.toString('ascii', 1, 4) !== 'PNG') return null
  return { w: b.readUInt32BE(16), h: b.readUInt32BE(20) }
}

console.log('PWA verify:')

// 1. manifest
let manifest = null
try { manifest = JSON.parse(readFileSync(join(root, 'public/manifest.webmanifest'), 'utf8')) } catch (e) { /* ignore */ }
check('manifest 可解析', !!manifest)
check('manifest name 是 长江现场水印相机', manifest && manifest.name === '长江现场水印相机')
check('manifest short_name 是 长江现场水印相机', manifest && manifest.short_name === '长江现场水印相机')
check('manifest display standalone', manifest && manifest.display === 'standalone')
check('manifest orientation portrait', manifest && manifest.orientation === 'portrait')
check('manifest start_url/scope 相对路径', manifest && manifest.start_url === './' && manifest.scope === './')
const icons = (manifest && manifest.icons) || []
for (const [sizes, purpose] of [['192x192', undefined], ['512x512', undefined], ['512x512', 'maskable']]) {
  const hit = icons.find((i) => i.sizes === sizes && (purpose ? i.purpose === purpose : !i.purpose))
  const file = hit && join(root, 'public', hit.src.replace(/^\.\//, ''))
  const size = file && existsSync(file) ? pngSize(file) : null
  const want = parseInt(sizes, 10)
  check(`manifest 图标 ${sizes}${purpose ? ' maskable' : ''} 存在且尺寸正确`, !!size && size.w === want && size.h === want, file ? `${file}` : '缺失')
}

// 2. apple touch icon
const ati = join(root, 'public/icons/apple-touch-icon.png')
const atiSize = existsSync(ati) ? pngSize(ati) : null
check('apple-touch-icon 180x180', !!atiSize && atiSize.w === 180 && atiSize.h === 180)

// 3. service worker
const swPath = join(root, 'public/sw.js')
check('sw.js 存在', existsSync(swPath))
try {
  execSync(`node --check ${swPath}`, { stdio: 'pipe' })
  check('sw.js 语法通过', true)
} catch { check('sw.js 语法通过', false) }
const sw = existsSync(swPath) ? readFileSync(swPath, 'utf8') : ''
check('SW 有版本化缓存 v15 + skipWaiting', sw.includes('fw-pwa-v15') && sw.includes('skipWaiting'))
check('SW 导航请求网络优先、断网回退 index', sw.includes("mode === 'navigate'") && sw.includes('index.html'))

// 4. index.html / main.js / vite.config / 改名 + 版本
const html = readFileSync(join(root, 'index.html'), 'utf8')
check('index.html 引用 manifest', html.includes('manifest.webmanifest'))
check('index.html 有 theme-color', html.includes('theme-color'))
check('index.html 有 apple-mobile-web-app-capable', html.includes('apple-mobile-web-app-capable'))
check('index.html 有 apple-touch-icon', html.includes('apple-touch-icon'))
check('index.html 有 viewport-fit=cover（安全区生效的前提）', html.includes('viewport-fit=cover'))
check('index.html 标题是 长江现场水印相机', html.includes('<title>长江现场水印相机</title>'))
const main = readFileSync(join(root, 'src/main.js'), 'utf8')
check('main.js 只在非原生端注册 SW', main.includes('!Capacitor.isNativePlatform()') && main.includes("register('./sw.js')"))
const vite = readFileSync(join(root, 'vite.config.js'), 'utf8')
check("vite base 是 './'", vite.includes("base: './'"))
let pkg = null
try { pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) } catch (e) { /* ignore */ }
check('package.json 版本是 3.0.1', pkg && pkg.version === '3.0.1')
let cap = null
try { cap = JSON.parse(readFileSync(join(root, 'capacitor.config.json'), 'utf8')) } catch (e) { /* ignore */ }
check('capacitor appName 是 长江现场水印相机', cap && cap.appName === '长江现场水印相机')
check('capacitor appId 未变（com.gszd.fieldwatermark）', cap && cap.appId === 'com.gszd.fieldwatermark')
const workflow = readFileSync(join(root, '.github/workflows/build-apk.yml'), 'utf8')
// 与工作流文件保持同步：工作流升到 v3.0.1 后此处也要是 3.0.1，
// 否则 verify:pwa 会失败（工作流仍是 v3.0.0 时这两项检查先失败，等父级改完工作流再过）。
check('工作流已同步到 v3.0.1（tag/Release/artifact/改名）', workflow.includes('tag_name: v3.0.1') && workflow.includes('长江现场水印相机 v3.0.1') && workflow.includes('长江现场水印相机-3.0.1-release-apk') && workflow.includes('长江现场水印相机v3.0.1.apk'))

// 5. 安装提示 + 兜底功能
const appVue = readFileSync(join(root, 'src/App.vue'), 'utf8')
check('App.vue 有 iOS 添加到主屏幕提示', appVue.includes('添加到主屏幕') && appVue.includes('beforeinstallprompt'))
check('App.vue 已去掉顶部标题栏（无 topbar、无版本号、无齿轮）', !appVue.includes('topbar') && !appVue.includes('SettingsModal') && !appVue.includes('⚙'))
// 2.1.5：相机常驻后台（用户要求）：CameraView 包一层单根 div 再 v-show 切换，
// 切到相册也不卸载、不停流；直接对多根节点的 CameraView 用 v-show 会只藏第一个根节点
// （真机 2.1.0 的 bug）。切 tab 时 suspend/resume，只在流死了才重开。
check('相机常驻：CameraView 包在单根 cam-page 里 v-show 切换（不是 v-if 卸载）', appVue.includes('class="cam-page"') && appVue.includes("v-show=\"tab === 'shoot'\"") && !appVue.includes("v-if=\"tab === 'shoot'\""))
check('切 tab 时调用挂起/恢复（suspendCameraView / resumeCameraView）', appVue.includes('suspendCameraView') && appVue.includes('resumeCameraView') && appVue.includes("watch(tab, (t) => {"))
check('SettingsModal.vue 文件已删除', !existsSync(join(root, 'src/components/SettingsModal.vue')))
check('A2HS 文案用新名', appVue.includes('长江现场水印相机'))
const cam = readFileSync(join(root, 'src/components/CameraView.vue'), 'utf8')
check('CameraView 有系统相机录像兜底', cam.includes('systemVideo') && cam.includes('onVideoFilePicked') && cam.includes('captureStream'))
check('拍照后不跳预览页、留在拍摄界面', !cam.includes("preview.value = { kind: 'photo'"))
check('拍照后不自动弹分享', !cam.includes('shareToAlbumWeb') && !cam.includes('navigator.share'))
const storeJs = readFileSync(join(root, 'src/utils/store.js'), 'utf8')
check('网页版分享存相册方法已移除', !storeJs.includes('shareToAlbumWeb'))
check('预览信息条带类型标签（时间/经度/纬度/地址/项目名称）', cam.includes('时间：') && cam.includes('经度：') && cam.includes('纬度：') && cam.includes('地址：') && cam.includes('项目名称：'))
check('竖屏比例默认 3:4、可切 9:16/1:1（旧 4:3/16:9 自动迁移）', cam.includes('RATIO_OPTIONS') && cam.includes("localStorage.getItem('fw_photo_ratio')") && cam.includes("'3:4'") && cam.includes("'9:16'") && cam.includes('migrateRatio'))
check('镜头切换（枚举摄像头、按 deviceId 开）', cam.includes('enumerateDevices') && cam.includes('fw_camera_device') && cam.includes('deviceId: { exact: cameraId.value }'))
check('取景舞台按比例适配（ResizeObserver + camWrapStyle）', cam.includes('ResizeObserver') && cam.includes('camWrapStyle') && cam.includes('stageEl'))
check('录像竖屏 1080×1920', cam.includes('recCanvas.width = 1080') && cam.includes('recCanvas.height = 1920'))
check('系统相机/相册的图也按所选比例中心裁剪', cam.includes('burnPhotoWatermark(photo.dataUrl, meta, targetRatio)'))
check('拍摄页布局 v3.0.1（顶栏项目名+四个圆钮 / 3:4 取景 / 底部模式药丸+快门行，不悬浮）', cam.includes('topbar') && cam.includes('project-box') && cam.includes('ctrl-btn') && cam.includes('bottom-ctrl') && cam.includes('shutter-row') && cam.includes('circle-btn') && cam.includes('showRatioPanel') && cam.includes('showLensPanel') && cam.includes('zoomLabel') && cam.includes('mode-row') && cam.includes('shutter') && !cam.includes('float-ctrl') && !cam.includes('ctrlBottom'))
check('变焦用 track 能力过滤（0.5×–10×）', cam.includes('getCapabilities') && cam.includes('zoomCaps') && cam.includes('applyConstraints') && cam.includes('0.5'))
check('相机降级重试链（deviceId exact 失败后逐步放宽到 video:true，每级 8 秒超时）', cam.includes('buildCameraLevels') && cam.includes('openStream') && cam.includes('deviceId: { exact: cameraId.value }') && cam.includes('video: true') && cam.includes("withTimeout(p, ms, '打开相机')"))
check('相机约束只用 ideal 宽高，不用 exact 分辨率/比例', cam.includes('width: { ideal: 1920 }') && !cam.includes('width: { exact') && !cam.includes('height: { exact') && !cam.includes('aspectRatio'))
check('降级成功后清掉失效的 deviceId，下次不再撞同一面墙', cam.includes("localStorage.removeItem('fw_camera_device')"))
check('超时/失败的 getUserMedia 残留流会被关掉（不占摄像头）', cam.includes('stray') && cam.includes('.getTracks().forEach((t) => t.stop())'))
check('变焦失败回滚到之前倍数、不把流搞崩', cam.includes('const prev = zoom.value') && cam.includes('zoom.value = prev'))
check('相册/系统相机回来后流断了重开（visibilitychange + systemCamera finally）', cam.includes('resumeCameraIfNeeded') && cam.includes('visibilitychange') && cam.includes('onVisibilityChange'))
check('闪光灯默认自动（亮度采样 + torch + 自动→常开→关闭）', cam.includes("localStorage.getItem('fw_flash_mode') || 'auto'") && cam.includes('cycleFlashMode') && cam.includes('sampleBrightness') && cam.includes('torch'))
// 真机 2.1.2：自动模式每 1.5 秒采样、暗了灯就一直亮着，没拍照自己就亮了。修法：预览时灯保持关闭，
// 只在按快门拍照那一刻按亮度开灯、拍完马上关灯；常开才在预览时亮。
check('自动闪光预览时不亮灯（无采样定时器、无 applyAutoFlashOnce，预览灯态由 applyFlashPreviewState 管）', !cam.includes('startFlashTimer') && !cam.includes('stopFlashTimer') && !cam.includes('applyAutoFlashOnce') && cam.includes('applyFlashPreviewState'))
check('自动闪光只在拍照那一刻按亮度开灯、拍完马上关（flashForCapture + finally 关灯）', cam.includes('flashForCapture') && cam.includes('flashLit = await flashForCapture()') && cam.includes('if (flashLit) await setTorch(false)'))
check('常开/关闭切换时直接开关灯（applyFlashPreviewState）', cam.includes('applyFlashPreviewState') && cam.includes("flashMode.value === 'on'"))
check('录像自动闪光：开录按亮度决定，停录关灯', cam.includes('recFlashLit') && cam.includes('if (recFlashLit)'))
check('红色快门（#ff3b30）', readFileSync(join(root, 'src/style.css'), 'utf8').includes('#ff3b30') && readFileSync(join(root, 'src/style.css'), 'utf8').includes('background: #ff3b30'))
const css = readFileSync(join(root, 'src/style.css'), 'utf8')
check('顶部安全区：.app 顶部留 max(env(safe-area-inset-top), 32px)，不撞状态栏/挖孔', css.includes('padding-top: max(env(safe-area-inset-top, 0px), 32px)'))
check('底部导航有底部安全区 inset', css.includes('env(safe-area-inset-bottom)'))
check('信息条点一下收起（infoCollapsed），hint/更多菜单开改名（同步聚焦）', cam.includes('infoCollapsed') && cam.includes('toggleInfoBar') && cam.includes('openProjectEdit') && cam.includes('editSheet') && cam.includes('focusInputAtEnd') && cam.includes('@click="openProjectEdit"'))
check('waitForLocation 有坐标直接拍、无坐标最多等 5 秒（不递归、不久等）', cam.includes('if (loc.value.lon != null) return') && cam.includes('setTimeout(r, 5000)') && cam.includes('await refreshLocation()'))
check('拍摄页无补地址文案、拍照等定位完成', !cam.includes('补地址') && cam.includes('waitForLocation'))
check('拍照另存无水印原图（_orig.jpg，供详情 7 次点击编辑重烧）', cam.includes('_orig.jpg') && cam.includes('origPath') && cam.includes('origBlob'))
const works = readFileSync(join(root, 'src/components/WorksList.vue'), 'utf8')
check('WorksList 网页版分享/下载兜底', works.includes('navigator.canShare') && works.includes('download'))
check('作品页已取消补地址（按钮/逻辑/文案全无）', !works.includes('补地址') && !works.includes('fillAddress'))
check('作品页文件夹（新建/展开/删除/移动到文件夹，存 localStorage）', works.includes('＋新建文件夹') && works.includes('createFolder') && works.includes('deleteFolder') && works.includes('setPhotoFolder') && storeJs.includes('fw_folders_v1'))
check('未归档按日期分组、今天展开、早先堆叠可收起', works.includes('dateGroups') && works.includes('stack-card') && works.includes('收起堆叠'))
check('作品页内嵌设置（水印文字 + 透明度滑杆 + 版本显示 + 检查更新，无 Key 输入）', works.includes('settings-card') && works.includes('getWatermarkText') && works.includes('wm-slider') && works.includes('getWatermarkOpacity') && works.includes('APP_VERSION') && works.includes('检查更新') && !works.includes('setAmapKey') && !works.includes('高德 Key'))
const geoJs = readFileSync(join(root, 'src/utils/geo.js'), 'utf8')
// 真机 2.1.2：先等高精度 GPS 耗满 12 秒超时才降级，用户体感很慢。
// 修法：打开先显示上次缓存坐标（标明“上次位置”）；新定位低精度/高精度两路并行、谁先回来用谁，
// 高精度后到且更准时后台精修。
check('定位两路并行先到先得 + 高精度后到精修（onRefine）', geoJs.includes('Promise.race') && geoJs.includes('enableHighAccuracy: false') && geoJs.includes('enableHighAccuracy: true') && geoJs.includes('onRefine') && geoJs.includes('maybeRefine'))
check('打开 App 立刻显示上次缓存坐标（标明“上次位置”）', cam.includes('showCachedFixImmediately') && cam.includes('loadLastFix') && cam.includes('上次位置'))
check('定位手动超时兜底（withTimeout + TIMEOUT，不无限挂起）', geoJs.includes('withTimeout') && geoJs.includes("err.code = 'TIMEOUT'") && geoJs.includes('Promise.race'))
check('定位先看权限状态（Permissions API），被拒报 LOC_DENIED，不再调 Capacitor', geoJs.includes('ensureLocationPermission') && geoJs.includes('permissions.query') && geoJs.includes('LOC_DENIED') && !geoJs.includes("import('@capacitor/geolocation')"))
check('定位全部失败用上次定位兜底（fw_last_loc + stale 标记）', geoJs.includes('fw_last_loc') && geoJs.includes('saveLastFix') && geoJs.includes('loadLastFix') && geoJs.includes('stale: true'))
check('后台持续监听定位（浏览器 watchPosition + clearWatch，不走 Capacitor）', geoJs.includes('navigator.geolocation.watchPosition') && geoJs.includes('clearWatch') && !geoJs.includes('watchdog'))
check('地址缓存 500 米内先显示（fw_last_addr）', geoJs.includes('getCachedAddress') && geoJs.includes('saveCachedAddress') && geoJs.includes('fw_last_addr'))
// 真机 2.1.2：经纬度有了，地址一直拿不到。根因：Nominatim 国内常被挡/很慢，
// 旧版总预算只有 12 秒、每路只试一次、无重试、后台重试只靠监听位置更新（室内静止不动不触发）。
// 修法：总预算 45 秒，每路多试几次带退避；App 打开期间后台循环重试（30 秒→5 分钟退避），网络恢复立刻重查；
// 重新定位清掉退避重查地址；成功后回填已保存照片的地址。
check('取地址总预算 45 秒 + 多次重试带退避（非 12 秒单次）', cam.includes('resolveAddress') && geoJs.includes('opts.budgetMs || 45000') && geoJs.includes('fetchJsonWithRetry') && !cam.includes("withTimeout(reverseGeocode(gcjLon, gcjLat), 12000") && cam.includes('addrState'))
check('高德 Key 优先 + Nominatim 兜底（reverseGeocode）', geoJs.includes('getAmapKey') && geoJs.includes('restapi.amap.com') && geoJs.includes('nominatim.openstreetmap.org'))
check('地址后台循环重试（退避 30 秒→5 分钟）+ 网络恢复重查', cam.includes('addrRetryTick') && cam.includes('addrRetryDelay') && cam.includes('Math.min(addrRetryDelay * 2, 300000)') && cam.includes("window.addEventListener('online'"))
check('重新定位同时重查地址（清退避）', cam.includes('resetAddrRetryNow') && cam.includes('resetAddrRetryNow()'))
check('地址成功后回填已保存照片（backfillRecordsAddress）', storeJs.includes('backfillRecordsAddress') && cam.includes('backfillRecordsAddress(gcjLon, gcjLat, addr)'))
check('回填后作品页自动刷新（fw-records-changed）', storeJs.includes("window.dispatchEvent(new Event('fw-records-changed'))") && works.includes("window.addEventListener('fw-records-changed'"))
// 2.1.3 新增：取景器双指捏合变焦（两指距离变化映射到变焦，限制在设备支持的变焦范围，右上角 1× 同步更新；
// v2.1.6 改成统一的 pointer 手势控制器（单指点按对焦、单指竖滑调曝光、双指捏合缩放，按手指数量区分），
// 旧的 touch 版捏合在真机上没反应已删掉——除了 zoomCaps 拿不到，两套处理混用也互相抢。
check('双指捏合变焦：统一 pointer 手势按手指数量区分（两指才进 pinch）', cam.includes('onStagePointerDown') && cam.includes('onStagePointerMove') && cam.includes('stagePointers') && cam.includes("stageGesture.kind === 'pinch'") && cam.includes('stagePointers.size === 2'))
check('捏合两指距离映射到 zoom（夹到设备范围，标签同步）', cam.includes('startDist') && cam.includes('Math.min(caps.max, Math.max(caps.min, z))') && cam.includes('zoom.value = z') && cam.includes('tryApplyZoom(z)'))
check('捏合只处理双指、阻止浏览器滚动/缩放（touch-action: none）', css.includes('touch-action: none') && cam.includes('stagePointers.size === 2'))
check('捏合剩一指时重置点按状态（不用旧起点误触发曝光）', cam.includes("stageGesture.kind === 'pinch' && stagePointers.size === 1"))
// 2.1.4 新增：从作品切回拍摄时，相机重开那一瞬间会闪一下“相机未启动”（假报错）。
// 根因：模板里 {{ camError || '相机未启动' }} 在 camOk=false 且 camError='' 时就显示这句，
// 而 startCamera 整个降级链跑完之前 camOk 一直是 false、camError 一直是空。
// 修法：加 camStarting 状态，启动中只显示“正在启动相机…”+转圈、不给重试按钮；
// 只有所有降级都失败才显示真报错+重试；流一拿到就亮取景，不等 play() 回来。
check('相机启动中有 camStarting 状态（启动中显示“正在启动相机…”+转圈）', cam.includes("const camStarting = ref(false)") && cam.includes('v-if="camStarting"') && cam.includes('正在启动相机…') && cam.includes('cam-spinner'))
check('启动中不给重试按钮（重试只在真失败后出现）', cam.includes('v-if="!camStarting"') && cam.includes('重试打开相机'))
check('startCamera 入口置 camStarting=true，成功/失败都清掉', cam.includes('camStarting.value = true') && (cam.match(/camStarting\.value = false/g) || []).length >= 2)
check('流一拿到就亮取景（camOk 在 play() 之前翻 true，不等 5 秒）', cam.indexOf('camOk.value = true') < cam.indexOf("withTimeout(videoEl.value.play()"))
check('启动转圈样式在 style.css（.cam-spinner + @keyframes spin）', css.includes('.cam-spinner') && css.includes('@keyframes spin'))
check('真失败才写报错（失败分支先清 camStarting 再写 camError）', cam.includes("camOk.value = false\n  camStarting.value = false\n  camError.value = '无法打开相机：'"))
// 2.1.5 新增：相机常驻后台（切 tab 不停流）+ 变焦按钮按住上下滑 + 底部布局（快门居中、地址行取消、控制区下移取景更大）
// + 相册长按多选拖进文件夹 + 导航“作品”改“相册”。
check('挂起/恢复方法对 App.vue 暴露（defineExpose）', cam.includes('defineExpose({ suspendCameraView, resumeCameraView })'))
check('切到相册收起弹层、关预览补光灯（suspend 时更多菜单/四个弹层都关、灯灭）', cam.includes('showRatioPanel.value = false') && cam.includes('showLensPanel.value = false') && cam.includes('editSheet.value = false') && cam.includes('preview.value = null') && cam.includes('showMoreMenu.value = false') && cam.includes('if (flashOn.value) setTorch(false)'))
check('切回拍摄只在流死了才重开（先判视频轨 live，活着只播起来）', cam.includes("track.readyState === 'live'") && cam.includes("await videoEl.value.play()") && cam.includes('resumeCameraIfNeeded'))
check('相机只在退出 App 时停流（onBeforeUnmount 里 stopStream，tab 切换不走）', cam.includes('stopStream() // 只在退出 App 时停流'))
// v2.1.6：1× 按钮改成长按上下滑（v2.1.5 的按住就滑在真机上没反应——zoomCaps 是 null 时
// pointerdown 里直接 return，拖动根本没开始；这台手机不报 zoom 能力，见 readTrackCaps 的默认范围）。
check('变焦按钮长按激活（350ms 定时器 + 震动 + 气泡，没到时间松手当点按）', cam.includes('onZoomPressStart') && cam.includes('onZoomPressMove') && cam.includes('onZoomPressEnd') && cam.includes('zoomLongTimer') && cam.includes('350') && cam.includes('navigator.vibrate'))
check('长按时重读变焦能力（刚换镜头、或之前没读到时补上）', cam.includes('onZoomPressStart') && cam.includes('readTrackCaps()'))
check('变焦滑动上滑放大、下滑缩小（指数映射 120px 翻一倍，夹到设备范围）', cam.includes('Math.pow(2, dy / 120)') && cam.includes('Math.min(caps.max, Math.max(caps.min, z))') && cam.includes('zoom.value = z'))
check('变焦滑动长按后才生效、拖动后 click 抑制（zoomSuppressClick）', cam.includes('zoomPressState.active') && cam.includes('onZoomBtnClick') && cam.includes('zoomSuppressClick'))
check('变焦滑动时标签实时更新、有拖动气泡指示（zoomDragging + zoom-bubble）', cam.includes('zoomDragging') && cam.includes('zoom-bubble') && cam.includes('zoomLabel'))
check('变焦按钮 touch-action: none（滑动不被浏览器抢去滚动页面）', css.includes('.zoom-btn') && css.includes('touch-action: none'))
check('变焦滑动和双指捏合不冲突（捏合在 stage 上，按钮在控制区）', cam.includes('onStagePointerMove') && cam.includes('onZoomPressMove') && cam.includes("class=\"circle-btn zoom-btn\""))
check('变焦能力拿不到时给默认范围 1×–10×、真调失败再回滚提示（不一开始堵死）', cam.includes('{ min: 1, max: 10, step: 0.1 }') && cam.includes('tryApplyZoom') && cam.includes('zoomBroken') && cam.includes('当前摄像头不支持变焦'))
check('拍摄页：模式药丸三段（系统相机/拍照/录像）、更多菜单含前后切换/相册选图/重新定位/改项目名称、信息条可收起、裁剪框提示、右下角重新定位准星', cam.includes('switchMode(\'system\')') && cam.includes('系统相机') && cam.includes('showMoreMenu') && cam.includes('前后切换') && cam.includes('相册选图') && cam.includes('重新定位') && cam.includes('改项目名称') && cam.includes('infoCollapsed') && cam.includes('crop-guide') && cam.includes('relocate-btn') && cam.includes('refreshLocation'))
check('快门下地址行已取消（无 loc-line/tool-row），录像计时移到取景左上角 rec-chip', !cam.includes('loc-line') && !cam.includes('tool-row') && cam.includes('rec-chip') && cam.includes('recTimeText'))
check('拍摄页：无旧 float-ctrl 悬浮控制，取景固定 3:4、控制在下方实底区（bottom-ctrl + shutter-row）', !css.includes('.float-ctrl') && !css.includes('.controls') && css.includes('.bottom-ctrl') && css.includes('.shutter-row') && css.includes('aspect-ratio: 3 / 4') && cam.includes('bottom-ctrl') && !cam.includes('float-ctrl'))
check('导航“作品”改“相册”（拍摄/相册），空状态与提示文案同步改', appVue.includes('</span>相册') && !appVue.includes('</span>作品') && works.includes('还没有相册') && !works.includes('还没有作品') && cam.includes('可在相册里分享导出'))
check('长按进多选（500ms 长按、选中、震动、抑制随后 click）', works.includes('lpTimer') && works.includes('500') && works.includes('toggleSelect(it.id)') && works.includes('suppressCellClick') && works.includes('navigator.vibrate'))
check('多选模式点按切换选择（selected 集合 + 选中高亮 + 打勾）', works.includes('selected.value') && works.includes('isSelected(it.id)') && works.includes('sel-check') && css.includes('.cell.selected'))
check('多选顶栏（已选数量 + 取消/完成入口）', works.includes('sel-bar') && works.includes('已选') && works.includes('exitSelectMode'))
check('多选拖进文件夹（拖动数量角标 + elementFromPoint 找文件夹 + 高亮）', works.includes('cellDragState') && works.includes('elementFromPoint') && works.includes("closest('.folder-card')") && works.includes('dropTarget') && css.includes('.folder-card.drop-hot') && css.includes('.drag-badge'))
check('拖进文件夹批量移动（setPhotoFolder 逐个移、打开目标文件夹、提示张数）', works.includes('moveSelectedToFolder') && works.includes('setPhotoFolder(id, folderId)') && works.includes('expandedFolders.value.add(folderId)'))
check('返回键先退出多选（works-multiselect 注册进返回栈）', works.includes("pushBackOverlay('works-multiselect'") && works.includes('exitSelectMode'))
check('长按滚动取消（移动 > 10px 取消长按计时）', works.includes('Math.hypot(e.clientX - lpState.startX, e.clientY - lpState.startY) > 10'))
check('后台持续监听定位', geoJs.includes('watchPosition') && geoJs.includes('clearWatch'))
check('refreshLocation 返回进行中的 promise（CameraView 里 locPending）', cam.includes('if (locPending) return locPending') && cam.includes('return locPending'))
check('地址短格式 5 级（省+市+区县+街道/镇+道路/小区/派出所/社区）', geoJs.includes('formatAmapAddress') && geoJs.includes('formatNominatimAddress') && geoJs.includes('shortenAddressFromParts'))
check('Nominatim 前先把 GCJ-02 转回 WGS-84（addressdetails=1）', geoJs.includes('gcj02ToWgs84') && geoJs.includes('addressdetails=1'))
check('水印默认文字仍是 GSZD（不改名）', readFileSync(join(root, 'src/utils/store.js'), 'utf8').includes("'GSZD'"))

// 安卓返回键（真机 2.1.1 的 bug：之前根本没接管返回键，弹层关不掉、主页面也退不出）。
// 优先级：关最上层弹层 → 作品 tab 回拍摄 tab → 拍摄 tab 两次返回退出。
check('返回键只在 App.vue 注册一次（backButton + isNativePlatform 守卫）', appVue.includes("App.addListener('backButton'") && appVue.includes('isNativePlatform()') && (appVue.match(/addListener\('backButton'/g) || []).length === 1)
check('返回键先关弹层（popBackOverlay 在回 tab 之前）', appVue.includes('popBackOverlay()') && appVue.indexOf('popBackOverlay()') < appVue.indexOf("tab.value === 'works'"))
check('作品 tab 按返回先回拍摄 tab', appVue.includes("tab.value === 'works'") && appVue.includes("tab.value = 'shoot'"))
check('两次返回退出（2 秒内 + exitApp + 再按一次退出应用）', appVue.includes('App.exitApp()') && appVue.includes('2000') && appVue.includes('再按一次退出应用'))
check('返回键监听在卸载时移除（backHandle.remove）', appVue.includes('backHandle.remove'))
check('退出提示复用已有 toast 样式（不另起一套）', appVue.includes('class="toast"') && appVue.includes('showAppToast'))
check('拍摄页四个弹层都注册进返回栈（比例/镜头/改名/预览）', cam.includes("trackOverlay('cam-ratio'") && cam.includes("trackOverlay('cam-lens'") && cam.includes("trackOverlay('cam-edit'") && cam.includes("trackOverlay('cam-preview'") && cam.includes('pushBackOverlay(id, close)'))
check('作品页详情和新建文件夹注册进返回栈', works.includes("pushBackOverlay('works-detail'") && works.includes("pushBackOverlay('works-newfolder'"))
check('卸载时清掉残留弹层注册（App 退出；切 tab 不再卸载）', cam.includes('clearBackOverlays()') && works.includes('clearBackOverlays()'))

// 2.1.6 新增：水印 0.26/0.26、四按钮统一、闪光灯暗光亮、录像不重启相机、
// 详情 7 次点击编辑文字、取景器点按对焦 + 上下滑调曝光。
const wmJs = readFileSync(join(root, 'src/utils/watermark.js'), 'utf8')
check('水印字号 0.26 不变、透明度默认 0.2 可调（烧录 + 实时预览同步）', wmJs.includes('w * 0.26') && !wmJs.includes('rgba(255,255,255,0.26)') && wmJs.includes('DEFAULT_WATERMARK_OPACITY = 0.2') && storeJs.includes('getWatermarkOpacity') && css.includes('font-size: 26vw') && css.includes('var(--wm-opacity, .2)'))
check('更多菜单是文字按钮（前后切换/相册选图/重新定位/改项目名称，顶栏圆钮入口；系统相机已升为模式段，不在菜单里）', cam.includes('class="ctrl-btn"') && cam.includes('前后切换</button>') && cam.includes('相册选图</button>') && cam.includes('重新定位</button>') && cam.includes('改项目名称</button>') && !cam.includes('moreSystemCamera') && !css.includes('width: 88px; height: 40px;'))
check('自动闪光阈值提到 80（自动曝光提亮过的画面，45 永远判不暗）', cam.includes('FLASH_LUMA_THRESHOLD = 80') && !cam.includes('luma >= 45') && !cam.includes('luma < 45'))
check('闪光灯不只信 getCapabilities().torch（不报也先试一次，失败才记不支持）', cam.includes('_torchWorks') && cam.includes('track._torchWorks === false'))
check('自动闪光采新鲜帧、等画面真变亮再拍（最多 800ms）', cam.includes('sampleFreshBrightness') && cam.includes('luma + 15') && cam.includes('Date.now() - t0 < 800'))
check('录像音频单独取一路，不重启相机流（切模式/开录都不重开）', cam.includes('getRecAudioTrack') && cam.includes('getUserMedia({ audio: true })') && cam.includes('stopRecAudioStream') && cam.includes('const audio = false') && !cam.includes('ensureVideoStream'))
check('切拍照/录像换路（停一路开一路：切录像停原生预览开网页流，切拍照停流开原生预览）', cam.includes('async function switchMode(m)') && cam.includes("await stopNativePreview()") && cam.includes("mode.value = 'video'") && cam.includes("mode.value = 'photo'") && cam.includes('await startPhotoCamera()'))
check('重拍不重启相机（retake 只关预览、流死了才重开）', cam.includes('重拍不用重启相机') && cam.includes('resumeCameraIfNeeded()'))
check('详情大图连点 7 次编辑（3 秒窗口、3/4 次给提示、第 7 次开编辑）', works.includes('onDetailImageTap') && works.includes('detailTapCount') && works.includes('3000') && works.includes('再点') && works.includes('editSheet'))
check('编辑项是项目名称/时间/地址（经纬度只读不给改）', works.includes('editProject') && works.includes('editTimeLocal') && works.includes('editAddress') && works.includes('datetime-local') && works.includes('normalizeTimeText') && works.includes('经纬度是实测记录，不能改'))
check('编辑保存用原图重烧并替换（burnPhotoWatermark + 覆盖同名文件 + 更新记录）', works.includes('burnPhotoWatermark') && works.includes('readAppFile(rec.origPath') && works.includes('saveToAppStorage(blob, rec.path.split') && works.includes('saveToGallery'))
check('老照片没原图时明确提示无法编辑', works.includes('没有留存原图'))
check('编辑弹层注册进返回栈（返回键先关编辑）', works.includes("pushBackOverlay('works-edit-text'"))
check('取景器点按对焦（对焦框 + pointsOfInterest + focusMode，不支持只显示框）', cam.includes('onStagePointerDown') && cam.includes('focusBox') && cam.includes('showFocusBox') && cam.includes('pointsOfInterest') && cam.includes('focusMode') && css.includes('.focus-box'))
check('单指竖滑调曝光（exposureCompensation + 太阳指示，不支持给提示）', cam.includes('applyExposure') && cam.includes('exposureCompensation') && cam.includes('expIndicator') && cam.includes('当前摄像头不支持曝光调节') && css.includes('.exp-indicator'))
check('曝光值对焦后保持（换位置对焦不重置；换镜头尽量恢复）', cam.includes('exposure.value = v') && cam.includes('if (exposure.value !== 0) applyExposure(exposure.value)'))
check('点信息条/准星/未启动面板/定位提示不触发对焦（closest 守卫，顶栏和底部控制区在取景外）', cam.includes("closest('.bar, .relocate-btn, .cam-off, .hint')"))

// 2.1.7 新增：镜头枚举不到（面板一直“正在枚举摄像头…”、选不了镜头、变焦跟着没反应）+ 相册批量删除。
// 根因：listCameras 只在 startCamera 成功那一刻调一次、失败静默吞掉、再也不重试；
// 变焦的 zoomBroken 锁死后捏合也不清掉。修法：拿不到带退避重试、打开面板重读、
// 手动重新读取、拿不到时用当前轨合成前后切换、按 facingMode 切；变焦失败把上限收到
// 上次成功的倍数、每新手势重读能力再试。
check('镜头枚举拿不到时带退避重试（不是一次就判死刑）', cam.includes('camEnumAttempts') && cam.includes('camEnumTimer') && cam.includes('[600, 1500, 3000]'))
check('打开镜头面板时重读摄像头列表（列表空时才重读，避免已有列表闪烁）', cam.includes('watch(showLensPanel') && cam.includes('if (open && !cameras.value.length) listCameras()'))
check('镜头面板有手动重新读取入口 + 没读到时的明确提示（不是一直“正在枚举”）', cam.includes('重新读取') && cam.includes('listCameras(true)') && cam.includes('没读到摄像头') && cam.includes('camerasLoading'))
check('枚举不到时用当前活着的视频轨合成前后切换（synthetic + 当前摄像头）', cam.includes('synthesizeCamerasFromTrack') && cam.includes('synthetic: true') && cam.includes('当前摄像头（'))
check('没有 deviceId 时按前后方向切镜头（switchCameraByFacing + 清 deviceId）', cam.includes('switchCameraByFacing') && cam.includes("localStorage.removeItem('fw_camera_device')") && cam.includes('facing.value = f'))
check('面板按 deviceId/前后方向两种方式切镜头（switchCamera 分流）', cam.includes('function switchCamera(c)') && cam.includes('switchCameraById(c.deviceId)') && cam.includes('switchCameraByFacing(c.facing)'))
check('前后切换在合成条目上也走 facing（toggleFacing 处理空 deviceId）', cam.includes('if (next.deviceId)') && cam.includes('facing.value = next.facing'))
check('镜头 label 为空时用前后方向/序号兜底', cam.includes('}摄像头 ${i + 1}') && cam.includes('当前摄像头（'))
check('变焦失败把上限收到上次成功的倍数（真实上限比默认 1×–10× 小也不锁死）', cam.includes('max: zoomLastGood') && cam.includes('zoomCaps.value = null'))
const pinchStartIdx = cam.indexOf('if (stagePointers.size === 2) {')
check('捏合开始前重读变焦能力、清掉上次失败标记（不锁死到下次重启）', pinchStartIdx >= 0 && cam.indexOf('readTrackCaps()', pinchStartIdx) > pinchStartIdx && cam.indexOf('readTrackCaps()', pinchStartIdx) < cam.indexOf("stageGesture = { kind: 'pinch'", pinchStartIdx))
check('变焦只作用在活着的视频轨上（readyState live 才调）', cam.includes("track.readyState !== 'live'"))
check('变焦能力用轨的实际设置校准当前倍数（getSettings().zoom）', cam.includes('settings.zoom'))
check('多选顶栏有删除入口（askBatchDelete）', works.includes('askBatchDelete') && works.includes('删除</button>'))
check('批量删除确认框（显示项数 + 说明系统相册那份删不掉）', works.includes('batchDeleteAsk') && works.includes('确认删除') && works.includes('系统相册里的那份') && works.includes('手动'))
check('批量删除删 App 内文件 + 原图（path + origPath），清归属、刷新列表、退出多选', works.includes('doBatchDelete') && works.includes('deleteAppFile(rec.path)') && works.includes('deleteAppFile(rec.origPath)') && works.includes('exitSelectMode()'))
check('批量删除确认框注册进返回栈（返回键先关确认框）', works.includes("pushBackOverlay('works-batch-delete'"))
check('批量删除后相册 tab 角标跟着更新（emit saved + App.vue 接 @saved）', works.includes("defineEmits(['saved'])") && works.includes("emit('saved')") && appVue.includes('@saved="onSaved"'))

// 7. v3.0.0 上架准备：首次同意弹窗、隐私政策/用户协议、release 签名打包
const privacy = existsSync(join(root, 'public/privacy.html')) ? readFileSync(join(root, 'public/privacy.html'), 'utf8') : ''
const terms = existsSync(join(root, 'public/terms.html')) ? readFileSync(join(root, 'public/terms.html'), 'utf8') : ''
check('隐私政策存在，按实际行为写（高德/Nominatim/不收集账号/无广告/可删除）', privacy.includes('隐私政策') && privacy.includes('restapi.amap.com') && privacy.includes('Nominatim') && privacy.includes('不收集') && (privacy.includes('没有广告') || privacy.includes('不含广告')) && privacy.includes('删除'))
check('隐私政策开发者写个人名义，不写公司', privacy.includes('个人开发者') && !privacy.includes('甘肃中德检验检测'))
check('用户协议存在，开发者写个人名义，不写公司', terms.includes('用户协议') && terms.includes('个人开发者') && !terms.includes('甘肃中德检验检测'))
check('store.js 有隐私同意状态读写（fw_privacy_consent_v1）', storeJs.includes('getPrivacyConsent') && storeJs.includes('setPrivacyConsent') && storeJs.includes('fw_privacy_consent_v1'))
check('App.vue 只在同意后才挂载 CameraView（未同意/未决定不开相机+定位）', appVue.includes("v-if=\"consent === 'accepted'\"") && appVue.includes('getPrivacyConsent') && appVue.includes('PrivacyConsent'))
check('App.vue 同意/不同意都记下来（setPrivacyConsent accepted/declined），下次不再弹', appVue.includes("setPrivacyConsent('accepted')") && appVue.includes("setPrivacyConsent('declined')") && appVue.includes('showConsent'))
check('不同意后拍摄页有占位（阅读并同意 / 仅浏览相册），不是白屏', appVue.includes('consent-gate') && appVue.includes('仅浏览相册') && appVue.includes('阅读并同意'))
const consentVue = existsSync(join(root, 'src/components/PrivacyConsent.vue')) ? readFileSync(join(root, 'src/components/PrivacyConsent.vue'), 'utf8') : ''
check('首次同意弹窗存在：同意并继续 / 不同意 + 隐私政策/用户协议全文入口', consentVue.includes('同意并继续') && consentVue.includes('不同意') && consentVue.includes('隐私政策') && consentVue.includes('用户协议'))
const viewerVue = existsSync(join(root, 'src/components/PolicyViewer.vue')) ? readFileSync(join(root, 'src/components/PolicyViewer.vue'), 'utf8') : ''
check('政策全文查看器用 iframe 打开本地副本（离线可看），注册进返回栈', viewerVue.includes('iframe') && viewerVue.includes('privacy.html') && viewerVue.includes('terms.html') && viewerVue.includes('pushBackOverlay'))
check('相册页设置卡有隐私政策/用户协议入口（PolicyViewer）', works.includes('隐私政策') && works.includes('用户协议') && works.includes('PolicyViewer'))
check('SW 缓存包含隐私政策/用户协议页（PWA 离线可看）', sw.includes('privacy.html') && sw.includes('terms.html'))
check('工作流能打 release 包（assembleRelease + apksigner 签名 + 校验）', workflow.includes('assembleRelease') && workflow.includes('apksigner') && workflow.includes('sign') && workflow.includes('verify'))
check('签名信息从 Secrets 读（四个名都在），缺失明确报错不回落 debug', workflow.includes('ANDROID_KEYSTORE_BASE64') && workflow.includes('KEYSTORE_PASSWORD') && workflow.includes('KEY_ALIAS') && workflow.includes('KEY_PASSWORD') && workflow.includes('缺少 release 签名 Secrets') && workflow.includes('exit 1'))
check('Release 只放签名后的 release 包（不是 debug 包）', workflow.includes('files: android/app/build/outputs/apk/release/长江现场水印相机v3.0.1.apk'))
check('debug 构建保留（assembleDebug + debug artifact，供平时测试）', workflow.includes('assembleDebug') && workflow.includes('debug-apk'))
check('versionCode 按 package.json 自动算（cap add 会重置成 1，不算会被商店拒收更新）', workflow.includes('versionCode') && workflow.includes('major * 10000') && workflow.includes('set-version'))
const listing = existsSync(join(root, 'docs/STORE-LISTING.md')) ? readFileSync(join(root, 'docs/STORE-LISTING.md'), 'utf8') : ''
check('上架物料草稿存在（简介/功能/截图清单/各商店字段，个人名义）', listing.includes('com.gszd.fieldwatermark') && listing.includes('截图清单') && listing.includes('个人名义') && listing.includes('隐私政策链接'))
const readme = readFileSync(join(root, 'README.md'), 'utf8')
check('README 上架章节有 keystore 生成命令 + Secrets 填法 + 个人名义', readme.includes('keytool -genkeypair') && readme.includes('ANDROID_KEYSTORE_BASE64') && readme.includes('个人名义'))
check('dist 里有隐私政策/用户协议页（构建产物）', existsSync(join(dist, 'privacy.html')) && existsSync(join(dist, 'terms.html')))

// 8. v3.0.0：原生相机预览 + 全屏 UI + 水印透明度 + 相册滑动 + 内置 Key + OTA（Gitee）
// + 版本显示 + 键盘避让 + 联系邮箱展示 + 去谷歌框架 + 相册搜索 + 安装权限引导
const versionJs = readFileSync(join(root, 'src/version.js'), 'utf8')
check('版本信息模块 version.js（3.0.1/30001/2026-11-20，App 内显示 + OTA 共用）', versionJs.includes("'3.0.1'") && versionJs.includes('30001') && versionJs.includes('2026-11-20') && versionJs.includes('APP_VERSION'))
let versionJson = null
try { versionJson = JSON.parse(readFileSync(join(root, 'version.json'), 'utf8')) } catch (e) { /* ignore */ }
check('根目录 version.json（3.0.1/30001 + Gitee apkUrl）', versionJson && versionJson.version === '3.0.1' && versionJson.versionCode === 30001 && versionJson.apkUrl.includes('gitee.com/alf1e/field-watermark-app') && versionJson.apkUrl.includes('v3.0.1'))
const otaJs = readFileSync(join(root, 'src/utils/ota.js'), 'utf8')
check('OTA 模块（Gitee 真实地址 alf1e、versionCode 比较、downloadFile 下载、安装器安装）', otaJs.includes('gitee.com/alf1e/field-watermark-app') && otaJs.includes('OTA_VERSION_URL') && otaJs.includes('versionCode') && otaJs.includes('downloadFile') && otaJs.includes('FileOpener'))
check('OTA 安装前查“安装未知应用”权限（canRequestPackageInstalls + NO_INSTALL_PERMISSION）', otaJs.includes('canInstallUnknownApps') && otaJs.includes('canRequestPackageInstalls') && otaJs.includes('NO_INSTALL_PERMISSION') && otaJs.includes('requestInstallPermission'))
const updatePrompt = readFileSync(join(root, 'src/components/UpdatePrompt.vue'), 'utf8')
check('OTA 更新提示框有权限引导（去设置开启 + 只需开一次 + 我已开启继续安装）', updatePrompt.includes('need-permission') && updatePrompt.includes('去设置开启') && updatePrompt.includes('只需开一次') && updatePrompt.includes('我已开启，继续安装') && updatePrompt.includes('downloadApk') && updatePrompt.includes('installApk'))
check('App.vue 启动时查一次更新（有新版才弹 UpdatePrompt）', appVue.includes('checkForUpdate') && appVue.includes('UpdatePrompt') && appVue.includes('launchUpdate'))
check('原生相机预览（CameraPreview、toBack、enableZoom、capture、flip、setFlashMode）', cam.includes('CameraPreview') && cam.includes('toBack') && cam.includes('enableZoom') && cam.includes('capture') && cam.includes('flip') && cam.includes('setFlashMode'))
check('串行权限（requestPermissionsSerially：先定位探针、再相机，各 30 秒超时不阻塞）', cam.includes('requestPermissionsSerially') && cam.includes('await withTimeout(getPosition(), 30000') && cam.includes("Camera.requestPermissions({ permissions: ['camera'] })"))
check('相册详情左右滑动（onDetailPointerDown/Up、到头提示、两侧按钮、计数）', works.includes('onDetailPointerDown') && works.includes('onDetailPointerUp') && works.includes('已经是第一张') && works.includes('已经是最后一张') && works.includes('detail-nav') && works.includes('detail-counter'))
const keyboardJs = readFileSync(join(root, 'src/utils/keyboard.js'), 'utf8')
check('键盘避让（visualViewport 算键盘高度、光标移到末尾、横向滚到末尾）', keyboardJs.includes('visualViewport') && keyboardJs.includes('setSelectionRange') && keyboardJs.includes('scrollLeft') && cam.includes('kbHeight') && cam.includes('focusInputAtEnd') && cam.includes('live-preview') && works.includes('kbHeight') && works.includes('live-preview'))
check('版本显示（WorksList 含 APP_VERSION、releaseDate、检查更新、联系邮箱仅展示、无 mailto）', works.includes('APP_VERSION') && works.includes('releaseDate') && works.includes('检查更新') && works.includes('w4yne@foxmail.com') && !works.includes('mailto'))
check('定位不再用 @capacitor/geolocation（依赖已删、geo.js 无原生导入、只走 navigator.geolocation）', !pkg.dependencies['@capacitor/geolocation'] && !geoJs.includes("import('@capacitor/geolocation')") && geoJs.includes('navigator.geolocation') && !(cap.plugins && cap.plugins.Geolocation))
check('相册搜索（顶部搜索框、项目/地址/日期过滤、项目优先、不区分大小写、无结果提示）', works.includes('search-bar') && works.includes('searchText') && works.includes('matchScore') && works.includes('filteredRecords') && works.includes('toLowerCase') && works.includes('没有找到相关照片') && css.includes('.search-bar'))
check('原生预览下视频仍走网页路线（录像水印保得住：切录像停原生预览开网页流）', cam.includes("await stopNativePreview()") && cam.includes("mode.value = 'video'") && cam.includes('getRecAudioTrack'))
check('README 已更新到 3.0.1（版本号/OTA Gitee/去谷歌框架/搜索，无 7 次编辑口径）', readme.includes('3.0.1') && readme.includes('gitee.com/alf1e/field-watermark-app') && !readme.includes('7 次') && !readme.includes('重烧'))

// 9. v3.0.1：拍摄页按第五版效果图重做（顶栏 + 3:4 取景 + 模式药丸 + 快门无文字）
// + 网页版详情页图片裂开修复 + 菜单按钮打开设置页
check('模式药丸选中段深蓝 #22375e，和底部导航选中态同一套（无液态玻璃高光）', css.includes('.mode-row button.active') && css.includes('background: #22375e') && css.includes('nav.tabs button.active') && !css.includes('liquid') && !cam.includes('liquid'))
check('系统相机段走原生系统相机（switchMode system → systemCamera，回来后回到拍照）', cam.includes('systemCamActive') && cam.includes("switchMode('system')") && cam.includes("systemCamera('camera')") && cam.includes('systemCamActive.value = false'))
check('拍照快门无「拍照」两个字（模板里 >拍照</button> 只剩模式药丸那一段）', (cam.match(/>拍照<\/button>/g) || []).length === 1 && cam.includes('class="shutter photo"'))
check('网页版详情页直接读 data URL（非原生不走 getUri + convertFileSrc，原生路径不动）', works.includes('async function fileSrc') && works.includes("if (!Capacitor.isNativePlatform())") && works.includes('return await readAppFile(it.path, mime)') && works.includes('Capacitor.convertFileSrc(uri)'))
check('菜单按钮打开设置页（CameraView 发 open-settings → App.vue 切相册 tab → 滚到设置卡片）', cam.includes("defineEmits(['saved', 'open-settings'])") && cam.includes('function openSettings()') && appVue.includes('@open-settings="onOpenSettings"') && appVue.includes('scrollToSettings') && works.includes('function scrollToSettings') && works.includes("defineExpose({ refresh, scrollToSettings })"))
check('取景框固定 3:4、裁剪框只在所选比例与取景不一致时显示（选 3:4 不画整框）', css.includes('aspect-ratio: 3 / 4') && cam.includes("Math.abs(r - stageBox.value.w / stageBox.value.h) > 0.01"))

// 6. 构建产物（需先跑 npm run build）
check('dist/index.html 存在', existsSync(join(dist, 'index.html')))
check('dist/manifest.webmanifest 存在', existsSync(join(dist, 'manifest.webmanifest')))
check('dist/sw.js 存在', existsSync(join(dist, 'sw.js')))
check('dist/icons/icon-512.png 存在', existsSync(join(dist, 'icons/icon-512.png')))
const distHtml = existsSync(join(dist, 'index.html')) ? readFileSync(join(dist, 'index.html'), 'utf8') : ''
check('dist/index.html 资源用相对路径', distHtml.includes('./assets/') && !distHtml.includes('src="/assets/') && !distHtml.includes('href="/assets/'))
check('dist/index.html 引用 manifest', distHtml.includes('manifest.webmanifest'))
const distManifest = existsSync(join(dist, 'manifest.webmanifest')) ? readFileSync(join(dist, 'manifest.webmanifest'), 'utf8') : ''
check('dist manifest 是新名', distManifest.includes('长江现场水印相机'))
let distJsText = ''
try {
  for (const f of readdirSync(join(dist, 'assets'))) {
    if (f.endsWith('.js')) distJsText += readFileSync(join(dist, 'assets', f), 'utf8')
  }
} catch { /* dist 还没构建时跳过 */ }
check('dist 产物里有返回键处理和退出提示（backButton + 再按一次退出应用）', distJsText.includes('backButton') && distJsText.includes('再按一次退出应用'))

console.log(`\n${pass} 通过，${fail} 失败`)
process.exit(fail ? 1 : 0)
