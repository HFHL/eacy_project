/**
 * 项目数据适配器
 * 将项目特定的数据结构映射到EHR标准格式，以便复用EhrTab组件
 */

import { projectFieldsData } from './projectFieldsConfig'
import { 
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
} from './projectMockData'

/**
 * 根据项目ID获取项目信息
 */
export const getProjectInfo = (projectId) => {
  return projectsDatabase[projectId] || {
    id: projectId,
    name: '未知项目',
    completeness: 0,
    documentCount: 0,
    qualityScore: 0
  }
}

/**
 * 根据项目ID获取字段组数据
 */
export const getProjectFieldGroups = (projectId) => {
  if (projectId === 'PROJ004') {
    return proj004FieldGroups
  }
  return projectFieldGroups
}

/**
 * 根据项目ID获取文档数据
 */
export const getProjectDocuments = (projectId) => {
  return projectDocuments[projectId] || []
}

/**
 * 获取项目患者信息
 */
export const getProjectPatientInfo = (projectId, patientId) => {
  // 基于项目ID定制患者信息
  const baseInfo = { ...projectPatientInfo }
  
  if (projectId === 'PROJ004') {
    baseInfo.projects = ['PROJ004']
    baseInfo.projectSpecific = {
      ...baseInfo.projectSpecific,
      projectPhase: '数据收集期',
      followUpSchedule: '无需随访'
    }
  }
  
  return baseInfo
}

/**
 * 将项目字段组映射到EHR标准格式
 */
export const mapProjectFieldGroupsToEhr = (projectId) => {
  const fieldGroups = getProjectFieldGroups(projectId)
  
  // 将项目字段组映射为EHR标准的树形结构
  return fieldGroups.map(group => ({
    ...group,
    // 确保包含EHR标准的属性
    icon: getGroupIcon(group.key),
    extractable: group.status !== 'completed',
    // 添加项目特有的标识
    isProjectSpecific: group.key === 'projectSpecific'
  }))
}

/**
 * 将项目字段数据映射到EHR标准格式
 */
export const mapProjectFieldsDataToEhr = (projectId) => {
  // 基于项目ID返回对应的字段数据
  if (projectId === 'PROJ004') {
    // 日志项目的字段数据
    return {
      personalInfo: projectFieldsData.personalInfo,
      logRecords: projectFieldsData.logRecords
    }
  }
  
  // 默认肿瘤研究项目的字段数据
  return {
    personalInfo: projectFieldsData.personalInfo,
    tumorInfo: projectFieldsData.tumorInfo,
    treatmentRecords: projectFieldsData.treatmentRecords,
    followUpRecords: projectFieldsData.followUpRecords,
    diagnosis: projectFieldsData.diagnosis,
    medication: projectFieldsData.medication
  }
}

/**
 * 将项目文档映射到EHR标准格式
 */
export const mapProjectDocumentsToEhr = (projectId) => {
  const documents = getProjectDocuments(projectId)
  
  return documents.map(doc => ({
    ...doc,
    // 确保包含EHR标准的属性
    category: doc.metadata?.documentType || '其他',
    status: doc.status,
    confidence: doc.confidence ? (doc.confidence > 0.9 ? 'high' : doc.confidence > 0.7 ? 'medium' : 'low') : null,
    uploadDate: doc.uploadTime?.split(' ')[0] || '',
    extractedFields: doc.extractedFields?.map(field => field.fieldName) || []
  }))
}

/**
 * 获取字段组图标
 */
const getGroupIcon = (groupKey) => {
  const iconMap = {
    basicInfo: '📋',
    projectSpecific: '🎯',
    tumorInfo: '🎯',
    treatmentRecords: '💊',
    followUpRecords: '📊',
    logRecords: '📝',
    clinicalInfo: '🏥',
    diagnosis: '🔍',
    medication: '💊'
  }
  return iconMap[groupKey] || '📄'
}

/**
 * 获取项目特定的数据对比信息
 */
export const getProjectDataComparison = (groupKey) => {
  return projectDataComparison[groupKey] || {
    newProjectFields: 0,
    dataDifferences: 0,
    poolDataReused: 0
  }
}

/**
 * 获取项目特定的抽取状态信息
 */
export const getProjectExtractionStatus = (groupKey) => {
  return projectExtractionStatus[groupKey] || {
    progress: 0,
    cost: 0,
    remainingTime: 0,
    status: 'pending'
  }
}

/**
 * 获取项目冲突数据
 */
export const getProjectConflicts = () => {
  return projectConflicts
}

/**
 * 获取项目变更日志
 */
export const getProjectChangeLogs = () => {
  return projectChangeLogs
}

/**
 * 获取项目AI消息
 */
export const getProjectAiMessages = () => {
  return projectAiMessages
}

/**
 * 主适配器函数 - 将所有项目数据适配为EHR标准格式
 */
export const adaptProjectDataToEhr = (projectId, patientId) => {
  return {
    // 项目信息
    projectInfo: getProjectInfo(projectId),
    
    // 患者信息
    patientInfo: getProjectPatientInfo(projectId, patientId),
    
    // 字段组数据
    ehrFieldGroups: mapProjectFieldGroupsToEhr(projectId),
    
    // 字段详细数据
    ehrFieldsData: mapProjectFieldsDataToEhr(projectId),
    
    // 文档数据
    ehrDocuments: mapProjectDocumentsToEhr(projectId),
    
    // 冲突数据
    conflicts: getProjectConflicts(),
    
    // 变更日志
    changeLogs: getProjectChangeLogs(),
    
    // AI消息
    aiMessages: getProjectAiMessages(),
    
    // 工具函数
    getDataComparison: getProjectDataComparison,
    getExtractionStatus: getProjectExtractionStatus
  }
}

export default {
  getProjectInfo,
  getProjectFieldGroups,
  getProjectDocuments,
  getProjectPatientInfo,
  mapProjectFieldGroupsToEhr,
  mapProjectFieldsDataToEhr,
  mapProjectDocumentsToEhr,
  adaptProjectDataToEhr
}