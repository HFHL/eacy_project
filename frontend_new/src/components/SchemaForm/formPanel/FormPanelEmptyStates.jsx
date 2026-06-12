import React from 'react'
import { Button, Typography } from 'antd'
import { FormOutlined, PlusOutlined } from '@ant-design/icons'
import { appThemeToken } from '../../../styles/themeTokens'

const { Title, Text } = Typography

export const EmptyStateHint = () => (
  <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: appThemeToken.colorTextTertiary, padding: 40 }}>
    <FormOutlined style={{ fontSize: 16, marginBottom: 24, color: appThemeToken.colorTextTertiary }} />
    <Title level={4} style={{ color: appThemeToken.colorTextSecondary, marginBottom: 8 }}>
      请从左侧目录选择表单
    </Title>
    <Text type="secondary">
      点击任意表单名称，将展示该表单下的所有字段
    </Text>
  </div>
)

export const EmptyFormMask = ({ isRepeatable, onActivate }) => (
  <div
    style={{
      position: 'absolute',
      inset: 0,
      display: 'flex',
      alignItems: 'flex-start',
      justifyContent: 'center',
      background: 'rgba(255, 255, 255, 0.82)',
      backdropFilter: 'blur(4px)',
      borderRadius: 8,
      zIndex: 2,
      padding: '32px 24px 24px',
    }}
  >
    <div
      style={{
        width: 'min(420px, 100%)',
        textAlign: 'center',
        padding: '32px 24px',
        borderRadius: 16,
        border: `1px solid ${appThemeToken.colorPrimaryBorder}`,
        background: 'rgba(255, 255, 255, 0.95)',
        boxShadow: '0 16px 40px rgba(24, 144, 255, 0.08)',
      }}
    >
      <FormOutlined style={{ fontSize: 16, color: appThemeToken.colorPrimary, marginBottom: 16 }} />
      <Title level={4} style={{ marginBottom: 8 }}>
        {isRepeatable ? '当前表单暂无记录' : '当前表单尚未填写'}
      </Title>
      <Text type="secondary" style={{ display: 'block', marginBottom: 20 }}>
        点击下方按钮后，再进入对应空表单进行填写。
      </Text>
      <Button type="primary" icon={<PlusOutlined />} size="large" onClick={onActivate}>
        添加记录
      </Button>
    </div>
  </div>
)
