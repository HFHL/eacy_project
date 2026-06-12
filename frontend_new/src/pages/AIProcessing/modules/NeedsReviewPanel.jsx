import React from 'react'
import { Badge, Button, Card, Checkbox, Col, Empty, List, message, Modal, Space, Tooltip, Typography } from 'antd'
import { ExclamationCircleOutlined, ReloadOutlined, SortAscendingOutlined, ThunderboltOutlined } from '@ant-design/icons'
import { archiveDocument } from '../../../api/document'
import NeedsReviewDocumentItem from './NeedsReviewDocumentItem'

const { Text } = Typography

const CARD_STYLE = {
  height: '800px',
  display: 'flex',
  flexDirection: 'column',
}

const CARD_BODY_STYLES = {
  body: {
    flex: 1,
    overflowY: 'auto',
    padding: '12px',
    minHeight: 0,
  },
}

const ACTIONS_STYLE = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'center',
  width: '100%',
  padding: '0 16px',
  height: '15px',
}

const BATCH_BUTTON_STYLE = {
  backgroundColor: '#6366f1',
  borderColor: '#6366f1',
}

const getNextSort = (currentSort) => {
  if (!currentSort) return 'confidence_desc'
  if (currentSort === 'confidence_desc') return 'confidence_asc'
  return null
}

const getSortTooltip = (sort) => {
  if (!sort) return '按置信度降序排序'
  if (sort === 'confidence_desc') return '按置信度升序排序'
  return '取消排序'
}

const NeedsReviewPanel = ({
  needsReviewLoading,
  needsReviewSort,
  onConfirmMatch,
  onDocumentClick,
  onRefresh,
  onSetNeedsReviewSort,
  onSetProcessedDocs,
  onSetSelectedDocs,
  onShowPatientMatch,
  onViewExtractionResult,
  processedDocs,
  selectedDocs,
  sortedNeedsReviewDocs,
}) => {
  const visibleDocs = sortedNeedsReviewDocs.filter(doc => !processedDocs.includes(doc.id))
  const selectableDocs = visibleDocs.filter(doc => doc.aiRecommendation)
  const selectedRecommendationCount = selectedDocs.filter(id => {
    const doc = sortedNeedsReviewDocs.find(item => item.id === id)
    return doc && doc.aiRecommendation && !processedDocs.includes(doc.id)
  }).length

  const selectDocument = (documentId, checked) => {
    onSetSelectedDocs(prev => {
      if (checked) return Array.from(new Set([...prev, documentId]))
      return prev.filter(id => id !== documentId)
    })
  }

  const handleBatchApplyRecommendations = async () => {
    if (selectedDocs.length === 0) {
      message.warning('请先选择要批量处理的文档')
      return
    }

    const docsToProcess = sortedNeedsReviewDocs.filter(doc =>
      selectedDocs.includes(doc.id) &&
      doc.aiRecommendation &&
      !processedDocs.includes(doc.id)
    )

    if (docsToProcess.length === 0) {
      message.warning('所选文档中没有可批量采用推荐的文档（需要有AI推荐）')
      return
    }

    Modal.confirm({
      title: '确认归档文档',
      content: `确定要将 ${docsToProcess.length} 个文档归档到这些患者吗？`,
      okText: '确认',
      cancelText: '取消',
      centered: true,
      wrapClassName: 'confirm-modal-up',
      onOk: async () => {
        let successCount = 0
        let failedCount = 0

        for (const doc of docsToProcess) {
          try {
            const response = await archiveDocument(doc.id, doc.aiRecommendation)
            if (response.success) {
              successCount += 1
              onSetProcessedDocs(prev => [...prev, doc.id])
            } else {
              failedCount += 1
            }
          } catch (error) {
            console.error(`批量采用推荐失败: ${doc.name}`, error)
            failedCount += 1
          }
        }

        if (successCount > 0) {
          message.success(`批量归档完成：${successCount} 个成功${failedCount > 0 ? `，${failedCount} 个失败` : ''}`)
          onSetSelectedDocs([])
          setTimeout(onRefresh, 300)
        } else {
          message.error('批量归档失败')
        }
      },
    })
  }

  return (
    <Col xs={24} lg={8}>
      <Card
        title={(
          <Space>
            <Tooltip title="已上传未归档的文档 - 请确认匹配或创建新档案">
              <ExclamationCircleOutlined style={{ color: '#f59e0b' }} />
            </Tooltip>
            <Text strong>需要确认</Text>
            <Badge count={visibleDocs.length} style={{ backgroundColor: '#f59e0b' }} />
          </Space>
        )}
        size="small"
        extra={(
          <Space>
            <Tooltip title="刷新列表">
              <Button size="small" icon={<ReloadOutlined spin={needsReviewLoading} />} onClick={onRefresh} loading={needsReviewLoading} />
            </Tooltip>
            <Tooltip title={getSortTooltip(needsReviewSort)}>
              <Button
                size="small"
                icon={<SortAscendingOutlined />}
                type={needsReviewSort ? 'primary' : 'default'}
                onClick={() => onSetNeedsReviewSort(getNextSort(needsReviewSort))}
              />
            </Tooltip>
          </Space>
        )}
        style={CARD_STYLE}
        styles={CARD_BODY_STYLES}
        loading={needsReviewLoading}
        actions={[
          <div key="actions" style={ACTIONS_STYLE}>
            <Checkbox
              checked={selectableDocs.length > 0 && selectableDocs.every(doc => selectedDocs.includes(doc.id))}
              indeterminate={selectedDocs.length > 0 && selectedDocs.length < selectableDocs.length}
              onChange={(event) => {
                onSetSelectedDocs(event.target.checked ? selectableDocs.map(doc => doc.id) : [])
              }}
            >
              全选
            </Checkbox>

            <Button
              type="primary"
              size="small"
              icon={<ThunderboltOutlined />}
              onClick={handleBatchApplyRecommendations}
              disabled={selectedDocs.length === 0}
              style={BATCH_BUTTON_STYLE}
            >
              批量采用推荐 ({selectedRecommendationCount})
            </Button>
          </div>,
        ]}
      >
        {visibleDocs.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无待确认的文档" />
        ) : (
          <List
            dataSource={visibleDocs}
            renderItem={item => (
              <NeedsReviewDocumentItem
                item={item}
                onConfirmMatch={onConfirmMatch}
                onDocumentClick={onDocumentClick}
                onPatientMatch={onShowPatientMatch}
                onSelectChange={selectDocument}
                onViewExtractionResult={onViewExtractionResult}
                processed={processedDocs.includes(item.id)}
                selected={selectedDocs.includes(item.id)}
              />
            )}
          />
        )}
      </Card>
    </Col>
  )
}

export default NeedsReviewPanel
