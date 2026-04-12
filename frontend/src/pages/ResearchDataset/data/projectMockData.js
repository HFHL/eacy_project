/**
 * 项目患者详情页面模拟数据
 * 基于 PatientDetail/data/mockData.js 标准结构
 */

// 项目信息数据库
export const projectsDatabase = {
  'PROJ001': {
    id: 'PROJ001',
    name: '肺癌靶向药副作用研究',
    description: '研究EGFR-TKI类靶向药物在肺腺癌患者中的副作用发生率和严重程度',
    completeness: 85,
    documentCount: 4,
    qualityScore: 92,
    patientCount: 156,
    status: 'active',
    startDate: '2024-01-01',
    endDate: '2024-12-31'
  },
  'PROJ004': {
    id: 'PROJ004',
    name: '5条日志',
    description: '系统日志分析项目，用于测试日志数据抽取功能',
    completeness: 60,
    documentCount: 5,
    qualityScore: 78,
    patientCount: 1,
    status: 'active',
    startDate: '2024-01-15',
    endDate: '2024-02-15'
  }
}

// 项目患者信息（基于标准患者信息结构）
export const projectPatientInfo = {
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
  completeness: 78, // 项目特定的完整度
  projects: ['PROJ001'], // 关联的项目
  status: 'active',
  notes: '患者配合度良好，定期复查',
  // 项目特定字段
  projectSpecific: {
    enrollmentDate: '2024-01-10',
    projectPhase: '治疗期',
    followUpSchedule: '每月一次',
    consentStatus: 'signed'
  }
}

// 项目字段组数据结构（基于EHR标准但针对项目优化）
export const projectFieldGroups = [
  {
    key: 'basicInfo',
    name: '人口统计学',
    status: 'completed',
    completeness: 100,
    fieldCount: 6,
    extractedCount: 6,
    source: '患者池复用',
    children: [
      {
        key: 'personalInfo',
        name: '个人信息',
        status: 'completed',
        completeness: 100,
        fieldCount: 6,
        extractedCount: 6
      }
    ]
  },
  {
    key: 'projectSpecific',
    name: '基线信息',
    status: 'partial',
    completeness: 70,
    fieldCount: 15,
    extractedCount: 11,
    source: '专项抽取',
    children: [
      {
        key: 'tumorInfo',
        name: '肿瘤信息',
        status: 'partial',
        completeness: 80,
        fieldCount: 6,
        extractedCount: 5
      },
      {
        key: 'treatmentRecords',
        name: '治疗记录',
        status: 'completed',
        completeness: 100,
        fieldCount: 5,
        extractedCount: 5,
        repeatable: true,
        recordCount: 2
      },
      {
        key: 'followUpRecords',
        name: '随访记录',
        status: 'incomplete',
        completeness: 20,
        fieldCount: 5,
        extractedCount: 1,
        repeatable: true,
        recordCount: 1
      }
    ]
  },
  {
    key: 'clinicalInfo',
    name: '诊疗信息',
    status: 'partial',
    completeness: 85,
    fieldCount: 10,
    extractedCount: 8,
    source: '专项抽取',
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
        key: 'medication',
        name: '用药记录',
        status: 'partial',
        completeness: 75,
        fieldCount: 8,
        extractedCount: 6
      }
    ]
  }
]

// 针对PROJ004项目的特殊字段组
export const proj004FieldGroups = [
  {
    key: 'basicInfo',
    name: '基本信息',
    status: 'completed',
    completeness: 100,
    fieldCount: 6,
    extractedCount: 6,
    source: '患者池复用'
  },
  {
    key: 'logRecords',
    name: '日志记录',
    status: 'partial',
    completeness: 60,
    fieldCount: 3,
    extractedCount: 2,
    source: '专项抽取',
    repeatable: true,
    recordCount: 5
  }
]

// 项目文档数据（基于标准文档结构）
export const projectDocuments = {
  'PROJ001': [
    {
      id: 'doc1',
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
        { fieldId: 'TUMOR002', fieldName: '病理类型', value: '腺癌', confidence: 0.95, source: 'step3' },
        { fieldId: 'TUMOR003', fieldName: 'TNM分期', value: 'T2N1M0', confidence: 0.88, source: 'step3' }
      ],
      patientBinding: {
        patientId: 'P001',
        bindingConfidence: 0.92,
        bindingMethod: 'auto'
      }
    },
    {
      id: 'doc2',
      fileName: '治疗记录_20240115.pdf',
      fileFormat: 'pdf',
      fileSize: '2.1MB',
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
        documentType: '治疗记录',
        documentSubtype: '手术记录',
        effectiveDate: '2024-01-15',
        parsedText: '手术治疗记录...'
      },
      extractedFields: [
        { fieldId: 'TREAT001_1', fieldName: '治疗方案', value: '手术切除', confidence: 0.98, source: 'step3' },
        { fieldId: 'TREAT004_1', fieldName: '疗效评估', value: '完全切除', confidence: 0.95, source: 'step3' }
      ],
      patientBinding: {
        patientId: 'P001',
        bindingConfidence: 0.95,
        bindingMethod: 'auto'
      }
    },
    {
      id: 'doc3',
      fileName: '随访记录_20240301.pdf',
      fileFormat: 'pdf',
      fileSize: '1.2MB',
      uploadTime: '2024-03-01 14:20:00',
      status: 'pending',
      confidence: null,
      metadata: {
        identifierType: '住院号',
        identifierValue: 'H202401001',
        organizationName: '中山大学附属第三医院',
        patientName: '张**',
        gender: '男',
        age: 45,
        documentType: '随访记录',
        documentSubtype: '门诊随访',
        effectiveDate: '2024-03-01',
        parsedText: null
      },
      extractedFields: [],
      patientBinding: {
        patientId: 'P001',
        bindingConfidence: 0.88,
        bindingMethod: 'auto'
      }
    },
    {
      id: 'doc4',
      fileName: 'PET-CT_20240305.pdf',
      fileFormat: 'pdf',
      fileSize: '5.8MB',
      uploadTime: '2024-03-05 09:15:00',
      status: 'new',
      confidence: null,
      metadata: {
        identifierType: '检查号',
        identifierValue: 'PET202403001',
        organizationName: '中山大学附属第三医院',
        patientName: '张**',
        gender: '男',
        age: 45,
        documentType: '影像检查',
        documentSubtype: 'PET-CT',
        effectiveDate: '2024-03-05',
        parsedText: null
      },
      extractedFields: [],
      patientBinding: {
        patientId: 'P001',
        bindingConfidence: 0.90,
        bindingMethod: 'auto'
      }
    }
  ],
  'PROJ004': [
    {
      id: 'doc1',
      fileName: '系统日志_20240115.log',
      fileFormat: 'log',
      fileSize: '0.8MB',
      uploadTime: '2024-01-15 14:30:00',
      status: 'extracted',
      confidence: 0.95,
      metadata: {
        identifierType: '系统ID',
        identifierValue: 'SYS001',
        organizationName: '系统日志',
        documentType: '系统日志',
        documentSubtype: '应用日志',
        effectiveDate: '2024-01-15',
        parsedText: '系统日志内容...'
      },
      extractedFields: [
        { fieldId: 'LOG001_1', fieldName: '日志时间', value: '2024-01-15 14:30:25', confidence: 0.98, source: 'step3' },
        { fieldId: 'LOG002_1', fieldName: '日志级别', value: 'INFO', confidence: 0.95, source: 'step3' }
      ],
      patientBinding: {
        patientId: 'P001',
        bindingConfidence: 0.95,
        bindingMethod: 'auto'
      }
    },
    {
      id: 'doc2',
      fileName: '应用日志_20240116.log',
      fileFormat: 'log',
      fileSize: '1.2MB',
      uploadTime: '2024-01-16 10:15:00',
      status: 'extracted',
      confidence: 0.88,
      metadata: {
        identifierType: '系统ID',
        identifierValue: 'SYS001',
        organizationName: '系统日志',
        documentType: '应用日志',
        documentSubtype: '业务日志',
        effectiveDate: '2024-01-16',
        parsedText: '应用日志内容...'
      },
      extractedFields: [
        { fieldId: 'LOG001_2', fieldName: '日志时间', value: '2024-01-16 10:15:30', confidence: 0.95, source: 'step3' }
      ],
      patientBinding: {
        patientId: 'P001',
        bindingConfidence: 0.88,
        bindingMethod: 'auto'
      }
    },
    {
      id: 'doc3',
      fileName: '错误日志_20240117.log',
      fileFormat: 'log',
      fileSize: '0.5MB',
      uploadTime: '2024-01-17 15:20:00',
      status: 'pending',
      confidence: null,
      metadata: {
        identifierType: '系统ID',
        identifierValue: 'SYS001',
        organizationName: '系统日志',
        documentType: '错误日志',
        documentSubtype: '异常日志',
        effectiveDate: '2024-01-17',
        parsedText: null
      },
      extractedFields: [],
      patientBinding: {
        patientId: 'P001',
        bindingConfidence: 0.85,
        bindingMethod: 'auto'
      }
    },
    {
      id: 'doc4',
      fileName: '访问日志_20240118.log',
      fileFormat: 'log',
      fileSize: '2.1MB',
      uploadTime: '2024-01-18 08:45:00',
      status: 'new',
      confidence: null,
      metadata: {
        identifierType: '系统ID',
        identifierValue: 'SYS001',
        organizationName: '系统日志',
        documentType: '访问日志',
        documentSubtype: '用户访问',
        effectiveDate: '2024-01-18',
        parsedText: null
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
      fileName: '性能日志_20240119.log',
      fileFormat: 'log',
      fileSize: '1.8MB',
      uploadTime: '2024-01-19 12:30:00',
      status: 'new',
      confidence: null,
      metadata: {
        identifierType: '系统ID',
        identifierValue: 'SYS001',
        organizationName: '系统日志',
        documentType: '性能日志',
        documentSubtype: '系统性能',
        effectiveDate: '2024-01-19',
        parsedText: null
      },
      extractedFields: [],
      patientBinding: {
        patientId: 'P001',
        bindingConfidence: 0.92,
        bindingMethod: 'auto'
      }
    }
  ]
}

// 项目冲突数据
export const projectConflicts = [
  {
    id: 'conflict1',
    field: 'TNM分期',
    currentValue: 'T2N1M0',
    newValue: 'T2N0M0',
    currentSource: '病理报告_20240110.pdf',
    newSource: '影像报告_20240112.pdf',
    aiConfidence: 88,
    conflictType: '分期差异',
    aiRecommendation: 'current',
    aiReason: '病理报告的TNM分期通常比影像学更准确'
  }
]

// 项目变更日志
export const projectChangeLogs = [
  {
    id: 'log1',
    timestamp: '2024-01-15 14:30',
    field: '治疗方案',
    source: '新文档',
    operator: 'AI抽取',
    changeContent: '新增手术切除记录',
    status: 'pending',
    document: '治疗记录_20240115.pdf'
  },
  {
    id: 'log2',
    timestamp: '2024-01-10 16:45',
    field: '病理类型',
    source: '新文档',
    operator: 'AI抽取',
    changeContent: '腺癌',
    status: 'confirmed',
    document: '病理报告_20240110.pdf'
  }
]

// 项目AI消息数据
export const projectAiMessages = [
  {
    type: 'ai',
    content: '您好！我是项目AI助手，可以帮您分析患者张三在肺癌靶向药副作用研究项目中的数据。您可以问我关于治疗效果、副作用监测、随访计划等问题。',
    timestamp: '2024-01-17 18:00:00'
  }
]

// 数据对比分析
export const projectDataComparison = {
  tumorInfo: {
    newProjectFields: 6,
    dataDifferences: 1,
    poolDataReused: 0
  },
  treatmentRecords: {
    newProjectFields: 5,
    dataDifferences: 0,
    poolDataReused: 0
  },
  followUpRecords: {
    newProjectFields: 5,
    dataDifferences: 0,
    poolDataReused: 1
  }
}

// 抽取状态数据
export const projectExtractionStatus = {
  tumorInfo: {
    progress: 80,
    cost: 1.20,
    remainingTime: 2,
    status: 'running'
  },
  treatmentRecords: {
    progress: 100,
    cost: 1.50,
    remainingTime: 0,
    status: 'completed'
  },
  followUpRecords: {
    progress: 20,
    cost: 0.50,
    remainingTime: 5,
    status: 'pending'
  }
}

export default {
  projectsDatabase,
  projectPatientInfo,
  projectFieldGroups,
  proj004FieldGroups,
  projectDocuments,
  projectConflicts,
  projectChangeLogs,
  projectAiMessages,
  projectDataComparison,
  projectExtractionStatus
}