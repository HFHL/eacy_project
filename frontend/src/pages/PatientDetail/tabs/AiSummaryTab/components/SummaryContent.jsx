/**
 * 综述内容展示组件
 * 负责AI病情综述的显示和Markdown渲染
 */
import React from 'react'
import { Card, Button, Space, Typography, Empty, Spin } from 'antd'
import { 
  EditOutlined, 
  ReloadOutlined, 
  DownloadOutlined, 
  SaveOutlined,
  RobotOutlined
} from '@ant-design/icons'
import MarkdownRenderer from './MarkdownRenderer'
import SummaryEditor from './SummaryEditor'

const { Text } = Typography

const SummaryContent = ({
  aiSummary,
  summaryEditMode,
  setSummaryEditMode,
  summaryGenerating,
  handleEditSummary,
  handleSaveSummary,
  handleRegenerateSummary,
  renderSummaryWithFootnotes,
  summaryForm
}) => {
  const hasContent = aiSummary.content && aiSummary.content.trim()

  return (
    <Card 
      title={
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <span>AI病情综述</span>
            {hasContent && aiSummary.lastUpdate && (
              <Text type="secondary" style={{ marginLeft: 12, fontSize: 12, fontWeight: 'normal' }}>
                最后更新: {aiSummary.lastUpdate}
              </Text>
            )}
          </div>
          <Space>
            {hasContent && !summaryEditMode ? (
              <>
                <Button 
                  size="small"
                  icon={<EditOutlined />}
                  onClick={() => handleEditSummary(summaryForm)}
                >
                  编辑
                </Button>
                <Button 
                  size="small"
                  icon={<ReloadOutlined />}
                  onClick={handleRegenerateSummary}
                  loading={summaryGenerating}
                >
                  重新生成
                </Button>
                <Button size="small" icon={<DownloadOutlined />}>
                  导出
                </Button>
              </>
            ) : summaryEditMode ? (
              <>
                <Button size="small" onClick={() => setSummaryEditMode(false)}>
                  取消
                </Button>
                <Button 
                  type="primary" 
                  size="small"
                  icon={<SaveOutlined />}
                  onClick={() => handleSaveSummary(summaryForm)}
                >
                  保存
                </Button>
              </>
            ) : null}
          </Space>
        </div>
      }
      size="small" 
      style={{ marginBottom: 16 }}
      bodyStyle={{ padding: '20px' }}
    >
      {summaryGenerating ? (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <Spin size="large" />
          <div style={{ marginTop: 16 }}>
            <Text type="secondary">正在根据文档内容生成病情综述，请稍候...</Text>
          </div>
          <div style={{ marginTop: 8 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>
              这可能需要 10~30 秒，取决于文档数量
            </Text>
          </div>
        </div>
      ) : !hasContent && !summaryEditMode ? (
        <div style={{ textAlign: 'center', padding: '60px 0' }}>
          <Empty
            image={<RobotOutlined style={{ fontSize: 48, color: '#d9d9d9' }} />}
            imageStyle={{ height: 60 }}
            description={
              <div>
                <Text type="secondary" style={{ display: 'block', marginBottom: 8 }}>
                  暂无 AI 病情综述
                </Text>
                <Text type="secondary" style={{ fontSize: 12 }}>
                  点击下方按钮，基于患者关联的文档内容自动生成
                </Text>
              </div>
            }
          >
            <Button
              type="primary"
              size="large"
              icon={<RobotOutlined />}
              onClick={handleRegenerateSummary}
              loading={summaryGenerating}
            >
              生成 AI 病情综述
            </Button>
          </Empty>
        </div>
      ) : !summaryEditMode ? (
        <div className="summary-display">
          <MarkdownRenderer 
            content={aiSummary.content}
            className="summary-content"
          />
        </div>
      ) : (
        <SummaryEditor 
          summaryForm={summaryForm}
        />
      )}
    </Card>
  )
}

export default SummaryContent