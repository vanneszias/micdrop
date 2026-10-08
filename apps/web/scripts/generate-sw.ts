import { generateSW } from 'workbox-build'

const { count, size, warnings } = await generateSW({
  globDirectory: 'dist/client',
  swDest: 'dist/client/sw.js',
  globPatterns: ['**/*.{js,css,svg,html,woff2}'],
  navigateFallback: '/offline.html',
  navigateFallbackDenylist: [/^\/api\//],
  cleanupOutdatedCaches: true,
  clientsClaim: true,
  skipWaiting: false,
})
for (const warning of warnings) console.warn(warning)
console.log(`Offline shell: ${count} files, ${Math.round(size / 1024)} KB precached.`)
