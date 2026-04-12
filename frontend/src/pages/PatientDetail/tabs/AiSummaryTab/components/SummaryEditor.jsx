/**
 * 综述编辑器组件
 * 负责AI病情综述的编辑功能
 */
import React from 'react'
import { Form, Input, Alert } from 'antd'

const { TextArea } = Input

const SummaryEditor = ({ summaryForm }) => {
  return (
    <div className="summary-editor">
      
      <Form form={summaryForm} layout="vertical">
        <Form.Item 
          name="content"
          rules={[{ required: true, message: '请输入病情综述内容' }]}
        >
          <TextArea 
            rows={20}
            placeholder={`请输入或编辑病情综述内容...

支持Markdown格式：
**患者基本情况**
张三，男性，45岁...

## 既往史
• 个人史：吸烟史20年...
• 家族史：父亲有肺癌病史...

## 诊疗时间线
**2024-01-08** - 初次就诊
• 用药记录建立...`}
            style={{ 
              fontSize: 14, 
              lineHeight: 1.6,
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif'
            }}
          />
        </Form.Item>
      </Form>
    </div>
  )
}

export default SummaryEditor