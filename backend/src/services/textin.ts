/**
 * services/textin.ts
 * Textin xParse 文档解析服务
 *
 * 流程：从 OSS 下载文件 → 以 binary 发给 Textin → 解析返回 segments
 */

import OSS from 'ali-oss'

// xParse API endpoint (支持 PDF / 多页图片)
const TEXTIN_API_URL = 'https://api.textin.com/ai/service/v1/pdf_to_markdown'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface OcrSegment {
  page_id:    number
  page_angle: number   // 页面旋转角度（0 / 90 / 180 / 270）
  text:       string
  position:   number[] // 8 个整数：左上→右上→右下→左下
  type:       string   // paragraph | image | table
  sub_type:   string | null
}

export interface OcrResult {
  doc_id:            string
  total_page_number: number
  segments:          OcrSegment[]
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function buildOssClient() {
  const endpoint = process.env.OSS_ENDPOINT!        // oss-cn-shanghai.aliyuncs.com
  const region   = process.env.OSS_REGION!           // cn-shanghai
  const bucket   = process.env.OSS_BUCKET_NAME!

  return new OSS({
    // ali-oss region 格式需要是 "oss-cn-shanghai"（带 oss- 前缀）
    region:          `oss-${region}`,
    accessKeyId:     process.env.OSS_ACCESS_KEY_ID!,
    accessKeySecret: process.env.OSS_ACCESS_KEY_SECRET!,
    bucket,
    endpoint,          // 明确指定 endpoint，避免自动拼接出错
  })
}

/** 从 OSS 下载文件，返回 Buffer */
async function downloadFromOss(objectKey: string): Promise<Buffer> {
  const client = buildOssClient()
  const result = await client.get(objectKey)
  return result.content as Buffer
}


// ─── Main ─────────────────────────────────────────────────────────────────────

/**
 * 调用 Textin xParse，解析文档并返回 segments
 * @param docId     文档 id（用于标注 OcrResult.doc_id）
 * @param objectKey OSS object key
 */
export async function parseDocument(docId: string, objectKey: string): Promise<OcrResult> {
  // 在函数内读取 env，确保 dotenv 已初始化
  const appId  = process.env.TEXTIN_APP_ID
  const secret = process.env.TEXTIN_SECRET_CODE
  if (!appId || !secret) {
    throw new Error('缺少 Textin 配置：TEXTIN_APP_ID 或 TEXTIN_SECRET_CODE 未设置')
  }

  // 1. 从 OSS 下载文件内容
  console.log(`[textin] 正在从 OSS 下载: ${objectKey}`)
  const fileBuffer = await downloadFromOss(objectKey)
  console.log(`[textin] 下载完成，大小: ${(fileBuffer.length / 1024).toFixed(1)} KB`)

  // 2. 调用 Textin API
  //    参数：返回 detail（各段落坐标），不需要 markdown
  const url = new URL(TEXTIN_API_URL)
  url.searchParams.set('markdown_details', '1')  // 返回 detail 字段
  url.searchParams.set('page_details', '1')       // 返回 pages 字段（获取 page angle）
  url.searchParams.set('apply_document_tree', '0') // 不需要目录树

  console.log(`[textin] 正在调用 API: ${url.toString()}`)
  const response = await fetch(url.toString(), {
    method: 'POST',
    headers: {
      'x-ti-app-id':      appId,
      'x-ti-secret-code': secret,
      'Content-Type':     'application/octet-stream',
    },
    body: fileBuffer,
  })

  if (!response.ok) {
    throw new Error(`Textin API 请求失败: ${response.status} ${response.statusText}`)
  }

  const json = await response.json() as any

  if (json.code !== 200) {
    throw new Error(`Textin 返回错误: code=${json.code} message=${json.message}`)
  }

  // 3. 解析返回结构
  const result = json.result

  // 建立 page_id → angle 映射
  const angleMap: Record<number, number> = {}
  if (Array.isArray(result.pages)) {
    for (const page of result.pages) {
      angleMap[page.page_id] = page.angle ?? 0
    }
  }

  // 从 detail 中提取各段落
  const segments: OcrSegment[] = []
  if (Array.isArray(result.detail)) {
    for (const item of result.detail) {
      // 跳过没有文本或坐标的条目
      if (!item.text || !item.position) continue

      segments.push({
        page_id:    item.page_id,
        page_angle: angleMap[item.page_id] ?? 0,
        text:       item.text,
        position:   item.position,
        type:       item.type ?? 'paragraph',
        sub_type:   item.sub_type ?? null,
      })
    }
  }

  const totalPages = result.total_page_number ?? result.valid_page_number ?? 0

  console.log(`[textin] 解析完成: ${totalPages} 页, ${segments.length} 个段落`)

  return {
    doc_id: docId,
    total_page_number: totalPages,
    segments,
  }
}
