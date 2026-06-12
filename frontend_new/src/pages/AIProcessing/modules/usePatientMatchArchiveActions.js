import { Modal, message } from 'antd'
import { archiveDocument, changeArchivePatient } from '../../../api/document'

export const usePatientMatchArchiveActions = ({
  autoArchivedDocs,
  fetchAutoArchivedDocs,
  fetchNeedsReviewDocs,
  fetchNewPatientDocs,
  handlePatientSearch,
  patientMatchVisible,
  selectedDocument,
  selectedMatchPatient,
  setArchivingLoading,
  setPatientMatchVisible,
  setPatientSearchResults,
  setPatientSearchValue,
  setProcessedDocs,
  setSelectedDocument,
  setSelectedMatchPatient,
  setShowSearchResults,
}) => {
  const closePatientMatchModal = () => {
    setPatientMatchVisible(false)
    setPatientSearchValue('')
    setPatientSearchResults([])
    setShowSearchResults(false)
    setSelectedMatchPatient(null)
  }

  const refreshQueues = () => {
    fetchNeedsReviewDocs()
    fetchAutoArchivedDocs()
    fetchNewPatientDocs()
  }

  const archiveToPatient = async ({ docId, patientId, patientName, isFromAutoArchived }) => {
    const response = isFromAutoArchived
      ? await changeArchivePatient(docId, patientId, {
          revokeLastMerge: true,
          autoMergeEhr: true,
        })
      : await archiveDocument(docId, patientId)

    if (!response.success) {
      throw new Error(response.message || (isFromAutoArchived ? '更换归档失败' : '归档失败'))
    }

    setProcessedDocs(prev => [...prev, docId])
    message.success(
      isFromAutoArchived
        ? `文档已更换归档到患者: ${patientName || response.data?.patient_name || patientId}`
        : `文档已归档到患者: ${patientName || response.data?.patient_name || patientId}`
    )
    if (patientMatchVisible) closePatientMatchModal()
    refreshQueues()
  }

  const handleConfirmPatientMatch = async () => {
    if (!selectedDocument) {
      message.warning('缺少文档信息')
      return
    }
    if (!selectedMatchPatient) {
      message.warning('请先选择一个患者')
      return
    }

    const isFromAutoArchived = selectedDocument?.isFromAutoArchived || false
    Modal.confirm({
      title: isFromAutoArchived ? '确认更换归档患者' : '确认归档文档',
      content: isFromAutoArchived ? '确定要将文档更换归档到该患者吗？' : '确定要将文档归档到该患者吗？',
      okText: isFromAutoArchived ? '确认更换' : '确认归档',
      cancelText: '取消',
      centered: true,
      wrapClassName: 'confirm-modal-up',
      onOk: async () => {
        setArchivingLoading(true)
        try {
          await archiveToPatient({
            docId: selectedDocument.id,
            patientId: selectedMatchPatient.id,
            patientName: selectedMatchPatient.name,
            isFromAutoArchived,
          })
        } catch (error) {
          console.error(isFromAutoArchived ? '确认更换归档失败:' : '确认匹配归档失败:', error)
          message.error(error.response?.data?.message || error.message || (isFromAutoArchived ? '更换归档失败' : '归档失败'))
        } finally {
          setArchivingLoading(false)
        }
      },
    })
  }

  const handleConfirmMatch = async (docId, patientId) => {
    if (!docId || !patientId) {
      message.warning('缺少文档或患者信息')
      return
    }

    const candidate = selectedDocument?.candidates?.find(item => item.id === patientId)
    const isFromAutoArchived = selectedDocument?.isFromAutoArchived || autoArchivedDocs.some(doc => doc.id === docId)

    Modal.confirm({
      title: isFromAutoArchived ? '确认更换归档患者' : '确认归档文档',
      content: isFromAutoArchived ? '确定要将文档更换归档到该患者吗？' : '确定要将文档归档到该患者吗？',
      okText: isFromAutoArchived ? '确认更换' : '确认归档',
      cancelText: '取消',
      centered: true,
      wrapClassName: 'confirm-modal-up',
      onOk: async () => {
        try {
          await archiveToPatient({
            docId,
            patientId,
            patientName: candidate?.name,
            isFromAutoArchived,
          })
        } catch (error) {
          console.error(isFromAutoArchived ? '更换归档失败:' : '归档文档失败:', error)
          message.error(error.response?.data?.message || error.message || (isFromAutoArchived ? '更换归档失败' : '归档文档失败'))
        }
      },
    })
  }

  const showPatientMatch = (doc) => {
    const isFromAutoArchived = autoArchivedDocs.some(item => item.id === doc.id)
    setSelectedDocument({
      ...doc,
      name: doc.fileName || doc.file_name || doc.name || '未知文档',
      isFromAutoArchived,
      archivedPatientId: isFromAutoArchived ? doc.patientId : null,
    })
    setPatientMatchVisible(true)
    setSelectedMatchPatient(null)
    setPatientSearchValue('')
    setPatientSearchResults([])
    setShowSearchResults(false)
  }

  const handleSmartRecommend = (doc) => {
    if (doc.isFromAutoArchived) return
    const recommended = doc.candidates.find(candidate => candidate.id === doc.aiRecommendation)
    if (recommended) handleConfirmMatch(doc.id, recommended.id)
  }

  const handlePatientSearchChangeInModal = (value) => {
    handlePatientSearch(value)
    if (value !== selectedMatchPatient?.name) {
      setSelectedMatchPatient(null)
    }
  }

  return {
    closePatientMatchModal,
    handleConfirmMatch,
    handleConfirmPatientMatch,
    handlePatientSearchChangeInModal,
    handleSmartRecommend,
    showPatientMatch,
  }
}
