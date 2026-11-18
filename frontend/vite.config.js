import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// `npm run build` writes to dist/, which `python app.py` serves.
// `npm run dev` proxies API calls to a running `python app.py`.
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:8000',
    },
  },
})
