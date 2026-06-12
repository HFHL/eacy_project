import { useState } from 'react'
import { message } from 'antd'

export const useCreatePatientArchiveFlow = ({
  fetchAutoArchivedDocs,
  fetchNeedsReviewDocs,
  fetchNewPatientDocs,
  promptBatchMatchForSamePerson,
  selectedDocument,
  setProcessedDocs,
  setSelectedNewPatientDocs,
}) => {
  const [editPatientVisible, setEditPatientVisible] = useState(false)
  const [editingPatientItem, setEditingPatientItem] = useState(null)

  const handleCloseEditPatient = () => {
    setEditPatientVisible(false)
    setEditingPatientItem(null)
  }

  const handleCreatePatientAndArchiveFromModal = () => {
    if (!selectedDocument?.id) {
      message.warning('缺少文档信息')
      return
    }

    setEditingPatientItem({
      id: selectedDocument.id,
      isFromAutoArchived: selectedDocument.isFromAutoArchived || false,
    })
    setEditPatientVisible(true)
  }

  const handleOpenEditPatient = (item) => {
    setEditingPatientItem(item)
    setEditPatientVisible(true)
  }

  const handleOpenBatchEditPatient = (docIds = []) => {
    if (!docIds.length) {
      message.warning('请先选择要批量创建的文档')
      return
    }

    setEditingPatientItem({
      isBatch: true,
      documentIds: docIds,
      documentCount: docIds.length,
    })
    setEditPatientVisible(true)
  }

  const handleCreatePatientDrawerSuccess = ({ documentIds, patientData }) => {
    if (documentIds?.length) {
      setProcessedDocs(prev => [...prev, ...documentIds])
      promptBatchMatchForSamePerson(patientData, documentIds)
    }
    setSelectedNewPatientDocs([])
    setTimeout(() => {
      fetchNeedsReviewDocs()
      fetchNewPatientDocs()
      fetchAutoArchivedDocs()
    }, 300)
  }

  return {
    editPatientVisible,
    editingPatientItem,
    handleCloseEditPatient,
    handleCreatePatientAndArchiveFromModal,
    handleCreatePatientDrawerSuccess,
    handleOpenBatchEditPatient,
    handleOpenEditPatient,
  }
}
