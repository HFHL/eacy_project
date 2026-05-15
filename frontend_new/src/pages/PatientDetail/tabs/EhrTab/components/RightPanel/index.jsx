/**
 * 右侧面板组件 - 文档溯源预览
 * 显示选中字段的来源文档信息和内容预览
 * 支持显示文档图片并高亮来源区域
 */
import React, { useState } from 'react'
import {
  Card,
  Typography,
  Tag,
  Button,
  Space,
  Spin,
  Empty,
  List,
  Divider
} from 'antd'
import {
  FileTextOutlined,
  EyeOutlined,
  PlayCircleOutlined,
  LoadingOutlined,
  HistoryOutlined,
  UserOutlined,
  RobotOutlined,
  ClockCircleOutlined
} from '@ant-design/icons'
import dayjs from 'dayjs'
import { maskSensitiveField } from '@/utils/sensitiveUtils'
import { appThemeToken } from '@/styles/themeTokens'
import PdfPageWithHighlight from '@/components/PdfPageWithHighlight'
import HighlightedImage from '@/components/HighlightedImage'

const { Text, Title } = Typography

// 变更类型映射
const CHANGE_TYPE_MAP = {
  'extract': { label: 'AI抽取', color: 'blue', icon: <RobotOutlined /> },
  'manual_edit': { label: '手动编辑', color: 'green', icon: <UserOutlined /> },
  'merge': { label: '合并', color: 'purple', icon: <HistoryOutlined /> },
  'merge_append': { label: '累加合并', color: 'purple', icon: <HistoryOutlined /> },
  'delete': { label: '删除', color: 'red', icon: <HistoryOutlined /> },
  'conflict_resolve_adopt': { label: '采用新值', color: 'orange', icon: <HistoryOutlined /> },
  'conflict_resolve_keep': { label: '保留原值', color: 'cyan', icon: <HistoryOutlined /> }
}

// HighlightedImage 已抽到 src/components/HighlightedImage 共享给科研项目复用

const RightPanel = ({ 
  // 选中的字段信息
  selectedField,
  // 项目表单：选中的文档（用于直接预览原文档）
  selectedDocument,
  // 字段溯源历史
  fieldHistory,
  // 加载状态
  historyLoading,
  // 文档图片URL
  documentImageUrl,
  imageLoading,
  // 文档预览URL（用于直接预览原文档）
  documentPreviewUrl,
  documentPreviewLoading = false,
  // 来源位置信息
  sourceLocation,
  // 兜底文档（无变更历史时由字段类型规则匹配到的关联文档）
  fallbackDocument = null,
  // 事件处理
  onViewFullDocument,
  onViewDocument,
  onReExtract,
  extracting = false
}) => {
  // 获取最新的变更记录
  const latestHistory = fieldHistory && fieldHistory.length > 0 ? fieldHistory[0] : null
  // 是否处于兜底模式：有选中字段、无可溯源历史、但有兜底文档
  const isFallbackMode = selectedField && !latestHistory?.source_document_id && !!fallbackDocument
  const isDocumentMode = !selectedField && !!selectedDocument

  const getFileExt = (nameOrUrl) => {
    if (!nameOrUrl) return ''
    const value = String(nameOrUrl).toLowerCase()
    if (value.includes('image/jpeg') || value.includes('image/jpg')) return 'jpg'
    if (value.includes('image/png')) return 'png'
    if (value.includes('image/webp')) return 'webp'
    if (value.includes('image/gif')) return 'gif'
    if (value.includes('application/pdf')) return 'pdf'
    const raw = String(nameOrUrl).split('?')[0].split('#')[0]
    const idx = raw.lastIndexOf('.')
    if (idx === -1) return ''
    return raw.slice(idx + 1).toLowerCase()
  }

  const previewExt = getFileExt(documentPreviewUrl) || getFileExt(selectedDocument?.fileName || selectedDocument?.name)
  const isPdf = previewExt === 'pdf'
  const isImage = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'].includes(previewExt)

  // 溯源模式下，用同样的逻辑判断文档类型（documentImageUrl 通常是 temp_url）
  const sourceName = Array.isArray(sourceLocation)
    ? sourceLocation.find(item => item?.file_name || item?.source_document_name)?.file_name || sourceLocation.find(item => item?.file_name || item?.source_document_name)?.source_document_name
    : sourceLocation?.file_name || sourceLocation?.source_document_name
  const sourceMime = Array.isArray(sourceLocation)
    ? sourceLocation.find(item => item?.mime_type)?.mime_type
    : sourceLocation?.mime_type
  const traceExt = getFileExt(documentImageUrl) || getFileExt(sourceName) || getFileExt(sourceMime) || getFileExt(latestHistory?.source_document_name) || getFileExt(fallbackDocument?.name)
  const traceIsPdf = traceExt === 'pdf'
  const traceIsImage = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'].includes(traceExt)
  const traceDocId =
    (Array.isArray(sourceLocation) ? sourceLocation.find(item => item?.document_id)?.document_id : sourceLocation?.document_id) ||
    latestHistory?.source_document_id ||
    selectedField?.document_id ||
    selectedField?.documentId ||
    selectedField?.source_document_id ||
    fallbackDocument?.id

  return (
    <Card 
      title={
        <Space>
          {isDocumentMode ? <EyeOutlined /> : <HistoryOutlined />}
          <span>{isDocumentMode ? '文档预览' : '文档溯源'}</span>
        </Space>
      }
      size="small" 
      style={{ 
        border: 'none',
        borderRadius: 0,
        height: '100%'
      }}
      styles={{ body: { padding: '12px', height: 'calc(100% - 46px)', overflow: 'auto' } }}
    >
      {isDocumentMode ? (
        <div>
          <div style={{
            marginBottom: 12,
            padding: 12,
            background: 'rgba(82, 196, 26, 0.1)',
            borderRadius: 6,
            border: `1px solid ${appThemeToken.colorSuccess}`
          }}>
            <Text strong style={{ fontSize: 14 }}>
              {selectedDocument?.fileName || selectedDocument?.name || '未命名文档'}
            </Text>
            <br />
            <Text type="secondary" style={{ fontSize: 12 }}>
              文档ID: {selectedDocument?.id || '-'}
            </Text>
          </div>

          <div style={{ marginBottom: 12, textAlign: 'center' }}>
            <Space>
              <Button
                size="small"
                icon={<EyeOutlined />}
                disabled={!selectedDocument?.id}
                onClick={() => onViewDocument && onViewDocument(selectedDocument)}
              >
                查看完整文档
              </Button>
            </Space>
          </div>

          {documentPreviewLoading ? (
            <div style={{ textAlign: 'center', padding: 60 }}>
              <Spin tip="加载文档..." />
            </div>
          ) : documentPreviewUrl ? (
            <div style={{ border: `1px solid ${appThemeToken.colorBorder}`, borderRadius: 6, overflow: 'hidden' }}>
              {isPdf ? (
                <div style={{ maxHeight: '70vh', overflow: 'auto', padding: 8, display: 'flex', justifyContent: 'center' }}>
                  <PdfPageWithHighlight
                    pdfUrl={documentPreviewUrl}
                    maxWidth="100%"
                    renderAllPages
                    loading={false}
                  />
                </div>
              ) : isImage ? (
                <img
                  src={documentPreviewUrl}
                  alt="document-preview"
                  style={{ width: '100%', display: 'block' }}
                />
              ) : (
                <Empty
                  description="该文档类型暂不支持内嵌预览，请点击「查看完整文档」"
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                />
              )}
            </div>
          ) : (
            <Empty
              description="暂无可预览链接"
              image={Empty.PRESENTED_IMAGE_SIMPLE}
            />
          )}
        </div>
      ) : historyLoading ? (
        <div style={{ textAlign: 'center', padding: 60 }}>
          <Spin tip="加载溯源信息..." />
        </div>
      ) : selectedField ? (
        <div>
          {/* 当前选中字段信息 */}
          <div style={{ 
            marginBottom: 12, 
            padding: 12, 
            background: appThemeToken.colorPrimaryBg, 
            borderRadius: 6,
            border: `1px solid ${appThemeToken.colorPrimaryBorder}`
          }}>
            <Text strong style={{ fontSize: 14 }}>
              {selectedField.name || selectedField.fieldName}
            </Text>
            <br />
            <Text type="secondary" style={{ fontSize: 12 }}>
              字段ID: {selectedField.id || selectedField.fieldId}
            </Text>
          </div>

          {/* 兜底匹配提示 */}
          {isFallbackMode && (
            <div style={{
              marginBottom: 12,
              padding: '8px 12px',
              background: 'rgba(250, 173, 20, 0.1)',
              borderRadius: 6,
              border: `1px solid ${appThemeToken.colorWarning}`
            }}>
              <Text style={{ fontSize: 12, color: appThemeToken.colorWarning }}>
                <FileTextOutlined style={{ marginRight: 4 }} />
                未找到精确溯源记录，已根据字段类型规则匹配到关联文档
              </Text>
              <br />
              <Text type="secondary" style={{ fontSize: 12 }}>
                文档: {fallbackDocument?.name || fallbackDocument?.fileName || '未命名文档'}
              </Text>
            </div>
          )}

          {/* 文档图片预览区域 */}
          <div style={{ marginBottom: 16 }}>
            <Text strong style={{ fontSize: 12, marginBottom: 8, display: 'block' }}>
              {isFallbackMode ? '关联文档:' : '来源文档:'}
            </Text>
            {imageLoading ? (
              <div style={{ 
                height: 120, 
                display: 'flex', 
                alignItems: 'center', 
                justifyContent: 'center',
                background: appThemeToken.colorFillTertiary,
                borderRadius: 4
              }}>
                <Spin tip="加载文档..." />
              </div>
            ) : documentImageUrl ? (
              traceIsPdf ? (
                <div style={{ border: `1px solid ${appThemeToken.colorBorder}`, borderRadius: 6, overflow: 'auto', padding: 8, maxHeight: '70vh' }}>
                  <PdfPageWithHighlight
                    pdfUrl={documentImageUrl}
                    pageNumber={Array.isArray(sourceLocation) ? null : (sourceLocation?.page ?? null)}
                    locations={Array.isArray(sourceLocation) ? sourceLocation : (sourceLocation ? [sourceLocation] : [])}
                    maxWidth="100%"
                    loading={false}
                  />
                </div>
              ) : traceIsImage ? (
                <HighlightedImage
                  imageUrl={documentImageUrl}
                  sourceLocation={sourceLocation}
                  loading={false}
                />
              ) : (
                <Empty
                  description="该文档类型暂不支持内嵌预览，请点击「查看完整文档」"
                  image={Empty.PRESENTED_IMAGE_SIMPLE}
                />
              )
            ) : (
              <Empty 
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description="暂无来源文档"
              />
            )}
          </div>

          {/* 最新变更信息 */}
          {latestHistory && (
            <div style={{ marginBottom: 16 }}>
              <Text strong style={{ fontSize: 12, marginBottom: 8, display: 'block' }}>
                最新变更:
              </Text>
              <div style={{ 
                padding: 12, 
                background: appThemeToken.colorFillTertiary, 
                borderRadius: 6,
                border: `1px solid ${appThemeToken.colorBorder}`
              }}>
                <Space wrap size={[8, 4]}>
                  <Tag 
                    color={CHANGE_TYPE_MAP[latestHistory.change_type]?.color || 'default'}
                    icon={CHANGE_TYPE_MAP[latestHistory.change_type]?.icon}
                  >
                    {CHANGE_TYPE_MAP[latestHistory.change_type]?.label || latestHistory.change_type}
                  </Tag>
                  {latestHistory.operator_name && (
                    <Tag icon={latestHistory.operator_type === 'ai' ? <RobotOutlined /> : <UserOutlined />}>
                      {latestHistory.operator_name}
                    </Tag>
                  )}
                </Space>
                
                {latestHistory.source_document_name && (
                  <div style={{ marginTop: 8 }}>
                    <Text type="secondary" style={{ fontSize: 12 }}>
                      <FileTextOutlined style={{ marginRight: 4 }} />
                      {latestHistory.source_document_name}
                    </Text>
                  </div>
                )}
                
                <div style={{ marginTop: 8 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    <ClockCircleOutlined style={{ marginRight: 4 }} />
                    {dayjs(latestHistory.created_at).format('YYYY-MM-DD HH:mm:ss')}
                  </Text>
                </div>
                
                {latestHistory.new_value && (
                  <div style={{ marginTop: 8, padding: 8, background: appThemeToken.colorInfoBg || appThemeToken.colorPrimaryBg, borderRadius: 4 }}>
                    <Text style={{ fontSize: 12 }}>
                      值: {(() => {
                        const raw = typeof latestHistory.new_value === 'object'
                          ? JSON.stringify(latestHistory.new_value).substring(0, 200)
                          : String(latestHistory.new_value).substring(0, 200)
                        if (selectedField?.sensitive) {
                          return maskSensitiveField(raw, selectedField.name, selectedField.id)
                        }
                        return raw.length > 100 ? raw.substring(0, 100) + '...' : raw
                      })()}
                    </Text>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* 操作按钮 */}
          {traceDocId && (
            <div style={{ marginBottom: 16, textAlign: 'center' }}>
              <Space>
                <Button 
                  size="small" 
                  icon={<EyeOutlined />}
                  onClick={() => onViewFullDocument && onViewFullDocument(traceDocId)}
                >
                  查看完整文档
                </Button>
              </Space>
            </div>
          )}

          <Divider style={{ margin: '12px 0' }} />

          {/* 变更历史列表 */}
          {fieldHistory && fieldHistory.length > 0 && (
            <div>
              <Text strong style={{ fontSize: 12, marginBottom: 8, display: 'block' }}>
                变更历史 ({fieldHistory.length}):
              </Text>
              <List
                size="small"
                dataSource={fieldHistory.slice(0, 10)} // 最多显示10条
                renderItem={(item, index) => (
                  <List.Item style={{ padding: '8px 0', borderBottom: `1px solid ${appThemeToken.colorBorder}` }}>
                    <div style={{ width: '100%' }}>
                      <Space size={4}>
                        <Tag 
                          color={CHANGE_TYPE_MAP[item.change_type]?.color || 'default'}
                          style={{ fontSize: 12 }}
                        >
                          {CHANGE_TYPE_MAP[item.change_type]?.label || item.change_type}
                        </Tag>
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          {dayjs(item.created_at).format('MM-DD HH:mm')}
                        </Text>
                      </Space>
                      {item.operator_name && (
                        <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
                          by {item.operator_name}
                        </Text>
                      )}
                    </div>
                  </List.Item>
                )}
              />
              {fieldHistory.length > 10 && (
                <Text type="secondary" style={{ fontSize: 12, display: 'block', textAlign: 'center', marginTop: 8 }}>
                  还有 {fieldHistory.length - 10} 条历史记录...
                </Text>
              )}
            </div>
          )}
        </div>
      ) : (
        /* 空状态 */
        <div style={{ textAlign: 'center', padding: 60, color: appThemeToken.colorTextTertiary }}>
          <FileTextOutlined style={{ fontSize: 16 }} />
          <div style={{ marginTop: 16, fontSize: 14 }}>
            点击字段值查看来源文档
          </div>
          <div style={{ marginTop: 8, fontSize: 12 }}>
            文档溯源预览区域
          </div>
        </div>
      )}
    </Card>
  )
}

export default RightPanel
