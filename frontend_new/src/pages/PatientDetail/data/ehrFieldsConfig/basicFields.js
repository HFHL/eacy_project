export const basicFields = {
// 基本信息 - 个人信息（不可重复）
  personalInfo: {
    name: '个人信息',
    repeatable: false,
    fields: [
      { id: 'CORE001', name: '患者姓名', value: '张三', confidence: 'high', source: 'ehr_doc1', editable: false, fieldType: 'fields', uiType: 'text' },
      { id: 'CORE002', name: '性别', value: '男', confidence: 'high', source: 'ehr_doc1', editable: false, fieldType: 'fields', uiType: 'radio' },
      { id: 'CORE003', name: '出生日期', value: '1979-01-15', confidence: 'high', source: 'ehr_doc1', editable: false, fieldType: 'fields', uiType: 'datepicker' },
      { id: 'CORE004', name: '年龄', value: '45岁', confidence: 'high', source: 'ehr_doc1', editable: false, fieldType: 'fields', uiType: 'number' },
      { id: 'CORE005', name: '证件类型', value: '身份证', confidence: 'high', source: 'ehr_doc1', editable: false, fieldType: 'fields', uiType: 'text' },
      { id: 'CORE006', name: '证件号码', value: '110101197901****15', confidence: 'high', source: 'ehr_doc1', editable: false, fieldType: 'fields', uiType: 'text', sensitive: true }
    ]
  },

// 基本信息 - 联系方式（不可重复）
  contactInfo: {
    name: '联系方式',
    repeatable: false,
    fields: [
      { id: 'CORE007', name: '手机号码', value: '138****5678', confidence: 'medium', source: 'ehr_doc1', editable: true, type: 'text', sensitive: true },
      { id: 'CORE008', name: '家庭住址', value: '北京市朝阳区***', confidence: 'medium', source: 'ehr_doc1', editable: true, type: 'textarea', sensitive: true },
      { id: 'CORE014', name: '紧急联系人姓名', value: '李四', confidence: 'medium', source: 'ehr_doc1', editable: true, type: 'text' },
      { id: 'CORE015', name: '紧急联系人电话', value: '139****1234', confidence: 'medium', source: 'ehr_doc1', editable: true, type: 'text', sensitive: true },
      { id: 'CORE016', name: '紧急联系人关系', value: '配偶', confidence: 'medium', source: 'ehr_doc1', editable: true, type: 'select' }
    ]
  },

// 基本信息 - 人口学（不可重复）
  demographics: {
    name: '人口学',
    repeatable: false,
    fields: [
      { id: 'CORE009', name: '婚姻状况', value: '已婚', confidence: 'medium', source: 'ehr_doc1', editable: true, fieldType: 'fields', uiType: 'select' },
      { id: 'CORE010', name: '教育水平', value: '本科', confidence: 'medium', source: 'ehr_doc1', editable: true, fieldType: 'fields', uiType: 'select' },
      { id: 'CORE011', name: '职业', value: '工程师', confidence: 'medium', source: 'ehr_doc1', editable: true, fieldType: 'fields', uiType: 'text' },
      { id: 'CORE012', name: '民族', value: '汉族', confidence: 'high', source: 'ehr_doc1', editable: true, fieldType: 'fields', uiType: 'select' },
      { id: 'CORE013', name: '医保类型', value: '', confidence: null, source: null, editable: true, fieldType: 'fields', uiType: 'select', extractable: true }
    ]
  },

// 基本信息 - 紧急联系人（不可重复）
  emergencyContact: {
    name: '紧急联系人',
    repeatable: false,
    fields: [
      { id: 'CORE014', name: '紧急联系人姓名', value: '李四', confidence: 'medium', source: 'ehr_doc1', editable: true, fieldType: 'fields', uiType: 'text', sensitive: true },
      { id: 'CORE015', name: '紧急联系人电话', value: '139****1234', confidence: 'medium', source: 'ehr_doc1', editable: true, fieldType: 'fields', uiType: 'text', sensitive: true },
      { id: 'CORE016', name: '紧急联系人关系', value: '配偶', confidence: 'medium', source: 'ehr_doc1', editable: true, fieldType: 'fields', uiType: 'select', sensitive: true }
    ]
  }
}
