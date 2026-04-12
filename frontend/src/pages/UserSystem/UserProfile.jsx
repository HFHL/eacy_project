import React, { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSelector, useDispatch } from 'react-redux'
import {
  Row,
  Col,
  Card,
  Typography,
  Button,
  Space,
  Avatar,
  Statistic,
  Progress,
  List,
  Tag,
  Descriptions,
  Form,
  Input,
  Select,
  Cascader,
  TreeSelect,
  Switch,
  Modal,
  Alert,
  Divider,
  Timeline,
  Badge,
  message,
  Spin
} from 'antd'
import {
  UserOutlined,
  EditOutlined,
  CreditCardOutlined,
  BarChartOutlined,
  SettingOutlined,
  GiftOutlined,
  HistoryOutlined,
  WalletOutlined,
  TrophyOutlined,
  CalendarOutlined,
  FileTextOutlined,
  TeamOutlined,
  ExperimentOutlined
} from '@ant-design/icons'
import { getCurrentUser, updateUserInfo } from '../../api/auth'
import { getDepartmentTree } from '../../api/patient'
import { updateUserInfo as updateUserInfoAction } from '../../store/slices/userSlice'

const { Title, Text } = Typography
const { TextArea } = Input

const UserProfile = () => {
  const navigate = useNavigate()
  const dispatch = useDispatch()
  const [editModalVisible, setEditModalVisible] = useState(false)
  // const [rechargeModalVisible, setRechargeModalVisible] = useState(false) // 积分管理已注释
  const [loading, setLoading] = useState(true)
  const [form] = Form.useForm()

  // 从 Redux store 获取真实的用户信息
  const storeUserInfo = useSelector(state => state.user.userInfo)
  const loginTime = useSelector(state => state.user.loginTime)
  
  // 本地用户信息状态（用于显示和编辑）
  const [userInfo, setUserInfo] = useState(null)
  // 科室树数据
  const [departmentTree, setDepartmentTree] = useState([])
  
  // 页面加载时获取最新用户信息
  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true)
        
        // 并行获取用户信息和科室树
        const [userResponse, deptResponse] = await Promise.all([
          getCurrentUser(),
          getDepartmentTree()
        ])
        
        console.log('用户信息响应:', userResponse)
        console.log('科室树响应:', deptResponse)
        
        if (deptResponse.success) {
          setDepartmentTree(deptResponse.data || [])
        }
        
        if (userResponse.success && userResponse.data) {
          const userData = userResponse.data
          console.log('获取到的用户数据:', userData)
          
          // 更新本地状态
          setUserInfo({
            id: userData.id || '',
            name: userData.name || '',
            email: userData.email || '',
            phone: userData.phone || '',
            avatar: userData.avatar || null,
            organization: userData.organization || '',
            department: userData.department || '',
            position: userData.job_title || '',
            researchFields: userData.research_fields || [],
            registeredAt: userData.created_at ? new Date(userData.created_at).toLocaleDateString() : '',
            lastLoginAt: userData.login_at ? new Date(userData.login_at).toLocaleString() : '',
            loginDays: userData.accumulated_days || 0,
            status: userData.status || 'active'
          })
          
          // 更新使用统计（从后端获取的真实数据）
          setUsageStats({
            patientsManaged: userData.patients_managed || 0,
            projectsCreated: userData.projects_created || 0,
            documentsUploaded: userData.documents_uploaded || 0,
            monthlyActive: userData.current_month_active_days || 0,
            totalSessions: userData.total_logins || 0
          })
          
          // 同步更新 Redux store
          dispatch(updateUserInfoAction(userData))
        }
      } catch (error) {
        console.error('加载数据失败:', error)
        message.error('加载用户信息失败')
      } finally {
        setLoading(false)
      }
    }
    
    fetchData()
  }, []) // 只在组件挂载时执行一次

  // 积分管理模块已注释：模拟积分信息
  // const [creditInfo, setCreditInfo] = useState({
  //   current: 8520,
  //   totalEarned: 15000,
  //   totalSpent: 6480,
  //   monthlyConsumption: 2480,
  //   estimatedDays: 15,
  //   status: 'sufficient',
  //   recentTransactions: [
  //     { id: 1, type: 'spend', amount: -25, description: 'AI专项抽取 - 张三病理报告', time: '2024-01-17 14:30' },
  //     { id: 2, type: 'spend', amount: -8, description: 'AI基础抽取 - 李四血常规', time: '2024-01-17 10:15' },
  //     { id: 3, type: 'earn', amount: 2500, description: '积分充值 - 标准包', time: '2024-01-15 16:20' },
  //     { id: 4, type: 'spend', amount: -15, description: 'AI专项抽取 - 王五CT影像', time: '2024-01-15 09:30' }
  //   ]
  // })

  // 模拟使用统计
  const [usageStats, setUsageStats] = useState({
    patientsManaged: 0,
    projectsCreated: 0,
    documentsUploaded: 0,
    monthlyActive: 0,
    totalSessions: 0
  })

  // 积分管理已注释：充值套餐
  // const rechargePackages = [
  //   { id: 'basic', name: '体验包', credits: 5000, bonus: 0, price: 50, popular: false },
  //   { id: 'standard', name: '标准包', credits: 25000, bonus: 2500, price: 200, popular: true },
  //   { id: 'professional', name: '专业包', credits: 70000, bonus: 10500, price: 500, popular: false },
  //   { id: 'enterprise', name: '企业包', credits: 150000, bonus: 30000, price: 1000, popular: false }
  // ]

  // 编辑个人信息
  const handleEditProfile = () => {
    form.setFieldsValue(userInfo)
    setEditModalVisible(true)
  }

  // 保存个人信息
  const handleSaveProfile = async () => {
    try {
      const values = await form.validateFields()
      setLoading(true)
      
      // 准备后端需要的数据格式
      const updateData = {
        name: values.name,
        email: values.email,
        phone: values.phone,
        job_title: values.position,
        organization: values.organization,
        department: values.department,
        research_fields: values.researchFields
      }
      
      const response = await updateUserInfo(updateData)
      
      if (response.success && response.data) {
        const userData = response.data
        // 更新本地状态
        setUserInfo({
          ...userInfo,
          name: userData.name,
          email: userData.email,
          phone: userData.phone,
          organization: userData.organization,
          department: userData.department,
          position: userData.job_title,
          researchFields: userData.research_fields || [],
        })
        
        // 同步更新 Redux store
        dispatch(updateUserInfoAction(userData))
        
        setEditModalVisible(false)
        message.success('个人信息已更新')
      } else {
        message.error(response.message || '更新失败')
      }
    } catch (error) {
      console.error('保存个人信息失败:', error)
      message.error('请检查输入信息或网络连接')
    } finally {
      setLoading(false)
    }
  }

  // 积分管理已注释：积分充值与状态
  // const handleRecharge = (packageId) => {
  //   const selectedPackage = rechargePackages.find(p => p.id === packageId)
  //   message.success(`已选择${selectedPackage.name}，跳转到支付页面...`)
  //   setRechargeModalVisible(false)
  // }
  // const getCreditStatus = () => {
  //   if (creditInfo.current < 1000) return { color: '#ff4d4f', text: '余额不足' }
  //   if (creditInfo.current < 3000) return { color: '#faad14', text: '余额偏低' }
  //   return { color: '#52c41a', text: '余额充足' }
  // }
  // const creditStatus = getCreditStatus()

  // 加载状态或没有用户信息
  if (loading || !userInfo) {
    return (
      <div className="page-container fade-in" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: 400 }}>
        <Spin size="large" tip="加载用户信息..." />
      </div>
    )
  }

  return (
    <div className="page-container fade-in">
      {/* 用户概览卡片 */}
      <Card style={{ marginBottom: 24 }}>
        <Row gutter={24} align="middle">
          <Col>
            <Avatar size={80} icon={<UserOutlined />} />
          </Col>
          <Col flex={1}>
            <div style={{ marginBottom: 8 }}>
              <Text type="secondary" style={{ marginRight: 8 }}>姓名</Text>
              <Space align="baseline">
                <Title level={4} style={{ margin: 0 }}>{userInfo.name}</Title>
                <Tag color="green">活跃用户</Tag>
              </Space>
            </div>
            <div style={{ marginBottom: 8 }}>
              <Text type="secondary" style={{ marginRight: 8 }}>职位职称</Text>
              <Text>{userInfo.position || '暂未设置'}</Text>
            </div>
            <div style={{ marginBottom: 8 }}>
              <Text type="secondary" style={{ marginRight: 8 }}>工作单位 · 科室</Text>
              <Text>
                {userInfo.organization || userInfo.department
                  ? `${userInfo.organization || '暂未设置'} · ${userInfo.department || '暂未设置'}`
                  : '暂未设置'}
              </Text>
            </div>
            <div>
              <Space size={16} wrap>
                <span>
                  <Text type="secondary">注册时间：</Text>
                  <Text>{userInfo.registeredAt || '--'}</Text>
                </span>
                <span>
                  <Text type="secondary">累积使用：</Text>
                  <Text>{userInfo.loginDays}天</Text>
                </span>
                <span>
                  <Text type="secondary">最后登录：</Text>
                  <Text>{userInfo.lastLoginAt || '暂无'}</Text>
                </span>
              </Space>
            </div>
          </Col>
          <Col>
            <Space direction="vertical">
              <Button type="primary" icon={<EditOutlined />} onClick={handleEditProfile}>
                编辑资料
              </Button>
              <Button icon={<SettingOutlined />} onClick={() => navigate('/user/settings')}>
                系统设置
              </Button>
            </Space>
          </Col>
        </Row>
      </Card>

      <Row gutter={24}>
        {/* 左侧：积分管理（已注释） */}
        <Col span={16}>
          {/* 积分管理模块已注释
          <Card 
            title={
              <Space>
                <WalletOutlined />
                <Text strong>积分管理</Text>
              </Space>
            }
            extra={
              <Button 
                type="primary" 
                icon={<CreditCardOutlined />}
                onClick={() => setRechargeModalVisible(true)}
              >
                立即充值
              </Button>
            }
            style={{ marginBottom: 24 }}
          >
            <Row gutter={24}>
              <Col span={8}>
                <Statistic
                  title="当前积分"
                  value={creditInfo.current}
                  suffix="分"
                  valueStyle={{ color: creditStatus.color }}
                />
                <div style={{ marginTop: 8 }}>
                  <Tag color={creditStatus.color === '#52c41a' ? 'green' : creditStatus.color === '#faad14' ? 'orange' : 'red'}>
                    {creditStatus.text}
                  </Tag>
                </div>
              </Col>
              <Col span={8}>
                <Statistic
                  title="本月消耗"
                  value={creditInfo.monthlyConsumption}
                  suffix="分"
                  valueStyle={{ color: '#1677ff' }}
                />
                <div style={{ marginTop: 8 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    预计可用{creditInfo.estimatedDays}天
                  </Text>
                </div>
              </Col>
              <Col span={8}>
                <Statistic
                  title="累计获得"
                  value={creditInfo.totalEarned}
                  suffix="分"
                  valueStyle={{ color: '#52c41a' }}
                />
                <div style={{ marginTop: 8 }}>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    累计消耗: {creditInfo.totalSpent}分
                  </Text>
                </div>
              </Col>
            </Row>

            <Divider />

            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <Text strong>最近交易记录</Text>
                <Button type="link" onClick={() => navigate('/user/credits')}>
                  查看全部
                </Button>
              </div>
              <List
                size="small"
                dataSource={creditInfo.recentTransactions}
                renderItem={item => (
                  <List.Item>
                    <List.Item.Meta
                      avatar={
                        <div style={{
                          width: 32,
                          height: 32,
                          borderRadius: '50%',
                          background: item.type === 'earn' ? '#f6ffed' : '#fff2e8',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center'
                        }}>
                          {item.type === 'earn' ? (
                            <GiftOutlined style={{ color: '#52c41a' }} />
                          ) : (
                            <FileTextOutlined style={{ color: '#faad14' }} />
                          )}
                        </div>
                      }
                      title={
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <Text>{item.description}</Text>
                          <Text strong style={{ color: item.type === 'earn' ? '#52c41a' : '#ff4d4f' }}>
                            {item.type === 'earn' ? '+' : ''}{item.amount}分
                          </Text>
                        </div>
                      }
                      description={
                        <Text type="secondary" style={{ fontSize: 11 }}>
                          {item.time}
                        </Text>
                      }
                    />
                  </List.Item>
                )}
              />
            </div>
          </Card>
          */}

          {/* 使用统计 */}
          <Card
            title={
              <Space>
                <BarChartOutlined />
                <Text strong>使用统计</Text>
              </Space>
            }
          >
            <Row gutter={24}>
              <Col span={8}>
                <div style={{ textAlign: 'center', padding: 16 }}>
                  <div style={{ fontSize: 24, fontWeight: 'bold', color: '#1677ff' }}>
                    {usageStats.patientsManaged}
                  </div>
                  <div style={{ color: '#999', marginTop: 4 }}>管理患者</div>
                </div>
              </Col>
              <Col span={8}>
                <div style={{ textAlign: 'center', padding: 16 }}>
                  <div style={{ fontSize: 24, fontWeight: 'bold', color: '#52c41a' }}>
                    {usageStats.projectsCreated}
                  </div>
                  <div style={{ color: '#999', marginTop: 4 }}>创建项目</div>
                </div>
              </Col>
              <Col span={8}>
                <div style={{ textAlign: 'center', padding: 16 }}>
                  <div style={{ fontSize: 24, fontWeight: 'bold', color: '#faad14' }}>
                    {usageStats.documentsUploaded}
                  </div>
                  <div style={{ color: '#999', marginTop: 4 }}>上传文档</div>
                </div>
              </Col>
            </Row>

            <Divider />

            <Row gutter={24}>
              <Col span={12}>
                <Descriptions size="small" column={1}>
                  <Descriptions.Item label="本月活跃天数">{usageStats.monthlyActive}天</Descriptions.Item>
                  <Descriptions.Item label="总登录次数">{usageStats.totalSessions}次</Descriptions.Item>
                </Descriptions>
              </Col>
              <Col span={12}>
                <div>
                  <Text strong style={{ fontSize: 12 }}>本月活跃度</Text>
                  <Progress 
                    percent={Math.round((usageStats.monthlyActive / 30) * 100)} 
                    size="small" 
                    strokeColor="#52c41a"
                    style={{ marginTop: 8 }}
                  />
                </div>
              </Col>
            </Row>
          </Card>
        </Col>

        {/* 右侧：个人信息 */}
        <Col span={8}>
          <Card
            title={
              <Space>
                <UserOutlined />
                <Text strong>个人信息</Text>
              </Space>
            }
            style={{ marginBottom: 24 }}
          >
            <Descriptions size="small" column={1}>
              <Descriptions.Item label="用户ID">{userInfo.id}</Descriptions.Item>
              <Descriptions.Item label="姓名">{userInfo.name}</Descriptions.Item>
              <Descriptions.Item label="邮箱">{userInfo.email}</Descriptions.Item>
              <Descriptions.Item label="手机号">
                {userInfo.phone ? userInfo.phone : <Text type="secondary">暂未设置</Text>}
              </Descriptions.Item>
              <Descriptions.Item label="工作单位">
                {userInfo.organization ? userInfo.organization : <Text type="secondary">暂未设置</Text>}
              </Descriptions.Item>
              <Descriptions.Item label="科室部门">
                {userInfo.department ? userInfo.department : <Text type="secondary">暂未设置</Text>}
              </Descriptions.Item>
              <Descriptions.Item label="职位职称">
                {userInfo.position ? userInfo.position : <Text type="secondary">暂未设置</Text>}
              </Descriptions.Item>
              <Descriptions.Item label="研究领域">
                <Space wrap>
                  {userInfo.researchFields && userInfo.researchFields.length > 0 ? (
                    userInfo.researchFields.map(field => (
                      <Tag key={field} color="blue" size="small">{field}</Tag>
                    ))
                  ) : (
                    <Text type="secondary">暂未设置</Text>
                  )}
                </Space>
              </Descriptions.Item>
            </Descriptions>
          </Card>

          {/* 快速操作 */}
          <Card title="快速操作">
            <Space direction="vertical" style={{ width: '100%' }}>
              <Button block icon={<TeamOutlined />} onClick={() => navigate('/patient/pool')}>
                患者数据池
              </Button>
              <Button block icon={<ExperimentOutlined />} onClick={() => navigate('/research/projects')}>
                科研项目
              </Button>
              <Button block icon={<FileTextOutlined />} onClick={() => navigate('/document/upload')}>
                文档上传
              </Button>
              {/* 积分管理模块已注释
              <Button block icon={<HistoryOutlined />} onClick={() => navigate('/user/credits')}>
                积分明细
              </Button>
              */}
            </Space>
          </Card>
        </Col>
      </Row>

      {/* 编辑个人信息弹窗 */}
      <Modal
        title="编辑个人信息"
        open={editModalVisible}
        onCancel={() => setEditModalVisible(false)}
        footer={[
          <Button key="cancel" onClick={() => setEditModalVisible(false)}>
            取消
          </Button>,
          <Button key="save" type="primary" onClick={handleSaveProfile}>
            保存
          </Button>
        ]}
        width={600}
      >
        <Form form={form} layout="vertical">
          <Row gutter={16}>
            <Col span={12}>
              <Form.Item label="姓名" name="name" rules={[{ required: true, message: '请输入姓名' }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="邮箱" name="email" rules={[{ required: true, type: 'email', message: '请输入有效邮箱' }]}>
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="手机号" name="phone">
                <Input />
              </Form.Item>
            </Col>
            <Col span={12}>
              <Form.Item label="职位职称" name="position">
                <Input />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item label="工作单位" name="organization">
                <Input />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item label="科室部门" name="department">
                <TreeSelect
                  showSearch
                  style={{ width: '100%' }}
                  dropdownStyle={{ maxHeight: 400, overflow: 'auto' }}
                  placeholder="请选择科室部门"
                  allowClear
                  treeDefaultExpandAll
                  treeData={departmentTree}
                  fieldNames={{
                    label: 'name',
                    value: 'name',
                    children: 'children'
                  }}
                />
              </Form.Item>
            </Col>
            <Col span={24}>
              <Form.Item label="研究领域" name="researchFields">
                <Select mode="tags" placeholder="选择或输入研究领域">
                  <Select.Option value="肿瘤研究">肿瘤研究</Select.Option>
                  <Select.Option value="心血管研究">心血管研究</Select.Option>
                  <Select.Option value="神经科学">神经科学</Select.Option>
                  <Select.Option value="临床试验">临床试验</Select.Option>
                </Select>
              </Form.Item>
            </Col>
          </Row>
        </Form>
      </Modal>

      {/* 积分管理模块已注释：积分充值弹窗
      <Modal
        title="积分充值"
        open={rechargeModalVisible}
        onCancel={() => setRechargeModalVisible(false)}
        footer={null}
        width={800}
      >
        <div style={{ marginBottom: 16 }}>
          <Alert
            message={`当前积分: ${creditInfo.current.toLocaleString()}分`}
            description={`本月消耗: ${creditInfo.monthlyConsumption.toLocaleString()}分，预计可用${creditInfo.estimatedDays}天`}
            type="info"
            showIcon
          />
        </div>

        <Row gutter={16}>
          {rechargePackages.map(pkg => (
            <Col span={6} key={pkg.id}>
              <Card
                size="small"
                style={{
                  textAlign: 'center',
                  border: pkg.popular ? '2px solid #1677ff' : '1px solid #d9d9d9',
                  position: 'relative'
                }}
              >
                {pkg.popular && (
                  <div style={{
                    position: 'absolute',
                    top: -8,
                    left: '50%',
                    transform: 'translateX(-50%)',
                    background: '#1677ff',
                    color: 'white',
                    padding: '2px 12px',
                    borderRadius: 10,
                    fontSize: 11
                  }}>
                    推荐
                  </div>
                )}
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 16, fontWeight: 'bold' }}>{pkg.name}</div>
                  <div style={{ fontSize: 24, fontWeight: 'bold', color: '#1677ff', margin: '8px 0' }}>
                    ¥{pkg.price}
                  </div>
                </div>
                <div style={{ marginBottom: 12 }}>
                  <div>💎 {pkg.credits.toLocaleString()}积分</div>
                  {pkg.bonus > 0 && (
                    <div style={{ color: '#52c41a', fontSize: 12 }}>
                      🎁 赠送{pkg.bonus.toLocaleString()}积分
                    </div>
                  )}
                </div>
                <Button 
                  type={pkg.popular ? 'primary' : 'default'} 
                  block
                  onClick={() => handleRecharge(pkg.id)}
                >
                  选择
                </Button>
              </Card>
            </Col>
          ))}
        </Row>

        <div style={{ marginTop: 16, textAlign: 'center' }}>
          <Text type="secondary" style={{ fontSize: 12 }}>
            💡 支持微信支付、支付宝、银行卡等多种支付方式
          </Text>
        </div>
      </Modal>
      */}
    </div>
  )
}

export default UserProfile