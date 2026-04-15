/**
 * 文档管理Tab组件 - 重构版
 * 使用卡片式布局显示和管理患者相关文档
 */
import React, { useState, useRef, useEffect } from 'react'
import { Row, Col, Button, Space, Empty, Spin, Typography, Modal, List, Avatar, Progress, Alert, Descriptions, Divider, Tag, Input, message, Card } from 'antd'
import { UploadOutlined, PlayCircleOutlined, FileTextOutlined, TeamOutlined, EyeOutlined, CheckOutlined, UserAddOutlined, LoadingOutlined } from '@ant-design/icons'
import { getDocumentAiMatchInfo, changeArchivePatient, archiveDocument } from '../../../../api/document'
import { getPatientList, updatePatientEhrFolder } from '../../../../api/patient'

// 导入新组件
import DocumentCard from './components/DocumentCard'
import SearchFilter from './components/SearchFilter'
import SortControl from './components/SortControl'
import TimelineGroup from './components/TimelineGroup'
import DocumentDetailModal from './components/DocumentDetailModal'
import useDocumentFilter from './hooks/useDocumentFilter'

const { Title, Text } = Typography

const DocumentsTab = ({ 
  patientId,
  patientInfo,  // 当前患者信息，用于显示"当前归档患者"
  documents = [], 
  loading = false,
  handleDocumentClick,
  handleReExtract,
  handleDeleteDocument,
  setUploadVisible,
  onRefresh
}) => {
  const [selectedDocuments, setSelectedDocuments] = useState([])
  const [detailModalVisible, setDetailModalVisible] = useState(false)
  const [selectedDocument, setSelectedDocument] = useState(null)
  const [detailRefreshTrigger, setDetailRefreshTrigger] = useState(0)
  
  // 患者匹配详情弹窗状态
  const [patientMatchVisible, setPatientMatchVisible] = useState(false)
  const [selectedMatchDocument, setSelectedMatchDocument] = useState(null)
  const [patientSearchValue, setPatientSearchValue] = useState('')
  const [patientSearchResults, setPatientSearchResults] = useState([])
  const [patientSearchLoading, setPatientSearchLoading] = useState(false)
  const [showSearchResults, setShowSearchResults] = useState(false)
  const [selectedMatchPatient, setSelectedMatchPatient] = useState(null)
  const [archivingLoading, setArchivingLoading] = useState(false)
  const [matchInfoLoading, setMatchInfoLoading] = useState(false)
  const [updatingEhrFolder, setUpdatingEhrFolder] = useState(false)
  /** 患者匹配弹窗模式：archive=未绑定文档选择患者归档，change=已归档文档更换患者 */
  const [matchModalMode, setMatchModalMode] = useState('change')
  
  // 患者搜索定时器和版本号
  const searchTimerRef = useRef(null)
  const searchVersionRef = useRef(0)
  const detailModalRef = useRef(null)
  const listScrollContainerRef = useRef(null) // 列表独立滚动容器，刷新时保留其 scrollTop
  
  // 使用文档筛选Hook
  const {
    filters,
    groupConfig,
    filteredDocuments,
    groupedDocuments,
    updateFilters,
    clearFilters,
    updateGroupConfig,
    getFilterStats
  } = useDocumentFilter(documents)

  const stats = getFilterStats()

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
  const handleClearFilter = (emptyFilters) => {
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

  // 处理更换患者 - 打开患者匹配详情弹窗（已归档文档）
  const handleChangePatient = async (documentId) => {
    setMatchModalMode('change')
    await openPatientMatchModal(documentId, { archivedPatientId: patientId, isFromAutoArchived: true })
  }

  // 处理未绑定文档选择患者归档 - 打开患者匹配详情弹窗（未归档，使用归档接口）
  const handleArchivePatient = async (documentId) => {
    setMatchModalMode('archive')
    // 未绑定文档可能不在当前患者文档列表中，优先用详情弹窗当前文档
    const doc = (selectedDocument && selectedDocument.id === documentId) ? selectedDocument : documents.find(d => d.id === documentId)
    await openPatientMatchModal(documentId, { archivedPatientId: null, isFromAutoArchived: false }, doc)
  }

  // 打开患者匹配弹窗并拉取匹配信息（供更换患者 / 选择归档共用）
  const openPatientMatchModal = async (documentId, options = {}, docOverride) => {
    const { archivedPatientId, isFromAutoArchived } = options
    const doc = docOverride || documents.find(d => d.id === documentId)
    if (!doc) {
      message.warning('文档不存在')
      return
    }
    const docStatus = doc.task_status || doc.status || doc.taskStatus || (archivedPatientId ? 'archived' : 'pending_confirm_review')
    setSelectedMatchDocument({
      id: documentId,
      name: doc.fileName || doc.file_name || doc.name || '未知文档',
      fileName: doc.fileName || doc.file_name || doc.name,
      taskStatus: docStatus,
      isFromAutoArchived: !!isFromAutoArchived,
      archivedPatientId: archivedPatientId ?? null,
      createdAt: doc.createdAt || doc.created_at,
      documentType: doc.documentType || doc.document_type,
      documentSubType: doc.documentSubType || doc.document_sub_type,
      candidates: [],
      extractedInfo: {}
    })
    setPatientMatchVisible(true)
    setMatchInfoLoading(true)
    setSelectedMatchPatient(null)
    setPatientSearchValue('')
    setPatientSearchResults([])
    setShowSearchResults(false)
    try {
      const matchResponse = await getDocumentAiMatchInfo(documentId)
      if (matchResponse.success && matchResponse.data) {
        const matchData = matchResponse.data
        const documentWithInfo = {
          id: documentId,
          name: doc.fileName || doc.file_name || doc.name || '未知文档',
          fileName: doc.fileName || doc.file_name || doc.name,
          taskStatus: docStatus,
          isFromAutoArchived: !!isFromAutoArchived,
          archivedPatientId: archivedPatientId ?? null,
          createdAt: doc.createdAt || doc.created_at,
          documentType: doc.documentType || doc.document_type,
          documentSubType: doc.documentSubType || doc.document_sub_type,
          extractedInfo: matchData.extracted_info || {},
          matchScore: matchData.match_score || 0,
          confidence: matchData.confidence || 0,
          candidates: (matchData.candidates || []).map(c => ({
            id: c.id,
            name: c.name,
            patientCode: c.patient_code,
            similarity: c.similarity || 0,
            matchReasoning: c.match_reasoning,
            keyEvidence: c.key_evidence || [],
            concerns: c.concerns || [],
            matchFeatures: (c.key_evidence && c.key_evidence.length > 0)
              ? c.key_evidence
              : (c.concerns && c.concerns.length > 0)
                ? c.concerns
                : ['待AI分析'],
            gender: c.gender || '',
            age: c.age || ''
          })),
          aiRecommendation: matchData.ai_recommendation,
          aiReason: matchData.ai_reason,
          matchResult: matchData.match_result || 'matched'
        }
        setSelectedMatchDocument(documentWithInfo)
      } else {
        message.error('获取文档匹配信息失败')
        setPatientMatchVisible(false)
        setSelectedMatchDocument(null)
      }
    } catch (error) {
      console.error('获取文档匹配信息失败:', error)
      message.error('获取文档匹配信息失败')
      setPatientMatchVisible(false)
      setSelectedMatchDocument(null)
    } finally {
      setMatchInfoLoading(false)
    }
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

  const handleUpdateEhrFolder = async () => {
    if (!patientId) {
      message.warning('缺少患者信息，无法更新病历夹')
      return
    }

    setUpdatingEhrFolder(true)
    try {
      const response = await updatePatientEhrFolder(patientId)
      if (response.success) {
        const count = response.data?.unextracted_document_count || 0
        const submittedCount = response.data?.submitted_document_count || 0
        message.success(`已提交抽取：未抽取文档 ${count} 份，本次下发 ${submittedCount} 份`)
      } else {
        message.error(response.message || '更新病历夹失败')
      }
    } catch (error) {
      console.error('更新病历夹失败:', error)
      message.error(error.response?.data?.message || error.message || '更新病历夹失败')
    } finally {
      setUpdatingEhrFolder(false)
    }
  }

  // 搜索患者（带防抖和版本控制）
  const handlePatientSearch = (value) => {
    setPatientSearchValue(value)
    
    if (searchTimerRef.current) {
      clearTimeout(searchTimerRef.current)
    }
    
    searchVersionRef.current += 1
    const currentVersion = searchVersionRef.current
    
    if (!value || value.trim().length < 1) {
      setShowSearchResults(false)
      setPatientSearchResults([])
      setPatientSearchLoading(false)
      return
    }
    
    setPatientSearchLoading(true)
    setShowSearchResults(true)
    setPatientSearchResults([])
    
    searchTimerRef.current = setTimeout(async () => {
      try {
        const response = await getPatientList({
          page: 1,
          page_size: 10,
          search: value.trim()
        })
        
        if (currentVersion === searchVersionRef.current) {
          if (response.success && response.data) {
            setPatientSearchResults(response.data)
          } else {
            setPatientSearchResults([])
          }
          setPatientSearchLoading(false)
        }
      } catch (error) {
        console.error('搜索患者失败:', error)
        if (currentVersion === searchVersionRef.current) {
          setPatientSearchResults([])
          setPatientSearchLoading(false)
        }
      }
    }, 500)
  }

  // 选择搜索结果中的患者
  const handleSelectSearchPatient = (patient) => {
    setSelectedMatchPatient(patient)
    setPatientSearchValue(patient.name)
    setShowSearchResults(false)
  }

  // 确认选择患者（归档模式：archiveDocument；更换模式：changeArchivePatient）- 从搜索选择
  const handleConfirmPatientMatch = async () => {
    if (!selectedMatchDocument) {
      message.warning('缺少文档信息')
      return
    }
    if (!selectedMatchPatient) {
      message.warning('请先选择一个患者')
      return
    }
    const isArchive = matchModalMode === 'archive'
    Modal.confirm({
      title: isArchive ? '确认选择该患者归档' : '确认更换归档患者',
      content: isArchive ? '确定选择该患者并归档文档吗？' : '确定要将文档更换归档到该患者吗？',
      okText: isArchive ? '确认选择' : '确认更换',
      cancelText: '取消',
      centered: true,
      wrapClassName: 'confirm-modal-up',
      onOk: async () => {
        setArchivingLoading(true)
        try {
          const response = isArchive
            ? await archiveDocument(selectedMatchDocument.id, selectedMatchPatient.id, true)
            : await changeArchivePatient(selectedMatchDocument.id, selectedMatchPatient.id, {
                revokeLastMerge: true,
                autoMergeEhr: true
              })
          if (response.success) {
            message.success(isArchive
              ? `文档已归档到患者: ${selectedMatchPatient.name}`
              : `文档已更换归档到患者: ${selectedMatchPatient.name}`)
            setPatientMatchVisible(false)
            setPatientSearchValue('')
            setPatientSearchResults([])
            setShowSearchResults(false)
            setSelectedMatchPatient(null)
            setSelectedMatchDocument(null)
            setMatchModalMode('change')
            onRefresh?.()
            setDetailRefreshTrigger(t => t + 1)
            detailModalRef.current?.refetch?.()
          } else {
            message.error(response.message || (isArchive ? '归档失败' : '更换归档失败'))
          }
        } catch (error) {
          console.error(isArchive ? '归档失败:' : '确认更换归档失败:', error)
          message.error(error.response?.data?.message || (isArchive ? '归档失败' : '更换归档失败'))
        } finally {
          setArchivingLoading(false)
        }
      }
    })
  }

  // 处理确认选择 - 从候选列表选择（归档模式用 archiveDocument，更换模式用 changeArchivePatient）
  const handleConfirmMatch = async (docId, targetPatientId) => {
    if (!docId || !targetPatientId) {
      message.warning('缺少文档或患者信息')
      return
    }
    const candidate = selectedMatchDocument?.candidates?.find(c => c.id === targetPatientId)
    const isArchive = matchModalMode === 'archive'
    Modal.confirm({
      title: isArchive ? '确认选择该患者归档' : '确认更换归档患者',
      content: isArchive ? '确定选择该患者并归档文档吗？' : '确定要将文档更换归档到该患者吗？',
      okText: isArchive ? '确认选择' : '确认更换',
      cancelText: '取消',
      centered: true,
      wrapClassName: 'confirm-modal-up',
      onOk: async () => {
        setArchivingLoading(true)
        try {
          const response = isArchive
            ? await archiveDocument(docId, targetPatientId, true)
            : await changeArchivePatient(docId, targetPatientId, {
                revokeLastMerge: true,
                autoMergeEhr: true
              })
          if (response.success) {
            message.success(isArchive
              ? `文档已归档到患者: ${candidate?.name || response.data?.patient_name || targetPatientId}`
              : `文档已更换归档到患者: ${candidate?.name || response.data?.patient_name || targetPatientId}`)
            setPatientMatchVisible(false)
            setPatientSearchValue('')
            setPatientSearchResults([])
            setShowSearchResults(false)
            setSelectedMatchPatient(null)
            setSelectedMatchDocument(null)
            setMatchModalMode('change')
            onRefresh?.()
            setDetailRefreshTrigger(t => t + 1)
            detailModalRef.current?.refetch?.()
          } else {
            message.error(response.message || (isArchive ? '归档失败' : '更换归档失败'))
          }
        } catch (error) {
          console.error(isArchive ? '归档失败:' : '更换归档文档失败:', error)
          message.error(error.response?.data?.message || (isArchive ? '归档失败' : '更换归档文档失败'))
        } finally {
          setArchivingLoading(false)
        }
      }
    })
  }

  // 获取置信度样式
  const getConfidenceStyle = (confidence) => {
    if (typeof confidence === 'number') {
      if (confidence >= 90) return { 
        color: 'green',
        label: '高置信度'
      }
      if (confidence >= 70) return { 
        color: 'orange',
        label: '中置信度'
      }
      return { 
        color: 'red',
        label: '低置信度'
      }
    }
    
    const configs = {
      high: { color: 'green', label: '高置信度' },
      medium: { color: 'orange', label: '中置信度' },
      low: { color: 'red', label: '低置信度' }
    }
    return configs[confidence] || { color: 'default', label: '未知' }
  }

  // 组件卸载时清理定时器
  useEffect(() => {
    return () => {
      if (searchTimerRef.current) {
        clearTimeout(searchTimerRef.current)
      }
    }
  }, [])

  return (
    <div className="documents-tab-container">
      <style>{`
        .confirm-modal-up .ant-modal {
          transform: translateY(-20%) !important;
        }
      `}</style>
      {/* 页面头部 - 暂时注释，避免与Tab标题重复 */}
      {/* <div className="documents-header" style={{ marginBottom: 24 }}>
        <Row justify="space-between" align="middle">
          <Col>
            <Title level={4} style={{ margin: 0 }}>
              文档管理
              <Text type="secondary" style={{ marginLeft: 8, fontSize: 14, fontWeight: 'normal' }}>
                共 {stats.total} 个文档
                {stats.hasActiveFilters && ` · 筛选后 ${stats.filtered} 个`}
              </Text>
            </Title>
          </Col>
          <Col>
            <Space>
              <Button 
                type="primary" 
                icon={<UploadOutlined />}
                onClick={() => setUploadVisible?.(true)}
              >
                上传文档
              </Button>
              <Button 
                icon={<PlayCircleOutlined />}
                onClick={handleUpdateEhrFolder}
                loading={updatingEhrFolder}
              >
                更新病历夹
              </Button>
            </Space>
          </Col>
        </Row>
      </div> */}

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
                type="primary" 
                icon={<UploadOutlined />}
                onClick={() => setUploadVisible?.(true)}
              >
                上传文档
              </Button>
              <Button 
                icon={<PlayCircleOutlined />}
                onClick={handleUpdateEhrFolder}
                loading={updatingEhrFolder}
              >
                更新病历夹
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

      {/* 分组文档展示：使用独立滚动容器，从详情返回后仅异步刷新数据，滚动位置由容器保留 */}
      <div
        ref={listScrollContainerRef}
        className="documents-timeline documents-timeline-scroll"
        style={{
          maxHeight: 'calc(100vh - 340px)',
          overflowY: 'auto',
          overflowX: 'hidden'
        }}
      >
        {loading && documents.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '60px 0' }}>
            <Spin size="large" />
            <div style={{ marginTop: 16 }}>
              <Text type="secondary">正在加载文档...</Text>
            </div>
          </div>
        ) : groupedDocuments.length === 0 ? (
          <Empty
            description={
              stats.hasActiveFilters 
                ? "没有找到符合条件的文档" 
                : "暂无文档"
            }
            style={{ padding: '60px 0' }}
          />
        ) : (
          <div className="timeline-groups">
            {groupedDocuments.map((group) => (
              <TimelineGroup
                key={group.key}
                groupTitle={group.title}
                groupSubtitle={group.subtitle}
                documents={group.documents}
                groupType={group.type}
                onDocumentClick={handleCardClick}
                defaultExpanded={true}
              />
            ))}
          </div>
        )}
      </div>

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

      {/* 患者匹配详情弹窗（更换患者 / 选择患者归档） */}
      <Modal
        title={
          <Space>
            <FileTextOutlined />
            <Text>{matchModalMode === 'archive' ? '选择患者归档' : '患者匹配详情'} - {selectedMatchDocument?.name}</Text>
          </Space>
        }
        open={patientMatchVisible}
        onCancel={() => {
          setPatientMatchVisible(false)
          setPatientSearchValue('')
          setPatientSearchResults([])
          setShowSearchResults(false)
          setSelectedMatchPatient(null)
          setSelectedMatchDocument(null)
          setMatchModalMode('change')
        }}
        footer={[
          <Button 
            key="cancel" 
            onClick={() => {
              setPatientMatchVisible(false)
              setPatientSearchValue('')
              setPatientSearchResults([])
              setShowSearchResults(false)
              setSelectedMatchPatient(null)
              setSelectedMatchDocument(null)
              setMatchModalMode('change')
            }}
            disabled={archivingLoading || matchInfoLoading}
          >
            取消
          </Button>,
          <Button 
            key="confirm" 
            type="primary" 
            icon={<CheckOutlined />}
            onClick={handleConfirmPatientMatch}
            disabled={!selectedMatchPatient || archivingLoading || matchInfoLoading}
            loading={archivingLoading}
          >
            {matchModalMode === 'archive' ? '确认选择' : '确认更换'}
          </Button>
        ]}
        width={900}
        zIndex={2000}
        maskClosable={!archivingLoading && !matchInfoLoading}
      >
        <Spin spinning={matchInfoLoading} tip="正在加载患者匹配信息..." size="large" style={{ minHeight: '400px' }}>
          {selectedMatchDocument ? (
            <Row gutter={24}>
              {/* 左侧：文档信息 */}
              <Col span={10}>
                <Card size="small" title="文档信息">
                  <Descriptions size="small" column={1}>
                    <Descriptions.Item label="文档名称">
                      {selectedMatchDocument.name}
                    </Descriptions.Item>
                    <Descriptions.Item label="上传时间">
                      {selectedMatchDocument.createdAt ? new Date(selectedMatchDocument.createdAt).toLocaleString('zh-CN') : '--'}
                    </Descriptions.Item>
                    <Descriptions.Item label="AI置信度">
                      <Space>
                        <Progress 
                          percent={typeof selectedMatchDocument.confidence === 'number' ? selectedMatchDocument.confidence : (selectedMatchDocument.matchScore || 0)} 
                          size="small" 
                          strokeColor={getConfidenceStyle(selectedMatchDocument.confidence).color}
                          format={percent => `${percent}%`}
                        />
                        <Tag color={getConfidenceStyle(selectedMatchDocument.confidence).color}>
                          {getConfidenceStyle(selectedMatchDocument.confidence).label}
                        </Tag>
                      </Space>
                    </Descriptions.Item>
                  </Descriptions>

                  <Divider style={{ margin: '12px 0' }} />
                  
                  {selectedMatchDocument.extractedInfo && Object.keys(selectedMatchDocument.extractedInfo).length > 0 && (
                    <div>
                      <Text strong style={{ fontSize: 13 }}>AI提取信息:</Text>
                      <div style={{ marginTop: 8, background: '#f5f5f5', padding: 12, borderRadius: 4 }}>
                        <Descriptions size="small" column={1}>
                          {selectedMatchDocument.extractedInfo.name && (
                            <Descriptions.Item label="患者姓名">
                              {selectedMatchDocument.extractedInfo.name}
                            </Descriptions.Item>
                          )}
                          {selectedMatchDocument.extractedInfo.gender && (
                            <Descriptions.Item label="性别">
                              {selectedMatchDocument.extractedInfo.gender}
                            </Descriptions.Item>
                          )}
                          {selectedMatchDocument.extractedInfo.age && (
                            <Descriptions.Item label="年龄">
                              {selectedMatchDocument.extractedInfo.age}岁
                            </Descriptions.Item>
                          )}
                          {selectedMatchDocument.extractedInfo.report_date && (
                            <Descriptions.Item label="报告日期">
                              {selectedMatchDocument.extractedInfo.report_date}
                            </Descriptions.Item>
                          )}
                          {(selectedMatchDocument.documentSubType || selectedMatchDocument.documentType) && (
                            <Descriptions.Item label="报告类型">
                              {selectedMatchDocument.documentSubType || selectedMatchDocument.documentType || '--'}
                            </Descriptions.Item>
                          )}
                        </Descriptions>
                      </div>
                    </div>
                  )}
                </Card>
              </Col>

              {/* 右侧：候选患者 */}
              <Col span={14}>
                <Card size="small" title="候选患者列表">
                  {/* 显示当前归档患者信息（由前端传入的patientId和patientInfo） */}
                  {selectedMatchDocument?.isFromAutoArchived && selectedMatchDocument?.archivedPatientId && (
                    <Alert
                      message={
                        <span>
                          ✅ 当前归档: <strong>
                            {selectedMatchDocument.candidates.find(c => c.id === selectedMatchDocument.archivedPatientId)?.name || 
                             patientInfo?.name || 
                             '当前患者'}
                          </strong>
                          {(() => {
                            const currentArchivedCandidate = selectedMatchDocument.candidates.find(c => c.id === selectedMatchDocument.archivedPatientId)
                            const patientCode = currentArchivedCandidate?.patientCode || patientInfo?.patientCode
                            return patientCode ? (
                              <Text type="secondary" style={{ marginLeft: 8 }}>
                                ({patientCode})
                              </Text>
                            ) : null
                          })()}
                        </span>
                      }
                      type="success"
                      showIcon
                      style={{ marginBottom: 12 }}
                    />
                  )}

                  <List
                    dataSource={selectedMatchDocument.candidates || []}
                    renderItem={candidate => {
                      // 判断是否是当前归档的患者（由前端传入的archivedPatientId）
                      const isCurrentArchived = candidate.id === selectedMatchDocument?.archivedPatientId
                      
                      return (
                        <List.Item
                          style={{
                            background: isCurrentArchived ? '#e6f7ff' : 'transparent',
                            border: isCurrentArchived ? '1px solid #91d5ff' : 'none',
                            borderRadius: 4,
                            margin: '4px 0',
                            padding: '8px 12px',
                            position: 'relative'
                          }}
                        >
                          <List.Item.Meta
                            avatar={
                              <div style={{ position: 'relative' }}>
                                <Avatar 
                                  icon={<TeamOutlined />} 
                                  style={{ 
                                    backgroundColor: isCurrentArchived ? '#1677ff' : '#1677ff' 
                                  }}
                                />
                                {isCurrentArchived && (
                                  <div
                                    style={{
                                      position: 'absolute',
                                      top: '100%',
                                      left: '50%',
                                      transform: 'translateX(-50%)',
                                      marginTop: 4,
                                      whiteSpace: 'nowrap',
                                      zIndex: 1,
                                      backgroundColor: 'transparent',
                                      color: '#1677ff',
                                      fontSize: '10px',
                                      padding: '1px 4px',
                                      borderRadius: '3px',
                                      fontWeight: 500,
                                      border: '1px solid #1677ff'
                                    }}
                                  >
                                    当前归档
                                  </div>
                                )}
                              </div>
                            }
                            title={
                              <Space wrap>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: '200px', flexShrink: 0 }}>
                                  <Text strong style={{ whiteSpace: 'nowrap' }}>{candidate.name || '未知患者'}</Text>
                                  {candidate.patientCode && (
                                    <Text type="secondary" style={{ fontSize: 12, whiteSpace: 'nowrap' }}>({candidate.patientCode})</Text>
                                  )}
                                </div>
                                {candidate.gender && (
                                  <Text type="secondary">{candidate.gender}</Text>
                                )}
                                <Tag 
                                  color={candidate.similarity > 90 ? 'green' : candidate.similarity > 70 ? 'orange' : 'default'}
                                  size="small"
                                >
                                  相似度 {candidate.similarity}%
                                </Tag>
                              </Space>
                            }
                            description={
                              <div>
                                {candidate.matchReasoning && (
                                  <div style={{ marginBottom: 4 }}>
                                    <Text style={{ fontSize: 12, color: '#666' }}>
                                      {candidate.matchReasoning}
                                    </Text>
                                  </div>
                                )}
                                {candidate.matchFeatures && candidate.matchFeatures.length > 0 && (
                                  <div>
                                    <Space wrap size={[4, 4]}>
                                      {candidate.matchFeatures.slice(0, 5).map((feature, idx) => (
                                        <Tag key={idx} size="small" color="geekblue">
                                          {feature}
                                        </Tag>
                                      ))}
                                      {candidate.matchFeatures.length > 5 && (
                                        <Tag size="small">+{candidate.matchFeatures.length - 5}</Tag>
                                      )}
                                    </Space>
                                  </div>
                                )}
                              </div>
                            }
                          />
                          <Button 
                            type={isCurrentArchived ? 'primary' : 'default'}
                            size="small"
                            onClick={() => handleConfirmMatch(selectedMatchDocument.id, candidate.id)}
                            disabled={isCurrentArchived || archivingLoading || matchInfoLoading}
                            loading={archivingLoading}
                          >
                            {matchModalMode === 'archive' ? '选择' : '更换'}
                          </Button>
                        </List.Item>
                      )
                    }}
                  />
                  
                  <Divider />
                  <div style={{ position: 'relative' }}>
                    <Input.Search
                      placeholder="搜索患者姓名或编号"
                      value={patientSearchValue}
                      onChange={(e) => handlePatientSearch(e.target.value)}
                      onSearch={handlePatientSearch}
                      loading={patientSearchLoading}
                      allowClear
                    />
                    
                    {/* 搜索结果下拉列表 */}
                    {showSearchResults && (
                      <div style={{
                        position: 'absolute',
                        top: '100%',
                        left: 0,
                        right: 0,
                        zIndex: 1000,
                        background: '#fff',
                        border: '1px solid #d9d9d9',
                        borderRadius: '4px',
                        marginTop: 4,
                        maxHeight: '300px',
                        overflowY: 'auto',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.15)'
                      }}>
                        {patientSearchLoading ? (
                          <div style={{ padding: '16px', textAlign: 'center' }}>
                            <LoadingOutlined /> 搜索中...
                          </div>
                        ) : patientSearchResults.length > 0 ? (
                          <List
                            size="small"
                            dataSource={patientSearchResults}
                            renderItem={patient => (
                              <List.Item
                                style={{
                                  cursor: 'pointer',
                                  padding: '8px 12px'
                                }}
                                onClick={() => handleSelectSearchPatient(patient)}
                                onMouseEnter={(e) => {
                                  e.currentTarget.style.background = '#f5f5f5'
                                }}
                                onMouseLeave={(e) => {
                                  e.currentTarget.style.background = '#fff'
                                }}
                              >
                                <List.Item.Meta
                                  avatar={<Avatar icon={<TeamOutlined />} />}
                                  title={
                                    <Space>
                                      <Text strong>{patient.name}</Text>
                                      {patient.patient_code && (
                                        <Text type="secondary" style={{ fontSize: 12 }}>({patient.patient_code})</Text>
                                      )}
                                    </Space>
                                  }
                                  description={
                                    <Text type="secondary" style={{ fontSize: 12 }}>
                                      {patient.gender && `${patient.gender} `}
                                      {patient.age && `${patient.age}岁`}
                                    </Text>
                                  }
                                />
                              </List.Item>
                            )}
                          />
                        ) : patientSearchValue.trim() ? (
                          <div style={{ padding: '16px', textAlign: 'center', color: '#999' }}>
                            未找到匹配的患者
                          </div>
                        ) : null}
                      </div>
                    )}
                  </div>
                </Card>
              </Col>
            </Row>
          ) : null}
        </Spin>
      </Modal>
    </div>
  )
}

export default DocumentsTab