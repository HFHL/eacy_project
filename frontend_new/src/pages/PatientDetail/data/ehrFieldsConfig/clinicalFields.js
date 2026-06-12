export const clinicalFields = {
// 诊疗信息 - 诊断记录（可重复字段组）
  diagnosis: {
    name: '诊断记录',
    repeatable: true,
    records: [
      {
        id: 'diag_1',
        fields: [
          { id: 'CORE063', name: '诊断名称（原文）', value: '右肺腺癌T1aN0M0', confidence: 'high', source: 'ehr_doc3', editable: true, type: 'text' },
          { id: 'CORE064', name: '诊断标准编码', value: 'C34.1', confidence: 'high', source: 'ehr_doc3', editable: true, type: 'text' },
          { id: 'CORE065', name: '诊断类型', value: '主诊断', confidence: 'high', source: 'ehr_doc3', editable: true, type: 'select' },
          { id: 'CORE066', name: '确诊时间', value: '2024-01-10', confidence: 'high', source: 'ehr_doc3', editable: true, type: 'datepicker' },
          { id: 'CORE067', name: '诊断机构', value: '中山大学附属第三医院', confidence: 'high', source: 'ehr_doc3', editable: true, type: 'text' },
          { id: 'CORE068', name: '诊断医生', value: '李主任', confidence: 'medium', source: 'ehr_doc3', editable: true, type: 'text' },
          { id: 'CORE069', name: '是否为当前诊断', value: 'true', confidence: 'high', source: 'ehr_doc3', editable: true, type: 'checkbox' }
        ]
      },
      {
        id: 'diag_2',
        fields: [
          { id: 'CORE063_2', name: '诊断名称（原文）', value: '高血压', confidence: 'high', source: 'ehr_doc1', editable: true, type: 'text' },
          { id: 'CORE064_2', name: '诊断标准编码', value: 'I10', confidence: 'medium', source: 'ehr_doc1', editable: true, type: 'text' },
          { id: 'CORE065_2', name: '诊断类型', value: '次诊断', confidence: 'high', source: 'ehr_doc1', editable: true, type: 'select' },
          { id: 'CORE066_2', name: '确诊时间', value: '2020-03-15', confidence: 'medium', source: 'ehr_doc1', editable: true, type: 'datepicker' },
          { id: 'CORE067_2', name: '诊断机构', value: '北京协和医院', confidence: 'medium', source: 'ehr_doc1', editable: true, type: 'text' },
          { id: 'CORE068_2', name: '诊断医生', value: '王医生', confidence: 'low', source: 'ehr_doc1', editable: true, type: 'text' },
          { id: 'CORE069_2', name: '是否为当前诊断', value: 'false', confidence: 'high', source: 'ehr_doc1', editable: true, type: 'checkbox' }
        ]
      }
    ]
  },

// 诊疗信息 - 治疗记录（可重复字段组）
  treatment: {
    name: '治疗记录',
    repeatable: true,
    records: [
      {
        id: 'treatment_1',
        fields: [
          { id: 'CORE070', name: '治疗类型', value: '靶向治疗', confidence: 'high', source: 'ehr_doc4', editable: true, fieldType: 'fields', uiType: 'select' },
          { id: 'CORE071', name: '治疗方案/药物', value: '吉非替尼', confidence: 'high', source: 'ehr_doc4', editable: true, fieldType: 'fields', uiType: 'text' },
          { id: 'CORE072', name: '开始时间', value: '2024-01-10', confidence: 'high', source: 'ehr_doc4', editable: true, fieldType: 'fields', uiType: 'datepicker' },
          { id: 'CORE073', name: '结束时间', value: '', confidence: null, source: null, editable: true, fieldType: 'fields', uiType: 'datepicker', extractable: true },
          { id: 'CORE074', name: '治疗阶段', value: '一线', confidence: 'high', source: 'ehr_doc4', editable: true, fieldType: 'fields', uiType: 'select' },
          { id: 'CORE075', name: '是否住院实施', value: 'false', confidence: 'high', source: 'ehr_doc4', editable: true, fieldType: 'fields', uiType: 'checkbox' },
          { id: 'CORE076', name: '执行机构', value: '中山大学附属第三医院肿瘤科', confidence: 'high', source: 'ehr_doc4', editable: true, fieldType: 'fields', uiType: 'text' },
          { id: 'CORE077', name: '治疗结果', value: '进行中', confidence: 'high', source: 'ehr_doc4', editable: true, fieldType: 'fields', uiType: 'select' },
          { id: 'CORE078', name: '特殊说明', value: '因EGFR L858R突变选择吉非替尼', confidence: 'high', source: 'ehr_doc4', editable: true, fieldType: 'fields', uiType: 'textarea' }
        ]
      }
    ]
  },

// 诊疗信息 - 用药记录（可重复字段组）
  medication: {
    name: '用药记录',
    repeatable: true,
    records: [
      {
        id: 'med_1',
        fields: [
          { id: 'CORE079', name: '药物名称', value: '吉非替尼', confidence: 'high', source: 'ehr_doc4', editable: true, fieldType: 'fields', uiType: 'text' },
          { id: 'CORE080', name: '剂量', value: '250mg', confidence: 'high', source: 'ehr_doc4', editable: true, fieldType: 'fields', uiType: 'text' },
          { id: 'CORE081', name: '给药途径', value: '口服', confidence: 'high', source: 'ehr_doc4', editable: true, fieldType: 'fields', uiType: 'select' },
          { id: 'CORE082', name: '给药频率', value: '每日一次', confidence: 'high', source: 'ehr_doc4', editable: true, fieldType: 'fields', uiType: 'text' },
          { id: 'CORE083', name: '周期时长', value: '持续用药', confidence: 'high', source: 'ehr_doc4', editable: true, fieldType: 'fields', uiType: 'text' },
          { id: 'CORE084', name: '周期次数', value: '', confidence: null, source: null, editable: true, fieldType: 'fields', uiType: 'number', extractable: true },
          { id: 'CORE085', name: '用药开始时间', value: '2024-01-10', confidence: 'high', source: 'ehr_doc4', editable: true, fieldType: 'fields', uiType: 'datepicker' },
          { id: 'CORE086', name: '用药结束时间', value: '', confidence: null, source: null, editable: true, fieldType: 'fields', uiType: 'datepicker', extractable: true },
          { id: 'CORE087', name: '治疗记录关联ID', value: 'treatment_1', confidence: 'high', source: 'ehr_doc4', editable: true, fieldType: 'fields', uiType: 'text' },
          { id: 'CORE088', name: '不良反应/备注', value: '轻微皮疹，可耐受', confidence: 'medium', source: 'ehr_doc4', editable: true, fieldType: 'fields', uiType: 'textarea', sensitive: true }
        ]
      },
      {
        id: 'med_2',
        fields: [
          { id: 'CORE079_2', name: '药物名称', value: '阿司匹林', confidence: 'medium', source: 'ehr_doc4', editable: true, fieldType: 'fields', uiType: 'text' },
          { id: 'CORE080_2', name: '剂量', value: '100mg', confidence: 'medium', source: 'ehr_doc4', editable: true, fieldType: 'fields', uiType: 'text' },
          { id: 'CORE081_2', name: '给药途径', value: '口服', confidence: 'medium', source: 'ehr_doc4', editable: true, fieldType: 'fields', uiType: 'select' },
          { id: 'CORE082_2', name: '给药频率', value: '每日一次', confidence: 'medium', source: 'ehr_doc4', editable: true, fieldType: 'fields', uiType: 'text' },
          { id: 'CORE083_2', name: '周期时长', value: '长期用药', confidence: 'medium', source: 'ehr_doc4', editable: true, fieldType: 'fields', uiType: 'text' },
          { id: 'CORE084_2', name: '周期次数', value: '', confidence: null, source: null, editable: true, fieldType: 'fields', uiType: 'number', extractable: true },
          { id: 'CORE085_2', name: '用药开始时间', value: '2020-03-15', confidence: 'medium', source: 'ehr_doc4', editable: true, fieldType: 'fields', uiType: 'datepicker' },
          { id: 'CORE086_2', name: '用药结束时间', value: '', confidence: null, source: null, editable: true, fieldType: 'fields', uiType: 'datepicker', extractable: true },
          { id: 'CORE087_2', name: '治疗记录关联ID', value: '', confidence: null, source: null, editable: true, fieldType: 'fields', uiType: 'text', extractable: true },
          { id: 'CORE088_2', name: '不良反应/备注', value: '无明显不良反应', confidence: 'medium', source: 'ehr_doc4', editable: true, fieldType: 'fields', uiType: 'textarea' }
        ]
      }
    ]
  }
}
