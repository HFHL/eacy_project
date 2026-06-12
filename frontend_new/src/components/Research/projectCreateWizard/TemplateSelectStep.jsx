import React from 'react'
import { Alert, Card, Radio, Space, Spin, Tag, Typography } from 'antd'

import { appThemeToken } from '../../../styles/themeTokens'

const { Text } = Typography

export const TemplateSelectStep = ({
  normalizedTemplates,
  selectedTemplateId,
  setSelectedTemplateId,
  templatesLoading,
}) => (
  <div>
    <Alert
      message="选择 CRF 模板"
      description="请选择一个基础模板作为项目默认抽取模板，创建后系统会生成项目内 CRF 副本。"
      type="info"
      showIcon
      style={{ marginBottom: 16 }}
    />
    {templatesLoading ? (
      <div style={{ textAlign: 'center', padding: 24 }}>
        <Spin />
      </div>
    ) : normalizedTemplates.length === 0 ? (
      <Alert
        message="暂无可用 CRF 模板"
        description="请先在 CRF 模板管理中创建模板后再新建项目。"
        type="warning"
        showIcon
      />
    ) : (
      <Space direction="vertical" style={{ width: '100%' }} size={10}>
        {normalizedTemplates.map((template) => {
          const checked = selectedTemplateId === template.normalizedId
          return (
            <Card
              key={template.normalizedId}
              size="small"
              hoverable
              onClick={() => setSelectedTemplateId(template.normalizedId)}
              style={{
                cursor: 'pointer',
                borderColor: checked ? appThemeToken.colorPrimary : undefined,
                background: checked ? appThemeToken.colorPrimaryBg : undefined,
              }}
            >
              <Radio
                checked={checked}
                onChange={() => setSelectedTemplateId(template.normalizedId)}
                style={{ width: '100%' }}
              >
                <Space direction="vertical" size={2} style={{ width: '100%' }}>
                  <Text strong>{template.template_name || template.name || '未命名模板'}</Text>
                  <Space size={8}>
                    {template.category ? <Tag color="blue">{template.category}</Tag> : null}
                    {template.is_system ? <Tag>系统模板</Tag> : null}
                  </Space>
                </Space>
              </Radio>
            </Card>
          )
        })}
      </Space>
    )}
  </div>
)
