/**
 * 文档管理Tab组件 - 重构版
 * 使用卡片式布局显示和管理患者相关文档
 */
import React, { useState, useRef, useEffect } from 'react'
import { Row, Col, Button, Space } from 'antd'
import { UploadOutlined, ReloadOutlined, AimOutlined } from '@ant-design/icons'

// 导入新组件
import SearchFilter from './components/SearchFilter'
import SortControl from './components/SortControl'
import DocumentTimelineList from './components/DocumentTimelineList'
import EhrFolderBatchProgress from './components/EhrFolderBatchProgress'
import TargetedEhrFolderModal from './components/TargetedEhrFolderModal'
import PatientMatchModal from './components/PatientMatchModal'
import DocumentDetailModal from './components/DocumentDetailModal'
import useDocumentFilter from './hooks/useDocumentFilter'
import { useEhrFolderUpdate } from './hooks/useEhrFolderUpdate'
import { usePatientMatchModal } from './hooks/usePatientMatchModal'

const DocumentsTab = ({
  patientId,
  patientInfo,  // 当前患者信息，用于显示"当前归档患者"
  documents = [],
  loading = false,
  handleDocumentClick,
  handleReExtract,
  setUploadVisible,
  onRefresh
}) => {
  const [detailModalVisible, setDetailModalVisible] = useState(false)
  const [selectedDocument, setSelectedDocument] = useState(null)
  const [detailRefreshTrigger, setDetailRefreshTrigger] = useState(0)
  const detailModalRef = useRef(null)
  const listScrollContainerRef = useRef(null) // 列表独立滚动容器，刷新时保留其 scrollTop

  // 使用文档筛选Hook
  const {
    groupConfig,
    groupedDocuments,
    updateFilters,
    clearFilters,
    updateGroupConfig,
    getFilterStats
  } = useDocumentFilter(documents)

  const stats = getFilterStats()
  const {
    activeEhrFolderBatch,
    handleOpenTargetedEhrFolderModal,
    handleSubmitTargetedEhrFolder,
    handleUpdateEhrFolder,
    isTerminalBatchStatus,
    schemaLoading,
    setTargetedModalGroups,
    setTargetedModalMode,
    setTargetedModalVisible,
    targetedModalGroups,
    targetedModalMode,
    targetedModalVisible,
    targetFormGroups,
    updatingEhrFolder,
  } = useEhrFolderUpdate({ onRefresh, patientId })
  const {
    archivingLoading,
    closePatientMatchModal,
    getConfidenceStyle,
    handleArchivePatient,
    handleChangePatient,
    handleConfirmMatch,
    handleConfirmPatientMatch,
    handlePatientSearch,
    handleSelectSearchPatient,
    matchInfoLoading,
    matchModalMode,
    patientMatchVisible,
    patientSearchLoading,
    patientSearchResults,
    patientSearchValue,
    selectedMatchDocument,
    selectedMatchPatient,
    showSearchResults,
  } = usePatientMatchModal({
    currentDocument: selectedDocument,
    detailModalRef,
    documents,
    onRefresh,
    patientId,
    setDetailRefreshTrigger,
  })

  useEffect(() => {
    setDetailModalVisible(false)
    setSelectedDocument(null)
    setTargetedModalVisible(false)
    setTargetedModalGroups([])
  }, [patientId])

  const handleCardClick = (document) => {
    setSelectedDocument(document)
    setDetailModalVisible(true)
    handleDocumentClick?.(document)
  }

  // 处理搜索
  const handleSearch = (searchFilters) => {
    updateFilters(searchFilters)
  }

  // 处理筛选
  const handleFilter = (filterData) => {
    updateFilters(filterData)
  }

  // 处理清空筛选
  const handleClearFilter = () => {
    clearFilters()
  }

  // 处理分组方式变化
  const handleGroupByChange = (groupBy) => {
    updateGroupConfig({ groupBy })
  }

  // 处理排序方式变化
  const handleSortOrderChange = (sortOrder) => {
    updateGroupConfig({ sortOrder })
  }

  // 关闭详情弹窗：仅关闭弹窗并触发异步刷新，列表在独立滚动容器内滚动，状态自然保留
  const handleDetailModalClose = () => {
    setDetailModalVisible(false)
    setSelectedDocument(null)
    onRefresh?.()
  }

  // 处理字段保存
  const handleFieldSave = (documentId, editedFields) => {
    console.log('保存字段修改:', documentId, editedFields)
    // 这里可以调用API保存字段修改
  }

  // 处理重新抽取
  const handleDetailReExtract = (documentId) => {
    console.log('重新抽取文档:', documentId)
    handleReExtract?.(documentId)
  }

  // 处理下载文档
  const handleDownloadDocument = (documentId) => {
    console.log('下载文档:', documentId)
    // 这里可以调用下载API
  }

  // 处理 OCR 查看
  const handleViewOcr = (documentId) => {
    console.log('查看 OCR:', documentId)
    // 跳转到 OCR Viewer 页面
    window.open(`/document/ocr-viewer/${documentId}`, '_blank')
  }

  return (
    <div className="documents-tab-container">
      <style>{`
        .confirm-modal-up .ant-modal {
          transform: translateY(-20%) !important;
        }
      `}</style>
      <EhrFolderBatchProgress
        batch={activeEhrFolderBatch}
        isTerminalBatchStatus={isTerminalBatchStatus}
      />

      {/* 搜索筛选和操作按钮区域 */}
      <div className="documents-header" style={{ marginBottom: 24 }}>
        <Row gutter={16} align="top">
          <Col flex={1}>
            <SearchFilter
              onSearch={handleSearch}
              onFilter={handleFilter}
              onClear={handleClearFilter}
              loading={loading}
            />
          </Col>
          <Col>
            <Space>
              <Button
                icon={<ReloadOutlined />}
                loading={updatingEhrFolder}
                onClick={handleUpdateEhrFolder}
              >
                更新电子病历夹
              </Button>
              <Button
                icon={<AimOutlined />}
                loading={updatingEhrFolder || schemaLoading}
                onClick={handleOpenTargetedEhrFolderModal}
              >
                专项抽取
              </Button>
              <Button
                type="primary"
                icon={<UploadOutlined />}
                onClick={() => setUploadVisible?.(true)}
              >
                上传文档
              </Button>
            </Space>
          </Col>
        </Row>
      </div>

      {/* 排序控制器 */}
      <div className="documents-sort-control" style={{ marginBottom: 16 }}>
        <SortControl
          groupBy={groupConfig.groupBy}
          sortOrder={groupConfig.sortOrder}
          onGroupByChange={handleGroupByChange}
          onSortOrderChange={handleSortOrderChange}
        />
      </div>

      <DocumentTimelineList
        ref={listScrollContainerRef}
        documents={documents}
        groupedDocuments={groupedDocuments}
        loading={loading}
        onDocumentClick={handleCardClick}
        stats={stats}
      />

      {/* 文档详情弹窗 */}
      <DocumentDetailModal
        ref={detailModalRef}
        visible={detailModalVisible}
        document={selectedDocument}
        patientId={patientId}
        onClose={handleDetailModalClose}
        onSave={handleFieldSave}
        onReExtract={handleDetailReExtract}
        onChangePatient={handleChangePatient}
        onArchivePatient={handleArchivePatient}
        onDownload={handleDownloadDocument}
        onViewOcr={handleViewOcr}
        onRefresh={onRefresh}
        onDeleteSuccess={() => {
          setDetailModalVisible(false)
          setSelectedDocument(null)
          onRefresh?.()
        }}
        refreshTrigger={detailRefreshTrigger}
        onExtractSuccess={() => {
          onRefresh?.()
        }}
      />

      <PatientMatchModal
        archivingLoading={archivingLoading}
        document={patientMatchVisible ? selectedMatchDocument : null}
        getConfidenceStyle={getConfidenceStyle}
        matchInfoLoading={matchInfoLoading}
        mode={matchModalMode}
        onCancel={closePatientMatchModal}
        onConfirmCandidate={handleConfirmMatch}
        onConfirmSelectedPatient={handleConfirmPatientMatch}
        onSearchPatient={handlePatientSearch}
        onSelectSearchPatient={handleSelectSearchPatient}
        patientInfo={patientInfo}
        searchLoading={patientSearchLoading}
        searchResults={patientSearchResults}
        searchValue={patientSearchValue}
        selectedPatient={selectedMatchPatient}
        showSearchResults={showSearchResults}
      />

      <TargetedEhrFolderModal
        groups={targetedModalGroups}
        mode={targetedModalMode}
        onCancel={() => setTargetedModalVisible(false)}
        onGroupsChange={setTargetedModalGroups}
        onModeChange={setTargetedModalMode}
        onSubmit={handleSubmitTargetedEhrFolder}
        open={targetedModalVisible}
        patientLabel={patientInfo?.name || patientId}
        targetFormGroups={targetFormGroups}
        updating={updatingEhrFolder}
      />
    </div>
  )
}

export default DocumentsTab
