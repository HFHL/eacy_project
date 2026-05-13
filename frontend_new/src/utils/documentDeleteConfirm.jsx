import { Typography } from 'antd'

import { getDocumentEvidenceImpact } from '@/api/document'

const { Text } = Typography

/**
 * 构建"删除文档"二次确认弹窗的 content JSX。
 *
 * @param {string} fileName  文档显示名
 * @param {object} impact    getDocumentEvidenceImpact().data，可为 null
 * @param {object} opts
 *   - errorColor   红色文字色（来自各页面主题 token）
 *   - mutedColor   次级文字色（字段列表使用）
 */
export const buildDeleteContent = (fileName, impact, { errorColor = '#ff4d4f', mutedColor = '#888' } = {}) => {
  const hasImpact = !!(impact && impact.evidence_count > 0 && Array.isArray(impact.fields))
  const fieldTitles = hasImpact
    ? impact.fields.map((f) => f?.title || f?.code).filter(Boolean)
    : []

  return (
    <div>
      <p>确定要删除文档 <Text strong>{fileName}</Text> 吗？</p>
      {hasImpact && (
        <>
          <p style={{ marginBottom: 4 }}>
            该文档已作为 <Text strong>{fieldTitles.length}</Text> 个字段的来源证据：
          </p>
          <p style={{ marginBottom: 8, color: mutedColor }}>{fieldTitles.join('、')}</p>
          <p style={{ marginBottom: 4 }}>
            删除后这些字段的值仍保留在病历中，但来源将标记为「已删除文档」。
          </p>
        </>
      )}
      <p style={{ color: errorColor, marginBottom: 0 }}>删除操作不可撤销</p>
    </div>
  )
}

/**
 * 安全获取 evidence-impact：失败时返回 null（不影响删除流程，按"无引用"展示）。
 */
export const fetchEvidenceImpactSafe = async (documentId) => {
  if (!documentId) return null
  try {
    const response = await getDocumentEvidenceImpact(documentId)
    return response?.data || null
  } catch (error) {
    console.warn('查询文档证据影响失败，按未引用处理:', error)
    return null
  }
}
