import React from 'react'
import { Empty, Tag, Tooltip } from 'antd'
import { FileTextOutlined, PictureOutlined, TableOutlined } from '@ant-design/icons'

import { TYPE_COLORS, TITLE_STYLES } from './constants'

const TYPE_ICONS = {
  text: <FileTextOutlined />,
  table: <TableOutlined />,
  image: <PictureOutlined />,
  discarded: <FileTextOutlined style={{ opacity: 0.5 }} />,
}

export const ContentBlockList = ({
  contentList,
  activeBlockIndex,
  onBlockHover,
  onBlockClick,
  filterType,
}) => {
  const filteredList = filterType === 'all'
    ? contentList
    : contentList.filter((block) => block.type === filterType)

  if (!contentList || contentList.length === 0) {
    return (
      <div className="content-empty">
        <Empty description="暂无解析内容" />
      </div>
    )
  }

  return (
    <div className="content-list">
      {filteredList.map((block) => {
        const globalIndex = contentList.indexOf(block)
        const isActive = globalIndex === activeBlockIndex
        const titleStyle = block.text_level ? TITLE_STYLES[block.text_level] : {}

        return (
          <div
            key={globalIndex}
            className={`content-block ${isActive ? 'active' : ''} type-${block.type}`}
            onMouseEnter={() => onBlockHover(globalIndex)}
            onMouseLeave={() => onBlockHover(null)}
            onClick={() => onBlockClick(globalIndex)}
          >
            <div className="block-header">
              <span className="block-index">#{globalIndex + 1}</span>
              <Tag
                color={TYPE_COLORS[block.type]}
                icon={TYPE_ICONS[block.type]}
                style={{ marginLeft: 8 }}
              >
                {block.type}
                {block.text_level && ` H${block.text_level}`}
              </Tag>
              <span className="block-page">P{block.page_idx + 1}</span>
            </div>

            <div className="block-content" style={titleStyle}>
              {block.type === 'text' && (
                <div className="text-content">
                  {block.text || '(空文本)'}
                </div>
              )}

              {block.type === 'table' && (
                <div className="table-content">
                  <Tooltip title="点击查看表格详情">
                    <span>📊 表格内容</span>
                  </Tooltip>
                  {block.table_body && (
                    <div
                      className="table-preview"
                      dangerouslySetInnerHTML={{ __html: block.table_body }}
                    />
                  )}
                </div>
              )}

              {block.type === 'image' && (
                <div className="image-content">
                  <PictureOutlined /> 图片: {block.img_path || '未知'}
                </div>
              )}

              {block.type === 'discarded' && (
                <div className="discarded-content">
                  {block.text || '(丢弃内容)'}
                </div>
              )}
            </div>

            <div className="block-bbox">
              <Tooltip title="坐标: [x1, y1, x2, y2] (0-1000 范围)">
                <code>
                  [{block.bbox?.join(', ') || 'N/A'}]
                </code>
              </Tooltip>
            </div>
          </div>
        )
      })}
    </div>
  )
}
