/**
 * OCR 可视化测试页面
 * 
 * 用于测试 Textin/MinerU 解析结果的坐标溯源功能
 * 支持两种模式：
 * 1. 手动上传文件解析
 * 2. 通过 URL 参数 documentId 加载已解析的文档
 */

import React, { useState, useCallback, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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
  Alert,
  List,
  Tag,
  Tooltip,
  Drawer,
  Empty
} from 'antd';
import { 
  UploadOutlined, 
  ThunderboltOutlined,
  ScanOutlined,
  ScissorOutlined,
  ClearOutlined,
  HistoryOutlined,
  FileTextOutlined,
  ReloadOutlined,
  ArrowLeftOutlined
} from '@ant-design/icons';
import DocumentBboxViewer from '../../components/DocumentBboxViewer';
import { getDocumentDetail, getDocumentTempUrl } from '../../api/document';
import './styles.css';

const { Title, Text } = Typography;


const OcrViewerPage = () => {
  // 获取 URL 参数
  const { documentId } = useParams();
  const navigate = useNavigate();
  
  const [file, setFile] = useState(null);
  const [fileUrl, setFileUrl] = useState(null);
  const [parsing, setParsing] = useState(false);
  const [parseResult, setParseResult] = useState(null);
  const [ocrPageIndex, setOcrPageIndex] = useState(0);
  const [ocrDocFileType, setOcrDocFileType] = useState(null);
  
  // 解析器配置
  const [parserType, setParserType] = useState('textin');
  const [cropImage, setCropImage] = useState(false);
  const [removeWatermark, setRemoveWatermark] = useState(false);
  
  // 历史记录
  const [historyDrawerOpen, setHistoryDrawerOpen] = useState(false);
  const [historyList, setHistoryList] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  
  // 从后端加载的文档信息
  const [documentInfo, setDocumentInfo] = useState(null);
  const [documentLoading, setDocumentLoading] = useState(false);

  // 从后端加载文档详情（当有 documentId 参数时）
  const loadDocumentFromBackend = useCallback(async (docId) => {
    setDocumentLoading(true);
    setParsing(true);
    setParseResult(null);
    
    try {
      // 1. 获取文档详情（包含 content_list）
      const detailResponse = await getDocumentDetail(docId, {
        include_content: false,  // 不需要 OCR 原始返回
        include_versions: false,
        include_patients: false
      });
      
      if (!detailResponse.success || !detailResponse.data) {
        throw new Error(detailResponse.message || '获取文档详情失败');
      }
      
      const docData = detailResponse.data;
      setDocumentInfo(docData);
      
      // 检查文档是否已解析
      if (!docData.is_parsed) {
        message.warning('该文档尚未完成 OCR 解析');
        setParsing(false);
        setDocumentLoading(false);
        return;
      }
      
      // 检查是否有 content_list
      if (!docData.content_list || docData.content_list.length === 0) {
        message.warning('该文档没有可用的 OCR 坐标数据');
        setParsing(false);
        setDocumentLoading(false);
        return;
      }
      
      // 2. 获取文档临时访问 URL
      const urlResponse = await getDocumentTempUrl(docId);
      
      if (!urlResponse.success || !urlResponse.data?.temp_url) {
        throw new Error(urlResponse.message || '获取文档临时 URL 失败');
      }
      
      const ft = urlResponse.data?.file_type || null;
      setOcrDocFileType(ft);
      setOcrPageIndex(0);
      const cl = docData.content_list || [];
      setFileUrl(urlResponse.data.temp_url);
      setParseResult({
        success: true,
        parser_type: docData.task?.extracted_data?.parser_type || 'textin',
        content_list: cl,
        sensitive_regions: docData.sensitive_regions || [],
        markdown: '',
        page_count: docData.task?.extracted_data?.page_count || 1,
        file_name: docData.file_name,
        fromBackend: true
      });
      
      message.success(`已加载文档: ${docData.file_name}`);
      
    } catch (error) {
      console.error('Load document error:', error);
      message.error(error.message || '加载文档失败');
    } finally {
      setParsing(false);
      setDocumentLoading(false);
    }
  }, []);

  // 当有 documentId 参数时，自动加载文档
  useEffect(() => {
    if (documentId) {
      loadDocumentFromBackend(documentId);
    }
  }, [documentId, loadDocumentFromBackend]);

  // 加载历史记录
  const loadHistory = useCallback(async () => {
    setHistoryLoading(true);
    try {
      setHistoryList([]);
    } catch (error) {
      console.error('Failed to load history:', error);
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  // 初始加载历史记录（非文档模式时）
  useEffect(() => {
    if (!documentId) {
      loadHistory();
    }
  }, [loadHistory, documentId]);

  // 加载历史记录详情
  const loadHistoryRecord = useCallback(async (record) => {
    setParsing(true);
    setParseResult(null);
    setHistoryDrawerOpen(false);
    
    try {
      const data = { content_list: [], markdown: '', file_name: record.name };
      
      // 设置文件预览 URL（如果有原始文件）
      if (data.original_file) {
        const previewUrl = data.original_file;
        setFileUrl(previewUrl);
      }
      
      setParseResult({
        success: true,
        parser_type: record.parser_type,
        content_list: data.content_list || [],
        markdown: data.markdown || '',
        page_count: record.page_count || 1,
        file_name: data.file_name || record.name,
        fromHistory: true
      });
      
      message.success(`已加载历史记录: ${record.name}`);
      
    } catch (error) {
      console.error('Load history record error:', error);
      message.error(error.message);
    } finally {
      setParsing(false);
    }
  }, []);

  // 上传文件
  const handleUpload = useCallback(async (info) => {
    const uploadFile = info.file;
    
    // 创建预览 URL
    const url = URL.createObjectURL(uploadFile);
    setFileUrl(url);
    setFile(uploadFile);
    setParseResult(null);
    
    message.success(`文件已选择: ${uploadFile.name}`);
  }, []);

  // 执行解析
  const handleParse = useCallback(async () => {
    if (!file) {
      message.warning('请先选择文件');
      return;
    }

    setParsing(true);
    setParseResult(null);

    try {
      const result = {
        success: true,
        parser_type: parserType,
        content_list: [],
        markdown: '',
        page_count: 1,
        crop_enabled: cropImage
      };

      if (result.success) {
        setParseResult(result);
        message.success(`解析成功！共 ${result.content_list?.length || 0} 个内容块`);
        // 刷新历史记录
        loadHistory();
      } else {
        message.error(result.error || '解析失败');
      }

    } catch (error) {
      console.error('Parse error:', error);
      message.error(`${error.message}`, 10); // 显示 10 秒
    } finally {
      setParsing(false);
    }
  }, [file, parserType, cropImage, removeWatermark]);

  // 清空
  const handleClear = () => {
    setFile(null);
    setFileUrl(null);
    setParseResult(null);
    setDocumentInfo(null);
    // 如果是从文档详情跳转来的，清空后跳转到普通模式
    if (documentId) {
      navigate('/document/ocr-viewer');
    }
  };

  // 判断是否为文档模式（从其他页面带 documentId 跳转过来）
  const isDocumentMode = !!documentId;

  return (
    <div className="ocr-viewer-page">
      {/* 顶部控制栏 */}
      <Card className="control-card" size="small">
        <div className="control-bar">
          <div className="control-left">
            <Space>
              {isDocumentMode && (
                <Tooltip title="返回归档及审核">
                  <Button 
                    icon={<ArrowLeftOutlined />} 
                    onClick={() => navigate('/document/processing')}
                    style={{ marginRight: 8 }}
                  />
                </Tooltip>
              )}
              <Title level={4} style={{ margin: 0, color: '#e94560' }}>
                <ScanOutlined /> OCR 坐标溯源可视化
              </Title>
              {documentInfo && (
                <Tag color="blue" style={{ marginLeft: 8 }}>
                  {documentInfo.file_name}
                </Tag>
              )}
            </Space>
          </div>

          <div className="control-center">
            <Space size="large">
              {/* 文件上传 - 仅在非文档模式下显示 */}
              {!isDocumentMode && (
                <>
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

                  {file && (
                    <Text type="secondary">
                      已选择: {file.name}
                    </Text>
                  )}
                </>
              )}
              
              {/* 文档模式信息显示 */}
              {isDocumentMode && documentInfo && (
                <Space>
                  <Text type="secondary">
                    文档ID: {documentId.substring(0, 8)}...
                  </Text>
                  <Tag color={documentInfo.is_parsed ? 'green' : 'orange'}>
                    {documentInfo.is_parsed ? '已解析' : '未解析'}
                  </Tag>
                  {documentInfo.task?.extracted_data?.page_count && (
                    <Tag>{documentInfo.task.extracted_data.page_count} 页</Tag>
                  )}
                  {documentInfo.task?.extracted_data?.content_blocks && (
                    <Tag>{documentInfo.task.extracted_data.content_blocks} 块</Tag>
                  )}
                </Space>
              )}

              {/* 非文档模式：显示解析器选择 */}
              {!isDocumentMode && (
                <>
                  <Divider type="vertical" />

                  {/* 解析器选择 */}
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

                  {/* Textin 特有选项 */}
                  {parserType === 'textin' && (
                    <>
                      <Divider type="vertical" />
                      <Space>
                        <ScissorOutlined />
                        <Text>切边:</Text>
                        <Switch 
                          checked={cropImage} 
                          onChange={setCropImage}
                          size="small"
                        />
                      </Space>
                      <Space>
                        <ClearOutlined />
                        <Text>去水印:</Text>
                        <Switch 
                          checked={removeWatermark} 
                          onChange={setRemoveWatermark}
                          size="small"
                        />
                      </Space>
                    </>
                  )}
                </>
              )}
            </Space>
          </div>

          <div className="control-right">
            <Space>
              {/* 非文档模式：显示解析和历史记录按钮 */}
              {!isDocumentMode && (
                <>
                  <Button 
                    type="primary"
                    icon={<ThunderboltOutlined />}
                    onClick={handleParse}
                    loading={parsing}
                    disabled={!file}
                  >
                    开始解析
                  </Button>
                  <Button 
                    icon={<HistoryOutlined />}
                    onClick={() => {
                      loadHistory();
                      setHistoryDrawerOpen(true);
                    }}
                  >
                    历史记录
                  </Button>
                </>
              )}
              
              {/* 文档模式：显示刷新按钮 */}
              {isDocumentMode && (
                <Button 
                  icon={<ReloadOutlined />}
                  onClick={() => loadDocumentFromBackend(documentId)}
                  loading={documentLoading}
                >
                  刷新
                </Button>
              )}
              
              <Button onClick={handleClear}>
                清空
              </Button>
            </Space>
          </div>
        </div>
      </Card>

      {/* 历史记录抽屉 */}
      <Drawer
        title={
          <Space>
            <HistoryOutlined />
            <span>解析历史记录</span>
            <Button 
              type="text" 
              icon={<ReloadOutlined />} 
              size="small"
              onClick={loadHistory}
              loading={historyLoading}
            />
          </Space>
        }
        placement="right"
        width={480}
        open={historyDrawerOpen}
        onClose={() => setHistoryDrawerOpen(false)}
      >
        {historyList.length === 0 ? (
          <Empty description="暂无历史记录" />
        ) : (
          <List
            dataSource={historyList}
            loading={historyLoading}
            renderItem={(record) => (
              <List.Item
                className="history-item"
                onClick={() => loadHistoryRecord(record)}
                style={{ cursor: 'pointer' }}
              >
                <List.Item.Meta
                  avatar={<FileTextOutlined style={{ fontSize: 24, color: record.parser_type === 'textin' ? '#1890ff' : '#52c41a' }} />}
                  title={
                    <Space>
                      <span>{record.name}</span>
                      <Tag color={record.parser_type === 'textin' ? 'blue' : 'green'}>
                        {record.parser_type.toUpperCase()}
                      </Tag>
                    </Space>
                  }
                  description={
                    <Space direction="vertical" size={0}>
                      <Text type="secondary" style={{ fontSize: 12 }}>
                        {new Date(record.created_at).toLocaleString()}
                      </Text>
                      <Space size="small">
                        <Tooltip title="内容块数量">
                          <Tag>{record.content_blocks} 块</Tag>
                        </Tooltip>
                        {record.page_count > 0 && (
                          <Tooltip title="页数">
                            <Tag>{record.page_count} 页</Tag>
                          </Tooltip>
                        )}
                        {record.has_content_list && (
                          <Tooltip title="有坐标数据">
                            <Tag color="green">✓ 坐标</Tag>
                          </Tooltip>
                        )}
                      </Space>
                    </Space>
                  }
                />
              </List.Item>
            )}
          />
        )}
      </Drawer>

      {/* 提示信息 */}
      {!parseResult && !parsing && !documentLoading && (
        <Alert
          message={isDocumentMode ? "文档加载中" : "使用说明"}
          description={
            isDocumentMode ? (
              <div>
                <p>正在从后端加载文档 OCR 解析结果...</p>
                <p>如果长时间未加载，请检查文档是否已完成 OCR 解析。</p>
              </div>
            ) : (
              <div>
                <p>1. 点击「选择文件」上传 JPG/PNG/PDF 文档</p>
                <p>2. 选择解析器：Textin（云端API，支持切边去水印）或 MinerU（本地）</p>
                <p>3. 点击「开始解析」，等待解析完成</p>
                <p>4. 解析完成后，<strong>鼠标悬停</strong>在右侧内容块上，左侧会高亮显示对应区域</p>
              </div>
            )
          }
          type="info"
          showIcon
          style={{ margin: '16px 0' }}
        />
      )}

      {/* 解析结果展示 */}
      <div className="viewer-wrapper">
        {(parsing || documentLoading) ? (
          <div className="parsing-overlay">
            <Spin size="large" tip={isDocumentMode ? "正在加载文档..." : "正在解析文档..."} />
            <Text type="secondary" style={{ marginTop: 16 }}>
              {isDocumentMode 
                ? '正在从后端获取 OCR 解析结果...'
                : (parserType === 'textin' 
                    ? '正在调用 Textin API...' 
                    : '正在调用 MinerU...')}
            </Text>
          </div>
        ) : parseResult ? (
          <DocumentBboxViewer
            imageUrl={fileUrl}
            fileType={ocrDocFileType}
            contentList={parseResult.content_list || []}
            sensitiveRegions={parseResult.sensitive_regions || []}
            loading={false}
            pageIndex={ocrPageIndex}
            totalPages={parseResult.page_count || 1}
            onPageChange={async (newPage) => {
              setOcrPageIndex(newPage);
            }}
            pageAngle={(parseResult.content_list || []).find(b => b.page_idx === ocrPageIndex)?._page_angle || 0}
            title={parseResult.fromBackend 
              ? `文档 OCR 结果 (${parseResult.parser_type?.toUpperCase() || 'TEXTIN'})`
              : `${parseResult.parser_type?.toUpperCase()} 解析结果`}
          />
        ) : (
          <div className="empty-state">
            <ScanOutlined style={{ fontSize: 64, color: '#333' }} />
            <Text type="secondary" style={{ marginTop: 16 }}>
              {isDocumentMode ? '等待加载文档数据' : '请上传文档并点击解析'}
            </Text>
          </div>
        )}
      </div>

      {/* 解析统计 */}
      {parseResult && (
        <Card className="stats-card" size="small">
          <Space split={<Divider type="vertical" />}>
            {parseResult.fromBackend && (
              <Text type="success">✓ 来自后端</Text>
            )}
            <Text>解析器: <strong>{parseResult.parser_type?.toUpperCase() || 'TEXTIN'}</strong></Text>
            <Text>内容块: <strong>{parseResult.content_list?.length || 0}</strong></Text>
            <Text>页数: <strong>{parseResult.page_count || 1}</strong></Text>
            {parseResult.crop_enabled && <Text type="success">✓ 已切边</Text>}
            {!parseResult.fromBackend && (
              <Text type="secondary">Markdown 长度: {parseResult.markdown?.length || 0}</Text>
            )}
          </Space>
        </Card>
      )}
    </div>
  );
};

export default OcrViewerPage;

