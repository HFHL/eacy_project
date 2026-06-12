import React from 'react'
import { Alert, Button, Checkbox, Col, Form, Modal, Row, Select, Space, Tag } from 'antd'
import { appThemeToken } from '../../../styles/themeTokens'

const hasExportFilters = (filters, advancedFilters) => (
  filters.search
  || filters.gender
  || filters.department
  || filters.projectStatus
  || advancedFilters.diagnosisKeywords
  || advancedFilters.dateRange
  || advancedFilters.projectStatus?.length > 0
  || advancedFilters.docCountMin !== null
  || advancedFilters.docCountMax !== null
)

const FilterSummary = ({ filters, advancedFilters }) => (
  <Space wrap size={[4, 4]}>
    {filters.search && <Tag color="blue">搜索: {filters.search}</Tag>}
    {filters.gender && <Tag color="blue">性别: {filters.gender}</Tag>}
    {filters.department && <Tag color="blue">科室已选</Tag>}
    {filters.projectStatus && (
      <Tag color="blue">
        项目: {filters.projectStatus === 'linked' ? '已关联' : '未关联'}
      </Tag>
    )}
    {advancedFilters.diagnosisKeywords && (
      <Tag color="purple">诊断: {advancedFilters.diagnosisKeywords}</Tag>
    )}
    {advancedFilters.dateRange && (
      <Tag color="green">
        时间: {advancedFilters.dateRange[0]?.format('YYYY-MM-DD')} ~ {advancedFilters.dateRange[1]?.format('YYYY-MM-DD')}
      </Tag>
    )}
    {advancedFilters.projectStatus?.map(status => (
      <Tag key={status} color="orange">
        {status === 'unassigned' ? '未分配项目' : status === 'single' ? '单项目' : '多项目'}
      </Tag>
    ))}
    {(advancedFilters.docCountMin !== null || advancedFilters.docCountMax !== null) && (
      <Tag color="cyan">
        文档: {advancedFilters.docCountMin ?? 0} ~ {advancedFilters.docCountMax ?? '∞'} 份
      </Tag>
    )}
  </Space>
)

const DataExportModal = ({
  open,
  loading,
  form,
  selectedCount,
  filters,
  advancedFilters,
  onCancel,
  onExport,
  onChange,
}) => {
  const updateForm = (patch) => onChange(patch)
  const hasFilters = hasExportFilters(filters, advancedFilters)

  return (
    <Modal
      title="数据导出"
      open={open}
      onCancel={onCancel}
      footer={[
        <Button key="cancel" onClick={onCancel}>取消</Button>,
        <Button
          key="export"
          type="primary"
          loading={loading}
          onClick={onExport}
          style={{ backgroundColor: appThemeToken.colorPrimary, borderColor: appThemeToken.colorPrimary }}
        >
          开始导出
        </Button>
      ]}
    >
      <Form layout="vertical">
        <Form.Item label="导出格式">
          <Select value={form.format} onChange={(value) => updateForm({ format: value })}>
            <Select.Option value="excel">Excel格式</Select.Option>
            <Select.Option value="csv">CSV格式</Select.Option>
            <Select.Option value="json">JSON格式</Select.Option>
          </Select>
        </Form.Item>
        <Form.Item label="导出范围">
          <Select value={form.scope} onChange={(value) => updateForm({ scope: value })}>
            <Select.Option value="all">全部患者</Select.Option>
            <Select.Option value="filtered">当前筛选结果</Select.Option>
            <Select.Option value="selected">选中的患者 ({selectedCount})</Select.Option>
          </Select>
        </Form.Item>
        {form.scope === 'selected' && selectedCount === 0 && (
          <Alert message="请先在列表中选择要导出的患者" type="warning" showIcon style={{ marginBottom: 16 }} />
        )}
        {form.scope === 'filtered' && (
          hasFilters ? (
            <Alert
              message="当前筛选条件将应用于导出"
              description={<FilterSummary filters={filters} advancedFilters={advancedFilters} />}
              type="info"
              showIcon
              style={{ marginBottom: 16 }}
            />
          ) : (
            <Alert message="未设置筛选条件，将导出全部患者数据" type="info" showIcon style={{ marginBottom: 16 }} />
          )
        )}
        <Form.Item label="包含字段">
          <Row gutter={[8, 8]}>
            <Col span={8}>
              <Checkbox checked={form.include_basic_info} onChange={(event) => updateForm({ include_basic_info: event.target.checked })}>
                基本信息
              </Checkbox>
            </Col>
            <Col span={8}>
              <Checkbox checked={form.include_diagnosis} onChange={(event) => updateForm({ include_diagnosis: event.target.checked })}>
                诊断信息
              </Checkbox>
            </Col>
            <Col span={8}>
              <Checkbox checked={form.include_completeness} onChange={(event) => updateForm({ include_completeness: event.target.checked })}>
                完整度
              </Checkbox>
            </Col>
            <Col span={8}><Checkbox defaultChecked>文档信息</Checkbox></Col>
            <Col span={8}><Checkbox defaultChecked>项目关联</Checkbox></Col>
            <Col span={8}><Checkbox defaultChecked>时间线</Checkbox></Col>
          </Row>
        </Form.Item>
        <Form.Item label="数据脱敏" valuePropName="checked">
          <Checkbox checked={form.desensitize} onChange={(event) => updateForm({ desensitize: event.target.checked })}>
            对敏感信息进行脱敏处理
          </Checkbox>
        </Form.Item>
      </Form>
    </Modal>
  )
}

export default DataExportModal
