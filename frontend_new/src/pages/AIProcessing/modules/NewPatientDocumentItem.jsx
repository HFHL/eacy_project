import React from 'react'
import { Button, Checkbox, List, Space, Tooltip, Typography } from 'antd'
import { CodeOutlined, UserAddOutlined } from '@ant-design/icons'

const { Text } = Typography

const CARD_STYLE = {
  padding: '16px 12px',
  borderBottom: '1px solid #f0f0f0',
  borderRadius: '8px',
  margin: '8px 0',
  background: '#ffffff',
  boxShadow: '0 1px 3px rgba(0, 0, 0, 0.1)',
  transition: 'all 0.3s ease',
}

const ACTION_BUTTON_STYLE = {
  fontSize: 12,
  height: '24px',
  lineHeight: '24px',
}

const JSON_BUTTON_STYLE = {
  ...ACTION_BUTTON_STYLE,
  backgroundColor: '#f59e0b',
  borderColor: '#f59e0b',
  color: '#fff',
}

const CREATE_BUTTON_STYLE = {
  ...ACTION_BUTTON_STYLE,
  backgroundColor: '#6366f1',
  borderColor: '#6366f1',
}

const FieldValue = ({ label, value, wide = false }) => {
  if (!value || value === '--') return null

  return (
    <div style={wide ? { gridColumn: '1 / -1' } : undefined}>
      <Text style={{ fontSize: 11, color: '#9ca3af' }}>{label}：</Text>
      <Text style={{ fontSize: 12, color: '#374151', fontWeight: label === '姓名' ? 500 : undefined }}>
        {value}
      </Text>
    </div>
  )
}

const NewPatientDocumentItem = ({
  item,
  onCreatePatient,
  onDocumentClick,
  onPatientMatch,
  onSelectChange,
  onViewExtractionResult,
  processed,
  selected,
}) => (
  <List.Item
    style={{
      ...CARD_STYLE,
      opacity: processed ? 0 : 1,
      transform: processed ? 'translateX(100px)' : 'translateX(0)',
    }}
    className="patient-card"
  >
    <div style={{ width: '100%' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
        <Space>
          <Text style={{ fontSize: 12, color: '#6b7280' }}>
            📄 {item.fileName}
          </Text>
          <Text
            style={{ fontSize: 12, color: '#1677ff', cursor: 'pointer', textDecoration: 'underline' }}
            onClick={(event) => {
              event.stopPropagation()
              onDocumentClick(item)
            }}
          >
            查看
          </Text>
        </Space>
        <Checkbox
          checked={selected}
          onChange={(event) => {
            event.stopPropagation()
            onSelectChange(item.id, event.target.checked)
          }}
        />
      </div>

      <div style={{ background: '#f8fafc', padding: '12px', borderRadius: 6, marginBottom: 12, border: '1px solid #e5e7eb' }}>
        <Text style={{ fontSize: 11, color: '#9ca3af', marginBottom: 8, display: 'block' }}>
          将创建以下患者信息：
        </Text>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px' }}>
          <FieldValue label="姓名" value={item.name} />
          <FieldValue label="性别" value={item.gender} />
          <FieldValue label="年龄" value={item.age} />
          <FieldValue label="生日" value={item.birthDate} />
          <FieldValue label="电话" value={item.phone} />
          <FieldValue label="身份证号" value={item.idNumber} />
          <FieldValue label="地址" value={item.address} wide />
        </div>
      </div>

      <div style={{ textAlign: 'right', marginTop: 8, display: 'flex', gap: 6, justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', gap: 6 }}>
          <Button
            size="small"
            onClick={(event) => {
              event.stopPropagation()
              onPatientMatch(item)
            }}
            style={ACTION_BUTTON_STYLE}
          >
            匹配详情
          </Button>
          <Tooltip title="查看AI抽取的JSON结果">
            <Button
              size="small"
              icon={<CodeOutlined />}
              onClick={(event) => {
                event.stopPropagation()
                onViewExtractionResult(item.id, item.documentName)
              }}
              style={JSON_BUTTON_STYLE}
            >
              JSON
            </Button>
          </Tooltip>
        </div>
        <Button
          size="small"
          type="primary"
          icon={<UserAddOutlined />}
          onClick={(event) => {
            event.stopPropagation()
            onCreatePatient(item)
          }}
          style={CREATE_BUTTON_STYLE}
        >
          创建新患者
        </Button>
      </div>
    </div>
  </List.Item>
)

export default NewPatientDocumentItem
