import { useState } from 'react'
import { Modal, message } from 'antd'
import { DeleteOutlined } from '@ant-design/icons'
import { deleteDocument, reparseDocumentSync } from '../../../../../api/document'
import { mergeEhrData } from '../../../../../api/patient'
import { buildDeleteContent, fetchEvidenceImpactSafe } from '../../../../../utils/documentDeleteConfirm'
import { appThemeToken } from '../../../../../styles/themeTokens'

export function useDocumentDetailActions({
  document,
  fetchDocumentDetail,
  onClose,
  onDeleteSuccess,
  onExtractSuccess,
  patientId,
}) {
  const [mergeModalVisible, setMergeModalVisible] = useState(false)
  const [extractResult, setExtractResult] = useState(null)
  const [merging, setMerging] = useState(false)
  const [reparsing, setReparsing] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const handleReparse = async () => {
    if (!document?.id) {
      message.error('文档信息不存在')
      return
    }

    setReparsing(true)
    try {
      const response = await reparseDocumentSync(document.id, { parserType: 'textin' })

      if (response.success) {
        message.success('OCR 任务已提交，正在后台解析…')
        if (document?.id) {
          await fetchDocumentDetail(document.id)
        }
      } else {
        message.error(response.message || '提交 OCR 任务失败，请稍后重试')
      }
    } catch (error) {
      const errorMsg = error.response?.data?.message || error.message || '提交 OCR 任务失败'
      message.error(`提交 OCR 任务失败: ${errorMsg}`)
    } finally {
      setReparsing(false)
    }
  }

  const handleConfirmMerge = async () => {
    if (!document || !document.patientBinding?.patientId) {
      message.warning('缺少患者信息，无法合并')
      return
    }

    setMerging(true)
    try {
      const response = await mergeEhrData(document.patientBinding.patientId, {
        document_id: document.id,
        conflict_policy: 'prefer_latest',
      })

      if (response.success) {
        const result = response.data
        message.success(
          `合并成功！新增 ${result.new_field_count || 0} 个字段，更新 ${result.updated_field_count || 0} 个字段`
        )
        setMergeModalVisible(false)
        setExtractResult(null)
        onExtractSuccess?.()
      } else {
        message.error(response.message || '合并失败')
      }
    } catch (error) {
      console.error('合并病历失败:', error)
      message.error(error.response?.data?.message || '合并病历失败')
    } finally {
      setMerging(false)
    }
  }

  const handleCancelMerge = () => {
    setMergeModalVisible(false)
    setExtractResult(null)
    message.info('已跳过合并，抽取数据已保存到文档')
  }

  const handleDelete = async () => {
    if (!document?.id) return
    const impact = await fetchEvidenceImpactSafe(document.id)
    const fileName = document.fileName || document.file_name || document.id
    let confirmRef = null
    confirmRef = Modal.confirm({
      title: '确认删除文档',
      icon: <DeleteOutlined style={{ color: appThemeToken.colorError }} />,
      content: buildDeleteContent(fileName, impact, { errorColor: appThemeToken.colorError }),
      okText: '确认删除',
      okType: 'danger',
      cancelText: '取消',
      centered: true,
      onOk: async () => {
        try {
          setDeleting(true)
          const response = await deleteDocument(document.id, true)
          if (response.success) {
            message.success('文档删除成功')
            onDeleteSuccess?.()
            onClose?.()
            confirmRef?.destroy?.()
            return true
          }
          throw new Error(response.message || '删除失败')
        } catch (error) {
          console.error('删除文档失败:', error)
          const detail = error?.data?.detail || error?.message || '删除文档失败'
          message.error(detail)
          throw error
        } finally {
          setDeleting(false)
        }
      },
    })
  }

  const handleMergeToPatient = async (extractionId) => {
    if (!patientId) {
      message.warning('缺少患者信息，无法合并')
      return
    }

    if (!document?.id) {
      message.warning('缺少文档信息，无法合并')
      return
    }

    if (!extractionId) {
      message.warning('缺少抽取记录ID，无法合并')
      return
    }

    setMerging(true)
    try {
      const response = await mergeEhrData(patientId, {
        document_id: document.id,
        source_extraction_id: extractionId,
      })

      if (response.success) {
        const result = response.data
        const msgParts = []
        if (result.new_field_count > 0) {
          msgParts.push(`新增 ${result.new_field_count} 个字段`)
        }
        if (result.appended_array_count > 0) {
          msgParts.push(`累加 ${result.appended_array_count} 个数组字段`)
        }
        if (result.conflict_count > 0) {
          msgParts.push(`${result.conflict_count} 个冲突待处理`)
        }
        message.success(msgParts.length > 0 ? `合并成功！${msgParts.join('，')}` : '合并成功！')
        fetchDocumentDetail(document.id)
        onExtractSuccess?.()
      } else {
        message.error(response.message || '合并失败')
      }
    } catch (error) {
      console.error('合并病历失败:', error)
      message.error(error.response?.data?.message || '合并病历失败')
    } finally {
      setMerging(false)
    }
  }

  return {
    deleting,
    extractResult,
    handleCancelMerge,
    handleConfirmMerge,
    handleDelete,
    handleMergeToPatient,
    handleReparse,
    mergeModalVisible,
    merging,
    reparsing,
  }
}
