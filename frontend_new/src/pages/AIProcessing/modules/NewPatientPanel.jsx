import React from 'react'
import { Badge, Button, Card, Checkbox, Col, Collapse, Empty, List, Space, Tag, Tooltip, Typography } from 'antd'
import { ReloadOutlined, SortAscendingOutlined, UserAddOutlined } from '@ant-design/icons'
import {
  formatIdentifierTag,
  getPatientNameForCreate,
  mergeIdentifiersForDisplay,
} from './documentGrouping'
import NewPatientDocumentItem from './NewPatientDocumentItem'

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

const CREATE_BUTTON_STYLE = {
  backgroundColor: '#8b5cf6',
  borderColor: '#8b5cf6',
}

const getNextSort = (currentSort) => {
  if (!currentSort) return 'name_desc'
  if (currentSort === 'name_desc') return 'name_asc'
  return null
}

const getSortTooltip = (sort) => {
  if (!sort) return '按姓名字典降序排序'
  if (sort === 'name_desc') return '按姓名字典升序排序'
  return '取消排序'
}

const NewPatientGroupHeader = ({ group }) => {
  const groupPatientName = (group.items[0] && getPatientNameForCreate(group.items[0])) || '未填写'
  const identifiers = mergeIdentifiersForDisplay(group.identifiers)
  const mergeReasonContent = identifiers.length ? (
    <Space size="small" wrap>
      {identifiers.map(identifier => {
        const tag = formatIdentifierTag(identifier)
        return (
          <Tag key={identifier} color={tag.color}>
            {tag.label}:{tag.value}
          </Tag>
        )
      })}
    </Space>
  ) : (
    <span style={{ fontSize: 11 }}>无唯一标识</span>
  )

  return (
    <Space size="small" wrap>
      <Tooltip title={mergeReasonContent} placement="top">
        <Text strong style={{ fontSize: 12, cursor: 'help', borderBottom: '1px dashed rgba(0,0,0,0.2)' }}>
          {groupPatientName}
        </Text>
      </Tooltip>
      <Tag color="default">{group.items.length} 份</Tag>
    </Space>
  )
}

const NewPatientPanel = ({
  groupedNewPatientDocs,
  newPatientDocs,
  newPatientLoading,
  newPatientSort,
  onCreatePatient,
  onCreatePatientBatch,
  onDocumentClick,
  onRefresh,
  onSetNewPatientSort,
  onSetSelectedNewPatientDocs,
  onShowPatientMatch,
  onViewExtractionResult,
  processedDocs,
  selectedNewPatientDocs,
  sortedNewPatientDocs,
  visibleNewPatientDocs,
}) => {
  const selectableDocs = sortedNewPatientDocs.filter(doc => !processedDocs.includes(doc.id))

  const selectDocument = (documentId, checked) => {
    onSetSelectedNewPatientDocs(prev => {
      if (checked) return Array.from(new Set([...prev, documentId]))
      return prev.filter(id => id !== documentId)
    })
  }

  return (
    <Col xs={24} lg={8}>
      <Card
        title={(
          <Space>
            <Tooltip title="新患者档案 - AI识别出新患者，请确认基本信息后创建档案">
              <UserAddOutlined style={{ color: '#8b5cf6' }} />
            </Tooltip>
            <Text strong>新建患者</Text>
            <Badge count={newPatientDocs.length} style={{ backgroundColor: '#8b5cf6' }} />
          </Space>
        )}
        size="small"
        extra={(
          <Space>
            <Tooltip title="刷新列表">
              <Button size="small" icon={<ReloadOutlined spin={newPatientLoading} />} onClick={onRefresh} loading={newPatientLoading} />
            </Tooltip>
            <Tooltip title={getSortTooltip(newPatientSort)}>
              <Button
                size="small"
                icon={<SortAscendingOutlined />}
                type={newPatientSort ? 'primary' : 'default'}
                onClick={() => onSetNewPatientSort(getNextSort(newPatientSort))}
              />
            </Tooltip>
          </Space>
        )}
        style={CARD_STYLE}
        styles={CARD_BODY_STYLES}
        loading={newPatientLoading}
        actions={[
          <div key="actions" style={ACTIONS_STYLE}>
            <Checkbox
              checked={selectableDocs.length > 0 && selectableDocs.every(doc => selectedNewPatientDocs.includes(doc.id))}
              indeterminate={selectedNewPatientDocs.length > 0 && selectedNewPatientDocs.length < selectableDocs.length}
              onChange={(event) => {
                onSetSelectedNewPatientDocs(event.target.checked ? selectableDocs.map(doc => doc.id) : [])
              }}
            >
              全选
            </Checkbox>

            <Tooltip title="将文档批量合并&归档到一个新患者" placement="bottom">
              <Button
                type="primary"
                size="small"
                icon={<UserAddOutlined />}
                onClick={() => onCreatePatientBatch(selectedNewPatientDocs)}
                disabled={selectedNewPatientDocs.length === 0}
                style={CREATE_BUTTON_STYLE}
              >
                批量创建新患者{selectedNewPatientDocs.length > 0 ? ` (${selectedNewPatientDocs.length})` : ''}
              </Button>
            </Tooltip>
          </div>,
        ]}
      >
        {visibleNewPatientDocs.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无需要新建患者的文档" />
        ) : (
          <Collapse bordered={false} expandIconPosition="end" style={{ background: 'transparent' }}>
            {groupedNewPatientDocs.map((group, groupIndex) => {
              const groupIds = group.items.map(item => item.id)
              const allSelected = groupIds.length > 0 && groupIds.every(id => selectedNewPatientDocs.includes(id))
              const isIndeterminate = groupIds.some(id => selectedNewPatientDocs.includes(id)) && !allSelected

              return (
                <Panel
                  key={`new-${groupIndex}`}
                  header={<NewPatientGroupHeader group={group} />}
                  extra={(
                    <div onClick={(event) => event.stopPropagation()}>
                      <Checkbox
                        checked={allSelected}
                        indeterminate={isIndeterminate}
                        onChange={(event) => {
                          onSetSelectedNewPatientDocs(prev => {
                            if (event.target.checked) return Array.from(new Set([...prev, ...groupIds]))
                            return prev.filter(id => !groupIds.includes(id))
                          })
                        }}
                      >
                        全选
                      </Checkbox>
                    </div>
                  )}
                >
                  <List
                    dataSource={group.items}
                    renderItem={item => (
                      <NewPatientDocumentItem
                        item={item}
                        onCreatePatient={onCreatePatient}
                        onDocumentClick={onDocumentClick}
                        onPatientMatch={onShowPatientMatch}
                        onSelectChange={selectDocument}
                        onViewExtractionResult={onViewExtractionResult}
                        processed={processedDocs.includes(item.id)}
                        selected={selectedNewPatientDocs.includes(item.id)}
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

export default NewPatientPanel
