import React from 'react'
import { Button } from 'antd'
import { CloseOutlined } from '@ant-design/icons'

export const ModalCloseButton = ({ onClose }) => (
  <Button
    type="text"
    icon={<CloseOutlined />}
    style={{
      position: 'absolute',
      top: 16,
      right: 16,
      zIndex: 1000,
      color: 'white',
      background: 'rgba(0, 0, 0, 0.6)',
      border: 'none',
      fontSize: 20,
      width: 40,
      height: 40,
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: '50%',
    }}
    onClick={onClose}
  />
)
