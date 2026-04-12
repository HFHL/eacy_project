/**
 * RightPanel组件测试页面
 * 用于验证RightPanel组件的独立功能
 */
import React, { useState } from 'react'
import { Card, Button, Space } from 'antd'
import RightPanel from './components/RightPanel'

const RightPanelTest = () => {
  // 模拟测试数据
  const [selectedEhrDocument, setSelectedEhrDocument] = useState({
    id: 'doc1',
    name: '血常规报告_20240115.pdf',
    category: '检验报告',
    uploadDate: '2024-01-15',
    confidence: 'high',
    extractedFields: ['白细胞计数', '红细胞计数', '血红蛋白', '血小板计数'],
    preview: '血常规检查报告\n\n检查日期：2024-01-15\n检查项目：血常规\n\n检查结果：\n白细胞计数：6.2 × 10^9/L\n红细胞计数：4.5 × 10^12/L\n血红蛋白：135 g/L\n血小板计数：280 × 10^9/L\n\n结论：各项指标均在正常范围内。'
  })

  const handleViewFullDocument = (doc) => {
    console.log('查看完整文档:', doc)
    alert(`查看完整文档: ${doc.name}`)
  }

  const handleReExtract = (doc) => {
    console.log('重新抽取文档:', doc)
    alert(`重新抽取文档: ${doc.name}`)
  }

  return (
    <div style={{ padding: 20 }}>
      <Card title="RightPanel组件测试" style={{ marginBottom: 16 }}>
        <Space>
          <Button onClick={() => setSelectedEhrDocument(null)}>
            清空选中文档
          </Button>
          <Button type="primary" onClick={() => setSelectedEhrDocument({
            id: 'doc1',
            name: '血常规报告_20240115.pdf',
            category: '检验报告',
            uploadDate: '2024-01-15',
            confidence: 'high',
            extractedFields: ['白细胞计数', '红细胞计数', '血红蛋白', '血小板计数'],
            preview: '血常规检查报告\n\n检查日期：2024-01-15\n检查项目：血常规\n\n检查结果：\n白细胞计数：6.2 × 10^9/L\n红细胞计数：4.5 × 10^12/L\n血红蛋白：135 g/L\n血小板计数：280 × 10^9/L\n\n结论：各项指标均在正常范围内。'
          })}>
            选中测试文档
          </Button>
        </Space>
      </Card>
      
      <div style={{ width: '400px' }}>
        <RightPanel 
          selectedEhrDocument={selectedEhrDocument}
          onViewFullDocument={handleViewFullDocument}
          onReExtract={handleReExtract}
        />
      </div>
    </div>
  )
}

export default RightPanelTest