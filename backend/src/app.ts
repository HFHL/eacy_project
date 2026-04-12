import express from 'express'
import cors from 'cors'
import path from 'path'
import { fileURLToPath } from 'url'
import apiV1Router from './routes/apiV1.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const UPLOADS_DIR = path.resolve(__dirname, '../uploads')

const app = express()

app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true }))

// 静态文件 serve — 文档预览使用
app.use('/uploads', express.static(UPLOADS_DIR))

app.get('/', (_req, res) => {
  res.json({
    success: true,
    code: 0,
    message: 'EACY backend scaffold ready',
    data: {
      docs: '/api/v1/health'
    }
  })
})

app.use('/api/v1', apiV1Router)

app.use((_req, res) => {
  res.status(404).json({
    success: false,
    code: 404,
    message: '路由不存在',
    data: null
  })
})

export default app
