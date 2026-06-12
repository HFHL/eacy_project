import React from 'react'
import { Button, Divider, Empty, List, Space, Spin, Tag, Tooltip, Typography } from 'antd'
import {
  ClockCircleOutlined,
  ExportOutlined,
  EyeOutlined,
  FileTextOutlined,
  FullscreenOutlined,
  RobotOutlined,
  UserOutlined,
} from '@ant-design/icons'
import dayjs from 'dayjs'

import { appThemeToken } from '@/styles/themeTokens'
import { maskSensitiveField } from '@/utils/sensitiveUtils'
import { CHANGE_TYPE_MAP } from './changeTypes'
import { TracePreviewContent } from './TracePreviewContent'

const { Text } = Typography

const renderLatestValue = (latestHistory, selectedField) => {
  const raw = typeof latestHistory.new_value === 'object'
    ? JSON.stringify(latestHistory.new_value).substring(0, 200)
    : String(latestHistory.new_value).substring(0, 200)

  if (selectedField?.sensitive) {
    return maskSensitiveField(raw, selectedField.name, selectedField.id)
  }
  return raw.length > 100 ? `${raw.substring(0, 100)}...` : raw
}

const FallbackNotice = ({ fallbackDocument }) => (
  <div style={{
    marginBottom: 12,
    padding: '8px 12px',
    background: 'rgba(250, 173, 20, 0.1)',
    borderRadius: 6,
    border: `1px solid ${appThemeToken.colorWarning}`,
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
)

const LatestHistoryCard = ({ latestHistory, selectedField }) => latestHistory && (
  <div style={{ marginBottom: 16 }}>
    <Text strong style={{ fontSize: 12, marginBottom: 8, display: 'block' }}>
      最新变更:
    </Text>
    <div style={{
      padding: 12,
      background: appThemeToken.colorFillTertiary,
      borderRadius: 6,
      border: `1px solid ${appThemeToken.colorBorder}`,
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
            值: {renderLatestValue(latestHistory, selectedField)}
          </Text>
        </div>
      )}
    </div>
  </div>
)

const FieldHistoryList = ({ fieldHistory }) => fieldHistory?.length > 0 && (
  <div>
    <Text strong style={{ fontSize: 12, marginBottom: 8, display: 'block' }}>
      变更历史 ({fieldHistory.length}):
    </Text>
    <List
      size="small"
      dataSource={fieldHistory.slice(0, 10)}
      renderItem={(item) => (
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
)

export const FieldSourceMode = ({
  documentImageUrl,
  fallbackDocument,
  fieldHistory,
  historyLoading,
  imageLoading,
  isFallbackMode,
  latestHistory,
  onOpenFullscreen,
  onViewFullDocument,
  selectedField,
  sourceLocation,
  traceDocId,
  traceIsImage,
  traceIsPdf,
}) => {
  if (historyLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 60 }}>
        <Spin tip="加载溯源信息..." />
      </div>
    )
  }

  if (!selectedField) {
    return (
      <div style={{ textAlign: 'center', padding: 60, color: appThemeToken.colorTextTertiary }}>
        <FileTextOutlined style={{ fontSize: 16 }} />
        <div style={{ marginTop: 16, fontSize: 14 }}>点击字段值查看来源文档</div>
        <div style={{ marginTop: 8, fontSize: 12 }}>文档溯源预览区域</div>
      </div>
    )
  }

  return (
    <div>
      <div style={{
        marginBottom: 12,
        padding: 12,
        background: appThemeToken.colorPrimaryBg,
        borderRadius: 6,
        border: `1px solid ${appThemeToken.colorPrimaryBorder}`,
      }}>
        <Text strong style={{ fontSize: 14 }}>
          {selectedField.name || selectedField.fieldName}
        </Text>
        <br />
        <Text type="secondary" style={{ fontSize: 12 }}>
          字段ID: {selectedField.id || selectedField.fieldId}
        </Text>
      </div>

      {isFallbackMode && <FallbackNotice fallbackDocument={fallbackDocument} />}

      <div style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
          <Text strong style={{ fontSize: 12 }}>
            {isFallbackMode ? '关联文档:' : '来源文档:'}
          </Text>
          {documentImageUrl && (traceIsPdf || traceIsImage) && (
            <Space size={4}>
              <Tooltip title="放大查看">
                <Button size="small" type="text" icon={<FullscreenOutlined />} onClick={onOpenFullscreen}>
                  放大
                </Button>
              </Tooltip>
              <Tooltip title="在新标签页打开">
                <Button
                  size="small"
                  type="text"
                  icon={<ExportOutlined />}
                  onClick={() => window.open(documentImageUrl, '_blank', 'noopener,noreferrer')}
                />
              </Tooltip>
            </Space>
          )}
        </div>
        {imageLoading ? (
          <div style={{
            height: 120,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: appThemeToken.colorFillTertiary,
            borderRadius: 4,
          }}>
            <Spin tip="加载文档..." />
          </div>
        ) : (
          <div style={{ width: '100%', minWidth: 0, border: `1px solid ${appThemeToken.colorBorder}`, borderRadius: 6, overflow: 'auto', padding: 8, maxHeight: '70vh' }}>
            <TracePreviewContent
              documentImageUrl={documentImageUrl}
              sourceLocation={sourceLocation}
              traceIsImage={traceIsImage}
              traceIsPdf={traceIsPdf}
            />
          </div>
        )}
      </div>

      <LatestHistoryCard latestHistory={latestHistory} selectedField={selectedField} />

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
      <FieldHistoryList fieldHistory={fieldHistory} />
    </div>
  )
}
