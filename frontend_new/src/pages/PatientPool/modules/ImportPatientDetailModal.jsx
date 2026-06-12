import React from 'react'
import { Alert, Button, Card, Col, Modal, Row, Space, Tag, Typography } from 'antd'
import { EyeOutlined } from '@ant-design/icons'
import { maskName } from '../../../utils/sensitiveUtils'
import { appThemeToken } from '../../../styles/themeTokens'

const { Text } = Typography

const TextBlock = ({ children }) => (
  <div style={{
    marginTop: 8,
    padding: '8px 12px',
    backgroundColor: appThemeToken.colorFillTertiary,
    borderRadius: 4,
    minHeight: 40
  }}>
    <Text style={{ whiteSpace: 'pre-wrap' }}>{children || '-'}</Text>
  </div>
)

const ImportPatientDetailModal = ({
  open,
  patient,
  onClose,
}) => (
  <Modal
    title={
      <Space>
        <EyeOutlined />
        <span>患者详细信息</span>
        {patient && (
          <Tag color={patient.status === 'success' ? 'success' : 'error'}>
            {patient.status === 'success' ? '验证通过' : '验证失败'}
          </Tag>
        )}
      </Space>
    }
    open={open}
    onCancel={onClose}
    footer={[
      <Button key="close" type="primary" onClick={onClose}>
        关闭
      </Button>
    ]}
    width={800}
  >
    {patient && (
      <div>
        {patient.status === 'error' && (
          <Alert
            message="数据验证失败"
            description={<div>{patient.errors.map((err, idx) => <div key={idx}>• {err}</div>)}</div>}
            type="error"
            showIcon
            style={{ marginBottom: 16 }}
          />
        )}

        {patient.warnings && patient.warnings.length > 0 && (
          <Alert
            message="数据警告"
            description={<div>{patient.warnings.map((warn, idx) => <div key={idx}>• {warn}</div>)}</div>}
            type="warning"
            showIcon
            style={{ marginBottom: 16 }}
          />
        )}

        <Card title="基本信息" size="small" style={{ marginBottom: 16 }}>
          <Row gutter={[16, 16]}>
            <Col span={4}><Text strong>序号：</Text><div><Text>{patient.rowIndex}</Text></div></Col>
            <Col span={4}><Text strong>Excel行号：</Text><div><Text>{patient.excelRow}</Text></div></Col>
            <Col span={8}><Text strong>患者姓名：</Text><div><Text>{patient.name ? maskName(patient.name) : '-'}</Text></div></Col>
            <Col span={8}><Text strong>性别：</Text><div><Text>{patient.gender || '-'}</Text></div></Col>
            <Col span={8}><Text strong>年龄：</Text><div><Text>{patient.age || '-'}</Text></div></Col>
            <Col span={8}><Text strong>身份证号：</Text><div><Text>{patient.idCard || '-'}</Text></div></Col>
            <Col span={8}><Text strong>联系电话：</Text><div><Text>{patient.phone || '-'}</Text></div></Col>
            <Col span={24}><Text strong>住址：</Text><div><Text>{patient.address || '-'}</Text></div></Col>
          </Row>
        </Card>

        <Card title="医疗信息" size="small" style={{ marginBottom: 16 }}>
          <Row gutter={[16, 16]}>
            <Col span={12}><Text strong>科室：</Text><div><Text>{patient.department || '-'}</Text></div></Col>
            <Col span={12}><Text strong>主治医师：</Text><div><Text>{patient.doctor || '-'}</Text></div></Col>
            <Col span={24}><Text strong>主要诊断：</Text><div style={{ marginTop: 8 }}><Text>{patient.diagnosis || '-'}</Text></div></Col>
            <Col span={24}><Text strong>ICD编码：</Text><div style={{ marginTop: 8 }}><Text>{patient.icdCodes || '-'}</Text></div></Col>
          </Row>
        </Card>

        <Card title="病史信息" size="small">
          <Row gutter={[16, 16]}>
            <Col span={24}><Text strong>既往病史：</Text><TextBlock>{patient.medicalHistory}</TextBlock></Col>
            <Col span={24}><Text strong>过敏史：</Text><TextBlock>{patient.allergyHistory}</TextBlock></Col>
            <Col span={24}><Text strong>当前用药：</Text><TextBlock>{patient.currentMedication}</TextBlock></Col>
            <Col span={24}><Text strong>备注：</Text><TextBlock>{patient.notes}</TextBlock></Col>
          </Row>
        </Card>
      </div>
    )}
  </Modal>
)

export default ImportPatientDetailModal
