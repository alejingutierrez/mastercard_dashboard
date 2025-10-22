import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react({
      // Optimize React plugin performance
      babel: {
        plugins: [],
      },
    }),
  ],
  build: {
    // Optimize build performance
    target: 'es2022',
    minify: 'esbuild',
    sourcemap: false,
    // Improve build speed
    reportCompressedSize: false,
    rollupOptions: {
      output: {
        manualChunks: {
          'react-vendor': ['react', 'react-dom'],
          'ui-vendor': ['antd', '@ant-design/icons', '@mui/material'],
          'chart-vendor': ['recharts', '@mui/x-charts'],
        },
      },
    },
    // Prevent memory issues during build
    chunkSizeWarningLimit: 1000,
  },
  server: {
    // Prevent server from hanging in CI
    host: process.env.CI ? '0.0.0.0' : 'localhost',
    strictPort: false,
  },
  // Optimize deps to prevent hanging
  optimizeDeps: {
    include: ['react', 'react-dom', 'antd', '@mui/material'],
    force: false, // Don't force re-optimization
  },
  // Disable type checking in build (use separate type-check script)
  esbuild: {
    logOverride: { 'this-is-undefined-in-esm': 'silent' },
  },
})
