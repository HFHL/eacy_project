import { useCallback, useState } from 'react'
import { Typography } from 'antd'
import { DeleteOutlined, DisconnectOutlined } from '@ant-design/icons'
import {
  aiMatchPatientAsync,
  deleteDocument,
  deleteDocuments,
  extractEhrData,
  parseDocument,
  unarchiveDocument,
} from '../../../api/document'
import { buildDeleteContent, fetchEvidenceImpactSafe } from '../../../utils/documentDeleteConfirm'
import { modalWidthPreset } from '../../../styles/themeTokens'
import { confirmRecommendedArchive as runConfirmRecommendedArchive } from './recommendedArchiveAction'

const { Text } = Typography

export const useFileListDocumentActions = ({
  groupDocsMap,
  handleArchivePatient,
  message,
  modal,
  refreshAll,
  selectedRowKeys,
  setBatchDeleteLoading,
  setCreatePatientDocIds,
  setCreatePatientDrawerOpen,
  setCreatePatientGroupId,
  setCreatePatientMode,
  setCreatePatientPrefillValues,
  setDetailModalVisible,
  setFileList,
  setMatchingDocIds,
  setPollingParseIds,
  setSelectedDocument,
  setSelectedRowKeys,
  setStartingParseIds,
  token,
  treeData,
}) => {
  const [detailRefreshTrigger] = useState(0)

  const handleParseDocument = useCallback(async (documentId) => {
    setStartingParseIds((prev) => new Set([...prev, documentId]))
    try {
      const response = await parseDocument(documentId)
      setStartingParseIds((prev) => {
        const next = new Set(prev)
        next.delete(documentId)
        return next
      })
      if (response.success) {
        message.success('解析任务已启动')
        setFileList((prev) => prev.map((file) => (
          file.id === documentId ? { ...file, task_status: 'parsing' } : file
        )))
        setPollingParseIds((prev) => new Set([...prev, documentId]))
      } else {
        message.error(response.message || '解析启动失败')
      }
    } catch {
      message.error('解析文档失败')
      setStartingParseIds((prev) => {
        const next = new Set(prev)
        next.delete(documentId)
        return next
      })
    }
  }, [message, setFileList, setPollingParseIds, setStartingParseIds])

  const handleAiMatchPatient = useCallback(async (documentId) => {
    setMatchingDocIds((prev) => new Set([...prev, documentId]))
    try {
      const response = await aiMatchPatientAsync(documentId)
      if (response.success) {
        message.success('AI 匹配完成')
        refreshAll({ forceTree: true })
      } else {
        message.error(response.message || 'AI 匹配失败')
      }
    } catch {
      message.error('AI匹配患者失败')
    } finally {
      setMatchingDocIds((prev) => {
        const next = new Set(prev)
        next.delete(documentId)
        return next
      })
    }
  }, [message, refreshAll, setMatchingDocIds])

  const handleDeleteDocument = useCallback(async (documentId, fileName) => {
    const impact = await fetchEvidenceImpactSafe(documentId)
    modal.confirm({
      title: '确认删除文档',
      icon: <DeleteOutlined style={{ color: token.colorError }} />,
      content: buildDeleteContent(fileName, impact, {
        errorColor: token.colorError,
        mutedColor: token.colorTextSecondary,
      }),
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      centered: true,
      width: modalWidthPreset.standard,
      onOk: async () => {
        try {
          const response = await deleteDocument(documentId, true)
          if (response.success) {
            message.success('文档删除成功')
            refreshAll({ forceTree: true })
          } else {
            message.error(response.message || '删除失败')
          }
        } catch (error) {
          message.error(error?.data?.detail || error?.message || '删除文档失败')
        }
      },
    })
  }, [message, modal, refreshAll, token.colorError, token.colorTextSecondary])

  const handleUnbindDocument = useCallback((documentId, fileName) => {
    modal.confirm({
      title: '确认解绑文档',
      icon: <DisconnectOutlined style={{ color: token.colorWarning }} />,
      content: (
        <div>
          <p>确定要将文档 <Text strong>{fileName}</Text> 从当前患者解绑吗？</p>
          <p style={{ color: token.colorTextSecondary }}>解绑后文档将自动重新匹配并进入待归档状态，患者数据池中对应的文档数据也会被移除。</p>
        </div>
      ),
      okText: '确认解绑',
      okButtonProps: { danger: true },
      cancelText: '取消',
      centered: true,
      width: modalWidthPreset.standard,
      onOk: async () => {
        try {
          const response = await unarchiveDocument(documentId, true)
          if (response.success) {
            message.success('文档已解绑，正在重新匹配...')
            setPollingParseIds((prev) => new Set([...prev, documentId]))
            refreshAll({ forceTree: true })
          } else {
            message.error(response.message || '解绑失败')
          }
        } catch (error) {
          message.error(error.response?.data?.message || '解绑文档失败')
        }
      },
    })
  }, [message, modal, refreshAll, setPollingParseIds, token.colorTextSecondary, token.colorWarning])

  const handleBatchDelete = useCallback(() => {
    if (!selectedRowKeys.length) return
    modal.confirm({
      title: '确认批量删除',
      icon: <DeleteOutlined style={{ color: token.colorError }} />,
      content: (
        <div>
          <p>确定要删除选中的 <Text strong>{selectedRowKeys.length}</Text> 个文档吗？</p>
          <p style={{ color: token.colorError }}>删除操作不可撤销</p>
        </div>
      ),
      okText: '删除',
      okButtonProps: { danger: true },
      cancelText: '取消',
      centered: true,
      width: modalWidthPreset.standard,
      onOk: async () => {
        try {
          setBatchDeleteLoading(true)
          const response = await deleteDocuments(selectedRowKeys, true)
          if (response.success) {
            const { deleted_count, failed_count, errors } = response.data || {}
            if (failed_count > 0 && errors?.length) {
              message.warning(`成功删除 ${deleted_count} 个，${failed_count} 个失败`)
            } else {
              message.success(response.message || `已删除 ${deleted_count} 个文档`)
            }
            setSelectedRowKeys([])
            refreshAll({ forceTree: true })
          } else {
            message.error(response.message || '批量删除失败')
          }
        } catch {
          message.error('批量删除失败')
        } finally {
          setBatchDeleteLoading(false)
        }
      },
    })
  }, [message, modal, refreshAll, selectedRowKeys, setBatchDeleteLoading, setSelectedRowKeys, token.colorError])

  const handleDownload = useCallback((record) => {
    if (record?.file_url) window.open(record.file_url, '_blank')
    else message.error('文档URL不存在')
  }, [message])

  const handleFileClick = useCallback((file) => {
    const isParsed = ['parsed', 'ai_matching', 'pending_confirm_new', 'pending_confirm_review',
      'pending_confirm_uncertain', 'auto_archived', 'archived'].includes(file.task_status)
    setSelectedDocument({
      id: file.id,
      fileName: file.file_name,
      status: file.task_status || 'uploaded',
      isParsed,
      isExtracted: false,
      patientId: file.patient_info?.patient_id || null,
    })
    setDetailModalVisible(true)
  }, [setDetailModalVisible, setSelectedDocument])

  const handleDetailModalClose = useCallback(() => {
    setDetailModalVisible(false)
    setSelectedDocument(null)
    refreshAll({ forceTree: true })
  }, [refreshAll, setDetailModalVisible, setSelectedDocument])

  const handleReExtract = useCallback(async (documentId) => {
    try {
      const response = await extractEhrData(documentId)
      if (response.success) {
        message.success('重新抽取成功')
        refreshAll({ forceTree: true })
      } else {
        message.error(response.message || '重新抽取失败')
      }
    } catch {
      message.error('重新抽取失败')
    }
  }, [message, refreshAll])

  const handleCreatePatientFromDoc = useCallback((record) => {
    if (!record?.id) return
    setCreatePatientMode('docs')
    setCreatePatientGroupId(null)
    setCreatePatientDocIds([record.id])
    setCreatePatientPrefillValues(null)
    setCreatePatientDrawerOpen(true)
  }, [
    setCreatePatientDocIds,
    setCreatePatientDrawerOpen,
    setCreatePatientGroupId,
    setCreatePatientMode,
    setCreatePatientPrefillValues,
  ])

  const handleConfirmRecommendedArchive = useCallback(async (record) => {
    await runConfirmRecommendedArchive({
      groupDocsMap,
      handleArchivePatient,
      message,
      modal,
      record,
      refreshAll,
      treeData,
    })
  }, [groupDocsMap, handleArchivePatient, message, modal, refreshAll, treeData])

  return {
    detailRefreshTrigger,
    handleAiMatchPatient,
    handleBatchDelete,
    handleConfirmRecommendedArchive,
    handleCreatePatientFromDoc,
    handleDeleteDocument,
    handleDetailModalClose,
    handleDownload,
    handleFileClick,
    handleParseDocument,
    handleReExtract,
    handleUnbindDocument,
  }
}
