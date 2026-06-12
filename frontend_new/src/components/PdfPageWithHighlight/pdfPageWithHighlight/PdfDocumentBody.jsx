import React from 'react'
import { Spin } from 'antd'
import { Document, Page } from 'react-pdf'

import { appThemeToken } from '../../../styles/themeTokens'

export const PdfDocumentBody = ({
  enableTextLayer,
  error,
  measurementReady,
  onDocumentLoadSuccess,
  onLoadError,
  onPageLoadSuccess,
  pageNumbers,
  pageWidth,
  pdfUrl,
  renderOverlay,
  scrollRef,
  showLoading,
}) => (
  <div ref={scrollRef} style={{ width: '100%', minWidth: 0 }}>
    <Document
      file={pdfUrl}
      loading={
        <div style={{ minHeight: 160, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
          <Spin />
          <span style={{ fontSize: 12, color: appThemeToken.colorTextSecondary }}>加载 PDF...</span>
        </div>
      }
      error={
        <div style={{ padding: 12, background: 'rgba(255, 77, 79, 0.1)', borderRadius: 4, color: appThemeToken.colorError, fontSize: 12 }}>
          {error || 'PDF 加载失败'}
        </div>
      }
      noData={
        <div style={{ padding: 12, color: appThemeToken.colorTextSecondary, fontSize: 12 }}>
          未提供 PDF 地址
        </div>
      }
      onLoadSuccess={onDocumentLoadSuccess}
      onLoadError={(err) => onLoadError(err?.message || 'PDF 加载失败')}
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'stretch', width: '100%', gap: 16 }}>
        {showLoading && null}
        {measurementReady && pageNumbers.map((pageNo) => (
          <div
            key={pageNo}
            className="pdf-page-shell"
            data-page-number={pageNo}
            style={{
              position: 'relative',
              width: '100%',
              maxWidth: pageWidth,
              margin: '0 auto',
              background: '#fff',
              borderRadius: 4,
              boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
              overflow: 'hidden',
              isolation: 'isolate',
            }}
          >
            <div className="pdf-page-canvas-layer" style={{ position: 'relative', zIndex: 0 }}>
              <Page
                className="pdf-page-react-layer"
                pageNumber={pageNo}
                width={pageWidth}
                canvasBackground="transparent"
                loading={
                  <div style={{ minHeight: 160, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Spin size="small" />
                  </div>
                }
                renderTextLayer={enableTextLayer}
                renderAnnotationLayer={false}
                onLoadSuccess={onPageLoadSuccess}
              />
            </div>
            {renderOverlay(pageNo)}
          </div>
        ))}
      </div>
    </Document>
  </div>
)
