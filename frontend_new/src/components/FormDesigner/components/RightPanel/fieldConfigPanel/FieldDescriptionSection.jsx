import React from 'react'
import { Form, Input, Switch } from 'antd'

import { SectionTitle } from './SectionTitle'

const { TextArea } = Input

export const FieldDescriptionSection = () => (
  <>
    <SectionTitle title="字段说明" />

    <Form.Item
      label="字段说明"
      name="description"
      tooltip="字段的业务含义说明，用于前端tooltip显示"
    >
      <TextArea rows={2} placeholder="请输入字段说明" />
    </Form.Item>

    <Form.Item
      label="抽取提示词"
      name="extractionPrompt"
      tooltip="LLM抽取该字段时的指导提示词"
    >
      <TextArea rows={3} placeholder="请输入抽取提示词" />
    </Form.Item>

    <Form.Item
      label="不参与 AI 抽取"
      name="skipExtraction"
      valuePropName="checked"
      tooltip="开启后，自动抽取将跳过该字段，保留手工填写值"
    >
      <Switch checkedChildren="跳过" unCheckedChildren="参与" />
    </Form.Item>
  </>
)
