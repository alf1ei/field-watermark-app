/**
 * 输入法键盘高度跟踪（v3.0.0，修输入框被键盘盖住的问题）：
 *  - 原理：输入法弹起时 visualViewport 高度变小，用
 *    window.innerHeight - visualViewport.height 算出键盘高度。
 *  - 两种情况都覆盖：WebView 随键盘缩小布局视口（adjustResize）时，
 *    innerHeight 和 visualViewport 一起变小，差值约 0，不需要额外避让，
 *    固定定位的弹窗本来就居中在缩小后的视口里；WebView 不缩小
 *    （adjustPan）时差值就是键盘高度，弹窗用这个值上移避让。
 *  - 阈值 40px：过滤地址栏显隐等小幅度变化，只认真正的键盘。
 */
import { ref, onMounted, onBeforeUnmount } from 'vue'

export function useKeyboardHeight() {
  const kbHeight = ref(0)
  function update() {
    try {
      const vv = window.visualViewport
      if (!vv) { kbHeight.value = 0; return }
      const h = window.innerHeight - vv.height
      kbHeight.value = h > 40 ? Math.round(h) : 0
    } catch { kbHeight.value = 0 }
  }
  onMounted(() => {
    update()
    if (window.visualViewport) {
      window.visualViewport.addEventListener('resize', update)
      window.visualViewport.addEventListener('scroll', update)
    }
    window.addEventListener('resize', update)
  })
  onBeforeUnmount(() => {
    if (window.visualViewport) {
      window.visualViewport.removeEventListener('resize', update)
      window.visualViewport.removeEventListener('scroll', update)
    }
    window.removeEventListener('resize', update)
  })
  return kbHeight
}

/**
 * 输入框获得焦点时把光标移到文字最后，并横向滚动到末尾可见
 * （项目名称可能很长：前面的文字自然向左滚出，只看正在输入的尾部和光标；
 * 完整项目名靠面板顶部的实时同步行看）。
 * focus() 要在用户手势里同步调才会在 iOS 上弹起输入法，所以调用方
 * 在点击处理里先同步调这个函数（内部先 focus 再移光标）。
 */
export function focusInputAtEnd(input) {
  if (!input) return
  try { input.focus({ preventScroll: true }) } catch { try { input.focus() } catch { /* ignore */ } }
  try {
    const len = (input.value || '').length
    input.setSelectionRange(len, len)
  } catch { /* number/date 等类型不支持选区 */ }
  try { input.scrollLeft = input.scrollWidth } catch { /* ignore */ }
}
