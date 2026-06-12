import React from 'react'
import {
  Divider,
  Empty,
  Input,
  Spin,
  Tag,
} from 'antd'
import {
  CloseOutlined,
  FileOutlined,
  SearchOutlined,
  TeamOutlined,
} from '@ant-design/icons'

const hoverFill = (token) => ({
  onMouseEnter: (event) => { event.currentTarget.style.background = token.colorFillTertiary },
  onMouseLeave: (event) => { event.currentTarget.style.background = 'transparent' },
})

const resultRowStyle = {
  padding: '8px 12px',
  borderRadius: 6,
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  gap: 10,
}

const GlobalSearchOverlay = ({
  inputRef,
  loading,
  onBackdropClick,
  onQueryChange,
  onResultClick,
  pageEntries,
  query,
  results,
  token,
  visible,
}) => {
  if (!visible) return null

  const hasQuery = Boolean(query.trim())
  const hasNoResults = hasQuery
    && !loading
    && !results.pages.length
    && !results.patients.length
    && !results.documents.length

  return (
    <>
      <div
        onClick={onBackdropClick}
        style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.25)', zIndex: 999 }}
      />
      <div
        style={{
          position: 'fixed',
          top: '12%',
          left: '50%',
          transform: 'translateX(-50%)',
          width: 560,
          maxHeight: '68vh',
          background: token.colorBgContainer,
          borderRadius: 12,
          boxShadow: '0 16px 48px rgba(0,0,0,0.2)',
          zIndex: 1000,
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div style={{ padding: '16px 20px 12px', borderBottom: `1px solid ${token.colorBorderSecondary}`, display: 'flex', alignItems: 'center', gap: 12 }}>
          <SearchOutlined style={{ fontSize: 16, color: token.colorTextTertiary }} />
          <Input
            ref={inputRef}
            placeholder="搜索患者、文档、页面…  (Esc 关闭)"
            variant="borderless"
            size="large"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            style={{ flex: 1, fontSize: 16 }}
          />
          {query ? (
            <CloseOutlined
              style={{ cursor: 'pointer', color: token.colorTextTertiary }}
              onClick={() => onQueryChange('')}
            />
          ) : null}
          <Tag style={{ fontSize: 12, lineHeight: '20px' }}>ESC</Tag>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 0' }}>
          {loading ? (
            <div style={{ textAlign: 'center', padding: 24 }}>
              <Spin size="small" />
              <span style={{ marginLeft: 8, color: token.colorTextTertiary }}>搜索中…</span>
            </div>
          ) : null}

          {!hasQuery && !loading ? (
            <div style={{ padding: '12px 20px', color: token.colorTextTertiary, fontSize: 14 }}>
              <div style={{ marginBottom: 8, fontWeight: 500, color: token.colorTextSecondary }}>快速导航</div>
              {pageEntries.map((item) => (
                <div
                  key={item.path}
                  onClick={() => onResultClick('page', item)}
                  style={{ ...resultRowStyle, color: token.colorText }}
                  {...hoverFill(token)}
                >
                  <span style={{ color: token.colorPrimary }}>{item.icon}</span>
                  <span>{item.label}</span>
                </div>
              ))}
              <Divider style={{ margin: '8px 0' }} />
              <div style={{ fontSize: 12, color: token.colorTextTertiary, textAlign: 'center' }}>
                提示：<Tag style={{ fontSize: 12 }}>Ctrl+K</Tag> 随时打开搜索
              </div>
            </div>
          ) : null}

          {hasQuery && !loading ? (
            <>
              {results.pages.length > 0 ? (
                <div style={{ padding: '4px 20px' }}>
                  <div style={{ fontSize: 12, color: token.colorTextTertiary, fontWeight: 500, marginBottom: 4 }}>页面</div>
                  {results.pages.map((item) => (
                    <div
                      key={item.path}
                      onClick={() => onResultClick('page', item)}
                      style={resultRowStyle}
                      {...hoverFill(token)}
                    >
                      <span style={{ color: token.colorPrimary }}>{item.icon}</span>
                      <span>{item.label}</span>
                      <span style={{ marginLeft: 'auto', fontSize: 12, color: token.colorTextTertiary }}>{item.path}</span>
                    </div>
                  ))}
                </div>
              ) : null}

              {results.patients.length > 0 ? (
                <div style={{ padding: '4px 20px' }}>
                  <div style={{ fontSize: 12, color: token.colorTextTertiary, fontWeight: 500, marginBottom: 4 }}>患者</div>
                  {results.patients.slice(0, 5).map((item) => (
                    <div
                      key={item.id}
                      onClick={() => onResultClick('patient', item)}
                      style={resultRowStyle}
                      {...hoverFill(token)}
                    >
                      <TeamOutlined style={{ color: token.colorSuccess }} />
                      <span style={{ fontWeight: 500 }}>{item.name || '未命名'}</span>
                      {item.patient_code ? <Tag style={{ fontSize: 12 }}>{item.patient_code}</Tag> : null}
                      {item.gender ? <span style={{ fontSize: 12, color: token.colorTextTertiary }}>{item.gender}</span> : null}
                      {item.age ? <span style={{ fontSize: 12, color: token.colorTextTertiary }}>{item.age}岁</span> : null}
                    </div>
                  ))}
                </div>
              ) : null}

              {results.documents.length > 0 ? (
                <div style={{ padding: '4px 20px' }}>
                  <div style={{ fontSize: 12, color: token.colorTextTertiary, fontWeight: 500, marginBottom: 4 }}>文档</div>
                  {results.documents.slice(0, 5).map((item) => (
                    <div
                      key={item.id}
                      onClick={() => onResultClick('document', item)}
                      style={resultRowStyle}
                      {...hoverFill(token)}
                    >
                      <FileOutlined style={{ color: token.colorWarning }} />
                      <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {item.file_name || item.original_filename || '未命名文档'}
                      </span>
                      {item.doc_type ? <Tag color="blue" style={{ fontSize: 12 }}>{item.doc_type}</Tag> : null}
                    </div>
                  ))}
                </div>
              ) : null}

              {hasNoResults ? (
                <Empty
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                  description={<span style={{ color: token.colorTextTertiary }}>未找到 "{query}" 的相关结果</span>}
                  style={{ padding: 32 }}
                />
              ) : null}
            </>
          ) : null}
        </div>
      </div>
    </>
  )
}

export default GlobalSearchOverlay
