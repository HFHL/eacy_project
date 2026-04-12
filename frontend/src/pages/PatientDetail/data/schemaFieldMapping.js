/**
 * 基于 patient.schema.json 的字段映射配置
 * 
 * 此文件定义了后端 patient_ehr 表中各个 JSONB 数组字段的结构
 * 字段名使用中文（与 patient.schema.json 保持一致）
 */

/**
 * 家族遗传病及肿瘤病史 - family_history_records
 * 对应 schema: 基本信息.健康情况.家族遗传病及肿瘤病史
 */
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
export const cytologyPathologySchema = {
  fieldKey: '细胞学病理',
  parentKey: '病理',
  displayName: '细胞学病理',
  columns: [
    { key: '医疗机构', label: '医疗机构', type: 'text' },
    { key: '病理诊断报告日期', label: '报告日期', type: 'date' },
    { key: '病理送检日期', label: '送检日期', type: 'date' },
    { key: '病理样本（取材）', label: '病理样本', type: 'text' },
    { key: '病理号', label: '病理号', type: 'text' },
    { key: '病理图片', label: '病理图片', type: 'text' },
    { key: '病理描述', label: '病理描述', type: 'textarea' },
    { key: '免疫组化结果', label: '免疫组化结果', type: 'textarea' },
    { key: '病理诊断结论', label: '病理诊断结论', type: 'textarea' },
    { key: '是否确诊肿瘤', label: '是否确诊肿瘤', type: 'enum' },
  ],
  requiredFields: ['病理诊断报告日期', '病理诊断结论'],
  primaryDisplayFields: ['病理诊断结论', '医疗机构'],
}

/**
 * 活检组织病理 - biopsy_pathology_records
 */
export const biopsyPathologySchema = {
  fieldKey: '活检组织病理',
  parentKey: '病理',
  displayName: '活检组织病理',
  columns: [
    { key: '医疗机构', label: '医疗机构', type: 'text' },
    { key: '病理诊断报告日期', label: '报告日期', type: 'date' },
    { key: '病理送检日期', label: '送检日期', type: 'date' },
    { key: '病理样本（取材）', label: '病理样本', type: 'text' },
    { key: '病理号', label: '病理号', type: 'text' },
    { key: '病理图片', label: '病理图片', type: 'text' },
    { key: '病理描述', label: '病理描述', type: 'textarea' },
    { key: '免疫组化结果', label: '免疫组化结果', type: 'textarea' },
    { key: '病理诊断结论', label: '病理诊断结论', type: 'textarea' },
    { key: '是否确诊肿瘤', label: '是否确诊肿瘤', type: 'enum' },
  ],
  requiredFields: ['病理诊断报告日期', '病理送检日期', '病理诊断结论'],
  primaryDisplayFields: ['病理诊断结论', '医疗机构'],
}

/**
 * 冰冻病理 - frozen_pathology_records
 */
export const frozenPathologySchema = {
  fieldKey: '冰冻病理',
  parentKey: '病理',
  displayName: '冰冻病理',
  columns: [
    { key: '医疗机构', label: '医疗机构', type: 'text' },
    { key: '病理诊断报告日期', label: '报告日期', type: 'date' },
    { key: '病理送检日期', label: '送检日期', type: 'date' },
    { key: '病理样本（取材）', label: '病理样本', type: 'text' },
    { key: '病理号', label: '病理号', type: 'text' },
    { key: '病理图片', label: '病理图片', type: 'text' },
    { key: '病理描述', label: '病理描述', type: 'textarea' },
    { key: '免疫组化结果', label: '免疫组化结果', type: 'textarea' },
    { key: '病理诊断', label: '病理诊断', type: 'textarea' },
    { key: '是否确诊肿瘤', label: '是否确诊肿瘤', type: 'enum' },
  ],
  requiredFields: ['病理诊断报告日期', '病理送检日期', '病理诊断'],
  primaryDisplayFields: ['病理诊断', '医疗机构'],
}

/**
 * 术后组织病理 - postoperative_pathology_records
 */
export const postoperativePathologySchema = {
  fieldKey: '术后组织病理',
  parentKey: '病理',
  displayName: '术后组织病理',
  columns: [
    { key: '医疗机构', label: '医疗机构', type: 'text' },
    { key: '病理诊断报告日期', label: '报告日期', type: 'date' },
    { key: '病理送检日期', label: '送检日期', type: 'date' },
    { key: '病理样本（取材）', label: '病理样本', type: 'text' },
    { key: '病理号', label: '病理号', type: 'text' },
    { key: '病理图片', label: '病理图片', type: 'text' },
    { key: '病理描述', label: '病理描述', type: 'textarea' },
    { key: '免疫组化结果', label: '免疫组化结果', type: 'textarea' },
    { key: '病理诊断结论', label: '病理诊断结论', type: 'textarea' },
    { key: '是否确诊肿瘤', label: '是否确诊肿瘤', type: 'enum' },
  ],
  requiredFields: ['病理诊断报告日期', '病理送检日期', '病理诊断结论'],
  primaryDisplayFields: ['病理诊断结论', '医疗机构'],
}

/**
 * 染色体分析 - chromosome_analysis_records
 */
export const chromosomeAnalysisSchema = {
  fieldKey: '染色体分析',
  parentKey: '病理',
  displayName: '染色体分析',
  columns: [
    { key: '医疗机构', label: '医疗机构', type: 'text' },
    { key: '报告日期', label: '报告日期', type: 'date' },
    { key: '送检日期', label: '送检日期', type: 'date' },
    { key: '病理样本（取材）', label: '病理样本', type: 'text' },
    { key: '病理号', label: '病理号', type: 'text' },
    { key: '病理图片', label: '病理图片', type: 'text' },
    { key: '病理描述', label: '病理描述', type: 'textarea' },
    { key: '病理诊断结论', label: '病理诊断结论', type: 'textarea' },
  ],
  requiredFields: ['报告日期', '送检日期', '病理诊断结论'],
  primaryDisplayFields: ['病理诊断结论', '医疗机构'],
}

/**
 * 实验室检查 - laboratory_records
 * 包含：血常规、生化检查、血气分析、传染学检测、免疫学检测、肿瘤标志物等
 */
export const laboratorySchema = {
  fieldKey: 'laboratory_records',
  displayName: '实验室检查',
  columns: [
    { key: '检查机构', label: '检查机构', type: 'text' },
    { key: '采样日期', label: '采样日期', type: 'date' },
    { key: '报告日期', label: '报告日期', type: 'date' },
    { key: '报告编号', label: '报告编号', type: 'text' },
    { key: '标本类型', label: '标本类型', type: 'text' },
    { key: '检验结果', label: '检验结果', type: 'array' }, // 嵌套的检验指标数组
  ],
  requiredFields: ['报告日期'],
  primaryDisplayFields: ['报告日期', '标本类型'],
  // 检验结果的子字段配置
  itemsSchema: {
    key: '检验结果',
    columns: [
      { key: '指标名称(中文)', label: '指标名称', type: 'text' },
      { key: '英文简称', label: '英文简称', type: 'text' },
      { key: '检测值', label: '检测值', type: 'text' },
      { key: '单位', label: '单位', type: 'enum' },
      { key: '参考范围', label: '参考范围', type: 'text' },
      { key: '是否异常', label: '是否异常', type: 'enum' },
      { key: '异常标志', label: '异常标志', type: 'enum' },
    ],
  },
}

/**
 * 影像检查 - imaging_records
 * 包含：X线、CT、MRI、PET-CT/PET-MR、超声、骨扫描
 */
export const imagingSchema = {
  fieldKey: 'imaging_records',
  displayName: '影像检查',
  columns: [
    { key: '检查或报告机构', label: '检查机构', type: 'text' },
    { key: '检查(报告)机构', label: '检查机构', type: 'text' }, // 别名
    { key: '检查日期', label: '检查日期', type: 'date' },
    { key: '报告日期', label: '报告日期', type: 'date' },
    { key: '检查部位', label: '检查部位', type: 'text' },
    { key: '检查编号(影像号)', label: '检查编号', type: 'text' },
    { key: '所见描述', label: '所见描述', type: 'text' },
    { key: '诊断印象或结论', label: '诊断印象', type: 'text' },
    { key: '是否有异常', label: '是否有异常', type: 'enum' },
    { key: '是否有肿瘤结论或描述', label: '是否有肿瘤结论', type: 'enum' },
  ],
  requiredFields: ['检查日期', '报告日期'],
  primaryDisplayFields: ['检查部位', '诊断印象或结论'],
}

/**
 * 基因检测 - genetics_records
 */
export const geneticsSchema = {
  fieldKey: 'genetics_records',
  displayName: '基因检测',
  columns: [
    { key: '检测机构', label: '检测机构', type: 'text' },
    { key: '送检日期', label: '送检日期', type: 'date' },
    { key: '报告日期', label: '报告日期', type: 'date' },
    { key: '检测类型', label: '检测类型', type: 'text' },
    { key: '标本类型', label: '标本类型', type: 'enum' },
    { key: '取样部位', label: '取样部位', type: 'text' },
    { key: '检测项目名称', label: '检测项目名称', type: 'text' },
    { key: '检测方法', label: '检测方法', type: 'array' },
    { key: '检测编号', label: '检测编号', type: 'text' },
    { key: '基因突变详情', label: '基因突变详情', type: 'array' },
    { key: '基因扩增详情', label: '基因扩增详情', type: 'array' },
    { key: '融合或重排基因详情', label: '融合或重排基因详情', type: 'array' },
    { key: 'MSI状态详情', label: 'MSI状态详情', type: 'array' },
    { key: 'TMB详情', label: 'TMB详情', type: 'array' },
  ],
  requiredFields: ['送检日期', '报告日期', '检测项目名称'],
  primaryDisplayFields: ['检测项目名称', '报告日期'],
}

/**
 * 内镜检查 - other_exam_records (内镜类型)
 * 包含：胃肠镜检查、支气管镜检查、喉镜检查
 */
export const endoscopySchema = {
  fieldKey: 'other_exam_records',
  examType: '内镜检查',
  displayName: '内镜检查',
  columns: [
    { key: '检查(报告)机构', label: '检查机构', type: 'text' },
    { key: '检查日期', label: '检查日期', type: 'date' },
    { key: '报告日期', label: '报告日期', type: 'date' },
    { key: '检查编号', label: '检查编号', type: 'text' },
    { key: '所见描述', label: '所见描述', type: 'text' },
    { key: '诊断印象或结论', label: '诊断印象', type: 'text' },
    { key: '是否有异常', label: '是否有异常', type: 'enum' },
    { key: '是否有肿瘤结论或描述', label: '是否有肿瘤结论', type: 'enum' },
    { key: '是否取活检', label: '是否取活检', type: 'enum' },
  ],
  requiredFields: ['检查日期', '报告日期'],
  primaryDisplayFields: ['诊断印象或结论'],
}

/**
 * 其他检查 - other_exam_records
 * 包含：肺功能检查、心电图、脑电图等
 */
export const otherExamSchema = {
  fieldKey: 'other_exam_records',
  displayName: '其他检查',
  columns: [
    { key: '检查项目', label: '检查项目', type: 'enum' },
    { key: '检查机构', label: '检查机构', type: 'text' },
    { key: '检查日期', label: '检查日期', type: 'date' },
    { key: '报告日期', label: '报告日期', type: 'date' },
    { key: '检查编号', label: '检查编号', type: 'text' },
    { key: '检查结果描述', label: '检查结果描述', type: 'text' },
    { key: '检查结论', label: '检查结论', type: 'text' },
  ],
  requiredFields: ['检查日期', '报告日期'],
  primaryDisplayFields: ['检查项目', '检查结论'],
}

/**
 * 所有 schema 的集合，按 fieldKey 索引
 */
export const allSchemas = {
  family_history_records: familyHistorySchema,
  allergy_records: allergySchema,
  past_medical_records: pastMedicalSchema,
  surgical_records: surgicalSchema,
  immunization_records: immunizationSchema,
  reproductive_records: reproductiveSchema,
  diagnosis_records: diagnosisSchema,
  medication_records: medicationSchema,
  treatment_records: surgicalTreatmentSchema, // 默认用手术治疗 schema
  // 病理报告 - 嵌套结构，包含5种子类型
  '病理.细胞学病理': cytologyPathologySchema,
  '病理.活检组织病理': biopsyPathologySchema,
  '病理.冰冻病理': frozenPathologySchema,
  '病理.术后组织病理': postoperativePathologySchema,
  '病理.染色体分析': chromosomeAnalysisSchema,
  laboratory_records: laboratorySchema,
  imaging_records: imagingSchema,
  genetics_records: geneticsSchema,
  other_exam_records: otherExamSchema,
}

/**
 * 病理报告所有子类型的 schema 集合
 */
export const pathologySubSchemas = {
  '细胞学病理': cytologyPathologySchema,
  '活检组织病理': biopsyPathologySchema,
  '冰冻病理': frozenPathologySchema,
  '术后组织病理': postoperativePathologySchema,
  '染色体分析': chromosomeAnalysisSchema,
}

/**
 * 根据记录数据动态获取要展示的列
 * @param {string} fieldKey - 字段键名
 * @param {Array} records - 记录数组
 * @returns {Array} 要展示的列配置
 */
export function getDisplayColumns(fieldKey, records) {
  const schema = allSchemas[fieldKey]
  if (!schema) {
    // 未知的字段类型，返回通用列配置
    return records.length > 0
      ? Object.keys(records[0])
          .filter(k => !k.startsWith('_'))
          .map(k => ({ key: k, label: k, type: 'text' }))
      : []
  }
  
  // 收集记录中实际存在的字段
  const existingFields = new Set()
  records.forEach(record => {
    Object.keys(record).forEach(key => {
      if (!key.startsWith('_') && record[key] !== null && record[key] !== undefined && record[key] !== '') {
        existingFields.add(key)
      }
    })
  })
  
  // 过滤出有数据的列
  return schema.columns.filter(col => existingFields.has(col.key))
}

/**
 * 检查记录是否有有效内容（不只是条件字段）
 * @param {string} fieldKey - 字段键名
 * @param {Object} record - 单条记录
 * @returns {boolean} 是否有有效内容
 */
export function hasValidContent(fieldKey, record) {
  const schema = allSchemas[fieldKey]
  if (!schema) return true // 未知 schema，保守起见认为有内容
  
  const { conditionalDisplay, primaryDisplayFields } = schema
  
  // 如果有条件展示配置
  if (conditionalDisplay) {
    const condValue = record[conditionalDisplay.conditionalField]
    const shouldShowDetails = conditionalDisplay.showWhen.includes(condValue)
    
    if (!shouldShowDetails) {
      // 条件字段值表示"无"，但这也是有效信息
      return true
    }
    
    // 检查详情字段是否有值
    return conditionalDisplay.fieldsToShow.some(field => {
      const value = record[field]
      return value !== null && value !== undefined && value !== ''
    })
  }
  
  // 如果有主要展示字段，检查是否有值
  if (primaryDisplayFields && primaryDisplayFields.length > 0) {
    return primaryDisplayFields.some(field => {
      const value = record[field]
      return value !== null && value !== undefined && value !== ''
    })
  }
  
  return true
}

/**
 * 获取记录的摘要展示文本
 * @param {string} fieldKey - 字段键名
 * @param {Object} record - 单条记录
 * @returns {string} 摘要文本
 */
export function getRecordSummary(fieldKey, record) {
  const schema = allSchemas[fieldKey]
  if (!schema) {
    // 未知 schema，返回第一个非空值
    for (const [key, value] of Object.entries(record)) {
      if (!key.startsWith('_') && value) {
        return String(value)
      }
    }
    return '（无详情）'
  }
  
  const { conditionalDisplay, primaryDisplayFields } = schema
  
  // 如果有条件展示配置
  if (conditionalDisplay) {
    const condValue = record[conditionalDisplay.conditionalField]
    const shouldShowDetails = conditionalDisplay.showWhen.includes(condValue)
    
    if (!shouldShowDetails) {
      // 返回条件字段的值
      return condValue || '无'
    }
  }
  
  // 使用主要展示字段构建摘要
  if (primaryDisplayFields && primaryDisplayFields.length > 0) {
    const parts = []
    for (const field of primaryDisplayFields) {
      const value = record[field]
      if (value !== null && value !== undefined && value !== '') {
        if (Array.isArray(value)) {
          parts.push(`${value.length}项`)
        } else {
          parts.push(String(value))
        }
      }
    }
    if (parts.length > 0) {
      return parts.join(' / ')
    }
  }
  
  return '（无详情）'
}

export default allSchemas

