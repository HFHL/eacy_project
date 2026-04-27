/**
 * 电子病历字段中文名称映射字典
 * 对应患者 EHR 字段标签。
 */

export const EHR_FIELD_LABELS = {
  // ========== 基本信息 - 个人信息 ==========
  personal_info_name: '患者姓名',
  personal_info_gender: '性别',
  personal_info_birth_date: '出生日期',
  personal_info_age: '年龄',
  personal_info_id_type: '证件类型',
  personal_info_id_number: '证件号码',
  
  // ========== 基本信息 - 联系方式 ==========
  contact_info_phone: '手机号码',
  contact_info_address: '家庭住址',
  contact_info_emergency_name: '紧急联系人姓名',
  contact_info_emergency_phone: '紧急联系人电话',
  contact_info_emergency_relation: '紧急联系人关系',
  
  // ========== 基本信息 - 人口学 ==========
  demographics_marital_status: '婚姻状况',
  demographics_education: '教育水平',
  demographics_occupation: '职业',
  demographics_ethnicity: '民族',
  demographics_insurance_type: '医保类型',
  
  // ========== 健康状况 - 生活史 ==========
  lifestyle_smoking_status: '吸烟状态',
  lifestyle_smoking_years: '吸烟年数',
  lifestyle_smoking_daily: '日均吸烟支数',
  lifestyle_smoking_quit_year: '戒烟年份',
  lifestyle_drinking_status: '饮酒状态',
  lifestyle_drinking_frequency: '饮酒频率',
  lifestyle_drinking_type: '饮酒类型',
  lifestyle_drinking_quit_year: '戒酒年份',
  
  // ========== 健康状况 - 个体史 ==========
  personal_history_birth: '出生史',
  personal_history_development: '生长发育史',
  personal_history_residence: '居住史',
  personal_history_occupation_exposure: '职业暴露史',
  personal_history_epidemic_travel: '疫区旅行史',
  
  // ========== 健康状况 - 生理史（月经史）==========
  menstrual_menarche_age: '初潮年龄',
  menstrual_cycle_length: '月经周期长度',
  menstrual_volume: '月经量',
  menstrual_regularity: '周期规律性',
  menstrual_last_period: '末次月经日期',
  
  // ========== 可重复字段组（JSONB 数组）==========
  immunization_records: '免疫接种史',
  reproductive_records: '生育史（孕产史）',
  past_medical_records: '既往病史',
  surgical_records: '手术史',
  family_history_records: '家族史',
  comorbidity_records: '合并症',
  allergy_records: '过敏史',
  diagnosis_records: '诊断记录',
  treatment_records: '治疗记录',
  medication_records: '用药记录',
  pathology_records: '病理报告',
  laboratory_records: '实验室检查',
  imaging_records: '影像检查',
  genetics_records: '基因检测',
  other_exam_records: '其他检查',
  material_records: '其他材料',
  
  // ========== 元数据字段 ==========
  data_version: '数据版本号',
  last_extraction_at: '最后提取时间',
}

/**
 * 字段分组配置（用于分类展示）
 */
export const EHR_FIELD_GROUPS = {
  personalInfo: {
    label: '个人信息',
    icon: 'UserOutlined',
    fields: [
      'personal_info_name',
      'personal_info_gender',
      'personal_info_birth_date',
      'personal_info_age',
      'personal_info_id_type',
      'personal_info_id_number',
    ]
  },
  contactInfo: {
    label: '联系方式',
    icon: 'PhoneOutlined',
    fields: [
      'contact_info_phone',
      'contact_info_address',
      'contact_info_emergency_name',
      'contact_info_emergency_phone',
      'contact_info_emergency_relation',
    ]
  },
  demographics: {
    label: '人口学信息',
    icon: 'TeamOutlined',
    fields: [
      'demographics_marital_status',
      'demographics_education',
      'demographics_occupation',
      'demographics_ethnicity',
      'demographics_insurance_type',
    ]
  },
  lifestyle: {
    label: '生活史',
    icon: 'CoffeeOutlined',
    fields: [
      'lifestyle_smoking_status',
      'lifestyle_smoking_years',
      'lifestyle_smoking_daily',
      'lifestyle_smoking_quit_year',
      'lifestyle_drinking_status',
      'lifestyle_drinking_frequency',
      'lifestyle_drinking_type',
      'lifestyle_drinking_quit_year',
    ]
  },
  personalHistory: {
    label: '个体史',
    icon: 'HistoryOutlined',
    fields: [
      'personal_history_birth',
      'personal_history_development',
      'personal_history_residence',
      'personal_history_occupation_exposure',
      'personal_history_epidemic_travel',
    ]
  },
  menstrual: {
    label: '生理史（月经史）',
    icon: 'CalendarOutlined',
    fields: [
      'menstrual_menarche_age',
      'menstrual_cycle_length',
      'menstrual_volume',
      'menstrual_regularity',
      'menstrual_last_period',
    ]
  },
  medicalRecords: {
    label: '医疗记录',
    icon: 'MedicineBoxOutlined',
    fields: [
      'past_medical_records',
      'surgical_records',
      'family_history_records',
      'comorbidity_records',
      'allergy_records',
      'immunization_records',
      'reproductive_records',
    ]
  },
  clinicalData: {
    label: '临床数据',
    icon: 'ExperimentOutlined',
    fields: [
      'diagnosis_records',
      'treatment_records',
      'medication_records',
      'pathology_records',
      'laboratory_records',
      'imaging_records',
      'genetics_records',
      'other_exam_records',
      'material_records',
    ]
  }
}

/**
 * 获取字段的中文标签
 * @param {string} fieldKey - 字段键名
 * @returns {string} 中文标签
 */
export const getFieldLabel = (fieldKey) => {
  return EHR_FIELD_LABELS[fieldKey] || fieldKey.replace(/_/g, ' ')
}

/**
 * 判断字段是否为数组类型（可重复字段组）
 * @param {string} fieldKey - 字段键名
 * @returns {boolean}
 */
export const isArrayField = (fieldKey) => {
  const arrayFields = [
    'immunization_records',
    'reproductive_records',
    'past_medical_records',
    'surgical_records',
    'family_history_records',
    'comorbidity_records',
    'allergy_records',
    'diagnosis_records',
    'treatment_records',
    'medication_records',
    'pathology_records',
    'laboratory_records',
    'imaging_records',
    'genetics_records',
    'other_exam_records',
    'material_records',
  ]
  return arrayFields.includes(fieldKey)
}

/**
 * 递归清洗仅用于展示的数据：
 * - 去掉 null / undefined / 空字符串 / 空白字符串
 * - 去掉空数组
 * - 去掉清洗后为空的对象
 * - 保留 0 / false 等有效值
 * @param {any} value
 * @returns {any | undefined}
 */
export const normalizeDisplayValue = (value) => {
  if (value === null || value === undefined) {
    return undefined
  }

  if (typeof value === 'string') {
    return value.trim() === '' ? undefined : value
  }

  if (Array.isArray(value)) {
    const normalized = value
      .map(item => normalizeDisplayValue(item))
      .filter(item => item !== undefined)
    return normalized.length > 0 ? normalized : undefined
  }

  if (typeof value === 'object') {
    const normalizedEntries = Object.entries(value).reduce((acc, [key, item]) => {
      const normalizedItem = normalizeDisplayValue(item)
      if (normalizedItem !== undefined) {
        acc.push([key, normalizedItem])
      }
      return acc
    }, [])

    return normalizedEntries.length > 0 ? Object.fromEntries(normalizedEntries) : undefined
  }

  return value
}

/**
 * 判断字段值是否为空
 * @param {any} value - 字段值
 * @returns {boolean}
 */
export const isEmptyValue = (value) => {
  return normalizeDisplayValue(value) === undefined
}

export default {
  EHR_FIELD_LABELS,
  EHR_FIELD_GROUPS,
  getFieldLabel,
  isArrayField,
  normalizeDisplayValue,
  isEmptyValue,
}

