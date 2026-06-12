import React from 'react'
import {
  Alert,
  Button,
  Card,
  Col,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Steps,
  Tag,
  TreeSelect,
  Typography,
} from 'antd'
import { UserAddOutlined } from '@ant-design/icons'
import { appThemeToken } from '../../../styles/themeTokens'

const { Text } = Typography
const { Step } = Steps

const ADD_PATIENT_STEPS = [
  { title: '基本信息', description: '患者基础资料' },
  { title: '医疗信息', description: '诊断和病史' },
  { title: '确认保存', description: '信息确认' }
]

const BasicInfoStep = ({
  isEditing,
  departmentLoading,
  departmentTreeData,
}) => (
  <Row gutter={16}>
    <Col span={12}>
      <Form.Item label="患者姓名" name="name" rules={[{ required: true, message: '请输入患者姓名' }]}>
        <Input placeholder="请输入患者姓名" />
      </Form.Item>
    </Col>
    <Col span={6}>
      <Form.Item label="性别" name="gender" rules={[{ required: true, message: '请选择性别' }]}>
        <Select placeholder="选择性别">
          <Select.Option value="男">男</Select.Option>
          <Select.Option value="女">女</Select.Option>
        </Select>
      </Form.Item>
    </Col>
    <Col span={6}>
      <Form.Item label="年龄" name="age" rules={[{ required: true, message: '请输入年龄' }]}>
        <InputNumber placeholder="年龄" min={0} max={150} style={{ width: '100%' }} />
      </Form.Item>
    </Col>
    <Col span={12}>
      <Form.Item label="联系电话" name="phone">
        <Input placeholder="请输入联系电话" />
      </Form.Item>
    </Col>
    <Col span={12}>
      <Form.Item label="身份证号" name="idCard">
        <Input placeholder="请输入身份证号" />
      </Form.Item>
    </Col>
    <Col span={12}>
      <Form.Item
        label="所属科室"
        name="department"
        rules={isEditing ? [] : [{ required: true, message: '请选择科室' }]}
      >
        <TreeSelect
          placeholder="选择科室"
          showSearch
          treeDefaultExpandAll
          loading={departmentLoading}
          treeData={departmentTreeData}
          filterTreeNode={(input, treeNode) => treeNode.title.toLowerCase().includes(input.toLowerCase())}
        />
      </Form.Item>
    </Col>
    <Col span={12}>
      <Form.Item label="主治医生" name="doctor">
        <Input placeholder="请输入主治医生" />
      </Form.Item>
    </Col>
    <Col span={24}>
      <Form.Item label="住址" name="address">
        <Input.TextArea placeholder="请输入详细住址" rows={2} />
      </Form.Item>
    </Col>
  </Row>
)

const MedicalInfoStep = ({ diagnosisOptions }) => (
  <Row gutter={16}>
    <Col span={12}>
      <Form.Item label="主要诊断" name="diagnosis">
        <Select mode="tags" placeholder="输入或选择诊断" style={{ width: '100%' }}>
          {diagnosisOptions.map(diagnosis => (
            <Select.Option key={diagnosis} value={diagnosis}>{diagnosis}</Select.Option>
          ))}
        </Select>
      </Form.Item>
    </Col>
    <Col span={12}>
      <Form.Item label="ICD编码" name="icdCodes">
        <Select mode="tags" placeholder="输入ICD编码" />
      </Form.Item>
    </Col>
    <Col span={24}>
      <Form.Item label="既往病史" name="medicalHistory">
        <Input.TextArea placeholder="请输入既往病史" rows={3} />
      </Form.Item>
    </Col>
    <Col span={24}>
      <Form.Item label="过敏史" name="allergyHistory">
        <Input.TextArea placeholder="请输入过敏史" rows={2} />
      </Form.Item>
    </Col>
    <Col span={24}>
      <Form.Item label="当前用药" name="currentMedication">
        <Input.TextArea placeholder="请输入当前用药情况" rows={3} />
      </Form.Item>
    </Col>
    <Col span={24}>
      <Form.Item label="备注" name="notes">
        <Input.TextArea placeholder="其他备注信息" rows={2} />
      </Form.Item>
    </Col>
  </Row>
)

const ConfirmInfoStep = ({ form, getDepartmentNameById }) => {
  const diagnosis = form.getFieldValue('diagnosis') || []

  return (
    <div>
      <Alert message="请确认患者信息" description="请仔细核对以下信息，确认无误后点击保存。" type="info" showIcon style={{ marginBottom: 16 }} />
      <Card size="small" title="基本信息">
        <Row gutter={16}>
          <Col span={8}><Text strong>姓名：</Text><Text>{form.getFieldValue('name')}</Text></Col>
          <Col span={8}><Text strong>性别：</Text><Text>{form.getFieldValue('gender')}</Text></Col>
          <Col span={8}><Text strong>年龄：</Text><Text>{form.getFieldValue('age')}岁</Text></Col>
          <Col span={12}><Text strong>科室：</Text><Text>{getDepartmentNameById(form.getFieldValue('department'))}</Text></Col>
          <Col span={12}><Text strong>主治医生：</Text><Text>{form.getFieldValue('doctor') || '未填写'}</Text></Col>
        </Row>
      </Card>
      <Card size="small" title="医疗信息" style={{ marginTop: 16 }}>
        <Row gutter={16}>
          <Col span={24}>
            <Text strong>主要诊断：</Text>
            <div style={{ marginTop: 4 }}>
              {diagnosis.map(item => <Tag key={item} color="blue">{item}</Tag>)}
              {diagnosis.length === 0 && <Text type="secondary">未填写</Text>}
            </div>
          </Col>
        </Row>
      </Card>
    </div>
  )
}

const AddPatientModal = ({
  open,
  isEditing,
  step,
  form,
  loading,
  diagnosisOptions,
  departmentLoading,
  departmentTreeData,
  getDepartmentNameById,
  onCancel,
  onPrev,
  onNext,
}) => (
  <Modal
    title={
      <Space>
        <UserAddOutlined />
        {isEditing ? '修改患者信息' : '新建患者'}
      </Space>
    }
    open={open}
    onCancel={onCancel}
    footer={[
      <Button key="cancel" onClick={onCancel}>取消</Button>,
      step > 0 && <Button key="prev" onClick={onPrev}>上一步</Button>,
      <Button key="next" type="primary" onClick={onNext} loading={loading} style={{ backgroundColor: appThemeToken.colorPrimary, borderColor: appThemeToken.colorPrimary }}>
        {step === 2 ? (isEditing ? '更新' : '保存') : '下一步'}
      </Button>
    ].filter(Boolean)}
    width={800}
    destroyOnHidden
  >
    <Steps current={step} style={{ marginBottom: 24 }}>
      {ADD_PATIENT_STEPS.map(item => (
        <Step key={item.title} title={item.title} description={item.description} />
      ))}
    </Steps>

    <Form form={form} layout="vertical">
      {step === 0 && (
        <BasicInfoStep
          isEditing={isEditing}
          departmentLoading={departmentLoading}
          departmentTreeData={departmentTreeData}
        />
      )}
      {step === 1 && <MedicalInfoStep diagnosisOptions={diagnosisOptions} />}
      {step === 2 && <ConfirmInfoStep form={form} getDepartmentNameById={getDepartmentNameById} />}
    </Form>
  </Modal>
)

export default AddPatientModal
