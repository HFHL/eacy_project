import React from 'react'
import { Alert, Button, Col, Empty, Input, Progress, Row, Select, Space, Spin, Tooltip, Typography } from 'antd'
import { DeleteOutlined, ExperimentOutlined, PlusOutlined } from '@ant-design/icons'
import { DOC_TYPE_CATEGORIES } from '../../../../../components/FormDesigner/core/docTypes'
import { appThemeToken } from '../../../../../styles/themeTokens'
import FieldEditor from './FieldEditor'

const { Text, Title } = Typography

const IDENTIFIER_TYPES = ['住院号', '门诊号', '急诊号', 'MRN', '医保号', '社保号', '病案号', '健康卡号', '身份证号', 'ID号', '其他']

const isFullWidthField = (field) => {
  const fullWidthTypes = ['textarea', 'checkbox']
  const longTextFields = ['organizationName', 'parsedText']

  return fullWidthTypes.includes(field.uiComponentHint) ||
    longTextFields.includes(field.fieldId) ||
    (field.value && typeof field.value === 'object') ||
    (field.value && field.value.length > 20)
}

const MetadataFieldsPanel = ({
  detailLoading,
  document,
  documentDetail,
  editedFields,
  extractingMetadata,
  getFieldConfidence,
  getFieldValue,
  metadataInProgress,
  metadataStage,
  onExtractMetadata,
  onFieldSave,
}) => {
  const meta = documentDetail?.metadata || document?.metadata || {}
  const rawEffectiveDate = documentDetail?.metadata?.effectiveDate || document?.metadata?.effectiveDate || ''
  const effectiveDateValue = detailLoading ? '' : (
    typeof rawEffectiveDate === 'string' && rawEffectiveDate.length > 10
      ? rawEffectiveDate.slice(0, 10)
      : rawEffectiveDate
  )
  const currentIdentifiers = editedFields.identifiers?.value || meta.identifiers || []
  const currentDocType = editedFields.documentType?.value ?? meta.documentType
  const docTypeOptions = Object.entries(DOC_TYPE_CATEGORIES).map(([key, cat]) => ({ value: key, label: cat.label }))
  const docSubtypeOptions = currentDocType && DOC_TYPE_CATEGORIES[currentDocType]
    ? DOC_TYPE_CATEGORIES[currentDocType].children.map(child => ({ value: child, label: child }))
    : []

  const handleAddIdentifier = () => {
    onFieldSave('identifiers', [...currentIdentifiers, { '标识符类型': '住院号', '标识符编号': '' }])
  }

  const handleRemoveIdentifier = (index) => {
    onFieldSave('identifiers', currentIdentifiers.filter((_, itemIndex) => itemIndex !== index))
  }

  const handleUpdateIdentifier = (index, field, value) => {
    const nextIdentifiers = currentIdentifiers.map((item, itemIndex) => (
      itemIndex === index ? { ...item, [field]: value } : item
    ))
    onFieldSave('identifiers', nextIdentifiers, undefined, true)
  }

  const metadataFields = [
    { fieldId: 'organizationName', fieldName: '机构名称', value: meta.organizationName, uiComponentHint: 'text' },
    { fieldId: 'patientName', fieldName: '患者姓名', value: meta.patientName, uiComponentHint: 'text' },
    {
      fieldId: 'gender',
      fieldName: '性别',
      value: meta.gender,
      uiComponentHint: 'radio',
      options: [
        { value: '男', label: '男' },
        { value: '女', label: '女' },
        { value: '不详', label: '不详' },
      ],
    },
    { fieldId: 'age', fieldName: '年龄', value: meta.age, unit: '岁', uiComponentHint: 'number' },
    { fieldId: 'documentType', fieldName: '文档类型', value: meta.documentType, uiComponentHint: 'select', options: docTypeOptions },
    { fieldId: 'documentSubtype', fieldName: '文档子类型', value: meta.documentSubtype, uiComponentHint: 'select', options: docSubtypeOptions },
    { fieldId: 'effectiveDate', fieldName: '生效时间', value: effectiveDateValue, uiComponentHint: 'datepicker' },
  ]

  const metadataProgressAlert = metadataStage && (metadataInProgress || metadataStage.kind === 'error') ? (
    <Alert
      type={metadataStage.kind === 'error' ? 'error' : 'info'}
      showIcon
      message={metadataStage.message}
      description={(
        <Progress
          percent={metadataStage.percent}
          size="small"
          status={
            metadataStage.kind === 'error'
              ? 'exception'
              : metadataInProgress
                ? 'active'
                : 'success'
          }
        />
      )}
      style={{ marginBottom: 16 }}
    />
  ) : null

  return (
    <div className="metadata-fields">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <Title level={5} style={{ margin: 0 }}>元数据字段</Title>
        <Tooltip title={!document.isParsed ? '文档尚未完成 OCR 解析，请先进行解析' : metadataInProgress ? '元数据抽取进行中' : '仅重新抽取文档元数据（文档类型、患者名等），不包含病历字段'}>
          <Button
            size="small"
            icon={metadataInProgress ? <Spin size="small" /> : <ExperimentOutlined />}
            onClick={onExtractMetadata}
            loading={extractingMetadata || metadataInProgress}
            disabled={!document.isParsed || extractingMetadata || detailLoading || metadataInProgress}
          >
            {metadataInProgress ? '抽取中' : '重新提取'}
          </Button>
        </Tooltip>
      </div>

      {metadataProgressAlert}

      <div className="identifiers-section" style={{ marginBottom: 24, padding: 16, background: appThemeToken.colorFillTertiary, borderRadius: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <Text strong>唯一标识符 ({currentIdentifiers.length})</Text>
          <Button type="dashed" size="small" icon={<PlusOutlined />} onClick={handleAddIdentifier}>
            添加标识符
          </Button>
        </div>

        {currentIdentifiers.length === 0 ? (
          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="暂无标识符" style={{ margin: '10px 0' }} />
        ) : (
          <Space direction="vertical" style={{ width: '100%' }}>
            {currentIdentifiers.map((item, index) => (
              <div key={index} style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                <Select
                  value={item['标识符类型']}
                  onChange={(value) => handleUpdateIdentifier(index, '标识符类型', value)}
                  style={{ width: 140 }}
                  size="small"
                  placeholder="选择类型"
                >
                  {IDENTIFIER_TYPES.map(type => (
                    <Select.Option key={type} value={type}>{type}</Select.Option>
                  ))}
                </Select>
                <Input
                  value={item['标识符编号']}
                  onChange={(event) => handleUpdateIdentifier(index, '标识符编号', event.target.value)}
                  placeholder="请输入编号"
                  style={{ flex: 1 }}
                  size="small"
                />
                <Button type="text" danger icon={<DeleteOutlined />} onClick={() => handleRemoveIdentifier(index)} size="small" />
              </div>
            ))}
          </Space>
        )}
      </div>

      <div className="fields-grid-responsive">
        <Row gutter={[16, 16]}>
          {metadataFields.map(field => (
            <Col key={field.fieldId} span={isFullWidthField(field) ? 24 : 12} className="field-col">
              <div className="field-item">
                <FieldEditor
                  field={field}
                  value={getFieldValue(field)}
                  confidence={getFieldConfidence(field)}
                  onSave={onFieldSave}
                />
              </div>
            </Col>
          ))}
        </Row>
      </div>
    </div>
  )
}

export default MetadataFieldsPanel
