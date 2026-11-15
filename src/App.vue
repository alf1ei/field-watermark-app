<template>
  <div class="app">
    <header class="topbar">
      <h1>现场水印by ccj</h1>
      <span class="ver">v1.0.0 · GSZD 现场拍照</span>
    </header>
    <main>
      <CameraView v-show="tab === 'shoot'" @saved="onSaved" />
      <WorksList v-if="tab === 'works'" ref="worksRef" />
    </main>
    <nav class="tabs">
      <button :class="{ active: tab === 'shoot' }" @click="tab = 'shoot'">📷 拍摄</button>
      <button :class="{ active: tab === 'works' }" @click="tab = 'works'; worksCount++">🖼 作品（{{ count }}）</button>
    </nav>
  </div>
</template>

<script setup>
import { ref, nextTick } from 'vue'
import CameraView from './components/CameraView.vue'
import WorksList from './components/WorksList.vue'
import { loadRecords } from './utils/store.js'

const tab = ref('shoot')
const worksRef = ref(null)
const worksCount = ref(0)
const count = ref(loadRecords().length)

async function onSaved() {
  count.value = loadRecords().length
  await nextTick()
  if (worksRef.value) worksRef.value.refresh()
}
</script>
