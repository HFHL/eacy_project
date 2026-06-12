import React from 'react'
import { Button, Col, DatePicker, Form, Input, Modal, Row, Select, Space, Typography } from 'antd'
import { EditOutlined, SaveOutlined } from '@ant-design/icons'
import { PATIENT_DEPARTMENT_OPTIONS } from '@/constants/patientDepartments'
import { modalBodyPreset, modalWidthPreset } from '../../../styles/themeTokens'
import { maskAddress, maskIdCard, maskName, maskPhone } from '@/utils/sensitiveUtils'

const { Text } = Typography
const { TextArea } = Input

const PatientEditModal = ({
  form,
  handleSavePatient,
  open,
  patientInfo,
  sensitiveModified,
  setOpen,
  setSensitiveModified,
  token,
}) => {
  const closeModal = () => setOpen(false)

  const resetSensitiveField = (field, value) => {
    form.setFieldValue(field, value)
    setSensitiveModified(prev => ({ ...prev, [field]: false }))
  }

  const markSensitiveFieldModified = (field) => {
    form.setFieldValue(field, '')
    setSensitiveModified(prev => ({ ...prev, [field]: true }))
  }

  return (
    <Modal
      title={(
        <Space>
          <EditOutlined />
          <Text strong>编辑患者信息</Text>
          <Text type="secondary">- {patientInfo.name ? maskName(patientInfo.name) : '-'}</Text>
        </Space>
      )}
      open={open}
      onCancel={closeModal}
      footer={[
        <Button key="cancel" onClick={closeModal}>
          取消
        </Button>,
        <Button
          key="save"
          type="primary"
          icon={<SaveOutlined />}
          onClick={async () => {
            const success = await handleSavePatient(form, { sensitiveModified })
            if (success) closeModal()
          }}
        >
          保存更改
        </Button>,
      ]}
      width={modalWidthPreset.wide}
      styles={modalBodyPreset}
      style={{ top: 20 }}
    >
      <Form form={form} layout="vertical">
        <Row gutter={16}>
          <Col span={24}>
            <div style={{ marginBottom: 16, paddingBottom: 8, borderBottom: `1px solid ${token.colorBorder}` }}>
              <Text strong style={{ color: token.colorPrimary }}>基本信息</Text>
            </div>
          </Col>
          <Col span={12}>
            <Form.Item label="姓名" name="name" rules={[{ required: true, message: '请输入姓名' }]}>
              <Input placeholder="请输入患者姓名" />
            </Form.Item>
          </Col>
          <Col span={12}>
            <Form.Item label="性别" name="gender">
              <Select placeholder="请选择性别">
                <Select.Option value="男">男</Select.Option>
                <Select.Option value="女">女</Select.Option>
                <Select.Option value="不详">不详</Select.Option>
              </Select>
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label="出生日期" name="birthDate">
              <DatePicker style={{ width: '100%' }} placeholder="选择出生日期" format="YYYY-MM-DD" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label="年龄" name="age">
              <Input placeholder="请输入年龄" suffix="岁" type="number" min={0} max={150} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item
              label="联系电话"
              name="phone"
              rules={[{
                validator: (_, value) => {
                  if (!sensitiveModified.phone) return Promise.resolve()
                  if (value == null || String(value).trim() === '') return Promise.resolve()
                  if (!/^1[3-9]\d{9}$/.test(String(value).trim())) return Promise.reject(new Error('请输入正确的手机号码'))
                  return Promise.resolve()
                },
              }]}
            >
              <Input
                placeholder="请输入手机号码"
                onFocus={() => markSensitiveFieldModified('phone')}
                addonAfter={sensitiveModified.phone ? (
                  <a onClick={() => resetSensitiveField('phone', maskPhone(patientInfo.phone))}>撤销</a>
                ) : null}
                title="脱敏字段：点击后清空并视为修改，可重新输入或点撤销恢复"
              />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item
              label="身份证号"
              name="idCard"
              rules={[{
                validator: (_, value) => {
                  if (!sensitiveModified.idCard) return Promise.resolve()
                  if (value == null || String(value).trim() === '') return Promise.resolve()
                  if (!/(^\d{15}$)|(^\d{18}$)|(^\d{17}(\d|X|x)$)/.test(String(value).trim())) return Promise.reject(new Error('请输入正确的身份证号'))
                  return Promise.resolve()
                },
              }]}
            >
              <Input
                placeholder="请输入身份证号码"
                onFocus={() => markSensitiveFieldModified('idCard')}
                addonAfter={sensitiveModified.idCard ? (
                  <a onClick={() => resetSensitiveField('idCard', maskIdCard(patientInfo.idCard))}>撤销</a>
                ) : null}
                title="脱敏字段：点击后清空并视为修改，可重新输入或点撤销恢复"
              />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item label="住址" name="address">
              <Input
                placeholder="请输入详细住址"
                onFocus={() => markSensitiveFieldModified('address')}
                addonAfter={sensitiveModified.address ? (
                  <a onClick={() => resetSensitiveField('address', maskAddress(patientInfo.address))}>撤销</a>
                ) : null}
                title="脱敏字段：点击后清空并视为修改，可重新输入或点撤销恢复"
              />
            </Form.Item>
          </Col>
          <Col span={24}>
            <div style={{ margin: '16px 0', paddingBottom: 8, borderBottom: `1px solid ${token.colorBorder}` }}>
              <Text strong style={{ color: token.colorPrimary }}>医疗信息</Text>
            </div>
          </Col>
          <Col span={8}>
            <Form.Item label="科室" name="department">
              <Select placeholder="请选择科室" options={PATIENT_DEPARTMENT_OPTIONS} />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label="主治医生" name="doctor">
              <Input placeholder="请输入主治医生姓名" />
            </Form.Item>
          </Col>
          <Col span={8}>
            <Form.Item label="入组日期" name="admissionDate">
              <DatePicker style={{ width: '100%' }} placeholder="选择入组日期" format="YYYY-MM-DD" />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item label="主要诊断" name="diagnosis">
              <Select
                mode="tags"
                placeholder="请输入诊断信息，支持添加多个"
                style={{ width: '100%' }}
                tokenSeparators={[',']}
                options={[
                  { value: '肺腺癌', label: '肺腺癌' },
                  { value: '高血压', label: '高血压' },
                  { value: '糖尿病', label: '糖尿病' },
                  { value: '冠心病', label: '冠心病' },
                  { value: '脑梗塞', label: '脑梗塞' },
                  { value: '肝硬化', label: '肝硬化' },
                  { value: '肾功能不全', label: '肾功能不全' },
                ]}
              />
            </Form.Item>
          </Col>
          <Col span={24}>
            <Form.Item label="备注" name="notes">
              <TextArea rows={3} placeholder="请输入备注信息，如特殊情况、注意事项等..." showCount maxLength={500} />
            </Form.Item>
          </Col>
        </Row>
      </Form>
    </Modal>
  )
}

export default PatientEditModal
