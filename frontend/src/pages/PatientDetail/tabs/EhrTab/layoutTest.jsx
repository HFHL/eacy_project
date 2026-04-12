/**
 * 布局Hook测试页面
 * 用于验证useEhrLayout Hook的功能
 */
import React from 'react'
import { Card, Button, Space, Typography } from 'antd'
import { useEhrLayout } from './hooks/useEhrLayout'

const { Text } = Typography

const LayoutTest = () => {
  const {
    ehrLeftWidth,
    ehrRightWidth,
    handleLeftResize,
    handleRightResize,
    resetLayout,
    setPresetLayout
  } = useEhrLayout()

  return (
    <div style={{ padding: 20 }}>
      <Card title="布局Hook测试" style={{ marginBottom: 16 }}>
        <Space wrap>
          <Text>左侧宽度: {ehrLeftWidth}px</Text>
          <Text>右侧宽度: {ehrRightWidth}px</Text>
          <Button onClick={resetLayout}>重置布局</Button>
          <Button onClick={() => setPresetLayout('compact')}>紧凑布局</Button>
          <Button onClick={() => setPresetLayout('wide')}>宽松布局</Button>
          <Button onClick={() => setPresetLayout('focus-middle')}>聚焦中间</Button>
        </Space>
      </Card>
      
      {/* 模拟三栏布局 */}
      <div style={{ display: 'flex', gap: '8px', height: '300px' }}>
        {/* 左侧面板 */}
        <div style={{ 
          width: `${ehrLeftWidth}px`, 
          minWidth: '250px',
          background: '#f0f8ff',
          border: '1px solid #1677ff',
          borderRadius: '6px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <Text>左侧面板 ({ehrLeftWidth}px)</Text>
        </div>

        {/* 左侧拖拽条 */}
        <div 
          style={{ 
            width: '4px', 
            background: '#f0f0f0', 
            cursor: 'col-resize',
            borderRadius: '2px',
            transition: 'background 0.2s'
          }}
          onMouseDown={handleLeftResize}
          onMouseEnter={(e) => e.target.style.background = '#d9d9d9'}
          onMouseLeave={(e) => e.target.style.background = '#f0f0f0'}
        />

        {/* 中间面板 */}
        <div style={{ 
          flex: 1, 
          minWidth: '400px',
          background: '#f6ffed',
          border: '1px solid #52c41a',
          borderRadius: '6px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <Text>中间面板 (自适应)</Text>
        </div>

        {/* 右侧拖拽条 */}
        <div 
          style={{ 
            width: '4px', 
            background: '#f0f0f0', 
            cursor: 'col-resize',
            borderRadius: '2px',
            transition: 'background 0.2s'
          }}
          onMouseDown={handleRightResize}
          onMouseEnter={(e) => e.target.style.background = '#d9d9d9'}
          onMouseLeave={(e) => e.target.style.background = '#f0f0f0'}
        />

        {/* 右侧面板 */}
        <div style={{ 
          width: `${ehrRightWidth}px`, 
          minWidth: '300px',
          background: '#fff2e8',
          border: '1px solid #fa8c16',
          borderRadius: '6px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center'
        }}>
          <Text>右侧面板 ({ehrRightWidth}px)</Text>
        </div>
      </div>
    </div>
  )
}

export default LayoutTest