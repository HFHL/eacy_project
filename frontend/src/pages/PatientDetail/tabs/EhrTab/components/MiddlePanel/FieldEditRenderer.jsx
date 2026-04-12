/**
 * 智能字段编辑组件
 * 根据字段的uiType渲染不同的编辑组件
 */
import React from 'react'
import {
  Input,
  InputNumber,
  Select,
  DatePicker,
  Radio,
  Checkbox,
  Button
} from 'antd'
import {
  CheckCircleOutlined,
  CloseOutlined
} from '@ant-design/icons'
import dayjs from 'dayjs'

const { TextArea } = Input

const FieldEditRenderer = ({
  // 字段数据
  field,
  
  // 编辑状态
  value,
  onChange,
  
  // 事件处理
  onSave,
  onCancel,
  
  // 样式配置
  getEhrConfidenceColor
}) => {
  
  // 获取字段选项数据
  const getFieldOptions = (field) => {
    const optionsMap = {
      '性别': [
        { label: '男', value: '男' },
        { label: '女', value: '女' }
      ],
      '婚姻状况': [
        { label: '未婚', value: '未婚' },
        { label: '已婚', value: '已婚' },
        { label: '离异', value: '离异' },
        { label: '丧偶', value: '丧偶' }
      ],
      '教育水平': [
        { label: '小学', value: '小学' },
        { label: '初中', value: '初中' },
        { label: '高中', value: '高中' },
        { label: '大专', value: '大专' },
        { label: '本科', value: '本科' },
        { label: '硕士', value: '硕士' },
        { label: '博士', value: '博士' }
      ],
      '民族': [
        { label: '汉族', value: '汉族' },
        { label: '蒙古族', value: '蒙古族' },
        { label: '回族', value: '回族' },
        { label: '藏族', value: '藏族' },
        { label: '其他', value: '其他' }
      ],
      '医保类型': [
        { label: '城镇职工医保', value: '城镇职工医保' },
        { label: '城镇居民医保', value: '城镇居民医保' },
        { label: '新农合', value: '新农合' },
        { label: '自费', value: '自费' },
        { label: '其他', value: '其他' }
      ],
      '吸烟史_状态': [
        { label: '从不吸烟', value: '从不吸烟' },
        { label: '已戒烟', value: '已戒烟' },
        { label: '现在吸烟', value: '现在吸烟' }
      ],
      '饮酒史_状态': [
        { label: '从不饮酒', value: '从不饮酒' },
        { label: '已戒酒', value: '已戒酒' },
        { label: '现在饮酒', value: '现在饮酒' }
      ],
      '住院科室': [
        { label: '内科', value: '内科' },
        { label: '外科', value: '外科' },
        { label: '呼吸内科', value: '呼吸内科' },
        { label: '心内科', value: '心内科' },
        { label: '消化内科', value: '消化内科' },
        { label: '神经内科', value: '神经内科' },
        { label: '肿瘤科', value: '肿瘤科' },
        { label: 'ICU', value: 'ICU' },
        { label: '急诊科', value: '急诊科' }
      ]
    }
    return optionsMap[field.name] || []
  }

  // 处理值变化
  const handleValueChange = (newValue) => {
    onChange(newValue)
  }

  // 处理日期值转换
  const getDateValue = () => {
    if (!value) return null
    return dayjs(value)
  }

  // 处理日期变化
  const handleDateChange = (date) => {
    const dateString = date ? date.format('YYYY-MM-DD') : ''
    onChange(dateString)
  }

  // 处理复选框变化
  const handleCheckboxChange = (e) => {
    onChange(e.target.checked ? 'true' : 'false')
  }

  // 根据uiType渲染编辑组件
  const renderEditComponent = () => {
    switch (field.uiType) {
      case 'text':
        return (
          <Input
            value={value}
            onChange={(e) => handleValueChange(e.target.value)}
            onPressEnter={() => onSave(field.apiFieldId || field.id)}
            autoFocus
            style={{ 
              fontSize: 13,
              border: `1px solid ${getEhrConfidenceColor(field.confidence)}`,
              borderRadius: 4
            }}
          />
        )
      
      case 'textarea':
        return (
          <TextArea
            value={value}
            onChange={(e) => handleValueChange(e.target.value)}
            rows={3}
            autoFocus
            style={{ 
              fontSize: 13,
              border: `1px solid ${getEhrConfidenceColor(field.confidence)}`,
              borderRadius: 4
            }}
          />
        )
      
      case 'number':
        return (
          <InputNumber
            value={value ? Number(value.replace(/[^\d.]/g, '')) : null}
            onChange={handleValueChange}
            onPressEnter={() => onSave(field.apiFieldId || field.id)}
            autoFocus
            controls={false}
            style={{ 
              width: '100%',
              fontSize: 13,
              border: `1px solid ${getEhrConfidenceColor(field.confidence)}`,
              borderRadius: 4
            }}
          />
        )
      
      case 'select':
        const options = getFieldOptions(field)
        return (
          <Select
            value={value}
            onChange={handleValueChange}
            options={options}
            placeholder="请选择"
            style={{ 
              width: '100%',
              fontSize: 13
            }}
            dropdownStyle={{ fontSize: 13 }}
          />
        )
      
      case 'radio':
        const radioOptions = getFieldOptions(field)
        return (
          <Radio.Group
            value={value}
            onChange={(e) => handleValueChange(e.target.value)}
            options={radioOptions}
            style={{ fontSize: 13 }}
          />
        )
      
      case 'checkbox':
        return (
          <Checkbox
            checked={value === 'true' || value === true}
            onChange={handleCheckboxChange}
            style={{ fontSize: 13 }}
          >
            是
          </Checkbox>
        )
      
      case 'datepicker':
      case 'date-picker':
      case 'date':
        return (
          <DatePicker
            value={getDateValue()}
            onChange={handleDateChange}
            format="YYYY-MM-DD"
            style={{ 
              width: '100%',
              fontSize: 13
            }}
          />
        )
      
      default:
        // 默认使用文本输入
        return (
          <Input
            value={value}
            onChange={(e) => handleValueChange(e.target.value)}
            onPressEnter={() => onSave(field.apiFieldId || field.id)}
            autoFocus
            style={{ 
              fontSize: 13,
              border: `1px solid ${getEhrConfidenceColor(field.confidence)}`,
              borderRadius: 4
            }}
          />
        )
    }
  }

  return (
    <div style={{ display: 'flex', gap: 4, alignItems: 'flex-start' }}>
      <div style={{ flex: 1 }}>
        {renderEditComponent()}
      </div>
      <Button 
        type="text" 
        size="small" 
        icon={<CheckCircleOutlined />}
        onClick={() => onSave(field.apiFieldId || field.id)}
        style={{ color: '#52c41a', padding: '0 4px', flexShrink: 0 }}
      />
      <Button 
        type="text" 
        size="small" 
        icon={<CloseOutlined />}
        onClick={onCancel}
        style={{ color: '#ff4d4f', padding: '0 4px', flexShrink: 0 }}
      />
    </div>
  )
}

export default FieldEditRenderer