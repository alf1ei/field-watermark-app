<template>
  <!-- 首次启动隐私同意页（v2.1.8，应用商店上架要求）：
       App 第一次启动时先弹这个，不点“同意并继续”就不启动相机和定位；
       点“不同意”也不启动，只能浏览相册。同意/不同意都会记下来，下次启动不再弹，
       不同意后想改主意可以在拍摄页点“阅读并同意”重新打开。 -->
  <div class="modal-mask consent-mask">
    <div class="sheet panel-sheet consent-sheet">
      <div class="sheet-head"><h2>欢迎使用长江现场水印相机</h2></div>
      <div class="field-desc">请先阅读并同意《隐私政策》和《用户协议》，再开始使用。同意后才会启动相机和定位。</div>
      <div class="consent-summary">
        <div>📷 <b>照片和视频</b>：只保存在你的手机（App 内和系统相册），不上传到我们的服务器。</div>
        <div>📍 <b>位置</b>：拍照时记录经纬度和地址，烧进水印；地址通过联网查询（高德 / OpenStreetMap），只发送经纬度。</div>
        <div>🙅 <b>不注册、不登录</b>，不收集账号信息；没有广告，没有第三方统计。</div>
      </div>
      <div class="consent-links">
        <button class="ghost" @click="doc = 'privacy'">《隐私政策》全文</button>
        <button class="ghost" @click="doc = 'terms'">《用户协议》全文</button>
      </div>
      <button class="primary wide" @click="emit('accept')">同意并继续</button>
      <div style="height:8px"></div>
      <button class="ghost wide" @click="emit('decline')">不同意</button>
      <div class="field-desc consent-note">不同意将无法使用拍摄功能，但仍可浏览相册；随时可以在拍摄页重新选择同意。</div>
    </div>
  </div>
  <PolicyViewer v-if="doc" :doc="doc" @close="doc = null" />
</template>

<script setup>
import { ref } from 'vue'
import PolicyViewer from './PolicyViewer.vue'

const emit = defineEmits(['accept', 'decline'])
const doc = ref(null)
</script>
