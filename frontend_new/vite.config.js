import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'

/** 防止非法 URI 导致 Vite 静态中间件 decodeURI 报错崩溃（URI malformed） */
function fixMalformedUriPlugin() {
  return {
    name: 'fix-malformed-uri',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        try {
          decodeURI(req.url)
          next()
        } catch (_e) {
          res.statusCode = 400
          res.setHeader('Content-Type', 'text/plain; charset=utf-8')
          res.end('Bad Request: Invalid URL')
        }
      })
    }
  }
}

export default defineConfig({
  plugins: [fixMalformedUriPlugin(), react()],
  // base 路径配置（本地 Docker 部署使用 '/'）
  base: '/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@components': path.resolve(__dirname, './src/components'),
      '@pages': path.resolve(__dirname, './src/pages'),
      '@utils': path.resolve(__dirname, './src/utils'),
      '@store': path.resolve(__dirname, './src/store'),
      '@styles': path.resolve(__dirname, './src/styles')
    }
  },
  server: {
    port: 5173,
    open: false,
    host: true,
    strictPort: true,
    allowedHosts: ['.ngrok-free.app', '.ngrok.io', 'localhost', '127.0.0.1', 'eacy.cinocore.com'],
    proxy: {
      '/api/v1': {
        target: process.env.VITE_DEV_API_PROXY_TARGET || 'http://localhost:8000',
        changeOrigin: true,
      },
    },
    watch: {
      usePolling: true,
      interval: 1000
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          antd: ['antd', '@ant-design/icons']
        }
      }
    }
  },
  css: {
    preprocessorOptions: {
      less: {
        javascriptEnabled: true,
        modifyVars: {
          // Ant Design 主题定制
          '@primary-color': '#1677ff',
          '@success-color': '#52c41a',
          '@warning-color': '#faad14',
          '@error-color': '#ff4d4f',
          '@font-size-base': '14px',
          '@border-radius-base': '6px'
        }
      }
    }
  }
})
