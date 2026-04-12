import React, { useState, useEffect } from 'react';
import {
  Layout,
  Card,
  Button,
  Table,
  Tag,
  Typography,
  Space,
  Row,
  Col,
  Statistic,
  Spin,
  Empty,
  message,
  Tabs,
  Tooltip,
  Badge,
  Input
} from 'antd';
import {
  HistoryOutlined,
  ArrowLeftOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  ClockCircleOutlined,
  FileTextOutlined,
  ReloadOutlined,
  EyeOutlined,
  CloudServerOutlined,
  CodeOutlined,
  ApiOutlined,
  SafetyCertificateOutlined,
  DownOutlined,
  RightOutlined,
  CopyOutlined,
  UnorderedListOutlined,
  TableOutlined,
  ExpandOutlined,
  CompressOutlined,
  LoadingOutlined,
  EditOutlined,
  SaveOutlined,
  FormOutlined
} from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';

const { Header, Content } = Layout;
const { Title, Text } = Typography;

// API 服务（本地模式）
const apiService = {
  async getWorkflowLogs() {
    return { logs: [] };
  },
  
  async getWorkflowLogDetail(filename) {
    return {
      filename,
      success: true,
      steps: [],
      task_id: `local-${filename || 'task'}`
    };
  },
  
  getFilePreviewUrl(filePath) {
    return filePath || '';
  },
  
  async getNotes(taskId) {
    return { task_id: taskId, notes: {}, workflow_note: '' };
  },
  
  async saveNote(taskId, stepId, content) {
    return { task_id: taskId, step_id: stepId, content, success: true };
  }
};

// 步骤图标配置
const STEP_ICONS = {
  textin: <EyeOutlined />,
  indexer: <CloudServerOutlined />,
  prompt_gen: <CodeOutlined />,
  extractor: <ApiOutlined />,
  validator: <SafetyCertificateOutlined />
};

const STEP_COLORS = {
  textin: '#1890ff',
  indexer: '#722ed1',
  prompt_gen: '#eb2f96',
  extractor: '#13c2c2',
  validator: '#52c41a'
};

// ============== 辅助函数 ==============
const isUniformArrayOfObjects = (arr) => {
  if (!Array.isArray(arr) || arr.length === 0) return false;
  if (typeof arr[0] !== 'object' || arr[0] === null || Array.isArray(arr[0])) return false;
  const keys = Object.keys(arr[0]);
  if (keys.length === 0) return false;
  return arr.slice(0, 5).every(item => 
    typeof item === 'object' && item !== null && !Array.isArray(item) &&
    Object.keys(item).length === keys.length
  );
};

// ============== 智能表格组件 ==============
const SmartTable = ({ data }) => {
  if (!data || data.length === 0) {
    return <Text type="secondary" style={{ fontSize: 12 }}>空列表</Text>;
  }
  
  const columns = Object.keys(data[0]).map(key => ({
    title: key,
    dataIndex: key,
    key: key,
    ellipsis: true,
    render: (val) => {
      if (val === null || val === undefined) return <Text type="secondary">-</Text>;
      if (typeof val === 'object') return <Text code style={{ fontSize: 11 }}>{JSON.stringify(val)}</Text>;
      if (typeof val === 'number') return <Text style={{ color: '#d19a66', fontFamily: 'monospace' }}>{val}</Text>;
      if (typeof val === 'boolean') return <Tag color={val ? 'green' : 'red'}>{val ? 'TRUE' : 'FALSE'}</Tag>;
      return <Text style={{ fontSize: 12 }}>{String(val)}</Text>;
    }
  }));
  
  columns.unshift({
    title: '#',
    key: 'index',
    width: 50,
    render: (_, __, idx) => <Text type="secondary" style={{ fontFamily: 'monospace' }}>{idx + 1}</Text>
  });
  
  return (
    <Table
      dataSource={data.map((item, idx) => ({ ...item, _key: idx }))}
      columns={columns}
      rowKey="_key"
      size="small"
      pagination={false}
      scroll={{ x: 'max-content' }}
      style={{ marginTop: 8 }}
    />
  );
};

// ============== 数据类型颜色 ==============
const TYPE_COLORS = {
  string: '#98c379',
  number: '#d19a66',
  boolean: '#56b6c2',
  null: '#636d83',
  array: '#e5c07b',
  object: '#61afef',
  key: '#c678dd'
};

// ============== 递归树节点 ==============
const TreeNode = ({ keyName, value, depth = 0, forceExpand = false }) => {
  const [expanded, setExpanded] = useState(forceExpand || depth < 2);
  
  useEffect(() => {
    if (forceExpand !== undefined) setExpanded(forceExpand || depth < 2);
  }, [forceExpand, depth]);
  
  const getValueType = (val) => {
    if (val === null || val === undefined) return 'null';
    if (Array.isArray(val)) return 'array';
    return typeof val;
  };
  
  const valueType = getValueType(value);
  const isExpandable = valueType === 'object' || valueType === 'array';
  const isEmpty = isExpandable && (Array.isArray(value) ? value.length === 0 : Object.keys(value).length === 0);
  
  // 长文本
  if (valueType === 'string' && value.length > 100) {
    return (
      <div style={{ marginLeft: depth > 0 ? 16 : 0, padding: '8px 0', borderBottom: '1px solid #f0f0f0' }}>
        {keyName && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 6 }}>
            <FileTextOutlined style={{ fontSize: 10, color: '#999' }} />
            <Text strong style={{ color: TYPE_COLORS.key, fontSize: 12 }}>{keyName}</Text>
          </div>
        )}
        <div style={{ 
          background: '#fafafa', 
          border: '1px solid #e8e8e8', 
          borderRadius: 6, 
          padding: 10,
          maxHeight: 200,
          overflow: 'auto',
          fontSize: 12,
          fontFamily: 'monospace',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all',
          color: '#555'
        }}>
          {value}
        </div>
      </div>
    );
  }
  
  // 简单值
  const renderSimpleValue = () => {
    let displayValue = '';
    let color = TYPE_COLORS[valueType];
    
    switch (valueType) {
      case 'string':
        displayValue = `"${value}"`;
        break;
      case 'number':
        displayValue = String(value);
        break;
      case 'boolean':
        return <Tag color={value ? 'green' : 'red'} style={{ margin: 0 }}>{value ? 'TRUE' : 'FALSE'}</Tag>;
      case 'null':
        return <Text type="secondary" style={{ fontStyle: 'italic', fontSize: 12 }}>null</Text>;
      default:
        displayValue = String(value);
    }
    
    return (
      <span style={{ color, fontFamily: 'Monaco, Consolas, monospace', fontSize: 12, wordBreak: 'break-all' }}>
        {displayValue}
      </span>
    );
  };
  
  // 数组且为统一对象 -> 表格
  if (valueType === 'array' && isUniformArrayOfObjects(value)) {
    return (
      <div style={{ marginLeft: depth > 0 ? 16 : 0, padding: '6px 0', borderBottom: '1px solid #f5f5f5' }}>
        <div 
          style={{ display: 'flex', alignItems: 'center', cursor: 'pointer', padding: '4px 0' }}
          onClick={() => setExpanded(!expanded)}
        >
          {expanded ? <DownOutlined style={{ fontSize: 10, color: '#999', marginRight: 6 }} /> : <RightOutlined style={{ fontSize: 10, color: '#999', marginRight: 6 }} />}
          {keyName && <Text strong style={{ color: TYPE_COLORS.key, fontSize: 12, marginRight: 8 }}>{keyName}</Text>}
          <Tag icon={<TableOutlined />} color="blue" style={{ margin: 0 }}>{value.length} 条记录</Tag>
        </div>
        {expanded && (
          <div style={{ paddingLeft: 16 }}>
            <SmartTable data={value} />
          </div>
        )}
      </div>
    );
  }
  
  // 摘要
  const renderSummary = () => {
    if (valueType === 'array') return <Tag color="gold" style={{ margin: 0 }}>[{value.length} 项]</Tag>;
    if (valueType === 'object') return <Tag color="blue" style={{ margin: 0 }}>{`{${Object.keys(value).length} 字段}`}</Tag>;
    return null;
  };
  
  return (
    <div style={{ marginLeft: depth > 0 ? 16 : 0 }}>
      <div 
        style={{ 
          display: 'flex', alignItems: 'center', padding: '6px 4px',
          cursor: isExpandable && !isEmpty ? 'pointer' : 'default',
          borderRadius: 4, borderBottom: '1px solid #fafafa', transition: 'background 0.2s',
        }}
        onClick={() => isExpandable && !isEmpty && setExpanded(!expanded)}
        onMouseEnter={(e) => e.currentTarget.style.background = '#fafafa'}
        onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
      >
        <span style={{ width: 16, color: '#999', fontSize: 10, flexShrink: 0 }}>
          {isExpandable && !isEmpty && (expanded ? <DownOutlined /> : <RightOutlined />)}
        </span>
        {keyName !== null && (
          <span style={{ color: TYPE_COLORS.key, fontWeight: 500, marginRight: 8, fontSize: 12, flexShrink: 0 }}>
            {keyName}:
          </span>
        )}
        {isExpandable ? (!expanded || isEmpty ? renderSummary() : null) : renderSimpleValue()}
      </div>
      
      {isExpandable && expanded && !isEmpty && (
        <div style={{ borderLeft: '2px solid #f0f0f0', marginLeft: 7, paddingLeft: 8 }}>
          {valueType === 'array' ? (
            value.map((item, idx) => (
              <TreeNode key={idx} keyName={`[${idx}]`} value={item} depth={depth + 1} forceExpand={forceExpand} />
            ))
          ) : (
            Object.entries(value).map(([k, v]) => (
              <TreeNode key={k} keyName={k} value={v} depth={depth + 1} forceExpand={forceExpand} />
            ))
          )}
        </div>
      )}
    </div>
  );
};

// ============== 结构化数据查看器 ==============
const StructuredDataViewer = ({ data, forceExpand = false }) => {
  if (data === null || data === undefined) {
    return <Text type="secondary" style={{ fontSize: 12 }}>无数据</Text>;
  }
  
  return (
    <div style={{
      background: '#fff',
      borderRadius: 8,
      border: '1px solid #e8e8e8',
      padding: 12,
      height: '100%',
      overflow: 'auto',
    }}>
      <TreeNode keyName={null} value={data} depth={0} forceExpand={forceExpand} />
    </div>
  );
};

// ============== JSON 查看器 ==============
const JsonViewer = ({ data, title }) => {
  const [viewMode, setViewMode] = useState('tree');
  const [expandAll, setExpandAll] = useState(false);
  
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, flexShrink: 0 }}>
        <Space size={8}>
          <Text strong style={{ fontSize: 11, color: '#666', textTransform: 'uppercase', letterSpacing: 1 }}>
            {viewMode === 'tree' ? <UnorderedListOutlined style={{ marginRight: 4 }} /> : <CodeOutlined style={{ marginRight: 4 }} />}
            {title}
          </Text>
        </Space>
        <Space size={4}>
          {viewMode === 'tree' && (
            <Button type="text" size="small" icon={expandAll ? <CompressOutlined /> : <ExpandOutlined />} onClick={() => setExpandAll(!expandAll)} style={{ fontSize: 11 }}>
              {expandAll ? '折叠' : '展开'}
            </Button>
          )}
          <Button.Group size="small">
            <Button type={viewMode === 'tree' ? 'primary' : 'default'} onClick={() => setViewMode('tree')} style={{ fontSize: 11 }}>Form</Button>
            <Button type={viewMode === 'raw' ? 'primary' : 'default'} onClick={() => setViewMode('raw')} style={{ fontSize: 11 }}>Raw</Button>
          </Button.Group>
          <Tooltip title="复制 JSON">
            <Button type="text" size="small" icon={<CopyOutlined />} onClick={() => { navigator.clipboard.writeText(JSON.stringify(data, null, 2)); message.success('已复制'); }} />
          </Tooltip>
        </Space>
      </div>
      
      <div style={{ flex: 1, overflow: 'hidden' }}>
        {viewMode === 'tree' ? (
          <StructuredDataViewer data={data} forceExpand={expandAll} />
        ) : (
          <div style={{ background: '#1e1e1e', borderRadius: 8, padding: 16, height: '100%', overflow: 'auto' }}>
            <pre style={{ margin: 0, fontSize: 12, color: '#4ec9b0', whiteSpace: 'pre-wrap', wordBreak: 'break-all' }}>
              {typeof data === 'string' ? data : JSON.stringify(data, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};

// ============== 文件预览组件 ==============
const FilePreview = ({ filePath }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  
  if (!filePath) return null;
  
  const ext = filePath.split('.').pop()?.toLowerCase();
  const isImage = ['jpg', 'jpeg', 'png', 'gif', 'webp'].includes(ext);
  const isPdf = ext === 'pdf';
  const previewUrl = apiService.getFilePreviewUrl(filePath);
  const fileName = filePath.split(/[/\\]/).pop();
  
  if (!isImage && !isPdf) {
    return (
      <div style={{ padding: 16, textAlign: 'center', color: '#999' }}>
        <FileTextOutlined style={{ fontSize: 32, marginBottom: 8 }} />
        <div style={{ fontSize: 12 }}>不支持预览的文件格式</div>
        <div style={{ fontSize: 11, color: '#bbb', marginTop: 4 }}>{fileName}</div>
      </div>
    );
  }
  
  return (
    <div style={{ 
      border: '1px solid #e8e8e8', 
      borderRadius: 8, 
      overflow: 'hidden',
      background: '#fafafa',
      marginBottom: 12
    }}>
      {/* 文件信息头 */}
      <div style={{ 
        padding: '8px 12px', 
        background: '#f5f5f5', 
        borderBottom: '1px solid #e8e8e8',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between'
      }}>
        <Space>
          {isImage ? <EyeOutlined style={{ color: '#1890ff' }} /> : <FileTextOutlined style={{ color: '#ff4d4f' }} />}
          <Text strong style={{ fontSize: 12 }}>{fileName}</Text>
          <Tag color={isImage ? 'blue' : 'red'} style={{ margin: 0 }}>{ext.toUpperCase()}</Tag>
        </Space>
        <Tooltip title="在新窗口打开">
          <Button 
            type="link" 
            size="small" 
            onClick={() => window.open(previewUrl, '_blank')}
            style={{ padding: 0 }}
          >
            <ExpandOutlined />
          </Button>
        </Tooltip>
      </div>
      
      {/* 预览区域 */}
      <div style={{ 
        position: 'relative', 
        minHeight: 200,
        maxHeight: 400,
        overflow: 'auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: isImage ? '#1a1a1a' : '#525659'
      }}>
        {loading && (
          <div style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}>
            <Spin tip="加载中..." />
          </div>
        )}
        
        {error && (
          <div style={{ textAlign: 'center', color: '#ff4d4f', padding: 20 }}>
            <CloseCircleOutlined style={{ fontSize: 24, marginBottom: 8 }} />
            <div>预览加载失败</div>
          </div>
        )}
        
        {isImage && (
          <img
            src={previewUrl}
            alt={fileName}
            style={{ 
              maxWidth: '100%', 
              maxHeight: 380,
              objectFit: 'contain',
              display: loading ? 'none' : 'block'
            }}
            onLoad={() => setLoading(false)}
            onError={() => { setLoading(false); setError(true); }}
          />
        )}
        
        {isPdf && (
          <iframe
            src={previewUrl}
            title={fileName}
            style={{ 
              width: '100%', 
              height: 380, 
              border: 'none',
              display: loading ? 'none' : 'block'
            }}
            onLoad={() => setLoading(false)}
            onError={() => { setLoading(false); setError(true); }}
          />
        )}
      </div>
    </div>
  );
};

// ============== 带预览的输入查看器 ==============
const InputViewerWithPreview = ({ data, stepId, title }) => {
  const [viewMode, setViewMode] = useState('tree');
  const [expandAll, setExpandAll] = useState(false);
  
  // 获取文件路径
  const filePath = data?.file_path || data?.filePath;
  const showPreview = stepId === 'textin' && filePath;
  
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: 8,
        padding: '0 4px',
        flexShrink: 0
      }}>
        <Space size={8}>
          <Text strong style={{ fontSize: 11, color: '#666', textTransform: 'uppercase', letterSpacing: 1 }}>
            {viewMode === 'tree' ? <UnorderedListOutlined style={{ marginRight: 4 }} /> : <CodeOutlined style={{ marginRight: 4 }} />}
            {title}
          </Text>
        </Space>
        <Space size={4}>
          {viewMode === 'tree' && (
            <Button 
              type="text" 
              size="small"
              icon={expandAll ? <CompressOutlined /> : <ExpandOutlined />}
              onClick={() => setExpandAll(!expandAll)}
              style={{ fontSize: 11 }}
            >
              {expandAll ? '折叠' : '展开'}
            </Button>
          )}
          <Button.Group size="small">
            <Button type={viewMode === 'tree' ? 'primary' : 'default'} onClick={() => setViewMode('tree')} style={{ fontSize: 11 }}>Form</Button>
            <Button type={viewMode === 'raw' ? 'primary' : 'default'} onClick={() => setViewMode('raw')} style={{ fontSize: 11 }}>Raw</Button>
          </Button.Group>
          <Tooltip title="复制 JSON">
            <Button 
              type="text" 
              size="small"
              icon={<CopyOutlined />}
              onClick={() => {
                navigator.clipboard.writeText(JSON.stringify(data, null, 2));
                message.success('已复制到剪贴板');
              }}
            />
          </Tooltip>
        </Space>
      </div>
      
      <div style={{ flex: 1, overflow: 'auto' }}>
        {/* 文件预览 */}
        {showPreview && <FilePreview filePath={filePath} />}
        
        {/* 数据展示 */}
        {viewMode === 'tree' ? (
          <StructuredDataViewer data={data} forceExpand={expandAll} />
        ) : (
          <div style={{
            background: '#1e1e1e',
            borderRadius: 8,
            padding: 16,
            minHeight: 100,
            overflow: 'auto',
          }}>
            <pre style={{ 
              margin: 0, 
              fontSize: 12, 
              color: '#4ec9b0',
              whiteSpace: 'pre-wrap',
              wordBreak: 'break-all'
            }}>
              {typeof data === 'string' ? data : JSON.stringify(data, null, 2)}
            </pre>
          </div>
        )}
      </div>
    </div>
  );
};

// ============== 主组件 ==============
export default function HistoryPage() {
  const navigate = useNavigate();
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedLog, setSelectedLog] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [selectedStep, setSelectedStep] = useState(null);
  
  // 笔记状态
  const [notes, setNotes] = useState({ notes: {}, workflow_note: '' });
  const [stepNoteContent, setStepNoteContent] = useState('');
  const [workflowNoteContent, setWorkflowNoteContent] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  
  useEffect(() => {
    loadLogs();
  }, []);
  
  const loadLogs = async () => {
    setLoading(true);
    try {
      const { logs: logList } = await apiService.getWorkflowLogs();
      setLogs(logList || []);
    } catch (e) {
      message.error('获取历史记录失败');
    } finally {
      setLoading(false);
    }
  };
  
  const loadLogDetail = async (filename) => {
    setDetailLoading(true);
    setSelectedStep(null);
    setNotes({ notes: {}, workflow_note: '' });
    setStepNoteContent('');
    setWorkflowNoteContent('');
    
    try {
      const detail = await apiService.getWorkflowLogDetail(filename);
      setSelectedLog(detail);
      if (detail.steps && detail.steps.length > 0) {
        setSelectedStep(detail.steps[0]);
      }
      
      // 加载笔记
      if (detail.task_id) {
        try {
          const notesData = await apiService.getNotes(detail.task_id);
          setNotes(notesData);
          setWorkflowNoteContent(notesData.workflow_note || '');
          if (detail.steps && detail.steps.length > 0) {
            const firstStepNote = notesData.notes?.[detail.steps[0].step_id]?.content || '';
            setStepNoteContent(firstStepNote);
          }
        } catch (e) {
          // 笔记加载失败不阻塞主流程
          console.warn('加载笔记失败:', e);
        }
      }
    } catch (e) {
      message.error('获取详情失败');
    } finally {
      setDetailLoading(false);
    }
  };
  
  // 当选择的步骤变化时，更新笔记内容
  useEffect(() => {
    if (selectedStep && notes.notes) {
      const stepNote = notes.notes[selectedStep.step_id]?.content || '';
      setStepNoteContent(stepNote);
    }
  }, [selectedStep, notes]);
  
  // 保存步骤笔记
  const saveStepNote = async () => {
    if (!selectedLog?.task_id || !selectedStep) return;
    
    setSavingNote(true);
    try {
      await apiService.saveNote(selectedLog.task_id, selectedStep.step_id, stepNoteContent);
      setNotes(prev => ({
        ...prev,
        notes: {
          ...prev.notes,
          [selectedStep.step_id]: { content: stepNoteContent, updated_at: new Date().toISOString() }
        }
      }));
      message.success('笔记已保存');
    } catch (e) {
      message.error('保存笔记失败');
    } finally {
      setSavingNote(false);
    }
  };
  
  // 保存工作流笔记
  const saveWorkflowNote = async () => {
    if (!selectedLog?.task_id) return;
    
    setSavingNote(true);
    try {
      await apiService.saveNote(selectedLog.task_id, null, workflowNoteContent);
      setNotes(prev => ({ ...prev, workflow_note: workflowNoteContent }));
      message.success('工作流笔记已保存');
    } catch (e) {
      message.error('保存笔记失败');
    } finally {
      setSavingNote(false);
    }
  };
  
  const columns = [
    {
      title: '时间',
      dataIndex: 'start_time',
      key: 'start_time',
      width: 180,
      render: (val) => val ? new Date(val).toLocaleString() : '-'
    },
    {
      title: '文件',
      dataIndex: 'file_path',
      key: 'file_path',
      ellipsis: true,
      render: (val) => (
        <Space>
          <FileTextOutlined />
          {val ? val.split(/[/\\]/).pop() : '-'}
        </Space>
      )
    },
    {
      title: '任务 ID',
      dataIndex: 'task_id',
      key: 'task_id',
      width: 150,
      render: (val) => <Text code style={{ fontSize: 11 }}>{val?.slice(-12) || '-'}</Text>
    },
    {
      title: '步骤数',
      dataIndex: 'steps_count',
      key: 'steps_count',
      width: 80,
      render: (val) => <Badge count={val || 0} style={{ backgroundColor: '#1890ff' }} />
    },
    {
      title: '耗时',
      dataIndex: 'total_duration_ms',
      key: 'total_duration_ms',
      width: 100,
      render: (val) => val ? `${(val / 1000).toFixed(1)}s` : '-'
    },
    {
      title: '状态',
      dataIndex: 'success',
      key: 'success',
      width: 80,
      render: (val) => val ? 
        <Tag icon={<CheckCircleOutlined />} color="success">成功</Tag> : 
        <Tag icon={<CloseCircleOutlined />} color="error">失败</Tag>
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      render: (_, record) => (
        <Button type="primary" size="small" onClick={() => loadLogDetail(record.filename)}>
          查看详情
        </Button>
      )
    }
  ];
  
  // 步骤 Tabs 配置（详情页用）
  const stepTabs = selectedLog?.steps?.map(step => ({
    key: step.step_id,
    label: (
      <Space size={4}>
        <span style={{ 
          width: 24, height: 24, borderRadius: 6,
          background: step.status === 'success' ? STEP_COLORS[step.step_id] || '#52c41a' : '#ff4d4f',
          display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
          color: '#fff', fontSize: 12
        }}>
          {STEP_ICONS[step.step_id] || <ClockCircleOutlined />}
        </span>
        <span style={{ fontWeight: selectedStep?.step_id === step.step_id ? 600 : 400 }}>{step.step_name}</span>
        <Tag color={step.status === 'success' ? 'success' : 'error'}>{step.status}</Tag>
        <Text type="secondary" style={{ fontSize: 11 }}>{step.execution_time_ms}ms</Text>
      </Space>
    )
  })) || [];

  // 列表视图
  const renderListView = () => (
    <div style={{ padding: 24 }}>
      <Card>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
          <Title level={4} style={{ margin: 0 }}>
            <HistoryOutlined style={{ marginRight: 8 }} />
            历史解析记录
            <Tag style={{ marginLeft: 8 }}>{logs.length} 条</Tag>
          </Title>
          <Button icon={<ReloadOutlined />} onClick={loadLogs}>刷新</Button>
        </div>
        
        <Spin spinning={loading}>
          {logs.length === 0 ? (
            <Empty description="暂无历史记录" />
          ) : (
            <Table
              dataSource={logs}
              columns={columns}
              rowKey="filename"
              pagination={{ pageSize: 15, showSizeChanger: true, showTotal: (t) => `共 ${t} 条` }}
            />
          )}
        </Spin>
      </Card>
    </div>
  );
  
  // 详情视图
  const renderDetailView = () => (
    <Layout style={{ height: 'calc(100vh - 64px)', background: '#f5f5f5' }}>
      {/* 顶部信息栏 */}
      <Header style={{ 
        background: '#fff', 
        padding: '0 24px', 
        height: 'auto',
        borderBottom: '1px solid #e8e8e8',
      }}>
        <Row gutter={16} align="middle" style={{ padding: '12px 0' }}>
          {/* 返回 */}
          <Col flex="none">
            <Button type="link" onClick={() => setSelectedLog(null)} style={{ padding: 0 }}>
              <ArrowLeftOutlined /> 返回列表
            </Button>
          </Col>
          
          {/* 任务信息 */}
          <Col flex="auto">
            <Space size={24}>
              <Statistic 
                title={<Text style={{ fontSize: 10 }}>任务 ID</Text>}
                value={selectedLog?.task_id?.slice(-12) || '-'}
                valueStyle={{ fontSize: 14, fontFamily: 'monospace' }}
              />
              <Statistic 
                title={<Text style={{ fontSize: 10 }}>文件</Text>}
                value={selectedLog?.file_path?.split(/[/\\]/).pop() || '-'}
                valueStyle={{ fontSize: 14 }}
              />
              <Statistic 
                title={<Text style={{ fontSize: 10 }}>总耗时</Text>}
                value={selectedLog?.total_duration_ms ? (selectedLog.total_duration_ms / 1000).toFixed(2) : '-'}
                suffix="s"
                valueStyle={{ fontSize: 14 }}
              />
              <Statistic 
                title={<Text style={{ fontSize: 10 }}>状态</Text>}
                value={selectedLog?.success ? '成功' : '失败'}
                valueStyle={{ fontSize: 14, color: selectedLog?.success ? '#52c41a' : '#ff4d4f' }}
              />
              <Statistic 
                title={<Text style={{ fontSize: 10 }}>时间</Text>}
                value={selectedLog?.start_time ? new Date(selectedLog.start_time).toLocaleString() : '-'}
                valueStyle={{ fontSize: 12 }}
              />
            </Space>
          </Col>
        </Row>
        
        {/* 步骤 Tabs */}
        <Tabs
          activeKey={selectedStep?.step_id}
          onChange={(key) => {
            const step = selectedLog?.steps?.find(s => s.step_id === key);
            setSelectedStep(step);
          }}
          items={stepTabs}
          style={{ marginBottom: -1 }}
          tabBarStyle={{ marginBottom: 0 }}
        />
      </Header>
      
      {/* 输入输出面板 */}
      <Content style={{ display: 'flex', padding: 16, gap: 16, overflow: 'hidden' }}>
        {selectedStep ? (
          <>
            {/* 输入面板 - 较小 */}
            <Card 
              title={
                <Space>
                  <Badge status="processing" />
                  <span style={{ fontSize: 13, fontWeight: 600 }}>输入数据</span>
                  <Text type="secondary" style={{ fontSize: 11 }}>Input</Text>
                </Space>
              }
              size="small" 
              style={{ width: '35%', display: 'flex', flexDirection: 'column' }}
              bodyStyle={{ flex: 1, overflow: 'hidden', padding: 12, display: 'flex', flexDirection: 'column' }}
            >
              <InputViewerWithPreview 
                data={selectedStep.input || { message: "无输入数据" }} 
                stepId={selectedStep.step_id}
                title="Input" 
              />
            </Card>
            
            {/* 输出面板 - 较大 */}
            <Card 
              title={
                <Space>
                  <Badge status="success" />
                  <span style={{ fontSize: 13, fontWeight: 600 }}>输出数据</span>
                  <Text type="secondary" style={{ fontSize: 11 }}>Output</Text>
                </Space>
              }
              size="small" 
              style={{ flex: 1, display: 'flex', flexDirection: 'column' }}
              bodyStyle={{ flex: 1, overflow: 'hidden', padding: 12, display: 'flex', flexDirection: 'column' }}
            >
              <JsonViewer data={selectedStep.output || { message: "无输出数据" }} title="Output" />
            </Card>
            
            {/* 笔记面板 */}
            <Card
              title={
                <Space>
                  <FormOutlined style={{ color: '#faad14' }} />
                  <span style={{ fontSize: 13, fontWeight: 600 }}>问题记录</span>
                  <Text type="secondary" style={{ fontSize: 11 }}>Notes</Text>
                </Space>
              }
              size="small"
              style={{ width: 280, display: 'flex', flexDirection: 'column' }}
              bodyStyle={{ flex: 1, overflow: 'hidden', padding: 12, display: 'flex', flexDirection: 'column' }}
            >
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 12, overflow: 'auto' }}>
                {/* 当前步骤笔记 */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between',
                    marginBottom: 6 
                  }}>
                    <Text strong style={{ fontSize: 11 }}>
                      <EditOutlined style={{ marginRight: 4 }} />
                      {selectedStep.step_name} 问题
                    </Text>
                    <Button
                      type="primary"
                      size="small"
                      icon={<SaveOutlined />}
                      onClick={saveStepNote}
                      disabled={savingNote}
                      loading={savingNote}
                      style={{ fontSize: 11 }}
                    >
                      保存
                    </Button>
                  </div>
                  <Input.TextArea
                    value={stepNoteContent}
                    onChange={e => setStepNoteContent(e.target.value)}
                    placeholder={`记录 ${selectedStep.step_name} 的问题、错误或备注...`}
                    style={{ 
                      flex: 1, 
                      resize: 'none',
                      fontSize: 12,
                      minHeight: 80
                    }}
                  />
                  {notes.notes?.[selectedStep.step_id]?.updated_at && (
                    <Text type="secondary" style={{ fontSize: 10, marginTop: 4 }}>
                      <ClockCircleOutlined style={{ marginRight: 4 }} />
                      更新: {new Date(notes.notes[selectedStep.step_id].updated_at).toLocaleString()}
                    </Text>
                  )}
                </div>
                
                {/* 工作流整体笔记 */}
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                  <div style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    justifyContent: 'space-between',
                    marginBottom: 6 
                  }}>
                    <Text strong style={{ fontSize: 11 }}>
                      <FileTextOutlined style={{ marginRight: 4 }} />
                      工作流总结
                    </Text>
                    <Button
                      type="primary"
                      size="small"
                      icon={<SaveOutlined />}
                      onClick={saveWorkflowNote}
                      disabled={savingNote}
                      loading={savingNote}
                      style={{ fontSize: 11 }}
                    >
                      保存
                    </Button>
                  </div>
                  <Input.TextArea
                    value={workflowNoteContent}
                    onChange={e => setWorkflowNoteContent(e.target.value)}
                    placeholder="记录本次工作流的整体问题、改进建议..."
                    style={{ 
                      flex: 1, 
                      resize: 'none',
                      fontSize: 12,
                      minHeight: 80
                    }}
                  />
                </div>
              </div>
            </Card>
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Empty description="点击上方步骤查看详情" />
          </div>
        )}
      </Content>
    </Layout>
  );
  
  return (
    <Layout style={{ minHeight: '100vh', background: '#f5f5f5' }}>
      {/* 顶部导航栏（仅列表页显示） */}
      {!selectedLog && (
        <Header style={{ 
          background: '#fff', 
          padding: '0 24px', 
          borderBottom: '1px solid #e8e8e8',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between'
        }}>
          <Space size={16}>
            <HistoryOutlined style={{ fontSize: 24, color: '#13c2c2' }} />
            <div>
              <Title level={4} style={{ margin: 0 }}>历史解析记录</Title>
              <Text type="secondary" style={{ fontSize: 11 }}>查看所有工作流执行历史</Text>
            </div>
          </Space>
          
          <Button icon={<ArrowLeftOutlined />} onClick={() => navigate('/document/extraction')}>
            返回工作流
          </Button>
        </Header>
      )}
      
      <Content>
        <Spin spinning={detailLoading}>
          {selectedLog ? renderDetailView() : renderListView()}
        </Spin>
      </Content>
    </Layout>
  );
}
