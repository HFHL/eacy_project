/**
 * MiddlePanel组件测试页面
 * 验证新的组件化中间面板架构
 */
import React, { useState } from 'react'
import { Card, Button, Space, Typography, Tag } from 'antd'
import MiddlePanel from './components/MiddlePanel'
import { useEhrFieldEdit } from './hooks/useEhrFieldEdit'

const { Text } = Typography

const MiddlePanelTest = () => {
  // 使用字段编辑Hook
  const {
    editingEhrField,
    editingEhrValue,
    setEditingEhrValue,
    handleEhrFieldEdit,
    handleEhrSaveEdit,
    handleEhrCancelEdit
  } = useEhrFieldEdit()

  // 模拟当前选中的字段组
  const [selectedGroupType, setSelectedGroupType] = useState('normal') // 'normal', 'table', 'repeatable', 'empty'

  // 模拟字段组数据
  const mockFieldGroups = {
    normal: {
      name: '基本信息',
      repeatable: false,
      fields: [
        {
          id: 'field_1',
          name: '患者姓名',
          value: '张三',
          fieldType: 'fields',
          uiType: 'input',
          confidence: 'high',
          source: 'document_1.pdf',
          extractable: false,
          sensitive: false,
          editable: true
        },
        {
          id: 'field_2',
          name: '身份证号',
          value: '110101199001011234',
          fieldType: 'fields',
          uiType: 'input',
          confidence: 'medium',
          source: 'document_1.pdf',
          extractable: false,
          sensitive: true,
          editable: true
        },
        {
          id: 'field_3',
          name: '联系电话',
          value: '',
          fieldType: 'fields',
          uiType: 'input',
          confidence: 'low',
          source: '',
          extractable: true,
          sensitive: false,
          editable: true
        },
        {
          id: 'field_4',
          name: '出生日期',
          value: '1990-01-01',
          fieldType: 'fields',
          uiType: 'datepicker',
          confidence: 'high',
          source: 'document_1.pdf',
          extractable: false,
          sensitive: false,
          editable: true
        },
        {
          id: 'field_5',
          name: '婚姻状况',
          value: '已婚',
          fieldType: 'fields',
          uiType: 'select',
          confidence: 'medium',
          source: 'document_2.pdf',
          extractable: false,
          sensitive: false,
          editable: true
        },
        {
          id: 'field_6',
          name: '年龄',
          value: '45',
          fieldType: 'fields',
          uiType: 'number',
          confidence: 'high',
          source: 'document_1.pdf',
          extractable: false,
          sensitive: false,
          editable: true
        },
        {
          id: 'field_7',
          name: '性别',
          value: '男',
          fieldType: 'fields',
          uiType: 'radio',
          confidence: 'high',
          source: 'document_1.pdf',
          extractable: false,
          sensitive: false,
          editable: true
        },
        {
          id: 'field_8',
          name: '是否住院',
          value: 'true',
          fieldType: 'fields',
          uiType: 'checkbox',
          confidence: 'medium',
          source: 'document_2.pdf',
          extractable: false,
          sensitive: false,
          editable: true
        },
        {
          id: 'field_9',
          name: '病史描述',
          value: '患者既往有高血压病史5年，血压控制良好',
          fieldType: 'fields',
          uiType: 'textarea',
          confidence: 'high',
          source: 'document_3.pdf',
          extractable: false,
          sensitive: false,
          editable: true
        }
      ]
    },
    table: {
      name: '检验结果',
      repeatable: false,
      fields: [
        {
          id: 'table_field_1',
          name: '血常规检查',
          fieldType: 'table_fields',
          confidence: 'high',
          tableData: [
            {
              id: 1,
              '指标名称（中文）': '白细胞计数',
              '检测值': '6.5',
              '参考范围': '3.5-9.5',
              '单位': '10^9/L',
              '是否异常': false,
              '异常标志': ''
            },
            {
              id: 2,
              '指标名称（中文）': '红细胞计数',
              '检测值': '4.2',
              '参考范围': '4.3-5.8',
              '单位': '10^12/L',
              '是否异常': true,
              '异常标志': '↓'
            }
          ]
        }
      ]
    },
    repeatable: {
      name: '住院记录',
      repeatable: true,
      records: [
        {
          id: 'record_1',
          fields: [
            {
              id: 'rep_field_1',
              name: '住院日期',
              value: '2024-01-15',
              fieldType: 'fields',
              uiType: 'datepicker',
              confidence: 'high',
              source: 'document_1.pdf',
              editable: true
            },
            {
              id: 'rep_field_2',
              name: '出院日期',
              value: '2024-01-20',
              fieldType: 'fields',
              uiType: 'datepicker',
              confidence: 'high',
              source: 'document_1.pdf',
              editable: true
            },
            {
              id: 'rep_field_3',
              name: '住院科室',
              value: '呼吸内科',
              fieldType: 'fields',
              uiType: 'select',
              confidence: 'high',
              source: 'document_1.pdf',
              editable: true
            },
            {
              id: 'rep_field_4',
              name: '住院天数',
              value: '5',
              fieldType: 'fields',
              uiType: 'number',
              confidence: 'high',
              source: 'document_1.pdf',
              editable: true
            },
            {
              id: 'rep_field_5',
              name: '住院原因',
              value: '肺部感染治疗',
              fieldType: 'fields',
              uiType: 'textarea',
              confidence: 'medium',
              source: 'document_1.pdf',
              editable: true
            },
            {
              id: 'rep_field_6',
              name: '是否手术',
              value: 'false',
              fieldType: 'fields',
              uiType: 'checkbox',
              confidence: 'high',
              source: 'document_1.pdf',
              editable: true
            }
          ]
        },
        {
          id: 'record_2',
          fields: [
            {
              id: 'rep_field_7',
              name: '住院日期',
              value: '2024-02-10',
              fieldType: 'fields',
              uiType: 'datepicker',
              confidence: 'medium',
              source: 'document_2.pdf',
              editable: true
            },
            {
              id: 'rep_field_8',
              name: '出院日期',
              value: '2024-02-15',
              fieldType: 'fields',
              uiType: 'datepicker',
              confidence: 'medium',
              source: 'document_2.pdf',
              editable: true
            },
            {
              id: 'rep_field_9',
              name: '住院科室',
              value: '心内科',
              fieldType: 'fields',
              uiType: 'select',
              confidence: 'medium',
              source: 'document_2.pdf',
              editable: true
            },
            {
              id: 'rep_field_10',
              name: '住院天数',
              value: '7',
              fieldType: 'fields',
              uiType: 'number',
              confidence: 'medium',
              source: 'document_2.pdf',
              editable: true
            },
            {
              id: 'rep_field_11',
              name: '住院原因',
              value: '心律不齐检查',
              fieldType: 'fields',
              uiType: 'textarea',
              confidence: 'medium',
              source: 'document_2.pdf',
              editable: true
            },
            {
              id: 'rep_field_12',
              name: '是否手术',
              value: 'true',
              fieldType: 'fields',
              uiType: 'checkbox',
              confidence: 'medium',
              source: 'document_2.pdf',
              editable: true
            }
          ]
        }
      ]
    },
    empty: {
      name: '暂无数据',
      repeatable: false,
      fields: []
    }
  }

  // 获取当前字段组数据
  const getCurrentGroup = () => {
    return mockFieldGroups[selectedGroupType]
  }

  // 模拟置信度颜色函数
  const getEhrConfidenceColor = (confidence) => {
    switch (confidence) {
      case 'high': return '#52c41a'
      case 'medium': return '#faad14'
      case 'low': return '#ff4d4f'
      default: return '#d9d9d9'
    }
  }

  // 模拟事件处理函数
  const handleEhrGroupExtract = () => {
    console.log('AI抽取字段组')
  }

  const handleEhrViewSource = (source) => {
    console.log('查看字段来源:', source)
  }

  const handleEhrEditRecord = (recordId) => {
    console.log('编辑记录:', recordId)
  }

  const handleEhrDeleteRecord = (recordId) => {
    console.log('删除记录:', recordId)
  }

  // 新增：表格行操作函数
  const handleDeleteTableRow = (fieldId, rowId) => {
    console.log('删除表格行:', fieldId, rowId)
    // 这里应该更新表格数据，移除对应行
  }

  const handleAddTableRow = (fieldId, newRow) => {
    console.log('新增表格行:', fieldId, newRow)
    // 这里应该更新表格数据，添加新行
  }

  // 新增：字段组操作函数
  const handleAddNewGroup = (groupName) => {
    console.log('添加新的字段组:', groupName)
    // 这里应该创建新的空字段组实例
  }

  return (
    <div style={{ padding: 20 }}>
      {/* 测试控制面板 */}
      <Card title="MiddlePanel组件测试 - 新架构验证" style={{ marginBottom: 16 }}>
        <div style={{ marginBottom: 12 }}>
          <Text strong>选择测试场景：</Text>
        </div>
        <Space wrap>
          <Button 
            type={selectedGroupType === 'normal' ? 'primary' : 'default'}
            onClick={() => setSelectedGroupType('normal')}
          >
            普通字段组
          </Button>
          <Button 
            type={selectedGroupType === 'table' ? 'primary' : 'default'}
            onClick={() => setSelectedGroupType('table')}
          >
            表格字段组
          </Button>
          <Button 
            type={selectedGroupType === 'repeatable' ? 'primary' : 'default'}
            onClick={() => setSelectedGroupType('repeatable')}
          >
            可重复字段组
          </Button>
          <Button 
            type={selectedGroupType === 'empty' ? 'primary' : 'default'}
            onClick={() => setSelectedGroupType('empty')}
          >
            空状态
          </Button>
        </Space>
        <div style={{ marginTop: 12, fontSize: 12, color: '#666' }}>
          <div>✅ 测试内容：组件化渲染、字段编辑、状态管理</div>
          <div>🎯 当前场景: <Tag color="blue">{getCurrentGroup().name}</Tag></div>
          {editingEhrField && (
            <div>📝 正在编辑: <Tag color="orange">{editingEhrField}</Tag></div>
          )}
        </div>
      </Card>

      {/* MiddlePanel组件测试 */}
      <div style={{ border: '2px dashed #1677ff', borderRadius: 8, padding: 16 }}>
        <div style={{ marginBottom: 12, fontSize: 14, fontWeight: 'bold', color: '#1677ff' }}>
          📦 MiddlePanel组件 (新架构)
        </div>
        <MiddlePanel
          currentGroup={getCurrentGroup()}
          editingEhrField={editingEhrField}
          editingEhrValue={editingEhrValue}
          setEditingEhrValue={setEditingEhrValue}
          handleEhrFieldEdit={handleEhrFieldEdit}
          handleEhrSaveEdit={handleEhrSaveEdit}
          handleEhrCancelEdit={handleEhrCancelEdit}
          handleEhrGroupExtract={handleEhrGroupExtract}
          handleEhrViewSource={handleEhrViewSource}
          handleEhrEditRecord={handleEhrEditRecord}
          handleEhrDeleteRecord={handleEhrDeleteRecord}
          onDeleteTableRow={handleDeleteTableRow}
          onAddTableRow={handleAddTableRow}
          onAddNewGroup={handleAddNewGroup}
          getEhrConfidenceColor={getEhrConfidenceColor}
        />
      </div>

      {/* 测试结果显示 */}
      <Card title="组件化架构优势" style={{ marginTop: 16 }}>
        <div style={{ fontSize: 12, color: '#666' }}>
          <div>✅ <strong>FieldRenderer</strong>: 专门处理普通字段渲染 (~80行代码)</div>
          <div>✅ <strong>TableFieldRenderer</strong>: 专门处理表格字段渲染 (~120行代码)</div>
          <div>✅ <strong>RepeatableFieldRenderer</strong>: 专门处理可重复字段组 (~150行代码)</div>
          <div>✅ <strong>useEhrFieldEdit Hook</strong>: 统一管理编辑状态</div>
          <div>🎯 <strong>代码减少</strong>: 原300行巨型组件 → 4个专用组件</div>
          <div>🔧 <strong>可维护性</strong>: 单一职责，易于理解和修改</div>
          <div>🧪 <strong>可测试性</strong>: 每个组件可独立测试</div>
        </div>
      </Card>
    </div>
  )
}

export default MiddlePanelTest