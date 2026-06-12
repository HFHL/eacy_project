import React from 'react'
import { Collapse, Empty, Segmented, Space, Spin, Tag, Typography } from 'antd'
import {
  FileTextOutlined,
  OrderedListOutlined,
  PictureOutlined,
  TableOutlined,
} from '@ant-design/icons'
import MarkdownRenderer from '../../AiSummaryTab/components/MarkdownRenderer'
import OcrContentBlock from './OcrContentBlock'
import {
  getContentStats,
  groupContentByPage,
} from './ocrContentUtils'

const { Text } = Typography
const { Panel } = Collapse

const OcrContentPanel = ({
  loading,
  contentList,
  isParsed,
  displayMode,
  markdown,
  markdownLoading,
  imageLoadingMap,
  onDisplayModeChange,
  onImageLoadingChange,
}) => {
  if (loading) {
    return (
      <div className="ocr-content-empty">
        <Spin size="large" />
        <div style={{ marginTop: 16 }}>
          <Text type="secondary">正在加载 OCR 内容...</Text>
        </div>
      </div>
    )
  }

  const stats = getContentStats(contentList)
  const groupedContent = groupContentByPage(contentList)
  const markdownContent = (markdown || '').trim()

  return (
    <div className="ocr-content-wrapper">
      <div className="ocr-view-switch-bar">
        <Segmented
          size="small"
          value={displayMode}
          onChange={onDisplayModeChange}
          options={[
            { label: '内容块', value: 'blocks' },
            { label: 'Markdown', value: 'markdown' }
          ]}
        />
        {displayMode === 'markdown' && markdownLoading && (
          <Text type="secondary" style={{ fontSize: 12 }}>加载 Markdown 中...</Text>
        )}
      </div>

      {displayMode === 'markdown' ? (
        markdownLoading ? (
          <div className="ocr-content-empty">
            <Spin />
          </div>
        ) : markdownContent ? (
          <div className="ocr-markdown-container">
            <MarkdownRenderer content={markdownContent} />
          </div>
        ) : (
          <div className="ocr-content-empty">
            <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无 Markdown 格式 OCR 内容" />
          </div>
        )
      ) : !contentList || contentList.length === 0 ? (
        <div className="ocr-content-empty">
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={isParsed ? '文档已解析，但无可展示的内容块' : '文档尚未解析，请先进行 OCR 解析'}
          />
        </div>
      ) : (
        <>
          <div className="ocr-stats-bar">
            <Space size="middle" wrap>
              <Tag icon={<OrderedListOutlined />}>页数</Tag>
              <Tag icon={<FileTextOutlined />}>文本块</Tag>
              <Tag icon={<TableOutlined />}>表格</Tag>
              <Tag icon={<PictureOutlined />}>图片</Tag>
              {stats.other > 0 && <Tag>其他</Tag>}
            </Space>
            <span />
          </div>

          <div className="ocr-pages-container">
            <Collapse defaultActiveKey={groupedContent.map((_, index) => String(index))} ghost size="small">
              {groupedContent.map((page, pageIndex) => (
                <Panel
                  key={String(pageIndex)}
                  header={
                    <div className="ocr-page-header">
                      <Space>
                        <OrderedListOutlined />
                        <Text strong>第 {page.pageNum} 页</Text>
                        <Text type="secondary">({page.blocks.length} 个内容块)</Text>
                      </Space>
                    </div>
                  }
                >
                  <div className="ocr-page-content">
                    {page.blocks.map((block) => (
                      <OcrContentBlock
                        key={block._originalIndex}
                        block={block}
                        index={block._originalIndex}
                        imageLoading={imageLoadingMap.get(block._image_url)}
                        onImageLoadingChange={onImageLoadingChange}
                      />
                    ))}
                  </div>
                </Panel>
              ))}
            </Collapse>
          </div>
        </>
      )}
    </div>
  )
}

export default OcrContentPanel
