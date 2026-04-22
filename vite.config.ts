import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          'firebase':  ['firebase/app','firebase/auth','firebase/firestore','firebase/storage'],
          'react-core':['react','react-dom','react-router-dom'],
        },
      },
    },
    chunkSizeWarningLimit: 1000,
  },
})
