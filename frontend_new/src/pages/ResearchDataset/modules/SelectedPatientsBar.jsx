import React from 'react'
import { Button, Modal } from 'antd'
import {
  CloseOutlined,
  PlayCircleOutlined,
  ReloadOutlined,
  UserDeleteOutlined,
} from '@ant-design/icons'

const SelectedPatientsBar = ({
  selectedPatients,
  isExtracting,
  token,
  onStartExtraction,
  onRemovePatients,
  onClearSelection,
}) => {
  if (!selectedPatients.length) return null

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 32,
        left: '50%',
        transform: 'translateX(-50%)',
        zIndex: 1000,
        background: token.colorBgElevated,
        border: `1px solid ${token.colorBorderSecondary}`,
        borderRadius: 12,
        padding: '12px 20px',
        boxShadow: '0 8px 32px rgba(0,0,0,0.28)',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        minWidth: 420,
      }}
    >
      <div style={{ color: token.colorText, fontWeight: 500, whiteSpace: 'nowrap' }}>
        已选 <span style={{ color: token.colorPrimary, fontWeight: 700 }}>{selectedPatients.length}</span> 位患者
      </div>
      <div style={{ width: 1, height: 20, background: token.colorSplit }} />
      <Button
        size="small"
        type="primary"
        icon={<PlayCircleOutlined />}
        disabled={isExtracting}
        onClick={() => onStartExtraction(selectedPatients, 'incremental')}
      >
        增量抽取
      </Button>
      <Button
        size="small"
        danger
        icon={<ReloadOutlined />}
        disabled={isExtracting}
        onClick={() => {
          Modal.confirm({
            title: `确认对 ${selectedPatients.length} 位患者全量抽取？`,
            content: '如果所选患者已有抽取记录，重新抽取会清空历史记录并重新抽取。',
            okText: '确认抽取',
            okButtonProps: { danger: true },
            cancelText: '取消',
            onOk: () => onStartExtraction(selectedPatients, 'full'),
          })
        }}
      >
        全量抽取
      </Button>
      <div style={{ width: 1, height: 20, background: token.colorSplit }} />
      <Button size="small" danger icon={<UserDeleteOutlined />} onClick={onRemovePatients}>
        移出项目
      </Button>
      <div style={{ width: 1, height: 20, background: token.colorSplit }} />
      <Button
        size="small"
        type="text"
        style={{ color: token.colorTextSecondary }}
        icon={<CloseOutlined />}
        onClick={onClearSelection}
      >
        取消选择
      </Button>
    </div>
  )
}

export default SelectedPatientsBar
