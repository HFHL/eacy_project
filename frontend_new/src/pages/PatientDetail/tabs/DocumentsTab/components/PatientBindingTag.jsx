import React, { useState } from 'react'
import { Button, Dropdown, Space, Tag, Typography, message } from 'antd'
import {
  DisconnectOutlined,
  DownOutlined,
  EyeOutlined,
  UserOutlined,
  UserSwitchOutlined,
} from '@ant-design/icons'
import { unarchiveDocument } from '../../../../../api/document'
import { appThemeToken } from '../../../../../styles/themeTokens'

const { Text } = Typography

const defaultTagStyle = { padding: '2px 8px', borderRadius: '4px', fontSize: '12px' }

const UnboundTagContent = () => (
  <Space size={4}>
    <UserOutlined style={{ fontSize: '12px' }} />
    <span>未绑定患者</span>
  </Space>
)

const PatientBindingTag = ({
  document,
  documentDetail,
  onArchivePatient,
  onChangePatient,
  onRefresh,
  onRefetchDocument,
  onViewPatient,
}) => {
  const [unbinding, setUnbinding] = useState(false)

  if (!document?.id) {
    return (
      <Tag color="default" style={defaultTagStyle}>
        <UnboundTagContent />
      </Tag>
    )
  }

  const linkedPatients = documentDetail?.linked_patients || []
  const patient = linkedPatients[0]

  if (!patient) {
    if (onArchivePatient) {
      return (
        <Button
          type="link"
          size="small"
          className="patient-binding-tag patient-binding-tag-unbound"
          style={{
            ...defaultTagStyle,
            height: 'auto',
            border: `1px solid ${appThemeToken.colorBorder}`,
            background: appThemeToken.colorFillTertiary,
            color: 'rgba(0,0,0,0.88)',
          }}
          onClick={(event) => {
            event.preventDefault()
            event.stopPropagation()
            onArchivePatient(document.id)
          }}
        >
          <UnboundTagContent />
        </Button>
      )
    }

    return (
      <Tag color="default" style={defaultTagStyle}>
        <UnboundTagContent />
      </Tag>
    )
  }

  const menuItems = [
    {
      key: 'view',
      label: '查看患者详情',
      icon: <EyeOutlined />,
      onClick: () => {
        if (patient?.patient_id) onViewPatient(patient)
      },
    },
    {
      key: 'change',
      label: '更换绑定患者',
      icon: <UserSwitchOutlined />,
      onClick: () => onChangePatient?.(document.id),
    },
    { type: 'divider' },
    {
      key: 'unbind',
      label: '解除绑定',
      icon: <DisconnectOutlined />,
      danger: true,
      disabled: unbinding,
      onClick: async () => {
        const hideLoading = message.loading('解除绑定中...', 0)
        setUnbinding(true)
        try {
          await unarchiveDocument(document.id, true)
          hideLoading()
          message.success('已解除绑定')
          await onRefetchDocument?.(document.id)
          onRefresh?.()
        } catch (error) {
          hideLoading()
          message.error(error?.response?.data?.message || error?.message || '解除绑定失败')
        } finally {
          setUnbinding(false)
        }
      },
    },
  ]

  return (
    <Dropdown menu={{ items: menuItems }} trigger={['click']}>
      <div
        className="patient-binding-tag"
        style={{
          cursor: 'pointer',
          display: 'inline-flex',
          alignItems: 'center',
          background: 'rgba(82, 196, 26, 0.1)',
          border: `1px solid ${appThemeToken.colorSuccess}`,
          padding: '2px 10px',
          borderRadius: '4px',
          color: appThemeToken.colorSuccess,
          transition: 'all 0.3s',
        }}
      >
        <Space size={4}>
          <UserOutlined style={{ fontSize: '12px' }} />
          <Text style={{ color: appThemeToken.colorSuccess, fontWeight: 500, fontSize: '12px' }}>
            {patient.patient_name} {patient.patient_code ? `(${patient.patient_code})` : ''}
          </Text>
          <DownOutlined style={{ fontSize: 12 }} />
        </Space>
      </div>
    </Dropdown>
  )
}

export default PatientBindingTag
