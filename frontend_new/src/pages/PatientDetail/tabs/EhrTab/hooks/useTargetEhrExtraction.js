import { useState } from 'react'
import { message } from 'antd'

import { extractEhrData, extractEhrDataTargeted, uploadDocument } from '@/api/document'
import { getPatientEhr } from '@/api/patient'
import { upsertTask } from '@/utils/taskStore'

export const useTargetEhrExtraction = ({
  ehrDocuments,
  onEhrRefresh,
  patientId,
  selectedEhrDocument,
  selectedEhrGroup,
}) => {
  const [extracting, setExtracting] = useState(false)
  const [targetModalOpen, setTargetModalOpen] = useState(false)
  const [targetDocumentId, setTargetDocumentId] = useState(null)
  const [targetFileList, setTargetFileList] = useState([])
  const [targetContext, setTargetContext] = useState(null)

  const handleReExtract = async (doc) => {
    if (!doc || !doc.id) {
      message.error('文档信息不完整')
      return
    }

    setExtracting(true)
    try {
      console.log('开始重新抽取文档:', doc.id)
      const response = await extractEhrData(doc.id)
      console.log('重新抽取响应:', response)

      if (response.success) {
        message.success(`重新抽取成功，共抽取 ${response.data?.fields_count || 0} 个字段`)
        onEhrRefresh?.()
      } else {
        message.error(response.message || '重新抽取失败')
      }
    } catch (error) {
      console.error('重新抽取异常:', error)
      const errorMsg = error.response?.data?.message || error.message || '重新抽取失败'
      message.error(`重新抽取失败: ${errorMsg}`)
    } finally {
      setExtracting(false)
    }
  }

  const openTargetExtraction = async () => {
    if (!selectedEhrGroup) {
      message.warning('请先选择一个表单')
      return
    }

    setTargetDocumentId(selectedEhrDocument?.id || ehrDocuments?.[0]?.id || null)
    setTargetFileList([])
    setTargetModalOpen(true)
    if (!targetContext && patientId) {
      try {
        const response = await getPatientEhr(patientId)
        setTargetContext(response.data?.context || null)
      } catch (error) {
        console.error('获取病历上下文失败:', error)
      }
    }
  }

  const submitTargetExtraction = async () => {
    if (!patientId || !selectedEhrGroup) return

    setExtracting(true)
    try {
      let documentId = targetDocumentId
      let waitForDocumentReady = false
      const file = targetFileList[0]?.originFileObj
      if (file) {
        const uploadResponse = await uploadDocument(file, patientId)
        documentId = uploadResponse.data?.id || uploadResponse.data?.document_id
        waitForDocumentReady = true
      }
      if (!documentId) {
        message.warning('请选择或上传一个文档')
        return
      }

      const response = await extractEhrDataTargeted({
        documentId,
        patientId,
        contextId: targetContext?.id,
        schemaVersionId: targetContext?.schema_version_id,
        targetFormKey: selectedEhrGroup,
        waitForDocumentReady,
      })
      if (response.success) {
        message.success(waitForDocumentReady ? '文档已上传，OCR 完成后将自动专项抽取' : '专项抽取已完成')
        const taskId = response.data?.task_id || response.data?.id
        if (taskId) {
          upsertTask({
            task_id: taskId,
            patient_id: patientId,
            document_id: documentId,
            type: 'ehr_targeted_extract',
            status: 'pending',
            target_form_key: selectedEhrGroup,
            message: waitForDocumentReady ? '等待 OCR 与后台专项抽取' : '专项抽取进行中',
            created_at: new Date().toISOString(),
          })
        }
        setTargetModalOpen(false)
        onEhrRefresh?.()
      } else {
        message.error(response.message || '专项抽取失败')
      }
    } catch (error) {
      console.error('专项抽取失败:', error)
      const detail = error.response?.data?.detail || error.response?.data?.message || error.message || '专项抽取失败'
      message.error(detail)
    } finally {
      setExtracting(false)
    }
  }

  return {
    extracting,
    handleReExtract,
    openTargetExtraction,
    setTargetDocumentId,
    setTargetFileList,
    setTargetModalOpen,
    submitTargetExtraction,
    targetDocumentId,
    targetFileList,
    targetModalOpen,
  }
}
