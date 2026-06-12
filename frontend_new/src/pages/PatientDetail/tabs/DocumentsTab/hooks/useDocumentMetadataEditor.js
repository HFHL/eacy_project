import { useCallback, useState } from 'react'
import { message } from 'antd'
import { DOC_TYPE_CATEGORIES } from '../../../../../components/FormDesigner/core/docTypes'
import { updateDocumentMetadata } from '../../../../../api/document'

const METADATA_FIELD_IDS = [
  'identifiers',
  'organizationName',
  'patientName',
  'gender',
  'age',
  'documentType',
  'documentSubtype',
  'effectiveDate',
]

export const useDocumentMetadataEditor = ({
  document,
  documentDetail,
  fetchDocumentDetail,
  onExtractSuccess,
  onSave,
}) => {
  const [hasChanges, setHasChanges] = useState(false)
  const [editedFields, setEditedFields] = useState({})
  const [savingMetadata, setSavingMetadata] = useState(false)

  const handleFieldSave = useCallback((fieldId, value, confidence, skipMessage = false) => {
    setEditedFields(prev => {
      const next = { ...prev, [fieldId]: { value, confidence } }
      if (fieldId === 'documentType') {
        const children = value && DOC_TYPE_CATEGORIES[value]
          ? DOC_TYPE_CATEGORIES[value].children
          : []
        const currentSubtype = prev.documentSubtype?.value
        if (currentSubtype && !children.includes(currentSubtype)) {
          next.documentSubtype = { value: undefined, confidence: undefined }
        }
      }
      return next
    })
    setHasChanges(true)
    if (!skipMessage) {
      message.success('字段已修改，请点击保存按钮确认')
    }
  }, [])

  const handleSaveAll = useCallback(async () => {
    if (!document?.id) {
      message.error('文档ID不存在')
      return
    }

    const metadata = {}
    let hasMetadataChanges = false

    METADATA_FIELD_IDS.forEach(fieldId => {
      if (editedFields[fieldId] !== undefined) {
        const value = editedFields[fieldId]?.value ?? editedFields[fieldId]
        metadata[fieldId] = value !== null && value !== undefined && value !== '' ? value : null
        hasMetadataChanges = true
      }
    })

    metadata.metadata_json = documentDetail?.metadata_json || document?.metadata_json || {}

    if (hasMetadataChanges) {
      setSavingMetadata(true)
      try {
        const response = await updateDocumentMetadata(document.id, metadata)
        if (response.success) {
          message.success(response.message || '元数据保存成功')
          if (response.data?.rematch?.triggered) {
            onExtractSuccess?.()
          }
          await fetchDocumentDetail?.(document.id)
          setEditedFields({})
          setHasChanges(false)
        } else {
          message.error(response.message || '保存失败')
        }
      } catch (error) {
        console.error('保存元数据失败:', error)
        message.error(error?.message || error?.data?.detail || '保存失败，请稍后重试')
      } finally {
        setSavingMetadata(false)
      }
      return
    }

    onSave?.(document.id, editedFields)
    setEditedFields({})
    setHasChanges(false)
    message.success('所有修改已保存')
  }, [document, documentDetail, editedFields, fetchDocumentDetail, onExtractSuccess, onSave])

  const getFieldValue = useCallback((field) => (
    editedFields[field.fieldId]?.value ?? field.value
  ), [editedFields])

  const getFieldConfidence = useCallback((field) => (
    editedFields[field.fieldId]?.confidence ?? field.confidence
  ), [editedFields])

  return {
    editedFields,
    getFieldConfidence,
    getFieldValue,
    handleFieldSave,
    handleSaveAll,
    hasChanges,
    savingMetadata,
  }
}
