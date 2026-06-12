import React, { useRef, useState } from 'react'
import { theme } from 'antd'

import { DocumentUploadArea } from './modules/DocumentUploadArea'
import { FileInfoModal } from './modules/FileInfoModal'
import { ProcessingStepsCard } from './modules/ProcessingStepsCard'
import { UploadedFilesCard } from './modules/UploadedFilesCard'
import { UploadStatsRow } from './modules/UploadStatsRow'
import { FileStatusIcon, getFileStatusTooltip } from './modules/fileStatus'
import { UploadSettingsModal } from './modules/UploadSettingsModal'
import { useDocumentUploadActions } from './modules/useDocumentUploadActions'
import { useDocumentUploadData } from './modules/useDocumentUploadData'
import { useDocumentParsingActions } from './modules/useDocumentParsingActions'

const DocumentUpload = () => {
  const { token } = theme.useToken()
  const fileInputRef = useRef(null)
  const folderInputRef = useRef(null)

  const [uploadFiles, setUploadFiles] = useState([])
  const [currentStep, setCurrentStep] = useState(0)
  const [uploadSettings, setUploadSettings] = useState({
    csvMode: 'single',
    autoProcess: true,
    tags: [],
  })
  const [settingsModalVisible, setSettingsModalVisible] = useState(false)
  const [previewModalVisible, setPreviewModalVisible] = useState(false)
  const [selectedFile, setSelectedFile] = useState(null)
  const [showProcessSteps, setShowProcessSteps] = useState(false)

  const {
    allFiles,
    fetchParsingDocuments,
    fetchUnparsedDocuments,
    setUnparsedDocuments,
    unparsedLoading,
    unparsedPagination,
    uploadStats,
  } = useDocumentUploadData(uploadFiles)

  const actions = useDocumentUploadActions({
    fetchUnparsedDocuments,
    fileInputRef,
    folderInputRef,
    selectedFile,
    setCurrentStep,
    setPreviewModalVisible,
    setSelectedFile,
    setShowProcessSteps,
    setUnparsedDocuments,
    setUploadFiles,
    uploadFiles,
  })
  const parsingActions = useDocumentParsingActions({
    fetchParsingDocuments,
    setUnparsedDocuments,
    setUploadFiles,
  })

  return (
    <div className="page-container fade-in">
      {showProcessSteps && <ProcessingStepsCard currentStep={currentStep} />}
      <UploadStatsRow token={token} uploadStats={uploadStats} />

      <DocumentUploadArea
        fileInputRef={fileInputRef}
        folderInputRef={folderInputRef}
        handleDroppedFiles={actions.handleDroppedFiles}
        handleFileUpload={actions.handleFileUpload}
        markProcessedFile={actions.markProcessedFile}
        setShowProcessSteps={setShowProcessSteps}
        showProcessSteps={showProcessSteps}
        token={token}
        uploadStats={uploadStats}
      />

      <UploadedFilesCard
        allFiles={allFiles}
        deletingFileId={actions.deletingFileId}
        handleClearFiles={actions.handleClearFiles}
        handleEditFile={actions.handleEditFile}
        handleIgnoreAllFailed={actions.handleIgnoreAllFailed}
        handleIgnoreFile={actions.handleIgnoreFile}
        handleParseDocument={parsingActions.handleParseDocument}
        handleRemoveFile={actions.handleRemoveFile}
        handleRetryUpload={actions.handleRetryUpload}
        parsingFileId={parsingActions.parsingFileId}
        setSettingsModalVisible={setSettingsModalVisible}
        token={token}
        unparsedLoading={unparsedLoading}
        unparsedPagination={unparsedPagination}
        uploadStats={uploadStats}
        uploading={actions.uploading}
        onRefresh={fetchUnparsedDocuments}
      />

      <UploadSettingsModal
        setUploadSettings={setUploadSettings}
        setVisible={setSettingsModalVisible}
        uploadSettings={uploadSettings}
        visible={settingsModalVisible}
      />

      <FileInfoModal
        downloading={actions.downloading}
        getFileStatusIcon={(file) => <FileStatusIcon file={file} token={token} />}
        getFileStatusTooltip={getFileStatusTooltip}
        handleDownloadFile={actions.handleDownloadFile}
        handleSaveFileInfo={actions.handleSaveFileInfo}
        selectedFile={selectedFile}
        setVisible={setPreviewModalVisible}
        token={token}
        visible={previewModalVisible}
      />
    </div>
  )
}

export default DocumentUpload
