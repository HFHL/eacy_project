export const INITIAL_FILTERS = {
  search: '',
  gender: '',
  ageRange: [0, 100],
  department: '',
  diagnosis: '',
  completeness: '',
  projectStatus: '',
  dateRange: null
}

export const INITIAL_ADVANCED_FILTERS = {
  diagnosisKeywords: '',
  dateRange: null,
  projectStatus: [],
  docCountMin: null,
  docCountMax: null
}

export const DEFAULT_VISIBLE_COLUMNS = [
  'id',
  'name',
  'basicInfo',
  'diagnosis',
  'documentCount',
  'conflicts',
  'completeness',
  'doctor',
  'projects',
  'lastUpdate'
]

export const COLUMN_OPTIONS = [
  { label: '患者ID', value: 'id' },
  { label: '姓名', value: 'name' },
  { label: '基本信息', value: 'basicInfo' },
  { label: '主要诊断', value: 'diagnosis' },
  { label: '文档数量', value: 'documentCount' },
  { label: '字段冲突', value: 'conflicts' },
  { label: '数据完整度', value: 'completeness' },
  { label: '主治医生', value: 'doctor' },
  { label: '关联项目', value: 'projects' },
  { label: '最近更新', value: 'lastUpdate' }
]

export const DIAGNOSIS_OPTIONS = [
  '高血压',
  '糖尿病',
  '冠心病',
  '肺癌',
  '胃癌',
  '肝癌',
  '脑梗死',
  '心肌梗死',
  '慢性阻塞性肺疾病',
  '甲状腺功能亢进'
]
