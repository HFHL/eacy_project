import { validateUploadFile } from '../../../constants/uploadLimits'

export const formatFileSize = (bytes) => {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}

export const detectFileCategory = (file) => {
  const name = file.name.toLowerCase()
  if (name.includes('血常规') || name.includes('血检')) return '检验报告'
  if (name.includes('ct') || name.includes('mri') || name.includes('x光')) return '影像检查'
  if (name.includes('病理') || name.includes('活检')) return '病理检查'
  if (name.includes('用药') || name.includes('处方')) return '用药记录'
  if (name.includes('患者') || name.includes('信息')) return '患者信息'
  return '其他文档'
}

export const mapUploadedDocument = (doc) => ({
  id: doc.id,
  documentId: doc.id,
  name: doc.file_name,
  size: doc.file_size,
  type: doc.file_type,
  status: 'uploaded',
  taskStatus: doc.task_status,
  uploadStatus: 'success',
  uploadProgress: 100,
  fileUrl: doc.file_url,
  uploadTime: doc.upload_time,
  category: doc.category || '其他文档',
})

export const mapParsingDocument = (doc) => ({
  id: doc.id,
  documentId: doc.id,
  name: doc.file_name,
  size: doc.file_size,
  type: doc.file_type,
  status: doc.task_status,
  taskStatus: doc.task_status,
  parseError: doc.parse_error,
  uploadStatus: 'success',
  uploadProgress: 100,
  fileUrl: doc.file_url,
  uploadTime: doc.upload_time,
  category: doc.category || '其他文档',
  isParsed: doc.is_parsed,
  requiresReview: doc.requires_review || false,
})

export const buildUploadFile = (file) => {
  const fileName = file.name.split('/').pop()
  const renamedFile = new File([file], fileName, { type: file.type })
  const validation = validateUploadFile(file)

  return {
    id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
    name: fileName,
    size: file.size,
    type: file.type,
    status: validation.ok ? 'valid' : 'invalid',
    category: detectFileCategory(file),
    uploadProgress: 0,
    uploadStatus: 'pending',
    file: renamedFile,
    originFileObj: renamedFile,
    error: validation.ok ? null : validation.message,
  }
}

export const getCombinedUploadFiles = (uploadFiles, unparsedDocuments) => {
  const localFiles = uploadFiles.filter((file) => file.uploadStatus !== 'success' || file.documentId)
  const serverFiles = unparsedDocuments.filter(
    (serverDoc) => !uploadFiles.some((localDoc) => localDoc.documentId === serverDoc.id),
  )
  return [...localFiles, ...serverFiles]
}

export const calculateUploadStats = (allFiles) => ({
  totalFiles: allFiles.length,
  uploadedFiles: allFiles.filter((file) => file.uploadStatus === 'success' || file.status === 'uploaded').length,
  uploadingFiles: allFiles.filter((file) => file.uploadStatus === 'uploading').length,
  failedFiles: allFiles.filter((file) => file.uploadStatus === 'failed' || file.status === 'invalid').length,
  totalSize: allFiles.reduce((sum, file) => sum + (file.size || 0), 0),
  supportedFormats: ['PDF', 'JPG', 'PNG', 'DOCX', 'XLSX', 'CSV'],
})
