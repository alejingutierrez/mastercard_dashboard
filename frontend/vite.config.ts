import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    // Use the SWC-powered React plugin for faster transforms
    react(),
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
          'ui-vendor': ['antd', '@ant-design/icons'],
          'chart-vendor': ['recharts'],
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
    include: ['react', 'react-dom', 'antd', '@ant-design/icons'],
    force: false, // Don't force re-optimization
  },
  // Disable type checking in build (use separate type-check script)
  esbuild: {
    logOverride: { 'this-is-undefined-in-esm': 'silent' },
  },
})
