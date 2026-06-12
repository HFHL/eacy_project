import React from 'react'
import { Button, Checkbox, List, Modal, Typography } from 'antd'
import { modalBodyPreset, modalWidthPreset } from '../../../styles/themeTokens'

const { Text } = Typography

const BatchExtractionModal = ({
  documents,
  getDocumentIcon,
  onCancel,
  open,
}) => {
  const pendingDocuments = documents.filter(document => document.status === 'pending')

  return (
    <Modal
      title="批量数据抽取"
      open={open}
      onCancel={onCancel}
      footer={[
        <Button key="cancel" onClick={onCancel}>
          取消
        </Button>,
        <Button key="extract" type="primary">
          开始抽取
        </Button>,
      ]}
      width={modalWidthPreset.standard}
      styles={modalBodyPreset}
    >
      <div>
        <Text>选择要抽取的文档：</Text>
        <div style={{ margin: '16px 0' }}>
          <List
            size="small"
            dataSource={pendingDocuments}
            renderItem={item => (
              <List.Item>
                <List.Item.Meta
                  avatar={getDocumentIcon(item.type)}
                  title={item.name}
                  description={item.category}
                />
                <Checkbox defaultChecked>选择</Checkbox>
              </List.Item>
            )}
          />
        </div>
        {pendingDocuments.length === 0 && (
          <div style={{ textAlign: 'center', padding: 20 }}>
            <Text type="secondary">暂无待处理的文档</Text>
          </div>
        )}
      </div>
    </Modal>
  )
}

export default BatchExtractionModal
