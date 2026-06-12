import React from 'react'
import { Button, Card, Modal, Space, Typography } from 'antd'
import { appThemeToken } from '../../../../../styles/themeTokens'

const { Text } = Typography

const ArrayFieldDetailModal = ({
  open,
  field,
  onClose,
  renderRecordFields,
}) => (
  <Modal
    title={field?.fieldName || '字段详情'}
    open={open}
    onCancel={onClose}
    footer={[
      <Button key="close" onClick={onClose}>
        关闭
      </Button>
    ]}
    width={800}
    className="array-field-detail-modal"
  >
    {field && field.isArray && (
      <div className="array-field-records">
        {field.rawValue.map((record, index) => (
          <Card
            key={index}
            size="small"
            title={
              <Space>
                <Text strong style={{ fontSize: 14 }}>
                  {field.fieldName} #{index + 1}
                </Text>
              </Space>
            }
            style={{
              marginBottom: 16,
              border: `1px solid ${appThemeToken.colorBorder}`,
              borderRadius: 6
            }}
          >
            {renderRecordFields(record, field.fieldId)}
          </Card>
        ))}
      </div>
    )}
  </Modal>
)

export default ArrayFieldDetailModal
