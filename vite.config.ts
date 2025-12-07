import { copyFileSync } from 'fs'
import path from 'path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import UnoCSS from 'unocss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { manifest } from './pwa-manifest.ts'

// Copy index.html to 404.html for SPA routing on GitHub Pages
function spa404Plugin(): Plugin {
  return {
    name: 'spa-404',
    closeBundle() {
      copyFileSync('dist/index.html', 'dist/404.html')
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  base: '/',
  envPrefix: ['VITE_', 'GIST_'],
  plugins: [
    UnoCSS(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      workbox: {
        globPatterns: ['**/*.{js,css,html,png,svg}'],
      },
      manifest: manifest,
    }),
    spa404Plugin(),
  ],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
