/**
 * 返回键弹层栈：后打开的弹层先关（LIFO）。
 * 各弹层打开时 pushBackOverlay(id, close)、关闭时 removeBackOverlay(id)；
 * App.vue 的 backButton 处理只读这个栈（popBackOverlay），不直接碰各组件的状态，
 * 所以无论弹层是被返回键、遮罩点击还是 ✕ 按钮关掉，栈里都不会残留。
 * 纯 JS，无 DOM/平台依赖，Node 里也能直接测。
 */
const stack = []

export function pushBackOverlay(id, close) {
  removeBackOverlay(id)
  stack.push({ id, close })
}

export function removeBackOverlay(id) {
  const i = stack.findIndex((e) => e.id === id)
  if (i >= 0) stack.splice(i, 1)
}

// 关掉最上层一个弹层，返回是否真的关掉了什么（没有弹层开着时返回 false）。
export function popBackOverlay() {
  const top = stack.pop()
  if (!top) return false
  try { top.close() } catch { /* 关闭失败也不阻塞返回键 */ }
  return true
}

export function backOverlayCount() {
  return stack.length
}

// 组件卸载时清掉自己残留的注册（正常情况下切 tab 时弹层都被遮罩盖着，
// 点不到底部导航，不会带着开着的弹层切 tab；这里是兜底防泄漏）。
export function clearBackOverlays() {
  stack.length = 0
}
