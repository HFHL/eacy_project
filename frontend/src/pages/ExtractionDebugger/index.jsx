/**
 * AI 抽取调试器（简化版）
 * 需求：
 * - 只需要：选择患者 -> 点击抽取
 * - 自动根据 schema 生成表格（schema 叶子字段）
 * - 抽取后：有数据就填表格，没有就留空
 *
 * 说明：
 * - schema 后台自动加载（无按钮）
 * - 不在前端处理/保存任何 LLM API Key
 */
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Button, Card, Col, Empty, Progress, Row, Select, Space, Spin, Table, Tag, Typography, message } from 'antd';
import { PlayCircleOutlined, ReloadOutlined } from '@ant-design/icons';
import { getPatientList } from '../../api/patient';
import request from '../../api/request';
import './index.css';

const { Text } = Typography;

const DEFAULT_SCHEMA_PATH = '/app/app/肝胆外科字段集/gandan.schema.json';

function safeText(v) {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function parsePath(path) {
  // 支持 a.b[0].c 这种路径
  const tokens = [];
  const re = /([^[.\]]+)|\[(\d+)\]/g;
  let m;
  // eslint-disable-next-line no-cond-assign
  while ((m = re.exec(path))) {
    if (m[1]) tokens.push(m[1]);
    else if (m[2]) tokens.push(Number(m[2]));
  }
  return tokens;
}

function getByPath(obj, path) {
  if (!obj || !path) return undefined;
  const tokens = parsePath(path);
  let cur = obj;
  for (const t of tokens) {
    if (cur === null || cur === undefined) return undefined;
    cur = cur[t];
  }
  return cur;
}

function flattenSchemaLeaves(schema, basePath = '') {
  const out = [];
  if (!schema || typeof schema !== 'object') return out;

  const t = schema.type;
  if (t === 'object' && schema.properties && typeof schema.properties === 'object') {
    Object.entries(schema.properties).forEach(([k, def]) => {
      const next = basePath ? `${basePath}.${k}` : k;
      out.push(...flattenSchemaLeaves(def, next));
    });
    return out;
  }

  if (t === 'array' && schema.items) {
    // 简化：数组只展示第 1 个元素（[0]）的字段
    const next = `${basePath}[0]`;
    out.push(...flattenSchemaLeaves(schema.items, next));
    return out;
  }

  // 叶子字段
  out.push({
    path: basePath,
    type: schema.type || 'any',
    description: schema.description || '',
  });
  return out;
}

export default function ExtractionDebugger() {
  const [patients, setPatients] = useState([]);
  const [loadingPatients, setLoadingPatients] = useState(false);
  const [selectedPatientId, setSelectedPatientId] = useState('');

  const [schemaLoading, setSchemaLoading] = useState(false);
  const [schemaLeaves, setSchemaLeaves] = useState([]);

  const [running, setRunning] = useState(false);
  const [taskStatus, setTaskStatus] = useState(null); // {status, progress, message, result?}
  const [finalCrfData, setFinalCrfData] = useState(null);
  const [lastResult, setLastResult] = useState(null); // 单患者结果（用于追溯 logs / completeness）
  const [lastBatch, setLastBatch] = useState(null); // 原始 batch 返回（用于下载/追溯）

  const schemaPathRef = useRef(DEFAULT_SCHEMA_PATH);

  const loadPatients = async () => {
    setLoadingPatients(true);
    try {
      const res = await getPatientList({ page: 1, page_size: 100 });
      const list = res.data || res.items || [];
      setPatients(list);
      if (!selectedPatientId && list.length > 0) {
        setSelectedPatientId(list[0].id || list[0].patient_id);
      }
    } catch (e) {
      message.error(`加载患者失败：${e?.response?.data?.message || e.message}`);
    } finally {
      setLoadingPatients(false);
    }
  };

  const loadSchema = async () => {
    setSchemaLoading(true);
    try {
      const resp = await request.get('/debug/extraction/schema', {
        params: { schema_path: schemaPathRef.current },
        timeout: 30000,
      });
      const schema = resp?.data?.schema;
      const leaves = flattenSchemaLeaves(schema, '');
      setSchemaLeaves(leaves);
    } catch (e) {
      message.error(`加载 schema 失败：${e?.response?.data?.message || e.message}`);
    } finally {
      setSchemaLoading(false);
    }
  };

  useEffect(() => {
    loadPatients();
    loadSchema();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startExtraction = async () => {
    if (!selectedPatientId) {
      message.warning('请先选择患者');
      return;
    }

    setRunning(true);
    setTaskStatus({ status: 'starting', progress: 0, message: '启动任务...' });
    setFinalCrfData(null);
    setLastResult(null);
    setLastBatch(null);

    try {
      const startResp = await request.post('/debug/extraction/batch/start', {
        patient_ids: [selectedPatientId],
        schema_path: schemaPathRef.current,
      });

      const taskId = startResp?.data?.task_id;
      if (!taskId) throw new Error(startResp?.message || '启动任务失败：未返回 task_id');

      while (true) {
        // eslint-disable-next-line no-await-in-loop
        const statusResp = await request.get(`/debug/extraction/batch/status/${taskId}`, { timeout: 30000 });
        const st = statusResp?.data;
        setTaskStatus(st || null);

        if (st?.status === 'completed') {
          const batch = st?.result;
          const first = batch?.results?.[0];
          setLastBatch(batch || null);
          setLastResult(first || null);
          setFinalCrfData(first?.final_crf_data || {});
          message.success('抽取完成');
          break;
        }
        if (st?.status === 'failed') {
          throw new Error(st?.message || '抽取任务失败');
        }
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => setTimeout(r, 1500));
      }
    } catch (e) {
      message.error(`抽取失败：${e.message}`);
      setTaskStatus({ status: 'failed', progress: 0, message: e.message });
    } finally {
      setRunning(false);
    }
  };

  const filledCount = useMemo(() => {
    const data = finalCrfData || {};
    if (!data || typeof data !== 'object') return 0;
    let n = 0;
    for (const leaf of schemaLeaves) {
      const node = getByPath(data, leaf.path);
      if (node && typeof node === 'object' && Object.prototype.hasOwnProperty.call(node, 'value')) n += 1;
    }
    return n;
  }, [finalCrfData, schemaLeaves]);

  const tableData = useMemo(() => {
    const data = finalCrfData || {};
    return schemaLeaves.map((leaf, idx) => {
      const node = getByPath(data, leaf.path);
      const value = node && typeof node === 'object' && Object.prototype.hasOwnProperty.call(node, 'value') ? node.value : undefined;
      const source = node && typeof node === 'object' ? node.source : undefined;
      const confidence = node && typeof node === 'object' ? node.confidence : undefined;

      return {
        key: `${leaf.path}-${idx}`,
        path: leaf.path,
        type: leaf.type,
        description: leaf.description,
        valueText: value === undefined ? '' : safeText(value),
        source: source || '',
        confidence: typeof confidence === 'number' ? confidence : null,
      };
    });
  }, [schemaLeaves, finalCrfData]);

  const columns = [
    {
      title: '字段',
      dataIndex: 'path',
      key: 'path',
      width: 420,
      render: (v) => <code>{v}</code>,
    },
    {
      title: '描述',
      dataIndex: 'description',
      key: 'description',
      render: (v) => <Text type="secondary">{v || ''}</Text>,
    },
    {
      title: '值',
      dataIndex: 'valueText',
      key: 'valueText',
      render: (v) => (v ? <Text style={{ whiteSpace: 'pre-wrap' }}>{v}</Text> : <Text type="secondary">（空）</Text>),
    },
    {
      title: '来源',
      dataIndex: 'source',
      key: 'source',
      width: 140,
      render: (v) => (v ? <Tag color={v === 'patient_ehr' ? 'blue' : 'green'}>{v}</Tag> : <Tag>—</Tag>),
    },
    {
      title: '置信度',
      dataIndex: 'confidence',
      key: 'confidence',
      width: 110,
      render: (v) => (typeof v === 'number' ? <Tag>{Math.round(v * 100)}%</Tag> : <Tag>—</Tag>),
    },
  ];

  const patientOptions = patients.map((p) => ({
    label: `${p.name || '--'} (${p.patient_code || p.id || p.patient_id})`,
    value: p.id || p.patient_id,
  }));

  return (
    <div className="extraction-debugger">
      <Card
        title="AI 抽取调试器"
        extra={
          <Space>
            <Button icon={<ReloadOutlined />} onClick={loadPatients} loading={loadingPatients}>
              刷新患者
            </Button>
          </Space>
        }
      >
        <Alert
          type="info"
          showIcon
          message="使用说明"
          description="选择患者后点击「开始抽取」。页面会按 Schema 生成表格，抽取到的字段会填入表格，未抽取到的留空。"
          style={{ marginBottom: 16 }}
        />

        <Row gutter={12} style={{ marginBottom: 12 }}>
          <Col span={16}>
            <Select
              showSearch
              style={{ width: '100%' }}
              placeholder="选择患者"
              value={selectedPatientId || undefined}
              onChange={setSelectedPatientId}
              options={patientOptions}
            />
          </Col>
          <Col span={8}>
            <Button
              type="primary"
              icon={<PlayCircleOutlined />}
              onClick={startExtraction}
              loading={running}
              disabled={!selectedPatientId || schemaLoading}
              block
            >
              开始抽取
            </Button>
          </Col>
        </Row>

        {/* 追溯信息：抽取完成但全空时，直接把原因暴露出来 */}
        {!!lastResult && (
          <div style={{ marginBottom: 12 }}>
            <Row gutter={12}>
              <Col span={8}>
                <Text type="secondary">Schema 字段数：</Text>
                <Text style={{ marginLeft: 6 }}>{schemaLeaves.length}</Text>
              </Col>
              <Col span={8}>
                <Text type="secondary">已填字段：</Text>
                <Text style={{ marginLeft: 6 }}>{filledCount}</Text>
              </Col>
              <Col span={8}>
                <Text type="secondary">完整度（后端统计）：</Text>
                <Text style={{ marginLeft: 6 }}>
                  {typeof lastResult?.completeness?.overall === 'number' ? `${Math.round(lastResult.completeness.overall * 100)}%` : '—'}
                </Text>
              </Col>
            </Row>

            {filledCount === 0 && (
              <Alert
                style={{ marginTop: 10 }}
                type="warning"
                showIcon
                message="抽取完成但表格全空：请看下方「后端 logs」定位原因"
                description={
                  <div>
                    <div>最常见原因是：LLM 返回空内容 / JSON 不合法（虽任务 completed，但 final_crf_data 为空）。</div>
                    <div>也可能是：LLM 输出结构没按 schema（字段路径不匹配）。</div>
                  </div>
                }
              />
            )}

            <div style={{ marginTop: 10 }}>
              <Space>
                <Button
                  disabled={!lastResult}
                  onClick={() => {
                    const obj = {
                      patient_id: lastResult?.patient_id,
                      patient_name: lastResult?.patient_name,
                      schema_path: schemaPathRef.current,
                      completeness: lastResult?.completeness,
                      logs: lastResult?.logs,
                      final_crf_data: lastResult?.final_crf_data,
                    };
                    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json;charset=utf-8' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `debug_extraction_trace_${lastResult?.patient_id || 'patient'}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  下载追溯包（logs+final_crf_data）
                </Button>
                <Button
                  disabled={!lastBatch}
                  onClick={() => {
                    const blob = new Blob([JSON.stringify(lastBatch, null, 2)], { type: 'application/json;charset=utf-8' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `debug_extraction_raw_batch_${Date.now()}.json`;
                    a.click();
                    URL.revokeObjectURL(url);
                  }}
                >
                  下载原始返回（batch）
                </Button>
              </Space>
            </div>

            <div style={{ marginTop: 10 }}>
              <Card size="small" title="后端 logs（用于追溯）">
                {Array.isArray(lastResult?.logs) && lastResult.logs.length > 0 ? (
                  <div className="extraction-debugger-logs">
                    {lastResult.logs.map((l, idx) => (
                      // eslint-disable-next-line react/no-array-index-key
                      <div key={idx} className={`log-item log-${l.level || 'info'}`}>
                        <span className="log-time">—</span>
                        <span className="log-level">{l.level || 'info'}</span>
                        <span className="log-msg">{l.message}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <Empty description="无 logs（后端未返回），请在浏览器 Network 查看 status 返回体或贴 task_id" />
                )}
              </Card>
            </div>
          </div>
        )}

        {(schemaLoading || running) && (
          <div style={{ marginBottom: 12 }}>
            {schemaLoading ? (
              <Space>
                <Spin />
                <Text type="secondary">正在加载 Schema...</Text>
              </Space>
            ) : (
              <>
                <Progress percent={Math.round(taskStatus?.progress ?? 0)} />
                <Text type="secondary">{taskStatus?.message}</Text>
              </>
            )}
          </div>
        )}

        {!schemaLoading && schemaLeaves.length === 0 ? (
          <Empty description="Schema 字段为空或加载失败" />
        ) : (
          <Table
            columns={columns}
            dataSource={tableData}
            size="small"
            pagination={{ pageSize: 20 }}
            scroll={{ x: 1100 }}
          />
        )}
      </Card>
    </div>
  );
}


