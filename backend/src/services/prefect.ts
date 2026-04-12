/**
 * services/prefect.ts
 * 最小 Prefect API 客户端 —— 仅用于触发 OCR flow run
 */

const PREFECT_API_URL = () => process.env.PREFECT_API_URL || 'http://127.0.0.1:4200/api'
const PREFECT_DEPLOYMENT_ID = () => process.env.PREFECT_OCR_DEPLOYMENT_ID || ''

export interface TriggerResult {
  flowRunId: string
}

/**
 * 调用 Prefect API 创建一个 flow run
 * POST /deployments/{id}/create_flow_run
 */
export async function triggerOcrFlowRun(documentId: string): Promise<TriggerResult> {
  const deploymentId = PREFECT_DEPLOYMENT_ID()
  if (!deploymentId) {
    throw new Error('缺少环境变量 PREFECT_OCR_DEPLOYMENT_ID')
  }

  const url = `${PREFECT_API_URL()}/deployments/${deploymentId}/create_flow_run`

  console.log(`[prefect] 触发 OCR flow run: documentId=${documentId}`)

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      parameters: { document_id: documentId },
    }),
  })

  if (!resp.ok) {
    const text = await resp.text()
    throw new Error(`Prefect API 错误 ${resp.status}: ${text}`)
  }

  const data = (await resp.json()) as any
  const flowRunId = data.id as string

  console.log(`[prefect] flow run 已创建: ${flowRunId}`)
  return { flowRunId }
}
