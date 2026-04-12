import React, { useState, useRef } from 'react';
import {
  Layout,
  Card,
  Button,
  Typography,
  Space,
  Row,
  Col,
  Progress,
  Alert,
  Spin,
  message,
  Tag,
  Upload,
  Tooltip,
  Divider,
  Empty,
  Badge,
  Statistic,
  Steps,
  Collapse,
  Tabs
} from 'antd';
import {
  PlayCircleOutlined,
  ReloadOutlined,
  FileTextOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  LoadingOutlined,
  DownloadOutlined,
  InboxOutlined,
  DeleteOutlined,
  FileExcelOutlined,
  FileOutlined,
  ClockCircleOutlined,
  ExportOutlined,
  EyeOutlined,
  CloudServerOutlined,
  CodeOutlined,
  ApiOutlined,
  SafetyCertificateOutlined,
  RightOutlined,
  CopyOutlined,
  ExpandOutlined,
  CompressOutlined
} from '@ant-design/icons';
import * as XLSX from 'xlsx';

const { Content } = Layout;
const { Title, Text } = Typography;
const { Dragger } = Upload;
const { Panel } = Collapse;


// 工作流步骤配置（4步：OCR → 分类 → Schema裁剪 → LLM抽取）
const WORKFLOW_STEPS = [
  { id: 'textin', name: 'OCR解析', fullName: 'TextinService', icon: <EyeOutlined />, color: '#1890ff', description: '文档 OCR 识别' },
  { id: 'indexer', name: '文档分类', fullName: 'IndexerAgent', icon: <CloudServerOutlined />, color: '#722ed1', description: '识别文档类型' },
  { id: 'prompt_gen', name: 'Schema裁剪', fullName: 'PromptGenerator', icon: <CodeOutlined />, color: '#eb2f96', description: '生成抽取 Prompt' },
  { id: 'extractor', name: 'LLM抽取', fullName: 'ExtractorAgent', icon: <ApiOutlined />, color: '#52c41a', description: 'LLM 字段抽取（最终结果）' }
];

// 文件状态枚举
const FILE_STATUS = {
  PENDING: 'pending',
  UPLOADING: 'uploading',
  PROCESSING: 'processing',
  SUCCESS: 'success',
  ERROR: 'error'
};

// API 服务 - 本地模式
const apiService = {
  async uploadFile(file) {
    return {
      success: true,
      file_path: `local/${file?.name || 'unknown-file'}`
    };
  },
  
  async runExtraction(filePath) {
    return {
      success: true,
      steps: [],
      final_result: { file_path: filePath, extracted_data: {}, metadata: {} }
    };
  }
};

// 格式化时间
const formatDuration = (ms) => {
  if (!ms || ms === 0) return '-';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
};

// 格式化文件大小
const formatFileSize = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

// Excel 单元格最大字符数限制
const EXCEL_MAX_CELL_LENGTH = 32000; // 留一些余量，实际限制是 32767

// 截断超长文本以适应 Excel 单元格
const truncateForExcel = (text, maxLength = EXCEL_MAX_CELL_LENGTH) => {
  if (!text) return '';
  const str = typeof text === 'string' ? text : JSON.stringify(text, null, 2);
  if (str.length <= maxLength) return str;
  return str.substring(0, maxLength - 50) + '\n\n... [内容过长，已截断，共 ' + str.length + ' 字符] ...';
};

// 获取步骤索引
const getStepIndex = (stepId) => {
  return WORKFLOW_STEPS.findIndex(s => s.id === stepId);
};

// JSON 数据查看器组件
const JsonDataViewer = ({ data, title, maxHeight = 300 }) => {
  const [expanded, setExpanded] = useState(false);
  
  if (!data) {
    return <Text type="secondary" style={{ fontSize: 12 }}>无数据</Text>;
  }
  
  const jsonStr = typeof data === 'string' ? data : JSON.stringify(data, null, 2);
  const isLong = jsonStr.length > 500;
  
  return (
    <div>
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: 4
      }}>
        <Text type="secondary" style={{ fontSize: 11 }}>{title}</Text>
        <Space size={4}>
          {isLong && (
            <Button
              type="text"
              size="small"
              icon={expanded ? <CompressOutlined /> : <ExpandOutlined />}
              onClick={() => setExpanded(!expanded)}
              style={{ fontSize: 10 }}
            >
              {expanded ? '收起' : '展开'}
            </Button>
          )}
          <Tooltip title="复制">
            <Button
              type="text"
              size="small"
              icon={<CopyOutlined />}
              onClick={() => {
                navigator.clipboard.writeText(jsonStr);
                message.success('已复制');
              }}
            />
          </Tooltip>
        </Space>
      </div>
      <div style={{ 
        background: '#1e1e1e', 
        borderRadius: 4, 
        padding: 8,
        maxHeight: expanded ? 'none' : maxHeight,
        overflow: 'auto'
      }}>
        <pre style={{ 
          margin: 0, 
          fontSize: 11, 
          color: '#4ec9b0',
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-all'
        }}>
          {jsonStr}
        </pre>
      </div>
    </div>
  );
};

// 单个步骤详情组件
const StepDetailCard = ({ step, stepConfig }) => {
  const [activeTab, setActiveTab] = useState('output');
  
  const statusColors = {
    success: '#52c41a',
    error: '#ff4d4f',
    running: stepConfig?.color || '#1890ff',
    pending: '#d9d9d9'
  };
  
  return (
    <Card
      size="small"
      style={{ 
        marginBottom: 8,
        borderLeft: `3px solid ${statusColors[step.status] || '#d9d9d9'}`
      }}
      bodyStyle={{ padding: 12 }}
    >
      {/* 步骤头部 */}
      <div style={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        marginBottom: 8
      }}>
        <Space>
          <span style={{ 
            width: 28, height: 28, borderRadius: 6,
            background: stepConfig?.color || '#d9d9d9',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            color: '#fff', fontSize: 14
          }}>
            {step.status === 'running' ? <LoadingOutlined spin /> : stepConfig?.icon}
          </span>
          <div>
            <Text strong>{stepConfig?.name || step.step_name}</Text>
            <Text type="secondary" style={{ fontSize: 11, marginLeft: 8 }}>
              {stepConfig?.fullName}
            </Text>
          </div>
        </Space>
        <Space>
          <Text type="secondary" style={{ fontSize: 12 }}>
            {formatDuration(step.execution_time)}
          </Text>
          <Tag 
            color={step.status === 'success' ? 'success' : step.status === 'error' ? 'error' : 'processing'}
            style={{ margin: 0 }}
          >
            {step.status === 'success' ? '成功' : step.status === 'error' ? '失败' : '处理中'}
          </Tag>
        </Space>
      </div>
      
      {/* 错误信息 */}
      {step.error && (
        <Alert
          type="error"
          message={step.error}
          style={{ marginBottom: 8 }}
          showIcon
        />
      )}
      
      {/* 输入/输出数据 Tabs */}
      <Tabs
        activeKey={activeTab}
        onChange={setActiveTab}
        size="small"
        items={[
          {
            key: 'output',
            label: (
              <span>
                <CheckCircleOutlined style={{ marginRight: 4 }} />
                输出 Output
              </span>
            ),
            children: (
              <JsonDataViewer 
                data={step.output_data} 
                title="步骤输出结果"
                maxHeight={250}
              />
            )
          },
          {
            key: 'input',
            label: (
              <span>
                <RightOutlined style={{ marginRight: 4 }} />
                输入 Input
              </span>
            ),
            children: (
              <JsonDataViewer 
                data={step.input_data} 
                title="步骤输入参数"
                maxHeight={200}
              />
            )
          }
        ]}
      />
    </Card>
  );
};

// 步骤进度组件（紧凑模式）
const StepProgressCompact = ({ currentStep, stepResults }) => {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
      {WORKFLOW_STEPS.map((step, index) => {
        const result = stepResults?.find(r => r.step_id === step.id);
        let status = 'wait';
        let color = '#d9d9d9';
        
        if (result) {
          if (result.status === 'success') {
            status = 'finish';
            color = '#52c41a';
          } else if (result.status === 'error') {
            status = 'error';
            color = '#ff4d4f';
          } else if (result.status === 'running') {
            status = 'process';
            color = step.color;
          }
        } else if (step.id === currentStep) {
          status = 'process';
          color = step.color;
        }
        
        return (
          <Tooltip key={step.id} title={`${step.name}: ${result?.status || '等待'}`}>
            <div style={{
              width: 20,
              height: 20,
              borderRadius: 4,
              background: color,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 10,
              color: status === 'wait' ? '#999' : '#fff'
            }}>
              {status === 'process' ? <LoadingOutlined spin style={{ fontSize: 10 }} /> : 
               status === 'finish' ? <CheckCircleOutlined style={{ fontSize: 10 }} /> :
               status === 'error' ? <CloseCircleOutlined style={{ fontSize: 10 }} /> :
               index + 1}
            </div>
          </Tooltip>
        );
      })}
    </div>
  );
};

// 主组件
export default function ExtractionDashboard() {
  // 文件列表状态
  const [fileList, setFileList] = useState([]);
  // 是否正在处理
  const [isProcessing, setIsProcessing] = useState(false);
  // 当前处理的文件索引
  const [currentFileIndex, setCurrentFileIndex] = useState(-1);
  // 日志
  const [logs, setLogs] = useState([]);
  // 展开的文件详情
  const [expandedFiles, setExpandedFiles] = useState([]);
  
  const logsEndRef = useRef(null);
  
  // 添加日志
  const addLog = (msg, type = 'info') => {
    const time = new Date().toLocaleTimeString();
    setLogs(prev => [...prev, { time, msg, type }]);
    setTimeout(() => {
      logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, 100);
  };

  // 上传前处理
  const beforeUpload = (file) => {
    const isValid = ['image/jpeg', 'image/png', 'application/pdf'].includes(file.type) ||
                    file.name.match(/\.(jpg|jpeg|png|pdf)$/i);
    if (!isValid) {
      message.error(`${file.name}: 只支持 JPG、PNG、PDF 格式`);
      return Upload.LIST_IGNORE;
    }
    
    if (file.size > 50 * 1024 * 1024) {
      message.error(`${file.name}: 文件大小不能超过 50MB`);
      return Upload.LIST_IGNORE;
    }
    
    const exists = fileList.some(f => f.name === file.name && f.size === file.size);
    if (exists) {
      message.warning(`${file.name}: 文件已存在`);
      return Upload.LIST_IGNORE;
    }
    
    const newFile = {
      id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      file: file,
      name: file.name,
      size: file.size,
      type: file.type,
      status: FILE_STATUS.PENDING,
      currentStep: null,
      stepResults: [],
      uploadedPath: null,
      finalResult: null,
      error: null,
      totalDuration: 0
    };
    
    setFileList(prev => [...prev, newFile]);
    addLog(`📎 添加文件: ${file.name} (${formatFileSize(file.size)})`);
    
    return false;
  };

  // 移除文件
  const removeFile = (fileId) => {
    setFileList(prev => prev.filter(f => f.id !== fileId));
  };

  // 清空所有文件
  const clearAllFiles = () => {
    setFileList([]);
    setLogs([]);
    setCurrentFileIndex(-1);
    setExpandedFiles([]);
    message.success('已清空所有文件');
  };

  // 更新文件状态
  const updateFile = (fileId, updates) => {
    setFileList(prev => prev.map(f => 
      f.id === fileId ? { ...f, ...updates } : f
    ));
  };

  // 更新文件的步骤结果
  const updateFileStep = (fileId, stepResult) => {
    setFileList(prev => prev.map(f => {
      if (f.id !== fileId) return f;
      
      const existingIndex = f.stepResults.findIndex(s => s.step_id === stepResult.step_id);
      let newStepResults;
      if (existingIndex >= 0) {
        newStepResults = [...f.stepResults];
        newStepResults[existingIndex] = stepResult;
      } else {
        newStepResults = [...f.stepResults, stepResult];
      }
      
      return {
        ...f,
        stepResults: newStepResults,
        currentStep: stepResult.step_id
      };
    }));
  };

  // 开始批量处理
  const startBatchProcessing = async () => {
    if (fileList.length === 0) {
      message.warning('请先添加文件');
      return;
    }
    
    const pendingFiles = fileList.filter(f => 
      f.status === FILE_STATUS.PENDING || f.status === FILE_STATUS.ERROR
    );
    
    if (pendingFiles.length === 0) {
      message.info('所有文件都已处理完成');
      return;
    }
    
    setIsProcessing(true);
    addLog(`🚀 开始批量处理 ${pendingFiles.length} 个文件...`, 'info');
    
    for (let i = 0; i < pendingFiles.length; i++) {
      const file = pendingFiles[i];
      const fileIndex = fileList.findIndex(f => f.id === file.id);
      setCurrentFileIndex(fileIndex);
      // 自动展开当前处理的文件
      setExpandedFiles(prev => [...new Set([...prev, file.id])]);
      
      const startTime = Date.now();
      
      try {
        addLog(`📤 [${i + 1}/${pendingFiles.length}] 上传文件: ${file.name}`, 'info');
        updateFile(file.id, { 
          status: FILE_STATUS.UPLOADING,
          currentStep: null,
          stepResults: []
        });
        
        const uploadResult = await apiService.uploadFile(file.file);
        const uploadedPath = uploadResult.file_path;
        
        updateFile(file.id, { 
          uploadedPath,
          status: FILE_STATUS.PROCESSING 
        });
        addLog(`✅ [${i + 1}/${pendingFiles.length}] 上传完成: ${file.name}`, 'success');
        
        addLog(`🔄 [${i + 1}/${pendingFiles.length}] 开始工作流: ${file.name}`, 'info');
        
        const extractionResult = await apiService.runExtraction(uploadedPath);
        
        // 更新每个步骤的结果（包含 input_data 和 output_data）
        if (extractionResult.steps) {
          for (const step of extractionResult.steps) {
            updateFileStep(file.id, step);
            
            const stepConfig = WORKFLOW_STEPS.find(s => s.id === step.step_id);
            const stepName = stepConfig?.name || step.step_name;
            
            if (step.status === 'success') {
              addLog(`  ✓ ${stepName} 完成 (${formatDuration(step.execution_time)})`, 'success');
            } else if (step.status === 'error') {
              addLog(`  ✗ ${stepName} 失败: ${step.error}`, 'error');
            }
          }
        }
        
        const totalDuration = Date.now() - startTime;
        
        if (extractionResult.success) {
          updateFile(file.id, { 
            status: FILE_STATUS.SUCCESS,
            finalResult: extractionResult.final_result,
            totalDuration
          });
          addLog(`✅ [${i + 1}/${pendingFiles.length}] 工作流完成: ${file.name} (${formatDuration(totalDuration)})`, 'success');
        } else {
          throw new Error(extractionResult.error?.message || '工作流执行失败');
        }
        
      } catch (error) {
        const totalDuration = Date.now() - startTime;
        updateFile(file.id, { 
          status: FILE_STATUS.ERROR,
          error: error.message,
          totalDuration
        });
        addLog(`❌ [${i + 1}/${pendingFiles.length}] 处理失败: ${file.name} - ${error.message}`, 'error');
      }
    }
    
    setIsProcessing(false);
    setCurrentFileIndex(-1);
    
    const successCount = fileList.filter(f => f.status === FILE_STATUS.SUCCESS).length;
    const failCount = fileList.filter(f => f.status === FILE_STATUS.ERROR).length;
    
    addLog(`🎉 批量处理完成！成功: ${successCount}, 失败: ${failCount}`, 'info');
    message.success(`处理完成！成功: ${successCount}, 失败: ${failCount}`);
  };

  // 导出为 Excel
  const exportToExcel = () => {
    const completedFiles = fileList.filter(f => 
      f.status === FILE_STATUS.SUCCESS || f.status === FILE_STATUS.ERROR
    );
    
    if (completedFiles.length === 0) {
      message.warning('暂无结果可导出');
      return;
    }
    
    // 主数据表
    const exportData = completedFiles.map((f, index) => {
      const result = f.finalResult;
      const metadata = result?.metadata?.文档元数据 || {};
      const extractedData = result?.extracted_data || {};
      const validation = result?.validation || {};
      const basicInfo = extractedData?.基本信息 || extractedData?.人口学情况 || {};
      const diagInfo = extractedData?.诊断信息 || {};
      
      // 获取诊断信息，可能是字符串或对象
      const diagText = (() => {
        const diag = diagInfo.出院诊断 || diagInfo.入院诊断 || diagInfo.主诊断 || '';
        if (typeof diag === 'string') return diag;
        if (Array.isArray(diag)) return diag.map(d => typeof d === 'object' ? JSON.stringify(d) : d).join('; ');
        if (typeof diag === 'object') return JSON.stringify(diag);
        return String(diag);
      })();

      return {
        '序号': index + 1,
        '文件名': f.name,
        '处理状态': f.status === FILE_STATUS.SUCCESS ? '成功' : '失败',
        '总耗时': formatDuration(f.totalDuration),
        '文档类型': metadata.文档类型 || '',
        '文档子类型': metadata.文档子类型 || '',
        '患者姓名': metadata.患者姓名 || basicInfo.患者姓名 || basicInfo.姓名 || '',
        '性别': basicInfo.性别 || '',
        '年龄': basicInfo.年龄 || '',
        '诊断': truncateForExcel(diagText, 1000), // 诊断信息限制在 1000 字符
        'OCR耗时': formatDuration(f.stepResults.find(s => s.step_id === 'textin')?.execution_time),
        '分类耗时': formatDuration(f.stepResults.find(s => s.step_id === 'indexer')?.execution_time),
        'Prompt耗时': formatDuration(f.stepResults.find(s => s.step_id === 'prompt_gen')?.execution_time),
        'LLM耗时': formatDuration(f.stepResults.find(s => s.step_id === 'extractor')?.execution_time),
        '错误信息': truncateForExcel(f.error || '', 500)
      };
    });
    
    const wb = XLSX.utils.book_new();
    const ws = XLSX.utils.json_to_sheet(exportData);
    ws['!cols'] = [
      { wch: 6 }, { wch: 30 }, { wch: 10 }, { wch: 10 },
      { wch: 15 }, { wch: 20 }, { wch: 12 }, { wch: 8 },
      { wch: 8 }, { wch: 40 }, { wch: 12 },
      { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 },
      { wch: 30 }
    ];
    XLSX.utils.book_append_sheet(wb, ws, '抽取结果');
    
    // 详细 JSON 数据
    const detailData = completedFiles
      .filter(f => f.status === FILE_STATUS.SUCCESS && f.finalResult)
      .map((f, index) => ({
        '序号': index + 1,
        '文件名': f.name,
        '抽取数据(JSON)': truncateForExcel(f.finalResult?.extracted_data || {})
      }));
    
    if (detailData.length > 0) {
      const wsDetail = XLSX.utils.json_to_sheet(detailData);
      wsDetail['!cols'] = [{ wch: 6 }, { wch: 30 }, { wch: 100 }];
      XLSX.utils.book_append_sheet(wb, wsDetail, '详细数据');
    }
    
    // 每个步骤的产物
    WORKFLOW_STEPS.forEach(stepConfig => {
      const stepData = completedFiles
        .filter(f => f.stepResults.some(s => s.step_id === stepConfig.id))
        .map((f, index) => {
          const step = f.stepResults.find(s => s.step_id === stepConfig.id);
          return {
            '序号': index + 1,
            '文件名': f.name,
            '状态': step?.status || '',
            '耗时': formatDuration(step?.execution_time),
            '输入(JSON)': truncateForExcel(step?.input_data || {}),
            '输出(JSON)': truncateForExcel(step?.output_data || {})
          };
        });
      
      if (stepData.length > 0) {
        const wsStep = XLSX.utils.json_to_sheet(stepData);
        wsStep['!cols'] = [{ wch: 6 }, { wch: 30 }, { wch: 8 }, { wch: 10 }, { wch: 80 }, { wch: 80 }];
        XLSX.utils.book_append_sheet(wb, wsStep, stepConfig.name);
      }
    });
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    XLSX.writeFile(wb, `文档抽取结果_${timestamp}.xlsx`);
    
    message.success('Excel 导出成功');
    addLog(`📊 导出 Excel: 文档抽取结果_${timestamp}.xlsx`, 'success');
  };

  // 导出日志
  const exportLogs = () => {
    if (logs.length === 0) {
      message.warning('暂无日志可导出');
      return;
    }
    
    const logContent = logs.map(log => `[${log.time}] ${log.msg}`).join('\n');
    const blob = new Blob([logContent], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    a.download = `抽取日志_${timestamp}.txt`;
    a.click();
    
    URL.revokeObjectURL(url);
    message.success('日志导出成功');
  };

  // 导出完整 JSON（无字符限制）
  const exportFullJson = () => {
    const completedFiles = fileList.filter(f => 
      f.status === FILE_STATUS.SUCCESS || f.status === FILE_STATUS.ERROR
    );
    
    if (completedFiles.length === 0) {
      message.warning('暂无结果可导出');
      return;
    }
    
    // 构建完整的导出数据
    const fullExportData = {
      exportTime: new Date().toISOString(),
      summary: {
        total: completedFiles.length,
        success: completedFiles.filter(f => f.status === FILE_STATUS.SUCCESS).length,
        error: completedFiles.filter(f => f.status === FILE_STATUS.ERROR).length
      },
      files: completedFiles.map(f => ({
        fileName: f.name,
        fileSize: f.size,
        status: f.status,
        totalDuration: f.totalDuration,
        error: f.error || null,
        // 所有步骤的完整数据
        steps: f.stepResults.map(step => ({
          stepId: step.step_id,
          stepName: step.step_name,
          status: step.status,
          executionTime: step.execution_time,
          inputData: step.input_data,
          outputData: step.output_data,
          error: step.error || null
        })),
        // 最终结果
        finalResult: f.finalResult || null
      }))
    };
    
    const jsonString = JSON.stringify(fullExportData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    a.download = `抽取结果完整数据_${timestamp}.json`;
    a.click();
    
    URL.revokeObjectURL(url);
    message.success('JSON 完整数据导出成功');
    addLog(`📦 导出完整 JSON: 抽取结果完整数据_${timestamp}.json (${(jsonString.length / 1024).toFixed(1)} KB)`, 'success');
  };

  // 计算统计数据
  const stats = {
    total: fileList.length,
    pending: fileList.filter(f => f.status === FILE_STATUS.PENDING).length,
    processing: fileList.filter(f => f.status === FILE_STATUS.UPLOADING || f.status === FILE_STATUS.PROCESSING).length,
    success: fileList.filter(f => f.status === FILE_STATUS.SUCCESS).length,
    error: fileList.filter(f => f.status === FILE_STATUS.ERROR).length
  };
  
  const overallProgress = stats.total > 0 
    ? Math.round(((stats.success + stats.error) / stats.total) * 100) 
    : 0;

  return (
    <Layout style={{ minHeight: '100vh', background: '#f0f2f5', padding: 24 }}>
      <Content>
        {/* 页面标题 */}
        <div style={{ marginBottom: 24 }}>
          <Title level={3} style={{ margin: 0 }}>
            <ApiOutlined style={{ marginRight: 12, color: '#13c2c2' }} />
            AI抽取工作流测试
          </Title>
          <Text type="secondary">
            批量上传文档，可视化 5 步工作流（OCR → 分类 → Schema裁剪 → LLM抽取 → 校验），查看每步产物
          </Text>
        </div>
        
        <Row gutter={16}>
          {/* 左侧：上传区域和文件列表 */}
          <Col span={17}>
            {/* 上传区域 */}
            <Card 
              title={
                <Space>
                  <InboxOutlined />
                  <span>上传文档</span>
                  <Text type="secondary" style={{ fontWeight: 'normal', fontSize: 12 }}>
                    支持 JPG、PNG、PDF，单文件最大 50MB
                  </Text>
                </Space>
              }
              size="small"
              style={{ marginBottom: 16 }}
            >
              <Dragger
                multiple
                accept=".jpg,.jpeg,.png,.pdf"
                beforeUpload={beforeUpload}
                showUploadList={false}
                disabled={isProcessing}
                style={{ background: '#fafafa', borderStyle: 'dashed' }}
              >
                <p className="ant-upload-drag-icon">
                  <InboxOutlined style={{ fontSize: 48, color: '#13c2c2' }} />
                </p>
                <p className="ant-upload-text">点击或拖拽文件到此区域上传</p>
                <p className="ant-upload-hint">支持批量上传，可一次选择多个文件</p>
              </Dragger>
            </Card>
            
            {/* 文件列表 */}
            <Card 
              title={
                <Space>
                  <FileTextOutlined />
                  <span>处理队列</span>
                  <Badge count={fileList.length} style={{ backgroundColor: '#13c2c2' }} />
                </Space>
              }
              size="small"
              extra={
                <Button size="small" danger onClick={clearAllFiles} disabled={isProcessing || fileList.length === 0}>
                  清空全部
                </Button>
              }
              bodyStyle={{ maxHeight: 'calc(100vh - 380px)', overflow: 'auto' }}
            >
              {fileList.length === 0 ? (
                <Empty description="暂无文件，请上传文档" image={Empty.PRESENTED_IMAGE_SIMPLE} />
              ) : (
                <Collapse 
                  activeKey={expandedFiles}
                  onChange={setExpandedFiles}
                  expandIcon={({ isActive }) => <RightOutlined rotate={isActive ? 90 : 0} />}
                >
                  {fileList.map((file, index) => {
                    const isCurrentFile = index === currentFileIndex;
                    const statusConfig = {
                      [FILE_STATUS.PENDING]: { color: 'default', text: '等待中' },
                      [FILE_STATUS.UPLOADING]: { color: 'processing', text: '上传中' },
                      [FILE_STATUS.PROCESSING]: { color: 'processing', text: '处理中' },
                      [FILE_STATUS.SUCCESS]: { color: 'success', text: '完成' },
                      [FILE_STATUS.ERROR]: { color: 'error', text: '失败' }
                    };
                    const status = statusConfig[file.status];
                    
                    return (
                      <Panel
                        key={file.id}
                        header={
                          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', paddingRight: 16 }}>
                            <Space>
                              <Badge status={isCurrentFile ? 'processing' : 'default'} />
                              <FileOutlined style={{ color: '#1890ff' }} />
                              <Text strong={isCurrentFile}>{file.name}</Text>
                              <Text type="secondary" style={{ fontSize: 11 }}>({formatFileSize(file.size)})</Text>
                            </Space>
                            <Space size={16}>
                              {(file.status === FILE_STATUS.PROCESSING || file.status === FILE_STATUS.SUCCESS || file.status === FILE_STATUS.ERROR) && (
                                <StepProgressCompact 
                                  currentStep={file.currentStep} 
                                  stepResults={file.stepResults}
                                />
                              )}
                              <Tag color={status.color}>
                                {file.status === FILE_STATUS.PROCESSING && <LoadingOutlined spin style={{ marginRight: 4 }} />}
                                {status.text}
                              </Tag>
                              {file.totalDuration > 0 && (
                                <Text type="secondary" style={{ fontSize: 11 }}>{formatDuration(file.totalDuration)}</Text>
                              )}
                            </Space>
                          </div>
                        }
                        extra={
                          <Button
                            type="text"
                            danger
                            size="small"
                            icon={<DeleteOutlined />}
                            onClick={(e) => { e.stopPropagation(); removeFile(file.id); }}
                            disabled={isProcessing && (file.status === FILE_STATUS.UPLOADING || file.status === FILE_STATUS.PROCESSING)}
                          />
                        }
                      >
                        {/* 展开详情：每个步骤的产物 */}
                        <div style={{ padding: '8px 0' }}>
                          {/* 整体进度条 */}
                          <Steps
                            size="small"
                            current={file.currentStep ? getStepIndex(file.currentStep) : -1}
                            items={WORKFLOW_STEPS.map((step, idx) => {
                              const result = file.stepResults?.find(r => r.step_id === step.id);
                              let stepStatus = 'wait';
                              if (result) {
                                if (result.status === 'success') stepStatus = 'finish';
                                else if (result.status === 'error') stepStatus = 'error';
                                else if (result.status === 'running') stepStatus = 'process';
                              } else if (step.id === file.currentStep) {
                                stepStatus = 'process';
                              }
                              return {
                                title: step.name,
                                status: stepStatus,
                                icon: stepStatus === 'process' ? <LoadingOutlined /> : step.icon,
                                description: result?.execution_time ? formatDuration(result.execution_time) : null
                              };
                            })}
                          />
                          
                          {/* 每个步骤的详细产物 */}
                          {file.stepResults.length > 0 && (
                            <div style={{ marginTop: 16 }}>
                              <Divider style={{ margin: '12px 0' }}>
                                <Space>
                                  <CodeOutlined />
                                  <span>各步骤产物详情</span>
                                </Space>
                              </Divider>
                              
                              {file.stepResults.map(step => {
                                const stepConfig = WORKFLOW_STEPS.find(s => s.id === step.step_id);
                                return (
                                  <StepDetailCard 
                                    key={step.step_id}
                                    step={step}
                                    stepConfig={stepConfig}
                                  />
                                );
                              })}
                            </div>
                          )}
                          
                          {/* 错误信息 */}
                          {file.error && file.stepResults.length === 0 && (
                            <Alert
                              type="error"
                              message="处理失败"
                              description={file.error}
                              style={{ marginTop: 12 }}
                            />
                          )}
                        </div>
                      </Panel>
                    );
                  })}
                </Collapse>
              )}
            </Card>
          </Col>
          
          {/* 右侧：控制面板和日志 */}
          <Col span={7}>
            {/* 控制面板 */}
            <Card title="控制面板" size="small" style={{ marginBottom: 16 }}>
              <Space direction="vertical" style={{ width: '100%' }} size={12}>
                {isProcessing && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                      <Text>整体进度</Text>
                      <Text type="secondary">{stats.success + stats.error} / {stats.total}</Text>
                    </div>
                    <Progress 
                      percent={overallProgress} 
                      status="active"
                      strokeColor={{ '0%': '#13c2c2', '100%': '#52c41a' }}
                    />
                  </div>
                )}
                
                <Row gutter={8}>
                  <Col span={6}>
                    <Statistic title="总数" value={stats.total} valueStyle={{ fontSize: 18 }} />
                  </Col>
                  <Col span={6}>
                    <Statistic title="等待" value={stats.pending} valueStyle={{ fontSize: 18, color: '#999' }} />
                  </Col>
                  <Col span={6}>
                    <Statistic title="成功" value={stats.success} valueStyle={{ fontSize: 18, color: '#52c41a' }} />
                  </Col>
                  <Col span={6}>
                    <Statistic title="失败" value={stats.error} valueStyle={{ fontSize: 18, color: '#ff4d4f' }} />
                  </Col>
                </Row>
                
                <Divider style={{ margin: '8px 0' }} />
                
                <Button
                  type="primary"
                  icon={isProcessing ? <LoadingOutlined /> : <PlayCircleOutlined />}
                  onClick={startBatchProcessing}
                  disabled={isProcessing || fileList.length === 0}
                  loading={isProcessing}
                  block
                  size="large"
                  style={{ background: '#13c2c2', borderColor: '#13c2c2' }}
                >
                  {isProcessing ? '处理中...' : '开始批量处理'}
                </Button>
                
                <Row gutter={8} style={{ marginBottom: 8 }}>
                  <Col span={12}>
                    <Tooltip title="Excel 格式，适合查看摘要（超长内容会截断）">
                      <Button
                        icon={<FileExcelOutlined />}
                        onClick={exportToExcel}
                        disabled={stats.success + stats.error === 0}
                        block
                        size="small"
                        style={{ 
                          background: stats.success > 0 ? '#52c41a' : undefined, 
                          borderColor: stats.success > 0 ? '#52c41a' : undefined,
                          color: stats.success > 0 ? '#fff' : undefined 
                        }}
                      >
                        Excel摘要
                      </Button>
                    </Tooltip>
                  </Col>
                  <Col span={12}>
                    <Tooltip title="JSON 格式，完整数据无截断">
                      <Button
                        icon={<CodeOutlined />}
                        onClick={exportFullJson}
                        disabled={stats.success + stats.error === 0}
                        block
                        size="small"
                        type="primary"
                      >
                        JSON完整
                      </Button>
                    </Tooltip>
                  </Col>
                </Row>
                <Button
                  icon={<ExportOutlined />}
                  onClick={exportLogs}
                  disabled={logs.length === 0}
                  block
                  size="small"
                >
                  导出日志
                </Button>
                
                <Button
                  icon={<ReloadOutlined />}
                  onClick={clearAllFiles}
                  disabled={isProcessing}
                  block
                >
                  重置
                </Button>
              </Space>
            </Card>
            
            {/* 工作流步骤说明 */}
            <Card title="工作流步骤" size="small" style={{ marginBottom: 16 }}>
              <div style={{ fontSize: 12 }}>
                {WORKFLOW_STEPS.map((step, index) => (
                  <div key={step.id} style={{ 
                    display: 'flex', 
                    alignItems: 'center', 
                    padding: '6px 0',
                    borderBottom: index < WORKFLOW_STEPS.length - 1 ? '1px solid #f0f0f0' : 'none'
                  }}>
                    <span style={{ 
                      width: 24, height: 24, borderRadius: 6,
                      background: step.color,
                      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                      color: '#fff', fontSize: 12, marginRight: 8
                    }}>
                      {step.icon}
                    </span>
                    <div style={{ flex: 1 }}>
                      <Text strong style={{ fontSize: 12 }}>{step.name}</Text>
                      <Text type="secondary" style={{ fontSize: 10, display: 'block' }}>{step.description}</Text>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
            
            {/* 处理日志 */}
            <Card 
              title={
                <Space>
                  <span>处理日志</span>
                  <Badge count={logs.length} style={{ backgroundColor: '#13c2c2' }} />
                </Space>
              }
              size="small"
              bodyStyle={{ height: 200, overflow: 'auto', background: '#1e1e1e', padding: 12 }}
            >
              {logs.length === 0 ? (
                <Text style={{ color: '#666', fontStyle: 'italic' }}>
                  暂无日志...
                </Text>
              ) : (
                <div style={{ fontFamily: 'Monaco, Consolas, monospace', fontSize: 11 }}>
                  {logs.map((log, i) => (
                    <div 
                      key={i} 
                      style={{ 
                        color: log.type === 'error' ? '#ff4d4f' : 
                               log.type === 'success' ? '#52c41a' : '#d4d4d4',
                        marginBottom: 4,
                        lineHeight: 1.4
                      }}
                    >
                      <span style={{ opacity: 0.5, marginRight: 8 }}>[{log.time}]</span>
                      {log.msg}
                    </div>
                  ))}
                  <div ref={logsEndRef} />
                </div>
              )}
            </Card>
          </Col>
        </Row>
      </Content>
    </Layout>
  );
}
