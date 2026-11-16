import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  base: './', // 相对路径：可部署到任意子目录（如 gszdjc.com/watermark/），原生 Capacitor 同样适用
  server: { port: 5173, host: true },
  build: { outDir: 'dist', emptyOutDir: true }
})
