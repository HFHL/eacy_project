import React, { useEffect, useState } from 'react'
import {
  Card,
  Typography,
  Form,
  Switch,
  Select,
  Button,
  Divider,
  Space,
  message,
  Spin,
  Checkbox
} from 'antd'
import { SaveOutlined } from '@ant-design/icons'
import { useDispatch, useSelector } from 'react-redux'
import { getUserSettings, updateUserSettings, getDesensitizePatterns } from '../../api/auth'
import { setUserSettings } from '../../store/slices/userSlice'

const { Title, Text } = Typography

const DEFAULT_SETTINGS = {
  theme_mode: 'light',
  data_masking: true,
  auto_save: true,
  notification_system: true
}

const SystemSettings = () => {
  const dispatch = useDispatch()
  const userSettings = useSelector(state => state.user.userSettings)
  const isAuthenticated = useSelector(state => state.user.isAuthenticated)
  const [form] = Form.useForm()
  const [saving, setSaving] = useState(false)
  const [loadingSettings, setLoadingSettings] = useState(false)
  const [availablePatterns, setAvailablePatterns] = useState([])

  useEffect(() => {
    if (!isAuthenticated) return
    getDesensitizePatterns().then(res => {
      if (res?.success && res?.data?.patterns) {
        setAvailablePatterns(res.data.patterns)
      }
    }).catch(() => {})
  }, [isAuthenticated])

  useEffect(() => {
    if (!isAuthenticated) return
    if (userSettings != null) return
    const fetchSettings = async () => {
      setLoadingSettings(true)
      try {
        const res = await getUserSettings()
        if (res?.success && res?.data?.settings != null) {
          dispatch(setUserSettings(res.data.settings))
        }
      } catch (_) {}
      finally {
        setLoadingSettings(false)
      }
    }
    fetchSettings()
  }, [isAuthenticated, dispatch])

  useEffect(() => {
    if (userSettings === null && !loadingSettings) return
    const merged = { ...DEFAULT_SETTINGS, ...(userSettings || {}) }
    const desensitizePatterns = merged.desensitize_patterns || {}
    const enabledKeys = availablePatterns
      .filter(p => {
        const override = desensitizePatterns[p.key]
        return override ? override.enabled !== false : p.enabled
      })
      .map(p => p.key)

    form.setFieldsValue({
      theme_mode: merged.theme_mode ?? 'light',
      data_masking: merged.data_masking !== false,
      auto_save: merged.auto_save !== false,
      notification_system: merged.notification_system !== false,
      desensitize_pattern_keys: enabledKeys
    })
  }, [userSettings, loadingSettings, form, availablePatterns])

  const handleSave = async () => {
    try {
      const values = await form.validateFields()
      const enabledKeys = values.desensitize_pattern_keys || []
      const desensitizePatterns = {}
      availablePatterns.forEach(p => {
        desensitizePatterns[p.key] = { enabled: enabledKeys.includes(p.key) }
      })

      const payload = {
        theme_mode: values.theme_mode,
        data_masking: values.data_masking,
        auto_save: values.auto_save,
        notification_system: values.notification_system,
        desensitize_patterns: desensitizePatterns
      }
      setSaving(true)
      const res = await updateUserSettings(payload)
      if (res?.success) {
        const getRes = await getUserSettings()
        if (getRes?.success && getRes?.data?.settings != null) {
          dispatch(setUserSettings(getRes.data.settings))
        }
        message.success('保存成功')
      } else {
        message.error(res?.message || '保存失败')
      }
    } catch (err) {
      if (err?.errorFields) message.error('请检查表单')
    } finally {
      setSaving(false)
    }
  }

  const handleReset = () => {
    const defaultKeys = availablePatterns.filter(p => p.enabled).map(p => p.key)
    form.setFieldsValue({ ...DEFAULT_SETTINGS, desensitize_pattern_keys: defaultKeys })
    message.info('已恢复为默认值，请点击「保存设置」提交')
  }

  if (loadingSettings && userSettings === null) {
    return (
      <div className="page-container fade-in">
        <div className="page-header">
          <Title level={2} style={{ margin: 0 }}>系统设置</Title>
        </div>
        <div style={{ padding: 48, textAlign: 'center' }}>
          <Spin size="large" tip="加载设置中..." />
        </div>
      </div>
    )
  }

  return (
    <div className="page-container fade-in">
      <div className="page-header">
        <Title level={2} style={{ margin: 0 }}>
          系统设置
        </Title>
      </div>

      <Form form={form} layout="vertical" initialValues={DEFAULT_SETTINGS}>
        <Card title="界面设置" style={{ marginBottom: 24 }}>
          <Form.Item name="theme_mode" label="主题模式">
            <Select style={{ width: 200 }}>
              <Select.Option value="light">浅色模式</Select.Option>
              <Select.Option value="dark">深色模式</Select.Option>
            </Select>
          </Form.Item>
        </Card>

        <Card title="功能设置" style={{ marginBottom: 24 }}>
          <Form.Item name="auto_save" label="自动保存" valuePropName="checked">
            <Switch />
          </Form.Item>
          <Form.Item name="data_masking" label="数据脱敏显示" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Card>

        <Card title="OCR 脱敏设置" style={{ marginBottom: 24 }}>
          <Text type="secondary" style={{ display: 'block', marginBottom: 16 }}>
            上传文档进行 OCR 解析时，自动检测并脱敏以下类型的敏感信息。脱敏后的内容将替换原始 OCR 文本，同时在文档图片上对对应区域进行遮盖。
          </Text>
          <Form.Item name="desensitize_pattern_keys" label="启用的脱敏类型">
            <Checkbox.Group>
              <Space direction="vertical">
                {availablePatterns.map(p => (
                  <Checkbox key={p.key} value={p.key}>{p.name}</Checkbox>
                ))}
              </Space>
            </Checkbox.Group>
          </Form.Item>
        </Card>

        <Card title="通知设置">
          <Form.Item name="notification_system" label="系统消息" valuePropName="checked">
            <Switch />
          </Form.Item>
        </Card>
      </Form>

      <Divider />

      <Space>
        <Button type="primary" icon={<SaveOutlined />} onClick={handleSave} loading={saving}>
          保存设置
        </Button>
        <Button onClick={handleReset}>
          重置为默认
        </Button>
      </Space>
    </div>
  )
}

export default SystemSettings