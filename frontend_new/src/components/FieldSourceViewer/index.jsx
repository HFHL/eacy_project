/**
 * FieldSourceViewer - 字段来源预览组件
 * 
 * 功能：
 * - 展示字段值及其来源信息
 * - 显示原始文档片段（OCR 原文）
 * - 点击可展开查看完整来源详情
 * - 支持查看原始文档图片及高亮定位
 */

import React, { useState, useEffect } from 'react';
import { 
  Modal, 
  Tag, 
  Typography, 
  Space, 
  Tooltip, 
  Card, 
  Row, 
  Col,
  Empty,
  Spin,
  Tabs,
  Timeline,
  Divider
} from 'antd';
import {
  FileTextOutlined, 
  LinkOutlined,
  CheckCircleOutlined,
  FileImageOutlined,
  InfoCircleOutlined
} from '@ant-design/icons';
import { getFreshDocumentPdfStreamUrl, getDocumentTempUrl } from '../../api/document';
import { appThemeToken } from '../../styles/themeTokens';
import PdfPageWithHighlight from '../PdfPageWithHighlight';
import './styles.css';

const { Text, Paragraph } = Typography;

/**
 * 字段来源标签
 */
const SourceTag = ({ source, documentType, onClick }) => {
  const getTagColor = () => {
    if (source === 'from_document' || source === 'document') return 'green';
    if (source === 'llm_multi_agent' || source === 'llm') return 'purple';
    if (source === 'ehr') return 'blue';
    return 'default';
  };

  const getTagText = () => {
    if (source === 'from_document' || source === 'document') return '文档抽取';
    if (source === 'llm_multi_agent' || source === 'llm') return 'LLM 抽取';
    if (source === 'ehr') return 'EHR 数据';
    return source || '未知来源';
  };

  return (
    <Tooltip title={documentType ? `来源文档: ${documentType}` : '点击查看来源详情'}>
      <Tag 
        color={getTagColor()} 
        style={{ cursor: onClick ? 'pointer' : 'default' }}
        onClick={onClick}
        icon={<FileTextOutlined />}
      >
        {getTagText()}
        {documentType && <span style={{ marginLeft: 4, opacity: 0.8 }}>({documentType})</span>}
      </Tag>
    </Tooltip>
  );
};

/**
 * 原文片段高亮显示
 */
const RawTextHighlight = ({ raw, value }) => {
  if (!raw) return <Text type="secondary">无原文记录</Text>;

  // 尝试高亮匹配的值
  if (value && typeof value === 'string' && raw.includes(value)) {
    const parts = raw.split(value);
    return (
      <Text>
        {parts.map((part, index) => (
          <React.Fragment key={index}>
            {part}
            {index < parts.length - 1 && (
              <Text mark strong>{value}</Text>
            )}
          </React.Fragment>
        ))}
      </Text>
    );
  }

  return (
    <Paragraph 
      style={{ 
        margin: 0, 
        padding: '8px 12px',
        background: appThemeToken.colorFillTertiary,
        borderRadius: 4,
        borderLeft: `3px solid ${appThemeToken.colorPrimary}`,
        fontFamily: 'monospace',
        fontSize: 14,
        lineHeight: 1.6
      }}
    >
      {raw}
    </Paragraph>
  );
};

/**
 * 文档图片预览面板（带bbox高亮）
 * 
 * @param {string} documentId - 文档ID
 * @param {string} fileName - 文件名
 * @param {Array} bbox - 坐标 [x1, y1, x2, y2]，相对于图片的像素坐标
 * @param {number} pageIndex - 页码（从0开始）
 * @param {string} sourceId - 来源位置标识（如 p0.5）
 */
const DocumentBboxViewer = ({ documentId, fileName, bbox, pageIndex = 0, sourceId, pageAngle = 0 }) => {
  const [loading, setLoading] = useState(true);
  const [imageUrl, setImageUrl] = useState(null);
  const [fileType, setFileType] = useState(null);
  const [error, setError] = useState(null);
  const [imageDimensions, setImageDimensions] = useState({ width: 0, height: 0 });
  const [containerWidth, setContainerWidth] = useState(0);
  const containerRef = React.useRef(null);
  const imageRef = React.useRef(null);

  // bbox 可能是 [x1,y1,x2,y2] 或 8 点多边形；统一转成 4 点 min/max
  const normalizeBbox = (b) => {
    if (!Array.isArray(b) || b.length < 4) return null;
    if (b.length === 4) return b;
    if (b.length === 8) {
      const xs = [b[0], b[2], b[4], b[6]];
      const ys = [b[1], b[3], b[5], b[7]];
      const x1 = Math.min(...xs);
      const y1 = Math.min(...ys);
      const x2 = Math.max(...xs);
      const y2 = Math.max(...ys);
      return [x1, y1, x2, y2];
    }
    // 兜底：只取前四个
    return b.slice(0, 4);
  };

  const convertBboxToPixels = (b4, w, h) => {
    if (!Array.isArray(b4) || b4.length !== 4) return b4;
    const [x1, y1, x2, y2] = b4.map(v => Number(v));
    const maxV = Math.max(x1, y1, x2, y2);
    // 经验判断：<=1000 认为是归一化坐标
    if (maxV <= 1100) {
      return [
        (x1 / 1000) * w,
        (y1 / 1000) * h,
        (x2 / 1000) * w,
        (y2 / 1000) * h,
      ];
    }
    return [x1, y1, x2, y2];
  };

  useEffect(() => {
    if (!documentId) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    const loadDocument = async () => {
      setLoading(true);
      setError(null);
      try {
        const urlRes = await getDocumentTempUrl(documentId);
        if (cancelled) return;
        if (urlRes.success && urlRes.data?.temp_url) {
          const ft = urlRes.data?.file_type || urlRes.data?.mime_type || null;
          setFileType(ft);
          setImageUrl(String(ft).toLowerCase().includes('pdf') ? await getFreshDocumentPdfStreamUrl(documentId) : urlRes.data.temp_url);
        } else {
          setError('无法获取文档图片');
        }
      } catch (err) {
        if (!cancelled) {
          console.error('加载文档失败:', err);
          setError(err.message || '加载文档失败');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    loadDocument();
    return () => {
      cancelled = true;
    };
  }, [documentId, pageIndex, pageAngle]);

  // 监听容器宽度变化
  useEffect(() => {
    if (containerRef.current) {
      const updateWidth = () => {
        setContainerWidth(containerRef.current.offsetWidth);
      };
      updateWidth();
      window.addEventListener('resize', updateWidth);
      return () => window.removeEventListener('resize', updateWidth);
    }
  }, []);

  // 图片加载完成后获取原始尺寸
  const handleImageLoad = (e) => {
    const img = e.target;
    setImageDimensions({
      width: img.naturalWidth,
      height: img.naturalHeight
    });
  };

  // 计算bbox在缩放后图片上的位置
  const calculateBboxStyle = () => {
    const norm = normalizeBbox(bbox);
    if (!norm || norm.length !== 4 || !imageDimensions.width || !containerWidth) {
      return null;
    }

    // 支持归一化坐标（0-1000）以及像素坐标
    const [x1, y1, x2, y2] = convertBboxToPixels(norm, imageDimensions.width, imageDimensions.height);
    const displayWidth = Math.min(containerWidth - 32, imageDimensions.width);
    const scale = displayWidth / imageDimensions.width;
    
    // 计算缩放后的坐标
    const scaledX1 = x1 * scale;
    const scaledY1 = y1 * scale;
    const scaledWidth = (x2 - x1) * scale;
    const scaledHeight = (y2 - y1) * scale;

    return {
      position: 'absolute',
      left: scaledX1,
      top: scaledY1,
      width: scaledWidth,
      height: scaledHeight,
      border: `3px solid ${appThemeToken.colorError}`,
      backgroundColor: 'rgba(255, 77, 79, 0.15)',
      borderRadius: 4,
      pointerEvents: 'none',
      boxShadow: '0 0 8px rgba(255, 77, 79, 0.5)',
      transition: 'all 0.3s ease'
    };
  };

  if (!documentId) {
    return <Empty description="无关联文档" image={Empty.PRESENTED_IMAGE_SIMPLE} />;
  }

  if (loading) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 0' }}>
        <Spin tip="加载文档中..." size="large" />
      </div>
    );
  }

  if (error || !imageUrl) {
    return <Empty description={error || '无法加载文档图片'} image={Empty.PRESENTED_IMAGE_SIMPLE} />;
  }

  if (fileType === 'pdf') {
    return (
      <div
        ref={containerRef}
        style={{
          background: appThemeToken.colorFillTertiary,
          borderRadius: 8,
          padding: 16,
          maxHeight: '80vh',
          overflow: 'auto'
        }}
      >
        <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ color: appThemeToken.colorTextSecondary, fontSize: 14 }}>
            📄 {fileName || '原始文档'}
            <Tag color="blue" style={{ marginLeft: 8 }}>第 {(pageIndex || 0) + 1} 页</Tag>
          </div>
          <Space size={8}>
            {sourceId && (
              <Tag color="blue">位置: {sourceId}</Tag>
            )}
          </Space>
        </div>
        <PdfPageWithHighlight
          pdfUrl={imageUrl}
          pageNumber={(pageIndex || 0) + 1}
          locations={bbox ? [{ bbox, page: (pageIndex || 0) + 1 }] : []}
          maxWidth="100%"
          loading={false}
        />
      </div>
    );
  }

  const bboxStyle = calculateBboxStyle();
  const displayWidth = containerWidth ? Math.min(containerWidth - 32, imageDimensions.width || 800) : '100%';

  return (
    <div 
      ref={containerRef}
      style={{ 
        background: appThemeToken.colorFillTertiary,
        borderRadius: 8,
        padding: 16,
        maxHeight: '80vh',
        overflow: 'auto'
      }}
    >
      {/* 头部信息 */}
      <div style={{ marginBottom: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ color: appThemeToken.colorTextSecondary, fontSize: 14 }}>
          📄 {fileName || '原始文档'}
          {fileType === 'pdf' && <Tag color="blue" style={{ marginLeft: 8 }}>第 {(pageIndex || 0) + 1} 页</Tag>}
        </div>
        <Space size={8}>
          {sourceId && (
            <Tag color="blue">位置: {sourceId}</Tag>
          )}
          {bbox && bbox.length === 4 && (
            <Tag color="orange">
              坐标: [{bbox.map(v => Math.round(v)).join(', ')}]
            </Tag>
          )}
        </Space>
      </div>
      
      {/* Textin 坐标基于原始图像（straighten=0），需禁用 EXIF 并反向旋转 */}
      <div style={{
        position: 'relative',
        display: 'inline-block',
        ...(pageAngle ? {
          transform: `rotate(${-pageAngle}deg)`,
          transformOrigin: 'center center',
        } : {}),
      }}>
        <img 
          ref={imageRef}
          src={imageUrl} 
          alt={fileName || '原始文档'}
          onLoad={handleImageLoad}
          style={{ 
            width: displayWidth,
            maxWidth: '100%',
            boxShadow: '0 2px 12px rgba(0,0,0,0.15)',
            borderRadius: 4,
            background: appThemeToken.colorBgContainer,
            display: 'block',
            ...(pageAngle ? { imageOrientation: 'none' } : {}),
          }}
          onError={(e) => {
            e.target.style.display = 'none';
            setError('图片加载失败');
          }}
        />
        
        {/* Bbox 高亮框 */}
        {bboxStyle && (
          <div style={bboxStyle}>
            <div style={{
              position: 'absolute',
              top: -24,
              left: -3,
              background: appThemeToken.colorError,
              color: appThemeToken.colorBgContainer,
              fontSize: 12,
              padding: '2px 6px',
              borderRadius: '4px 4px 0 0',
              whiteSpace: 'nowrap'
            }}>
              抽取位置
            </div>
          </div>
        )}
      </div>
      
      {/* 无bbox时的提示 */}
      {(!bbox || bbox.length !== 4) && (
        <div style={{ 
          marginTop: 12, 
          padding: '8px 12px', 
          background: 'rgba(250, 173, 20, 0.1)', 
          border: `1px solid ${appThemeToken.colorWarning}`,
          borderRadius: 4,
          fontSize: 14,
          color: appThemeToken.colorWarning
        }}>
          暂无定位坐标信息，无法高亮显示抽取位置
        </div>
      )}
    </div>
  );
};

/**
 * 文档预览面板 - 简洁版，只显示原始文档图片（兼容旧版）
 */
const DocumentPreviewPanel = ({ documentId, fileName }) => {
  return <DocumentBboxViewer documentId={documentId} fileName={fileName} />;
};

/**
 * 字段来源详情弹窗（带文档预览）
 */
const FieldSourceModal = ({ 
  visible, 
  onClose, 
  fieldName, 
  fieldValue, 
  fieldData,
  audit,
  documents,
  changeLogs,
}) => {
  const [activeTab, setActiveTab] = useState('info');
  
  // 从 audit 或 fieldData 中提取字段信息
  // 优先级：fieldData > audit.fields[fieldName]
  // 注意：不能 fallback 到整个 audit 对象，否则会把 _task_results 等元数据字段混入
  const auditFields = (audit?.fields && fieldName in audit.fields)
    ? audit.fields[fieldName]
    : {};
  const fieldAudit = {
    ...auditFields,
    // 优先从 fieldData 获取这些字段（后端已在 flat[fid] 中填充）
    document_id: fieldData?.document_id || auditFields.document_id,
    document_type: fieldData?.document_type || auditFields.document_type,
    raw: fieldData?.raw || auditFields.raw,
    source_id: fieldData?.source_id || auditFields.source_id,
    bbox: fieldData?.bbox || auditFields.bbox,
    page_idx: fieldData?.page_idx || auditFields.page_idx,
  };
  const normalizeDocuments = (docs) => {
    if (!docs) return []
    if (Array.isArray(docs)) return docs.filter(Boolean)
    if (typeof docs === 'object') {
      return Object.entries(docs).map(([id, doc]) => ({ id, ...(doc || {}) }))
    }
    return []
  }

  const docsList = normalizeDocuments(documents)
  const explicitDocId = fieldAudit.document_id
  const explicitDocInfo = explicitDocId && documents ? documents[explicitDocId] : null
  const traceLevel = fieldAudit.trace_level || (explicitDocId ? 'field_audit' : 'untraceable')
  const ENABLE_DOCUMENT_FALLBACK = false

  // 提取叶子字段名（如果是完整路径）
  const displayFieldName = typeof fieldName === 'string' && fieldName.includes('/') 
    ? fieldName.split('/').pop() 
    : fieldName;

  // 无 document_id 时规则兜底：按字段名/文档类型匹配，匹配不到回退第一份文档
  const fallbackDoc = (() => {
    if (!ENABLE_DOCUMENT_FALLBACK || explicitDocId || docsList.length === 0) return null
    const keyword = String(displayFieldName || fieldName || '').toLowerCase()
    const sorted = docsList
      .map((doc, idx) => {
        const content = [
          doc.file_name,
          doc.fileName,
          doc.name,
          doc.document_type,
          doc.document_sub_type,
          fieldAudit.document_type
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase()
        const score = keyword && content.includes(keyword) ? 2 : 0
        return { doc, score, idx }
      })
      .sort((a, b) => (b.score - a.score) || (a.idx - b.idx))
    return sorted[0]?.doc || docsList[0]
  })()

  const docId = explicitDocId || fallbackDoc?.id
  const docInfo = explicitDocInfo || fallbackDoc || null

  // 渲染字段值（表单形式，而非 JSON）
  const renderFieldValue = (value) => {
    if (value === null || value === undefined) {
      return <Text type="secondary">—</Text>;
    }
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
      return (
        <Text strong style={{ fontSize: 16, color: appThemeToken.colorPrimary }}>
          {String(value) || '空'}
        </Text>
      );
    }
    if (Array.isArray(value)) {
      if (value.length === 0) {
        return <Text type="secondary">（空数组）</Text>;
      }
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {value.map((item, idx) => (
            <div key={idx} style={{ background: appThemeToken.colorFillTertiary, padding: '6px 10px', borderRadius: 4 }}>
              <Text type="secondary" style={{ marginRight: 6 }}>#{idx + 1}</Text>
              {typeof item === 'object' && item !== null ? (
                <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 8 }}>
                  {Object.entries(item).filter(([_, v]) => v != null && v !== '').slice(0, 5).map(([k, v]) => (
                    <span key={k}>
                      <Text type="secondary" style={{ fontSize: 12 }}>{k}: </Text>
                      <Text style={{ color: appThemeToken.colorPrimary }}>{String(v)}</Text>
                    </span>
                  ))}
                  {Object.entries(item).filter(([_, v]) => v != null && v !== '').length > 5 && (
                    <Text type="secondary" style={{ fontSize: 12 }}>+{Object.entries(item).filter(([_, v]) => v != null && v !== '').length - 5} 更多</Text>
                  )}
                </span>
              ) : (
                <Text strong style={{ color: appThemeToken.colorPrimary }}>{String(item)}</Text>
              )}
            </div>
          ))}
        </div>
      );
    }
    if (typeof value === 'object') {
      const entries = Object.entries(value).filter(([_, v]) => v != null && v !== '');
      if (entries.length === 0) {
        return <Text type="secondary">（空对象）</Text>;
      }
      return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {entries.map(([k, v]) => (
            <div key={k} style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <Text type="secondary" style={{ minWidth: 80, fontSize: 12 }}>{k}:</Text>
              <Text strong style={{ color: appThemeToken.colorPrimary }}>
                {typeof v === 'object' ? JSON.stringify(v) : String(v)}
              </Text>
            </div>
          ))}
        </div>
      );
    }
    return <Text>{String(value)}</Text>;
  };

  const tabItems = [
    {
      key: 'info',
      label: (
        <Space>
          <FileTextOutlined />
          来源信息
        </Space>
      ),
      children: (
        <div className="field-source-modal">
          {/* 字段值 */}
          <Card size="small" title="抽取结果" style={{ marginBottom: 16 }}>
            <Row gutter={16}>
              <Col span={8}>
                <Text type="secondary">字段名称</Text>
                <div><Text strong>{displayFieldName}</Text></div>
              </Col>
              <Col span={16}>
                <Text type="secondary">抽取值</Text>
                <div style={{ marginTop: 4 }}>
                  {renderFieldValue(fieldValue)}
                </div>
              </Col>
            </Row>
          </Card>

          {/* 来源文档信息 */}
          <Card size="small" title="来源文档" style={{ marginBottom: 16 }}>
            <div style={{ marginBottom: 12 }}>
              <Text type="secondary">溯源等级</Text>
              <div>
                <Tag color={traceLevel === 'untraceable' ? 'red' : traceLevel === 'task_fallback' ? 'gold' : 'green'}>
                  {traceLevel}
                </Tag>
              </div>
            </div>
            {docInfo ? (
              <Row gutter={16}>
                <Col span={8}>
                  <Text type="secondary">文档 ID</Text>
                  <div>
                    <Text code style={{ fontSize: 12 }}>{docId?.slice(0, 8)}...</Text>
                  </div>
                </Col>
                <Col span={8}>
                  <Text type="secondary">文档类型</Text>
                  <div>
                    <Tag color="blue">{docInfo.document_sub_type || docInfo.document_type || '未知'}</Tag>
                  </div>
                </Col>
                <Col span={8}>
                  <Text type="secondary">文件名</Text>
                  <div>
                    <Text ellipsis style={{ maxWidth: 150 }}>
                      {docInfo.file_name || '未知'}
                    </Text>
                  </div>
                </Col>
              </Row>
            ) : fieldAudit.document_type ? (
              <Row gutter={16}>
                <Col span={12}>
                  <Text type="secondary">文档类型</Text>
                  <div>
                    <Tag color="blue">{fieldAudit.document_type}</Tag>
                  </div>
                </Col>
                <Col span={12}>
                  <Text type="secondary">位置标识</Text>
                  <div>
                    <Text code>{fieldAudit.source_id || '未知'}</Text>
                  </div>
                </Col>
              </Row>
            ) : (
              <Empty description={traceLevel === 'untraceable' ? '无可追溯文档（untraceable）' : '无来源文档信息'} image={Empty.PRESENTED_IMAGE_SIMPLE} />
            )}
          </Card>

          {/* 原文片段 */}
          <Card 
            size="small" 
            title={
              <Space>
                <FileTextOutlined />
                OCR 原文片段
                {fieldAudit.source_id && (
                  <Tag size="small">位置: {fieldAudit.source_id}</Tag>
                )}
              </Space>
            }
          >
            <RawTextHighlight raw={fieldAudit.raw} value={fieldValue} />
          </Card>

          {/* 置信度信息 */}
          {fieldAudit.confidence && (
            <div style={{ marginTop: 16, textAlign: 'center' }}>
              <Space>
                <CheckCircleOutlined style={{ color: appThemeToken.colorSuccess }} />
                <Text type="secondary">
                  置信度: {typeof fieldAudit.confidence === 'number' 
                    ? `${(fieldAudit.confidence * 100).toFixed(0)}%` 
                    : fieldAudit.confidence}
                </Text>
              </Space>
            </div>
          )}
        </div>
      )
    },
    {
      key: 'preview',
      label: (
        <Space>
          <FileImageOutlined />
          文档定位
        </Space>
      ),
      disabled: !docId,
      children: (
        <DocumentBboxViewer 
          documentId={docId} 
          fileName={docInfo?.file_name || docInfo?.fileName || docInfo?.name}
          bbox={fieldAudit.bbox}
          pageIndex={fieldAudit.page_idx || fieldAudit.page}
          sourceId={fieldAudit.source_id}
          pageAngle={fieldAudit._page_angle || 0}
        />
      )
    }
    ,
    {
      key: 'history',
      label: (
        <Space>
          <InfoCircleOutlined />
          操作历史
        </Space>
      ),
      children: (() => {
        const extractedAt = audit?._extracted_at
        const extractionMode = audit?._extraction_mode
        const stats = audit?._stats
        const editedAt = audit?._edited_at
        const editedBy = audit?._edited_by
        const taskResults = Array.isArray(audit?._task_results) ? audit._task_results : []
        const logs = Array.isArray(changeLogs) ? changeLogs : []

        const matchedTasks = taskResults
          .filter(tr => tr && tr.audit && tr.audit.fields && (tr.audit.fields[fieldName] || tr.audit.fields[displayFieldName]))
          .map(tr => tr.task_name)

        const formatLogValue = (val) => {
          if (val === null || val === undefined) return '—'
          if (typeof val === 'string') return val.length > 80 ? val.slice(0, 80) + '…' : val
          if (Array.isArray(val)) {
            const json = JSON.stringify(val, null, 0)
            return json.length > 100 ? json.slice(0, 100) + '…' : json
          }
          if (typeof val === 'object') {
            const json = JSON.stringify(val, null, 0)
            return json.length > 100 ? json.slice(0, 100) + '…' : json
          }
          return String(val)
        }

        const changeTypeLabel = (ct) => {
          const map = {
            'initial_extract': '首次抽取',
            'merge_dedupe': '合并去重',
            'merge': '合并',
            'conflict_resolve': '冲突解决',
            'manual_edit': '手动编辑',
            'schema_migration': '模板迁移',
          }
          return map[ct] || ct || '变更'
        }

        const changeTypeColor = (ct) => {
          const map = {
            'initial_extract': 'green',
            'merge_dedupe': 'blue',
            'merge': 'cyan',
            'conflict_resolve': 'orange',
            'manual_edit': 'purple',
            'schema_migration': 'default',
          }
          return map[ct] || 'default'
        }

        return (
          <div>
            <Card size="small" title="概览" style={{ marginBottom: 12 }}>
              <Row gutter={16}>
                <Col span={12}>
                  <Text type="secondary">最近抽取</Text>
                  <div><Text>{extractedAt ? new Date(extractedAt).toLocaleString() : '—'}</Text></div>
                </Col>
                <Col span={12}>
                  <Text type="secondary">最近编辑</Text>
                  <div>
                    <Text>{editedAt ? new Date(editedAt).toLocaleString() : '—'}</Text>
                    {editedBy ? <Text type="secondary">（{String(editedBy).slice(0, 8)}…）</Text> : null}
                  </div>
                </Col>
              </Row>
              <Divider style={{ margin: '12px 0' }} />
              <Row gutter={16}>
                <Col span={12}>
                  <Text type="secondary">抽取模式</Text>
                  <div><Tag color="blue">{extractionMode || '—'}</Tag></div>
                </Col>
                <Col span={12}>
                  <Text type="secondary">字段命中任务</Text>
                  <div>
                    {matchedTasks.length ? (
                      <Space wrap>
                        {matchedTasks.slice(0, 4).map(t => <Tag key={t}>{t}</Tag>)}
                        {matchedTasks.length > 4 ? <Tag>+{matchedTasks.length - 4}</Tag> : null}
                      </Space>
                    ) : (
                      <Text type="secondary">—</Text>
                    )}
                  </div>
                </Col>
              </Row>
              {stats ? (
                <>
                  <Divider style={{ margin: '12px 0' }} />
                  <Row gutter={16}>
                    <Col span={8}>
                      <Text type="secondary">任务</Text>
                      <div><Text strong>{stats.completed_tasks ?? '—'}/{stats.total_tasks ?? '—'}</Text></div>
                    </Col>
                    <Col span={8}>
                      <Text type="secondary">字段</Text>
                      <div><Text strong>{stats.filled_fields ?? '—'}/{stats.total_fields ?? '—'}</Text></div>
                    </Col>
                    <Col span={8}>
                      <Text type="secondary">覆盖率</Text>
                      <div><Text strong>{typeof stats.coverage === 'number' ? `${Math.round(stats.coverage * 100)}%` : (stats.coverage ?? '—')}</Text></div>
                    </Col>
                  </Row>
                </>
              ) : null}
            </Card>

            {logs.length > 0 ? (
              <Card size="small" title={`修改历史（${logs.length}）`}>
                <Timeline
                  items={logs.map((log, idx) => ({
                    color: changeTypeColor(log.change_type),
                    children: (
                      <div key={idx}>
                        <div style={{ marginBottom: 4 }}>
                          <Tag color={changeTypeColor(log.change_type)} style={{ marginRight: 8 }}>
                            {changeTypeLabel(log.change_type)}
                          </Tag>
                          <Text type="secondary" style={{ fontSize: 12 }}>
                            {log.created_at ? new Date(log.created_at).toLocaleString() : ''}
                          </Text>
                          {log.operator_name ? (
                            <Text type="secondary" style={{ fontSize: 12, marginLeft: 8 }}>
                              {log.operator_name}
                            </Text>
                          ) : null}
                        </div>
                        {log.old_value != null || log.new_value != null ? (
                          <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.65)', marginBottom: 4 }}>
                            <Text type="secondary">新值: </Text>
                            <Text code style={{ wordBreak: 'break-all' }}>
                              {formatLogValue(log.new_value)}
                            </Text>
                          </div>
                        ) : null}
                        {log.remark ? (
                          <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>
                            备注: {log.remark}
                          </div>
                        ) : null}
                      </div>
                    )
                  }))}
                />
              </Card>
            ) : (
              <Card size="small" title="时间线">
                <Timeline
                  items={[
                    editedAt ? {
                      color: 'blue',
                      children: (
                        <div>
                          <Text strong>手工编辑</Text>
                          <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>
                            {new Date(editedAt).toLocaleString()} {editedBy ? `· ${String(editedBy).slice(0, 8)}…` : ''}
                          </div>
                        </div>
                      )
                    } : null,
                    extractedAt ? {
                      color: 'green',
                      children: (
                        <div>
                          <Text strong>CRF 抽取</Text>
                          <div style={{ fontSize: 12, color: 'rgba(0,0,0,0.45)' }}>
                            {new Date(extractedAt).toLocaleString()} {extractionMode ? `· ${extractionMode}` : ''}
                          </div>
                        </div>
                      )
                    } : null
                  ].filter(Boolean)}
                />
                {!editedAt && !extractedAt ? (
                  <Empty description="暂无历史记录（未抽取/未编辑）" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                ) : null}
              </Card>
            )}
          </div>
        )
      })()
    }
  ];

  return (
    <Modal
      title={
        <Space>
          <LinkOutlined />
          字段来源追踪 - {displayFieldName}
        </Space>
      }
      open={visible}
      onCancel={onClose}
      footer={null}
      width={900}
      styles={{ body: { padding: '12px 24px' } }}
    >
      <Tabs 
        activeKey={activeTab} 
        onChange={setActiveTab}
        items={tabItems}
      />
    </Modal>
  );
};

/**
 * 可点击的字段值（带来源预览）
 */
const ClickableFieldValue = ({ 
  fieldName, 
  fieldValue, 
  fieldData,
  audit,
  documents,
  showSourceTag = true
}) => {
  const [modalVisible, setModalVisible] = useState(false);
  
  // 支持多种 audit 格式
  const fieldAudit = audit?.fields?.[fieldName] || {};
  const hasAudit = fieldAudit.document_id || fieldAudit.raw || fieldAudit.document_type;
  
  const source = fieldData?.source || (hasAudit ? 'from_document' : null);
  const documentType = fieldAudit.document_type || fieldData?.document_type;

  const handleClick = () => {
    setModalVisible(true);
  };

  // 格式化显示值（简短形式，用于行内显示）
  const formatDisplayValue = (value) => {
    if (value === null || value === undefined) return '-';
    if (typeof value === 'string') return value || '-';
    if (typeof value === 'number' || typeof value === 'boolean') return String(value);
    if (Array.isArray(value)) {
      if (value.length === 0) return '-';
      const preview = value.slice(0, 2).map((item, idx) => 
        typeof item === 'object' 
          ? `[${idx + 1}] ${Object.values(item).filter(x => x != null).slice(0, 2).join(', ') || '...'}`
          : String(item)
      ).join('; ');
      return value.length > 2 ? `${preview} (+${value.length - 2})` : preview;
    }
    if (typeof value === 'object') {
      const entries = Object.entries(value).filter(([_, v]) => v != null && v !== '');
      if (entries.length === 0) return '-';
      const preview = entries.slice(0, 2).map(([k, v]) => 
        `${k}: ${typeof v === 'object' ? '...' : String(v).slice(0, 15)}`
      ).join('; ');
      return entries.length > 2 ? `${preview} (+${entries.length - 2})` : preview;
    }
    return String(value);
  };

  const displayValue = formatDisplayValue(fieldValue);

  return (
    <>
      <Space size={4} wrap>
        <Tooltip title="点击查看来源详情">
          <Text 
            style={{ cursor: 'pointer', color: appThemeToken.colorPrimary }}
            onClick={handleClick}
          >
            {displayValue}
          </Text>
        </Tooltip>
        {showSourceTag && source && (
          <SourceTag 
            source={source} 
            documentType={documentType}
            onClick={handleClick}
          />
        )}
      </Space>
      
      <FieldSourceModal
        visible={modalVisible}
        onClose={() => setModalVisible(false)}
        fieldName={fieldName}
        fieldValue={fieldValue}
        fieldData={fieldData}
        audit={audit}
        documents={documents}
      />
    </>
  );
};

export { SourceTag, RawTextHighlight, FieldSourceModal, DocumentBboxViewer, ClickableFieldValue };
export default ClickableFieldValue;
