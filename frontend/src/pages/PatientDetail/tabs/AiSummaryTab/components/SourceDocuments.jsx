/**
 * 来源文档列表组件
 * 显示AI综述的来源文档
 */
import React from 'react'
import { Card, List, Typography, Divider, Empty } from 'antd'

const { Text } = Typography

const SourceDocuments = ({ 
  sourceDocuments = [], 
  onViewDocument 
}) => {
  return (
    <Card 
      title="来源文档" 
      size="small"
      style={{ marginBottom: 16 }}
      bodyStyle={{ padding: '16px' }}
    >
      {sourceDocuments.length === 0 ? (
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={
            <Text type="secondary" style={{ fontSize: 12 }}>
              生成综述后将显示来源文档
            </Text>
          }
        />
      ) : (
        <>
          <List
            size="small"
            dataSource={sourceDocuments}
            renderItem={doc => (
              <List.Item
                style={{ cursor: 'pointer', padding: '8px 0' }}
                onClick={() => onViewDocument?.(doc.id)}
              >
                <List.Item.Meta
                  avatar={
                    <div style={{ 
                      width: 24, 
                      height: 24, 
                      borderRadius: '50%', 
                      background: '#6366f1', 
                      color: 'white', 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center',
                      fontSize: 12,
                      fontWeight: 'bold'
                    }}>
                      {(doc.ref || '').replace(/[\[\]]/g, '')}
                    </div>
                  }
                  title={
                    <Text strong style={{ fontSize: 12 }}>
                      {doc.name}
                    </Text>
                  }
                  description={
                    <Text type="secondary" style={{ fontSize: 11 }}>
                      {doc.type || '文档'}
                    </Text>
                  }
                />
              </List.Item>
            )}
          />

          <Divider style={{ margin: '12px 0' }} />
          
          <div style={{ 
            padding: '8px 12px', 
            background: '#f8f9fa', 
            borderRadius: '4px',
            border: '1px solid #e9ecef'
          }}>
            <Text type="secondary" style={{ fontSize: 11 }}>
              💡 综述中的 [1][2][3] 标记对应上方文档，点击可查看原始内容
            </Text>
          </div>
        </>
      )}
    </Card>
  )
}

export default SourceDocuments