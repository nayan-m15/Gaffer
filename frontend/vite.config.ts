import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { fileURLToPath } from 'url'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  envDir: '..',
  plugins: [
    react(),
    tailwindcss(),
    {
      name: 'landing-scene-preload',
      transformIndexHtml: {
        order: 'post',
        handler(html, ctx) {
          if (!ctx.bundle) return html;
          const hrefs = Object.values(ctx.bundle)
            .filter(
              (item) =>
                item.type === 'chunk' &&
                /^(?:assets\/)?(?:three\.module|landing-scene|stadium-architecture)-/.test(item.fileName),
            )
            .map((item) => `/${item.fileName}`);
          if (hrefs.length === 0) return html;
          const script = `<script>try{var n=navigator;if(location.pathname==="/"&&!matchMedia("(prefers-reduced-motion:reduce)").matches&&!(n.connection&&n.connection.saveData)&&!(n.deviceMemory!==undefined&&n.deviceMemory<=2)){${JSON.stringify(hrefs)}.forEach(function(h){var l=document.createElement("link");l.rel="modulepreload";l.href=h;document.head.appendChild(l);});}}catch(e){}</script>`;
          return html.replace('</head>', `    ${script}\n  </head>`);
        },
      },
    },
    VitePWA({
      // Keep a new worker waiting until open capture tabs close so an app/schema
      // update cannot reload a match with pending local work.
      registerType: 'prompt',
      includeAssets: ['favicon.ico', 'apple-touch-icon.png', 'logo-112.webp'],
      manifest: {
        name: 'Gaffer Sport Coaching',
        short_name: 'Gaffer',
        description: 'Offline-capable collaborative football match logging',
        theme_color: '#0b1218',
        background_color: '#0b1218',
        display: 'standalone',
        start_url: '/',
        icons: [
          { src: '/android-chrome-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: '/android-chrome-512x512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        // Better Auth endpoints are reverse-proxied by Vercel. Keep the PWA
        // navigation fallback from serving the SPA shell for OAuth callbacks
        // such as /auth/callback/google.
        navigateFallbackDenylist: [/^\/auth(?:\/|$)/, /^\/(?:terms-of-service|privacy-policy)\.html$/],
        globPatterns: ['**/*.{js,css,html,svg,woff2}'],
        globIgnores: ['**/node_modules/**'],
        maximumFileSizeToCacheInBytes: 2 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /\.(?:png|jpg|jpeg|webp|gif|ico)$/i,
            handler: 'StaleWhileRevalidate',
            options: {
              cacheName: 'images-cache',
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 14 * 24 * 60 * 60, // 14 days
              },
            },
          },
          {
            urlPattern: /\.(?:glb|gltf|wasm)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'models-and-wasm-cache',
              expiration: {
                maxEntries: 5,
                maxAgeSeconds: 14 * 24 * 60 * 60, // 14 days
              },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.(?:googleapis|gstatic)\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-cache',
              expiration: {
                maxEntries: 20,
                maxAgeSeconds: 365 * 24 * 60 * 60, // 1 year
              },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    proxy: {
      '/auth': {
        target: process.env.BETTER_AUTH_URL ?? 'http://localhost:3000',
        changeOrigin: true,
      },
      '/api': {
        target: process.env.BETTER_AUTH_URL ?? 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/socket.io': {
        target: process.env.BETTER_AUTH_URL ?? 'http://localhost:3000',
        ws: true,
      },
    },
  },
})
