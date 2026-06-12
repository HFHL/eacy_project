export const familyHistorySchema = {
  fieldKey: 'family_history_records',
  displayName: '家族遗传病及肿瘤病史',
  // 表格展示的列配置
  columns: [
    { key: '入院日期', label: '入院日期', type: 'date' },
    { key: '有无遗传病及肿瘤病史', label: '有无遗传病及肿瘤病史', type: 'enum' },
    { key: '关系', label: '关系', type: 'text' },
    { key: '疾病', label: '疾病', type: 'text' },
  ],
  // 必填字段（用于判断记录是否有效）
  requiredFields: ['入院日期'],
  // 主要展示字段（当有值时优先展示）
  primaryDisplayFields: ['关系', '疾病'],
  // 条件展示字段（只有当 conditionalField 的值在 showWhen 中时才展示相关字段）
  conditionalDisplay: {
    conditionalField: '有无遗传病及肿瘤病史',
    showWhen: ['有', '是', true],
    fieldsToShow: ['关系', '疾病'],
  },
}

/**
 * 过敏史 - allergy_records
 * 对应 schema: 基本信息.健康情况.过敏史
 */

export const allergySchema = {
  fieldKey: 'allergy_records',
  displayName: '过敏史',
  columns: [
    { key: '入院日期', label: '入院日期', type: 'date' },
    { key: '是否存在过敏史', label: '是否存在过敏史', type: 'enum' },
    { key: '过敏源(食物或药物)', label: '过敏源', type: 'text' },
    { key: '过敏反应', label: '过敏反应', type: 'text' },
  ],
  requiredFields: ['入院日期'],
  primaryDisplayFields: ['过敏源(食物或药物)', '过敏反应'],
  conditionalDisplay: {
    conditionalField: '是否存在过敏史',
    showWhen: ['有', '是', true],
    fieldsToShow: ['过敏源(食物或药物)', '过敏反应'],
  },
}

/**
 * 既往史 - past_medical_records
 * 对应 schema: 基本信息.健康情况.既往史
 */

export const pastMedicalSchema = {
  fieldKey: 'past_medical_records',
  displayName: '既往史',
  columns: [
    { key: '入院日期', label: '入院日期', type: 'date' },
    { key: '是否存在既往疾病或合并症', label: '是否存在既往疾病', type: 'enum' },
    { key: '既往疾病', label: '既往疾病', type: 'text' },
    { key: '治疗方案或药物', label: '治疗方案或药物', type: 'text' },
    { key: '确诊日期', label: '确诊日期', type: 'date' },
  ],
  requiredFields: ['入院日期'],
  primaryDisplayFields: ['既往疾病', '确诊日期'],
  conditionalDisplay: {
    conditionalField: '是否存在既往疾病或合并症',
    showWhen: ['有', '是', true],
    fieldsToShow: ['既往疾病', '治疗方案或药物', '确诊日期'],
  },
}

/**
 * 手术史 - surgical_records
 * 对应 schema: 基本信息.健康情况.手术史
 */

export const surgicalSchema = {
  fieldKey: 'surgical_records',
  displayName: '手术史',
  columns: [
    { key: '入院日期', label: '入院日期', type: 'date' },
    { key: '是否存在手术史', label: '是否存在手术史', type: 'enum' },
    { key: '名称', label: '手术名称', type: 'text' },
    { key: '日期', label: '手术日期', type: 'date' },
  ],
  requiredFields: ['入院日期'],
  primaryDisplayFields: ['名称', '日期'],
  conditionalDisplay: {
    conditionalField: '是否存在手术史',
    showWhen: ['有', '是', true],
    fieldsToShow: ['名称', '日期'],
  },
}

/**
 * 免疫接种情况 - immunization_records
 * 对应 schema: 基本信息.健康情况.个人史.免疫接种情况
 */

export const immunizationSchema = {
  fieldKey: 'immunization_records',
  displayName: '免疫接种史',
  columns: [
    { key: '是否疫苗接种', label: '是否疫苗接种', type: 'enum' },
    { key: '疫苗名称', label: '疫苗名称', type: 'text' },
    { key: '接种日期', label: '接种日期', type: 'date' },
    { key: '疫苗剂次', label: '疫苗剂次', type: 'number' },
    { key: '接种备注', label: '接种备注', type: 'text' },
  ],
  requiredFields: [],
  primaryDisplayFields: ['疫苗名称', '接种日期', '疫苗剂次'],
}

/**
 * 生育史 - reproductive_records
 * 对应 schema: 基本信息.健康情况.生育史（女性）
 * 数据结构: [{入院日期, 生育史描述, 生育史详情: [{孕次序号, 分娩方式, ...}]}]
 */

export const reproductiveSchema = {
  fieldKey: 'reproductive_records',
  displayName: '生育史',
  columns: [
    { key: '入院日期', label: '入院日期', type: 'date' },
    { key: '生育史描述', label: '生育史描述', type: 'text' },
    { key: '孕次序号', label: '孕次序号', type: 'number' },
    { key: '分娩方式', label: '分娩方式', type: 'enum' },
    { key: '分娩日期', label: '分娩日期', type: 'date' },
    { key: '孕周数(单位：周）', label: '孕周数', type: 'number' },
    { key: '产时备注', label: '产时备注', type: 'text' },
  ],
  requiredFields: [],
  primaryDisplayFields: ['生育史描述', '孕次序号', '分娩方式', '分娩日期'],
  // 嵌套字段配置
  nestedArrayField: '生育史详情',
}

/**
 * 诊断记录 - diagnosis_records
 * 对应 schema: 诊疗情况.诊断记录
 * 数据结构: {入院诊断: [{主要诊断: [{诊断名称}], 次要诊断: [{诊断名称}], 入院日期, 诊断机构}], 出院诊断: [...]}
 */
