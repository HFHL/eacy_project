export const healthFields = {
// 健康状况 - 生活史（不可重复）
  lifestyle: {
    name: '生活史',
    repeatable: false,
    fields: [
      { id: 'CORE026', name: '吸烟史_状态', value: '已戒烟', confidence: 'high', source: 'ehr_doc1', editable: true, fieldType: 'fields', uiType: 'select' },
      { id: 'CORE027', name: '吸烟史_年数', value: '20年', confidence: 'high', source: 'ehr_doc1', editable: true, fieldType: 'fields', uiType: 'number' },
      { id: 'CORE028', name: '吸烟史_日均支数', value: '20支', confidence: 'high', source: 'ehr_doc1', editable: true, fieldType: 'fields', uiType: 'number' },
      { id: 'CORE029', name: '吸烟史_戒烟年份', value: '2022年', confidence: 'high', source: 'ehr_doc1', editable: true, fieldType: 'fields', uiType: 'date-picker' },
      { id: 'CORE030', name: '饮酒史_状态', value: '从不饮酒', confidence: 'medium', source: 'ehr_doc1', editable: true, fieldType: 'fields', uiType: 'select' },
      { id: 'CORE031', name: '饮酒史_频率', value: '', confidence: null, source: null, editable: true, fieldType: 'fields', uiType: 'text', extractable: true },
      { id: 'CORE032', name: '饮酒史_类型', value: '', confidence: null, source: null, editable: true, fieldType: 'fields', uiType: 'text', extractable: true },
      { id: 'CORE033', name: '饮酒史_戒酒年份', value: '', confidence: null, source: null, editable: true, fieldType: 'fields', uiType: 'date-picker', extractable: true }
    ]
  },

// 健康状况 - 个体史（不可重复）
  personalHistory: {
    name: '个体史',
    repeatable: false,
    fields: [
      { id: 'CORE034', name: '出生史', value: '足月顺产，出生体重3.2kg，北京协和医院', confidence: 'medium', source: 'ehr_doc1', editable: true, fieldType: 'fields', uiType: 'textarea', sensitive: true },
      { id: 'CORE035', name: '生长发育史', value: '发育正常，无异常', confidence: 'low', source: 'ehr_doc1', editable: true, fieldType: 'fields', uiType: 'textarea', sensitive: true },
      { id: 'CORE036', name: '居住史', value: '1979-2010年北京；2010年至今上海', confidence: 'medium', source: 'ehr_doc1', editable: true, fieldType: 'fields', uiType: 'textarea' },
      { id: 'CORE037', name: '职业暴露史', value: '无特殊职业暴露', confidence: 'medium', source: 'ehr_doc1', editable: true, fieldType: 'fields', uiType: 'textarea' },
      { id: 'CORE038', name: '疫区旅行史', value: '', confidence: null, source: null, editable: true, fieldType: 'fields', uiType: 'textarea', extractable: true }
    ]
  },

// 健康状况 - 免疫接种史（不可重复）
  immunization: {
    name: '免疫接种史',
    repeatable: false,
    fields: [
      {
        id: 'CORE039_TABLE',
        name: '疫苗接种记录',
        fieldType: 'table_fields',
        confidence: 'medium',
        source: 'ehr_doc1',
        editable: true,
        tableData: [
          {
            id: 'vaccine_1',
            '疫苗名称': 'HPV疫苗',
            '接种日期': '2020-03-15',
            '疫苗剂次': '第1剂',
            '接种备注': '左臂三角肌注射'
          },
          {
            id: 'vaccine_2',
            '疫苗名称': 'HPV疫苗',
            '接种日期': '2020-09-15',
            '疫苗剂次': '第2剂',
            '接种备注': '左臂三角肌注射'
          },
          {
            id: 'vaccine_3',
            '疫苗名称': '流感疫苗',
            '接种日期': '2023-10-20',
            '疫苗剂次': '第1剂',
            '接种备注': '年度接种'
          }
        ]
      }
    ]
  },

// 健康状况 - 生育史（不可重复）
  reproductive: {
    name: '生育史',
    repeatable: false,
    fields: [
      {
        id: 'CORE043_TABLE',
        name: '孕产史记录',
        fieldType: 'table_fields',
        confidence: 'medium',
        source: 'ehr_doc1',
        editable: true,
        tableData: [
          {
            id: 'pregnancy_1',
            '孕次序号': '1',
            '分娩方式': '顺产',
            '分娩日期': '2005-08-15',
            '孕周数': '39',
            '产时备注': '无异常'
          },
          {
            id: 'pregnancy_2',
            '孕次序号': '2',
            '分娩方式': '剖宫产',
            '分娩日期': '2008-03-22',
            '孕周数': '38',
            '产时备注': '胎位不正'
          }
        ]
      }
    ]
  },

// 健康状况 - 生理史（不可重复）
  menstrual: {
    name: '生理史',
    repeatable: false,
    fields: [
      { id: 'CORE048', name: '初潮年龄', value: '13岁', confidence: 'medium', source: 'ehr_doc1', editable: true, fieldType: 'fields', uiType: 'number', sensitive: true },
      { id: 'CORE049', name: '月经周期长度', value: '28天', confidence: 'medium', source: 'ehr_doc1', editable: true, fieldType: 'fields', uiType: 'text', sensitive: true },
      { id: 'CORE050', name: '月经量', value: '中等', confidence: 'medium', source: 'ehr_doc1', editable: true, fieldType: 'fields', uiType: 'select', sensitive: true },
      { id: 'CORE051', name: '周期规律性', value: '规律', confidence: 'medium', source: 'ehr_doc1', editable: true, fieldType: 'fields', uiType: 'select', sensitive: true },
      { id: 'CORE052', name: '末次月经日期', value: '2024-01-05', confidence: 'high', source: 'ehr_doc1', editable: true, fieldType: 'fields', uiType: 'date-picker', sensitive: true }
    ]
  },

// 健康状况 - 既往病史（可重复字段组）
  pastMedical: {
    name: '既往病史',
    repeatable: true,
    records: [
      {
        id: 'pmh_1',
        fields: [
          { id: 'CORE053', name: '既往病史_疾病', value: '高血压', confidence: 'high', source: 'ehr_doc1', editable: true, type: 'text' },
          { id: 'CORE054', name: '既往病史_确诊日期', value: '2020-03', confidence: 'medium', source: 'ehr_doc1', editable: true, type: 'datepicker' }
        ]
      },
      {
        id: 'pmh_2',
        fields: [
          { id: 'CORE053', name: '既往病史_疾病', value: '糖尿病', confidence: 'medium', source: 'ehr_doc1', editable: true, type: 'text' },
          { id: 'CORE054', name: '既往病史_确诊日期', value: '2018-06', confidence: 'low', source: 'ehr_doc1', editable: true, type: 'datepicker' }
        ]
      }
    ]
  },

// 健康状况 - 手术史（可重复字段组）
  surgical: {
    name: '手术史',
    repeatable: true,
    records: [
      {
        id: 'surgery_1',
        fields: [
          { id: 'CORE055', name: '手术史_手术名称', value: '胆囊切除术', confidence: 'high', source: 'ehr_doc1', editable: true, type: 'text' },
          { id: 'CORE056', name: '手术史_日期', value: '2019-08', confidence: 'high', source: 'ehr_doc1', editable: true, type: 'datepicker' },
          { id: 'CORE057', name: '手术史_医院', value: '北京协和医院', confidence: 'high', source: 'ehr_doc1', editable: true, type: 'text' }
        ]
      }
    ]
  },

// 健康状况 - 家族史（不可重复）
  family: {
    name: '家族史',
    repeatable: false,
    fields: [
      {
        id: 'CORE058_TABLE',
        name: '家族疾病史',
        fieldType: 'table_fields',
        confidence: 'medium',
        source: 'ehr_doc1',
        editable: true,
        tableData: [
          {
            id: 'family_1',
            '家族史_关系': '父亲',
            '家族史_疾病': '肺癌'
          },
          {
            id: 'family_2',
            '家族史_关系': '母亲',
            '家族史_疾病': '高血压'
          },
          {
            id: 'family_3',
            '家族史_关系': '兄弟',
            '家族史_疾病': '糖尿病'
          }
        ]
      }
    ]
  },

// 健康状况 - 合并症（不可重复）
  comorbidity: {
    name: '合并症',
    repeatable: false,
    fields: [
      {
        id: 'CORE060_TABLE',
        name: '合并症记录',
        fieldType: 'table_fields',
        confidence: 'high',
        source: 'ehr_doc1',
        editable: true,
        tableData: [
          {
            id: 'comorbidity_1',
            '合并症_疾病': '高血压',
            '合并症_确诊日期': '2020-03'
          },
          {
            id: 'comorbidity_2',
            '合并症_疾病': '糖尿病',
            '合并症_确诊日期': '2018-06'
          }
        ]
      }
    ]
  },

// 健康状况 - 过敏史（不可重复）
  allergy: {
    name: '过敏史',
    repeatable: false,
    fields: [
      {
        id: 'CORE062_TABLE',
        name: '过敏记录',
        fieldType: 'table_fields',
        confidence: 'high',
        source: 'ehr_doc1',
        editable: true,
        tableData: [
          {
            id: 'allergy_1',
            '过敏史': '青霉素'
          },
          {
            id: 'allergy_2',
            '过敏史': '花生'
          }
        ]
      }
    ]
  }
}
