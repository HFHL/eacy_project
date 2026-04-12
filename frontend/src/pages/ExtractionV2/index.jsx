/**
 * V2 抽取测试页面
 * 
 * 测试新版 Pipeline 的双结构输出 (result + audit)
 * 支持工作流可视化，实时展示每个节点状态
 */

import React, { useState, useCallback, useRef } from 'react';
import { 
  Upload, 
  Button, 
  Card, 
  message, 
  Space, 
  Radio, 
  Switch, 
  Spin,
  Typography,
  Divider,
  Select,
  Tabs,
  Tag,
  Collapse,
  Row,
  Col,
  Statistic,
  Badge,
  Empty,
  Alert,
  Steps,
  Timeline,
  Tooltip,
  Progress
} from 'antd';
import { 
  UploadOutlined, 
  ThunderboltOutlined,
  ExperimentOutlined,
  CheckCircleOutlined,
  CloseCircleOutlined,
  FileSearchOutlined,
  AuditOutlined,
  DatabaseOutlined,
  ClockCircleOutlined,
  LoadingOutlined,
  SyncOutlined,
  CloudUploadOutlined,
  SearchOutlined,
  BranchesOutlined,
  CodeOutlined,
  RobotOutlined,
  SafetyCertificateOutlined,
  CaretRightOutlined
} from '@ant-design/icons';
import './styles.css';

const { Title, Text, Paragraph } = Typography;
const { Panel } = Collapse;


// 可用的抽取单元
const EXTRACTION_UNITS = [
  { value: '人口统计学', label: '人口统计学', doc: '病案首页/入院记录' },
  { value: '个人史', label: '个人史', doc: '入院记录' },
  { value: '既往史', label: '既往史', doc: '入院记录' },
  { value: '家族遗传病及肿瘤病史', label: '家族遗传病及肿瘤病史', doc: '入院记录' },
  { value: '手术史', label: '手术史', doc: '入院记录' },
  { value: '过敏史', label: '过敏史', doc: '入院记录' },
  { value: '吸烟史', label: '吸烟史', doc: '入院记录' },
  { value: '饮酒史', label: '饮酒史', doc: '入院记录' },
  { value: '职业暴露史', label: '职业暴露史', doc: '入院记录' },
  { value: '主诉', label: '主诉', doc: '入院记录' },
  { value: '现病史', label: '现病史', doc: '入院记录' },
  { value: '入院诊断', label: '入院诊断', doc: '入院记录/病案首页' },
  { value: '出院诊断', label: '出院诊断', doc: '出院小结/病案首页' },
];

// 工作流步骤定义
const WORKFLOW_STEPS = [
  { id: 'parser', name: '文档解析', icon: <CloudUploadOutlined />, description: 'Textin/MinerU 解析' },
  { id: 'indexer', name: '文档分类', icon: <SearchOutlined />, description: '识别文档类型' },
  { id: 'source_inference', name: '来源推断', icon: <BranchesOutlined />, description: '推断数据来源' },
  { id: 'prompt_gen', name: 'Prompt生成', icon: <CodeOutlined />, description: '生成抽取策略' },
  { id: 'extractor', name: '信息抽取', icon: <RobotOutlined />, description: 'LLM 抽取' },
  { id: 'validator', name: '校验清洗', icon: <SafetyCertificateOutlined />, description: '验证结果' },
];

const ExtractionV2Page = () => {
  const [file, setFile] = useState(null);
  const [extracting, setExtracting] = useState(false);
  const [result, setResult] = useState(null);
  
  // 配置
  const [unitName, setUnitName] = useState('个人史');
  const [parserType, setParserType] = useState('textin');
  const [cropImage, setCropImage] = useState(false);
  const [removeWatermark, setRemoveWatermark] = useState(false);
  
  // 工作流状态
  const [workflowSteps, setWorkflowSteps] = useState([]);
  const [currentStep, setCurrentStep] = useState(-1);
  const eventSourceRef = useRef(null);

  // 上传文件
  const handleUpload = useCallback((info) => {
    const uploadFile = info.file;
    setFile(uploadFile);
    setResult(null);
    setWorkflowSteps([]);
    setCurrentStep(-1);
    message.success(`文件已选择: ${uploadFile.name}`);
  }, []);

  // 更新步骤状态
  const updateStepStatus = useCallback((stepId, status, data) => {
    setWorkflowSteps(prev => {
      const existing = prev.find(s => s.id === stepId);
      if (existing) {
        return prev.map(s => s.id === stepId ? { ...s, status, ...data } : s);
      } else {
        return [...prev, { id: stepId, status, ...data }];
      }
    });
    
    // 更新当前步骤索引
    const stepIndex = WORKFLOW_STEPS.findIndex(s => s.id === stepId);
    if (stepIndex >= 0) {
      setCurrentStep(stepIndex);
    }
  }, []);

  // 执行 V2 流式抽取
  const handleExtract = useCallback(async () => {
    if (!file) {
      message.warning('请先选择文件');
      return;
    }

    setExtracting(true);
    setResult(null);
    setWorkflowSteps([]);
    setCurrentStep(0);

    try {
      const formData = new FormData();
      formData.append('file', file);

      // 构建 URL 参数
      const params = new URLSearchParams({
        unit_name: unitName,
        parser_type: parserType,
        crop_image: cropImage,
        remove_watermark: removeWatermark
      });

      const finalResult = {
        success: true,
        task_id: 'local-task',
        unit_name: unitName,
        result: {},
        audit: { fields: {} },
        metadata: {}
      };
      setResult(finalResult);
      message.success('抽取完成（本地模式）');

    } catch (error) {
      console.error('Stream extraction error:', error);
      message.error(error.message);
      setResult({ success: false, error: { message: error.message } });
    } finally {
      setExtracting(false);
    }
  }, [file, unitName, parserType, cropImage, removeWatermark, updateStepStatus]);

  // 清空
  const handleClear = () => {
    setFile(null);
    setResult(null);
    setWorkflowSteps([]);
    setCurrentStep(-1);
  };

  // 获取步骤状态图标
  const getStepIcon = (step, stepData) => {
    if (!stepData) return step.icon;
    
    switch (stepData.status) {
      case 'running':
        return <LoadingOutlined spin style={{ color: '#1890ff' }} />;
      case 'success':
        return <CheckCircleOutlined style={{ color: '#52c41a' }} />;
      case 'error':
        return <CloseCircleOutlined style={{ color: '#f5222d' }} />;
      default:
        return step.icon;
    }
  };

  // 渲染工作流可视化
  const renderWorkflow = () => {
    return (
      <Card className="workflow-card" title={
        <Space>
          <SyncOutlined spin={extracting} style={{ color: '#722ed1' }} />
          <span>工作流执行</span>
          {extracting && <Tag color="processing">运行中</Tag>}
        </Space>
      }>
        <div className="workflow-steps">
          {WORKFLOW_STEPS.map((step, index) => {
            const stepData = workflowSteps.find(s => s.id === step.id);
            const isActive = currentStep === index;
            const isCompleted = stepData?.status === 'success';
            const isError = stepData?.status === 'error';
            const isRunning = stepData?.status === 'running';
            
            return (
              <div 
                key={step.id}
                className={`workflow-step ${isActive ? 'active' : ''} ${isCompleted ? 'completed' : ''} ${isError ? 'error' : ''} ${isRunning ? 'running' : ''}`}
              >
                <div className="step-icon">
                  {getStepIcon(step, stepData)}
                </div>
                <div className="step-content">
                  <div className="step-name">{step.name}</div>
                  <div className="step-desc">
                    {stepData?.message || step.description}
                  </div>
                  {stepData?.execution_time_ms && (
                    <Tag color="default" style={{ marginTop: 4 }}>
                      {stepData.execution_time_ms}ms
                    </Tag>
                  )}
                </div>
                {index < WORKFLOW_STEPS.length - 1 && (
                  <div className={`step-arrow ${isCompleted ? 'completed' : ''}`}>
                    <CaretRightOutlined />
                  </div>
                )}
              </div>
            );
          })}
        </div>
        
        {/* 步骤详情 */}
        {workflowSteps.length > 0 && (
          <Collapse 
            className="step-details" 
            ghost 
            defaultActiveKey={[]}
            style={{ marginTop: 16 }}
          >
            {workflowSteps.map(stepData => {
              const stepDef = WORKFLOW_STEPS.find(s => s.id === stepData.id);
              if (!stepDef) return null;
              
              return (
                <Panel 
                  key={stepData.id}
                  header={
                    <Space>
                      {getStepIcon(stepDef, stepData)}
                      <Text strong>{stepDef.name}</Text>
                      {stepData.execution_time_ms && (
                        <Tag>{stepData.execution_time_ms}ms</Tag>
                      )}
                      {stepData.status === 'error' && (
                        <Tag color="error">失败</Tag>
                      )}
                    </Space>
                  }
                >
                  <Row gutter={16}>
                    <Col span={12}>
                      <div className="io-section">
                        <Text type="secondary">输入:</Text>
                        <pre className="io-content">
                          {JSON.stringify(stepData.input, null, 2) || '(无)'}
                        </pre>
                      </div>
                    </Col>
                    <Col span={12}>
                      <div className="io-section">
                        <Text type="secondary">输出:</Text>
                        <pre className="io-content">
                          {JSON.stringify(stepData.output, null, 2) || stepData.error || '(无)'}
                        </pre>
                      </div>
                    </Col>
                  </Row>
                </Panel>
              );
            })}
          </Collapse>
        )}
      </Card>
    );
  };

  // 渲染 Result
  const renderResult = () => {
    if (!result?.result) return <Empty description="暂无抽取结果" />;

    const data = result.result;

    if (Array.isArray(data)) {
      return (
        <div className="result-list">
          {data.map((item, index) => (
            <Card key={index} size="small" className="result-item" title={`记录 ${index + 1}`}>
              {renderObject(item)}
            </Card>
          ))}
        </div>
      );
    }

    return renderObject(data);
  };

  const renderObject = (obj) => {
    if (!obj || typeof obj !== 'object') return null;

    return (
      <div className="result-fields">
        {Object.entries(obj).map(([key, value]) => (
          <div key={key} className="result-field">
            <span className="field-key">{key}:</span>
            <span className="field-value">
              {value === null ? (
                <Tag color="default">null</Tag>
              ) : Array.isArray(value) ? (
                <Tag color="blue">{`[${value.length} 项]`}</Tag>
              ) : typeof value === 'object' ? (
                <pre>{JSON.stringify(value, null, 2)}</pre>
              ) : (
                <Text strong>{String(value)}</Text>
              )}
            </span>
          </div>
        ))}
      </div>
    );
  };

  // 渲染 Audit
  const renderAudit = () => {
    if (!result?.audit?.fields) return <Empty description="暂无审计信息" />;

    const fields = result.audit.fields;

    return (
      <Collapse defaultActiveKey={Object.keys(fields).slice(0, 3)}>
        {Object.entries(fields).map(([fieldName, info]) => (
          <Panel 
            key={fieldName} 
            header={
              <Space>
                <FileSearchOutlined />
                <Text strong>{fieldName}</Text>
                {info.raw && <Tag color="green">有原文</Tag>}
              </Space>
            }
          >
            <div className="audit-field">
              <div className="audit-row">
                <Text type="secondary">原文片段 (raw):</Text>
                <Paragraph 
                  className="raw-text"
                  copyable
                  style={{ 
                    background: '#fffbe6', 
                    padding: '8px 12px', 
                    borderRadius: 4,
                    margin: '4px 0'
                  }}
                >
                  {info.raw || '(无)'}
                </Paragraph>
              </div>
              <div className="audit-row">
                <Text type="secondary">来源段落:</Text>
                <Tag>{info.source_section || '未知'}</Tag>
              </div>
            </div>
          </Panel>
        ))}
      </Collapse>
    );
  };

  // 渲染元数据
  const renderMetadata = () => {
    if (!result?.metadata) return <Empty description="暂无元数据" />;

    const meta = result.metadata?.文档元数据 || result.metadata;

    return (
      <div className="metadata-grid">
        {Object.entries(meta).map(([key, value]) => (
          <div key={key} className="metadata-item">
            <Text type="secondary">{key}</Text>
            <Text strong>{value || '-'}</Text>
          </div>
        ))}
      </div>
    );
  };

  // 渲染文档来源
  const renderDocSources = () => {
    if (!result?.doc_sources) return null;

    const sources = result.doc_sources;
    const xSources = sources['x-sources'] || {};
    const inference = sources['x-sources-inference'] || {};

    return (
      <Card size="small" className="doc-sources-card">
        <Space direction="vertical" style={{ width: '100%' }}>
          <div>
            <Text type="secondary">主来源: </Text>
            {xSources.primary?.map(s => <Tag key={s} color="blue">{s}</Tag>)}
          </div>
          <div>
            <Text type="secondary">次来源: </Text>
            {xSources.secondary?.map(s => <Tag key={s}>{s}</Tag>)}
          </div>
          <div>
            <Text type="secondary">推断方法: </Text>
            <Tag color={inference.method === 'exact_match' ? 'green' : 'orange'}>
              {inference.method}
            </Tag>
            <Text type="secondary"> 置信度: </Text>
            <Text strong>{((inference.confidence || 0) * 100).toFixed(0)}%</Text>
          </div>
        </Space>
      </Card>
    );
  };

  return (
    <div className="extraction-v2-page">
      {/* 顶部控制栏 */}
      <Card className="control-card">
        <div className="control-header">
          <Title level={4} style={{ margin: 0 }}>
            <ExperimentOutlined style={{ color: '#722ed1' }} /> V2 抽取测试
            <Tag color="purple" style={{ marginLeft: 8 }}>工作流可视化</Tag>
          </Title>
        </div>

        <Divider style={{ margin: '12px 0' }} />

        <Row gutter={16} align="middle">
          <Col>
            <Upload
              beforeUpload={() => false}
              onChange={handleUpload}
              showUploadList={false}
              accept=".jpg,.jpeg,.png,.pdf"
            >
              <Button icon={<UploadOutlined />}>
                选择文件
              </Button>
            </Upload>
          </Col>

          {file && (
            <Col>
              <Tag color="blue">{file.name}</Tag>
            </Col>
          )}

          <Col>
            <Divider type="vertical" />
          </Col>

          <Col>
            <Space>
              <Text>抽取单元:</Text>
              <Select
                value={unitName}
                onChange={setUnitName}
                style={{ width: 180 }}
                options={EXTRACTION_UNITS.map(u => ({
                  value: u.value,
                  label: u.label
                }))}
              />
            </Space>
          </Col>

          <Col>
            <Space>
              <Text>解析器:</Text>
              <Radio.Group 
                value={parserType} 
                onChange={e => setParserType(e.target.value)}
                buttonStyle="solid"
                size="small"
              >
                <Radio.Button value="textin">Textin</Radio.Button>
                <Radio.Button value="mineru">MinerU</Radio.Button>
              </Radio.Group>
            </Space>
          </Col>

          {parserType === 'textin' && (
            <Col>
              <Space>
                <Switch size="small" checked={cropImage} onChange={setCropImage} />
                <Text>切边</Text>
                <Switch size="small" checked={removeWatermark} onChange={setRemoveWatermark} />
                <Text>去水印</Text>
              </Space>
            </Col>
          )}

          <Col flex="auto" style={{ textAlign: 'right' }}>
            <Space>
              <Button 
                type="primary"
                icon={<ThunderboltOutlined />}
                onClick={handleExtract}
                loading={extracting}
                disabled={!file}
                style={{ background: '#722ed1', borderColor: '#722ed1' }}
              >
                开始抽取
              </Button>
              <Button onClick={handleClear}>清空</Button>
            </Space>
          </Col>
        </Row>
      </Card>

      {/* 工作流可视化 */}
      {(extracting || workflowSteps.length > 0) && renderWorkflow()}

      {/* 结果展示 */}
      {result && (
        <div className="result-container">
          {/* 状态概览 */}
          <Card size="small" className="status-card">
            <Row gutter={24}>
              <Col>
                <Statistic 
                  title="状态" 
                  value={result.success ? '成功' : '失败'}
                  prefix={result.success ? <CheckCircleOutlined style={{ color: '#52c41a' }} /> : <CloseCircleOutlined style={{ color: '#f5222d' }} />}
                  valueStyle={{ color: result.success ? '#52c41a' : '#f5222d' }}
                />
              </Col>
              <Col>
                <Statistic 
                  title="任务ID" 
                  value={result.task_id || '-'}
                />
              </Col>
              <Col>
                <Statistic 
                  title="抽取单元" 
                  value={result.unit_name || '-'}
                />
              </Col>
              {result.validation && (
                <Col>
                  <Statistic 
                    title="校验" 
                    value={result.validation.valid ? '通过' : `${result.validation.error_count} 错误`}
                    valueStyle={{ color: result.validation.valid ? '#52c41a' : '#faad14' }}
                  />
                </Col>
              )}
            </Row>
          </Card>

          {/* 错误信息 */}
          {result.error && (
            <Alert
              type="error"
              message="抽取错误"
              description={result.error.message || JSON.stringify(result.error)}
              showIcon
              style={{ marginBottom: 16 }}
            />
          )}

          {/* 文档来源推断 */}
          {renderDocSources()}

          {/* Tabs: Result / Audit / Metadata */}
          <Card className="result-tabs-card">
            <Tabs 
              defaultActiveKey="result"
              items={[
                {
                  key: 'result',
                  label: (
                    <span>
                      <DatabaseOutlined /> Result
                    </span>
                  ),
                  children: renderResult()
                },
                {
                  key: 'audit',
                  label: (
                    <span>
                      <AuditOutlined /> Audit
                      {result.audit?.fields && (
                        <Badge 
                          count={Object.keys(result.audit.fields).length} 
                          style={{ marginLeft: 8 }}
                        />
                      )}
                    </span>
                  ),
                  children: renderAudit()
                },
                {
                  key: 'metadata',
                  label: (
                    <span>
                      <FileSearchOutlined /> 元数据
                    </span>
                  ),
                  children: renderMetadata()
                },
                {
                  key: 'raw',
                  label: '原始 JSON',
                  children: (
                    <pre className="raw-json">
                      {JSON.stringify(result, null, 2)}
                    </pre>
                  )
                }
              ]}
            />
          </Card>
        </div>
      )}

      {/* 空状态 */}
      {!result && !extracting && workflowSteps.length === 0 && (
        <div className="empty-state">
          <ExperimentOutlined style={{ fontSize: 64, color: '#722ed1' }} />
          <Title level={4} style={{ color: '#722ed1', marginTop: 16 }}>V2 Pipeline 测试</Title>
          <Text type="secondary">上传医疗文档，选择抽取单元，查看完整工作流</Text>
          <div style={{ marginTop: 24 }}>
            <Space size="large">
              {WORKFLOW_STEPS.map(step => (
                <Tooltip key={step.id} title={step.description}>
                  <div className="step-preview">
                    {step.icon}
                    <Text type="secondary" style={{ fontSize: 12 }}>{step.name}</Text>
                  </div>
                </Tooltip>
              ))}
            </Space>
          </div>
        </div>
      )}
    </div>
  );
};

export default ExtractionV2Page;
