export const diagnosisSchema = {
  fieldKey: 'diagnosis_records',
  displayName: '诊断记录',
  columns: [
    { key: '诊断类型', label: '诊断类型', type: 'text' }, // 入院诊断/出院诊断
    { key: '主要诊断', label: '主要诊断', type: 'text' },
    { key: '次要诊断', label: '次要诊断', type: 'text' },
    { key: '入院日期', label: '入院日期', type: 'date' },
    { key: '出院日期', label: '出院日期', type: 'date' },
    { key: '诊断机构', label: '诊断机构', type: 'text' },
  ],
  requiredFields: [],
  primaryDisplayFields: ['诊断类型', '主要诊断'],
  // 嵌套结构说明
  nestedStructure: {
    '入院诊断': {
      dateField: '入院日期',
      diagnosesFields: ['主要诊断', '次要诊断']
    },
    '出院诊断': {
      dateField: '出院日期',
      diagnosesFields: ['主要诊断', '次要诊断']
    }
  },
}

/**
 * 药物治疗 - medication_records
 * 对应 schema: 诊疗情况.治疗情况.药物治疗
 */

export const medicationSchema = {
  fieldKey: 'medication_records',
  displayName: '药物治疗',
  columns: [
    { key: '是否有药物治疗', label: '是否有药物治疗', type: 'enum' },
    { key: '药物类型', label: '药物类型', type: 'enum' },
    { key: '药物名称', label: '药物名称', type: 'text' },
    { key: '是否联合用药', label: '是否联合用药', type: 'enum' },
    { key: '剂量', label: '剂量', type: 'number' },
    { key: '单位', label: '单位', type: 'enum' },
    { key: '频率', label: '频率', type: 'text' },
    { key: '给药途径', label: '给药途径', type: 'enum' },
    { key: '开始日期', label: '开始日期', type: 'date' },
    { key: '结束日期', label: '结束日期', type: 'date' },
    { key: '备注（不良反应，依从性、剂量调整等特殊说明）', label: '备注', type: 'text' },
  ],
  requiredFields: ['药物类型', '药物名称', '开始日期', '结束日期'],
  primaryDisplayFields: ['药物名称', '剂量', '单位', '频率'],
}

/**
 * 手术治疗 - treatment_records (手术类型)
 * 对应 schema: 诊疗情况.治疗情况.手术治疗
 */

export const surgicalTreatmentSchema = {
  fieldKey: 'treatment_records',
  treatmentType: '手术治疗',
  displayName: '手术治疗',
  columns: [
    { key: '是否有手术治疗', label: '是否有手术治疗', type: 'enum' },
    { key: '手术日期', label: '手术日期', type: 'date' },
    { key: '手术名称', label: '手术名称', type: 'text' },
    { key: '麻醉方式', label: '麻醉方式', type: 'enum' },
  ],
  requiredFields: ['手术日期', '手术名称'],
  primaryDisplayFields: ['手术名称', '手术日期'],
}

/**
 * 外放射治疗 - treatment_records (放疗类型)
 * 对应 schema: 诊疗情况.治疗情况.外放射治疗
 */

export const radiationSchema = {
  fieldKey: 'treatment_records',
  treatmentType: '外放射治疗',
  displayName: '外放射治疗',
  columns: [
    { key: '是否有外放射治疗', label: '是否有外放射治疗', type: 'enum' },
    { key: '开始日期', label: '开始日期', type: 'date' },
    { key: '结束日期', label: '结束日期', type: 'date' },
    { key: '放疗性质', label: '放疗性质', type: 'enum' },
    { key: '放疗方式', label: '放疗方式', type: 'enum' },
    { key: '射线类型', label: '射线类型', type: 'enum' },
    { key: '放疗部位', label: '放疗部位', type: 'enum' },
    { key: '实际总剂量(单位：Gy）', label: '总剂量(Gy)', type: 'number' },
    { key: '分割次数', label: '分割次数', type: 'number' },
  ],
  requiredFields: ['开始日期', '结束日期', '放疗部位'],
  primaryDisplayFields: ['放疗部位', '放疗方式', '实际总剂量(单位：Gy）'],
}

/**
 * 病理报告 - 嵌套结构
 * 对应 schema: 诊疗情况.病理
 * 包含 5 种子类型，每种都是独立的数组
 */

/**
 * 细胞学病理 - cytology_pathology_records
 */
