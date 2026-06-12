import React from 'react'
import { Form, Input, Select } from 'antd'

import { DISPLAY_TYPES } from '../../../core/constants'
import { isTableDisplayType } from '../../../utils/fieldContract'
import {
  SHOW_DATA_TYPE,
  SHOW_DISPLAY_NAME,
  SHOW_FIELD_ID,
  getDisplayTypeOptions,
} from './fieldConfigSettings'
import { SectionTitle } from './SectionTitle'

export const BasicFieldSection = ({ displayType, isOptionType }) => (
  <>
    <SectionTitle title="基础属性" />

    <Form.Item
      label="字段名称"
      name="name"
      rules={[{ required: true, message: '请输入字段名称' }]}
    >
      <Input placeholder="请输入字段名称" />
    </Form.Item>

    {SHOW_DISPLAY_NAME && (
      <Form.Item label="显示名称 (x-display-name)" name="displayName">
        <Input placeholder="用于界面展示" />
      </Form.Item>
    )}

    <Form.Item label="字段 UID (x-field-uid)" name="uid">
      <Input disabled placeholder="系统生成" />
    </Form.Item>

    {SHOW_FIELD_ID && (
      <Form.Item label="字段 ID (x-field-id)" name="fieldId">
        <Input placeholder="用于复用一致性校验" />
      </Form.Item>
    )}

    <Form.Item
      label="展示类型"
      name="displayType"
      rules={[{ required: true, message: '请选择展示类型' }]}
    >
      <Select placeholder="请选择展示类型">
        {getDisplayTypeOptions().map((option) => (
          <Select.Option key={option.value} value={option.value}>
            {option.label}
          </Select.Option>
        ))}
      </Select>
    </Form.Item>

    {SHOW_DATA_TYPE && (
      <Form.Item label="数据类型（自动推断）" name="dataType" tooltip="由展示类型自动推断，避免配置漂移">
        <Input disabled />
      </Form.Item>
    )}

    <Form.Item label="数据单位" name="unit" hidden={isTableDisplayType(displayType)}>
      <Input placeholder="例如：岁、kg、元" />
    </Form.Item>

    {displayType === DISPLAY_TYPES.FILE && (
      <Form.Item label="文件类型 (x-file-type)" name="fileType">
        <Input placeholder="如: pdf,image" />
      </Form.Item>
    )}

    {isOptionType && (
      <Form.Item
        label="选项值"
        name="options"
        rules={[{ required: true, message: '请配置选项值' }]}
        tooltip="多个选项用逗号分隔"
      >
        <Select
          mode="tags"
          placeholder="输入选项，按回车添加"
          style={{ width: '100%' }}
        />
      </Form.Item>
    )}
  </>
)
