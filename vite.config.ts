import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * [PWA] LinguaBuddy 离线壳配置
 *
 * 三条红线：
 * 1. registerType: 'prompt' —— 发现新版本只弹提示，绝不在用户学习中途 reload；
 *    只有用户亲手点「立即更新」才调用 updateSW(true)。禁止改成 autoUpdate。
 * 2. 只在生产构建产出 Service Worker（devOptions.enabled: false），
 *    避免开发时热更新被旧缓存吞掉。
 * 3. 纯静态预缓存 App Shell；用户自填的 LLM / 视频接口一律不缓存。
 *    localStorage 数据模型、学习逻辑零改动。
 */
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'prompt',
      /** 由 src/pwa/registerSW.ts 手动注册，避免插件再注入一份 inline 注册脚本 */
      injectRegister: null,
      /** 产物固定命名为 manifest.webmanifest（原本就没有 manifest） */
      manifestFilename: 'manifest.webmanifest',
      /** public/ 下的图标由 Vite 原样拷入 dist，workbox.globPatterns 已覆盖，无需 includeAssets 重复登记 */
      manifest: {
        id: './',
        name: 'LinguaBuddy 语伴英语',
        short_name: 'LinguaBuddy',
        description: '把任意英文文本变成一场可以开口说的对话冒险：角色对话、文学研读、文化视频、词场与成长系统。',
        lang: 'zh-CN',
        dir: 'ltr',
        /** 与 vite base:'./' 一致，支持子目录 / 本地文件部署 */
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#f4f7ff',
        theme_color: '#f5f8ff',
        categories: ['education', 'productivity'],
        icons: [
          /** ↓↓↓ SVG 为占位图标，发布前请替换成自己的品牌图标（见 README 第二十二章） */
          { src: 'pwa-icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' },
          { src: 'pwa-icon-maskable.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'maskable' },
          /** PNG 占位由 scripts/generate-pwa-icons.mjs 生成，保证 Chrome / iOS 可安装 */
          { src: 'pwa-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        /**
         * App Shell：HTML / JS / CSS 全部进预缓存清单。
         * 图标不写在这里 —— 插件会自动把 manifest.icons 收进清单，写两次会重复。
         */
        globPatterns: ['**/*.{js,css,html,ico,webp,woff,woff2}'],
        /** 本地手机测试页与它的离线兜底库只用于局域网调试，不进 App Shell 预缓存 */
        globIgnores: ['**/node_modules/**/*', '**/qr.html', '**/qrcode.min.js'],
        /** 当前主 bundle 约 1 MB，留足余量 */
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        /** 离线访问任意前端路径时回退到壳 */
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        /** prompt 模式下绝不让新 SW 自动接管 / 自动刷新页面 */
        skipWaiting: false,
        clientsClaim: false,
      },
      devOptions: { enabled: false },
    }),
  ],
  base: './',
  // Loopback only: a local study app has no reason to listen on every NIC.
  // Binding 0.0.0.0 also looks like an unidentified service opening a port,
  // which is a common heuristic antivirus / firewall trigger.
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: false,
    /** [用户新增·已保留] 规避 Windows 下 Vite 监听 .vs / 临时目录造成的文件锁 */
    watch: { ignored: ['**/.vs/**', '**/.*.tmpdir/**', '**/*.tmp'] },
    /**
     * [Netlify · 纯本地联调] Vite dev 本身没有 Functions 运行时。
     * 主路径 /.netlify/functions/* 与线上完全一致（刻意不做 rewrite），
     * 转发到本地 Express 后端 server.ts（npm run dev:server，监听 3001），
     * 由它复用 netlify/functions/chat.ts 的 invokeChat —— 本地跑的就是生产那份代码。
     * /api 继续代理：给 /api/health 与 legacy /api/chat 兜底用。
     * 一条命令同时起前后端：npm run dev:full；不依赖 Netlify CLI / 账号登录。
     */
    proxy: {
      '/.netlify/functions': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
      '/api': {
        target: 'http://127.0.0.1:3001',
        changeOrigin: true,
      },
    },
  },
  preview: { host: '127.0.0.1', port: 4173 },
})

