/**
 * 弹窗状态管理Hook
 * 封装所有Modal和Drawer的显示状态管理
 */
import { useState } from 'react'

export const useModals = () => {
  // 所有弹窗状态
  const [uploadVisible, setUploadVisible] = useState(false)
  const [extractionVisible, setExtractionVisible] = useState(false)
  const [editModalVisible, setEditModalVisible] = useState(false)
  const [exportModalVisible, setExportModalVisible] = useState(false)
  const [dataExtractionVisible, setDataExtractionVisible] = useState(false)
  const [qualityCheckVisible, setQualityCheckVisible] = useState(false)
  const [aiAssistantVisible, setAiAssistantVisible] = useState(false)
  const [conflictResolveVisible, setConflictResolveVisible] = useState(false)
  const [changeLogVisible, setChangeLogVisible] = useState(false)

  // 弹窗操作函数
  const openUploadModal = () => setUploadVisible(true)
  const closeUploadModal = () => setUploadVisible(false)
  
  const openExtractionModal = () => setExtractionVisible(true)
  const closeExtractionModal = () => setExtractionVisible(false)
  
  const openEditModal = () => setEditModalVisible(true)
  const closeEditModal = () => setEditModalVisible(false)
  
  const openExportModal = () => setExportModalVisible(true)
  const closeExportModal = () => setExportModalVisible(false)
  
  const openDataExtractionModal = () => setDataExtractionVisible(true)
  const closeDataExtractionModal = () => setDataExtractionVisible(false)
  
  const openQualityCheckModal = () => setQualityCheckVisible(true)
  const closeQualityCheckModal = () => setQualityCheckVisible(false)
  
  const openAiAssistant = () => setAiAssistantVisible(true)
  const closeAiAssistant = () => setAiAssistantVisible(false)
  
  const openConflictResolve = () => setConflictResolveVisible(true)
  const closeConflictResolve = () => setConflictResolveVisible(false)
  
  const openChangeLog = () => setChangeLogVisible(true)
  const closeChangeLog = () => setChangeLogVisible(false)

  // 关闭所有弹窗
  const closeAllModals = () => {
    setUploadVisible(false)
    setExtractionVisible(false)
    setEditModalVisible(false)
    setExportModalVisible(false)
    setDataExtractionVisible(false)
    setQualityCheckVisible(false)
    setAiAssistantVisible(false)
    setConflictResolveVisible(false)
    setChangeLogVisible(false)
  }

  return {
    // 状态
    uploadVisible,
    extractionVisible,
    editModalVisible,
    exportModalVisible,
    dataExtractionVisible,
    qualityCheckVisible,
    aiAssistantVisible,
    conflictResolveVisible,
    changeLogVisible,
    
    // 操作函数
    openUploadModal,
    closeUploadModal,
    openExtractionModal,
    closeExtractionModal,
    openEditModal,
    closeEditModal,
    openExportModal,
    closeExportModal,
    openDataExtractionModal,
    closeDataExtractionModal,
    openQualityCheckModal,
    closeQualityCheckModal,
    openAiAssistant,
    closeAiAssistant,
    openConflictResolve,
    closeConflictResolve,
    openChangeLog,
    closeChangeLog,
    closeAllModals,
    
    // 便捷的setter函数（保持向后兼容）
    setUploadVisible,
    setExtractionVisible,
    setEditModalVisible,
    setExportModalVisible,
    setDataExtractionVisible,
    setQualityCheckVisible,
    setAiAssistantVisible,
    setConflictResolveVisible,
    setChangeLogVisible
  }
}

export default useModals