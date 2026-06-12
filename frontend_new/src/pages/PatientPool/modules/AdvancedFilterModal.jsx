import React from 'react'
import {
  Alert,
  Button,
  Col,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Row,
  Select,
  Space,
  Tag,
  Typography,
} from 'antd'
import { appThemeToken } from '../../../styles/themeTokens'

const { Text } = Typography
const { RangePicker } = DatePicker

const hasActiveFilters = (advancedFilters) => (
  advancedFilters.diagnosisKeywords ||
  advancedFilters.dateRange ||
  advancedFilters.projectStatus?.length > 0 ||
  advancedFilters.docCountMin !== null ||
  advancedFilters.docCountMax !== null
)

const AdvancedFilterPreview = ({ advancedFilters }) => {
  if (!hasActiveFilters(advancedFilters)) return null

  return (
    <Alert
      message="当前已应用的高级筛选"
      description={
        <Space wrap>
          {advancedFilters.diagnosisKeywords && (
            <Tag color="blue">诊断: {advancedFilters.diagnosisKeywords}</Tag>
          )}
          {advancedFilters.dateRange && (
            <Tag color="green">
              时间: {advancedFilters.dateRange[0]?.format('YYYY-MM-DD')} ~ {advancedFilters.dateRange[1]?.format('YYYY-MM-DD')}
            </Tag>
          )}
          {advancedFilters.projectStatus?.map(status => (
            <Tag key={status} color="purple">
              {status === 'unassigned' ? '未分配项目' : status === 'single' ? '单项目' : '多项目'}
            </Tag>
          ))}
          {(advancedFilters.docCountMin !== null || advancedFilters.docCountMax !== null) && (
            <Tag color="orange">
              文档: {advancedFilters.docCountMin ?? 0} ~ {advancedFilters.docCountMax ?? '∞'} 份
            </Tag>
          )}
        </Space>
      }
      type="info"
      showIcon
      style={{ marginTop: 16 }}
    />
  )
}

const AdvancedFilterModal = ({
  open,
  form,
  advancedFilters,
  onCancel,
  onReset,
  onApply,
}) => (
  <Modal
    title="高级筛选设置"
    open={open}
    onCancel={onCancel}
    footer={[
      <Button key="reset" onClick={onReset}>重置</Button>,
      <Button key="cancel" onClick={onCancel}>取消</Button>,
      <Button
        key="apply"
        type="primary"
        style={{ backgroundColor: appThemeToken.colorPrimary, borderColor: appThemeToken.colorPrimary }}
        onClick={() => onApply(form.getFieldsValue())}
      >
        应用筛选
      </Button>
    ]}
    width={800}
  >
    <Form
      form={form}
      layout="vertical"
      initialValues={{
        diagnosisKeywords: advancedFilters.diagnosisKeywords,
        dateRange: advancedFilters.dateRange,
        projectStatus: advancedFilters.projectStatus,
        docCountMin: advancedFilters.docCountMin,
        docCountMax: advancedFilters.docCountMax
      }}
    >
      <Row gutter={16}>
        <Col span={12}>
          <Form.Item
            name="diagnosisKeywords"
            label="诊断关键词"
            tooltip="输入诊断关键词，多个关键词用逗号分隔，任一匹配即可"
          >
            <Input placeholder="例如：肺癌,糖尿病（逗号分隔）" />
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item name="dateRange" label="创建时间范围" tooltip="筛选患者创建时间在此范围内的记录">
            <RangePicker style={{ width: '100%' }} />
          </Form.Item>
        </Col>
      </Row>
      <Row gutter={16}>
        <Col span={12}>
          <Form.Item name="projectStatus" label="项目状态" tooltip="根据患者参与的项目数量筛选">
            <Select mode="multiple" placeholder="选择项目状态" allowClear>
              <Select.Option value="unassigned">未分配项目</Select.Option>
              <Select.Option value="single">单项目患者</Select.Option>
              <Select.Option value="multiple">多项目患者</Select.Option>
            </Select>
          </Form.Item>
        </Col>
        <Col span={12}>
          <Form.Item label="文档数量范围" tooltip="根据患者关联的文档数量筛选">
            <Space>
              <Form.Item name="docCountMin" noStyle>
                <InputNumber placeholder="最少" min={0} style={{ width: 100 }} />
              </Form.Item>
              <Text>-</Text>
              <Form.Item name="docCountMax" noStyle>
                <InputNumber placeholder="最多" min={0} style={{ width: 100 }} />
              </Form.Item>
              <Text>份</Text>
            </Space>
          </Form.Item>
        </Col>
      </Row>
      <AdvancedFilterPreview advancedFilters={advancedFilters} />
    </Form>
  </Modal>
)

export default AdvancedFilterModal
