import React, { useState, useMemo, useEffect, useRef, useCallback } from 'react'
import { useParams, useNavigate, useLocation } from 'react-router-dom'
import {
  Row,
  Col,
  Card,
  Typography,
  Button,
  Space,
  Tag,
  List,
  Avatar,
  Progress,
  Descriptions,
  Table,
  Modal,
  Upload,
  Input,
  Select,
  Tabs,
  Timeline,
  Image,
  Divider,
  Form,
  DatePicker,
  message,
  Popconfirm,
  Alert,
  Tooltip,
  Badge,
  Drawer,
  Radio,
  Checkbox,
  Statistic,
  Spin,
  Empty,
  theme
} from 'antd'
import {
  ArrowLeftOutlined,
  FileTextOutlined,
  PictureOutlined,
  DownloadOutlined,
  EyeOutlined,
  EditOutlined,
  DeleteOutlined,
  UploadOutlined,
  PlayCircleOutlined,
  CheckCircleOutlined,
  ExclamationCircleOutlined,
  UserOutlined,
  CalendarOutlined,
  MedicineBoxOutlined,
  SaveOutlined,
  CloseOutlined,
  ReloadOutlined,
  WarningOutlined,
  InfoCircleOutlined,
  HistoryOutlined,
  PlusOutlined,
  MinusOutlined,
  FolderOutlined,
  FolderOpenOutlined,
  RobotOutlined,
  SendOutlined,
  ClearOutlined,
  DatabaseOutlined,
  LoadingOutlined
} from '@ant-design/icons'

// 导入外置的配置数据
import { ehrFieldsData, ehrFieldGroupsConfig } from './data/ehrFieldsConfig'
import {
  CONFIDENCE_CONFIG,
  DEFAULT_LAYOUT,
  DEFAULT_EXPANDED_GROUPS
} from './data/constants'

// 导入自定义Hooks
import { usePatientData } from './hooks/usePatientData'
import { useModals } from './hooks/useModals'
import { PATIENT_DEPARTMENT_OPTIONS } from '@/constants/patientDepartments'
import { PAGE_LAYOUT_HEIGHTS, toViewportHeight } from '@/constants/pageLayout'
import { modalBodyPreset, modalWidthPreset } from '../../styles/themeTokens'

// 导入Tab组件
import TimelineTab from './tabs/TimelineTab'
import DocumentsTab from './tabs/DocumentsTab'
import AiSummaryTab from './tabs/AiSummaryTab'
import SchemaEhrTab from './tabs/SchemaEhrTab'
// 导入布局图标组件
// 导入API
import { extractEhrData, uploadAndArchiveAsync, getFileStatusesByIds, deleteDocument } from '@/api/document'
import { startPatientExtraction, getExtractionTaskStatus, getFieldConflicts, resolveFieldConflict } from '@/api/patient'
import { getTasksByPatient, upsertTask, removeTask, claimExtractionNotifyOnce } from '@/utils/taskStore'
import { maskPhone, maskIdCard, maskAddress, maskName } from '@/utils/sensitiveUtils'

const { Title, Text } = Typography
const { Search } = Input
const { TextArea } = Input

const PatientDetail = () => {
  const { token } = theme.useToken()
  const { patientId } = useParams()
  const navigate = useNavigate()
  const location = useLocation()
  const [taskCenterVisible, setTaskCenterVisible] = useState(false)
  const [taskItems, setTaskItems] = useState([])
  const [taskPolling, setTaskPolling] = useState(false)
  
  // 使用自定义Hooks，传入 patientId
  const {
    patientInfo,
    setPatientInfo,
    aiSummary,
    setAiSummary,
    summaryEditMode,
    setSummaryEditMode,
    summaryContent,
    setSummaryContent,
    summaryGenerating,
    setSummaryGenerating,
    handleEditPatient,
    handleSavePatient,
    handleEditSummary,
    handleSaveSummary,
    handleRegenerateSummary,
    // 病历数据
    ehrData,
    ehrLoading,
    // 文档数据
    patientDocuments,
    documentsLoading,
    // API 操作
    loading,
    fetchPatientDetail,
    fetchPatientDocuments,
    syncPatientStatsAfterDocumentChange
  } = usePatientData(patientId)
  
  const {
    uploadVisible,
    extractionVisible,
    editModalVisible,
    exportModalVisible,
    aiAssistantVisible,
    conflictResolveVisible,
    changeLogVisible,
    setUploadVisible,
    setExtractionVisible,
    setEditModalVisible,
    setExportModalVisible,
    setAiAssistantVisible,
    setConflictResolveVisible,
    setChangeLogVisible
  } = useModals()
  
  // 剩余的局部状态
  const [selectedDocument, setSelectedDocument] = useState(null)
  const [editingField, setEditingField] = useState(null)
  const [selectedConflict, setSelectedConflict] = useState(null)
  // 脱敏字段是否被用户点击并修改（未修改时显示脱敏值、不校验、不提交；已修改时清空显示、可填可撤销）
  const [sensitiveModified, setSensitiveModified] = useState({ phone: false, idCard: false, address: false })
  
  // 上传文档状态
  const [uploadFileList, setUploadFileList] = useState([])
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState({})
  
  const [aiMessages, setAiMessages] = useState([
    {
      type: 'ai',
      content: '您好！我是AI助手，可以帮您查询患者的相关信息。',
      timestamp: new Date().toISOString()
    }
  ])
  const [aiInput, setAiInput] = useState('')
  const [aiModalPosition, setAiModalPosition] = useState({ x: 20, y: 80 })
  const [isDragging, setIsDragging] = useState(false)
  
  // 电子病历相关状态
  const [selectedEhrDocument, setSelectedEhrDocument] = useState(null)
  const [activeTab, setActiveTab] = useState('ehr-schema')
  const [reExtracting, setReExtracting] = useState(false) // 重新抽取中状态
  
  
  const [form] = Form.useForm()
  const [conflictForm] = Form.useForm()
  const [summaryForm] = Form.useForm()
  const autoEditHandledRef = useRef(false)
  const backTarget = useMemo(() => {
    const from = location.state?.from
    if (typeof from === 'string' && from.trim()) return from
    return '/patient/pool'
  }, [location.state])

  /**
   * 统一打开“编辑患者信息”弹窗，复用页面原有编辑逻辑。
   *
   * @returns {void}
   */
  const openPatientEditModal = useCallback(() => {
    handleEditPatient(form)
    setSensitiveModified({ phone: false, idCard: false, address: false })
    setEditModalVisible(true)
  }, [form, handleEditPatient, setEditModalVisible])

  /**
   * 消费一次性“自动打开编辑弹窗”意图，避免刷新页面重复触发。
   *
   * @returns {void}
   */
  const consumeOpenPatientEditIntent = useCallback(() => {
    if (!location.state?.openPatientEdit) return
    navigate(`${location.pathname}${location.search}`, {
      replace: true,
      state: {
        ...location.state,
        openPatientEdit: false,
      },
    })
  }, [location.pathname, location.search, location.state, navigate])

  useEffect(() => {
    autoEditHandledRef.current = false
  }, [patientId])

  useEffect(() => {
    if (!location.state?.openPatientEdit) return
    if (autoEditHandledRef.current) return
    if (loading) return
    if (!patientInfo?.id) return
    if (String(patientInfo.id) !== String(patientId || '')) return
    autoEditHandledRef.current = true
    consumeOpenPatientEditIntent()
    openPatientEditModal()
  }, [consumeOpenPatientEditIntent, loading, location.state, openPatientEditModal, patientId, patientInfo])

  // AI病情综述和患者数据已通过usePatientData Hook管理

  // API 病历数据 -> ehrFieldsData 字段映射
  const ehrApiToFieldMapping = {
    // 个人信息
    personal_info_name: { group: 'personalInfo', fieldIndex: 0 },
    personal_info_gender: { group: 'personalInfo', fieldIndex: 1 },
    personal_info_birth_date: { group: 'personalInfo', fieldIndex: 2 },
    personal_info_age: { group: 'personalInfo', fieldIndex: 3 },
    personal_info_id_type: { group: 'personalInfo', fieldIndex: 4 },
    personal_info_id_number: { group: 'personalInfo', fieldIndex: 5 },
    // 联系方式
    contact_info_phone: { group: 'contactInfo', fieldIndex: 0 },
    contact_info_address: { group: 'contactInfo', fieldIndex: 1 },
    contact_info_emergency_name: { group: 'contactInfo', fieldIndex: 2 },
    contact_info_emergency_phone: { group: 'contactInfo', fieldIndex: 3 },
    contact_info_emergency_relation: { group: 'contactInfo', fieldIndex: 4 },
    // 人口学
    demographics_marital_status: { group: 'demographics', fieldIndex: 0 },
    demographics_education: { group: 'demographics', fieldIndex: 1 },
    demographics_occupation: { group: 'demographics', fieldIndex: 2 },
    demographics_ethnicity: { group: 'demographics', fieldIndex: 3 },
    demographics_insurance_type: { group: 'demographics', fieldIndex: 4 },
    // 生活史
    lifestyle_smoking_status: { group: 'lifestyle', fieldIndex: 0 },
    lifestyle_smoking_years: { group: 'lifestyle', fieldIndex: 1 },
    lifestyle_smoking_daily: { group: 'lifestyle', fieldIndex: 2 },
    lifestyle_smoking_quit_year: { group: 'lifestyle', fieldIndex: 3 },
    lifestyle_drinking_status: { group: 'lifestyle', fieldIndex: 4 },
    lifestyle_drinking_frequency: { group: 'lifestyle', fieldIndex: 5 },
    lifestyle_drinking_type: { group: 'lifestyle', fieldIndex: 6 },
    lifestyle_drinking_quit_year: { group: 'lifestyle', fieldIndex: 7 },
    // 个体史
    personal_history_birth: { group: 'personalHistory', fieldIndex: 0 },
    personal_history_development: { group: 'personalHistory', fieldIndex: 1 },
    personal_history_residence: { group: 'personalHistory', fieldIndex: 2 },
    personal_history_occupation_exposure: { group: 'personalHistory', fieldIndex: 3 },
    personal_history_epidemic_travel: { group: 'personalHistory', fieldIndex: 4 },
    // 生理史
    menstrual_menarche_age: { group: 'menstrual', fieldIndex: 0 },
    menstrual_cycle_length: { group: 'menstrual', fieldIndex: 1 },
    menstrual_volume: { group: 'menstrual', fieldIndex: 2 },
    menstrual_regularity: { group: 'menstrual', fieldIndex: 3 },
    menstrual_last_period: { group: 'menstrual', fieldIndex: 4 },
  }

  // 合并 API 数据到 ehrFieldsData（只使用 API 数据）
  const mergedEhrFieldsData = useMemo(() => {
    // 深拷贝原始数据结构
    const merged = JSON.parse(JSON.stringify(ehrFieldsData))

    // 清空所有字段值的辅助函数
    const clearFieldValues = (group) => {
      if (group.fields) {
        group.fields.forEach(field => {
          if (field.fieldType === 'table_fields') {
            field.tableData = []
          } else {
            field.value = ''
            field.confidence = null
            field.source = null
          }
        })
      }
      if (group.records) {
        group.records = []
      }
    }

    // 先清空所有分组的字段值（不显示配置文件中的默认值）
    Object.values(merged).forEach(group => {
      if (group && typeof group === 'object') {
        clearFieldValues(group)
      }
    })

    // 如果没有 ehrData，返回清空后的字段结构（显示空值）
    if (!ehrData) {
      return merged
    }

    // 遍历映射表，填入 API 数据，并设置后端字段名 apiFieldId
    Object.entries(ehrApiToFieldMapping).forEach(([apiField, mapping]) => {
      const value = ehrData[apiField]
      const group = merged[mapping.group]
      if (group && group.fields && group.fields[mapping.fieldIndex]) {
        // 始终设置 apiFieldId，用于后端保存
        group.fields[mapping.fieldIndex].apiFieldId = apiField
        if (value !== null && value !== undefined && value !== '') {
          group.fields[mapping.fieldIndex].value = value
          group.fields[mapping.fieldIndex].confidence = 'high'
          group.fields[mapping.fieldIndex].source = 'api'
        }
      }
    })

    // 处理 JSONB 数组字段（可重复记录）
    // 诊断记录
    // 后端数据结构: {入院诊断: [{主要诊断: [{...}], 次要诊断: [{...}], 入院日期, 诊断机构}], 出院诊断: [...]}
    // 需要展开嵌套的入院诊断和出院诊断数组
    if (ehrData.diagnosis_records?.length > 0 && merged.diagnosis) {
      const flattenedRecords = []
      
      ehrData.diagnosis_records.forEach((diagnosisGroup, groupIdx) => {
        // 处理入院诊断
        const admissionDiagnoses = diagnosisGroup['入院诊断'] || diagnosisGroup.admission_diagnoses || []
        admissionDiagnoses.forEach((record, idx) => {
          // 提取主要诊断和次要诊断
          const mainDiagnoses = (record['主要诊断'] || record.main_diagnoses || [])
            .map(d => d['诊断名称'] || d.diagnosis_name || JSON.stringify(d))
            .filter(Boolean)
            .join('；')
          const secondaryDiagnoses = (record['次要诊断'] || record.secondary_diagnoses || [])
            .map(d => d['诊断名称'] || d.diagnosis_name || '')
            .filter(Boolean)
            .join('；')
          
          flattenedRecords.push({
            id: `diagnosis_admission_${groupIdx}_${idx}`,
            fields: [
              { id: `DX${groupIdx}_${idx}_001`, name: '诊断类型', value: '入院诊断', confidence: 'high', source: 'api', editable: true, fieldType: 'fields', type: 'text', apiFieldId: 'diagnosis_records' },
              { id: `DX${groupIdx}_${idx}_002`, name: '主要诊断', value: mainDiagnoses, confidence: 'high', source: 'api', editable: true, fieldType: 'fields', type: 'textarea', apiFieldId: 'diagnosis_records' },
              { id: `DX${groupIdx}_${idx}_003`, name: '次要诊断', value: secondaryDiagnoses, confidence: 'high', source: 'api', editable: true, fieldType: 'fields', type: 'textarea', apiFieldId: 'diagnosis_records' },
              { id: `DX${groupIdx}_${idx}_004`, name: '入院日期', value: record['入院日期'] || record.admission_date || '', confidence: 'high', source: 'api', editable: true, fieldType: 'fields', type: 'datepicker', apiFieldId: 'diagnosis_records' },
              { id: `DX${groupIdx}_${idx}_005`, name: '诊断机构', value: record['诊断机构'] || record.diagnosis_institution || '', confidence: 'high', source: 'api', editable: true, fieldType: 'fields', type: 'text', apiFieldId: 'diagnosis_records' },
            ]
          })
        })
        
        // 处理出院诊断
        const dischargeDiagnoses = diagnosisGroup['出院诊断'] || diagnosisGroup.discharge_diagnoses || []
        dischargeDiagnoses.forEach((record, idx) => {
          const mainDiagnoses = (record['主要诊断'] || record.main_diagnoses || [])
            .map(d => d['诊断名称'] || d.diagnosis_name || JSON.stringify(d))
            .filter(Boolean)
            .join('；')
          const secondaryDiagnoses = (record['次要诊断'] || record.secondary_diagnoses || [])
            .map(d => d['诊断名称'] || d.diagnosis_name || '')
            .filter(Boolean)
            .join('；')
          
          flattenedRecords.push({
            id: `diagnosis_discharge_${groupIdx}_${idx}`,
            fields: [
              { id: `DX${groupIdx}_${idx}_101`, name: '诊断类型', value: '出院诊断', confidence: 'high', source: 'api', editable: true, fieldType: 'fields', type: 'text', apiFieldId: 'diagnosis_records' },
              { id: `DX${groupIdx}_${idx}_102`, name: '主要诊断', value: mainDiagnoses, confidence: 'high', source: 'api', editable: true, fieldType: 'fields', type: 'textarea', apiFieldId: 'diagnosis_records' },
              { id: `DX${groupIdx}_${idx}_103`, name: '次要诊断', value: secondaryDiagnoses, confidence: 'high', source: 'api', editable: true, fieldType: 'fields', type: 'textarea', apiFieldId: 'diagnosis_records' },
              { id: `DX${groupIdx}_${idx}_104`, name: '出院日期', value: record['出院日期'] || record.discharge_date || '', confidence: 'high', source: 'api', editable: true, fieldType: 'fields', type: 'datepicker', apiFieldId: 'diagnosis_records' },
              { id: `DX${groupIdx}_${idx}_105`, name: '诊断机构', value: record['诊断机构'] || record.diagnosis_institution || '', confidence: 'high', source: 'api', editable: true, fieldType: 'fields', type: 'text', apiFieldId: 'diagnosis_records' },
            ]
          })
        })
      })
      
      if (flattenedRecords.length > 0) {
        merged.diagnosis.records = flattenedRecords
      }
    }

    // 用药记录
    // 后端数据字段名: 药物类型, 药物名称, 是否联合用药, 剂量, 单位, 频率, 给药途径, 开始日期, 结束日期, 备注
    if (ehrData.medication_records?.length > 0 && merged.medication) {
      merged.medication.records = ehrData.medication_records.map((record, idx) => ({
        id: `medication_${idx}`,
        fields: [
          { id: 'MED001', name: '药物名称', value: record['药物名称'] || record.drug_name || '', confidence: 'high', source: 'api', editable: true, fieldType: 'fields', type: 'text', apiFieldId: 'medication_records' },
          { id: 'MED002', name: '剂量', value: record['剂量'] || record.dosage || '', confidence: 'high', source: 'api', editable: true, fieldType: 'fields', type: 'text', apiFieldId: 'medication_records' },
          { id: 'MED003', name: '给药途径', value: record['给药途径'] || record.route || '', confidence: 'high', source: 'api', editable: true, fieldType: 'fields', type: 'select', apiFieldId: 'medication_records' },
          { id: 'MED004', name: '给药频率', value: record['频率'] || record.frequency || '', confidence: 'high', source: 'api', editable: true, fieldType: 'fields', type: 'text', apiFieldId: 'medication_records' },
          { id: 'MED005', name: '开始日期', value: record['开始日期'] || record.start_date || '', confidence: 'high', source: 'api', editable: true, fieldType: 'fields', type: 'datepicker', apiFieldId: 'medication_records' },
          { id: 'MED006', name: '结束日期', value: record['结束日期'] || record.end_date || '', confidence: 'high', source: 'api', editable: true, fieldType: 'fields', type: 'datepicker', apiFieldId: 'medication_records' },
          { id: 'MED007', name: '单位', value: record['单位'] || '', confidence: 'high', source: 'api', editable: true, fieldType: 'fields', type: 'text', apiFieldId: 'medication_records' },
          { id: 'MED008', name: '药物类型', value: record['药物类型'] || '', confidence: 'high', source: 'api', editable: true, fieldType: 'fields', type: 'text', apiFieldId: 'medication_records' },
        ]
      }))
    }

    // 治疗记录
    // 后端数据字段名: 手术日期, 手术名称, 麻醉方式 (手术治疗); 开始日期, 结束日期, 放疗部位 (放疗) 等
    if (ehrData.treatment_records?.length > 0 && merged.treatment) {
      merged.treatment.records = ehrData.treatment_records.map((record, idx) => ({
        id: `treatment_${idx}`,
        fields: [
          { id: 'TX001', name: '治疗类型', value: record['治疗类型'] || record.treatment_type || '', confidence: 'high', source: 'api', editable: true, fieldType: 'fields', type: 'select', apiFieldId: 'treatment_records' },
          { id: 'TX002', name: '治疗方案', value: record['手术名称'] || record['治疗方案'] || record.treatment_plan || '', confidence: 'high', source: 'api', editable: true, fieldType: 'fields', type: 'text', apiFieldId: 'treatment_records' },
          { id: 'TX003', name: '开始日期', value: record['手术日期'] || record['开始日期'] || record.start_date || '', confidence: 'high', source: 'api', editable: true, fieldType: 'fields', type: 'datepicker', apiFieldId: 'treatment_records' },
          { id: 'TX004', name: '结束日期', value: record['结束日期'] || record.end_date || '', confidence: 'high', source: 'api', editable: true, fieldType: 'fields', type: 'datepicker', apiFieldId: 'treatment_records' },
          { id: 'TX005', name: '麻醉方式', value: record['麻醉方式'] || '', confidence: 'high', source: 'api', editable: true, fieldType: 'fields', type: 'select', apiFieldId: 'treatment_records' },
          { id: 'TX006', name: '治疗部位', value: record['放疗部位'] || record['治疗部位'] || '', confidence: 'high', source: 'api', editable: true, fieldType: 'fields', type: 'text', apiFieldId: 'treatment_records' },
        ]
      }))
    }

    // 既往病史
    // 后端数据字段名: 入院日期, 是否存在既往疾病或合并症, 既往疾病, 治疗方案或药物, 确诊日期
    if (ehrData.past_medical_records?.length > 0 && merged.pastMedical) {
      merged.pastMedical.records = ehrData.past_medical_records.map((record, idx) => ({
        id: `pmh_${idx}`,
        fields: [
          { id: 'PMH001', name: '既往病史_疾病', value: record['既往疾病'] || record.disease_name || '', confidence: 'high', source: 'api', editable: true, fieldType: 'fields', type: 'text', apiFieldId: 'past_medical_records' },
          { id: 'PMH002', name: '既往病史_确诊日期', value: record['确诊日期'] || record.diagnosis_date || '', confidence: 'high', source: 'api', editable: true, fieldType: 'fields', type: 'datepicker', apiFieldId: 'past_medical_records' },
          { id: 'PMH003', name: '治疗方案或药物', value: record['治疗方案或药物'] || '', confidence: 'high', source: 'api', editable: true, fieldType: 'fields', type: 'text', apiFieldId: 'past_medical_records' },
          { id: 'PMH004', name: '是否存在既往疾病', value: record['是否存在既往疾病或合并症'] || '', confidence: 'high', source: 'api', editable: true, fieldType: 'fields', type: 'text', apiFieldId: 'past_medical_records' },
        ]
      }))
    }

    // 手术史
    // 后端数据字段名: 入院日期, 是否存在手术史, 名称, 日期
    if (ehrData.surgical_records?.length > 0 && merged.surgical) {
      merged.surgical.records = ehrData.surgical_records.map((record, idx) => ({
        id: `surgery_${idx}`,
        fields: [
          { id: 'CORE055', name: '手术史_手术名称', value: record['名称'] || record.surgery_name || '', confidence: 'high', source: 'api', editable: true, fieldType: 'fields', type: 'text', apiFieldId: 'surgical_records' },
          { id: 'CORE056', name: '手术史_日期', value: record['日期'] || record.surgery_date || '', confidence: 'high', source: 'api', editable: true, fieldType: 'fields', type: 'datepicker', apiFieldId: 'surgical_records' },
          { id: 'CORE057', name: '是否存在手术史', value: record['是否存在手术史'] || '', confidence: 'high', source: 'api', editable: true, fieldType: 'fields', type: 'text', apiFieldId: 'surgical_records' },
        ]
      }))
    }

    // 过敏史 (前端使用 table_fields 格式)
    // 后端数据字段名: 入院日期, 是否存在过敏史, 过敏源(食物或药物), 过敏反应
    if (ehrData.allergy_records?.length > 0 && merged.allergy && merged.allergy.fields) {
      const tableField = merged.allergy.fields.find(f => f.fieldType === 'table_fields')
      if (tableField) {
        tableField.apiFieldId = 'allergy_records'
        tableField.tableData = ehrData.allergy_records.map((record, idx) => ({
          id: `allergy_${idx}`,
          // 使用中文字段名（与 patient.schema.json 保持一致）
          '过敏史': record['过敏源(食物或药物)'] || record.allergen || '',
          '过敏反应': record['过敏反应'] || record.allergy_reaction || '',
          '入院日期': record['入院日期'] || record.admission_date || '',
          '是否存在过敏史': record['是否存在过敏史'] || '',
        }))
        tableField.confidence = 'high'
        tableField.source = 'api'
      }
    }

    // 家族史 (前端使用 table_fields 格式，需要特殊处理)
    // 后端数据字段名: 入院日期, 有无遗传病及肿瘤病史, 关系, 疾病
    if (ehrData.family_history_records?.length > 0 && merged.family && merged.family.fields) {
      // 找到家族疾病史表格字段并更新 tableData
      const tableField = merged.family.fields.find(f => f.fieldType === 'table_fields')
      if (tableField) {
        tableField.apiFieldId = 'family_history_records'
        tableField.tableData = ehrData.family_history_records.map((record, idx) => ({
          id: `family_${idx}`,
          // 使用中文字段名（与 patient.schema.json 保持一致）
          '家族史_关系': record['关系'] || record.relation || '',
          '家族史_疾病': record['疾病'] || record.disease || '',
          '入院日期': record['入院日期'] || record.admission_date || '',
          '有无遗传病及肿瘤病史': record['有无遗传病及肿瘤病史'] || '',
        }))
        tableField.confidence = 'high'
        tableField.source = 'api'
      }
    }

    // 实验室检查
    // 后端数据字段名: 检查机构, 采样日期, 报告日期, 报告编号, 标本类型, 检验结果(数组)
    if (ehrData.laboratory_records?.length > 0 && merged.laboratory) {
      merged.laboratory.records = ehrData.laboratory_records.map((record, idx) => {
        // 获取检验结果数组（支持中文和英文字段名）
        const items = record['检验结果'] || record.items || []
        return {
          id: `laboratory_${idx}`,
          fields: [
            { id: `LAB${idx}_001`, name: '检查机构', value: record['检查机构'] || record.institution || '', confidence: 'high', source: 'api', editable: true, fieldType: 'fields', uiType: 'text', apiFieldId: 'laboratory_records' },
            { id: `LAB${idx}_002`, name: '报告编号', value: record['报告编号'] || record.report_no || '', confidence: 'high', source: 'api', editable: true, fieldType: 'fields', uiType: 'text', apiFieldId: 'laboratory_records' },
            { id: `LAB${idx}_003`, name: '采样日期', value: record['采样日期'] || record.exam_date || '', confidence: 'high', source: 'api', editable: true, fieldType: 'fields', uiType: 'date', apiFieldId: 'laboratory_records' },
            { id: `LAB${idx}_004`, name: '报告日期', value: record['报告日期'] || record.report_date || '', confidence: 'high', source: 'api', editable: true, fieldType: 'fields', uiType: 'date', apiFieldId: 'laboratory_records' },
            { id: `LAB${idx}_005`, name: '标本类型', value: record['标本类型'] || record.specimen_type || '', confidence: 'high', source: 'api', editable: true, fieldType: 'fields', uiType: 'text', apiFieldId: 'laboratory_records' },
            // 检验指标表格
            {
              id: `LAB${idx}_TABLE`,
              name: '检验指标',
              fieldType: 'table_fields',
              confidence: 'high',
              source: 'api',
              editable: true,
              apiFieldId: 'laboratory_records',
              tableData: items.map((item, itemIdx) => ({
                id: `lab_item_${idx}_${itemIdx}`,
                // 使用中文字段名（与 patient.schema.json 保持一致）
                '指标名称（中文）': item['指标名称(中文)'] || item.item_name || '',
                '英文简称': item['英文简称'] || item.item_abbr || '',
                '检测值': item['检测值'] || item.value || '',
                '单位': item['单位'] || item.unit || '',
                '参考范围': item['参考范围'] || item.reference_range || '',
                '是否异常': item['是否异常'] || item.is_abnormal,
                '异常标志': item['异常标志'] || (item['是否异常'] === '是' || item.is_abnormal ? '↑' : '')
              }))
            }
          ]
        }
      })
    }

    // 影像检查
    // 后端数据字段名: 检查或报告机构, 检查日期, 报告日期, 检查部位, 检查编号(影像号), 所见描述, 诊断印象或结论, 是否有异常, 是否有肿瘤结论或描述
    if (ehrData.imaging_records?.length > 0 && merged.imaging) {
      merged.imaging.records = ehrData.imaging_records.map((record, idx) => ({
        id: `imaging_${idx}`,
        fields: [
          { id: `IMG${idx}_001`, name: '检查机构', value: record['检查或报告机构'] || record['检查(报告)机构'] || record.institution || '', confidence: 'high', source: 'api', editable: true, fieldType: 'fields', type: 'text', apiFieldId: 'imaging_records' },
          { id: `IMG${idx}_002`, name: '检查编号', value: record['检查编号(影像号)'] || record.report_no || '', confidence: 'high', source: 'api', editable: true, fieldType: 'fields', type: 'text', apiFieldId: 'imaging_records' },
          { id: `IMG${idx}_003`, name: '检查日期', value: record['检查日期'] || record.exam_date || '', confidence: 'high', source: 'api', editable: true, fieldType: 'fields', type: 'datepicker', apiFieldId: 'imaging_records' },
          { id: `IMG${idx}_004`, name: '报告日期', value: record['报告日期'] || record.report_date || '', confidence: 'high', source: 'api', editable: true, fieldType: 'fields', type: 'datepicker', apiFieldId: 'imaging_records' },
          { id: `IMG${idx}_005`, name: '检查部位', value: record['检查部位'] || record.exam_site || '', confidence: 'high', source: 'api', editable: true, fieldType: 'fields', type: 'text', apiFieldId: 'imaging_records' },
          { id: `IMG${idx}_006`, name: '所见描述', value: record['所见描述'] || record.imaging_description || '', confidence: 'high', source: 'api', editable: true, fieldType: 'fields', type: 'textarea', apiFieldId: 'imaging_records' },
          { id: `IMG${idx}_007`, name: '诊断印象', value: record['诊断印象或结论'] || record.imaging_diagnosis || '', confidence: 'high', source: 'api', editable: true, fieldType: 'fields', type: 'textarea', apiFieldId: 'imaging_records' },
          { id: `IMG${idx}_008`, name: '是否有异常', value: record['是否有异常'] || '', confidence: 'high', source: 'api', editable: true, fieldType: 'fields', type: 'text', apiFieldId: 'imaging_records' },
        ]
      }))
    }

    // 病理报告（嵌套结构适配）
    // 后端返回格式：pathology_records: [ { "术后组织病理": [...], "细胞学病理": [...] } ]
    // 或者也兼容：{ "病理": { "术后组织病理": [...] } }
    const rawPathologyRecords = ehrData.pathology_records || ehrData['病理']
    if (rawPathologyRecords && merged.pathology) {
      const allPathologyRecords = []
      let globalIdx = 0
      
      // 统一转换为数组处理（如果不是数组则包裹成数组）
      const recordsArray = Array.isArray(rawPathologyRecords) ? rawPathologyRecords : [rawPathologyRecords]
      
      // 遍历所有病理子类型
      const pathologyTypes = ['术后组织病理', '细胞学病理', '活检组织病理', '冰冻病理', '染色体分析']
      
      recordsArray.forEach(pathologyGroup => {
        if (!pathologyGroup || typeof pathologyGroup !== 'object') return

        pathologyTypes.forEach(pathologyType => {
          // 在当前对象中查找该类型的记录
          const records = pathologyGroup[pathologyType]
          if (Array.isArray(records) && records.length > 0) {
            records.forEach((record) => {
              // 根据不同类型的字段差异进行适配
              const isChromosomeAnalysis = pathologyType === '染色体分析'
              const isFrozenPathology = pathologyType === '冰冻病理'
              
              const fields = [
                { id: `PATH${globalIdx}_000`, name: '病理类型', value: pathologyType, confidence: 'high', source: 'api', editable: false, fieldType: 'fields', type: 'text', apiFieldId: '病理' },
                { id: `PATH${globalIdx}_001`, name: '医疗机构', value: record['医疗机构'] || '', confidence: 'high', source: 'api', editable: true, fieldType: 'fields', type: 'text', apiFieldId: '病理' },
                { id: `PATH${globalIdx}_002`, name: '病理号', value: record['病理号'] || '', confidence: 'high', source: 'api', editable: true, fieldType: 'fields', type: 'text', apiFieldId: '病理' },
              ]
              
              if (isChromosomeAnalysis) {
                fields.push(
                  { id: `PATH${globalIdx}_003`, name: '报告日期', value: record['报告日期'] || '', confidence: 'high', source: 'api', editable: true, fieldType: 'fields', type: 'datepicker', apiFieldId: '病理' },
                  { id: `PATH${globalIdx}_004`, name: '送检日期', value: record['送检日期'] || '', confidence: 'high', source: 'api', editable: true, fieldType: 'fields', type: 'datepicker', apiFieldId: '病理' }
                )
              } else {
                fields.push(
                  { id: `PATH${globalIdx}_003`, name: '病理诊断报告日期', value: record['病理诊断报告日期'] || '', confidence: 'high', source: 'api', editable: true, fieldType: 'fields', type: 'datepicker', apiFieldId: '病理' },
                  { id: `PATH${globalIdx}_004`, name: '病理送检日期', value: record['病理送检日期'] || '', confidence: 'high', source: 'api', editable: true, fieldType: 'fields', type: 'datepicker', apiFieldId: '病理' }
                )
              }
              
              fields.push(
                { id: `PATH${globalIdx}_005`, name: '病理样本', value: record['病理样本（取材）'] || '', confidence: 'high', source: 'api', editable: true, fieldType: 'fields', type: 'text', apiFieldId: '病理' },
                { id: `PATH${globalIdx}_006`, name: '病理图片', value: record['病理图片'] || '', confidence: 'high', source: 'api', editable: true, fieldType: 'fields', type: 'text', apiFieldId: '病理' },
                { id: `PATH${globalIdx}_007`, name: '病理描述', value: record['病理描述'] || '', confidence: 'high', source: 'api', editable: true, fieldType: 'fields', type: 'textarea', apiFieldId: '病理' },
                { id: `PATH${globalIdx}_008`, name: '免疫组化结果', value: record['免疫组化结果'] || '', confidence: 'high', source: 'api', editable: true, fieldType: 'fields', type: 'textarea', apiFieldId: '病理' }
              )
              
              if (isFrozenPathology) {
                fields.push(
                  { id: `PATH${globalIdx}_009`, name: '病理诊断', value: record['病理诊断'] || '', confidence: 'high', source: 'api', editable: true, fieldType: 'fields', type: 'textarea', apiFieldId: '病理' }
                )
              } else {
                fields.push(
                  { id: `PATH${globalIdx}_009`, name: '病理诊断结论', value: record['病理诊断结论'] || '', confidence: 'high', source: 'api', editable: true, fieldType: 'fields', type: 'textarea', apiFieldId: '病理' }
                )
              }
              
              if (!isChromosomeAnalysis) {
                fields.push(
                  { id: `PATH${globalIdx}_010`, name: '是否确诊肿瘤', value: record['是否确诊肿瘤'] || '', confidence: 'high', source: 'api', editable: true, fieldType: 'fields', type: 'text', apiFieldId: '病理' }
                )
              }
              
              allPathologyRecords.push({
                id: `pathology_${pathologyType}_${globalIdx}`,
                pathologyType: pathologyType,
                fields: fields
              })
              
              globalIdx++
            })
          }
        })
      })
      
      if (allPathologyRecords.length > 0) {
        merged.pathology.records = allPathologyRecords
      }
    }

    // 基因检测
    // 后端数据字段名: 检测机构, 送检日期, 报告日期, 检测类型, 标本类型, 取样部位, 检测项目名称, 检测方法, 检测编号, 基因突变详情 等
    if (ehrData.genetics_records?.length > 0 && merged.genetics) {
      merged.genetics.records = ehrData.genetics_records.map((record, idx) => ({
        id: `genetics_${idx}`,
        fields: [
          { id: `GEN${idx}_001`, name: '检测机构', value: record['检测机构'] || record.institution || '', confidence: 'high', source: 'api', editable: true, fieldType: 'fields', type: 'text', apiFieldId: 'genetics_records' },
          { id: `GEN${idx}_002`, name: '检测编号', value: record['检测编号'] || record.report_no || '', confidence: 'high', source: 'api', editable: true, fieldType: 'fields', type: 'text', apiFieldId: 'genetics_records' },
          { id: `GEN${idx}_003`, name: '送检日期', value: record['送检日期'] || record.exam_date || '', confidence: 'high', source: 'api', editable: true, fieldType: 'fields', type: 'datepicker', apiFieldId: 'genetics_records' },
          { id: `GEN${idx}_004`, name: '报告日期', value: record['报告日期'] || record.report_date || '', confidence: 'high', source: 'api', editable: true, fieldType: 'fields', type: 'datepicker', apiFieldId: 'genetics_records' },
          { id: `GEN${idx}_005`, name: '检测项目名称', value: record['检测项目名称'] || record.test_type || '', confidence: 'high', source: 'api', editable: true, fieldType: 'fields', type: 'text', apiFieldId: 'genetics_records' },
          { id: `GEN${idx}_006`, name: '检测方法', value: Array.isArray(record['检测方法']) ? record['检测方法'].join(', ') : (record['检测方法'] || record.test_method || ''), confidence: 'high', source: 'api', editable: true, fieldType: 'fields', type: 'text', apiFieldId: 'genetics_records' },
          { id: `GEN${idx}_007`, name: '标本类型', value: record['标本类型'] || '', confidence: 'high', source: 'api', editable: true, fieldType: 'fields', type: 'text', apiFieldId: 'genetics_records' },
          { id: `GEN${idx}_008`, name: '取样部位', value: record['取样部位'] || '', confidence: 'high', source: 'api', editable: true, fieldType: 'fields', type: 'text', apiFieldId: 'genetics_records' },
        ]
      }))
    }

    // 免疫接种史 (前端使用 table_fields 格式)
    // 后端数据字段名: 是否疫苗接种, 疫苗名称, 接种日期, 疫苗剂次, 接种备注
    if (ehrData.immunization_records?.length > 0 && merged.immunization && merged.immunization.fields) {
      const tableField = merged.immunization.fields.find(f => f.fieldType === 'table_fields')
      if (tableField) {
        tableField.apiFieldId = 'immunization_records'
        tableField.tableData = ehrData.immunization_records.map((record, idx) => ({
          id: `vaccine_${idx}`,
          // 使用中文字段名（与 patient.schema.json 保持一致）
          '疫苗名称': record['疫苗名称'] || record.vaccine_name || '',
          '接种日期': record['接种日期'] || record.vaccination_date || '',
          '疫苗剂次': record['疫苗剂次'] || record.dose || '',
          '接种备注': record['接种备注'] || record.remark || '',
          '是否疫苗接种': record['是否疫苗接种'] || '',
        }))
        tableField.confidence = 'high'
        tableField.source = 'api'
      }
    }

    // 生育史 (前端使用 table_fields 格式)
    // 后端数据结构: [{入院日期, 生育史描述, 生育史详情: [{孕次序号, 分娩方式, ...}]}]
    // 需要展开嵌套的 生育史详情 数组，如果没有详情则显示描述
    if (ehrData.reproductive_records?.length > 0 && merged.reproductive && merged.reproductive.fields) {
      const tableField = merged.reproductive.fields.find(f => f.fieldType === 'table_fields')
      if (tableField) {
        tableField.apiFieldId = 'reproductive_records'
        
        const flattenedData = []
        ehrData.reproductive_records.forEach((parentRecord, parentIdx) => {
          // 优先使用 生育史详情 数组
          const details = parentRecord['生育史详情'] || parentRecord.details || []
          
          if (details.length > 0) {
            // 有详细记录，展开显示
            details.forEach((detail, detailIdx) => {
              flattenedData.push({
                id: `pregnancy_${parentIdx}_${detailIdx}`,
                '孕次序号': detail['孕次序号'] || detail.pregnancy_order || '',
                '分娩方式': detail['分娩方式'] || detail.delivery_method || '',
                '分娩日期': detail['分娩日期'] || detail.delivery_date || '',
                '孕周数': detail['孕周数(单位：周）'] || detail['孕周数'] || detail.gestational_weeks || '',
                '产时备注': detail['产时备注'] || detail.remark || '',
                '入院日期': parentRecord['入院日期'] || parentRecord.admission_date || '',
              })
            })
          } else if (parentRecord['生育史描述'] || parentRecord.description) {
            // 没有详细记录，但有描述文字，显示为一条记录
            flattenedData.push({
              id: `pregnancy_${parentIdx}`,
              '生育史描述': parentRecord['生育史描述'] || parentRecord.description || '',
              '入院日期': parentRecord['入院日期'] || parentRecord.admission_date || '',
            })
          } else {
            // 兜底：尝试作为扁平记录处理（兼容旧格式）
            flattenedData.push({
              id: `pregnancy_${parentIdx}`,
              '孕次序号': parentRecord['孕次序号'] || parentRecord.pregnancy_order || '',
              '分娩方式': parentRecord['分娩方式'] || parentRecord.delivery_method || '',
              '分娩日期': parentRecord['分娩日期'] || parentRecord.delivery_date || '',
              '孕周数': parentRecord['孕周数(单位：周）'] || parentRecord['孕周数'] || parentRecord.gestational_weeks || '',
              '产时备注': parentRecord['产时备注'] || parentRecord.remark || '',
              '入院日期': parentRecord['入院日期'] || parentRecord.admission_date || '',
            })
          }
        })
        
        tableField.tableData = flattenedData
        tableField.confidence = 'high'
        tableField.source = 'api'
      }
    }

    // 合并症 (前端使用 table_fields 格式)
    // 后端数据字段名与既往史类似
    if (ehrData.comorbidity_records?.length > 0 && merged.comorbidity && merged.comorbidity.fields) {
      const tableField = merged.comorbidity.fields.find(f => f.fieldType === 'table_fields')
      if (tableField) {
        tableField.apiFieldId = 'comorbidity_records'
        tableField.tableData = ehrData.comorbidity_records.map((record, idx) => ({
          id: `comorbidity_${idx}`,
          // 使用中文字段名（与 patient.schema.json 保持一致）
          '合并症_疾病': record['既往疾病'] || record['疾病名称'] || record.disease_name || '',
          '合并症_确诊日期': record['确诊日期'] || record.diagnosis_date || ''
        }))
        tableField.confidence = 'high'
        tableField.source = 'api'
      }
    }

    // 其他检查
    // 后端数据字段名: 检查项目, 检查机构, 检查日期, 报告日期, 检查编号, 检查结果描述, 检查结论
    if (ehrData.other_exam_records?.length > 0 && merged.otherExam) {
      merged.otherExam.records = ehrData.other_exam_records.map((record, idx) => ({
        id: `other_exam_${idx}`,
        fields: [
          { id: `OE${idx}_001`, name: '检查项目', value: record['检查项目'] || record.project_name || '', confidence: 'high', source: 'api', editable: true, fieldType: 'fields', apiFieldId: 'other_exam_records' },
          { id: `OE${idx}_002`, name: '检查机构', value: record['检查机构'] || record.institution || '', confidence: 'high', source: 'api', editable: true, fieldType: 'fields', apiFieldId: 'other_exam_records' },
          { id: `OE${idx}_003`, name: '检查日期', value: record['检查日期'] || record.exam_date || '', confidence: 'high', source: 'api', editable: true, fieldType: 'fields', apiFieldId: 'other_exam_records' },
          { id: `OE${idx}_004`, name: '报告日期', value: record['报告日期'] || record.report_date || '', confidence: 'high', source: 'api', editable: true, fieldType: 'fields', apiFieldId: 'other_exam_records' },
          { id: `OE${idx}_005`, name: '检查编号', value: record['检查编号'] || record.report_no || '', confidence: 'high', source: 'api', editable: true, fieldType: 'fields', apiFieldId: 'other_exam_records' },
          { id: `OE${idx}_006`, name: '检查结果描述', value: record['检查结果描述'] || record.conclusion || '', confidence: 'high', source: 'api', editable: true, fieldType: 'fields', apiFieldId: 'other_exam_records' },
          { id: `OE${idx}_007`, name: '检查结论', value: record['检查结论'] || '', confidence: 'high', source: 'api', editable: true, fieldType: 'fields', apiFieldId: 'other_exam_records' },
        ]
      }))
    }

    // 其他材料
    if (ehrData.material_records?.length > 0 && merged.materialInfo) {
      merged.materialInfo.records = ehrData.material_records.map((record, idx) => ({
        id: `material_${idx}`,
        fields: [
          { id: `MAT${idx}_001`, name: '材料类型', value: record.material_type || '', confidence: 'high', source: 'api', editable: true, fieldType: 'fields', apiFieldId: 'material_records' },
          { id: `MAT${idx}_002`, name: '名称', value: record.name || '', confidence: 'high', source: 'api', editable: true, fieldType: 'fields', apiFieldId: 'material_records' },
          { id: `MAT${idx}_003`, name: '来源机构', value: record.institution || '', confidence: 'high', source: 'api', editable: true, fieldType: 'fields', apiFieldId: 'material_records' },
          { id: `MAT${idx}_004`, name: '日期', value: record.date || '', confidence: 'high', source: 'api', editable: true, fieldType: 'fields', apiFieldId: 'material_records' },
          { id: `MAT${idx}_005`, name: '摘要', value: record.summary || '', confidence: 'high', source: 'api', editable: true, fieldType: 'fields', apiFieldId: 'material_records' },
        ]
      }))
    }

    return merged
  }, [ehrData, ehrFieldsData])

  // 动态计算字段组的填充统计数据（基于实际 API 数据）
  const ehrFieldGroups = useMemo(() => {
    // 使用字段组结构配置作为基础
    const groups = JSON.parse(JSON.stringify(ehrFieldGroupsConfig))
    
    // 辅助函数：计算字段组的填充数量
    const countFilledFields = (groupKey) => {
      const groupData = mergedEhrFieldsData?.[groupKey]
      if (!groupData) return { filled: 0, total: 0 }

      let filled = 0
      let total = 0

      // 处理普通字段组（非可重复）
      if (groupData.fields && !groupData.repeatable) {
        groupData.fields.forEach(field => {
          if (field.fieldType === 'table_fields') {
            // 表格字段：计为1个字段，有数据就算已填充
            total++
            if (field.tableData && field.tableData.length > 0) {
              filled++
            }
          } else {
            // 普通字段：有值就算已填充
            total++
            if (field.value !== null && field.value !== undefined && field.value !== '') {
              filled++
            }
          }
        })
      }

      // 处理可重复字段组（records 数组）
      if (groupData.repeatable) {
        const records = groupData.records || []
        if (records.length > 0) {
          // 计算所有记录中所有字段的填充情况
          records.forEach(record => {
            if (record.fields) {
              record.fields.forEach(field => {
                total++
                if (field.value !== null && field.value !== undefined && field.value !== '') {
                  filled++
                }
              })
            }
          })
        } else {
          // 没有记录时，显示 0/0 或使用默认的 fieldCount
          total = 0
          filled = 0
        }
      }

      return { filled, total }
    }

    // 确定字段组状态
    const getGroupStatus = (filled, total) => {
      if (total === 0) return 'incomplete'
      const ratio = filled / total
      if (ratio >= 1) return 'completed'
      if (ratio >= 0.5) return 'partial'
      return 'incomplete'
    }

    // 遍历所有字段组，更新统计数据
    groups.forEach(group => {
      let groupFilled = 0
      let groupTotal = 0

      if (group.children) {
        // 有子字段组
        group.children.forEach(child => {
          const { filled, total } = countFilledFields(child.key)
          
          // API 模式下：如果计算结果为0，说明没有数据，显示 0/原始fieldCount
          if (total === 0 && !ehrData) {
            // 没有病历数据时，保留原始 fieldCount 但 extractedCount 为 0
            child.extractedCount = 0
            // child.fieldCount 保持不变（使用配置中的值）
          } else {
            child.extractedCount = filled
            child.fieldCount = total > 0 ? total : child.fieldCount
          }
          
          child.status = getGroupStatus(child.extractedCount, child.fieldCount)
          child.completeness = child.fieldCount > 0 ? Math.round((child.extractedCount / child.fieldCount) * 100) : 0
          
          groupFilled += child.extractedCount
          groupTotal += child.fieldCount
        })
      } else {
        // 无子字段组（顶级叶子节点）
        const { filled, total } = countFilledFields(group.key)
        if (total === 0 && !ehrData) {
          groupFilled = 0
          groupTotal = group.fieldCount  // 保留原始 fieldCount
        } else {
          groupFilled = filled
          groupTotal = total > 0 ? total : group.fieldCount
        }
      }

      // 更新父级统计
      group.extractedCount = groupFilled
      group.fieldCount = groupTotal > 0 ? groupTotal : group.fieldCount
      group.status = getGroupStatus(group.extractedCount, group.fieldCount)
      group.completeness = group.fieldCount > 0 ? Math.round((group.extractedCount / group.fieldCount) * 100) : 0
    })

    return groups
  }, [mergedEhrFieldsData, ehrData])
  
  // 电子病历夹文档数据（使用患者关联的文档）
  const ehrDocuments = useMemo(() => {
    if (!patientDocuments || patientDocuments.length === 0) {
      return []
    }
    // 将患者关联的文档转换为 ehrDocuments 格式
    return patientDocuments.map(doc => ({
      id: doc.id,
      name: doc.fileName || doc.file_name || '未知文档',
      category: doc.metadata?.documentType || doc.category || '其他',
      status: doc.status === 'extracted' ? 'extracted' : (doc.status === 'processing' ? 'pending' : doc.status),
      confidence: typeof doc.confidence === 'number' 
        ? (doc.confidence >= 0.9 ? 'high' : doc.confidence >= 0.7 ? 'medium' : 'low')
        : doc.confidence,
      uploadDate: doc.uploadTime?.split(' ')[0] || doc.upload_time?.split('T')[0] || '',
      extractedFields: doc.extractedFields?.map(f => f.fieldName || f.field_name) || []
    }))
  }, [patientDocuments])

  // 文档数据（使用 API 返回的患者文档）
  const documents = patientDocuments || []

  // 冲突数据（字段级快速抽取 / V2 冲突）
  const [conflicts, setConflicts] = useState([])
  const [conflictsLoading, setConflictsLoading] = useState(false)
  const [conflictResolvingId, setConflictResolvingId] = useState(null)
  React.useEffect(() => {
    let cancelled = false
    async function load() {
      if (!patientId) return
      setConflictsLoading(true)
      try {
        const res = await getFieldConflicts(patientId, 'pending')
        const list = res?.data?.conflicts || []
        if (!cancelled) setConflicts(list)
      } catch (e) {
        if (!cancelled) setConflicts([])
      } finally {
        if (!cancelled) setConflictsLoading(false)
      }
    }
    load()
    return () => { cancelled = true }
  }, [patientId])

  // 变更日志（TODO: 从 API 获取）
  const changeLogs = []

  // 文档类型图标映射
  const getDocumentIcon = (type) => {
    switch (type) {
      case 'PDF':
        return <FileTextOutlined style={{ color: token.colorError }} />
      case 'Image':
        return <PictureOutlined style={{ color: token.colorSuccess }} />
      case 'Excel':
        return <FileTextOutlined style={{ color: token.colorPrimary }} />
      default:
        return <FileTextOutlined />
    }
  }

  // 置信度标签
  const getConfidenceTag = (confidence) => {
    if (!confidence && confidence !== 0) return null
    
    // 处理数字类型的置信度
    let confidenceLevel
    if (typeof confidence === 'number') {
      if (confidence >= 0.9) {
        confidenceLevel = 'high'
      } else if (confidence >= 0.7) {
        confidenceLevel = 'medium'
      } else {
        confidenceLevel = 'low'
      }
    } else {
      confidenceLevel = confidence
    }
    
    const config = CONFIDENCE_CONFIG[confidenceLevel]
    if (!config) return null
    
    const { color, text } = config
    return <Tag color={color} size="small">{text}</Tag>
  }

  // 电子病历夹相关辅助函数
  // 获取状态图标
  const getEhrStatusIcon = (status) => {
    switch (status) {
      case 'completed': return <CheckCircleOutlined style={{ color: token.colorSuccess }} />
      case 'partial': return <ExclamationCircleOutlined style={{ color: token.colorWarning }} />
      case 'incomplete': return <ExclamationCircleOutlined style={{ color: token.colorError }} />
      default: return null
    }
  }

  // 获取置信度颜色
  const getEhrConfidenceColor = (confidence) => {
    switch (confidence) {
      case 'high': return token.colorSuccess
      case 'medium': return token.colorWarning
      case 'low': return token.colorError
      default: return token.colorBorder
    }
  }



  // 处理文档点击 - 由DocumentsTab组件处理
  const handleDocumentClick = (doc) => {
    // 这个函数现在由DocumentsTab组件内部处理
    // 保留这里是为了向后兼容，但实际逻辑已移至DocumentsTab
    console.log('文档点击:', doc)
  }

  // 编辑患者信息 - 已移至usePatientData Hook

  // 保存患者信息 - 已移至usePatientData Hook

  // 导出数据
  const handleExportData = () => {
    setExportModalVisible(true)
  }

  // 确认导出
  const handleConfirmExport = (exportConfig) => {
    message.success('数据导出已开始，请稍后下载')
    setExportModalVisible(false)
    // 这里实现实际的导出逻辑
  }

  // 删除文档（由文档列表卡片或详情弹窗内删除按钮调用，传入文档 ID）
  const handleDeleteDocument = async (docId) => {
    if (!docId) return
    try {
      const response = await deleteDocument(docId, true)
      if (response.success) {
        message.success('文档删除成功')
        await syncPatientStatsAfterDocumentChange?.()
      } else {
        message.error(response.message || '删除失败')
      }
    } catch (error) {
      console.error('删除文档失败:', error)
      // request.js 抛 ApiRequestError：.message 已是后端 detail，.data 是原始 body
      message.error(error?.data?.detail || error?.message || '删除文档失败')
    }
  }

  // 重新抽取数据（使用异步任务）
  const handleReExtract = async (docId) => {
    // 如果传入docId，使用同步抽取单个文档
    if (docId) {
      setReExtracting(true)
      try {
        console.log('开始重新抽取文档:', docId)
        const response = await extractEhrData(docId)
        
        if (response.success) {
          message.success(`重新抽取成功，共抽取 ${response.data?.fields_count || 0} 个字段`)
          fetchPatientDocuments?.()
        } else {
          message.error(response.message || '重新抽取失败')
        }
      } catch (error) {
        console.error('重新抽取异常:', error)
        const errorMsg = error.response?.data?.message || error.message || '重新抽取失败'
        message.error(`重新抽取失败: ${errorMsg}`)
      } finally {
        setReExtracting(false)
      }
      return
    }
    
    // 不传入docId时，启动异步任务抽取患者所有文档
    setReExtracting(true)
    message.loading({ content: '正在启动抽取任务...', key: 'extraction', duration: 0 })
    
    try {
      // 1. 启动异步抽取任务
      const startResponse = await startPatientExtraction(patientId)
      
      if (!startResponse.success) {
        message.error({ content: startResponse.message || '启动抽取任务失败', key: 'extraction' })
        setReExtracting(false)
        return
      }
      
      const taskId = startResponse.data?.task_id
      if (!taskId) {
        message.error({ content: '未获取到任务ID', key: 'extraction' })
        setReExtracting(false)
        return
      }

      upsertTask({
        task_id: taskId,
        patient_id: patientId,
        type: 'patient_extract',
        status: 'pending',
        percentage: 0,
        message: '抽取任务已启动',
        created_at: new Date().toISOString()
      })
      loadTaskItems()
      
      message.loading({ content: '抽取任务已启动，正在处理...', key: 'extraction', duration: 0 })
      
      // 2. 轮询任务状态
      const pollInterval = 2000 // 2秒轮询一次
      const maxPolls = 60 // 最多轮询60次（2分钟）
      let pollCount = 0
      
      const pollStatus = async () => {
        try {
          const statusResponse = await getExtractionTaskStatus(taskId)
          
          if (!statusResponse.success) {
            console.error('查询任务状态失败:', statusResponse.message)
            pollCount++
            if (pollCount < maxPolls) {
              setTimeout(pollStatus, pollInterval)
            } else {
              message.warning({ content: '任务状态查询超时，请稍后手动刷新查看结果', key: 'extraction' })
              setReExtracting(false)
            }
            return
          }
          
          const taskData = statusResponse.data
          const status = taskData.status
          
          const uiPercentage = taskData.percentage ?? taskData.progress ?? 0
          const uiMessage = taskData.message || taskData.current_step || '抽取任务处理中'
          const uiCurrent = taskData.current ?? taskData.processed_patients
          const uiTotal = taskData.total ?? taskData.total_patients
          const uiFailCount = taskData.fail_count ?? taskData.error_count ?? 0
          // 更新进度消息
          if (uiPercentage && uiMessage) {
            message.loading({ 
              content: `${uiMessage} (${uiPercentage}%)`, 
              key: 'extraction', 
              duration: 0 
            })
          }

          upsertTask({
            task_id: taskId,
            patient_id: patientId,
            type: 'patient_extract',
            status: taskData.status,
            percentage: uiPercentage,
            current: uiCurrent,
            total: uiTotal,
            message: uiMessage,
            updated_at: taskData.updated_at || new Date().toISOString()
          })
          loadTaskItems()
          
          // 检查任务是否完成
          if (status === 'completed' || status === 'completed_with_errors') {
            // 任务完成
            const successCount = taskData.success_count || 0
            const failCount = uiFailCount
            const mergeStats = taskData.merge_stats || {}
            
            let successMsg = `抽取完成：处理 ${successCount + failCount} 个文档`
            if (mergeStats.updated_count || mergeStats.added_count) {
              successMsg += `，更新 ${mergeStats.updated_count || 0} 个字段，新增 ${mergeStats.added_count || 0} 个字段`
            }
            
            if (claimExtractionNotifyOnce(taskId)) {
              if (failCount > 0) {
                message.warning({ content: `${successMsg}（${failCount} 个失败）`, key: 'extraction', duration: 5 })
              } else {
                message.success({ content: successMsg, key: 'extraction', duration: 5 })
              }
            }

            // 刷新数据
            fetchPatientDocuments?.()
            setReExtracting(false)
            
          } else if (status === 'failed') {
            // 任务失败
            if (claimExtractionNotifyOnce(taskId)) {
              message.error({ content: taskData.message || '抽取任务失败', key: 'extraction', duration: 5 })
            }
            setReExtracting(false)
            
          } else {
            // 任务仍在进行中，继续轮询
            pollCount++
            if (pollCount < maxPolls) {
              setTimeout(pollStatus, pollInterval)
            } else {
              message.warning({ content: '任务仍在后台执行中，请稍后刷新页面查看结果', key: 'extraction', duration: 5 })
              setReExtracting(false)
            }
          }
        } catch (error) {
          console.error('轮询任务状态异常:', error)
          pollCount++
          if (pollCount < maxPolls) {
            setTimeout(pollStatus, pollInterval)
          } else {
            message.error({ content: '查询任务状态失败，请稍后手动刷新', key: 'extraction', duration: 5 })
            setReExtracting(false)
          }
        }
      }
      
      // 开始轮询
      setTimeout(pollStatus, pollInterval)
      
    } catch (error) {
      console.error('启动抽取任务异常:', error)
      const errorMsg = error.response?.data?.message || error.message || '启动抽取任务失败'
      message.error({ content: errorMsg, key: 'extraction', duration: 5 })
      setReExtracting(false)
    }
  }

  // AI助手发送消息
  const handleSendAiMessage = () => {
    if (!aiInput.trim()) return
    
    const userMessage = {
      type: 'user',
      content: aiInput,
      timestamp: new Date().toLocaleString()
    }
    
    // 模拟AI回复
    const aiReply = {
      type: 'ai',
      content: generateAiResponse(aiInput),
      timestamp: new Date().toLocaleString()
    }
    
    setAiMessages([...aiMessages, userMessage, aiReply])
    setAiInput('')
  }

  // 生成AI回复（模拟）
  const generateAiResponse = (input) => {
    const inputLower = input.toLowerCase()
    if (inputLower.includes('血常规') || inputLower.includes('血检')) {
      return '根据2024-01-15的血常规报告，患者白细胞计数为6.5×10⁹/L（正常范围），红细胞计数为4.2×10¹²/L（略低），血红蛋白为125g/L（略低）。建议关注贫血情况。'
    } else if (inputLower.includes('用药') || inputLower.includes('药物')) {
      return '患者目前正在服用吉非替尼250mg，每日一次，用于靶向治疗。开始时间为2024-01-10，目前持续用药中。'
    } else if (inputLower.includes('诊断')) {
      return '患者主要诊断为肺腺癌和高血压。肺腺癌确诊时间为2024-01-10，目前正在接受靶向治疗。'
    } else {
      return '我理解您的问题。基于患者张三的当前数据，我可以为您提供相关信息。请您具体说明需要了解哪方面的情况？'
    }
  }

  // 解决冲突
  const handleResolveConflict = async (conflictId, action) => {
    if (!patientId) return
    setConflictResolvingId(conflictId)
    try {
      await resolveFieldConflict(patientId, conflictId, action)
      message.success(action === 'adopt' ? '已采用新值' : '已保留旧值')
      // 刷新冲突列表
      const res = await getFieldConflicts(patientId, 'pending')
      const list = res?.data?.conflicts || []
      setConflicts(list)
      // 刷新患者详情（用于立即看到字段变化）
      if (action === 'adopt') {
        fetchPatientDetail?.()
      }
      // 全部解决后自动关闭
      if (!list.length) setConflictResolveVisible(false)
    } catch (e) {
      message.error('解决冲突失败: ' + (e?.message || '未知错误'))
    } finally {
      setConflictResolvingId(null)
    }
  }

  // 查看变更日志
  const handleViewChangeLogs = () => {
    setChangeLogVisible(true)
  }

  // 任务中心：加载本地任务列表
  const loadTaskItems = () => {
    const list = getTasksByPatient(patientId) || []
    setTaskItems(list)
  }

  // 后台轮询上传归档任务（基于 document_id 轮询 ocr_status / meta_status）
  // 后端流程：POST /documents (带 patient_id) 自动 archived → OCR → metadata → patient_ehr extraction
  // 完成条件：meta_status === 'completed'（OCR 必定已 completed）
  const pollUploadArchiveTask = async ({ documentId, fileName, fileKey }) => {
    if (!documentId) return
    const maxWaitMs = 15 * 60 * 1000
    const intervalMs = 2000
    const startAt = Date.now()

    // 阶段进度映射：OCR 30-70%，metadata 70-95%，完成 100%
    const computeStage = (ocrStatus, metaStatus) => {
      const ocr = String(ocrStatus || '').toLowerCase()
      const meta = String(metaStatus || '').toLowerCase()
      if (ocr === 'failed') return { kind: 'error', percent: 100, message: 'OCR 失败' }
      if (meta === 'failed') return { kind: 'error', percent: 100, message: '元数据抽取失败' }
      if (meta === 'completed') {
        return { kind: 'success', percent: 100, message: '已归档完成（电子病历夹后台更新中）' }
      }
      if (ocr === 'completed') {
        // 进入 metadata 阶段
        return { kind: 'progress', percent: 85, message: '正在抽取元数据…' }
      }
      if (ocr === 'processing') {
        return { kind: 'progress', percent: 50, message: '正在进行 OCR…' }
      }
      // queued / pending / 未知
      return { kind: 'progress', percent: 35, message: 'OCR 排队中…' }
    }

    const writeProgress = (stage) => {
      const status = stage.kind === 'error' ? 'error' : stage.kind === 'success' ? 'success' : 'uploading'
      setUploadProgress(prev => ({
        ...prev,
        [fileKey]: { status, percent: stage.percent, message: stage.message }
      }))
    }

    const writeTask = (stage, extra = {}) => {
      const taskStatus = stage.kind === 'success' ? 'completed' : stage.kind === 'error' ? 'failed' : 'processing'
      upsertTask({
        task_id: documentId,
        patient_id: patientId,
        document_id: documentId,
        file_name: fileName,
        type: 'upload_archive',
        status: taskStatus,
        percentage: stage.percent,
        message: stage.message,
        updated_at: new Date().toISOString(),
        ...extra
      })
      loadTaskItems()
    }

    try {
      while (Date.now() - startAt < maxWaitMs) {
        await new Promise(resolve => setTimeout(resolve, intervalMs))
        let res
        try {
          res = await getFileStatusesByIds([documentId])
        } catch (err) {
          // 查询失败时不立即结束，等下一轮重试
          console.warn('查询文档状态失败，将重试:', err?.message)
          continue
        }
        const item = res?.data?.items?.[0] || res?.items?.[0]
        if (!item) continue

        const stage = computeStage(item.ocr_status, item.meta_status)
        writeProgress(stage)
        writeTask(stage)

        if (stage.kind === 'success') {
          // 触发文档列表与统计刷新
          await syncPatientStatsAfterDocumentChange?.()
          fetchPatientDocuments?.()
          return
        }
        if (stage.kind === 'error') {
          return
        }
      }

      // 超时
      const timeoutStage = { kind: 'error', percent: 99, message: '后台处理超时，请稍后在任务中心查看结果' }
      writeProgress(timeoutStage)
      writeTask(timeoutStage)
    } catch (e) {
      const errStage = { kind: 'error', percent: 100, message: e?.message || '任务状态查询失败' }
      writeProgress(errStage)
      writeTask(errStage)
    }
  }

  React.useEffect(() => {
    loadTaskItems()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId])

  /**
   * 监听来自左侧患者 rail 的“刷新当前患者详情”事件。
   * 仅当事件 patientId 与当前详情页一致时执行刷新。
   */
  React.useEffect(() => {
    const handleRefreshFromRail = (event) => {
      const targetPatientId = String(event?.detail?.patientId || '')
      if (!targetPatientId || String(patientId) !== targetPatientId) return
      fetchPatientDetail?.()
      fetchPatientDocuments?.()
      syncPatientStatsAfterDocumentChange?.()
    }
    window.addEventListener('patient-detail-refresh', handleRefreshFromRail)
    return () => window.removeEventListener('patient-detail-refresh', handleRefreshFromRail)
  }, [patientId, fetchPatientDetail, fetchPatientDocuments])

  React.useEffect(() => {
    if (!taskCenterVisible || !patientId) return
    let cancelled = false
    let timer = null

    async function pollOnce() {
      if (cancelled) return
      setTaskPolling(true)
      try {
        const list = getTasksByPatient(patientId) || []
        const updated = []
        for (const t of list) {
          // 只轮询未结束的任务
          if (['completed', 'completed_with_errors', 'failed', 'cancelled'].includes(t.status)) {
            updated.push(t)
            continue
          }
          try {
            const isUploadArchiveTask = t.type === 'upload_archive' || String(t.task_id || '').startsWith('upload_archive_')
            const res = isUploadArchiveTask
              ? await getDocumentTaskProgress(t.task_id, { silent: true })
              : await getExtractionTaskStatus(t.task_id)
            const data = res?.data
            if (data) {
              const merged = isUploadArchiveTask
                ? {
                    ...t,
                    status: data.status,
                    message: data.current_step || data.message,
                    percentage: data.progress ?? data.percentage,
                    current: data.current ?? data.processed_patients,
                    total: data.total ?? data.total_patients,
                    updated_at: data.updated_at || new Date().toISOString()
                  }
                : {
                    ...t,
                    status: data.status,
                    message: data.message || data.current_step,
                    percentage: data.percentage ?? data.progress,
                    current: data.current ?? data.processed_patients,
                    total: data.total ?? data.total_patients,
                    updated_at: data.updated_at
                  }
              upsertTask(merged)
              updated.push(merged)
            } else {
              updated.push(t)
            }
          } catch {
            updated.push(t)
          }
        }
        if (!cancelled) setTaskItems(updated)
      } finally {
        if (!cancelled) setTaskPolling(false)
      }
      timer = setTimeout(pollOnce, 2000)
    }

    pollOnce()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
    }
  }, [taskCenterVisible, patientId])

  // 确认变更
  const handleConfirmChange = (logId) => {
    message.success('变更已确认')
    // 这里实现变更确认逻辑
  }

  // 撤销变更
  const handleRevertChange = (logId) => {
    message.success('变更已撤销')
    // 这里实现变更撤销逻辑
  }

  // AI综述相关函数 - 已移至usePatientData Hook

  // 查看来源文档
  const handleViewSourceDocument = (docId) => {
    const doc = documents.find(d => d.id === docId)
    if (doc) {
      setSelectedDocument(doc)
      setDataExtractionVisible(true)
    }
  }

  // 渲染带脚注的综述内容
  const renderSummaryWithFootnotes = (content) => {
    // 将脚注标记转换为可点击的链接
    const parts = content.split(/(\[[0-9]+\])/)
    return parts.map((part, index) => {
      const footnoteMatch = part.match(/\[([0-9]+)\]/)
      if (footnoteMatch) {
        const refNum = footnoteMatch[1]
        const sourceDoc = aiSummary.sourceDocuments.find(doc => doc.ref === part)
        return (
          <Tooltip key={index} title={`点击查看: ${sourceDoc?.name}`}>
            <Button 
              type="link" 
              size="small"
              style={{ 
                padding: 0, 
                height: 'auto', 
                fontSize: 12,
                color: token.colorPrimary,
                textDecoration: 'underline'
              }}
              onClick={() => sourceDoc && handleViewSourceDocument(sourceDoc.id)}
            >
              {part}
            </Button>
          </Tooltip>
        )
      }
      return <span key={index}>{part}</span>
    })
  }

  return (
    <div className="page-container fade-in">
      {/**
       * 患者详情主容器固定高度，确保概览区与内容区合并后铺满主体背景。
       */}
      <Card
          size="small"
          style={{ marginBottom: 16 }}
          bodyStyle={{
            padding: 16,
            height: toViewportHeight(PAGE_LAYOUT_HEIGHTS.patientDetail.cardOffset),
            minHeight: PAGE_LAYOUT_HEIGHTS.patientDetail.cardMinHeight,
            display: 'flex',
            flexDirection: 'column',
            overflow: 'hidden',
          }}
        >
          <Row gutter={24} align="middle" style={{ flexShrink: 0 }}>
            <Col>
              <Avatar size={64} icon={<UserOutlined />} />
            </Col>
            <Col flex={1}>
              <Row gutter={[24, 12]}>
                <Col span={6}>
                  <div>
                    <Text type="secondary">姓名:</Text>
                    <Text strong style={{ marginLeft: 8, fontSize: 16 }}>{patientInfo.name ? maskName(patientInfo.name) : '-'}</Text>
                    {loading && (
                      <LoadingOutlined spin style={{ marginLeft: 8, color: token.colorPrimary }} />
                    )}
                  </div>
                </Col>
                <Col span={6}>
                  <div>
                    <Text type="secondary">性别/年龄:</Text>
                    <Text strong style={{ marginLeft: 8 }}>
                      {patientInfo.gender || '-'} / {patientInfo.age ? `${patientInfo.age}岁` : '-'}
                    </Text>
                  </div>
                </Col>
                <Col span={6}>
                  <div>
                    <Text type="secondary">科室:</Text>
                    <Text strong style={{ marginLeft: 8 }}>{patientInfo.department || '-'}</Text>
                  </div>
                </Col>
                <Col span={6}>
                  <div>
                    <Text type="secondary">主治医生:</Text>
                    <Text strong style={{ marginLeft: 8 }}>{patientInfo.doctor || '-'}</Text>
                  </div>
                </Col>
                <Col span={12}>
                  <div>
                    <Text type="secondary">主要诊断:</Text>
                    <div style={{ marginLeft: 8, marginTop: 4 }}>
                      <Space wrap>
                        {(patientInfo.diagnosis || []).length > 0 ? (
                          patientInfo.diagnosis.map(d => (
                            <Tag key={d} color="blue">{d}</Tag>
                          ))
                        ) : (
                          <Text type="secondary">暂无</Text>
                        )}
                      </Space>
                    </div>
                  </div>
                </Col>
                <Col span={12} style={{ minWidth: 0 }}>
                  <div style={{ minWidth: 0 }}>
                    <Text type="secondary">关联项目:</Text>
                    <div style={{ marginLeft: 8, marginTop: 4 }}>
                      <Space wrap size={[4, 4]}>
                        {(patientInfo.projects || []).length > 0 ? (
                          patientInfo.projects.map(project => {
                            const projectId = typeof project === 'object' ? project.id : project
                            const projectName = (typeof project === 'object' ? project.name : project) || ''
                            const maxLen = 10
                            const displayName = projectName.length > maxLen ? `${projectName.slice(0, maxLen)}…` : projectName
                            return (
                              <Tooltip key={projectId} title={projectName || undefined}>
                                <Button
                                  type="link"
                                  size="small"
                                  onClick={() => navigate(`/research/projects/${projectId}`)}
                                  style={{ padding: '2px 8px', height: 'auto', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis' }}
                                >
                                  {displayName}
                                </Button>
                              </Tooltip>
                            )
                          })
                        ) : (
                          <Text type="secondary">暂无关联项目</Text>
                        )}
                      </Space>
                    </div>
                  </div>
                </Col>
              </Row>
            </Col>
            <Col>
              <Space direction="vertical">
                <Button type="primary" icon={<EditOutlined />} onClick={() => {
                  openPatientEditModal()
                }}>
                  编辑信息
                </Button>
                <Button icon={<DownloadOutlined />} onClick={handleExportData}>
                  导出数据
                </Button>
              </Space>
            </Col>
          </Row>

          <Divider style={{ margin: '12px -16px 12px' }} />

          {/* Tab页面布局 */}
          <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
            <Tabs
          defaultActiveKey="ehr-schema"
          activeKey={activeTab}
          onChange={setActiveTab}
          style={{ height: '100%' }}
          items={[
            {
              key: 'ehr-schema',
              label: (
                <Space>
                  <DatabaseOutlined />
                  电子病历_V2.0
                </Space>
              ),
              children: (
                <SchemaEhrTab
                  patientId={patientId}
                  patientDocuments={documents}
                  onUploadDocument={() => setUploadVisible(true)}
                  onSave={async (data, type) => console.log('Schema保存', type, data)}
                  onDataChange={(data) => console.log('Schema数据变更', data)}
                />
              )
            },
            {
              key: 'documents',
              label: (
                <Space>
                  <FileTextOutlined />
                  文档（{documents.length}）
                </Space>
              ),
              children: (
                <DocumentsTab
                  patientId={patientId}
                  patientInfo={patientInfo}
                  documents={documents}
                  loading={documentsLoading}
                  getDocumentIcon={getDocumentIcon}
                  getConfidenceTag={getConfidenceTag}
                  handleDocumentClick={handleDocumentClick}
                  handleReExtract={handleReExtract}
                  handleDeleteDocument={handleDeleteDocument}
                  setUploadVisible={setUploadVisible}
                  setExtractionVisible={setExtractionVisible}
                  onRefresh={() => {
                    fetchPatientDocuments()
                  }}
                />
              )
            },
            {
              key: 'ai-summary',
              label: (
                <Space>
                  <UserOutlined />
                  AI病情综述
                </Space>
              ),
              children: (
                <AiSummaryTab
                  aiSummary={aiSummary}
                  summaryEditMode={summaryEditMode}
                  setSummaryEditMode={setSummaryEditMode}
                  summaryGenerating={summaryGenerating}
                  handleEditSummary={handleEditSummary}
                  handleSaveSummary={handleSaveSummary}
                  handleRegenerateSummary={handleRegenerateSummary}
                  handleViewSourceDocument={handleViewSourceDocument}
                  renderSummaryWithFootnotes={renderSummaryWithFootnotes}
                  summaryForm={summaryForm}
                />
              )
            },
            {
              key: 'timeline',
              label: (
                <Space>
                  <HistoryOutlined />
                  时间线
                </Space>
              ),
              children: <TimelineTab />
            }
          ]}
            />
          </div>
        </Card>

      {/* 编辑患者信息弹窗 */}
      <Modal
        title={
          <Space>
            <EditOutlined />
            <Text strong>编辑患者信息</Text>
            <Text type="secondary">- {patientInfo.name ? maskName(patientInfo.name) : '-'}</Text>
          </Space>
        }
        open={editModalVisible}
        onCancel={() => setEditModalVisible(false)}
        footer={[
          <Button key="cancel" onClick={() => setEditModalVisible(false)}>
            取消
          </Button>,
          <Button key="save" type="primary" icon={<SaveOutlined />} onClick={async () => {
            const success = await handleSavePatient(form, { sensitiveModified })
            if (success) {
              setEditModalVisible(false)
            }
          }}>
            保存更改
          </Button>
        ]}
        width={modalWidthPreset.wide}
        styles={modalBodyPreset}
        style={{ top: 20 }}
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            {/* 基本信息 */}
            <Col span={24}>
              <div style={{ marginBottom: 16, paddingBottom: 8, borderBottom: `1px solid ${token.colorBorder}` }}>
                <Text strong style={{ color: token.colorPrimary }}>基本信息</Text>
              </div>
            </Col>
            <Col span={12}>
              <Form.Item label="姓名" name="name" rules={[{ required: true, message: '请输入姓名' }]}>
                <Input placeholder="请输入患者姓名" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="性别" name="gender">
                <Select placeholder="请选择性别">
                  <Select.Option value="男">男</Select.Option>
                  <Select.Option value="女">女</Select.Option>
                  <Select.Option value="不详">不详</Select.Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="出生日期" name="birthDate">
                <DatePicker 
                  style={{ width: '100%' }} 
                  placeholder="选择出生日期"
                  format="YYYY-MM-DD"
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="年龄" name="age">
                <Input 
                  placeholder="请输入年龄" 
                  suffix="岁"
                  type="number"
                  min={0}
                  max={150}
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item
                label="联系电话"
                name="phone"
                rules={[
                  {
                    validator: (_, value) => {
                      if (!sensitiveModified.phone) return Promise.resolve()
                      if (value == null || String(value).trim() === '') return Promise.resolve()
                      if (!/^1[3-9]\d{9}$/.test(String(value).trim())) return Promise.reject(new Error('请输入正确的手机号码'))
                      return Promise.resolve()
                    }
                  }
                ]}
              >
                <Input
                  placeholder="请输入手机号码"
                  onFocus={() => {
                    form.setFieldValue('phone', '')
                    setSensitiveModified(prev => ({ ...prev, phone: true }))
                  }}
                  addonAfter={sensitiveModified.phone ? (
                    <a onClick={() => { form.setFieldValue('phone', maskPhone(patientInfo.phone)); setSensitiveModified(prev => ({ ...prev, phone: false })) }}>撤销</a>
                  ) : null}
                  title="脱敏字段：点击后清空并视为修改，可重新输入或点撤销恢复"
                />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item
                label="身份证号"
                name="idCard"
                rules={[
                  {
                    validator: (_, value) => {
                      if (!sensitiveModified.idCard) return Promise.resolve()
                      if (value == null || String(value).trim() === '') return Promise.resolve()
                      if (!/(^\d{15}$)|(^\d{18}$)|(^\d{17}(\d|X|x)$)/.test(String(value).trim())) return Promise.reject(new Error('请输入正确的身份证号'))
                      return Promise.resolve()
                    }
                  }
                ]}
              >
                <Input
                  placeholder="请输入身份证号码"
                  onFocus={() => {
                    form.setFieldValue('idCard', '')
                    setSensitiveModified(prev => ({ ...prev, idCard: true }))
                  }}
                  addonAfter={sensitiveModified.idCard ? (
                    <a onClick={() => { form.setFieldValue('idCard', maskIdCard(patientInfo.idCard)); setSensitiveModified(prev => ({ ...prev, idCard: false })) }}>撤销</a>
                  ) : null}
                  title="脱敏字段：点击后清空并视为修改，可重新输入或点撤销恢复"
                />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item label="住址" name="address">
                <Input
                  placeholder="请输入详细住址"
                  onFocus={() => {
                    form.setFieldValue('address', '')
                    setSensitiveModified(prev => ({ ...prev, address: true }))
                  }}
                  addonAfter={sensitiveModified.address ? (
                    <a onClick={() => { form.setFieldValue('address', maskAddress(patientInfo.address)); setSensitiveModified(prev => ({ ...prev, address: false })) }}>撤销</a>
                  ) : null}
                  title="脱敏字段：点击后清空并视为修改，可重新输入或点撤销恢复"
                />
              </Form.Item>
            </Col>

            {/* 医疗信息 */}
            <Col span={24}>
              <div style={{ margin: '16px 0', paddingBottom: 8, borderBottom: `1px solid ${token.colorBorder}` }}>
                <Text strong style={{ color: token.colorPrimary }}>医疗信息</Text>
              </div>
            </Col>
            <Col span={8}>
              <Form.Item label="科室" name="department">
                <Select placeholder="请选择科室" options={PATIENT_DEPARTMENT_OPTIONS} />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="主治医生" name="doctor">
                <Input placeholder="请输入主治医生姓名" />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="入组日期" name="admissionDate">
                <DatePicker 
                  style={{ width: '100%' }} 
                  placeholder="选择入组日期"
                  format="YYYY-MM-DD"
                />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item label="主要诊断" name="diagnosis">
                <Select
                  mode="tags"
                  placeholder="请输入诊断信息，支持添加多个"
                  style={{ width: '100%' }}
                  tokenSeparators={[',']}
                  options={[
                    { value: '肺腺癌', label: '肺腺癌' },
                    { value: '高血压', label: '高血压' },
                    { value: '糖尿病', label: '糖尿病' },
                    { value: '冠心病', label: '冠心病' },
                    { value: '脑梗塞', label: '脑梗塞' },
                    { value: '肝硬化', label: '肝硬化' },
                    { value: '肾功能不全', label: '肾功能不全' }
                  ]}
                />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item label="备注" name="notes">
                <TextArea 
                  rows={3} 
                  placeholder="请输入备注信息，如特殊情况、注意事项等..."
                  showCount
                  maxLength={500}
                />
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      {/* 数据导出弹窗 */}
      <Modal
        title="导出患者数据"
        open={exportModalVisible}
        onCancel={() => setExportModalVisible(false)}
        footer={[
          <Button key="cancel" onClick={() => setExportModalVisible(false)}>
            取消
          </Button>,
          <Button key="export" type="primary" icon={<DownloadOutlined />} onClick={handleConfirmExport}>
            开始导出
          </Button>
        ]}
      >
        <Form layout="vertical">
          <Form.Item label="导出格式">
            <Radio.Group defaultValue="excel">
              <Radio value="excel">Excel (.xlsx)</Radio>
              <Radio value="csv">CSV (.csv)</Radio>
              <Radio value="pdf">PDF报告</Radio>
            </Radio.Group>
          </Form.Item>
          
          <Form.Item label="导出内容">
            <Checkbox.Group defaultValue={['basic', 'documents', 'extracted']}>
              <Row>
                <Col span={24}><Checkbox value="basic">电子病历信息</Checkbox></Col>
                <Col span={24}><Checkbox value="documents">文档列表</Checkbox></Col>
                <Col span={24}><Checkbox value="extracted">抽取数据</Checkbox></Col>
                <Col span={24}><Checkbox value="timeline">操作时间线</Checkbox></Col>
              </Row>
            </Checkbox.Group>
          </Form.Item>

          <Alert
            message="数据导出说明"
            description="导出的数据将包含患者的所有相关信息，请确保符合数据使用规范。"
            type="info"
            showIcon
          />
        </Form>
      </Modal>



      {/* 上传文档弹窗 */}
      <Modal
        title="上传新文档"
        open={uploadVisible}
        onCancel={() => {
          setUploadVisible(false)
          setUploadFileList([])
          setUploadProgress({})
        }}
        maskClosable
        closable
        footer={[
          <Button 
            key="cancel" 
            onClick={() => {
              setUploadVisible(false)
              setUploadFileList([])
              setUploadProgress({})
            }}
          >
            取消
          </Button>,
          <Button 
            key="upload" 
            type="primary"
            loading={uploading}
            disabled={uploadFileList.length === 0}
            onClick={async () => {
              if (uploadFileList.length === 0) {
                message.warning('请先选择要上传的文件')
                return
              }
              
              setUploading(true)
              
              let queuedCount = 0
              let failCount = 0
              
              for (let i = 0; i < uploadFileList.length; i++) {
                const file = uploadFileList[i]
                const fileKey = file.uid || file.name
                
                try {
                  setUploadProgress(prev => ({
                    ...prev,
                    [fileKey]: { status: 'uploading', percent: 0, message: '正在上传...' }
                  }))
                  
                  const result = await uploadAndArchiveAsync(
                    file.originFileObj || file,
                    patientId,
                    { autoMergeEhr: true },
                    (percent) => {
                      setUploadProgress(prev => ({
                        ...prev,
                        [fileKey]: {
                          status: 'uploading',
                          percent: Math.min(percent * 0.3, 30), // 文件传输阶段占 0-30%
                          message: '正在上传文件…'
                        }
                      }))
                    }
                  )

                  const documentId = result?.data?.document_id || result?.data?.id
                  if (!documentId) {
                    throw new Error('未获取到文档 ID')
                  }

                  // 写入任务中心（用 document_id 作为 task_id）
                  upsertTask({
                    task_id: documentId,
                    patient_id: patientId,
                    document_id: documentId,
                    file_name: file.name,
                    type: 'upload_archive',
                    status: 'processing',
                    percentage: 30,
                    message: '上传完成，等待 OCR…',
                    created_at: new Date().toISOString()
                  })
                  loadTaskItems()

                  // 切换到 OCR 阶段提示
                  setUploadProgress(prev => ({
                    ...prev,
                    [fileKey]: { status: 'uploading', percent: 32, message: '等待 OCR…' }
                  }))

                  // 异步轮询后台 OCR/metadata 状态，不阻塞本次上传流程
                  pollUploadArchiveTask({
                    documentId,
                    fileName: file.name,
                    fileKey
                  })
                  queuedCount++
                } catch (error) {
                  console.error('上传失败:', error)
                  setUploadProgress(prev => ({
                    ...prev,
                    [fileKey]: { status: 'error', percent: 100, message: error.message || '上传失败' }
                  }))
                  failCount++
                }
              }
              
              setUploading(false)
              
              if (failCount === 0) {
                message.success(`已上传 ${queuedCount} 个文档，后台正在解析归档（可在任务中心查看）`)
                // 不再自动关闭弹窗，让用户在进度条里观察 OCR / 元数据各阶段
                // 用户可手动关闭，关闭后任务中心继续追踪
              } else {
                message.warning(`上传完成：成功 ${queuedCount} 个，失败 ${failCount} 个（成功项后台继续处理）`)
              }
            }}
          >
            {uploading ? '上传中...' : '开始上传'}
          </Button>
        ]}
        width={modalWidthPreset.standard}
        styles={modalBodyPreset}
      >
        <Alert
          message="上传说明"
          description="文档上传后将自动进行OCR解析、AI抽取病历数据，并归档到当前患者名下。"
          type="info"
          showIcon
          style={{ marginBottom: 16 }}
        />
        
        <Upload.Dragger
          multiple
          fileList={uploadFileList}
          beforeUpload={(file) => {
            // 验证文件类型
            const allowedTypes = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg']
            const fileExt = file.name.split('.').pop()?.toLowerCase()
            const allowedExts = ['pdf', 'jpg', 'jpeg', 'png']
            
            if (!allowedTypes.includes(file.type) && !allowedExts.includes(fileExt)) {
              message.error(`不支持的文件类型: ${file.name}`)
              return Upload.LIST_IGNORE
            }
            
            // 验证文件大小（50MB）
            if (file.size > 50 * 1024 * 1024) {
              message.error(`文件过大: ${file.name}，最大支持50MB`)
              return Upload.LIST_IGNORE
            }
            
            return false // 阻止自动上传
          }}
          onChange={({ fileList }) => {
            setUploadFileList(fileList)
          }}
          onRemove={(file) => {
            if (uploading) return false
            const fileKey = file.uid || file.name
            setUploadProgress(prev => {
              const newProgress = { ...prev }
              delete newProgress[fileKey]
              return newProgress
            })
            return true
          }}
          disabled={uploading}
          showUploadList={{
            showRemoveIcon: !uploading
          }}
          accept=".pdf,.jpg,.jpeg,.png"
        >
          <p className="ant-upload-drag-icon">
            <UploadOutlined />
          </p>
          <p className="ant-upload-text">点击或拖拽文件到此处上传</p>
          <p className="ant-upload-hint">
            支持 PDF、JPG、PNG 格式，单个文件最大 50MB
          </p>
        </Upload.Dragger>
        
        {/* 上传进度显示 */}
        {Object.keys(uploadProgress).length > 0 && (
          <div style={{ marginTop: 16 }}>
            <Divider>上传进度</Divider>
            {uploadFileList.map(file => {
              const fileKey = file.uid || file.name
              const progress = uploadProgress[fileKey]
              if (!progress) return null
              
              return (
                <div key={fileKey} style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                    <Text ellipsis style={{ maxWidth: 300 }}>{file.name}</Text>
                    <Text type={progress.status === 'success' ? 'success' : progress.status === 'error' ? 'danger' : 'secondary'}>
                      {progress.message}
                    </Text>
                  </div>
                  <Progress 
                    percent={progress.percent} 
                    status={progress.status === 'error' ? 'exception' : progress.status === 'success' ? 'success' : 'active'}
                    size="small"
                  />
                </div>
              )
            })}
          </div>
        )}
      </Modal>

      {/* 批量抽取弹窗 */}
      <Modal
        title="批量数据抽取"
        open={extractionVisible}
        onCancel={() => setExtractionVisible(false)}
        footer={[
          <Button key="cancel" onClick={() => setExtractionVisible(false)}>
            取消
          </Button>,
          <Button key="extract" type="primary">
            开始抽取
          </Button>
        ]}
        width={modalWidthPreset.standard}
        styles={modalBodyPreset}
      >
        <div>
          <Text>选择要抽取的文档：</Text>
          <div style={{ margin: '16px 0' }}>
            <List
              size="small"
              dataSource={documents.filter(d => d.status === 'pending')}
              renderItem={item => (
                <List.Item>
                  <List.Item.Meta
                    avatar={getDocumentIcon(item.type)}
                    title={item.name}
                    description={item.category}
                  />
                  <Checkbox defaultChecked>选择</Checkbox>
                </List.Item>
              )}
            />
          </div>
          {documents.filter(d => d.status === 'pending').length === 0 && (
            <div style={{ textAlign: 'center', padding: 20 }}>
              <Text type="secondary">暂无待处理的文档</Text>
            </div>
          )}
        </div>
      </Modal>

       {/* AI智能助手可拖动悬浮窗 */}
       <Modal
         title={
           <div 
             style={{ 
               cursor: isDragging ? 'grabbing' : 'grab',
               userSelect: 'none',
               padding: '4px 0'
             }}
             onMouseDown={(e) => {
               e.preventDefault()
               setIsDragging(true)
               
               const startX = e.clientX
               const startY = e.clientY
               const startPosX = aiModalPosition.x
               const startPosY = aiModalPosition.y

               const handleMouseMove = (moveEvent) => {
                 const deltaX = moveEvent.clientX - startX
                 const deltaY = moveEvent.clientY - startY
                 
                 const newX = startPosX + deltaX
                 const newY = startPosY + deltaY
                 
                 // 限制在视窗范围内
                 const maxX = window.innerWidth - 450 // modal width
                 const maxY = window.innerHeight - 400 // approximate modal height
                 
                 const boundedX = Math.max(0, Math.min(newX, maxX))
                 const boundedY = Math.max(0, Math.min(newY, maxY))
                 
                 setAiModalPosition({ x: boundedX, y: boundedY })
               }

               const handleMouseUp = () => {
                 setIsDragging(false)
                 document.removeEventListener('mousemove', handleMouseMove)
                 document.removeEventListener('mouseup', handleMouseUp)
               }

               document.addEventListener('mousemove', handleMouseMove)
               document.addEventListener('mouseup', handleMouseUp)
             }}
           >
             <Space>
               <RobotOutlined style={{ color: token.colorPrimary }} />
               <Text strong>AI智能助手</Text>
               <Tag size="small">基于患者: {patientInfo.name ? maskName(patientInfo.name) : '-'}</Tag>
             </Space>
           </div>
         }
         open={aiAssistantVisible}
         onCancel={() => setAiAssistantVisible(false)}
         footer={null}
         width={modalWidthPreset.narrow}
         styles={modalBodyPreset}
         style={{ 
           position: 'fixed',
           top: aiModalPosition.y,
           left: aiModalPosition.x,
           margin: 0,
           paddingBottom: 0
         }}
         mask={false}
         getContainer={false}
       >
         {/* 聊天历史 */}
        <div style={{ height: 300, overflowY: 'auto', marginBottom: 16, border: `1px solid ${token.colorBorder}`, borderRadius: 4, padding: 12 }}>
           {aiMessages.map((message, index) => (
             <div key={index} style={{ marginBottom: 12 }}>
               <div style={{
                 display: 'flex',
                 justifyContent: message.type === 'user' ? 'flex-end' : 'flex-start'
               }}>
                 <div style={{
                   maxWidth: '80%',
                   padding: '8px 12px',
                   borderRadius: 8,
                   background: message.type === 'user' ? token.colorPrimary : token.colorBgLayout,
                  color: message.type === 'user' ? 'rgb(255, 255, 255)' : token.colorText
                 }}>
                   <div style={{ fontSize: 12 }}>
                     {message.type === 'user' ? '💬 您' : '🤖 AI'}
                   </div>
                  <div style={{ fontSize: 14, marginTop: 4 }}>
                     {message.content}
                   </div>
                   <div style={{ 
                    fontSize: 12, 
                     marginTop: 4, 
                     opacity: 0.7,
                     textAlign: 'right'
                   }}>
                     {message.timestamp}
                   </div>
                 </div>
               </div>
             </div>
           ))}
         </div>

         {/* 输入区域 */}
         <div>
           <Input.Group compact>
             <Input
               value={aiInput}
               onChange={(e) => setAiInput(e.target.value)}
               placeholder="输入患者相关问题..."
               onPressEnter={handleSendAiMessage}
               style={{ width: 'calc(100% - 80px)' }}
             />
             <Button 
               type="primary" 
               icon={<SendOutlined />}
               onClick={handleSendAiMessage}
               style={{ width: 60 }}
             />
             <Button 
               icon={<ClearOutlined />}
               onClick={() => setAiMessages([aiMessages[0]])}
               style={{ width: 20 }}
             />
           </Input.Group>
           
           <div style={{ marginTop: 12 }}>
            <Text type="secondary" style={{ fontSize: 12 }}>💡 快速提问:</Text>
             <div style={{ marginTop: 4 }}>
               <Space size="small" wrap>
                 <Button 
                   type="link" 
                   size="small" 
                  style={{ padding: '2px 6px', height: 'auto', fontSize: 12 }}
                   onClick={() => setAiInput('患者最近的血常规结果如何？')}
                 >
                   血常规结果
                 </Button>
                 <Button 
                   type="link" 
                   size="small" 
                  style={{ padding: '2px 6px', height: 'auto', fontSize: 12 }}
                   onClick={() => setAiInput('患者的用药情况怎么样？')}
                 >
                   用药情况
                 </Button>
                 <Button 
                   type="link" 
                   size="small" 
                  style={{ padding: '2px 6px', height: 'auto', fontSize: 12 }}
                   onClick={() => setAiInput('有哪些异常指标需要关注？')}
                 >
                   异常指标
                 </Button>
                 <Button 
                   type="link" 
                   size="small" 
                  style={{ padding: '2px 6px', height: 'auto', fontSize: 12 }}
                   onClick={() => setAiInput('数据完整性检查')}
                 >
                   数据完整性
                 </Button>
               </Space>
             </div>
           </div>
         </div>
       </Modal>

       {/* 冲突解决弹窗 */}
       <Modal
        title={`字段冲突解决${conflicts.length ? `（${conflicts.length}）` : ''}`}
         open={conflictResolveVisible}
         onCancel={() => setConflictResolveVisible(false)}
        footer={null}
         width={modalWidthPreset.wide}
         styles={modalBodyPreset}
       >
        {conflictsLoading ? (
          <div style={{ textAlign: 'center', padding: 24 }}><Spin /></div>
        ) : conflicts.length > 0 ? (
           <div>
             <Alert
               message={`发现 ${conflicts.length} 个字段冲突`}
               description="请逐一解决字段冲突，确保数据准确性"
               type="warning"
               showIcon
               style={{ marginBottom: 16 }}
             />

             <List
               dataSource={conflicts}
               renderItem={conflict => (
                 <List.Item style={{ padding: '16px 0' }}>
                   <div style={{ width: '100%' }}>
                     <Row gutter={24}>
                       <Col span={10}>
                       <Card size="small" title="现有值" style={{ backgroundColor: token.colorWarningBg }}>
                           <div style={{ marginBottom: 8 }}>
                            <Text strong style={{ fontSize: 16 }}>{conflict.old_value || '—'}</Text>
                           </div>
                           <Descriptions size="small" column={1}>
                            <Descriptions.Item label="来源">{conflict.old_source?.document_name || '未知'}</Descriptions.Item>
                            <Descriptions.Item label="录入时间">{conflict.old_source?.recorded_at ? new Date(conflict.old_source.recorded_at).toLocaleString('zh-CN') : '—'}</Descriptions.Item>
                            <Descriptions.Item label="录入人">{conflict.old_source?.recorded_by || '未知'}</Descriptions.Item>
                           </Descriptions>
                         </Card>
                       </Col>
                       <Col span={10}>
                        <Card size="small" title="新值" style={{ backgroundColor: token.colorSuccessBg }}>
                           <div style={{ marginBottom: 8 }}>
                            <Text strong style={{ fontSize: 16 }}>{conflict.new_value || '—'}</Text>
                           </div>
                           <Descriptions size="small" column={1}>
                            <Descriptions.Item label="来源">{conflict.new_source?.document_name || '未知'}</Descriptions.Item>
                            <Descriptions.Item label="AI置信度">{conflict.new_source?.confidence || '—'}</Descriptions.Item>
                            <Descriptions.Item label="冲突类型">{conflict.conflict_type === 'date_diff' ? '日期差异' : conflict.conflict_type === 'numeric_diff' ? '数值差异' : '值不一致'}</Descriptions.Item>
                           </Descriptions>
                         </Card>
                       </Col>
                       <Col span={4}>
                         <div style={{ textAlign: 'center' }}>
                          <Text strong>字段: {conflict.field_path}</Text>
                           <div style={{ marginTop: 8 }}>
                             <Button 
                               type="primary" 
                               size="small"
                              loading={conflictResolvingId === conflict.id}
                              onClick={() => handleResolveConflict(conflict.id, 'adopt')}
                             >
                               采用新值
                             </Button>
                           </div>
                           <div style={{ marginTop: 4 }}>
                             <Button 
                               size="small"
                              loading={conflictResolvingId === conflict.id}
                              onClick={() => handleResolveConflict(conflict.id, 'keep')}
                             >
                               保留现有值
                             </Button>
                           </div>
                         </div>
                       </Col>
                     </Row>
                   </div>
                 </List.Item>
               )}
             />
           </div>
        ) : (
          <Empty description="暂无冲突" />
        )}
       </Modal>

       {/* 变更日志弹窗 */}
       <Modal
         title="患者数据变更日志"
         open={changeLogVisible}
         onCancel={() => setChangeLogVisible(false)}
         footer={[
           <Button key="close" onClick={() => setChangeLogVisible(false)}>
             关闭
           </Button>,
           <Button key="export" icon={<DownloadOutlined />}>
             导出日志
           </Button>,
           <Button key="batch" type="primary">
             批量确认
           </Button>
         ]}
         width={modalWidthPreset.wide}
         styles={modalBodyPreset}
       >
         <div style={{ marginBottom: 16 }}>
           <Space>
             <Select placeholder="变更类型" style={{ width: 120 }} allowClear>
               <Select.Option value="field">字段变更</Select.Option>
               <Select.Option value="document">文档操作</Select.Option>
               <Select.Option value="conflict">冲突解决</Select.Option>
             </Select>
             <Select placeholder="时间范围" style={{ width: 120 }} allowClear>
               <Select.Option value="today">今天</Select.Option>
               <Select.Option value="week">最近7天</Select.Option>
               <Select.Option value="month">最近30天</Select.Option>
             </Select>
             <Select placeholder="操作来源" style={{ width: 120 }} allowClear>
               <Select.Option value="ai">AI抽取</Select.Option>
               <Select.Option value="manual">手动编辑</Select.Option>
               <Select.Option value="conflict">冲突解决</Select.Option>
             </Select>
           </Space>
         </div>

         <Table
           dataSource={changeLogs}
           columns={[
             {
               title: '时间',
               dataIndex: 'timestamp',
               key: 'timestamp',
               width: 140,
               render: (time) => (
                 <Text style={{ fontSize: 12 }}>{time}</Text>
               )
             },
             {
               title: '字段',
               dataIndex: 'field',
               key: 'field',
               width: 100
             },
             {
               title: '来源',
               dataIndex: 'source',
               key: 'source',
               width: 80
             },
             {
               title: '操作人',
               dataIndex: 'operator',
               key: 'operator',
               width: 80
             },
             {
               title: '变更内容',
               dataIndex: 'changeContent',
               key: 'changeContent',
               width: 150
             },
             {
               title: '状态',
               dataIndex: 'status',
               key: 'status',
               width: 80,
               render: (status) => (
                 <Tag color={status === 'confirmed' ? 'green' : 'orange'}>
                   {status === 'confirmed' ? '已确认' : '待确认'}
                 </Tag>
               )
             },
             {
               title: '操作',
               key: 'action',
               width: 120,
               render: (_, record) => (
                 <Space size="small">
                   {record.status === 'pending' && (
                     <Button 
                       type="link" 
                       size="small"
                       onClick={() => handleConfirmChange(record.id)}
                     >
                       确认
                     </Button>
                   )}
                   <Button 
                     type="link" 
                     size="small"
                     onClick={() => handleRevertChange(record.id)}
                   >
                     撤销
                   </Button>
                   {record.document && (
                     <Button type="link" size="small">
                       查看文档
                     </Button>
                   )}
                 </Space>
               )
             }
           ]}
           pagination={false}
           size="small"
         />
       </Modal>

      {/* 任务中心 Drawer */}
      <Drawer
        title="任务中心（本患者）"
        open={taskCenterVisible}
        onClose={() => setTaskCenterVisible(false)}
        width={modalWidthPreset.standard}
        styles={modalBodyPreset}
      >
        {taskItems.length === 0 ? (
          <Empty description="暂无任务" />
        ) : (
          <List
            dataSource={taskItems}
            renderItem={(t) => {
              const isDone = ['completed', 'completed_with_errors', 'failed', 'cancelled'].includes(t.status)
              const pct = typeof t.percentage === 'number' ? t.percentage : 0
              return (
                <List.Item
                  actions={[
                    isDone ? (
                      <Button
                        key="remove"
                        size="small"
                        onClick={() => {
                          removeTask(t.task_id)
                          loadTaskItems()
                        }}
                      >
                        移除
                      </Button>
                    ) : null
                  ].filter(Boolean)}
                >
                  <List.Item.Meta
                    title={
                      <Space>
                        <Text strong>
                          {t.type === 'upload_archive'
                            ? '上传归档'
                            : t.type === 'field_extract' || t.type === 'patient_extract'
                              ? '批量抽取'
                              : '任务'}
                        </Text>
                        <Tag color={t.status === 'failed' ? 'red' : t.status === 'completed' ? 'green' : 'blue'}>
                          {t.status || 'pending'}
                        </Tag>
                      </Space>
                    }
                    description={
                      <div style={{ width: '100%' }}>
                        {t.file_name && <div style={{ fontSize: 12, color: token.colorTextSecondary }}>文件：{t.file_name}</div>}
                        {t.field_path && <div style={{ fontSize: 12, color: token.colorTextSecondary }}>字段：{t.field_path}</div>}
                        <div style={{ fontSize: 12, color: token.colorTextTertiary }}>{t.message || '处理中...'}</div>
                        <div style={{ marginTop: 8 }}>
                          <Progress percent={Math.max(0, Math.min(100, pct))} size="small" status={t.status === 'failed' ? 'exception' : isDone ? 'success' : 'active'} />
                        </div>
                      </div>
                    }
                  />
                </List.Item>
              )
            }}
          />
        )}
        {taskPolling && <div style={{ marginTop: 12, color: token.colorTextTertiary }}>正在刷新任务状态...</div>}
      </Drawer>
     </div>
   )
 }
 
 export default PatientDetail