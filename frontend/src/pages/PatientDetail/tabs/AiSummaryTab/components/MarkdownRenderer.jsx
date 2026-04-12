/**
 * Markdown渲染组件
 * 支持基础Markdown格式，符合全局设计规范
 */
import React from 'react'
import ReactMarkdown from 'react-markdown'
import { Typography } from 'antd'
import './MarkdownRenderer.css'

const { Text } = Typography

const TABLE_HTML_REGEX = /<table[\s\S]*?<\/table>/gi
const SCRIPT_TAG_REGEX = /<script[\s\S]*?>[\s\S]*?<\/script>/gi

const stripUnsafeHtml = (html = '') => html.replace(SCRIPT_TAG_REGEX, '')

const splitMarkdownWithTables = (rawContent = '') => {
  const content = String(rawContent || '')
  if (!content) return []

  const segments = []
  let lastIndex = 0
  let match

  TABLE_HTML_REGEX.lastIndex = 0
  while ((match = TABLE_HTML_REGEX.exec(content)) !== null) {
    const tableStart = match.index
    const tableEnd = TABLE_HTML_REGEX.lastIndex

    if (tableStart > lastIndex) {
      segments.push({
        type: 'markdown',
        content: content.slice(lastIndex, tableStart),
      })
    }

    segments.push({
      type: 'table',
      content: stripUnsafeHtml(match[0]),
    })

    lastIndex = tableEnd
  }

  if (lastIndex < content.length) {
    segments.push({
      type: 'markdown',
      content: content.slice(lastIndex),
    })
  }

  return segments.filter((segment) => segment.content && segment.content.trim())
}

const MarkdownRenderer = ({ content, className = '' }) => {
  // 自定义渲染组件
  const components = {
    // 标题渲染
    h1: ({ children }) => (
      <h1 className="markdown-h1">{children}</h1>
    ),
    h2: ({ children }) => (
      <h2 className="markdown-h2">{children}</h2>
    ),
    h3: ({ children }) => (
      <h3 className="markdown-h3">{children}</h3>
    ),
    h4: ({ children }) => (
      <h4 className="markdown-h4">{children}</h4>
    ),
    
    // 段落渲染
    p: ({ children }) => (
      <p className="markdown-p">{children}</p>
    ),
    
    // 粗体渲染
    strong: ({ children }) => (
      <Text strong className="markdown-strong">{children}</Text>
    ),
    
    // 列表渲染
    ul: ({ children }) => (
      <ul className="markdown-ul">{children}</ul>
    ),
    li: ({ children }) => (
      <li className="markdown-li">{children}</li>
    ),
    
    // 代码渲染
    code: ({ children }) => (
      <code className="markdown-code">{children}</code>
    ),
    
    // 引用渲染
    blockquote: ({ children }) => (
      <blockquote className="markdown-blockquote">{children}</blockquote>
    ),
    
    // 链接渲染
    a: ({ href, children }) => (
      <a href={href} className="markdown-link" target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    ),
    table: ({ children }) => (
      <div className="markdown-table-wrapper">
        <table className="markdown-table">{children}</table>
      </div>
    ),
    thead: ({ children }) => <thead className="markdown-thead">{children}</thead>,
    tbody: ({ children }) => <tbody className="markdown-tbody">{children}</tbody>,
    tr: ({ children }) => <tr className="markdown-tr">{children}</tr>,
    th: ({ children }) => <th className="markdown-th">{children}</th>,
    td: ({ children }) => <td className="markdown-td">{children}</td>,
  }

  const segments = splitMarkdownWithTables(content)

  return (
    <div className={`markdown-renderer ${className}`}>
      {segments.length === 0 ? (
        <ReactMarkdown components={components}>
          {content || ''}
        </ReactMarkdown>
      ) : (
        segments.map((segment, index) => {
          if (segment.type === 'table') {
            return (
              <div
                key={`table-${index}`}
                className="markdown-html-table"
                dangerouslySetInnerHTML={{ __html: segment.content }}
              />
            )
          }
          return (
            <ReactMarkdown key={`md-${index}`} components={components}>
              {segment.content}
            </ReactMarkdown>
          )
        })
      )}
    </div>
  )
}

export default MarkdownRenderer