import React, { useCallback, useEffect, useMemo, useState } from 'react'
import {
  Alert, Badge, Button, Descriptions, Divider, Drawer, Empty, Progress, Space,
  Spin, Tag, Typography, Tree, message,
} from 'antd'
import { AimOutlined, CloudServerOutlined, FileTextOutlined, SyncOutlined } from '@ant-design/icons'

import { getAdminExtractionTaskTrace } from '../../api/admin'
import { appThemeToken } from '../../styles/themeTokens'
import { JobInspector } from './modules/JobInspector'
import { extractionTraceStatusMeta, planStatusMeta } from './modules/extractionObservatoryShared'

const { Text } = Typography

const ExtractionTaskObservatory = ({ open, taskId, onClose }) => {
  const [trace, setTrace] = useState(null)
  const [loading, setLoading] = useState(false)
  const [selectedDocId, setSelectedDocId] = useState(null)
  const [selectedJobId, setSelectedJobId] = useState(null)

  const fetchTrace = useCallback(async () => {
    if (!taskId) return
    setLoading(true)
    try {
      const res = await getAdminExtractionTaskTrace(taskId, { include_prompts: false })
      setTrace(res?.data || null)
    } catch {
      message.error('加载追踪数据失败')
    } finally {
      setLoading(false)
    }
  }, [taskId])

  useEffect(() => {
    if (!open || !taskId) return
    setTrace(null)
    setSelectedDocId(null)
    setSelectedJobId(null)
    fetchTrace()
  }, [open, taskId, fetchTrace])

  const summary = trace?.summary
  const plan = trace?.plan
  const documents = trace?.documents || []
  const isRunning = summary?.status === 'running' || summary?.status === 'pending'

  const treeData = useMemo(() => documents.map((doc) => {
    const planMeta = planStatusMeta[doc.status] || { label: doc.status, color: 'default' }
    return {
      key: doc.document_id,
      title: (
        <Space size={4}>
          <Text ellipsis style={{ maxWidth: 200 }}>{doc.file_name || doc.document_id?.slice(0, 8)}</Text>
          <Tag color={planMeta.color} style={{ margin: 0 }}>{planMeta.label}</Tag>
        </Space>
      ),
      children: (doc.jobs || []).map((job) => {
        const statusMeta = extractionTraceStatusMeta[job.status] || { label: job.status, color: 'default' }
        return {
          key: `${doc.document_id}:${job.extraction_job_id}`,
          title: (
            <Space size={4}>
              <AimOutlined />
              <Text ellipsis style={{ maxWidth: 180 }}>{job.target_form_key || job.match?.target_form_key || 'job'}</Text>
              <Tag color={statusMeta.color} style={{ margin: 0 }}>{statusMeta.label}</Tag>
            </Space>
          ),
          isLeaf: true,
          job,
          documentId: doc.document_id,
        }
      }),
    }
  }), [documents])

  const selectedJob = useMemo(() => {
    for (const doc of documents) {
      for (const job of doc.jobs || []) {
        if (job.extraction_job_id === selectedJobId) return job
      }
    }
    return null
  }, [documents, selectedJobId])

  const onTreeSelect = (_, info) => {
    if (info.node.job) {
      setSelectedDocId(info.node.documentId)
      setSelectedJobId(info.node.job.extraction_job_id)
      return
    }

    setSelectedDocId(info.node.key)
    const doc = documents.find((item) => item.document_id === info.node.key)
    const firstJob = doc?.jobs?.[0]
    setSelectedJobId(firstJob?.extraction_job_id || null)
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      width="92%"
      title={(
        <Space>
          <CloudServerOutlined />
          <span>抽取任务观测台</span>
          {summary && <Tag>{summary.task_type}</Tag>}
          {isRunning && <Badge status="processing" text="运行中" />}
        </Space>
      )}
      extra={<Button icon={<SyncOutlined />} onClick={fetchTrace} loading={loading}>刷新</Button>}
      destroyOnClose
    >
      {loading && !trace ? (
        <div style={{ textAlign: 'center', padding: 48 }}><Spin size="large" /></div>
      ) : !summary ? (
        <Empty description="无追踪数据" />
      ) : (
        <>
          <Descriptions size="small" column={3} bordered>
            <Descriptions.Item label="任务 ID" span={3}><Text copyable code>{summary.id}</Text></Descriptions.Item>
            <Descriptions.Item label="状态">
              <Tag color={extractionTraceStatusMeta[summary.status]?.color}>
                {extractionTraceStatusMeta[summary.status]?.label || summary.status}
              </Tag>
            </Descriptions.Item>
            <Descriptions.Item label="进度"><Progress percent={summary.progress} size="small" /></Descriptions.Item>
            <Descriptions.Item label="完成/失败">{summary.completed_count}/{summary.failed_count}</Descriptions.Item>
            {plan?.stats && (
              <Descriptions.Item label="规划" span={3}>
                <Space wrap>
                  <Text>计划 jobs: {plan.stats.planned_jobs ?? '-'}</Text>
                  <Text>跳过文档: {plan.stats.skipped_documents ?? '-'}</Text>
                  <Text>待处理文档: {plan.stats.pending_documents ?? '-'}</Text>
                </Space>
              </Descriptions.Item>
            )}
          </Descriptions>

          <Divider />

          <div style={{ display: 'flex', gap: 16, minHeight: 520 }}>
            <div style={{ width: 320, flexShrink: 0, borderRight: `1px solid ${appThemeToken.colorBorderSecondary}`, paddingRight: 12 }}>
              <Text strong style={{ display: 'block', marginBottom: 8 }}>
                <FileTextOutlined /> 文档 / Job 树 ({documents.length})
              </Text>
              {documents.length === 0 ? (
                <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} />
              ) : (
                <Tree
                  treeData={treeData}
                  defaultExpandAll
                  selectedKeys={selectedJobId ? [`${selectedDocId}:${selectedJobId}`] : (selectedDocId ? [selectedDocId] : [])}
                  onSelect={onTreeSelect}
                  height={480}
                />
              )}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              {selectedJob ? (
                <JobInspector job={selectedJob} taskId={taskId} isRunning={isRunning} />
              ) : (
                <Alert type="info" showIcon message="请在左侧选择文档下的 Job 查看匹配、LLM I/O 与落库详情" />
              )}
            </div>
          </div>
        </>
      )}
    </Drawer>
  )
}

export default ExtractionTaskObservatory
