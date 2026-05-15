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
import { getCrfFieldEvidence } from '../../api/project';
import { appThemeToken } from '../../styles/themeTokens';
import PdfPageWithHighlight from '../PdfPageWithHighlight';
import HighlightedImage from '../HighlightedImage';
import './styles.css';

const isPdfFileLike = ({ fileType, fileName, fileUrl } = {}) => {
  const type = String(fileType || '').toLowerCase();
  const name = String(fileName || '').toLowerCase();
  const url = String(fileUrl || '').toLowerCase();
  const cleanUrl = url.split('?')[0].split('#')[0];
  return (
    type === 'pdf' ||
    type === '.pdf' ||
    type.includes('application/pdf') ||
    name.endsWith('.pdf') ||
    cleanUrl.endsWith('.pdf')
  );
};

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
 * 文档证据预览面板：完全按电子病历夹（EhrTab）的方式渲染坐标。
 *
 * 输入 evidence 数组（每条带 source_location.polygon + page_width/page_height）：
 * - PDF 文件 → 复用 PdfPageWithHighlight 的 polygon 路径
 * - 图片文件 → 复用 HighlightedImage（裁剪 + 容器填充）
 *
 * 不再消费旧的 LLM 4 元组 bbox：科研侧的字段坐标历史上靠 1100 阈值兜底，
 * 视觉上"乱画"，因此本组件只走 evidence 链路；evidence 缺失时显示空态。
 */
const EvidenceDocumentViewer = ({ evidences, loading }) => {
  const [docInfo, setDocInfo] = useState(null);
  const [docError, setDocError] = useState(null);
  const [docLoading, setDocLoading] = useState(false);

  const validEvidences = Array.isArray(evidences) ? evidences.filter(Boolean) : [];
  const primary = validEvidences[0] || null;
  const documentId = primary?.document_id || primary?.source_location?.document_id || null;

  useEffect(() => {
    if (!documentId) {
      setDocInfo(null);
      setDocError(null);
      return;
    }
    let cancelled = false;
    const loadDocument = async () => {
      setDocLoading(true);
      setDocError(null);
      try {
        const urlRes = await getDocumentTempUrl(documentId);
        if (cancelled) return;
        if (urlRes.success && urlRes.data?.temp_url) {
          const fileName = urlRes.data?.file_name || '';
          const fileType = urlRes.data?.file_type || urlRes.data?.mime_type || '';
          const isPdf = isPdfFileLike({ fileType, fileName, fileUrl: urlRes.data.temp_url });
          const url = isPdf
            ? await getFreshDocumentPdfStreamUrl(documentId)
            : urlRes.data.temp_url;
          if (!cancelled) {
            setDocInfo({ url, fileName, fileType, isPdf });
          }
        } else {
          setDocError('无法获取文档');
        }
      } catch (err) {
        if (!cancelled) {
          console.error('加载文档失败:', err);
          setDocError(err.message || '加载文档失败');
        }
      } finally {
        if (!cancelled) setDocLoading(false);
      }
    };
    loadDocument();
    return () => {
      cancelled = true;
    };
  }, [documentId]);

  if (loading || docLoading) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 0' }}>
        <Spin tip="加载文档中..." size="large" />
      </div>
    );
  }

  if (!documentId) {
    return (
      <Empty
        description="暂无定位坐标信息（该字段的抽取记录中未保存坐标证据）"
        image={Empty.PRESENTED_IMAGE_SIMPLE}
      />
    );
  }

  if (docError || !docInfo?.url) {
    return <Empty description={docError || '无法加载文档'} image={Empty.PRESENTED_IMAGE_SIMPLE} />;
  }

  const sourceLocations = validEvidences
    .map(item => item.source_location)
    .filter(Boolean);

  // 头部信息：文件名 + 页码
  const pageNo = sourceLocations[0]?.page || sourceLocations[0]?.page_no || 1;

  return (
    <div
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
          📄 {docInfo.fileName || '原始文档'}
          <Tag color="blue" style={{ marginLeft: 8 }}>第 {pageNo} 页</Tag>
        </div>
        {validEvidences.length > 1 && (
          <Tag color="purple">{validEvidences.length} 个溯源片段</Tag>
        )}
      </div>

      {docInfo.isPdf ? (
        <PdfPageWithHighlight
          pdfUrl={docInfo.url}
          pageNumber={sourceLocations.length > 0 ? pageNo : null}
          locations={sourceLocations}
          maxWidth="100%"
          loading={false}
        />
      ) : (
        <HighlightedImage
          imageUrl={docInfo.url}
          sourceLocation={sourceLocations}
          loading={false}
        />
      )}
    </div>
  );
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
  // 科研项目专用：用于拉取 CRF evidence（与电子病历夹同链路渲染坐标）
  projectId,
  projectPatientId,
  fieldPath,
}) => {
  const [activeTab, setActiveTab] = useState('info');
  const [evidences, setEvidences] = useState([]);
  const [evidenceLoading, setEvidenceLoading] = useState(false);

  // 拉取 CRF evidence：完全按电子病历夹（EhrTab）的方式渲染坐标。
  // 不再依赖 LLM 抽取的 4 元组 bbox，避免坐标"乱画"。
  useEffect(() => {
    if (!visible || !projectId || !projectPatientId || !fieldPath) {
      setEvidences([]);
      return;
    }
    let cancelled = false;
    setEvidenceLoading(true);
    getCrfFieldEvidence(projectId, projectPatientId, fieldPath)
      .then((res) => {
        if (cancelled) return;
        setEvidences(res?.success && Array.isArray(res.data) ? res.data : []);
      })
      .catch((err) => {
        console.error('加载字段证据失败:', err);
        if (!cancelled) setEvidences([]);
      })
      .finally(() => {
        if (!cancelled) setEvidenceLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [visible, projectId, projectPatientId, fieldPath]);
  
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
      // 走 evidence 链路：有 evidence 才能精确定位，没有就显示空态（不再回退到旧 bbox）
      disabled: !evidenceLoading && evidences.length === 0,
      children: (
        <EvidenceDocumentViewer
          evidences={evidences}
          loading={evidenceLoading}
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
  showSourceTag = true,
  // 科研项目专用：透传给 FieldSourceModal 用于拉取 CRF evidence（坐标渲染走 EhrTab 同链路）
  projectId,
  projectPatientId,
  fieldPath,
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
        projectId={projectId}
        projectPatientId={projectPatientId}
        fieldPath={fieldPath}
      />
    </>
  );
};

export { SourceTag, RawTextHighlight, FieldSourceModal, ClickableFieldValue };
export default ClickableFieldValue;
