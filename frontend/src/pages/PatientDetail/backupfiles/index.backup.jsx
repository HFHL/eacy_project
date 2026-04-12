import React, { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import dayjs from 'dayjs'
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
  Statistic
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
  ExperimentOutlined,
  HistoryOutlined,
  PlusOutlined,
  MinusOutlined,
  FolderOutlined,
  FolderOpenOutlined
} from '@ant-design/icons'

// 导入外置的配置数据
import { ehrFieldsData } from './data/ehrFieldsConfig'
import {
  mockAiSummary,
  mockPatientInfo,
  mockEhrFieldGroups,
  mockEhrDocuments,
  mockDocuments,
  mockConflicts,
  mockChangeLogs,
  mockAiMessages
} from './data/mockData'
import {
  CONFIDENCE_CONFIG,
  DEFAULT_LAYOUT,
  DEFAULT_EXPANDED_GROUPS
} from './data/constants'

const { Title, Text } = Typography
const { Search } = Input
const { TextArea } = Input

const PatientDetail = () => {
  const { patientId } = useParams()
  const navigate = useNavigate()
  const [selectedDocument, setSelectedDocument] = useState(null)
  const [uploadVisible, setUploadVisible] = useState(false)
  const [extractionVisible, setExtractionVisible] = useState(false)
  const [editModalVisible, setEditModalVisible] = useState(false)
  const [exportModalVisible, setExportModalVisible] = useState(false)
  const [dataExtractionVisible, setDataExtractionVisible] = useState(false)
  const [qualityCheckVisible, setQualityCheckVisible] = useState(false)
  const [editingField, setEditingField] = useState(null)
  const [aiAssistantVisible, setAiAssistantVisible] = useState(false)
  const [conflictResolveVisible, setConflictResolveVisible] = useState(false)
  const [changeLogVisible, setChangeLogVisible] = useState(false)
  const [selectedConflict, setSelectedConflict] = useState(null)
  const [aiMessages, setAiMessages] = useState(mockAiMessages)
  const [aiInput, setAiInput] = useState('')
  const [summaryEditMode, setSummaryEditMode] = useState(false)
  const [summaryContent, setSummaryContent] = useState('')
  const [summaryGenerating, setSummaryGenerating] = useState(false)
  
  // 电子病历夹三栏布局相关状态
  const [ehrLeftWidth, setEhrLeftWidth] = useState(DEFAULT_LAYOUT.EHR_LEFT_WIDTH)
  const [ehrRightWidth, setEhrRightWidth] = useState(DEFAULT_LAYOUT.EHR_RIGHT_WIDTH)
  const [selectedEhrGroup, setSelectedEhrGroup] = useState('basicInfo')
  const [selectedEhrDocument, setSelectedEhrDocument] = useState(null)
  const [expandedGroups, setExpandedGroups] = useState(DEFAULT_EXPANDED_GROUPS)
  // 字段编辑状态管理
  const [editingEhrField, setEditingEhrField] = useState(null) // 当前正在编辑的字段
  const [editingEhrValue, setEditingEhrValue] = useState('') // 编辑中的值
  
  const [form] = Form.useForm()
  const [conflictForm] = Form.useForm()
  const [summaryForm] = Form.useForm()

  // 模拟AI病情综述数据
  const [aiSummary, setAiSummary] = useState(mockAiSummary)

  // 模拟患者基本信息
  const [patientInfo, setPatientInfo] = useState(mockPatientInfo)

  // 电子病历夹字段组数据结构（基于真实CSV配置）
  const ehrFieldGroups = mockEhrFieldGroups

  // 电子病历夹字段详细数据（基于CSV配置）
  // 字段渲染类型说明：
  // - fields: 普通字段，一个字段名对应一个值
  // - table_fields: 表格字段，需要渲染为嵌套表格，显示多组数据
  // repeatable说明：
  // - false: 不可重复的字段组（单一实例）
  // - true: 可重复的字段组（可以有多个记录实例）
  // ehrFieldsData 已从外部文件导入


    // 基本信息 - 紧急联系人（不可重复）
    emergencyContact: {
      name: '紧急联系人',
      repeatable: false,
      fields: [
        { id: 'CORE014', name: '紧急联系人姓名', value: '李四', confidence: 'medium', source: 'ehr_doc1', editable: true, fieldType: 'fields', uiType: 'text', sensitive: true },
        { id: 'CORE015', name: '紧急联系人电话', value: '139****1234', confidence: 'medium', source: 'ehr_doc1', editable: true, fieldType: 'fields', uiType: 'text', sensitive: true },
        { id: 'CORE016', name: '紧急联系人关系', value: '配偶', confidence: 'medium', source: 'ehr_doc1', editable: true, fieldType: 'fields', uiType: 'select', sensitive: true }
      ]
    },
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
    },
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
    },
    // 检查检验 - 病理报告（可重复）
    pathology: {
      name: '病理报告',
      repeatable: true,
      records: [
        {
          id: 'pathology_1',
          fields: [
            { id: 'CORE089', name: '报告类型', value: '病理', confidence: 'high', source: 'ehr_doc3', editable: true, fieldType: 'fields', uiType: 'select' },
            { id: 'CORE090', name: '标本部位', value: '右肺下叶', confidence: 'high', source: 'ehr_doc3', editable: true, fieldType: 'fields', uiType: 'text' },
            { id: 'CORE091', name: '标本类型', value: '石蜡切片', confidence: 'high', source: 'ehr_doc3', editable: true, fieldType: 'fields', uiType: 'select' },
            { id: 'CORE092', name: '病理诊断', value: '低分化腺癌', confidence: 'high', source: 'ehr_doc3', editable: true, fieldType: 'fields', uiType: 'textarea' },
            { id: 'CORE093', name: '附加描述', value: '可见腺体浸润，部分神经侵犯', confidence: 'medium', source: 'ehr_doc3', editable: true, fieldType: 'fields', uiType: 'textarea' },
            { id: 'CORE094', name: '报告编号', value: '2024-PL001238', confidence: 'high', source: 'ehr_doc3', editable: true, fieldType: 'fields', uiType: 'text' },
            { id: 'CORE095', name: '报告医生', value: '王医师', confidence: 'high', source: 'ehr_doc3', editable: true, fieldType: 'fields', uiType: 'text', sensitive: true },
            { id: 'CORE096', name: '送检日期', value: '2024-01-10', confidence: 'high', source: 'ehr_doc3', editable: true, fieldType: 'fields', uiType: 'datepicker' },
            { id: 'CORE097', name: '报告日期', value: '2024-01-12', confidence: 'high', source: 'ehr_doc3', editable: true, fieldType: 'fields', uiType: 'datepicker' }
          ]
        },
        {
          id: 'pathology_2',
          fields: [
            { id: 'CORE089_2', name: '报告类型', value: '免疫组化', confidence: 'high', source: 'ehr_doc4', editable: true, fieldType: 'fields', uiType: 'select' },
            { id: 'CORE090_2', name: '标本部位', value: '右肺下叶', confidence: 'high', source: 'ehr_doc4', editable: true, fieldType: 'fields', uiType: 'text' },
            { id: 'CORE091_2', name: '标本类型', value: '石蜡切片', confidence: 'high', source: 'ehr_doc4', editable: true, fieldType: 'fields', uiType: 'select' },
            { id: 'CORE092_2', name: '病理诊断', value: 'TTF-1(+), CK7(+), CK20(-)', confidence: 'high', source: 'ehr_doc4', editable: true, fieldType: 'fields', uiType: 'textarea' },
            { id: 'CORE093_2', name: '附加描述', value: '符合肺腺癌免疫组化表型', confidence: 'high', source: 'ehr_doc4', editable: true, fieldType: 'fields', uiType: 'textarea' },
            { id: 'CORE094_2', name: '报告编号', value: '2024-IHC001239', confidence: 'high', source: 'ehr_doc4', editable: true, fieldType: 'fields', uiType: 'text' },
            { id: 'CORE095_2', name: '报告医生', value: '李医师', confidence: 'high', source: 'ehr_doc4', editable: true, fieldType: 'fields', uiType: 'text', sensitive: true },
            { id: 'CORE096_2', name: '送检日期', value: '2024-01-10', confidence: 'high', source: 'ehr_doc4', editable: true, fieldType: 'fields', uiType: 'datepicker' },
            { id: 'CORE097_2', name: '报告日期', value: '2024-01-13', confidence: 'high', source: 'ehr_doc4', editable: true, fieldType: 'fields', uiType: 'datepicker' }
          ]
        }
      ]
    },
    // 检查检验 - 实验室检查（可重复）
    laboratory: {
      name: '实验室检查',
      repeatable: true,
      records: [
        {
          id: 'laboratory_1',
          fields: [
            // fields类型字段（普通字段）
            { id: 'CORE131', name: '检查机构', value: '中山大学附属第三医院检验科', confidence: 'high', source: 'ehr_doc2', editable: true, fieldType: 'fields', uiType: 'text' },
            { id: 'CORE132', name: '报告编号', value: 'LAB2024-001567', confidence: 'high', source: 'ehr_doc2', editable: true, fieldType: 'fields', uiType: 'text' },
            { id: 'CORE133', name: '检查日期', value: '2024-01-15', confidence: 'high', source: 'ehr_doc2', editable: true, fieldType: 'fields', uiType: 'date' },
            { id: 'CORE134', name: '报告日期', value: '2024-01-15', confidence: 'high', source: 'ehr_doc2', editable: true, fieldType: 'fields', uiType: 'date' },
            { id: 'CORE135', name: '标本类型', value: '血液', confidence: 'high', source: 'ehr_doc2', editable: true, fieldType: 'fields', uiType: 'select' },
            { id: 'CORE136', name: '项目组名称', value: '血常规+生化全套', confidence: 'high', source: 'ehr_doc2', editable: true, fieldType: 'fields', uiType: 'text' },
            { id: 'CORE137', name: '报告医生', value: '张医师', confidence: 'medium', source: 'ehr_doc2', editable: true, fieldType: 'fields', uiType: 'text', sensitive: true },
            
            // table_fields类型字段（表格字段）
            { 
              id: 'CORE138_TABLE', 
              name: '检验指标', 
              fieldType: 'table_fields', 
              confidence: 'high', 
              source: 'ehr_doc2', 
              editable: true,
              tableData: [
                {
                  id: 'lab_item_1',
                  '指标名称（中文）': '甲胎蛋白',
                  '英文简称': 'AFP',
                  '检测值': '3.2',
                  '单位': 'ng/mL',
                  '参考范围': '0-10',
                  '是否异常': false,
                  '异常标志': ''
                },
                {
                  id: 'lab_item_2',
                  '指标名称（中文）': '癌胚抗原',
                  '英文简称': 'CEA',
                  '检测值': '15.8',
                  '单位': 'ng/mL',
                  '参考范围': '0-5',
                  '是否异常': true,
                  '异常标志': '↑'
                },
                {
                  id: 'lab_item_3',
                  '指标名称（中文）': '白细胞计数',
                  '英文简称': 'WBC',
                  '检测值': '6.5',
                  '单位': '×10⁹/L',
                  '参考范围': '3.5-9.5',
                  '是否异常': false,
                  '异常标志': ''
                }
              ]
            }
          ]
        },
        {
          id: 'laboratory_2',
          fields: [
            // fields类型字段（普通字段）
            { id: 'CORE131_2', name: '检查机构', value: '中山大学附属第三医院检验科', confidence: 'high', source: 'ehr_doc5', editable: true, fieldType: 'fields', uiType: 'text' },
            { id: 'CORE132_2', name: '报告编号', value: 'LAB2024-001789', confidence: 'high', source: 'ehr_doc5', editable: true, fieldType: 'fields', uiType: 'text' },
            { id: 'CORE133_2', name: '检查日期', value: '2024-02-01', confidence: 'high', source: 'ehr_doc5', editable: true, fieldType: 'fields', uiType: 'date' },
            { id: 'CORE134_2', name: '报告日期', value: '2024-02-01', confidence: 'high', source: 'ehr_doc5', editable: true, fieldType: 'fields', uiType: 'date' },
            { id: 'CORE135_2', name: '标本类型', value: '血液', confidence: 'high', source: 'ehr_doc5', editable: true, fieldType: 'fields', uiType: 'select' },
            { id: 'CORE136_2', name: '项目组名称', value: '肿瘤标志物检测', confidence: 'high', source: 'ehr_doc5', editable: true, fieldType: 'fields', uiType: 'text' },
            { id: 'CORE137_2', name: '报告医生', value: '李医师', confidence: 'medium', source: 'ehr_doc5', editable: true, fieldType: 'fields', uiType: 'text', sensitive: true },
            
            // table_fields类型字段（表格字段）
            { 
              id: 'CORE138_TABLE_2', 
              name: '检验指标', 
              fieldType: 'table_fields', 
              confidence: 'high', 
              source: 'ehr_doc5', 
              editable: true,
              tableData: [
                {
                  id: 'lab_item_4',
                  '指标名称（中文）': 'CA199',
                  '英文简称': 'CA199',
                  '检测值': '45.2',
                  '单位': 'U/mL',
                  '参考范围': '0-37',
                  '是否异常': true,
                  '异常标志': '↑'
                },
                {
                  id: 'lab_item_5',
                  '指标名称（中文）': 'CA125',
                  '英文简称': 'CA125',
                  '检测值': '28.5',
                  '单位': 'U/mL',
                  '参考范围': '0-35',
                  '是否异常': false,
                  '异常标志': ''
                }
              ]
            }
          ]
        }
      ]
    },
    // 检查检验 - 影像检查（可重复）
    imaging: {
      name: '影像检查',
      repeatable: true,
      records: [
        {
          id: 'imaging_1',
          fields: [
            { id: 'CORE118', name: '检查机构', value: '中山大学附属第三医院影像科', confidence: 'high', source: 'ehr_doc3', editable: true, fieldType: 'fields', uiType: 'text' },
            { id: 'CORE119', name: '检查日期', value: '2024-01-12', confidence: 'high', source: 'ehr_doc3', editable: true, fieldType: 'fields', uiType: 'datepicker' },
            { id: 'CORE120', name: '报告日期', value: '2024-01-12', confidence: 'high', source: 'ehr_doc3', editable: true, fieldType: 'fields', uiType: 'datepicker' },
            { id: 'CORE121', name: '检查项目名称', value: '胸部增强CT', confidence: 'high', source: 'ehr_doc3', editable: true, fieldType: 'fields', uiType: 'text' },
            { id: 'CORE122', name: '检查方式', value: 'CT', confidence: 'high', source: 'ehr_doc3', editable: true, fieldType: 'fields', uiType: 'select' },
            { id: 'CORE123', name: '检查部位', value: '胸部', confidence: 'high', source: 'ehr_doc3', editable: true, fieldType: 'fields', uiType: 'select' },
            { id: 'CORE125', name: '所见描述', value: '左肺下叶结节，大小约2.5cm', confidence: 'high', source: 'ehr_doc3', editable: true, fieldType: 'fields', uiType: 'textarea' },
            { id: 'CORE126', name: '诊断印象/结论', value: '左肺下叶占位性病变，考虑恶性', confidence: 'high', source: 'ehr_doc3', editable: true, fieldType: 'fields', uiType: 'textarea' }
          ]
        },
        {
          id: 'imaging_2',
          fields: [
            { id: 'CORE118_2', name: '检查机构', value: '中山大学附属第三医院影像科', confidence: 'high', source: 'ehr_doc6', editable: true, fieldType: 'fields', uiType: 'text' },
            { id: 'CORE119_2', name: '检查日期', value: '2024-02-15', confidence: 'high', source: 'ehr_doc6', editable: true, fieldType: 'fields', uiType: 'datepicker' },
            { id: 'CORE120_2', name: '报告日期', value: '2024-02-15', confidence: 'high', source: 'ehr_doc6', editable: true, fieldType: 'fields', uiType: 'datepicker' },
            { id: 'CORE121_2', name: '检查项目名称', value: 'PET-CT全身显像', confidence: 'high', source: 'ehr_doc6', editable: true, fieldType: 'fields', uiType: 'text' },
            { id: 'CORE122_2', name: '检查方式', value: 'PET-CT', confidence: 'high', source: 'ehr_doc6', editable: true, fieldType: 'fields', uiType: 'select' },
            { id: 'CORE123_2', name: '检查部位', value: '全身', confidence: 'high', source: 'ehr_doc6', editable: true, fieldType: 'fields', uiType: 'select' },
            { id: 'CORE125_2', name: '所见描述', value: '左肺下叶结节FDG摄取增高，SUVmax=8.5，纵隔淋巴结肿大', confidence: 'high', source: 'ehr_doc6', editable: true, fieldType: 'fields', uiType: 'textarea' },
            { id: 'CORE126_2', name: '诊断印象/结论', value: '左肺下叶恶性肿瘤，纵隔淋巴结转移', confidence: 'high', source: 'ehr_doc6', editable: true, fieldType: 'fields', uiType: 'textarea' }
          ]
        }
      ]
    },
    
    // 检查检验 - 基因检测（可重复）
    genetics: {
      name: '基因检测',
      repeatable: true,
      records: [
        {
          id: 'genetics_1',
          fields: [
            // fields类型字段（普通字段）
            { id: 'CORE099', name: '检测类型', value: 'NGS', confidence: 'high', source: 'ehr_doc5', editable: true, fieldType: 'fields', uiType: 'select' },
            { id: 'CORE100', name: '标本类型', value: '组织切片', confidence: 'high', source: 'ehr_doc5', editable: true, fieldType: 'fields', uiType: 'select' },
            { id: 'CORE101', name: '检测项目名称', value: '肿瘤靶向药物基因检测', confidence: 'high', source: 'ehr_doc5', editable: true, fieldType: 'fields', uiType: 'text' },
            { id: 'CORE113', name: '报告编号', value: 'NGS2024-001234', confidence: 'high', source: 'ehr_doc5', editable: true, fieldType: 'fields', uiType: 'text' },
            { id: 'CORE114', name: '医疗机构', value: '华大基因', confidence: 'high', source: 'ehr_doc5', editable: true, fieldType: 'fields', uiType: 'text' },
            { id: 'CORE116', name: '送检日期', value: '2024-01-10', confidence: 'high', source: 'ehr_doc5', editable: true, fieldType: 'fields', uiType: 'datepicker' },
            { id: 'CORE117', name: '报告日期', value: '2024-01-14', confidence: 'high', source: 'ehr_doc5', editable: true, fieldType: 'fields', uiType: 'datepicker' },
            
            // table_fields类型字段（表格字段）
            { 
              id: 'CORE102_TABLE', 
              name: '突变结果', 
              fieldType: 'table_fields', 
              confidence: 'high', 
              source: 'ehr_doc5', 
              editable: true,
              tableData: [
                {
                  id: 'mutation_1',
                  '基因名称': 'EGFR',
                  '突变位点': 'L858R',
                  '突变效应类型': '敏感突变',
                  '突变频率': '35%',
                  '外显子编号': 'Exon 21',
                  '变异类型': '错义突变'
                },
                {
                  id: 'mutation_2',
                  '基因名称': 'TP53',
                  '突变位点': 'R273H',
                  '突变效应类型': '未知意义',
                  '突变频率': '42%',
                  '外显子编号': 'Exon 8',
                  '变异类型': '错义突变'
                }
              ]
            }
          ]
        },
        {
          id: 'genetics_2',
          fields: [
            // fields类型字段（普通字段）
            { id: 'CORE099_2', name: '检测类型', value: 'PCR', confidence: 'high', source: 'ehr_doc7', editable: true, fieldType: 'fields', uiType: 'select' },
            { id: 'CORE100_2', name: '标本类型', value: '血液', confidence: 'high', source: 'ehr_doc7', editable: true, fieldType: 'fields', uiType: 'select' },
            { id: 'CORE101_2', name: '检测项目名称', value: 'EGFR突变检测', confidence: 'high', source: 'ehr_doc7', editable: true, fieldType: 'fields', uiType: 'text' },
            { id: 'CORE113_2', name: '报告编号', value: 'PCR2024-001456', confidence: 'high', source: 'ehr_doc7', editable: true, fieldType: 'fields', uiType: 'text' },
            { id: 'CORE114_2', name: '医疗机构', value: '中山大学附属第三医院检验科', confidence: 'high', source: 'ehr_doc7', editable: true, fieldType: 'fields', uiType: 'text' },
            { id: 'CORE116_2', name: '送检日期', value: '2024-02-05', confidence: 'high', source: 'ehr_doc7', editable: true, fieldType: 'fields', uiType: 'datepicker' },
            { id: 'CORE117_2', name: '报告日期', value: '2024-02-07', confidence: 'high', source: 'ehr_doc7', editable: true, fieldType: 'fields', uiType: 'datepicker' },
            
            // table_fields类型字段（表格字段）
            { 
              id: 'CORE102_TABLE_2', 
              name: '突变结果', 
              fieldType: 'table_fields', 
              confidence: 'high', 
              source: 'ehr_doc7', 
              editable: true,
              tableData: [
                {
                  id: 'mutation_3',
                  '基因名称': 'EGFR',
                  '突变位点': 'L858R',
                  '突变效应类型': '敏感突变',
                  '突变频率': '38%',
                  '外显子编号': 'Exon 21',
                  '变异类型': '错义突变'
                }
              ]
            }
          ]
        }
      ]
    },
     
     // 检查检验 - 其他检查（可重复）
     otherExam: {
       name: '其他检查',
       repeatable: true,
       records: [
         {
           id: 'other_exam_1',
           fields: [
             // fields类型字段
             { id: 'CORE146', name: '报告项目名称', value: '肺功能检查', confidence: 'high', source: 'ehr_doc6', editable: true, fieldType: 'fields', uiType: 'text' },
             { id: 'CORE147', name: '检查机构', value: '中山大学附属第三医院呼吸科', confidence: 'high', source: 'ehr_doc6', editable: true, fieldType: 'fields', uiType: 'text' },
             { id: 'CORE148', name: '检查日期', value: '2024-01-08', confidence: 'high', source: 'ehr_doc6', editable: true, fieldType: 'fields', uiType: 'date-picker' },
             { id: 'CORE149', name: '报告日期', value: '2024-01-08', confidence: 'high', source: 'ehr_doc6', editable: true, fieldType: 'fields', uiType: 'date-picker' },
             { id: 'CORE150', name: '检查编号', value: 'PFT2024-001234', confidence: 'high', source: 'ehr_doc6', editable: true, fieldType: 'fields', uiType: 'text' },
             { id: 'CORE153', name: '报告结论文字', value: '肺功能轻度受限，FEV1/FVC比值降低', confidence: 'high', source: 'ehr_doc6', editable: true, fieldType: 'fields', uiType: 'textarea' },
             { id: 'CORE154', name: '报告医生', value: '李医师', confidence: 'medium', source: 'ehr_doc6', editable: true, fieldType: 'fields', uiType: 'text', sensitive: true },
             { id: 'CORE155', name: '审核医生', value: '王主任', confidence: 'medium', source: 'ehr_doc6', editable: true, fieldType: 'fields', uiType: 'text', sensitive: true }
           ]
         }
       ]
     },
     
     // 其他材料 - 材料信息（可重复）
     materialInfo: {
       name: '材料信息',
       repeatable: true,
       records: [
         {
           id: 'material_1',
           fields: [
             { id: 'CORE156', name: '材料类型', value: '处方', confidence: 'high', source: 'ehr_doc7', editable: true, fieldType: 'fields', uiType: 'select', sensitive: true },
             { id: 'CORE157', name: '材料名称', value: '门诊处方单', confidence: 'high', source: 'ehr_doc7', editable: true, fieldType: 'fields', uiType: 'text' },
             { id: 'CORE158', name: '材料来源机构', value: '中山大学附属第三医院', confidence: 'high', source: 'ehr_doc7', editable: true, fieldType: 'fields', uiType: 'text', sensitive: true },
             { id: 'CORE159', name: '材料日期', value: '2024-01-10', confidence: 'high', source: 'ehr_doc7', editable: true, fieldType: 'fields', uiType: 'date-picker' },
             { id: 'CORE160', name: '材料金额', value: '1250.00', confidence: 'medium', source: 'ehr_doc7', editable: true, fieldType: 'fields', uiType: 'number', sensitive: true },
             { id: 'CORE161', name: '材料摘要', value: '吉非替尼片 250mg×30片', confidence: 'high', source: 'ehr_doc7', editable: true, fieldType: 'fields', uiType: 'textarea' },
             { id: 'CORE162', name: '开具人员', value: '李主任', confidence: 'medium', source: 'ehr_doc7', editable: true, fieldType: 'fields', uiType: 'text', sensitive: true },
             { id: 'CORE163', name: '材料编号', value: 'RX2024-001567', confidence: 'high', source: 'ehr_doc7', editable: true, fieldType: 'fields', uiType: 'text', sensitive: true }
           ]
         }
       ]
     }
   }

  // 获取当前选中字段组的数据
  const getCurrentGroupData = () => {
    return ehrFieldsData[selectedEhrGroup] || { name: '未知字段组', fields: [] }
  }

  // 电子病历夹文档数据
  const ehrDocuments = mockEhrDocuments

  // 模拟文档数据
  const documents = mockDocuments

  // 模拟冲突数据
  const conflicts = mockConflicts

  // 模拟变更日志
  const changeLogs = mockChangeLogs

  // 文档类型图标映射
  const getDocumentIcon = (type) => {
    switch (type) {
      case 'PDF':
        return <FileTextOutlined style={{ color: '#ff4d4f' }} />
      case 'Image':
        return <PictureOutlined style={{ color: '#52c41a' }} />
      case 'Excel':
        return <FileTextOutlined style={{ color: '#1677ff' }} />
      default:
        return <FileTextOutlined />
    }
  }

  // 置信度标签
  const getConfidenceTag = (confidence) => {
    if (!confidence) return null
    const { color, text } = CONFIDENCE_CONFIG[confidence]
    return <Tag color={color} size="small">{text}</Tag>
  }

  // 电子病历夹相关辅助函数
  // 获取状态图标
  const getEhrStatusIcon = (status) => {
    switch (status) {
      case 'completed': return <CheckCircleOutlined style={{ color: '#52c41a' }} />
      case 'partial': return <ExclamationCircleOutlined style={{ color: '#faad14' }} />
      case 'incomplete': return <ExclamationCircleOutlined style={{ color: '#ff4d4f' }} />
      default: return null
    }
  }

  // 获取置信度颜色
  const getEhrConfidenceColor = (confidence) => {
    switch (confidence) {
      case 'high': return '#52c41a'
      case 'medium': return '#faad14'
      case 'low': return '#ff4d4f'
      default: return '#d9d9d9'
    }
  }

  // 电子病历夹事件处理函数
  const handleEhrGroupSelect = (groupKey) => {
    setSelectedEhrGroup(groupKey)
  }

  const handleEhrDocumentSelect = (doc) => {
    setSelectedEhrDocument(doc)
  }

  const handleGroupToggle = (groupKey) => {
    setExpandedGroups(prev => ({
      ...prev,
      [groupKey]: !prev[groupKey]
    }))
  }

  // 电子病历夹字段相关处理函数
  const handleEhrFieldEdit = (fieldId, value) => {
    console.log('开始编辑字段:', fieldId, value)
    setEditingEhrField(fieldId)
    setEditingEhrValue(Array.isArray(value) ? value.join(', ') : String(value || ''))
  }

  const handleEhrSaveEdit = (fieldId) => {
    console.log('保存字段编辑:', fieldId, editingEhrValue)
    message.success(`字段 ${fieldId} 已更新`)
    // 这里可以调用API保存数据
    setEditingEhrField(null)
    setEditingEhrValue('')
  }

  const handleEhrCancelEdit = () => {
    setEditingEhrField(null)
    setEditingEhrValue('')
  }

  const handleEhrEditRecord = (recordId) => {
    console.log('编辑记录:', recordId)
    message.info(`编辑记录 ${recordId}`)
    // 这里可以实现记录编辑逻辑
  }

  const handleEhrDeleteRecord = (recordId) => {
    console.log('删除记录:', recordId)
    message.success(`记录 ${recordId} 已删除`)
    // 这里可以实现记录删除逻辑
  }

  const handleEhrFieldExtract = (fieldId) => {
    console.log('AI抽取字段:', fieldId)
    message.info('AI抽取功能启动中...')
    // 这里可以实现AI抽取逻辑
  }

  const handleEhrGroupExtract = () => {
    const currentGroup = getCurrentGroupData()
    console.log('AI抽取字段组:', selectedEhrGroup, currentGroup.name)
    message.info(`正在对"${currentGroup.name}"进行AI抽取...`)
    // 这里可以实现字段组批量抽取逻辑
  }

  const handleEhrViewSource = (source) => {
    console.log('查看字段来源:', source)
    const doc = ehrDocuments.find(d => d.id === source)
    if (doc) {
      setSelectedEhrDocument(doc)
    }
  }

  // 渲染table_fields类型的单个字段（嵌套表格）
  const renderTableFieldsType = (field) => {
    if (!field.tableData || field.tableData.length === 0) {
      return (
        <div style={{ textAlign: 'center', padding: 20, color: '#999', border: '1px dashed #d9d9d9', borderRadius: 4 }}>
          <FileTextOutlined style={{ fontSize: 24, marginBottom: 8 }} />
          <div>暂无{field.name}数据</div>
          <Button 
            type="dashed" 
            size="small"
            icon={<PlayCircleOutlined />}
            style={{ marginTop: 8 }}
            onClick={() => handleEhrFieldExtract(field.id)}
          >
            AI抽取
          </Button>
        </div>
      )
    }

    // 获取表格列定义
    const columns = Object.keys(field.tableData[0])
      .filter(key => key !== 'id')
      .map(key => ({
        title: key,
        dataIndex: key,
        key: key,
        width: key === '指标名称（中文）' ? 120 : key === '检测值' ? 80 : key === '参考范围' ? 100 : 90,
        render: (text, record) => {
          const cellId = `${field.id}_${record.id}_${key}`
          
          // 如果当前单元格正在编辑
          if (editingEhrField === cellId) {
            return (
              <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                <Input
                  value={editingEhrValue}
                  onChange={(e) => setEditingEhrValue(e.target.value)}
                  onPressEnter={() => handleEhrSaveEdit(cellId)}
                  onBlur={() => handleEhrSaveEdit(cellId)}
                  autoFocus
                  size="small"
                  style={{ 
                    fontSize: 11,
                    border: `1px solid ${getEhrConfidenceColor(field.confidence)}`,
                    borderRadius: 4
                  }}
                />
                <Button 
                  type="text" 
                  size="small" 
                  icon={<CheckCircleOutlined />}
                  onClick={() => handleEhrSaveEdit(cellId)}
                  style={{ color: '#52c41a', padding: '0 2px', fontSize: 10 }}
                />
                <Button 
                  type="text" 
                  size="small" 
                  icon={<CloseOutlined />}
                  onClick={handleEhrCancelEdit}
                  style={{ color: '#ff4d4f', padding: '0 2px', fontSize: 10 }}
                />
              </div>
            )
          }
          
          // 显示状态
          if (key === '是否异常') {
            return (
              <div 
                style={{ cursor: 'pointer' }}
                onDoubleClick={() => handleEhrFieldEdit(cellId, text)}
              >
                {text ? <Tag color="red">异常</Tag> : <Tag color="green">正常</Tag>}
              </div>
            )
          }
          if (key === '异常标志' && text) {
            return (
              <div 
                style={{ cursor: 'pointer' }}
                onDoubleClick={() => handleEhrFieldEdit(cellId, text)}
              >
                <Text style={{ color: '#ff4d4f', fontWeight: 'bold' }}>{text}</Text>
              </div>
            )
          }
          return (
            <div 
              style={{ cursor: 'pointer' }}
              onDoubleClick={() => handleEhrFieldEdit(cellId, text)}
            >
              <Text style={{ fontSize: 12 }}>{text}</Text>
            </div>
          )
        }
      }))

    return (
      <div style={{ marginTop: 12 }}>
        <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Text strong style={{ fontSize: 13, color: '#333' }}>
            {field.name}
          </Text>
          <Tag color="purple" size="small">表格字段</Tag>
        </div>
        <Table
          dataSource={field.tableData}
          columns={columns}
          size="small"
          pagination={false}
          bordered
          style={{ 
            background: `${getEhrConfidenceColor(field.confidence)}08`,
            border: `1px solid ${getEhrConfidenceColor(field.confidence)}40`,
            borderRadius: 4
          }}
        />
      </div>
    )
  }

  // 渲染可重复字段组（整个字段组的多个实例）
  const renderRepeatableFieldGroup = (groupData) => {
    if (!groupData.records || groupData.records.length === 0) {
      return (
        <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>
          <FileTextOutlined style={{ fontSize: 32, marginBottom: 12 }} />
          <div>暂无{groupData.name}记录</div>
          <Button 
            type="dashed" 
            icon={<PlayCircleOutlined />}
            style={{ marginTop: 12 }}
            onClick={() => console.log('添加新记录')}
          >
            + 添加{groupData.name}
          </Button>
        </div>
      )
    }

    return (
      <div>
        {groupData.records.map((record, index) => (
          <Card
            key={record.id}
            size="small"
            title={
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Space>
                  <Text strong style={{ fontSize: 14 }}>{groupData.name} #{index + 1}</Text>
                  <Tag color="blue" size="small">多组记录</Tag>
                </Space>
                <Space>
                  <Button 
                    type="text" 
                    size="small" 
                    icon={<EditOutlined />}
                    onClick={() => handleEhrEditRecord(record.id)}
                  >
                    编辑
                  </Button>
                  <Button 
                    type="text" 
                    size="small" 
                    icon={<DeleteOutlined />} 
                    danger
                    onClick={() => handleEhrDeleteRecord(record.id)}
                  >
                    删除
                  </Button>
                </Space>
              </div>
            }
            style={{ 
              marginBottom: 16,
              border: '1px solid #f0f0f0',
              borderRadius: 6
            }}
            styles={{ body: { padding: '16px' } }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
              {/* 先渲染所有table_fields类型的字段 */}
              {record.fields.filter(field => field.fieldType === 'table_fields').map(field => (
                <div key={field.id} style={{ width: '100%' }}>
                  {renderTableFieldsType(field)}
                </div>
              ))}
              
              {/* 然后渲染普通字段，使用网格布局 */}
              {/* 兼容旧格式(type属性)和新格式(fieldType: 'fields')的字段 */}
              {(() => {
                const normalFields = record.fields.filter(field => 
                  field.fieldType === 'fields' || // 新格式
                  (field.type && !field.fieldType) // 旧格式：有type属性但没有fieldType属性
                )
                
                if (normalFields.length === 0) return null
                
                return (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: '12px' }}>
                    {normalFields.map(field => (
                      <div key={field.id} style={{ marginBottom: 8 }}>
                        <div style={{ marginBottom: 4 }}>
                          <Text strong style={{ fontSize: 12, color: '#666' }}>
                            {field.name.replace(/.*_/, '')}
                          </Text>
                        </div>
                        {editingEhrField === field.id ? (
                           // 编辑状态
                           <div style={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                             <Input
                               value={editingEhrValue}
                               onChange={(e) => setEditingEhrValue(e.target.value)}
                               onPressEnter={() => handleEhrSaveEdit(field.id)}
                               onBlur={() => handleEhrSaveEdit(field.id)}
                               autoFocus
                               size="small"
                               style={{ 
                                 fontSize: 12,
                                 border: `1px solid ${getEhrConfidenceColor(field.confidence)}`,
                                 borderRadius: 4
                               }}
                             />
                             <Button 
                               type="text" 
                               size="small" 
                               icon={<CheckCircleOutlined />}
                               onClick={() => handleEhrSaveEdit(field.id)}
                               style={{ color: '#52c41a', padding: '0 2px', fontSize: 12 }}
                             />
                             <Button 
                               type="text" 
                               size="small" 
                               icon={<CloseOutlined />}
                               onClick={handleEhrCancelEdit}
                               style={{ color: '#ff4d4f', padding: '0 2px', fontSize: 12 }}
                             />
                           </div>
                         ) : (
                           // 显示状态
                           <div
                             style={{
                               padding: '6px 10px',
                               borderRadius: 4,
                               background: field.extractable ? '#fafafa' : `${getEhrConfidenceColor(field.confidence)}15`,
                               border: field.extractable ? '1px dashed #d9d9d9' : `1px solid ${getEhrConfidenceColor(field.confidence)}40`,
                               cursor: 'pointer',
                               minHeight: 28,
                               fontSize: 12
                             }}
                             onClick={() => handleEhrViewSource(field.source)}
                             onDoubleClick={() => handleEhrFieldEdit(field.id, field.value)}
                           >
                             <Tooltip
                               title={
                                 <div>
                                   <div>UI类型: {field.uiType || field.type}</div>
                                   <div>字段渲染类型: {field.fieldType || '普通字段'}</div>
                                   <div>置信度: {field.confidence === 'high' ? '高置信度' : field.confidence === 'medium' ? '中置信度' : '低置信度'}</div>
                                   <div>来源: {field.source}</div>
                                   {field.sensitive && <div style={{ color: '#faad14' }}>⚠️ 敏感字段</div>}
                                   <div style={{ marginTop: 4, fontSize: 11 }}>
                                     点击查看来源 · 双击编辑
                                   </div>
                                 </div>
                               }
                             >
                               <Text style={{ fontSize: 12 }}>
                                 {field.value || (field.extractable ? '双击手动填写' : '暂无数据')}
                               </Text>
                             </Tooltip>
                           </div>
                         )}
                      </div>
                    ))}
                  </div>
                )
              })()}
            </div>
          </Card>
        ))}
        
        {/* 添加新记录按钮 */}
        <div style={{ textAlign: 'center', marginTop: 16 }}>
          <Button 
            type="dashed" 
            icon={<PlayCircleOutlined />}
            style={{ width: '100%' }}
            onClick={() => console.log('添加新记录')}
          >
            + 添加新{groupData.name}
          </Button>
        </div>
      </div>
    )
  }

  // 处理文档点击 - 显示数据抽取结果
  const handleDocumentClick = (doc) => {
    setSelectedDocument(doc)
    if (doc.status === 'extracted' && doc.extractedData.length > 0) {
      setDataExtractionVisible(true)
    } else {
      message.info('该文档尚未进行数据抽取')
    }
  }

  // 编辑患者信息
  const handleEditPatient = () => {
    // 处理日期字段，转换为dayjs对象
    const formData = {
      ...patientInfo,
      birthDate: patientInfo.birthDate ? dayjs(patientInfo.birthDate) : null,
      admissionDate: patientInfo.admissionDate ? dayjs(patientInfo.admissionDate) : null
    }
    form.setFieldsValue(formData)
    setEditModalVisible(true)
  }

  // 保存患者信息
  const handleSavePatient = async () => {
    try {
      const values = await form.validateFields()
      
      // 处理日期字段，转换为字符串格式
      const processedValues = {
        ...values,
        birthDate: values.birthDate ? values.birthDate.format('YYYY-MM-DD') : patientInfo.birthDate,
        admissionDate: values.admissionDate ? values.admissionDate.format('YYYY-MM-DD') : patientInfo.admissionDate,
        age: parseInt(values.age) || patientInfo.age
      }
      
      // 更新患者信息
      setPatientInfo({ ...patientInfo, ...processedValues })
      setEditModalVisible(false)
      message.success('患者信息已更新')
      
      // 可以在这里添加API调用来保存到后端
      console.log('保存的患者信息:', { ...patientInfo, ...processedValues })
      
    } catch (error) {
      console.error('表单验证失败:', error)
      message.error('请检查输入信息')
    }
  }

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

  // 质量检查
  const handleQualityCheck = () => {
    setQualityCheckVisible(true)
  }

  // 删除文档
  const handleDeleteDocument = (docId) => {
    message.success('文档已删除')
    // 这里实现删除逻辑
  }

  // 重新抽取数据
  const handleReExtract = (docId) => {
    message.success('重新抽取已开始')
    // 这里实现重新抽取逻辑
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
  const handleResolveConflict = (conflictId, resolution, notes) => {
    message.success('冲突已解决')
    setConflictResolveVisible(false)
    // 这里实现冲突解决逻辑
  }

  // 查看变更日志
  const handleViewChangeLogs = () => {
    setChangeLogVisible(true)
  }

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

  // 编辑病情综述
  const handleEditSummary = () => {
    setSummaryContent(aiSummary.content)
    summaryForm.setFieldsValue({ content: aiSummary.content })
    setSummaryEditMode(true)
  }

  // 保存病情综述
  const handleSaveSummary = async () => {
    try {
      const values = await summaryForm.validateFields()
      setAiSummary({
        ...aiSummary,
        content: values.content,
        lastUpdate: new Date().toLocaleString()
      })
      setSummaryEditMode(false)
      message.success('病情综述已保存')
    } catch (error) {
      message.error('请检查输入内容')
    }
  }

  // 重新生成AI综述
  const handleRegenerateSummary = () => {
    setSummaryGenerating(true)
    // 模拟AI重新生成
    setTimeout(() => {
      message.success('AI病情综述已重新生成')
      setAiSummary({
        ...aiSummary,
        lastUpdate: new Date().toLocaleString(),
        confidence: 95
      })
      setSummaryGenerating(false)
    }, 3000)
  }

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
                color: '#1677ff',
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
      {/* 页面操作栏 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Row gutter={16} align="middle">
          <Col>
            <Button 
              icon={<ArrowLeftOutlined />} 
              onClick={() => navigate('/patient/pool')}
            >
              返回患者列表
            </Button>
          </Col>
          <Col flex={1}>
            <Space>
              {/* 注释掉重复的信息显示 - 完整度、文档数量、项目数量 */}
              {/* <Text type="secondary">📊 完整度: {patientInfo.completeness}%</Text>
              <Text type="secondary">📄 文档: {documents.length}份</Text>
              <Text type="secondary">🎯 项目: {patientInfo.projects.length}个</Text> */}
              
              {/* 注释掉冲突和更新的Badge显示，改为在按钮上显示 */}
              {/* {conflicts.length > 0 && (
                <Badge count={conflicts.length}>
                  <Text type="secondary" style={{ color: '#faad14' }}>⚠️ 冲突</Text>
                </Badge>
              )}
              {changeLogs.filter(log => log.status === 'pending').length > 0 && (
                <Badge count={changeLogs.filter(log => log.status === 'pending').length}>
                  <Text type="secondary" style={{ color: '#1677ff' }}>🔔 更新</Text>
                </Badge>
              )} */}
            </Space>
          </Col>
          <Col>
            <Space>
              <Button icon={<HistoryOutlined />} onClick={handleViewChangeLogs}>
                📋 变更日志
                {changeLogs.filter(log => log.status === 'pending').length > 0 && 
                  ` (${changeLogs.filter(log => log.status === 'pending').length})`
                }
              </Button>
              {conflicts.length > 0 && (
                <Button 
                  icon={<WarningOutlined />} 
                  type="primary" 
                  ghost
                  onClick={() => setConflictResolveVisible(true)}
                >
                  ⚠️ 解决冲突 ({conflicts.length})
                </Button>
              )}
              <Button icon={<ReloadOutlined />}>
                🔄 重新抽取
              </Button>
              <Button 
                icon={<UserOutlined />}
                type="primary"
                ghost
                onClick={() => setAiAssistantVisible(true)}
              >
                🤖 AI助手
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* 患者概览卡片 */}
      <Card size="small" style={{ marginBottom: 16 }}>
        <Row gutter={24} align="middle">
          <Col>
            <Avatar size={64} icon={<UserOutlined />} />
          </Col>
          <Col flex={1}>
            <Row gutter={[24, 12]}>
              <Col span={6}>
                <div>
                  <Text type="secondary">姓名:</Text>
                  <Text strong style={{ marginLeft: 8, fontSize: 16 }}>{patientInfo.name}</Text>
                </div>
              </Col>
              <Col span={6}>
                <div>
                  <Text type="secondary">性别/年龄:</Text>
                  <Text strong style={{ marginLeft: 8 }}>{patientInfo.gender} / {patientInfo.age}岁</Text>
                </div>
              </Col>
              <Col span={6}>
                <div>
                  <Text type="secondary">科室:</Text>
                  <Text strong style={{ marginLeft: 8 }}>{patientInfo.department}</Text>
                </div>
              </Col>
              <Col span={6}>
                <div>
                  <Text type="secondary">主治医生:</Text>
                  <Text strong style={{ marginLeft: 8 }}>{patientInfo.doctor}</Text>
                </div>
              </Col>
              <Col span={12}>
                <div>
                  <Text type="secondary">主要诊断:</Text>
                  <div style={{ marginLeft: 8, marginTop: 4 }}>
                    <Space wrap>
                      {patientInfo.diagnosis.map(d => (
                        <Tag key={d} color="blue">{d}</Tag>
                      ))}
                    </Space>
                  </div>
                </div>
              </Col>
              <Col span={12}>
                <div>
                  <Text type="secondary">关联项目:</Text>
                  <div style={{ marginLeft: 8, marginTop: 4 }}>
                    <Space wrap>
                      {patientInfo.projects.map(project => (
                        <Button 
                          key={project}
                          type="link" 
                          size="small"
                          onClick={() => navigate(`/research/projects/${project}`)}
                          style={{ padding: '2px 8px', height: 'auto' }}
                        >
                          {project === 'PROJ001' ? '肺癌研究' : project === 'PROJ004' ? '5条日志' : project}
                        </Button>
                      ))}
                    </Space>
                  </div>
                </div>
              </Col>
            </Row>
          </Col>
          <Col>
            <Space direction="vertical">
              <Button type="primary" icon={<EditOutlined />} onClick={handleEditPatient}>
                编辑信息
              </Button>
              <Button icon={<DownloadOutlined />} onClick={handleExportData}>
                导出数据
              </Button>
              <Button icon={<CheckCircleOutlined />} onClick={handleQualityCheck}>
                质量检查
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* Tab页面布局 */}
      <Card>
        <Tabs
          defaultActiveKey="basic"
          items={[
            {
              key: 'basic',
              label: (
                <Space>
                  <UserOutlined />
                  电子病历
                </Space>
              ),
              children: (
                /* 电子病历夹三栏布局 */
                <div style={{ display: 'flex', gap: '8px' }}>
                  {/* 左侧面板：电子病历树形结构 */}
                  <div style={{ width: `${ehrLeftWidth}px`, minWidth: '250px' }}>
                    <Card 
                      size="small" 
                      title="病历夹"
                      style={{ 
                        border: '1px solid #e8e8e8',
                        borderRadius: '6px'
                      }}
                      styles={{ body: { padding: '12px' } }}
                    >
                      <List
                        dataSource={ehrFieldGroups}
                        renderItem={group => (
                          <List.Item style={{ padding: '0', marginBottom: '4px' }}>
                            <div style={{ width: '100%' }}>
                              {/* 主字段组 */}
                              <div
                                style={{
                                  padding: '8px 12px',
                                  cursor: 'pointer',
                                  background: selectedEhrGroup === group.key ? '#f0f8ff' : 'transparent',
                                  borderRadius: 4,
                                  border: selectedEhrGroup === group.key ? '1px solid #1677ff' : '1px solid transparent',
                                  transition: 'all 0.2s ease'
                                }}
                                onClick={() => handleEhrGroupSelect(group.key)}
                                onMouseEnter={(e) => {
                                  if (selectedEhrGroup !== group.key) {
                                    e.target.style.background = '#f8f9fa'
                                  }
                                }}
                                onMouseLeave={(e) => {
                                  if (selectedEhrGroup !== group.key) {
                                    e.target.style.background = 'transparent'
                                  }
                                }}
                              >
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    {/* 展开收起图标 */}
                                    {group.children && (
                                      <div
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          handleGroupToggle(group.key)
                                        }}
                                        style={{
                                          width: 16,
                                          height: 16,
                                          display: 'flex',
                                          alignItems: 'center',
                                          justifyContent: 'center',
                                          cursor: 'pointer',
                                          borderRadius: 2,
                                          transition: 'all 0.2s ease'
                                        }}
                                      >
                                        {expandedGroups[group.key] ? (
                                          <MinusOutlined style={{ fontSize: 10, color: '#666' }} />
                                        ) : (
                                          <PlusOutlined style={{ fontSize: 10, color: '#666' }} />
                                        )}
                                      </div>
                                    )}
                                    
                                    {/* 文件夹图标 */}
                                    {expandedGroups[group.key] ? (
                                      <FolderOpenOutlined style={{ fontSize: 14, color: '#1677ff' }} />
                                    ) : (
                                      <FolderOutlined style={{ fontSize: 14, color: '#666' }} />
                                    )}
                                    
                                    <Text strong style={{ fontSize: 13 }}>{group.name}</Text>
                                    {getEhrStatusIcon(group.status)}
                                  </div>
                                  <Text type="secondary" style={{ fontSize: 11 }}>
                                    {group.extractedCount}/{group.fieldCount}
                                  </Text>
                                </div>
                              </div>
                              
                              {/* 子字段组 */}
                              {group.children && expandedGroups[group.key] && (
                                <div style={{ marginLeft: 24, marginTop: 4 }}>
                                  {group.children.map(child => (
                                    <div
                                      key={child.key}
                                      style={{
                                        padding: '6px 10px',
                                        cursor: 'pointer',
                                        background: selectedEhrGroup === child.key ? '#f0f8ff' : 'transparent',
                                        borderRadius: 4,
                                        border: selectedEhrGroup === child.key ? '1px solid #1677ff' : '1px solid transparent',
                                        marginBottom: 2,
                                        transition: 'all 0.2s ease'
                                      }}
                                      onClick={() => handleEhrGroupSelect(child.key)}
                                      onMouseEnter={(e) => {
                                        if (selectedEhrGroup !== child.key) {
                                          e.target.style.background = '#f8f9fa'
                                        }
                                      }}
                                      onMouseLeave={(e) => {
                                        if (selectedEhrGroup !== child.key) {
                                          e.target.style.background = 'transparent'
                                        }
                                      }}
                                    >
                                      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                          <FileTextOutlined style={{ fontSize: 12, color: '#999' }} />
                                          <Text style={{ fontSize: 12 }}>{child.name}</Text>
                                          {getEhrStatusIcon(child.status)}
                                        </div>
                                        <Text type="secondary" style={{ fontSize: 10 }}>
                                          {child.extractedCount}/{child.fieldCount}
                                        </Text>
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          </List.Item>
                        )}
                      />
                    </Card>
                  </div>

                  {/* 左侧拖动分隔条 */}
                  <div 
                    style={{ 
                      width: '4px', 
                      background: '#f0f0f0', 
                      cursor: 'col-resize',
                      borderRadius: '2px',
                      transition: 'background 0.2s'
                    }}
                    onMouseDown={(e) => {
                      const startX = e.clientX
                      const startWidth = ehrLeftWidth
                      
                      const handleMouseMove = (moveEvent) => {
                        const newWidth = Math.max(250, Math.min(500, startWidth + (moveEvent.clientX - startX)))
                        setEhrLeftWidth(newWidth)
                      }
                      
                      const handleMouseUp = () => {
                        document.removeEventListener('mousemove', handleMouseMove)
                        document.removeEventListener('mouseup', handleMouseUp)
                      }
                      
                      document.addEventListener('mousemove', handleMouseMove)
                      document.addEventListener('mouseup', handleMouseUp)
                    }}
                    onMouseEnter={(e) => e.target.style.background = '#d9d9d9'}
                    onMouseLeave={(e) => e.target.style.background = '#f0f0f0'}
                  />

                  {/* 中间面板：字段数据展示 */}
                  <div style={{ flex: 1, minWidth: '400px' }}>
                    <Card
                      title={
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Space>
                            <span>{getCurrentGroupData().name}</span>
                            <Tag color="blue">电子病历夹</Tag>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              {getCurrentGroupData().fields?.length || 0} 个字段
                            </Text>
                          </Space>
                          <Button 
                            type="primary" 
                            size="small" 
                            icon={<PlayCircleOutlined />}
                            onClick={handleEhrGroupExtract}
                            style={{ backgroundColor: '#52c41a', borderColor: '#52c41a' }}
                          >
                            AI抽取
                          </Button>
                        </div>
                      }
                      size="small"
                      style={{ 
                        border: '1px solid #e8e8e8',
                        borderRadius: '6px'
                      }}
                      styles={{ body: { padding: '16px' } }}
                    >
                      {(() => {
                        const currentGroup = getCurrentGroupData()
                        
                        // 根据字段组是否可重复选择渲染方式
                        // repeatable = true: 可重复字段组，使用记录形式渲染
                        if (currentGroup.repeatable) {
                          return renderRepeatableFieldGroup(currentGroup)
                        }
                        
                        // 不可重复字段组渲染（repeatable = false: 单一实例字段组）
                        if (currentGroup.fields?.length > 0) {
                          return (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
                              {currentGroup.fields.map(field => {
                                // 根据字段渲染类型选择渲染方式
                                if (field.fieldType === 'table_fields') {
                                  return renderTableFieldsType(field)
                                }
                                
                                // 普通fields类型字段渲染
                                return (
                                  <div
                                    key={field.id}
                                    style={{
                                      padding: '12px',
                                      border: '1px solid #f0f0f0',
                                      borderRadius: '6px',
                                      background: field.extractable ? '#fafafa' : 'white',
                                      transition: 'all 0.2s ease'
                                    }}
                                    onMouseEnter={(e) => {
                                      e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,0.1)'
                                    }}
                                    onMouseLeave={(e) => {
                                      e.currentTarget.style.boxShadow = 'none'
                                    }}
                                  >
                                    {/* 字段标签 */}
                                    <div style={{ 
                                      display: 'flex', 
                                      justifyContent: 'space-between', 
                                      alignItems: 'center',
                                      marginBottom: 8
                                    }}>
                                      <Text strong style={{ fontSize: 13, color: '#333' }}>
                                        {field.name}
                                      </Text>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                        {field.sensitive && (
                                          <Tooltip title="敏感字段">
                                            <WarningOutlined style={{ fontSize: 10, color: '#faad14' }} />
                                          </Tooltip>
                                        )}
                                        {!field.editable && (
                                          <Tooltip title="只读字段">
                                            <InfoCircleOutlined style={{ fontSize: 10, color: '#999' }} />
                                          </Tooltip>
                                        )}
                                      </div>
                                    </div>

                                    {/* 字段值 */}
                                     {editingEhrField === field.id ? (
                                       // 编辑状态
                                       <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                                         <Input
                                           value={editingEhrValue}
                                           onChange={(e) => setEditingEhrValue(e.target.value)}
                                           onPressEnter={() => handleEhrSaveEdit(field.id)}
                                           onBlur={() => handleEhrSaveEdit(field.id)}
                                           autoFocus
                                           style={{ 
                                             fontSize: 13,
                                             border: `1px solid ${getEhrConfidenceColor(field.confidence)}`,
                                             borderRadius: 4
                                           }}
                                         />
                                         <Button 
                                           type="text" 
                                           size="small" 
                                           icon={<CheckCircleOutlined />}
                                           onClick={() => handleEhrSaveEdit(field.id)}
                                           style={{ color: '#52c41a', padding: '0 4px' }}
                                         />
                                         <Button 
                                           type="text" 
                                           size="small" 
                                           icon={<CloseOutlined />}
                                           onClick={handleEhrCancelEdit}
                                           style={{ color: '#ff4d4f', padding: '0 4px' }}
                                         />
                                       </div>
                                     ) : (
                                       // 显示状态
                                       <div
                                           style={{
                                             padding: '8px 12px',
                                             borderRadius: 4,
                                             background: field.extractable ? '#fafafa' : `${getEhrConfidenceColor(field.confidence)}15`,
                                             border: field.extractable ? '1px dashed #d9d9d9' : `1px solid ${getEhrConfidenceColor(field.confidence)}40`,
                                             cursor: 'pointer',
                                             minHeight: 32,
                                             display: 'flex',
                                             alignItems: 'center'
                                           }}
                                           onClick={() => handleEhrViewSource(field.source)}
                                           onDoubleClick={() => handleEhrFieldEdit(field.id, field.value)}
                                         >
                                         <Tooltip
                                            title={
                                              <div>
                                                <div>UI类型: {field.uiType}</div>
                                                <div>字段渲染类型: {field.fieldType}</div>
                                                <div>置信度: {field.confidence === 'high' ? '高置信度' : field.confidence === 'medium' ? '中置信度' : '低置信度'}</div>
                                                <div>来源: {field.source}</div>
                                                {field.sensitive && <div style={{ color: '#faad14' }}>⚠️ 敏感字段</div>}
                                                {!field.editable && <div style={{ color: '#999' }}>🔒 只读字段</div>}
                                                <div style={{ marginTop: 4, fontSize: 11 }}>
                                                  点击查看来源 · 双击编辑
                                                </div>
                                              </div>
                                            }
                                          >
                                             <Text style={{ fontSize: 13 }}>
                                               {field.value || (field.extractable ? '暂无数据' : '暂无数据')}
                                             </Text>
                                           </Tooltip>
                                         </div>
                                       )}
                                  </div>
                                )
                              })}
                            </div>
                          )
                        }
                        
                        // 空状态
                        return (
                          <div style={{ 
                            minHeight: '200px',
                            display: 'flex', 
                            alignItems: 'center', 
                            justifyContent: 'center',
                            color: '#999',
                            fontSize: 14
                          }}>
                            <div style={{ textAlign: 'center' }}>
                              <FileTextOutlined style={{ fontSize: 48, marginBottom: 16 }} />
                              <div>选择左侧字段组查看详细信息</div>
                              <div style={{ fontSize: 12, marginTop: 8 }}>
                                电子病历夹字段展示区域
                              </div>
                            </div>
                          </div>
                        )
                      })()}
                    </Card>
                  </div>

                  {/* 右侧拖动分隔条 */}
                  <div 
                    style={{ 
                      width: '4px', 
                      background: '#f0f0f0', 
                      cursor: 'col-resize',
                      borderRadius: '2px',
                      transition: 'background 0.2s'
                    }}
                    onMouseDown={(e) => {
                      const startX = e.clientX
                      const startWidth = ehrRightWidth
                      
                      const handleMouseMove = (moveEvent) => {
                        const newWidth = Math.max(300, Math.min(500, startWidth - (moveEvent.clientX - startX)))
                        setEhrRightWidth(newWidth)
                      }
                      
                      const handleMouseUp = () => {
                        document.removeEventListener('mousemove', handleMouseMove)
                        document.removeEventListener('mouseup', handleMouseUp)
                      }
                      
                      document.addEventListener('mousemove', handleMouseMove)
                      document.addEventListener('mouseup', handleMouseUp)
                    }}
                    onMouseEnter={(e) => e.target.style.background = '#d9d9d9'}
                    onMouseLeave={(e) => e.target.style.background = '#f0f0f0'}
                  />

                  {/* 右侧面板：文档溯源预览 */}
                  <div style={{ width: `${ehrRightWidth}px`, minWidth: '300px' }}>
                    <Card 
                      title="文档溯源" 
                      size="small" 
                      style={{ 
                        border: '1px solid #e8e8e8',
                        borderRadius: '6px'
                      }}
                      styles={{ body: { padding: '12px' } }}
                    >
                      {selectedEhrDocument ? (
                        <div>
                          <div style={{ marginBottom: 16, padding: 12, background: '#f5f5f5', borderRadius: 4 }}>
                            <Text strong style={{ fontSize: 14 }}>{selectedEhrDocument.name}</Text>
                            <br />
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              {selectedEhrDocument.category} | {selectedEhrDocument.uploadDate}
                            </Text>
                            {selectedEhrDocument.confidence && (
                              <div style={{ marginTop: 4 }}>
                                <Tag color={selectedEhrDocument.confidence === 'high' ? 'green' : 'orange'} size="small">
                                  {selectedEhrDocument.confidence === 'high' ? '高置信度' : '中置信度'}
                                </Tag>
                              </div>
                            )}
                          </div>
                          
                          {selectedEhrDocument.extractedFields.length > 0 && (
                            <div style={{ marginBottom: 16 }}>
                              <Text strong style={{ fontSize: 12 }}>已抽取字段:</Text>
                              <div style={{ marginTop: 8 }}>
                                {selectedEhrDocument.extractedFields.map(field => (
                                  <Tag key={field} size="small" style={{ margin: '2px 4px 2px 0' }}>
                                    {field}
                                  </Tag>
                                ))}
                              </div>
                            </div>
                          )}
                          
                          <div style={{ 
                            height: 200, 
                            border: '1px solid #d9d9d9', 
                            borderRadius: 4, 
                            padding: 12,
                            background: '#fafafa',
                            marginBottom: 16
                          }}>
                            <Text type="secondary" style={{ fontSize: 12 }}>
                              文档内容预览区域...
                            </Text>
                          </div>
                          
                          <div style={{ textAlign: 'center' }}>
                            <Space>
                              <Button size="small" icon={<EyeOutlined />}>
                                查看完整文档
                              </Button>
                              <Button size="small" icon={<PlayCircleOutlined />}>
                                重新抽取
                              </Button>
                            </Space>
                          </div>
                        </div>
                      ) : (
                        <div style={{ textAlign: 'center', padding: 60, color: '#999' }}>
                          <FileTextOutlined style={{ fontSize: 48 }} />
                          <div style={{ marginTop: 16, fontSize: 14 }}>
                            点击字段值查看来源文档
                          </div>
                          <div style={{ marginTop: 8, fontSize: 12 }}>
                            文档溯源预览区域
                          </div>
                        </div>
                      )}
                    </Card>
                  </div>
                </div>
              )
            },
            {
              key: 'documents',
              label: (
                <Space>
                  <FileTextOutlined />
                  文档管理
                </Space>
              ),
              children: (
                <div>
                  {/* 文档管理工具栏 */}
                  <Row gutter={16} style={{ marginBottom: 16 }}>
                    <Col flex={1}>
                      <Space>
                        <Search placeholder="搜索文档..." style={{ width: 200 }} />
                        <Select placeholder="文档类型" style={{ width: 120 }} allowClear>
                          <Select.Option value="检验报告">检验报告</Select.Option>
                          <Select.Option value="影像检查">影像检查</Select.Option>
                          <Select.Option value="病理检查">病理检查</Select.Option>
                          <Select.Option value="用药信息">用药信息</Select.Option>
                        </Select>
                        <Select placeholder="处理状态" style={{ width: 120 }} allowClear>
                          <Select.Option value="extracted">已抽取</Select.Option>
                          <Select.Option value="pending">待处理</Select.Option>
                        </Select>
                      </Space>
                    </Col>
                    <Col>
                      <Space>
                        <Button 
                          type="primary" 
                          icon={<UploadOutlined />}
                          onClick={() => setUploadVisible(true)}
                        >
                          上传文档
                        </Button>
                        <Button 
                          icon={<PlayCircleOutlined />}
                          onClick={() => setExtractionVisible(true)}
                        >
                          批量抽取
                        </Button>
                      </Space>
                    </Col>
                  </Row>

                  {/* 文档列表 */}
                  <List
                    dataSource={documents}
                    renderItem={item => (
                      <List.Item
                        actions={[
                          <Tooltip title="查看抽取数据">
                            <Button 
                              type="link" 
                              size="small" 
                              icon={<EyeOutlined />}
                              onClick={() => handleDocumentClick(item)}
                              disabled={item.status !== 'extracted'}
                            >
                              查看数据
                            </Button>
                          </Tooltip>,
                          <Tooltip title="重新抽取">
                            <Button 
                              type="link" 
                              size="small" 
                              icon={<ReloadOutlined />}
                              onClick={() => handleReExtract(item.id)}
                            >
                              重新抽取
                            </Button>
                          </Tooltip>,
                          <Tooltip title="下载文档">
                            <Button 
                              type="link" 
                              size="small" 
                              icon={<DownloadOutlined />}
                            >
                              下载
                            </Button>
                          </Tooltip>,
                          <Popconfirm
                            title="确定要删除这个文档吗？"
                            description="删除后无法恢复"
                            onConfirm={() => handleDeleteDocument(item.id)}
                            okText="确定"
                            cancelText="取消"
                          >
                            <Button 
                              type="link" 
                              size="small" 
                              icon={<DeleteOutlined />}
                              danger
                            >
                              删除
                            </Button>
                          </Popconfirm>
                        ]}
                      >
                        <List.Item.Meta
                          avatar={getDocumentIcon(item.type)}
                          title={
                            <Space>
                              <Text strong>{item.name}</Text>
                              {item.status === 'extracted' && (
                                <CheckCircleOutlined style={{ color: '#52c41a' }} />
                              )}
                              {item.status === 'pending' && (
                                <ExclamationCircleOutlined style={{ color: '#faad14' }} />
                              )}
                              {item.confidence && getConfidenceTag(item.confidence)}
                            </Space>
                          }
                          description={
                            <div>
                              <Space split={<Divider type="vertical" />}>
                                <Text type="secondary">{item.category}</Text>
                                <Text type="secondary">{item.size}</Text>
                                <Text type="secondary">{item.uploadDate}</Text>
                              </Space>
                              {item.status === 'extracted' && (
                                <div style={{ marginTop: 4 }}>
                                  <Text type="secondary" style={{ fontSize: 12 }}>
                                    已抽取 {item.extractedData.length} 个字段
                                  </Text>
                                </div>
                              )}
                            </div>
                          }
                        />
                      </List.Item>
                    )}
                  />
                </div>
              )
            },
            {
              key: 'ai-summary',
              label: (
                <Space>
                  <UserOutlined />
                  AI病情综述
                  <Tag color="blue" size="small">AI生成</Tag>
                </Space>
              ),
              children: (
                <div>
                  {/* 综述操作栏 */}
                  <Card size="small" style={{ marginBottom: 16 }}>
                    <Row gutter={16} align="middle">
                      <Col flex={1}>
                        <Space>
                          <Text type="secondary">最后更新: {aiSummary.lastUpdate}</Text>
                          <Text type="secondary">AI置信度: {aiSummary.confidence}%</Text>
                          <Tag color="green" size="small">基于{aiSummary.sourceDocuments.length}份文档</Tag>
                        </Space>
                      </Col>
                      <Col>
                        <Space>
                          {!summaryEditMode ? (
                            <>
                              <Button 
                                icon={<EditOutlined />}
                                onClick={handleEditSummary}
                              >
                                编辑综述
                              </Button>
                              <Button 
                                icon={<ReloadOutlined />}
                                onClick={handleRegenerateSummary}
                                loading={summaryGenerating}
                              >
                                重新总结
                              </Button>
                              <Button icon={<DownloadOutlined />}>
                                导出综述
                              </Button>
                            </>
                          ) : (
                            <>
                              <Button onClick={() => setSummaryEditMode(false)}>
                                取消
                              </Button>
                              <Button 
                                type="primary" 
                                icon={<SaveOutlined />}
                                onClick={handleSaveSummary}
                              >
                                保存
                              </Button>
                            </>
                          )}
                        </Space>
                      </Col>
                    </Row>
                  </Card>

                  {/* 病情综述内容 */}
                  <Row gutter={16}>
                    <Col span={16}>
                      <Card title="AI病情综述" size="small" style={{ marginBottom: 16 }}>
                        {!summaryEditMode ? (
                          <div style={{ 
                            lineHeight: 1.8, 
                            fontSize: 14,
                            whiteSpace: 'pre-line',
                            minHeight: 400
                          }}>
                            {renderSummaryWithFootnotes(aiSummary.content)}
                          </div>
                        ) : (
                          <Form form={summaryForm} layout="vertical">
                            <Form.Item 
                              name="content"
                              rules={[{ required: true, message: '请输入病情综述内容' }]}
                            >
                              <TextArea 
                                rows={20}
                                placeholder="请输入或编辑病情综述内容..."
                                style={{ fontSize: 14, lineHeight: 1.6 }}
                              />
                            </Form.Item>
                          </Form>
                        )}
                      </Card>
                    </Col>

                    {/* 来源文档 */}
                    <Col span={8}>
                      <Card title="来源文档" size="small">
                        <List
                          size="small"
                          dataSource={aiSummary.sourceDocuments}
                          renderItem={doc => (
                            <List.Item
                              style={{ cursor: 'pointer' }}
                              onClick={() => handleViewSourceDocument(doc.id)}
                            >
                              <List.Item.Meta
                                avatar={
                                  <div style={{ 
                                    width: 24, 
                                    height: 24, 
                                    borderRadius: '50%', 
                                    background: '#1677ff', 
                                    color: 'white', 
                                    display: 'flex', 
                                    alignItems: 'center', 
                                    justifyContent: 'center',
                                    fontSize: 12,
                                    fontWeight: 'bold'
                                  }}>
                                    {doc.ref.replace(/[\[\]]/g, '')}
                                  </div>
                                }
                                title={
                                  <Text strong style={{ fontSize: 12 }}>
                                    {doc.name}
                                  </Text>
                                }
                                description={
                                  <Text type="secondary" style={{ fontSize: 11 }}>
                                    点击查看详细内容
                                  </Text>
                                }
                              />
                            </List.Item>
                          )}
                        />

                        <Divider style={{ margin: '12px 0' }} />
                        
                        <Alert
                          message="文献溯源说明"
                          description="综述中的[1][2][3][4]标记对应右侧文档，点击可查看原始内容"
                          type="info"
                          showIcon
                          style={{ fontSize: 11 }}
                        />
                      </Card>
                    </Col>
                  </Row>
                </div>
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
              children: (
                <Timeline
                  items={[
                    {
                      color: 'green',
                      children: (
                        <div>
                          <Text strong>患者档案创建</Text>
                          <br />
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            2024-01-08 | 系统自动创建
                          </Text>
                        </div>
                      )
                    },
                    {
                      color: 'blue',
                      children: (
                        <div>
                          <Text strong>上传用药记录</Text>
                          <br />
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            2024-01-08 | 用药记录.xlsx
                          </Text>
                        </div>
                      )
                    },
                    {
                      color: 'blue',
                      children: (
                        <div>
                          <Text strong>上传病理报告</Text>
                          <br />
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            2024-01-10 | 病理报告_20240110.pdf
                          </Text>
                        </div>
                      )
                    },
                    {
                      color: 'blue',
                      children: (
                        <div>
                          <Text strong>上传CT影像</Text>
                          <br />
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            2024-01-12 | CT影像_20240112.jpg
                          </Text>
                        </div>
                      )
                    },
                    {
                      color: 'green',
                      children: (
                        <div>
                          <Text strong>上传血常规报告</Text>
                          <br />
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            2024-01-15 | 血常规报告_20240115.pdf
                          </Text>
                        </div>
                      )
                    }
                  ]}
                />
              )
            }
          ]}
        />
      </Card>

      {/* 编辑患者信息弹窗 */}
      <Modal
        title={
          <Space>
            <EditOutlined />
            <Text strong>编辑患者信息</Text>
            <Text type="secondary">- {patientInfo.name}</Text>
          </Space>
        }
        open={editModalVisible}
        onCancel={() => setEditModalVisible(false)}
        footer={[
          <Button key="cancel" onClick={() => setEditModalVisible(false)}>
            取消
          </Button>,
          <Button key="save" type="primary" icon={<SaveOutlined />} onClick={handleSavePatient}>
            保存更改
          </Button>
        ]}
        width={800}
        style={{ top: 20 }}
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            {/* 基本信息 */}
            <Col span={24}>
              <div style={{ marginBottom: 16, paddingBottom: 8, borderBottom: '1px solid #f0f0f0' }}>
                <Text strong style={{ color: '#1677ff' }}>基本信息</Text>
              </div>
            </Col>
            <Col span={12}>
              <Form.Item label="姓名" name="name" rules={[{ required: true, message: '请输入姓名' }]}>
                <Input placeholder="请输入患者姓名" />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="性别" name="gender" rules={[{ required: true, message: '请选择性别' }]}>
                <Select placeholder="请选择性别">
                  <Select.Option value="男">男</Select.Option>
                  <Select.Option value="女">女</Select.Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="出生日期" name="birthDate" rules={[{ required: true, message: '请选择出生日期' }]}>
                <DatePicker 
                  style={{ width: '100%' }} 
                  placeholder="选择出生日期"
                  format="YYYY-MM-DD"
                />
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="年龄" name="age" rules={[{ required: true, message: '请输入年龄' }]}>
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
              <Form.Item label="联系电话" name="phone" rules={[
                { required: true, message: '请输入联系电话' },
                { pattern: /^1[3-9]\d{9}$/, message: '请输入正确的手机号码' }
              ]}>
                <Input placeholder="请输入手机号码" />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item label="身份证号" name="idCard" rules={[
                { required: true, message: '请输入身份证号' },
                { pattern: /(^\d{15}$)|(^\d{18}$)|(^\d{17}(\d|X|x)$)/, message: '请输入正确的身份证号' }
              ]}>
                <Input placeholder="请输入身份证号码" />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item label="住址" name="address">
                <Input placeholder="请输入详细住址" />
              </Form.Item>
            </Col>

            {/* 医疗信息 */}
            <Col span={24}>
              <div style={{ margin: '16px 0', paddingBottom: 8, borderBottom: '1px solid #f0f0f0' }}>
                <Text strong style={{ color: '#1677ff' }}>医疗信息</Text>
              </div>
            </Col>
            <Col span={8}>
              <Form.Item label="科室" name="department" rules={[{ required: true, message: '请选择科室' }]}>
                <Select placeholder="请选择科室">
                  <Select.Option value="肿瘤科">肿瘤科</Select.Option>
                  <Select.Option value="心内科">心内科</Select.Option>
                  <Select.Option value="内分泌科">内分泌科</Select.Option>
                  <Select.Option value="消化科">消化科</Select.Option>
                  <Select.Option value="呼吸科">呼吸科</Select.Option>
                  <Select.Option value="神经科">神经科</Select.Option>
                  <Select.Option value="外科">外科</Select.Option>
                  <Select.Option value="妇科">妇科</Select.Option>
                </Select>
              </Form.Item>
            </Col>
            <Col span={8}>
              <Form.Item label="主治医生" name="doctor" rules={[{ required: true, message: '请输入主治医生' }]}>
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
              <Form.Item label="主要诊断" name="diagnosis" rules={[{ required: true, message: '请输入至少一个诊断' }]}>
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

      {/* 数据抽取结果弹窗 */}
      <Modal
        title={`数据抽取结果 - ${selectedDocument?.name}`}
        open={dataExtractionVisible}
        onCancel={() => setDataExtractionVisible(false)}
        footer={[
          <Button key="close" onClick={() => setDataExtractionVisible(false)}>
            关闭
          </Button>,
          <Button key="edit" icon={<EditOutlined />}>
            编辑数据
          </Button>,
          <Button key="reextract" type="primary" icon={<ReloadOutlined />}>
            重新抽取
          </Button>
        ]}
        width={800}
      >
        {selectedDocument && (
          <div>
            {/* 文档信息 */}
            <Card size="small" style={{ marginBottom: 16 }}>
              <Row gutter={16}>
                <Col span={12}>
                  <Descriptions size="small" column={1}>
                    <Descriptions.Item label="文档名称">{selectedDocument.name}</Descriptions.Item>
                    <Descriptions.Item label="文档类型">{selectedDocument.category}</Descriptions.Item>
                    <Descriptions.Item label="上传日期">{selectedDocument.uploadDate}</Descriptions.Item>
                  </Descriptions>
                </Col>
                <Col span={12}>
                  <Descriptions size="small" column={1}>
                    <Descriptions.Item label="文件大小">{selectedDocument.size}</Descriptions.Item>
                    <Descriptions.Item label="处理状态">
                      {selectedDocument.status === 'extracted' ? (
                        <Tag color="green" icon={<CheckCircleOutlined />}>已抽取</Tag>
                      ) : (
                        <Tag color="orange" icon={<ExclamationCircleOutlined />}>待处理</Tag>
                      )}
                    </Descriptions.Item>
                    <Descriptions.Item label="AI置信度">
                      {getConfidenceTag(selectedDocument.confidence)}
                    </Descriptions.Item>
                  </Descriptions>
                </Col>
              </Row>
            </Card>

            {/* 抽取数据表格 */}
            {selectedDocument.extractedData.length > 0 ? (
              <Table
                dataSource={selectedDocument.extractedData.map((item, index) => ({
                  key: index,
                  ...item
                }))}
                columns={[
                  {
                    title: '字段名称',
                    dataIndex: 'field',
                    key: 'field',
                    width: 150
                  },
                  {
                    title: '抽取值',
                    dataIndex: 'value',
                    key: 'value',
                    render: (value, record) => (
                      <Space>
                        <Text>{Array.isArray(value) ? value.join(', ') : value}</Text>
                        {getConfidenceTag(record.confidence)}
                      </Space>
                    )
                  },
                  {
                    title: '操作',
                    key: 'action',
                    width: 120,
                    render: (_, record, index) => (
                      <Space size="small">
                        <Button 
                          type="link" 
                          size="small" 
                          icon={<EditOutlined />}
                          onClick={() => setEditingField(index)}
                        >
                          编辑
                        </Button>
                        <Button type="link" size="small" icon={<EyeOutlined />}>
                          溯源
                        </Button>
                      </Space>
                    )
                  }
                ]}
                pagination={false}
                size="small"
              />
            ) : (
              <div style={{ textAlign: 'center', padding: 40 }}>
                <ExclamationCircleOutlined style={{ fontSize: 48, color: '#faad14' }} />
                <div style={{ marginTop: 16 }}>
                  <Text>该文档尚未进行数据抽取</Text>
                  <br />
                  <Button type="primary" style={{ marginTop: 8 }}>
                    立即抽取
                  </Button>
                </div>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* 上传文档弹窗 */}
      <Modal
        title="上传新文档"
        open={uploadVisible}
        onCancel={() => setUploadVisible(false)}
        footer={[
          <Button key="cancel" onClick={() => setUploadVisible(false)}>
            取消
          </Button>,
          <Button key="upload" type="primary">
            开始上传
          </Button>
        ]}
      >
        <Upload.Dragger>
          <p className="ant-upload-drag-icon">
            <UploadOutlined />
          </p>
          <p className="ant-upload-text">点击或拖拽文件到此处上传</p>
          <p className="ant-upload-hint">
            支持PDF、图片、Office文档等格式
          </p>
        </Upload.Dragger>
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
        width={600}
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

      {/* 质量检查弹窗 */}
      <Modal
        title="数据质量检查"
        open={qualityCheckVisible}
        onCancel={() => setQualityCheckVisible(false)}
        footer={[
          <Button key="close" onClick={() => setQualityCheckVisible(false)}>
            关闭
          </Button>,
          <Button key="fix" type="primary">
            修复问题
          </Button>
        ]}
        width={700}
      >
        <Row gutter={16}>
          <Col span={12}>
            <Card size="small" title="数据完整度">
              <Progress
                percent={patientInfo.completeness}
                strokeColor="#52c41a"
                format={percent => `${percent}%`}
              />
              <div style={{ marginTop: 12 }}>
                <Text strong>缺失字段:</Text>
                <div style={{ marginTop: 8 }}>
                  <Tag color="orange">过敏史</Tag>
                  <Tag color="orange">家族史</Tag>
                  <Tag color="orange">既往史</Tag>
                </div>
              </div>
            </Card>
          </Col>
          <Col span={12}>
            <Card size="small" title="数据质量">
              <Timeline
                size="small"
                items={[
                  {
                    color: 'green',
                    children: (
                      <div>
                        <Text strong>电子病历夹信息</Text>
                        <br />
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          完整度: 100% | 质量: 优秀
                        </Text>
                      </div>
                    )
                  },
                  {
                    color: 'orange',
                    children: (
                      <div>
                        <Text strong>检验数据</Text>
                        <br />
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          完整度: 85% | 质量: 良好
                        </Text>
                      </div>
                    )
                  },
                  {
                    color: 'red',
                    children: (
                      <div>
                        <Text strong>病理数据</Text>
                        <br />
                        <Text type="secondary" style={{ fontSize: 12 }}>
                          完整度: 60% | 质量: 待完善
                        </Text>
                      </div>
                    )
                  }
                ]}
              />
            </Card>
          </Col>
        </Row>
       </Modal>

       {/* AI智能助手弹窗 */}
       <Drawer
         title={
           <Space>
             <Avatar icon={<UserOutlined />} size="small" style={{ backgroundColor: '#1677ff' }} />
             <Text strong>AI智能助手</Text>
             <Text type="secondary">基于当前患者: {patientInfo.name}</Text>
           </Space>
         }
         placement="right"
         width={400}
         open={aiAssistantVisible}
         onClose={() => setAiAssistantVisible(false)}
         extra={
           <Button size="small" onClick={() => setAiMessages([aiMessages[0]])}>
             清空对话
           </Button>
         }
       >
         <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
           {/* 对话历史 */}
           <div style={{ flex: 1, overflowY: 'auto', marginBottom: 16 }}>
             {aiMessages.map((msg, index) => (
               <div key={index} style={{ marginBottom: 16 }}>
                 <div style={{ 
                   display: 'flex', 
                   justifyContent: msg.type === 'user' ? 'flex-end' : 'flex-start',
                   marginBottom: 4
                 }}>
                   <div style={{
                     maxWidth: '80%',
                     padding: '8px 12px',
                     borderRadius: 8,
                     backgroundColor: msg.type === 'user' ? '#1677ff' : '#f5f5f5',
                     color: msg.type === 'user' ? 'white' : 'black'
                   }}>
                     <Text style={{ color: msg.type === 'user' ? 'white' : 'black' }}>
                       {msg.content}
                     </Text>
                   </div>
                 </div>
                 <div style={{ 
                   textAlign: msg.type === 'user' ? 'right' : 'left',
                   fontSize: 11,
                   color: '#999'
                 }}>
                   {msg.timestamp}
                 </div>
               </div>
             ))}
           </div>

           {/* 建议问题 */}
           <div style={{ marginBottom: 12 }}>
             <Text type="secondary" style={{ fontSize: 12 }}>💡 建议问题:</Text>
             <div style={{ marginTop: 4 }}>
               <Space wrap>
                 <Button 
                   size="small" 
                   type="dashed"
                   onClick={() => setAiInput('患者最近的血常规结果如何？')}
                 >
                   血常规结果
                 </Button>
                 <Button 
                   size="small" 
                   type="dashed"
                   onClick={() => setAiInput('患者的用药情况怎么样？')}
                 >
                   用药情况
                 </Button>
                 <Button 
                   size="small" 
                   type="dashed"
                   onClick={() => setAiInput('有哪些异常指标需要关注？')}
                 >
                   异常指标
                 </Button>
               </Space>
             </div>
           </div>

           {/* 输入框 */}
           <div>
             <Input.Group compact>
               <Input
                 value={aiInput}
                 onChange={(e) => setAiInput(e.target.value)}
                 placeholder="输入您的问题..."
                 onPressEnter={handleSendAiMessage}
                 style={{ width: 'calc(100% - 60px)' }}
               />
               <Button 
                 type="primary" 
                 onClick={handleSendAiMessage}
                 disabled={!aiInput.trim()}
                 style={{ width: 60 }}
               >
                 发送
               </Button>
             </Input.Group>
           </div>
         </div>
       </Drawer>

       {/* 冲突解决弹窗 */}
       <Modal
         title="字段冲突解决"
         open={conflictResolveVisible}
         onCancel={() => setConflictResolveVisible(false)}
         footer={[
           <Button key="cancel" onClick={() => setConflictResolveVisible(false)}>
             取消
           </Button>,
           <Button key="skip" onClick={() => setConflictResolveVisible(false)}>
             跳过此冲突
           </Button>,
           <Button key="resolve" type="primary">
             确认解决
           </Button>
         ]}
         width={800}
       >
         {conflicts.length > 0 && (
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
                         <Card size="small" title="现有值" style={{ backgroundColor: '#fff2e8' }}>
                           <div style={{ marginBottom: 8 }}>
                             <Text strong style={{ fontSize: 16 }}>{conflict.currentValue}</Text>
                           </div>
                           <Descriptions size="small" column={1}>
                             <Descriptions.Item label="来源">{conflict.currentSource}</Descriptions.Item>
                             <Descriptions.Item label="录入时间">2024-01-10</Descriptions.Item>
                             <Descriptions.Item label="录入人">系统自动</Descriptions.Item>
                           </Descriptions>
                         </Card>
                       </Col>
                       <Col span={10}>
                         <Card size="small" title="新值" style={{ backgroundColor: '#f6ffed' }}>
                           <div style={{ marginBottom: 8 }}>
                             <Text strong style={{ fontSize: 16 }}>{conflict.newValue}</Text>
                           </div>
                           <Descriptions size="small" column={1}>
                             <Descriptions.Item label="来源">{conflict.newSource}</Descriptions.Item>
                             <Descriptions.Item label="AI置信度">{conflict.aiConfidence}%</Descriptions.Item>
                             <Descriptions.Item label="冲突类型">{conflict.conflictType}</Descriptions.Item>
                           </Descriptions>
                         </Card>
                       </Col>
                       <Col span={4}>
                         <div style={{ textAlign: 'center' }}>
                           <Text strong>字段: {conflict.field}</Text>
                           <div style={{ marginTop: 8 }}>
                             <Button 
                               type="primary" 
                               size="small"
                               onClick={() => handleResolveConflict(conflict.id, 'new')}
                             >
                               采用新值
                             </Button>
                           </div>
                           <div style={{ marginTop: 4 }}>
                             <Button 
                               size="small"
                               onClick={() => handleResolveConflict(conflict.id, 'current')}
                             >
                               保留现有值
                             </Button>
                           </div>
                         </div>
                       </Col>
                     </Row>
                     
                     <div style={{ marginTop: 12, padding: 12, backgroundColor: '#e6f7ff', borderRadius: 4 }}>
                       <Space>
                         <UserOutlined style={{ color: '#1677ff' }} />
                         <Text strong style={{ color: '#1677ff' }}>AI建议:</Text>
                       </Space>
                       <div style={{ marginTop: 4 }}>
                         <Text>{conflict.aiReason}</Text>
                       </div>
                     </div>
                   </div>
                 </List.Item>
               )}
             />
           </div>
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
         width={900}
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
     </div>
   )
 }
 
 export default PatientDetail