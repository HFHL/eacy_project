/**
 * 解析进度组件
 * 
 * 显示文档解析的实时进度
 */

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { Progress, Steps, Card, Tag, Spin, Space, Typography, Alert } from 'antd';
import {
  CheckCircleOutlined,
  ClockCircleOutlined,
  LoadingOutlined,
  CloseCircleOutlined,
  FileTextOutlined,
  ScanOutlined,
  RobotOutlined,
  SafetyCertificateOutlined,
  CloudDownloadOutlined
} from '@ant-design/icons';
import { createParseProgressWS, pollParseProgress } from '../../api/websocket';

const { Text, Title } = Typography;

// 步骤图标映射
const STEP_ICONS = {
  '下载文档': <CloudDownloadOutlined />,
  'OCR 识别': <ScanOutlined />,
  '文档分类': <FileTextOutlined />,
  'AI 结构化': <RobotOutlined />,
  '数据校验': <SafetyCertificateOutlined />,
};

// 状态颜色映射
const STATUS_COLORS = {
  pending: 'default',
  parsing: 'processing',
  completed: 'success',
  failed: 'error',
};

// 状态标签文本
const STATUS_LABELS = {
  pending: '等待中',
  parsing: '解析中',
  completed: '已完成',
  failed: '失败',
};

/**
 * 解析进度组件
 */
export default function ParseProgress({
  documentId,
  userId = null,
  initialProgress = null,
  onComplete = () => {},
  onError = () => {},
  showCard = true,
  size = 'default', // 'default' | 'small'
}) {
  const [progress, setProgress] = useState(initialProgress || {
    status: 'pending',
    progress: 0,
    current_step: '等待处理',
    steps: [],
    message: ''
  });
  const [connected, setConnected] = useState(false);
  const wsRef = useRef(null);
  const pollIntervalRef = useRef(null);
  
  // 处理进度更新
  const handleProgress = useCallback((data) => {
    // 只处理当前文档的进度
    if (data.document_id !== documentId) return;
    
    setProgress(data);
    
    // 检查是否完成
    if (data.status === 'completed') {
      onComplete(data);
    } else if (data.status === 'failed') {
      onError(data);
    }
  }, [documentId, onComplete, onError]);
  
  // 连接 WebSocket
  useEffect(() => {
    if (!documentId) return;
    
    // 创建 WebSocket 连接
    wsRef.current = createParseProgressWS({
      userId,
      documentId,
      onProgress: handleProgress,
      onConnect: () => setConnected(true),
      onDisconnect: () => setConnected(false),
      onError: (error) => {
        console.error('[ParseProgress] WebSocket error:', error);
        // WebSocket 失败时启用轮询
        startPolling();
      }
    });
    
    wsRef.current.connect();
    
    return () => {
      if (wsRef.current) {
        wsRef.current.disconnect();
      }
      stopPolling();
    };
  }, [documentId, userId, handleProgress]);
  
  // 轮询备用方案
  const startPolling = useCallback(() => {
    if (pollIntervalRef.current) return;
    
    console.log('[ParseProgress] Starting polling...');
    pollIntervalRef.current = setInterval(async () => {
      const data = await pollParseProgress(documentId);
      if (data) {
        handleProgress(data);
        
        // 完成或失败时停止轮询
        if (data.status === 'completed' || data.status === 'failed') {
          stopPolling();
        }
      }
    }, 2000); // 每2秒轮询一次
  }, [documentId, handleProgress]);
  
  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);
  
  // 计算当前步骤索引
  const getCurrentStepIndex = () => {
    if (!progress.steps || progress.steps.length === 0) {
      return 0;
    }
    const runningIndex = progress.steps.findIndex(s => s.status === 'running');
    if (runningIndex >= 0) return runningIndex;
    
    const lastCompleted = progress.steps.filter(s => s.status === 'completed').length;
    return lastCompleted;
  };
  
  // 获取步骤状态
  const getStepStatus = (step) => {
    switch (step.status) {
      case 'completed':
        return 'finish';
      case 'running':
        return 'process';
      case 'failed':
        return 'error';
      default:
        return 'wait';
    }
  };
  
  // 渲染步骤
  const renderSteps = () => {
    const steps = progress.steps && progress.steps.length > 0
      ? progress.steps
      : [
          { name: '下载文档', status: 'pending' },
          { name: 'OCR 识别', status: 'pending' },
          { name: '文档分类', status: 'pending' },
          { name: 'AI 结构化', status: 'pending' },
          { name: '数据校验', status: 'pending' },
        ];
    
    return (
      <Steps
        size={size}
        current={getCurrentStepIndex()}
        items={steps.map((step) => ({
          title: size === 'small' ? null : step.name,
          status: getStepStatus(step),
          icon: STEP_ICONS[step.name],
        }))}
      />
    );
  };
  
  // 渲染进度条
  const renderProgress = () => {
    const percent = progress.progress || 0;
    const status = progress.status === 'failed' ? 'exception' 
                 : progress.status === 'completed' ? 'success' 
                 : 'active';
    
    return (
      <Progress
        percent={percent}
        status={status}
        size={size}
        format={(percent) => `${percent}%`}
      />
    );
  };
  
  // 渲染状态标签
  const renderStatusTag = () => {
    const status = progress.status || 'pending';
    return (
      <Tag color={STATUS_COLORS[status]}>
        {status === 'parsing' && <LoadingOutlined spin style={{ marginRight: 4 }} />}
        {status === 'completed' && <CheckCircleOutlined style={{ marginRight: 4 }} />}
        {status === 'failed' && <CloseCircleOutlined style={{ marginRight: 4 }} />}
        {STATUS_LABELS[status]}
      </Tag>
    );
  };
  
  // 渲染内容
  const content = (
    <div className="parse-progress">
      {/* 状态和连接状态 */}
      <div style={{ marginBottom: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Space>
          {renderStatusTag()}
          {!connected && progress.status === 'parsing' && (
            <Tag color="warning">离线模式</Tag>
          )}
        </Space>
        <Text type="secondary" style={{ fontSize: 12 }}>
          {progress.current_step}
        </Text>
      </div>
      
      {/* 进度条 */}
      <div style={{ marginBottom: 16 }}>
        {renderProgress()}
      </div>
      
      {/* 步骤 */}
      <div style={{ marginBottom: 16 }}>
        {renderSteps()}
      </div>
      
      {/* 消息 */}
      {progress.message && (
        <div style={{ marginTop: 8 }}>
          {progress.status === 'failed' ? (
            <Alert
              type="error"
              message={progress.message}
              showIcon
            />
          ) : (
            <Text type="secondary">{progress.message}</Text>
          )}
        </div>
      )}
    </div>
  );
  
  if (showCard) {
    return (
      <Card title="解析进度" size={size}>
        {content}
      </Card>
    );
  }
  
  return content;
}

/**
 * 迷你版解析进度（用于列表中显示）
 */
export function MiniParseProgress({ documentId, status, progress = 0 }) {
  if (status === 'completed') {
    return (
      <Space size={4}>
        <CheckCircleOutlined style={{ color: '#52c41a' }} />
        <Text type="success">已完成</Text>
      </Space>
    );
  }
  
  if (status === 'failed') {
    return (
      <Space size={4}>
        <CloseCircleOutlined style={{ color: '#ff4d4f' }} />
        <Text type="danger">失败</Text>
      </Space>
    );
  }
  
  if (status === 'parsing') {
    return (
      <Space size={4}>
        <Spin size="small" />
        <Progress
          percent={progress}
          size="small"
          style={{ width: 80 }}
          showInfo={false}
        />
        <Text type="secondary">{progress}%</Text>
      </Space>
    );
  }
  
  return (
    <Space size={4}>
      <ClockCircleOutlined style={{ color: '#999' }} />
      <Text type="secondary">待解析</Text>
    </Space>
  );
}

