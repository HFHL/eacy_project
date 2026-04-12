/**
 * AI病情综述Tab组件 - 重构版
 * 显示和管理AI生成的病情综述，支持Markdown渲染
 */
import React from 'react'
import { Row, Col } from 'antd'

// 导入新组件
import SummaryContent from './components/SummaryContent'
import SourceDocuments from './components/SourceDocuments'

const AiSummaryTab = ({
  aiSummary,
  summaryEditMode,
  setSummaryEditMode,
  summaryGenerating,
  handleEditSummary,
  handleSaveSummary,
  handleRegenerateSummary,
  handleViewSourceDocument,
  renderSummaryWithFootnotes,
  summaryForm
}) => {
  return (
    <div className="ai-summary-container">
      {/* 左右布局 */}
      <Row gutter={16}>
        {/* 左侧：病情综述内容 */}
        <Col span={16}>
          <SummaryContent
            aiSummary={aiSummary}
            summaryEditMode={summaryEditMode}
            setSummaryEditMode={setSummaryEditMode}
            summaryGenerating={summaryGenerating}
            handleEditSummary={handleEditSummary}
            handleSaveSummary={handleSaveSummary}
            handleRegenerateSummary={handleRegenerateSummary}
            renderSummaryWithFootnotes={renderSummaryWithFootnotes}
            summaryForm={summaryForm}
          />
        </Col>

        {/* 右侧：来源文档 */}
        <Col span={8}>
          <SourceDocuments
            sourceDocuments={aiSummary.sourceDocuments}
            onViewDocument={handleViewSourceDocument}
          />
        </Col>
      </Row>
    </div>
  )
}

export default AiSummaryTab