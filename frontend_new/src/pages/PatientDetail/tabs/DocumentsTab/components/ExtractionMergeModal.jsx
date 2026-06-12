import React from 'react'
import { Button, Modal, Space, Typography } from 'antd'
import { CheckCircleOutlined } from '@ant-design/icons'
import { appThemeToken } from '../../../../../styles/themeTokens'

const { Text, Paragraph } = Typography

const ExtractionMergeModal = ({
  open,
  extractResult,
  merging,
  onCancel,
  onConfirm,
}) => (
  <Modal
    title={
      <Space>
        <CheckCircleOutlined style={{ color: appThemeToken.colorSuccess }} />
        <span>AI 抽取完成</span>
      </Space>
    }
    open={open}
    onCancel={onCancel}
    footer={[
      <Button key="cancel" onClick={onCancel}>
        暂不合并
      </Button>,
      <Button
        key="confirm"
        type="primary"
        onClick={onConfirm}
        loading={merging}
      >
        确认合并到患者病历
      </Button>
    ]}
    width={500}
  >
    <div style={{ padding: '16px 0' }}>
      <Paragraph>
        已成功从文档中抽取 <Text strong style={{ color: appThemeToken.colorPrimary }}>{extractResult?.fields_count || 0}</Text> 个病历字段。
      </Paragraph>
      <Paragraph type="secondary">
        是否将抽取的数据合并到患者的电子病历中？
      </Paragraph>
      <Paragraph type="secondary" style={{ fontSize: 12 }}>
        提示：合并后，新抽取的数据将覆盖现有相同字段的值。如有冲突，可在病历变更日志中查看。
      </Paragraph>
    </div>
  </Modal>
)

export default ExtractionMergeModal
