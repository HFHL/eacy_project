import { Modal, message } from 'antd'
import { batchAiMatchAsync } from '../../../api/document'
import { normalizeValue } from './documentGrouping'

export const useBatchPatientMatchRecommendation = ({
  fetchNeedsReviewDocs,
  fetchNewPatientDocs,
  newPatientDocs,
}) => {
  const getBatchMatchTargets = (patientInfo, excludeIds = []) => {
    const excludeSet = new Set(excludeIds)
    const idCard = normalizeValue(patientInfo?.id_card)
    const phone = normalizeValue(patientInfo?.phone)
    const name = normalizeValue(patientInfo?.name)

    const targets = newPatientDocs.filter(doc => {
      if (excludeSet.has(doc.id)) return false
      const info = doc.extractedInfo || {}
      if (idCard) return normalizeValue(info.id_number) === idCard
      if (phone) return normalizeValue(info.phone) === phone
      if (name) return normalizeValue(info.name) === name
      return false
    })

    return Array.from(new Set(targets.map(doc => doc.id)))
  }

  const handleBatchAiMatch = async (documentIds, patientName) => {
    if (!documentIds.length) return

    try {
      const response = await batchAiMatchAsync(documentIds)
      if (response?.success) {
        message.success(`已对 ${documentIds.length} 个文档启动匹配推荐${patientName ? `（${patientName}）` : ''}`)
        setTimeout(() => {
          fetchNewPatientDocs()
          fetchNeedsReviewDocs()
        }, 300)
      } else {
        message.error(response?.message || '批量匹配推荐启动失败')
      }
    } catch (error) {
      console.error('批量匹配推荐启动失败:', error)
      message.error(error.response?.data?.message || '批量匹配推荐启动失败')
    }
  }

  const promptBatchMatchForSamePerson = (patientInfo, excludeIds = []) => {
    const targetIds = getBatchMatchTargets(patientInfo, excludeIds)
    if (!targetIds.length) return

    Modal.confirm({
      title: '对同患者文档批量匹配推荐？',
      content: `检测到 ${targetIds.length} 个可能属于同一患者的文档，是否立即批量匹配推荐？`,
      okText: '开始匹配',
      cancelText: '稍后',
      onOk: () => handleBatchAiMatch(targetIds, patientInfo?.name),
    })
  }

  return { promptBatchMatchForSamePerson }
}
