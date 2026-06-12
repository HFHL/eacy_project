import React from 'react'
import { Form, Input, InputNumber, Switch } from 'antd'

import { SHOW_PATTERN_FIELD } from './fieldConfigSettings'
import { SectionTitle } from './SectionTitle'

export const ValidationSection = () => (
  <>
    <SectionTitle title="验证规则" />

    <Form.Item
      label="必填"
      name="isRequired"
      valuePropName="checked"
    >
      <Switch checkedChildren="必填" unCheckedChildren="可选" />
    </Form.Item>

    <Form.Item
      label="可为空"
      name="isNullable"
      valuePropName="checked"
    >
      <Switch checkedChildren="是" unCheckedChildren="否" />
    </Form.Item>

    <Form.Item label="最小值/长度" name="minimum">
      <InputNumber placeholder="不限制" style={{ width: '100%' }} />
    </Form.Item>

    <Form.Item label="最大值/长度" name="maximum">
      <InputNumber placeholder="不限制" style={{ width: '100%' }} />
    </Form.Item>

    <Form.Item
      label="默认值"
      name="defaultValue"
      tooltip="字段的默认值"
    >
      <Input placeholder="请输入默认值" />
    </Form.Item>

    {SHOW_PATTERN_FIELD && (
      <Form.Item label="正则表达式" name="pattern">
        <Input placeholder="请输入正则表达式" />
      </Form.Item>
    )}
  </>
)
