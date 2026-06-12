import React from 'react'
import { Button, Card, Drawer, Space, Tag, Typography } from 'antd'
import {
  CalendarOutlined,
  EnvironmentOutlined,
  FileTextOutlined,
  IdcardOutlined,
  LinkOutlined,
  ManOutlined,
  PhoneOutlined,
  WomanOutlined,
} from '@ant-design/icons'
import { appThemeToken } from '../../../../../styles/themeTokens'

const { Title, Text } = Typography

const PatientSummaryAvatar = ({ gender }) => {
  const isFemale = gender === '女' || gender === '女性'

  return (
    <div style={{
      width: 48,
      height: 48,
      borderRadius: '50%',
      background: appThemeToken.colorPrimaryBg,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      flexShrink: 0
    }}>
      {isFemale
        ? <WomanOutlined style={{ fontSize: 16, color: appThemeToken.colorError }} />
        : <ManOutlined style={{ fontSize: 16, color: appThemeToken.colorPrimary }} />}
    </div>
  )
}

const InfoRow = ({ icon, label, children }) => (
  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
    {icon}
    <Text type="secondary">{label}</Text>
    {children}
  </div>
)

const PatientDetailDrawer = ({
  open,
  patient,
  onClose,
}) => (
  <Drawer
    title="患者详情"
    placement="right"
    width={400}
    open={open}
    onClose={onClose}
    closable
    destroyOnHidden
    footer={
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
        <Button onClick={onClose}>
          关闭
        </Button>
        {patient?.patient_id && (
          <Button
            type="primary"
            icon={<LinkOutlined />}
            onClick={() => window.open(`/patient/detail/${patient.patient_id}`, '_blank')}
          >
            查看完整档案
          </Button>
        )}
      </div>
    }
  >
    {patient && (
      <div style={{ padding: '0 4px' }}>
        <Card size="small" style={{ marginBottom: 16 }}>
          <Space align="start" size={12}>
            <PatientSummaryAvatar gender={patient.gender} />
            <div style={{ flex: 1, minWidth: 0 }}>
              <Title level={4} style={{ margin: 0, marginBottom: 4 }}>
                {patient.patient_name || '--'}
              </Title>
              <Space size={8} style={{ marginBottom: 4 }}>
                <Text type="secondary">{patient.gender || '--'}</Text>
                <Text type="secondary">
                  {patient.age != null && patient.age !== '' ? `${patient.age}岁` : '--'}
                </Text>
              </Space>
              <Space>
                <Text type="secondary" copyable={{ text: patient.patient_code || '' }}>
                  {patient.patient_code || '--'}
                </Text>
              </Space>
            </div>
          </Space>
        </Card>

        <Card size="small" title="基本信息" style={{ marginBottom: 16 }}>
          <Space direction="vertical" style={{ width: '100%' }} size={12}>
            <InfoRow
              icon={<CalendarOutlined style={{ color: appThemeToken.colorTextTertiary, width: 16 }} />}
              label="出生日期："
            >
              <Text>{patient.birth_date || '--'}</Text>
            </InfoRow>
            <InfoRow
              icon={<PhoneOutlined style={{ color: appThemeToken.colorTextTertiary, width: 16 }} />}
              label="联系电话："
            >
              <Text>{patient.phone || '--'}</Text>
            </InfoRow>
            <InfoRow
              icon={<IdcardOutlined style={{ color: appThemeToken.colorTextTertiary, width: 16 }} />}
              label="身份证号："
            >
              <Text>{patient.id_card || '--'}</Text>
            </InfoRow>
            <InfoRow
              icon={<EnvironmentOutlined style={{ color: appThemeToken.colorTextTertiary, width: 16 }} />}
              label="地址："
            >
              <Text style={{ flex: 1 }}>{patient.address || '--'}</Text>
            </InfoRow>
            {(patient.department || patient.attending_doctor) && (
              <>
                <InfoRow label="科室：">
                  <Text>{patient.department || '--'}</Text>
                </InfoRow>
                <InfoRow label="主治医生：">
                  <Text>{patient.attending_doctor || '--'}</Text>
                </InfoRow>
              </>
            )}
          </Space>
        </Card>

        <Card size="small" title="诊断信息" style={{ marginBottom: 16 }}>
          {(patient.diagnoses && patient.diagnoses.length > 0) ? (
            <Space wrap size={[8, 8]}>
              {patient.diagnoses.map((diagnosis, index) => (
                <Tag key={index} color="red" style={{ border: `1px solid ${appThemeToken.colorError}`, marginBottom: 4 }}>
                  {diagnosis}
                </Tag>
              ))}
            </Space>
          ) : (
            <Text type="secondary">--</Text>
          )}
        </Card>

        <Card size="small" title="档案统计">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <FileTextOutlined style={{ color: appThemeToken.colorPrimary, fontSize: 16 }} />
            <Text type="secondary">关联文档：</Text>
            <Text strong>{patient.document_count != null ? patient.document_count : '--'}</Text>
          </div>
        </Card>
      </div>
    )}
  </Drawer>
)

export default PatientDetailDrawer
