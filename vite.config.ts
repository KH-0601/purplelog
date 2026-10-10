import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import basicSsl from '@vitejs/plugin-basic-ssl'

const BUILD = new Date().toISOString().slice(0, 16).replace('T', ' ') + 'Z'

export default defineConfig({
  define: { __BUILD__: JSON.stringify(BUILD) },
  base: './',
  server: { host: true, port: 5173, strictPort: true },
  plugins: [
    react(),
    basicSsl(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: null,
      includeAssets: ['icon.svg', 'push-sw.js'],
      manifest: {
        name: 'PurpleLog',
        short_name: 'PurpleLog',
        description: 'Canine epilepsy management',
        theme_color: '#6B4FBB',
        background_color: '#FAF9FD',
        display: 'standalone',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml' }],
      },
      workbox: { globPatterns: ['**/*.{js,css,html,svg,json}'], importScripts: ['push-sw.js'] },
    }),
  ],
})
