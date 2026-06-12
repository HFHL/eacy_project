export const isPdfFileLike = ({ fileType, fileName, fileUrl } = {}) => {
  const type = String(fileType || '').toLowerCase()
  const name = String(fileName || '').toLowerCase()
  const url = String(fileUrl || '').toLowerCase()
  const cleanUrl = url.split('?')[0].split('#')[0]
  return (
    type === 'pdf' ||
    type === '.pdf' ||
    type.includes('application/pdf') ||
    name.endsWith('.pdf') ||
    cleanUrl.endsWith('.pdf')
  )
}

export const DEFAULT_EXTRACTED_DATA = {
  extractedInfo: {
    name: '待AI提取',
    gender: '--',
    age: '--',
    reportDate: '--',
    reportType: '待AI识别'
  },
  confidence: 70,
  candidates: [
    {
      id: 'P001',
      name: '张三',
      gender: '男',
      age: 45,
      similarity: 78,
      lastVisit: '2024-01-10',
      department: '心内科',
      matchFeatures: ['OCR已完成', '待AI分析']
    },
    {
      id: 'P002',
      name: '李四',
      gender: '女',
      age: 38,
      similarity: 65,
      lastVisit: '2024-01-12',
      department: '消化科',
      matchFeatures: ['OCR已完成', '待AI分析']
    }
  ],
  aiRecommendation: 'P001',
  aiReason: 'OCR解析已完成，AI智能匹配功能开发中，请手动选择或确认推荐患者'
}

export const convertDocToDocument = (doc) => {
  const isParsed = true
  const isExtracted = !!(
    doc.extractedInfo &&
    doc.extractedInfo.name &&
    doc.extractedInfo.name !== '--' &&
    doc.extractedInfo.name !== '待AI提取'
  )

  let status = 'pending_confirm_review'
  if (doc.task_status) {
    status = doc.task_status
  } else if (doc.matchResult) {
    const matchResultMap = {
      matched: 'pending_confirm_review',
      new: 'pending_confirm_new',
      uncertain: 'pending_confirm_uncertain'
    }
    status = matchResultMap[doc.matchResult] || 'pending_confirm_review'
  }

  return {
    id: doc.id,
    fileName: doc.fileName || doc.file_name || doc.documentName || doc.name || '未知文档',
    status,
    confidence: doc.confidence || doc.matchScore || null,
    extractedFields: [],
    isParsed,
    isExtracted,
    patientId: doc.patientId || doc.matchedPatientId || null
  }
}
