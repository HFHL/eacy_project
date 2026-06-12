import { useCallback, useMemo, useRef, useState } from 'react'
import { message } from 'antd'
import { extractEhrDataTargeted, uploadAndArchiveAsync } from '../../../api/document'
import { startCrfExtraction } from '../../../api/project'
import { upsertTask } from '../../../utils/taskStore'
import { MAX_UPLOAD_FILE_SIZE, MAX_UPLOAD_FILE_SIZE_MB } from '../../../constants/uploadLimits'
import { buildCandidateDocuments } from '../utils/documentCandidateUtils'

const getTargetFormKey = (selectedPath) => {
  if (!selectedPath) return null
  const parts = selectedPath.split('.').filter(Boolean)
  return parts.slice(0, Math.min(parts.length, 2)).join('.')
}

const getTargetSection = (selectedPath) => {
  if (!selectedPath) return null
  const parts = selectedPath.split('.')
  return parts.slice(0, Math.min(parts.length, 2)).join(' / ')
}

export function useTargetedExtraction({
  draftData,
  onDataChange,
  patientId,
  projectDocuments,
  projectId,
  selectedPath,
  sourcePatientId,
}) {
  const [selectedExtractDocId, setSelectedExtractDocId] = useState(null)
  const [extractConfirming, setExtractConfirming] = useState(false)
  const [uploadExtractModalOpen, setUploadExtractModalOpen] = useState(false)
  const uploadFileInputRef = useRef(null)
  const targetFormKey = useMemo(() => getTargetFormKey(selectedPath), [selectedPath])
  const targetSection = useMemo(() => getTargetSection(selectedPath), [selectedPath])
  const extractCandidateDocuments = useMemo(
    () => buildCandidateDocuments(draftData, projectDocuments),
    [draftData, projectDocuments]
  )
  const selectedExtractDocument = useMemo(
    () => extractCandidateDocuments.find((doc) => String(doc?.id) === String(selectedExtractDocId)) || null,
    [extractCandidateDocuments, selectedExtractDocId]
  )

  const handleOpenUploadExtractModal = useCallback(() => {
    if (!targetFormKey) {
      message.warning('请先在左侧选择目标表单')
      return
    }
    setUploadExtractModalOpen(true)
  }, [targetFormKey])

  const handleCloseUploadExtractModal = useCallback(() => {
    setUploadExtractModalOpen(false)
  }, [])

  const handleUploadDocumentClick = useCallback(() => {
    if (!patientId) {
      message.warning('缺少患者信息，暂无法上传文档')
      return
    }
    if (!targetFormKey) {
      message.warning('请先在左侧选择目标表单')
      return
    }
    uploadFileInputRef.current?.click()
  }, [patientId, targetFormKey])

  const submitTargetedExtract = useCallback(async (document) => {
    if (!patientId) {
      message.warning('缺少患者信息，暂无法执行文档抽取')
      return
    }
    if (!targetFormKey) {
      message.warning('请先在左侧选择目标表单')
      return
    }
    const doc = document || selectedExtractDocument
    const documentId = doc?.id != null ? String(doc.id) : ''
    if (!documentId) {
      message.warning('请先选择文档')
      return
    }
    setExtractConfirming(true)
    try {
      const response = projectId
        ? await startCrfExtraction({
            projectId,
            projectPatientId: patientId,
            patientId: sourcePatientId || doc.patient_id || doc.patientId || '',
            documentId,
            targetFormKey,
          })
        : await extractEhrDataTargeted({
            documentId,
            patientId,
            targetFormKey,
          })
      if (response.success) {
        message.success(projectId ? '科研 CRF 靶向抽取已提交' : '病历靶向抽取已提交')
        const taskId = response.data?.task_id || response.data?.id
        if (taskId) {
          upsertTask({
            task_id: taskId,
            patient_id: projectId ? (sourcePatientId || patientId) : patientId,
            project_id: projectId || undefined,
            project_patient_id: projectId ? patientId : undefined,
            type: projectId ? 'project_crf_targeted' : 'ehr_targeted_extract',
            status: 'pending',
            target_form_key: targetFormKey,
            message: projectId ? '科研 CRF 靶向抽取已排队' : '病历靶向抽取已排队',
            created_at: new Date().toISOString(),
          })
        }
        setUploadExtractModalOpen(false)
        onDataChange && onDataChange(draftData)
      } else {
        message.error(response.message || '抽取失败')
      }
    } catch (err) {
      message.error('抽取失败: ' + (err.message || '未知错误'))
    } finally {
      setExtractConfirming(false)
    }
  }, [draftData, onDataChange, patientId, projectId, selectedExtractDocument, sourcePatientId, targetFormKey])

  const handleSelectExistingDocumentForExtract = useCallback((doc) => {
    const docId = doc?.id != null ? String(doc.id) : ''
    if (!docId) return
    setSelectedExtractDocId(docId)
    submitTargetedExtract(doc)
  }, [submitTargetedExtract])

  const handleUploadExtractFile = useCallback(async (e) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    const supportedTypes = ['application/pdf', 'image/jpg', 'image/jpeg', 'image/png']
    if (!supportedTypes.includes(file.type)) {
      message.error('不支持的文件格式，请上传 PDF、JPG、JPEG 或 PNG 文件')
      return
    }
    if (file.size > MAX_UPLOAD_FILE_SIZE) {
      message.error(`文件超过 ${MAX_UPLOAD_FILE_SIZE_MB}MB 限制`)
      return
    }
    if (!patientId) {
      message.error('缺少患者信息，无法上传')
      return
    }
    if (!targetSection) {
      message.error('请先在左侧目录中选择目标字段组，再进行文档抽取')
      return
    }

    message.loading({ content: '正在上传文件并触发 OCR 流水线...', key: 'uploadExtract' })
    try {
      const uploadPatientId = projectId ? sourcePatientId : patientId
      if (!uploadPatientId) {
        message.error({ content: '缺少原始患者信息，无法上传', key: 'uploadExtract' })
        return
      }
      const uploadResult = await uploadAndArchiveAsync(file, uploadPatientId, {
        targetSection,
        projectId,
        autoMergeEhr: true,
        parserType: 'textin',
      })
      if (!uploadResult?.success) {
        message.error({ content: uploadResult?.message || '文件上传失败', key: 'uploadExtract' })
        return
      }
      const docId = uploadResult.data?.document_id || uploadResult.data?.id
      if (!docId) {
        message.error({ content: '上传响应中缺少文档 ID', key: 'uploadExtract' })
        return
      }
      message.loading({ content: '上传成功，正在提交抽取任务...', key: 'uploadExtract' })
      const extractResult = projectId
        ? await startCrfExtraction({
            projectId,
            projectPatientId: patientId,
            patientId: uploadPatientId,
            documentId: String(docId),
            targetFormKey,
            waitForDocumentReady: true,
          })
        : await extractEhrDataTargeted(
            String(docId),
            patientId,
            targetFormKey,
            { waitForDocumentReady: true }
          )
      if (extractResult.success) {
        message.success({ content: '文件上传成功，OCR 完成后将自动专项抽取', key: 'uploadExtract' })
        const taskId = extractResult.data?.task_id || extractResult.data?.id
        if (taskId) {
          upsertTask({
            task_id: taskId,
            patient_id: projectId ? (sourcePatientId || uploadPatientId) : patientId,
            project_id: projectId || undefined,
            project_patient_id: projectId ? patientId : undefined,
            type: projectId ? 'project_crf_targeted' : 'ehr_targeted_extract',
            status: 'pending',
            target_form_key: targetFormKey,
            message: '等待 OCR 与靶向抽取',
            created_at: new Date().toISOString(),
          })
        }
        setUploadExtractModalOpen(false)
        onDataChange && onDataChange(draftData)
      } else {
        message.error({ content: extractResult.message || '抽取任务提交失败', key: 'uploadExtract' })
      }
    } catch (err) {
      const detail = err?.data?.message || err?.data?.detail || err?.message || '上传或抽取过程中发生未知错误'
      message.error({ content: `操作失败：${detail}`, key: 'uploadExtract', duration: 6 })
      console.error('handleUploadExtractFile 失败:', err)
    }
  }, [draftData, onDataChange, patientId, projectId, sourcePatientId, targetFormKey, targetSection])

  return {
    extractCandidateDocuments,
    extractConfirming,
    handleCloseUploadExtractModal,
    handleOpenUploadExtractModal,
    handleSelectExistingDocumentForExtract,
    handleUploadDocumentClick,
    handleUploadExtractFile,
    selectedExtractDocId,
    targetFormKey,
    targetSection,
    uploadExtractModalOpen,
    uploadFileInputRef,
  }
}
