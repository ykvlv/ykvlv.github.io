import { copyFileSync } from 'node:fs'
import path from 'node:path'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import UnoCSS from 'unocss/vite'
import { VitePWA } from 'vite-plugin-pwa'
import { manifest } from './pwa-manifest.ts'

// Exposed to client code via envPrefix and read by the watchlog hook
const REQUIRED_ENV = ['GIST_ID', 'GIST_FILENAME']

// Copy index.html to 404.html for SPA routing on GitHub Pages
function spa404Plugin(): Plugin {
  let outDir = 'dist'

  return {
    name: 'spa-404',
    apply: 'build',
    configResolved(config) {
      outDir = path.resolve(config.root, config.build.outDir)
    },
    closeBundle() {
      copyFileSync(
        path.join(outDir, 'index.html'),
        path.join(outDir, '404.html'),
      )
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), 'GIST_')
  const missing = REQUIRED_ENV.filter((key) => !env[key])
  if (missing.length > 0) {
    throw new Error(
      `Missing required env: ${missing.join(', ')} (see .env.example)`,
    )
  }

  return {
    base: '/',
    envPrefix: ['VITE_', 'GIST_'],
    plugins: [
      UnoCSS(),
      react(),
      VitePWA({
        registerType: 'autoUpdate',
        workbox: {
          globPatterns: ['**/*.{js,css,html,png,svg}'],
          runtimeCaching: [
            {
              urlPattern: /\.woff2$/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'fonts',
                expiration: {
                  maxEntries: 30,
                  maxAgeSeconds: 60 * 60 * 24 * 365, // 1 year
                },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
            {
              urlPattern: /^https:\/\/gist\.githubusercontent\.com\/.*/i,
              handler: 'NetworkFirst',
              options: {
                cacheName: 'gist-cache',
                networkTimeoutSeconds: 5,
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 7, // 7 days
                },
              },
            },
            {
              urlPattern: /^https:\/\/.*\.trakt\.tv\/images\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'trakt-images',
                expiration: {
                  maxEntries: 200,
                  maxAgeSeconds: 60 * 60 * 24 * 30, // 30 days
                  purgeOnQuotaError: true,
                },
                cacheableResponse: { statuses: [0, 200] },
              },
            },
          ],
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
  }
})
