/**
 * 表格字段渲染器组件
 * 负责渲染table_fields类型字段的表格数据和编辑功能
 */
import React from 'react'
import {
  Typography,
  Button,
  Table,
  Tag,
  Popconfirm,
  Space
} from 'antd'
import {
  PlayCircleOutlined,
  FileTextOutlined,
  DeleteOutlined,
  PlusOutlined
} from '@ant-design/icons'
import FieldEditRenderer from './FieldEditRenderer'

const { Text } = Typography

const TableFieldRenderer = ({
  // 字段数据
  field,
  
  // 编辑状态
  editingEhrField,
  editingEhrValue,
  setEditingEhrValue,
  
  // 事件处理函数
  onEdit,
  onSave,
  onCancel,
  onExtract,
  onDeleteTableRow,
  onAddTableRow,
  
  // 工具函数
  getEhrConfidenceColor
}) => {
  // 如果没有表格数据，显示空状态
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
          onClick={() => onExtract(field.id)}
        >
          AI抽取
        </Button>
      </div>
    )
  }

  // 获取表格列定义
  const dataColumns = Object.keys(field.tableData[0])
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
          // 根据列名推断uiType
          const getColumnUiType = (columnName) => {
            if (columnName.includes('日期') || columnName.includes('时间')) return 'datepicker'
            if (columnName.includes('数量') || columnName.includes('值') || columnName.includes('频率')) return 'number'
            if (columnName.includes('是否') || columnName.includes('异常')) return 'checkbox'
            if (columnName.includes('类型') || columnName.includes('状态') || columnName.includes('方式')) return 'select'
            return 'text'
          }
          
          // 创建虚拟字段对象
          const virtualField = {
            id: cellId,
            name: key,
            uiType: getColumnUiType(key),
            confidence: field.confidence
          }
          
          return (
            <div style={{ fontSize: 11 }}>
              <FieldEditRenderer
                field={virtualField}
                value={editingEhrValue}
                onChange={setEditingEhrValue}
                onSave={onSave}
                onCancel={onCancel}
                getEhrConfidenceColor={getEhrConfidenceColor}
              />
            </div>
          )
        }
        
        // 显示状态 - 特殊处理某些列
        if (key === '是否异常') {
          return (
            <div 
              style={{ cursor: 'pointer' }}
              onDoubleClick={() => onEdit(cellId, text)}
            >
              {text ? <Tag color="red">异常</Tag> : <Tag color="green">正常</Tag>}
            </div>
          )
        }
        
        if (key === '异常标志' && text) {
          return (
            <div 
              style={{ cursor: 'pointer' }}
              onDoubleClick={() => onEdit(cellId, text)}
            >
              <Text style={{ color: '#ff4d4f', fontWeight: 'bold' }}>{text}</Text>
            </div>
          )
        }
        
        // 默认渲染
        return (
          <div 
            style={{ cursor: 'pointer' }}
            onDoubleClick={() => onEdit(cellId, text)}
          >
            <Text style={{ fontSize: 12 }}>{text}</Text>
          </div>
        )
      }
    }))

  // 添加操作列
  const operationColumn = {
    title: '操作',
    key: 'operation',
    width: 80,
    render: (_, record) => (
      <Popconfirm
        title="确定删除这条记录吗？"
        onConfirm={() => onDeleteTableRow && onDeleteTableRow(field.id, record.id)}
        okText="确定"
        cancelText="取消"
      >
        <Button 
          type="text" 
          size="small" 
          icon={<DeleteOutlined />}
          danger
          style={{ fontSize: 12 }}
        />
      </Popconfirm>
    )
  }

  // 完整的列定义
  const columns = [...dataColumns, operationColumn]

  // 处理新增行
  const handleAddRow = () => {
    if (onAddTableRow) {
      // 创建新行数据，基于现有列结构
      const newRow = {}
      dataColumns.forEach(col => {
        newRow[col.dataIndex] = '' // 空值
      })
      newRow.id = Date.now() // 临时ID
      onAddTableRow(field.id, newRow)
    }
  }

  return (
    <div style={{ marginTop: 12 }}>
      {/* 表格标题 */}
      <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text strong style={{ fontSize: 13, color: '#333' }}>
          {field.name}
        </Text>
        <Tag color="purple" size="small">表格字段</Tag>
      </div>
      
      {/* 表格内容 */}
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
      
      {/* 新增行按钮 */}
      <div style={{ marginTop: 8, textAlign: 'center' }}>
        <Button 
          type="dashed" 
          size="small"
          icon={<PlusOutlined />}
          onClick={handleAddRow}
          style={{ fontSize: 12 }}
        >
          添加一行数据
        </Button>
      </div>
    </div>
  )
}

export default TableFieldRenderer