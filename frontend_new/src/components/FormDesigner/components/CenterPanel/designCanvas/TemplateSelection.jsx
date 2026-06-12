import React from 'react'
import { Card, Col, Row, Typography } from 'antd'

import { appThemeToken } from '../../../../../styles/themeTokens'
import { FORM_TEMPLATES } from './formTemplates'

const { Text, Title } = Typography

export const TemplateSelection = ({
  currentGroup,
  handleApplyTemplate,
  handleDragOver,
  handleDrop,
}) => (
  <div
    className="design-canvas design-canvas-group-mode"
    onDragOver={handleDragOver}
    onDrop={handleDrop}
    style={{ padding: 16 }}
  >
    <div style={{ marginBottom: 24 }}>
      <Title level={4} style={{ marginBottom: 8 }}>{currentGroup.name}</Title>
      <Text type="secondary">该表单暂无字段，请选择模板快速创建或从组件库拖拽添加</Text>
    </div>

    <div style={{ marginBottom: 32 }}>
      <Row gutter={[16, 16]}>
        {FORM_TEMPLATES.map((template) => (
          <Col xs={12} sm={8} md={6} lg={6} xl={4} key={template.id}>
            <Card
              hoverable
              style={{
                textAlign: 'center',
                border: template.id === 'custom'
                  ? `2px dashed ${appThemeToken.colorPrimary}`
                  : `1px solid ${appThemeToken.colorBorder}`,
                background: template.color || appThemeToken.colorBgContainer,
                height: '100%',
              }}
              styles={{ body: { padding: '16px 12px' } }}
              onClick={() => handleApplyTemplate(template)}
            >
              <div style={{ marginBottom: 8 }}>
                {template.icon}
              </div>
              <div style={{
                fontWeight: 500,
                marginBottom: 4,
                fontSize: 14,
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {template.name}
              </div>
              {template.fieldsCount && (
                <div style={{ fontSize: 12, color: appThemeToken.colorTextTertiary }}>
                  {template.fieldsCount}项指标
                </div>
              )}
            </Card>
          </Col>
        ))}
      </Row>
    </div>

    <div style={{
      textAlign: 'center',
      padding: '24px',
      background: appThemeToken.colorFillTertiary,
      borderRadius: 8,
      border: `1px dashed ${appThemeToken.colorBorder}`,
    }}>
      <Text type="secondary" style={{ fontSize: 14 }}>
        或者从左侧组件库拖拽组件到此处添加字段
      </Text>
    </div>
  </div>
)
