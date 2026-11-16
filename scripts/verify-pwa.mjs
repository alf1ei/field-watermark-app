/* PWA 检查：manifest、图标、SW、安装提示、录像兜底、构建产物。用法：npm run verify:pwa */
import { readFileSync, existsSync } from 'node:fs'
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
check('SW 有版本化缓存 v5 + skipWaiting', sw.includes('fw-pwa-v5') && sw.includes('skipWaiting'))
check('SW 导航请求网络优先、断网回退 index', sw.includes("mode === 'navigate'") && sw.includes('index.html'))

// 4. index.html / main.js / vite.config / 改名 + 版本
const html = readFileSync(join(root, 'index.html'), 'utf8')
check('index.html 引用 manifest', html.includes('manifest.webmanifest'))
check('index.html 有 theme-color', html.includes('theme-color'))
check('index.html 有 apple-mobile-web-app-capable', html.includes('apple-mobile-web-app-capable'))
check('index.html 有 apple-touch-icon', html.includes('apple-touch-icon'))
check('index.html 标题是 长江现场水印相机', html.includes('<title>长江现场水印相机</title>'))
const main = readFileSync(join(root, 'src/main.js'), 'utf8')
check('main.js 只在非原生端注册 SW', main.includes('!Capacitor.isNativePlatform()') && main.includes("register('./sw.js')"))
const vite = readFileSync(join(root, 'vite.config.js'), 'utf8')
check("vite base 是 './'", vite.includes("base: './'"))
let pkg = null
try { pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) } catch (e) { /* ignore */ }
check('package.json 版本是 2.1.0', pkg && pkg.version === '2.1.0')
let cap = null
try { cap = JSON.parse(readFileSync(join(root, 'capacitor.config.json'), 'utf8')) } catch (e) { /* ignore */ }
check('capacitor appName 是 长江现场水印相机', cap && cap.appName === '长江现场水印相机')
check('capacitor appId 未变（com.gszd.fieldwatermark）', cap && cap.appId === 'com.gszd.fieldwatermark')

// 5. 安装提示 + 兜底功能
const appVue = readFileSync(join(root, 'src/App.vue'), 'utf8')
check('App.vue 有 iOS 添加到主屏幕提示', appVue.includes('添加到主屏幕') && appVue.includes('beforeinstallprompt'))
check('App.vue 已去掉顶部标题栏（无 topbar、无版本号、无齿轮）', !appVue.includes('topbar') && !appVue.includes('SettingsModal') && !appVue.includes('⚙'))
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
check('镜头切换（枚举摄像头、按 deviceId 开）', cam.includes('enumerateDevices') && cam.includes('fw_camera_device') && cam.includes('.deviceId = { exact: cameraId.value }'))
check('取景舞台按比例适配（ResizeObserver + camWrapStyle）', cam.includes('ResizeObserver') && cam.includes('camWrapStyle') && cam.includes('stageEl'))
check('录像竖屏 1080×1920', cam.includes('recCanvas.width = 1080') && cam.includes('recCanvas.height = 1920'))
check('系统相机/相册的图也按所选比例中心裁剪', cam.includes('burnPhotoWatermark(photo.dataUrl, meta, targetRatio)'))
check('底部三控件（比例圆钮/拍照录像药丸/变焦圆钮）', cam.includes('ctrl-row') && cam.includes('circle-btn') && cam.includes('showRatioPanel') && cam.includes('showLensPanel') && cam.includes('zoomLabel'))
check('变焦用 track 能力过滤（0.5×–10×）', cam.includes('getCapabilities') && cam.includes('zoomCaps') && cam.includes('applyConstraints') && cam.includes('0.5'))
check('闪光灯默认自动（亮度采样 + torch + 自动→常开→关闭）', cam.includes("localStorage.getItem('fw_flash_mode') || 'auto'") && cam.includes('cycleFlashMode') && cam.includes('sampleBrightness') && cam.includes('torch'))
check('红色快门（#ff3b30）', readFileSync(join(root, 'src/style.css'), 'utf8').includes('#ff3b30') && readFileSync(join(root, 'src/style.css'), 'utf8').includes('background: #ff3b30'))
check('点水印信息条/定位提示/地址行弹出改项目名称（同步聚焦）', cam.includes('openProjectEdit') && cam.includes('editSheet') && cam.includes('input.focus') && cam.includes('@click="openProjectEdit"'))
check('waitForLocation 递归 bug 已修（无定位时调 refreshLocation）', cam.includes('if (loc.value.lon == null) await refreshLocation()'))
check('拍摄页无补地址文案、拍照等定位完成', !cam.includes('补地址') && cam.includes('waitForLocation'))
check('拍照不再另存原图（无 origPath 保存）', !cam.includes('origPath ='))
const works = readFileSync(join(root, 'src/components/WorksList.vue'), 'utf8')
check('WorksList 网页版分享/下载兜底', works.includes('navigator.canShare') && works.includes('download'))
check('作品页已取消补地址（按钮/逻辑/文案全无）', !works.includes('补地址') && !works.includes('fillAddress'))
check('作品页文件夹（新建/展开/删除/移动到文件夹，存 localStorage）', works.includes('＋新建文件夹') && works.includes('createFolder') && works.includes('deleteFolder') && works.includes('setPhotoFolder') && storeJs.includes('fw_folders_v1'))
check('未归档按日期分组、今天展开、早先堆叠可收起', works.includes('dateGroups') && works.includes('stack-card') && works.includes('收起堆叠'))
check('作品页内嵌设置（水印文字 + 高德 Key）', works.includes('settings-card') && works.includes('getWatermarkText') && works.includes('setAmapKey'))
const geoJs = readFileSync(join(root, 'src/utils/geo.js'), 'utf8')
check('定位三级兜底（高精度→普通→缓存）', geoJs.includes('enableHighAccuracy: false') && geoJs.includes('maximumAge: 600000'))
check('后台持续监听定位', geoJs.includes('watchPosition') && geoJs.includes('clearWatch'))
check('refreshLocation 返回进行中的 promise（CameraView 里 locPending）', cam.includes('if (locPending) return locPending') && cam.includes('return locPending'))
check('地址短格式 5 级（省+市+区县+街道/镇+道路/小区/派出所/社区）', geoJs.includes('formatAmapAddress') && geoJs.includes('formatNominatimAddress') && geoJs.includes('shortenAddressFromParts'))
check('Nominatim 前先把 GCJ-02 转回 WGS-84（addressdetails=1）', geoJs.includes('gcj02ToWgs84') && geoJs.includes('addressdetails=1'))
check('水印默认文字仍是 GSZD（不改名）', readFileSync(join(root, 'src/utils/store.js'), 'utf8').includes("'GSZD'"))

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

console.log(`\n${pass} 通过，${fail} 失败`)
process.exit(fail ? 1 : 0)
