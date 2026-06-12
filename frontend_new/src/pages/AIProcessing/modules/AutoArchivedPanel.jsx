import React from 'react'
import { Badge, Button, Card, Checkbox, Col, Collapse, Empty, List, Space, Tag, Tooltip, Typography } from 'antd'
import { CheckCircleOutlined, ReloadOutlined, SortAscendingOutlined } from '@ant-design/icons'
import AutoArchivedDocumentItem from './AutoArchivedDocumentItem'
import { formatIdentifierTag, mergeIdentifiersForDisplay } from './documentGrouping'

const { Text } = Typography
const { Panel } = Collapse

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

const CONFIRM_BUTTON_STYLE = {
  backgroundColor: '#10b981',
  borderColor: '#10b981',
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

const AutoArchivedGroupHeader = ({ group }) => {
  const identifiers = mergeIdentifiersForDisplay(group.identifiers)

  return (
    <Space size="small" wrap>
      <Text strong style={{ fontSize: 12 }}>同一患者</Text>
      {identifiers.length ? identifiers.map(identifier => {
        const tag = formatIdentifierTag(identifier)
        return (
          <Tag key={identifier} color={tag.color}>
            {tag.label}:{tag.value}
          </Tag>
        )
      }) : (
        <Tag>无唯一标识</Tag>
      )}
      <Tag color="default">{group.items.length} 份</Tag>
    </Space>
  )
}

const AutoArchivedPanel = ({
  autoArchivedDocs,
  autoArchivedLoading,
  autoArchivedSort,
  batchConfirming,
  confirmingDocId,
  groupedAutoArchivedDocs,
  onBatchConfirmAutoArchive,
  onConfirmAutoArchive,
  onDocumentClick,
  onRefresh,
  onSetAutoArchivedSort,
  onSetSelectedAutoDocs,
  onShowPatientMatch,
  onViewExtractionResult,
  selectedAutoDocs,
  sortedAutoArchivedDocs,
}) => {
  const selectDocument = (documentId, checked) => {
    onSetSelectedAutoDocs(prev => {
      if (checked) return Array.from(new Set([...prev, documentId]))
      return prev.filter(id => id !== documentId)
    })
  }

  return (
    <Col xs={24} lg={8}>
      <Card
        title={(
          <Space>
            <Tooltip title="高置信度匹配 - AI自动处理成功，已归档到对应患者">
              <CheckCircleOutlined style={{ color: '#10b981' }} />
            </Tooltip>
            <Text strong>自动归档</Text>
            <Badge count={autoArchivedDocs.length} style={{ backgroundColor: '#10b981' }} />
          </Space>
        )}
        size="small"
        extra={(
          <Space>
            <Tooltip title="刷新列表">
              <Button size="small" icon={<ReloadOutlined spin={autoArchivedLoading} />} onClick={onRefresh} loading={autoArchivedLoading} />
            </Tooltip>
            <Tooltip title={getSortTooltip(autoArchivedSort)}>
              <Button
                size="small"
                icon={<SortAscendingOutlined />}
                type={autoArchivedSort ? 'primary' : 'default'}
                onClick={() => onSetAutoArchivedSort(getNextSort(autoArchivedSort))}
              />
            </Tooltip>
          </Space>
        )}
        style={CARD_STYLE}
        styles={CARD_BODY_STYLES}
        loading={autoArchivedLoading}
        actions={[
          <div key="actions" style={ACTIONS_STYLE}>
            <Checkbox
              checked={sortedAutoArchivedDocs.length > 0 && selectedAutoDocs.length === sortedAutoArchivedDocs.length}
              indeterminate={selectedAutoDocs.length > 0 && selectedAutoDocs.length < sortedAutoArchivedDocs.length}
              onChange={(event) => {
                onSetSelectedAutoDocs(event.target.checked ? sortedAutoArchivedDocs.map(doc => doc.id) : [])
              }}
            >
              全选
            </Checkbox>
            <Button
              type="primary"
              size="small"
              icon={<CheckCircleOutlined />}
              loading={batchConfirming}
              disabled={selectedAutoDocs.length === 0}
              onClick={() => onBatchConfirmAutoArchive(selectedAutoDocs)}
              style={CONFIRM_BUTTON_STYLE}
            >
              批量自动确认 ({selectedAutoDocs.length})
            </Button>
          </div>,
        ]}
      >
        {sortedAutoArchivedDocs.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无自动归档文档" />
        ) : (
          <Collapse bordered={false} expandIconPosition="end" style={{ background: 'transparent' }}>
            {groupedAutoArchivedDocs.map((group, groupIndex) => {
              const groupIds = group.items.map(item => item.id)
              const allSelected = groupIds.length > 0 && groupIds.every(id => selectedAutoDocs.includes(id))
              const isIndeterminate = groupIds.some(id => selectedAutoDocs.includes(id)) && !allSelected

              return (
                <Panel
                  key={`auto-${groupIndex}`}
                  header={<AutoArchivedGroupHeader group={group} />}
                  extra={(
                    <div onClick={(event) => event.stopPropagation()}>
                      <Space size="small">
                        <Checkbox
                          checked={allSelected}
                          indeterminate={isIndeterminate}
                          onChange={(event) => {
                            onSetSelectedAutoDocs(prev => {
                              if (event.target.checked) return Array.from(new Set([...prev, ...groupIds]))
                              return prev.filter(id => !groupIds.includes(id))
                            })
                          }}
                        >
                          本组
                        </Checkbox>
                        <Button
                          size="small"
                          type="primary"
                          loading={batchConfirming}
                          onClick={() => onBatchConfirmAutoArchive(groupIds)}
                          style={CONFIRM_BUTTON_STYLE}
                        >
                          本组确认
                        </Button>
                      </Space>
                    </div>
                  )}
                >
                  <List
                    dataSource={group.items}
                    renderItem={item => (
                      <AutoArchivedDocumentItem
                        confirming={confirmingDocId === item.id}
                        item={item}
                        onConfirmArchive={onConfirmAutoArchive}
                        onDocumentClick={onDocumentClick}
                        onPatientMatch={onShowPatientMatch}
                        onSelectChange={selectDocument}
                        onViewExtractionResult={onViewExtractionResult}
                        selected={selectedAutoDocs.includes(item.id)}
                      />
                    )}
                  />
                </Panel>
              )
            })}
          </Collapse>
        )}
      </Card>
    </Col>
  )
}

export default AutoArchivedPanel
