import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  resolve: { tsconfigPaths: true },
  plugins: [react(), tailwindcss()],
  publicDir: false,
  build: {
    outDir: 'dist/client',
    emptyOutDir: false,
    assetsDir: 'offline-assets',
    rolldownOptions: { input: 'offline.html' },
  },
})
