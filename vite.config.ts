import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "AI科技3x TradFi盯盘",
        short_name: "科技盯盘",
        description: "追踪美股AI科技主线、OKX TradFi合约偏离、仓位建议和公开资讯。",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#0d1117",
        theme_color: "#151b23",
        icons: [
          {
            src: "/icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any maskable",
          },
        ],
      },
      workbox: {
        navigateFallback: "/",
      },
    }),
  ],
  server: {
    proxy: {
      "/yahoo": {
        target: "https://query1.finance.yahoo.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/yahoo/, ""),
      },
      "/yahoo-rss": {
        target: "https://feeds.finance.yahoo.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/yahoo-rss/, ""),
      },
      "/okx": {
        target: "https://www.okx.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/okx/, ""),
      },
      "/translate": {
        target: "https://translate.googleapis.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/translate/, ""),
      },
    },
  },
})
