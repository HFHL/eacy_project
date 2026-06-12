import React from 'react'
import { Alert, Form, Input, Space, Switch, Typography } from 'antd'

import {
  SHOW_CONFIG_NOTICE,
  SHOW_FIELD_INFO,
  SHOW_FIELD_REUSE_SECTION,
  SHOW_FORMAT_FIELD,
  SHOW_PRIMARY_FIELD,
} from './fieldConfigSettings'
import { SectionTitle } from './SectionTitle'

const { Text } = Typography

export const AdvancedFieldSection = ({ field }) => (
  <>
    <SectionTitle title="高级属性" />

    <Form.Item
      label="敏感字段"
      name="isSensitive"
      valuePropName="checked"
      tooltip="敏感字段将进行脱敏处理"
    >
      <Switch checkedChildren="敏感" unCheckedChildren="普通" />
    </Form.Item>

    {SHOW_PRIMARY_FIELD && (
      <Form.Item
        label="主键字段"
        name="isPrimary"
        valuePropName="checked"
        tooltip="主键字段用于数据去重"
      >
        <Switch checkedChildren="主键" unCheckedChildren="普通" />
      </Form.Item>
    )}

    <Form.Item
      label="可编辑"
      name="isEditable"
      valuePropName="checked"
    >
      <Switch checkedChildren="可编辑" unCheckedChildren="只读" />
    </Form.Item>

    {SHOW_FIELD_REUSE_SECTION && (
      <>
        <SectionTitle title="字段复用" />
        <Form.Item label="复用模式 (x-form-template)" name="reuseMode">
          <Input placeholder="full_reuse / original / copied_modified" />
        </Form.Item>
        <Form.Item label="来源表单 (source_form)" name="sourceForm">
          <Input placeholder="可选" />
        </Form.Item>
      </>
    )}

    {SHOW_FORMAT_FIELD && (
      <Form.Item
        label="格式化"
        name="format"
        tooltip="日期或字符串的格式化规则"
      >
        <Input placeholder="例如：yyyy-MM-dd、手机号、邮箱等" />
      </Form.Item>
    )}

    {SHOW_CONFIG_NOTICE && (
      <>
        <SectionTitle title="配置说明" />
        <Alert
          type="warning"
          showIcon
          message="以下能力暂未纳入运行时渲染"
          description="数据来源、合并绑定、枚举引用和扩展属性目前不参与 SchemaForm 渲染链路。为避免误导，相关编辑项已下线，后续会在契约收敛后再恢复。"
        />
      </>
    )}

    {SHOW_FIELD_INFO && (
      <>
        <SectionTitle title="字段信息" />
        {field.uid && (
          <Alert
            message={
              <Space direction="vertical" size={0}>
                <Text><strong>字段UID:</strong> {field.uid}</Text>
                {field.id && (
                  <Text type="secondary"><strong>字段ID:</strong> {field.id}</Text>
                )}
              </Space>
            }
            description="UID用于版本管理，确保数据兼容性。编辑时UID将保持不变。"
            type="info"
            showIcon
          />
        )}
      </>
    )}
  </>
)
