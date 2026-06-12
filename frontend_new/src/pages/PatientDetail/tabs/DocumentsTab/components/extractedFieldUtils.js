import {
  EHR_FIELD_GROUPS,
  getFieldLabel,
  isArrayField,
  isEmptyValue,
  normalizeDisplayValue,
} from './ehrFieldLabels'

const ARRAY_FIELD_LABELS = {
  institution: '检查机构',
  report_no: '报告编号',
  exam_date: '检查日期',
  report_date: '报告日期',
  specimen_type: '标本类型',
  project_name: '项目名称',
  items: '检验指标',
  item_name: '指标名称',
  item_abbr: '英文简称',
  value: '检测值',
  unit: '单位',
  reference_range: '参考范围',
  is_abnormal: '是否异常',
  diagnosis_name: '疾病名称',
  diagnosis_code: '疾病编码',
  diagnosis_type: '诊断类型',
  diagnosis_date: '诊断日期',
  diagnosis_doctor: '诊断医师',
  diagnosis_institution: '诊断机构',
  treatment_name: '治疗名称',
  treatment_type: '治疗类型',
  treatment_date: '治疗日期',
  treatment_institution: '治疗机构',
  treatment_doctor: '主治医师',
  treatment_effect: '治疗效果',
  treatment_summary: '治疗总结',
  drug_name: '药品名称',
  drug_code: '药品编码',
  dosage: '用药剂量',
  frequency: '用药频次',
  route: '给药途径',
  start_date: '开始日期',
  end_date: '结束日期',
  purpose: '用药目的',
  surgery_name: '手术名称',
  surgery_code: '手术编码',
  surgery_date: '手术日期',
  surgery_institution: '手术机构',
  surgeon: '主刀医师',
  anesthesia_type: '麻醉方式',
  surgery_duration: '手术时长',
  intraoperative_finding: '术中所见',
  postoperative_diagnosis: '术后诊断',
  imaging_type: '检查类型',
  imaging_part: '检查部位',
  finding: '所见描述',
  conclusion: '结论',
  impression: '印象',
  pathology_type: '病理类型',
  sample_type: '标本类型',
  sample_site: '取样部位',
  gross_finding: '肉眼所见',
  microscopic_finding: '镜下所见',
  pathology_diagnosis: '病理诊断',
  allergen: '过敏原',
  allergy_type: '过敏类型',
  severity: '严重程度',
  reaction: '过敏反应',
  relation: '亲属关系',
  health_status: '健康状态',
  disease_history: '疾病史',
  disease: '疾病名称',
  onset_date: '发病日期',
  cure_date: '治愈日期',
  status: '当前状态',
  remark: '备注',
  notes: '备注说明',
  description: '描述',
  result: '结果',
  doctor: '医师',
  operator: '操作者',
}

const buildArraySummary = (items) => (
  items.slice(0, 3).map((item) => {
    if (item === null || item === undefined) {
      return { title: '空记录', sub: null }
    }
    if (typeof item !== 'object') {
      return { title: String(item), sub: null }
    }

    const keys = Object.keys(item)
    const nameKey = keys.find(k => k.toLowerCase().includes('name') || k === 'title' || k === 'diagnosis' || k === 'drug')
    const timeKey = keys.find(k => k.toLowerCase().includes('date') || k === 'time')
    return {
      title: nameKey ? item[nameKey] : (item.name || item.title || item.diagnosis_name || '未命名记录'),
      sub: timeKey ? item[timeKey] : null,
    }
  })
)

export const getArrayFieldLabel = (key) => ARRAY_FIELD_LABELS[key] || key

export const convertEhrDataToFields = (ehrData) => {
  if (!ehrData || typeof ehrData !== 'object') return []

  return Object.entries(ehrData).reduce((fields, [key, value]) => {
    if (key === '_extraction_metadata' || (key.startsWith('_') && key.length > 1)) {
      return fields
    }

    let displayValue = value
    let confidence = null
    let sourceIndex = null
    let rawValue = value

    if (typeof value === 'object' && !Array.isArray(value) && value.value !== undefined) {
      const normalizedNestedValue = normalizeDisplayValue(value.value)
      if (normalizedNestedValue === undefined) return fields
      displayValue = normalizedNestedValue
      rawValue = normalizedNestedValue
      confidence = value.confidence
      sourceIndex = value.source_index
    } else {
      const normalizedValue = normalizeDisplayValue(value)
      if (normalizedValue === undefined || isEmptyValue(normalizedValue)) return fields
      displayValue = normalizedValue
      rawValue = normalizedValue
    }

    const isArray = Array.isArray(displayValue)
    const arrayLength = isArray ? displayValue.length : 0
    fields.push({
      fieldId: key,
      fieldName: getFieldLabel(key),
      value: displayValue,
      displayText: isArray ? `共 ${arrayLength} 条记录` : displayValue,
      rawValue,
      confidence,
      sourceIndex,
      isArray,
      arrayLength,
      arraySummary: isArray && arrayLength > 0 ? buildArraySummary(displayValue) : [],
      uiComponentHint: isArrayField(key) ? 'list' : 'text',
    })
    return fields
  }, [])
}

export const formatExtractionTime = (isoString) => {
  if (!isoString) return '未知时间'
  const date = new Date(isoString)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day} ${hours}:${minutes}`
}

export const getExtractionRecordKey = (record, index) => record.extraction_id || `record-${index}`

export const groupExtractedFields = (fields) => {
  const groupedFields = Object.entries(EHR_FIELD_GROUPS).reduce((groups, [groupKey, groupConfig]) => ({
    ...groups,
    [groupKey]: { config: groupConfig, fields: [] },
  }), {})

  fields.forEach((field) => {
    const matchedGroup = Object.entries(EHR_FIELD_GROUPS).find(([, groupConfig]) => (
      groupConfig.fields.includes(field.fieldId)
    ))
    const groupKey = matchedGroup?.[0] || 'other'
    if (!groupedFields[groupKey]) {
      groupedFields[groupKey] = {
        config: { label: '其他信息', icon: 'FileTextOutlined' },
        fields: [],
      }
    }
    groupedFields[groupKey].fields.push(field)
  })

  return Object.entries(groupedFields).filter(([, group]) => group.fields.length > 0)
}
