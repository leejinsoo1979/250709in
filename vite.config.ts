/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'
import { dirname } from 'node:path'
import path from 'node:path'

const __filename = fileURLToPath(import.meta.url)
const __dirname = dirname(__filename)

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: process.env.VERCEL ? '/' : (process.env.NODE_ENV === 'production' ? '/250709in/' : '/'),
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    minify: 'esbuild',
    target: 'esnext',
    rollupOptions: {
      external: [
        // AR 관련 파일들을 빌드에서 제외
        'src/editor/ar-viewer/ARViewer.tsx',
        'src/editor/ar-viewer/SimpleARViewer.tsx'
      ],
      output: {
        manualChunks: {
          // Three.js 관련 라이브러리들을 별도 청크로 분리
          'three-core': ['three'],
          'three-fiber': ['@react-three/fiber', '@react-three/drei'],
          // React 관련
          'react-vendor': ['react', 'react-dom'],
          // 라우팅 관련
          'router': ['react-router-dom'],
          // 상태 관리
          'store': ['zustand']
        }
      }
    },
    // 청크 크기 경고 임계값 늘리기 (당장은 경고만 숨김)
    chunkSizeWarningLimit: 1500
  },
  esbuild: {
    drop: ['console', 'debugger'],
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
  },
  server: {
    watch: {
      // 파일 감시 최적화
      ignored: ['**/node_modules/**', '**/.git/**'],
      // 폴링 간격 늘리기 (CPU 사용량 감소)
      interval: 1000,
    },
    hmr: {
      // HMR 타임아웃 설정
      timeout: 60000,
    },
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
      'Cross-Origin-Embedder-Policy': 'unsafe-none'
    }
  }
})
