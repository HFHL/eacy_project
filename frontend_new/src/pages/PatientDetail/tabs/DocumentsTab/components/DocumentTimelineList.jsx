import React, { forwardRef } from 'react'
import { Empty, Spin, Typography } from 'antd'
import TimelineGroup from './TimelineGroup'

const { Text } = Typography

const DocumentTimelineList = forwardRef(({
  documents,
  groupedDocuments,
  loading,
  onDocumentClick,
  stats,
}, ref) => (
  <div
    ref={ref}
    className="documents-timeline"
    style={{ overflowX: 'hidden' }}
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
        description={stats.hasActiveFilters ? '没有找到符合条件的文档' : '暂无文档'}
        style={{ padding: '60px 0' }}
      />
    ) : (
      <div className="timeline-groups">
        {groupedDocuments.map(group => (
          <TimelineGroup
            key={group.key}
            groupTitle={group.title}
            groupSubtitle={group.subtitle}
            documents={group.documents}
            groupType={group.type}
            onDocumentClick={onDocumentClick}
            defaultExpanded
          />
        ))}
      </div>
    )}
  </div>
))

DocumentTimelineList.displayName = 'DocumentTimelineList'

export default DocumentTimelineList
