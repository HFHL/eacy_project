/**
 * 患者详情页面模拟数据
 */

// 模拟AI病情综述数据
export const mockAiSummary = {
  content: `## 患者基本情况

**张三**，男性，45岁，肿瘤科患者，主要诊断为**肺腺癌**[1]、**高血压**[2]。

## 既往史

- **个人史**：吸烟史20年，每日1包，已戒烟2年[1]
- **家族史**：父亲有肺癌病史，母亲有高血压病史[1]  
- **过敏史**：青霉素过敏[2]

## 诊疗时间线

### 2024-01-08 - 初次就诊
- 用药记录建立，开始**吉非替尼**靶向治疗250mg/日[4]

### 2024-01-10 - 病理确诊
- 病理报告确诊**肺腺癌**，分化程度中等[3]
- 入院治疗，主治医生**李主任**

### 2024-01-12 - 影像学检查
- 胸部CT显示左肺下叶结节，大小约**2.5cm**[2]
- 未见明显转移征象

### 2024-01-15 - 实验室检查
- **血常规**：白细胞6.5×10⁹/L（正常），红细胞4.2×10¹²/L（略低），血红蛋白125g/L（略低）[1]
- 提示**轻度贫血**，需要关注

## 当前诊疗状况

患者目前病情**稳定**，正在接受吉非替尼靶向治疗，配合度良好。

**医嘱建议**：定期复查血常规和胸部CT，监测治疗效果和副作用。`,
  lastUpdate: '2024-01-17 15:30',
  confidence: 92,
  sourceDocuments: [
    { id: 'doc1', name: '血常规报告_20240115.pdf', ref: '[1]' },
    { id: 'doc2', name: 'CT影像_20240112.jpg', ref: '[2]' },
    { id: 'doc3', name: '病理报告_20240110.pdf', ref: '[3]' },
    { id: 'doc4', name: '用药记录.xlsx', ref: '[4]' }
  ]
}

// 模拟患者基本信息
export const mockPatientInfo = {
  id: 'P001',
  name: '张三',
  gender: '男',
  age: 45,
  birthDate: '1979-01-15',
  phone: '138****5678',
  idCard: '110101197901****15',
  address: '北京市朝阳区***',
  diagnosis: ['肺腺癌', '高血压'],
  department: '肿瘤科',
  doctor: '李主任',
  admissionDate: '2024-01-10',
  completeness: 92,
  projects: ['靶向药副作用研究', '免疫治疗效果评估'],
  status: 'active',
  notes: '患者配合度良好，定期复查'
}

// 电子病历夹字段组数据结构（基于真实CSV配置）
export const mockEhrFieldGroups = [
  {
    key: 'basicInfo',
    name: '基本信息',
    status: 'completed',
    completeness: 95,
    fieldCount: 16,
    extractedCount: 15,
    children: [
      {
        key: 'personalInfo',
        name: '个人信息',
        status: 'completed',
        completeness: 100,
        fieldCount: 6,
        extractedCount: 6
      },
      {
        key: 'contactInfo',
        name: '联系方式',
        status: 'completed',
        completeness: 100,
        fieldCount: 5,
        extractedCount: 5
      },
      {
        key: 'demographics',
        name: '人口学',
        status: 'partial',
        completeness: 80,
        fieldCount: 5,
        extractedCount: 4
      },
      {
        key: 'emergencyContact',
        name: '紧急联系人',
        status: 'partial',
        completeness: 67,
        fieldCount: 3,
        extractedCount: 2
      }
    ]
  },
  {
    key: 'healthStatus',
    name: '健康状况',
    status: 'partial',
    completeness: 65,
    fieldCount: 35,
    extractedCount: 23,
    children: [
      {
        key: 'lifestyle',
        name: '生活史',
        status: 'completed',
        completeness: 100,
        fieldCount: 8,
        extractedCount: 8
      },
      {
        key: 'personalHistory',
        name: '个体史',
        status: 'partial',
        completeness: 60,
        fieldCount: 5,
        extractedCount: 3
      },
      {
        key: 'immunization',
        name: '免疫接种史',
        status: 'incomplete',
        completeness: 25,
        fieldCount: 4,
        extractedCount: 1
      },
      {
        key: 'reproductive',
        name: '生育史',
        status: 'incomplete',
        completeness: 20,
        fieldCount: 5,
        extractedCount: 1
      },
      {
        key: 'menstrual',
        name: '生理史',
        status: 'incomplete',
        completeness: 40,
        fieldCount: 5,
        extractedCount: 2
      },
      {
        key: 'pastMedical',
        name: '既往病史',
        status: 'partial',
        completeness: 75,
        fieldCount: 2,
        extractedCount: 2
      },
      {
        key: 'surgical',
        name: '手术史',
        status: 'incomplete',
        completeness: 33,
        fieldCount: 3,
        extractedCount: 1
      },
      {
        key: 'family',
        name: '家族史',
        status: 'partial',
        completeness: 50,
        fieldCount: 2,
        extractedCount: 1
      },
      {
        key: 'comorbidity',
        name: '合并症',
        status: 'completed',
        completeness: 100,
        fieldCount: 2,
        extractedCount: 2
      },
      {
        key: 'allergy',
        name: '过敏史',
        status: 'completed',
        completeness: 100,
        fieldCount: 1,
        extractedCount: 1
      }
    ]
  },
  {
    key: 'clinicalInfo',
    name: '诊疗信息',
    status: 'partial',
    completeness: 70,
    fieldCount: 18,
    extractedCount: 13,
    children: [
      {
        key: 'diagnosis',
        name: '诊断记录',
        status: 'completed',
        completeness: 100,
        fieldCount: 7,
        extractedCount: 7
      },
      {
        key: 'treatment',
        name: '治疗记录',
        status: 'partial',
        completeness: 60,
        fieldCount: 8,
        extractedCount: 5
      },
      {
        key: 'medication',
        name: '用药记录',
        status: 'incomplete',
        completeness: 33,
        fieldCount: 9,
        extractedCount: 3
      }
    ]
  },
  {
    key: 'examination',
    name: '检查检验',
    status: 'partial',
    completeness: 55,
    fieldCount: 45,
    extractedCount: 25,
    children: [
      {
        key: 'pathology',
        name: '病理报告',
        status: 'completed',
        completeness: 100,
        fieldCount: 9,
        extractedCount: 9
      },
      {
        key: 'genetics',
        name: '基因检测',
        status: 'partial',
        completeness: 70,
        fieldCount: 15,
        extractedCount: 11
      },
      {
        key: 'imaging',
        name: '影像检查',
        status: 'partial',
        completeness: 60,
        fieldCount: 12,
        extractedCount: 7
      },
      {
        key: 'laboratory',
        name: '实验室检查',
        status: 'incomplete',
        completeness: 30,
        fieldCount: 8,
        extractedCount: 2
      },
      {
        key: 'otherExam',
        name: '其他检查',
        status: 'incomplete',
        completeness: 20,
        fieldCount: 10,
        extractedCount: 2
      }
    ]
  },
  {
    key: 'otherMaterials',
    name: '其他材料',
    status: 'incomplete',
    completeness: 10,
    fieldCount: 8,
    extractedCount: 1,
    children: [
      {
        key: 'materialInfo',
        name: '材料信息',
        status: 'incomplete',
        completeness: 10,
        fieldCount: 8,
        extractedCount: 1
      }
    ]
  }
]

// 电子病历夹文档数据
export const mockEhrDocuments = [
  {
    id: 'ehr_doc1',
    name: '入院记录_20240110.pdf',
    category: '病历文书',
    status: 'extracted',
    confidence: 'high',
    uploadDate: '2024-01-10',
    extractedFields: ['现病史', '既往史', '体格检查']
  },
  {
    id: 'ehr_doc2',
    name: '血常规_20240115.pdf',
    category: '检验报告',
    status: 'extracted',
    confidence: 'high',
    uploadDate: '2024-01-15',
    extractedFields: ['血常规', '生化指标']
  },
  {
    id: 'ehr_doc3',
    name: 'CT报告_20240112.pdf',
    category: '影像报告',
    status: 'extracted',
    confidence: 'medium',
    uploadDate: '2024-01-12',
    extractedFields: ['影像所见', '影像诊断']
  },
  {
    id: 'ehr_doc4',
    name: '用药记录_20240108.xlsx',
    category: '用药信息',
    status: 'pending',
    confidence: null,
    uploadDate: '2024-01-08',
    extractedFields: []
  },
  {
    id: 'ehr_doc5',
    name: '基因检测报告_20240114.pdf',
    category: '基因检测',
    status: 'extracted',
    confidence: 'high',
    uploadDate: '2024-01-14',
    extractedFields: ['EGFR突变', 'TP53突变', '检测类型', '标本类型'],
    preview: '基因检测报告\n\n检测类型：NGS\n标本类型：组织切片\n\nEGFR突变：L858R（敏感突变）\nTP53突变：R273H（未知意义）'
  },
  {
    id: 'ehr_doc6',
    name: '肺功能检查_20240108.pdf',
    category: '其他检查',
    status: 'extracted',
    confidence: 'high',
    uploadDate: '2024-01-08',
    extractedFields: ['肺功能检查', '检查机构', '报告结论'],
    preview: '肺功能检查报告\n\n检查机构：中山大学附属第三医院呼吸科\n检查日期：2024-01-08\n\n报告结论：肺功能轻度受限，FEV1/FVC比值降低'
  },
  {
    id: 'ehr_doc7',
    name: '门诊处方单_20240110.pdf',
    category: '用药信息',
    status: 'extracted',
    confidence: 'medium',
    uploadDate: '2024-01-10',
    extractedFields: ['药物名称', '用法用量', '开具人员'],
    preview: '门诊处方单\n\n药物：吉非替尼片 250mg×30片\n用法：每日一次，口服\n开具人员：李主任'
  }
]

// 模拟文档数据 - 更新为新的数据结构
export const mockDocuments = [
  {
    id: 'doc1',
    fileName: '血常规报告_20240115.pdf',
    fileFormat: 'pdf',
    fileSize: '2.3MB',
    uploadTime: '2024-01-15 10:30:00',
    status: 'extracted',
    confidence: 0.95,
    metadata: {
      identifierType: '住院号',
      identifierValue: 'H202401001',
      organizationName: '中山大学附属第三医院',
      patientName: '张**',
      gender: '男',
      age: 45,
      documentType: '实验室检查',
      documentSubtype: '血常规',
      effectiveDate: '2024-01-15',
      parsedText: '血常规检查报告...'
    },
    extractedFields: [
      { fieldId: 'wbc_count', fieldName: '白细胞计数', value: '6.5', unit: '×10^9/L', confidence: 0.98, source: 'step3' },
      { fieldId: 'rbc_count', fieldName: '红细胞计数', value: '4.2', unit: '×10^12/L', confidence: 0.85, source: 'step3' },
      { fieldId: 'hemoglobin', fieldName: '血红蛋白', value: '125', unit: 'g/L', confidence: 0.95, source: 'step3' }
    ],
    patientBinding: {
      patientId: 'P001',
      bindingConfidence: 0.95,
      bindingMethod: 'auto'
    }
  },
  {
    id: 'doc2',
    fileName: 'CT影像_20240112.jpg',
    fileFormat: 'jpg',
    fileSize: '5.2MB',
    uploadTime: '2024-01-12 14:20:00',
    status: 'extracted',
    confidence: 0.82,
    metadata: {
      identifierType: '住院号',
      identifierValue: 'H202401001',
      organizationName: '中山大学附属第三医院',
      patientName: '张**',
      gender: '男',
      age: 45,
      documentType: '影像检查',
      documentSubtype: 'CT检查',
      effectiveDate: '2024-01-12',
      parsedText: 'CT影像检查报告...'
    },
    extractedFields: [
      { fieldId: 'exam_site', fieldName: '检查部位', value: '胸部', unit: '', confidence: 0.98, source: 'step3' },
      { fieldId: 'findings', fieldName: '影像所见', value: '左肺下叶结节，大小约2.5cm', unit: '', confidence: 0.75, source: 'step3' }
    ],
    patientBinding: {
      patientId: 'P001',
      bindingConfidence: 0.88,
      bindingMethod: 'auto'
    }
  },
  {
    id: 'doc3',
    fileName: '病理报告_20240110.pdf',
    fileFormat: 'pdf',
    fileSize: '1.8MB',
    uploadTime: '2024-01-10 16:45:00',
    status: 'extracted',
    confidence: 0.92,
    metadata: {
      identifierType: '病案号',
      identifierValue: 'B202401001',
      organizationName: '中山大学附属第三医院',
      patientName: '张**',
      gender: '男',
      age: 45,
      documentType: '病理报告',
      documentSubtype: '手术病理',
      effectiveDate: '2024-01-10',
      parsedText: '病理检查报告...'
    },
    extractedFields: [
      { fieldId: 'pathology_diagnosis', fieldName: '病理诊断', value: '肺腺癌', unit: '', confidence: 0.95, source: 'step3' },
      { fieldId: 'differentiation', fieldName: '分化程度', value: '中等分化', unit: '', confidence: 0.88, source: 'step3' }
    ],
    patientBinding: {
      patientId: 'P001',
      bindingConfidence: 0.92,
      bindingMethod: 'auto'
    }
  },
  {
    id: 'doc4',
    fileName: '用药记录_20240108.xlsx',
    fileFormat: 'xlsx',
    fileSize: '0.5MB',
    uploadTime: '2024-01-08 09:15:00',
    status: 'pending',
    confidence: null,
    metadata: {
      identifierType: '住院号',
      identifierValue: 'H202401001',
      organizationName: '中山大学附属第三医院',
      patientName: '张**',
      gender: '男',
      age: 45,
      documentType: '其他材料',
      documentSubtype: '处方单',
      effectiveDate: '2024-01-08',
      parsedText: '用药记录表格...'
    },
    extractedFields: [],
    patientBinding: {
      patientId: 'P001',
      bindingConfidence: 0.90,
      bindingMethod: 'auto'
    }
  },
  {
    id: 'doc5',
    fileName: '基因检测报告_20240105.pdf',
    fileFormat: 'pdf',
    fileSize: '3.1MB',
    uploadTime: '2024-01-05 11:30:00',
    status: 'extracted',
    confidence: 0.88,
    metadata: {
      identifierType: 'MRN',
      identifierValue: 'MRN20240001',
      organizationName: '广州协和医院',
      patientName: '张**',
      gender: '男',
      age: 45,
      documentType: '基因检测',
      documentSubtype: 'NGS靶向基因检测',
      effectiveDate: '2024-01-05',
      parsedText: '基因检测报告...'
    },
    extractedFields: [
      { fieldId: 'egfr_mutation', fieldName: 'EGFR突变', value: '19号外显子缺失', unit: '', confidence: 0.92, source: 'step3' },
      { fieldId: 'kras_mutation', fieldName: 'KRAS突变', value: '野生型', unit: '', confidence: 0.85, source: 'step3' }
    ],
    patientBinding: {
      patientId: 'P001',
      bindingConfidence: 0.88,
      bindingMethod: 'auto'
    }
  },
  {
    id: 'doc6',
    fileName: '心电图_20240103.pdf',
    fileFormat: 'pdf',
    fileSize: '1.2MB',
    uploadTime: '2024-01-03 15:20:00',
    status: 'processing',
    confidence: null,
    metadata: {
      identifierType: '门诊号',
      identifierValue: 'M202401001',
      organizationName: '北京协和医院',
      patientName: '张**',
      gender: '男',
      age: 45,
      documentType: '其他检查',
      documentSubtype: '心电图',
      effectiveDate: '2024-01-03',
      parsedText: null
    },
    extractedFields: [],
    patientBinding: {
      patientId: 'P001',
      bindingConfidence: 0.85,
      bindingMethod: 'auto'
    }
  }
]

// 模拟冲突数据
export const mockConflicts = [
  {
    id: 'conflict1',
    field: '出生日期',
    currentValue: '1979-03-15',
    newValue: '1979-03-20',
    currentSource: '身份证扫描',
    newSource: '最新病历 (2024-01-15)',
    aiConfidence: 95,
    conflictType: '日期差异',
    aiRecommendation: 'new',
    aiReason: '建议采用新值，最新病历的日期通常更准确'
  },
  {
    id: 'conflict2',
    field: '血压值',
    currentValue: '120/80',
    newValue: '130/85',
    currentSource: '上次检查',
    newSource: '血压监测报告_20240115.pdf',
    aiConfidence: 92,
    conflictType: '数值差异',
    aiRecommendation: 'new',
    aiReason: '血压值存在正常波动，建议采用最新测量值'
  }
]

// 模拟变更日志
export const mockChangeLogs = [
  {
    id: 'log1',
    timestamp: '2024-01-15 14:30',
    field: '血压值',
    source: '新文档',
    operator: 'AI抽取',
    changeContent: '120/80→130/85',
    status: 'pending',
    document: '血压监测报告_20240115.pdf'
  },
  {
    id: 'log2',
    timestamp: '2024-01-15 14:25',
    field: '用药记录',
    source: '新文档',
    operator: 'AI抽取',
    changeContent: '+阿司匹林',
    status: 'confirmed',
    document: '用药记录.xlsx'
  },
  {
    id: 'log3',
    timestamp: '2024-01-10 09:15',
    field: '联系电话',
    source: '手动编辑',
    operator: '张医生',
    changeContent: '138****→139****',
    status: 'confirmed',
    document: null
  }
]

// 模拟AI消息数据
export const mockAiMessages = [
  {
    type: 'ai',
    content: '您好！我是AI助手，可以帮您查询患者张三的相关信息。您可以问我关于患者的检查结果、用药情况、诊断信息等问题。',
    timestamp: '2024-01-17 18:00:00'
  }
]

export default {
  mockAiSummary,
  mockPatientInfo,
  mockEhrFieldGroups,
  mockEhrDocuments,
  mockDocuments,
  mockConflicts,
  mockChangeLogs,
  mockAiMessages
}