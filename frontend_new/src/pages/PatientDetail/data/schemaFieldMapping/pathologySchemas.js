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
