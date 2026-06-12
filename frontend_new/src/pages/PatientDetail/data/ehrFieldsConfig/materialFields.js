export const materialFields = {
// 其他材料 - 材料信息（可重复）
   materialInfo: {
     name: '材料信息',
     repeatable: true,
     records: [
       {
         id: 'material_1',
         fields: [
           { id: 'CORE156', name: '材料类型', value: '处方', confidence: 'high', source: 'ehr_doc7', editable: true, fieldType: 'fields', uiType: 'select', sensitive: true },
           { id: 'CORE157', name: '名称', value: '门诊处方单', confidence: 'high', source: 'ehr_doc7', editable: true, fieldType: 'fields', uiType: 'text' },
           { id: 'CORE158', name: '来源机构', value: '中山大学附属第三医院', confidence: 'high', source: 'ehr_doc7', editable: true, fieldType: 'fields', uiType: 'text', sensitive: true },
           { id: 'CORE159', name: '日期', value: '2024-01-10', confidence: 'high', source: 'ehr_doc7', editable: true, fieldType: 'fields', uiType: 'date-picker' },
           { id: 'CORE160', name: '金额', value: '1250.00', confidence: 'medium', source: 'ehr_doc7', editable: true, fieldType: 'fields', uiType: 'number', sensitive: true },
           { id: 'CORE161', name: '摘要', value: '吉非替尼片 250mg×30片', confidence: 'high', source: 'ehr_doc7', editable: true, fieldType: 'fields', uiType: 'textarea' },
           { id: 'CORE162', name: '开具人员', value: '李主任', confidence: 'medium', source: 'ehr_doc7', editable: true, fieldType: 'fields', uiType: 'text', sensitive: true },
           { id: 'CORE163', name: '编号', value: 'RX2024-001567', confidence: 'high', source: 'ehr_doc7', editable: true, fieldType: 'fields', uiType: 'text', sensitive: true }
         ]
       }
     ]
   }
}
