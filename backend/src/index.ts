import dotenv from 'dotenv'
import path from 'path'
import { fileURLToPath } from 'url'
import app from './app.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
// .env 在项目根目录（backend/ 的上一级）
dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env') })

const port = Number(process.env.PORT || 8000)

app.listen(port, () => {
  console.log(`Backend listening on http://localhost:${port}`)
})
