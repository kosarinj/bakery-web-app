import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'

const mdbBrowserPath = resolve('node_modules/mdb-reader/lib/browser/index.js')

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      'mdb-reader': mdbBrowserPath,
    },
  },
  server: {
    port: 5174,
    proxy: {
      '/api': 'http://localhost:3002'
    }
  }
})
