<template>
  <!-- 隐私政策 / 用户协议全文查看：iframe 直接打开打包进 App 的本地副本（public/privacy.html、
       public/terms.html），离线也能看；商店要的在线链接用同一个文件的部署地址。 -->
  <div class="modal-mask policy-mask" @click.self="close">
    <div class="policy-sheet">
      <div class="sheet-head">
        <h2>{{ title }}</h2>
        <button class="sheet-close" @click="close">✕</button>
      </div>
      <iframe :src="src" class="policy-frame" title="政策全文"></iframe>
    </div>
  </div>
</template>

<script setup>
import { computed, onMounted, onBeforeUnmount } from 'vue'
import { pushBackOverlay, removeBackOverlay } from '../utils/backstack.js'

const props = defineProps({ doc: { type: String, required: true } }) // 'privacy' | 'terms'
const emit = defineEmits(['close'])

const title = computed(() => (props.doc === 'terms' ? '用户协议' : '隐私政策'))
const src = computed(() => (props.doc === 'terms' ? './terms.html' : './privacy.html'))

function close() {
  emit('close')
}

onMounted(() => {
  pushBackOverlay('policy-viewer', close)
})
onBeforeUnmount(() => {
  removeBackOverlay('policy-viewer')
})
</script>
