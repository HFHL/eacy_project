/**
 * EhrTab集成测试页面
 * 验证LeftPanel、RightPanel和布局Hook的协作效果
 */
import React, { useState } from 'react'
import { Card, Button, Space, Typography, Tag } from 'antd'
import { CheckCircleOutlined, ExclamationCircleOutlined, UserOutlined } from '@ant-design/icons'
import EhrTab from './index'

const { Text } = Typography

const EhrTabIntegrationTest = () => {
  // 模拟选中的文档状态
  const [selectedEhrDocument, setSelectedEhrDocument] = useState(null)

  // 模拟字段组数据
  const mockEhrFieldGroups = [
    {
      key: 'basicInfo',
      name: '基本信息',
      status: 'completed',
      extractedCount: 8,
      fieldCount: 10,
      children: [
        { key: 'personalInfo', name: '个人信息', status: 'completed', extractedCount: 5, fieldCount: 5 },
        { key: 'contactInfo', name: '联系信息', status: 'partial', extractedCount: 2, fieldCount: 3 }
      ]
    },
    {
      key: 'medicalHistory',
      name: '病史信息',
      status: 'partial',
      extractedCount: 12,
      fieldCount: 20,
      children: [
        { key: 'pastMedical', name: '既往史', status: 'completed', extractedCount: 8, fieldCount: 8 },
        { key: 'familyHistory', name: '家族史', status: 'pending', extractedCount: 0, fieldCount: 5 }
      ]
    },
    {
      key: 'clinicalInfo',
      name: '临床信息',
      status: 'pending',
      extractedCount: 0,
      fieldCount: 15
    }
  ]

  // 模拟字段数据
  const mockEhrFieldsData = {
    'personalInfo': { 
      name: '个人信息', 
      repeatable: false,
      fields: [
        { id: 'field_1', name: '患者姓名', value: '张三', fieldType: 'fields', uiType: 'text', confidence: 'high', source: 'doc1', editable: true },
        { id: 'field_2', name: '性别', value: '男', fieldType: 'fields', uiType: 'radio', confidence: 'high', source: 'doc1', editable: true },
        { id: 'field_3', name: '出生日期', value: '1979-03-15', fieldType: 'fields', uiType: 'datepicker', confidence: 'high', source: 'doc1', editable: true },
        { id: 'field_4', name: '年龄', value: '45', fieldType: 'fields', uiType: 'number', confidence: 'high', source: 'doc1', editable: true }
      ]
    },
    'contactInfo': { 
      name: '联系信息', 
      repeatable: false,
      fields: [
        { id: 'field_5', name: '联系电话', value: '138****1234', fieldType: 'fields', uiType: 'text', confidence: 'medium', source: 'doc2', editable: true },
        { id: 'field_6', name: '家庭地址', value: '北京市朝阳区', fieldType: 'fields', uiType: 'textarea', confidence: 'medium', source: 'doc2', editable: true },
        { id: 'field_7', name: '紧急联系人', value: '李四', fieldType: 'fields', uiType: 'text', confidence: 'medium', source: 'doc2', editable: true }
      ]
    },
    'pastMedical': { 
      name: '既往史', 
      repeatable: true,
      records: [
        {
          id: 'record_1',
          fields: [
            { id: 'field_8', name: '疾病名称', value: '高血压', fieldType: 'fields', uiType: 'text', confidence: 'high', source: 'doc3', editable: true },
            { id: 'field_9', name: '确诊日期', value: '2020-03-15', fieldType: 'fields', uiType: 'datepicker', confidence: 'high', source: 'doc3', editable: true },
            { id: 'field_10', name: '治疗状况', value: '药物控制', fieldType: 'fields', uiType: 'select', confidence: 'medium', source: 'doc3', editable: true }
          ]
        }
      ]
    },
    'familyHistory': { 
      name: '家族史', 
      repeatable: false,
      fields: [
        { 
          id: 'table_field_1', 
          name: '家族疾病史', 
          fieldType: 'table_fields', 
          confidence: 'medium', 
          source: 'doc4', 
          editable: true,
          tableData: [
            { id: 1, '关系': '父亲', '疾病': '糖尿病', '年龄': '65岁' },
            { id: 2, '关系': '母亲', '疾病': '高血压', '年龄': '62岁' }
          ]
        }
      ]
    },
    'clinicalInfo': { 
      name: '临床信息', 
      repeatable: false,
      fields: []
    }
  }

  // 模拟文档数据 - 只有具体的子字段组才有对应文档
  const mockDocuments = {
    'personalInfo': {
      id: 'doc1',
      name: '患者个人信息表.pdf',
      category: '个人信息',
      uploadDate: '2024-01-15',
      confidence: 'high',
      extractedFields: ['姓名', '性别', '年龄', '出生日期'],
      preview: '患者个人信息\n\n姓名：张三\n性别：男\n年龄：45岁\n出生日期：1979-03-15'
    },
    'contactInfo': {
      id: 'doc2',
      name: '联系方式登记表.pdf',
      category: '联系信息',
      uploadDate: '2024-01-15',
      confidence: 'medium',
      extractedFields: ['联系电话', '家庭地址', '紧急联系人'],
      preview: '联系方式信息\n\n联系电话：138****1234\n家庭地址：北京市朝阳区\n紧急联系人：李四'
    },
    'pastMedical': {
      id: 'doc3',
      name: '既往病史记录.pdf',
      category: '既往史',
      uploadDate: '2024-01-16',
      confidence: 'high',
      extractedFields: ['既往疾病', '手术史', '住院史'],
      preview: '既往病史\n\n既往疾病：高血压病史5年\n手术史：2020年阑尾切除术\n住院史：无重大住院史'
    },
    'familyHistory': {
      id: 'doc4',
      name: '家族病史调查表.pdf',
      category: '家族史',
      uploadDate: '2024-01-16',
      confidence: 'medium',
      extractedFields: ['父系病史', '母系病史'],
      preview: '家族病史\n\n父系：父亲有糖尿病史\n母系：母亲有高血压史'
    }
  }

  // 模拟状态图标函数
  const getEhrStatusIcon = (status) => {
    switch (status) {
      case 'completed':
        return <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 12 }} />
      case 'partial':
        return <ExclamationCircleOutlined style={{ color: '#faad14', fontSize: 12 }} />
      case 'pending':
        return <ExclamationCircleOutlined style={{ color: '#d9d9d9', fontSize: 12 }} />
      default:
        return null
    }
  }

  // 模拟获取当前字段组数据
  const getCurrentGroupData = () => {
    // 这个函数需要从EhrTab内部的selectedEhrGroup状态获取，但由于组件封装，我们无法直接访问
    // 作为测试，我们返回一个默认的字段组数据
    return mockEhrFieldsData['personalInfo'] || { name: '个人信息', fields: [], repeatable: false }
  }

  return (
    <div style={{ padding: 20 }}>
      {/* 测试说明 */}
      <Card title="EhrTab集成测试 - 布局切换功能" style={{ marginBottom: 16 }}>
        <div style={{ fontSize: 12, color: '#666' }}>
          <div>📋 测试内容：三栏/两栏布局切换、字段组选择、文档溯源显示</div>
          <div>🎯 操作指南：点击布局切换按钮测试三栏/两栏切换，点击字段组测试文档关联</div>
        </div>
      </Card>

      {/* 使用EhrTab组件 */}
      <EhrTab
        ehrFieldGroups={mockEhrFieldGroups}
        selectedEhrDocument={selectedEhrDocument}
        setSelectedEhrDocument={setSelectedEhrDocument}
        ehrDocuments={[]}
        ehrFieldsData={mockEhrFieldsData}
        getCurrentGroupData={getCurrentGroupData}
        getEhrStatusIcon={getEhrStatusIcon}
        getEhrConfidenceColor={(confidence) => {
          switch (confidence) {
            case 'high': return '#52c41a'
            case 'medium': return '#faad14'
            case 'low': return '#ff4d4f'
            default: return '#d9d9d9'
          }
        }}
        handleEhrGroupExtract={() => console.log('AI抽取字段组')}
        handleEhrViewSource={(source) => console.log('查看字段来源:', source)}
      />
    </div>
  )
}

export default EhrTabIntegrationTest