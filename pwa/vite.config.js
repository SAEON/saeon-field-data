import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  base: '/fds/',
  server: {
    host: '0.0.0.0',
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: { enabled: true },
      manifest: {
        id: '/fds/',
        name: 'SAEON Field Data System',
        short_name: 'SAEON FDS',
        description: 'Field technician upload interface for SAEON monitoring stations',
        theme_color: '#0D1B2E',
        background_color: '#F4F6F8',
        display: 'standalone',
        orientation: 'portrait',
        scope: '/fds/',
        start_url: '/fds/',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png'               },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png'               },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,ico,png,svg,woff2}'],
        runtimeCaching: [
          {
            // NetworkFirst: serve fresh when online, fall back to cache offline
            urlPattern: /\/api\/stations$/,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-stations',
              networkTimeoutSeconds: 10,
              expiration: { maxAgeSeconds: 60 * 60 * 24 },
            },
          },
        ],
      },
    }),
  ],
});
