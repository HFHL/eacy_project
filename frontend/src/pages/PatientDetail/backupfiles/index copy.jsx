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
  HistoryOutlined
} from '@ant-design/icons'

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
  const [aiMessages, setAiMessages] = useState([
    {
      type: 'ai',
      content: '您好！我是AI助手，可以帮您查询患者张三的相关信息。您可以问我关于患者的检查结果、用药情况、诊断信息等问题。',
      timestamp: '2024-01-17 18:00:00'
    }
  ])
  const [aiInput, setAiInput] = useState('')
  const [summaryEditMode, setSummaryEditMode] = useState(false)
  const [summaryContent, setSummaryContent] = useState('')
  const [summaryGenerating, setSummaryGenerating] = useState(false)
  const [form] = Form.useForm()
  const [conflictForm] = Form.useForm()
  const [summaryForm] = Form.useForm()

  // 模拟AI病情综述数据
  const [aiSummary, setAiSummary] = useState({
    content: `**患者基本情况**
张三，男性，45岁，肿瘤科患者，主要诊断为肺腺癌[1]、高血压[2]。

**既往史**
• 个人史：吸烟史20年，每日1包，已戒烟2年[1]
• 家族史：父亲有肺癌病史，母亲有高血压病史[1]
• 过敏史：青霉素过敏[2]

**诊疗时间线**
**2024-01-08** - 初次就诊
• 用药记录建立，开始吉非替尼靶向治疗250mg/日[4]

**2024-01-10** - 病理确诊  
• 病理报告确诊肺腺癌，分化程度中等[3]
• 入院治疗，主治医生李主任

**2024-01-12** - 影像学检查
• 胸部CT显示左肺下叶结节，大小约2.5cm[2]
• 未见明显转移征象

**2024-01-15** - 实验室检查
• 血常规：白细胞6.5×10⁹/L（正常），红细胞4.2×10¹²/L（略低），血红蛋白125g/L（略低）[1]
• 提示轻度贫血，需要关注

**当前诊疗状况**
患者目前病情稳定，正在接受吉非替尼靶向治疗，配合度良好。建议定期复查血常规和胸部CT，监测治疗效果和副作用。`,
    lastUpdate: '2024-01-17 15:30',
    confidence: 92,
    sourceDocuments: [
      { id: 'doc1', name: '血常规报告_20240115.pdf', ref: '[1]' },
      { id: 'doc2', name: 'CT影像_20240112.jpg', ref: '[2]' },
      { id: 'doc3', name: '病理报告_20240110.pdf', ref: '[3]' },
      { id: 'doc4', name: '用药记录.xlsx', ref: '[4]' }
    ]
  })

  // 模拟患者基本信息
  const [patientInfo, setPatientInfo] = useState({
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
  })

  // 模拟文档数据
  const documents = [
    {
      id: 'doc1',
      name: '血常规报告_20240115.pdf',
      type: 'PDF',
      category: '检验报告',
      size: '2.3MB',
      uploadDate: '2024-01-15',
      status: 'extracted',
      confidence: 'high',
      thumbnail: null,
      extractedData: [
        { field: '患者姓名', value: '张三', confidence: 'high' },
        { field: '检查日期', value: '2024-01-15', confidence: 'high' },
        { field: '白细胞计数', value: '6.5×10⁹/L', confidence: 'high' },
        { field: '红细胞计数', value: '4.2×10¹²/L', confidence: 'medium' },
        { field: '血红蛋白', value: '125g/L', confidence: 'high' }
      ]
    },
    {
      id: 'doc2',
      name: 'CT影像_20240112.jpg',
      type: 'Image',
      category: '影像检查',
      size: '5.2MB',
      uploadDate: '2024-01-12',
      status: 'extracted',
      confidence: 'medium',
      thumbnail: '/api/thumbnails/doc2.jpg',
      extractedData: [
        { field: '检查部位', value: '胸部CT', confidence: 'high' },
        { field: '检查日期', value: '2024-01-12', confidence: 'high' },
        { field: '影像所见', value: '左肺下叶结节', confidence: 'medium' }
      ]
    },
    {
      id: 'doc3',
      name: '病理报告_20240110.pdf',
      type: 'PDF',
      category: '病理检查',
      size: '1.8MB',
      uploadDate: '2024-01-10',
      status: 'pending',
      confidence: null,
      thumbnail: null,
      extractedData: []
    },
    {
      id: 'doc4',
      name: '用药记录.xlsx',
      type: 'Excel',
      category: '用药信息',
      size: '0.5MB',
      uploadDate: '2024-01-08',
      status: 'extracted',
      confidence: 'high',
      thumbnail: null,
      extractedData: [
        { field: '药物名称', value: '吉非替尼', confidence: 'high' },
        { field: '用药剂量', value: '250mg', confidence: 'high' },
        { field: '用药频次', value: '每日一次', confidence: 'high' }
      ]
    }
  ]

  // 模拟冲突数据
  const conflicts = [
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
  const changeLogs = [
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
    const config = {
      high: { color: 'green', text: '高置信度' },
      medium: { color: 'orange', text: '中置信度' },
      low: { color: 'red', text: '低置信度' }
    }
    const { color, text } = config[confidence]
    return <Tag color={color} size="small">{text}</Tag>
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
                  基本信息
                </Space>
              ),
              children: (
                <Row gutter={24}>
                  <Col span={12}>
                    <Card size="small" title="个人信息" style={{ marginBottom: 16 }}>
                      <Descriptions size="small" column={1}>
                        <Descriptions.Item label="患者ID">{patientInfo.id}</Descriptions.Item>
                        <Descriptions.Item label="姓名">{patientInfo.name}</Descriptions.Item>
                        <Descriptions.Item label="性别">{patientInfo.gender}</Descriptions.Item>
                        <Descriptions.Item label="年龄">{patientInfo.age}岁</Descriptions.Item>
                        <Descriptions.Item label="出生日期">{patientInfo.birthDate}</Descriptions.Item>
                        <Descriptions.Item label="联系电话">{patientInfo.phone}</Descriptions.Item>
                        <Descriptions.Item label="身份证号">{patientInfo.idCard}</Descriptions.Item>
                        <Descriptions.Item label="住址">{patientInfo.address}</Descriptions.Item>
                      </Descriptions>
                    </Card>

                    <Card size="small" title="医疗信息">
                      <Descriptions size="small" column={1}>
                        <Descriptions.Item label="入院日期">{patientInfo.admissionDate}</Descriptions.Item>
                        <Descriptions.Item label="科室">{patientInfo.department}</Descriptions.Item>
                        <Descriptions.Item label="主治医生">{patientInfo.doctor}</Descriptions.Item>
                        <Descriptions.Item label="主要诊断">
                          <Space wrap>
                            {patientInfo.diagnosis.map(d => (
                              <Tag key={d} color="blue">{d}</Tag>
                            ))}
                          </Space>
                        </Descriptions.Item>
                        <Descriptions.Item label="备注">
                          {patientInfo.notes || '暂无备注'}
                        </Descriptions.Item>
                      </Descriptions>
                    </Card>
                  </Col>
                  <Col span={12}>

                  </Col>
                </Row>
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
              <Form.Item label="入院日期" name="admissionDate">
                <DatePicker 
                  style={{ width: '100%' }} 
                  placeholder="选择入院日期"
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
                <Col span={24}><Checkbox value="basic">基本信息</Checkbox></Col>
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
                        <Text strong>基本信息</Text>
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