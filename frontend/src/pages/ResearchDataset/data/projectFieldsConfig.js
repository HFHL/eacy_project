/**
 * 项目患者详情页字段配置数据
 * 基于 ehrFieldsConfig.js 标准结构，定义项目特定的字段组
 * 
 * 字段渲染类型说明：
 * - fields: 普通字段，一个字段名对应一个值
 * - table_fields: 表格字段，需要渲染为嵌套表格，显示多组数据
 * 
 * repeatable说明：
 * - false: 不可重复的字段组（单一实例）
 * - true: 可重复的字段组（可以有多个记录实例）
 */

export const projectFieldsData = {
  // 基本信息 - 复用EHR标准字段组
  personalInfo: {
    name: '个人信息',
    repeatable: false,
    fields: [
      { id: 'CORE001', name: '患者姓名', value: '张三', confidence: 'high', source: 'patient_pool', editable: false, fieldType: 'fields', uiType: 'text' },
      { id: 'CORE002', name: '性别', value: '男', confidence: 'high', source: 'patient_pool', editable: false, fieldType: 'fields', uiType: 'radio' },
      { id: 'CORE003', name: '出生日期', value: '1979-01-15', confidence: 'high', source: 'patient_pool', editable: false, fieldType: 'fields', uiType: 'datepicker' },
      { id: 'CORE004', name: '年龄', value: '45岁', confidence: 'high', source: 'patient_pool', editable: false, fieldType: 'fields', uiType: 'number' },
      { id: 'CORE005', name: '证件类型', value: '身份证', confidence: 'high', source: 'patient_pool', editable: false, fieldType: 'fields', uiType: 'text' },
      { id: 'CORE006', name: '证件号码', value: '110101197901****15', confidence: 'high', source: 'patient_pool', editable: false, fieldType: 'fields', uiType: 'text', sensitive: true }
    ]
  },

  // 项目特有字段组 - 肿瘤信息（基于病理报告和影像检查）
  tumorInfo: {
    name: '肿瘤信息',
    repeatable: false,
    fields: [
      { id: 'TUMOR001', name: '原发部位', value: '左肺下叶', confidence: 'high', source: 'doc1', editable: true, fieldType: 'fields', uiType: 'text' },
      { id: 'TUMOR002', name: '病理类型', value: '腺癌', confidence: 'high', source: 'doc1', editable: true, fieldType: 'fields', uiType: 'text' },
      { id: 'TUMOR003', name: 'TNM分期', value: 'T2N1M0', confidence: 'medium', source: 'doc1', editable: true, fieldType: 'fields', uiType: 'text', hasConflict: true, conflictValues: ['T2N1M0', 'T2N0M0'] },
      { id: 'TUMOR004', name: '分子标记物', value: 'EGFR+', confidence: 'high', source: 'doc2', editable: true, fieldType: 'fields', uiType: 'text' },
      { id: 'TUMOR005', name: '转移部位', value: '', confidence: null, source: null, editable: true, fieldType: 'fields', uiType: 'text', extractable: true },
      { id: 'TUMOR006', name: '肿瘤大小', value: '2.5cm', confidence: 'high', source: 'doc3', editable: true, fieldType: 'fields', uiType: 'text' }
    ]
  },

  // 项目特有字段组 - 治疗记录（可重复）
  treatmentRecords: {
    name: '治疗记录',
    repeatable: true,
    records: [
      {
        id: 'treatment_1',
        fields: [
          { id: 'TREAT001_1', name: '治疗方案', value: '手术切除', confidence: 'high', source: 'doc2', editable: true, fieldType: 'fields', uiType: 'text' },
          { id: 'TREAT002_1', name: '周期数', value: '1', confidence: 'high', source: 'doc2', editable: true, fieldType: 'fields', uiType: 'number' },
          { id: 'TREAT003_1', name: '起止日期', value: '2024-01-15', confidence: 'high', source: 'doc2', editable: true, fieldType: 'fields', uiType: 'datepicker' },
          { id: 'TREAT004_1', name: '疗效评估', value: '完全切除', confidence: 'high', source: 'doc3', editable: true, fieldType: 'fields', uiType: 'text' },
          { id: 'TREAT005_1', name: '不良反应', value: ['无明显不良反应'], confidence: 'high', source: 'doc3', editable: true, fieldType: 'fields', uiType: 'textarea', isMultiple: true }
        ]
      },
      {
        id: 'treatment_2',
        fields: [
          { id: 'TREAT001_2', name: '治疗方案', value: '吉非替尼靶向治疗', confidence: 'high', source: 'doc4', editable: true, fieldType: 'fields', uiType: 'text' },
          { id: 'TREAT002_2', name: '周期数', value: '6', confidence: 'high', source: 'doc4', editable: true, fieldType: 'fields', uiType: 'number' },
          { id: 'TREAT003_2', name: '起止日期', value: '2024-02-01至今', confidence: 'high', source: 'doc4', editable: true, fieldType: 'fields', uiType: 'datepicker' },
          { id: 'TREAT004_2', name: '疗效评估', value: '部分缓解', confidence: 'medium', source: 'doc5', editable: true, fieldType: 'fields', uiType: 'text' },
          { id: 'TREAT005_2', name: '不良反应', value: ['轻度皮疹', '乏力'], confidence: 'medium', source: 'doc5', editable: true, fieldType: 'fields', uiType: 'textarea', isMultiple: true }
        ]
      }
    ]
  },

  // 项目特有字段组 - 随访记录（可重复）
  followUpRecords: {
    name: '随访记录',
    repeatable: true,
    records: [
      {
        id: 'followup_1',
        fields: [
          { id: 'FOLLOW001_1', name: '随访日期', value: '2024-03-01', confidence: 'high', source: 'doc3', editable: true, fieldType: 'fields', uiType: 'datepicker' },
          { id: 'FOLLOW002_1', name: '症状评估', value: '', confidence: null, source: null, editable: true, fieldType: 'fields', uiType: 'textarea', extractable: true },
          { id: 'FOLLOW003_1', name: '影像学检查', value: '', confidence: null, source: null, editable: true, fieldType: 'fields', uiType: 'textarea', extractable: true },
          { id: 'FOLLOW004_1', name: '生存质量评分', value: '', confidence: null, source: null, editable: true, fieldType: 'fields', uiType: 'number', extractable: true },
          { id: 'FOLLOW005_1', name: '下次随访计划', value: '', confidence: null, source: null, editable: true, fieldType: 'fields', uiType: 'datepicker', extractable: true }
        ]
      }
    ]
  },

  // 项目特有字段组 - 日志记录（用于PROJ004项目）
  logRecords: {
    name: '日志记录',
    repeatable: true,
    records: [
      {
        id: 'log_1',
        fields: [
          { id: 'LOG001_1', name: '日志时间', value: '2024-01-15 14:30:25', confidence: 'high', source: 'doc1', editable: true, fieldType: 'fields', uiType: 'datetime' },
          { id: 'LOG002_1', name: '日志级别', value: 'INFO', confidence: 'high', source: 'doc1', editable: true, fieldType: 'fields', uiType: 'select' },
          { id: 'LOG003_1', name: '日志内容', value: '', confidence: null, source: null, editable: true, fieldType: 'fields', uiType: 'textarea', extractable: true }
        ]
      }
    ]
  },

  // 复用EHR标准字段组 - 诊断记录
  diagnosis: {
    name: '诊断记录',
    repeatable: true,
    records: [
      {
        id: 'diag_1',
        fields: [
          { id: 'CORE063', name: '诊断名称（原文）', value: '右肺腺癌T1aN0M0', confidence: 'high', source: 'doc3', editable: true, fieldType: 'fields', uiType: 'text' },
          { id: 'CORE064', name: '诊断标准编码', value: 'C34.1', confidence: 'high', source: 'doc3', editable: true, fieldType: 'fields', uiType: 'text' },
          { id: 'CORE065', name: '诊断类型', value: '主诊断', confidence: 'high', source: 'doc3', editable: true, fieldType: 'fields', uiType: 'select' },
          { id: 'CORE066', name: '确诊时间', value: '2024-01-10', confidence: 'high', source: 'doc3', editable: true, fieldType: 'fields', uiType: 'datepicker' },
          { id: 'CORE067', name: '诊断机构', value: '中山大学附属第三医院', confidence: 'high', source: 'doc3', editable: true, fieldType: 'fields', uiType: 'text' },
          { id: 'CORE068', name: '诊断医生', value: '李主任', confidence: 'medium', source: 'doc3', editable: true, fieldType: 'fields', uiType: 'text' },
          { id: 'CORE069', name: '是否为当前诊断', value: 'true', confidence: 'high', source: 'doc3', editable: true, fieldType: 'fields', uiType: 'checkbox' }
        ]
      }
    ]
  },

  // 复用EHR标准字段组 - 用药记录
  medication: {
    name: '用药记录',
    repeatable: true,
    records: [
      {
        id: 'med_1',
        fields: [
          { id: 'CORE079', name: '药物名称', value: '吉非替尼', confidence: 'high', source: 'doc4', editable: true, fieldType: 'fields', uiType: 'text' },
          { id: 'CORE080', name: '剂量', value: '250mg', confidence: 'high', source: 'doc4', editable: true, fieldType: 'fields', uiType: 'text' },
          { id: 'CORE081', name: '给药途径', value: '口服', confidence: 'high', source: 'doc4', editable: true, fieldType: 'fields', uiType: 'select' },
          { id: 'CORE082', name: '给药频率', value: '每日一次', confidence: 'high', source: 'doc4', editable: true, fieldType: 'fields', uiType: 'text' },
          { id: 'CORE083', name: '周期时长', value: '持续用药', confidence: 'high', source: 'doc4', editable: true, fieldType: 'fields', uiType: 'text' },
          { id: 'CORE085', name: '用药开始时间', value: '2024-01-10', confidence: 'high', source: 'doc4', editable: true, fieldType: 'fields', uiType: 'datepicker' },
          { id: 'CORE086', name: '用药结束时间', value: '', confidence: null, source: null, editable: true, fieldType: 'fields', uiType: 'datepicker', extractable: true },
          { id: 'CORE088', name: '不良反应/备注', value: '轻微皮疹，可耐受', confidence: 'medium', source: 'doc4', editable: true, fieldType: 'fields', uiType: 'textarea', sensitive: true }
        ]
      }
    ]
  }
}

export default projectFieldsData