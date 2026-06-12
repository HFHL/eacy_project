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
