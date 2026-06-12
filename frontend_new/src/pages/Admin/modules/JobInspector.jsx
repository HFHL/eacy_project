import React from 'react'
import { Alert, Descriptions, Tag, Tabs, Typography } from 'antd'

import { useExtractionProgressSSE } from '../../../hooks'
import { ExtractedFieldsTable, FieldSpecsTable } from './ExtractionTraceTables'
import { EventTimeline } from './TraceEventTimeline'
import { LlmCallPanel } from './LlmCallPanel'
import { renderJSON } from './extractionObservatoryShared'

const { Text } = Typography

export const JobInspector = ({ job, taskId, isRunning }) => {
  const match = job?.match || {}
  const run = job?.extraction_run || job?.runs?.[job.runs.length - 1]
  const snapshot = run?.input_snapshot_json
  const { events } = useExtractionProgressSSE(taskId, {
    enabled: isRunning && !!job?.item_id,
    itemId: job?.item_id,
  })
  const displayEvents = events.length ? events : (job?.events || [])

  const tabItems = [
    {
      key: 'match',
      label: '匹配',
      children: (
        <Descriptions size="small" column={1} bordered>
          <Descriptions.Item label="目标表单"><Text code>{match.target_form_key || job?.target_form_key || '-'}</Text></Descriptions.Item>
          <Descriptions.Item label="匹配角色"><Tag>{match.match_role || '-'}</Tag></Descriptions.Item>
          <Descriptions.Item label="匹配原因">{match.planned_reason || '-'}</Descriptions.Item>
          <Descriptions.Item label="来源">{match.source || '-'}</Descriptions.Item>
          <Descriptions.Item label="input_json">{renderJSON(job?.input_json)}</Descriptions.Item>
        </Descriptions>
      ),
    },
    { key: 'progress', label: '进度', children: <EventTimeline events={displayEvents} /> },
    {
      key: 'snapshot',
      label: `快照 (${(snapshot?.field_specs || []).length})`,
      children: snapshot ? (
        <>
          <Descriptions size="small" column={2} bordered style={{ marginBottom: 12 }}>
            <Descriptions.Item label="抽取器">{snapshot.extractor}</Descriptions.Item>
            <Descriptions.Item label="字段数">{snapshot.field_filter?.matched_count ?? '-'}</Descriptions.Item>
            <Descriptions.Item label="文档类型">{snapshot.document?.doc_type || '-'}</Descriptions.Item>
            <Descriptions.Item label="文本长度">{snapshot.document?.text_length ?? '-'}</Descriptions.Item>
          </Descriptions>
          <FieldSpecsTable specs={snapshot.field_specs || []} />
        </>
      ) : <Alert type="info" showIcon message="尚无 input_snapshot（任务可能尚未执行到抽取阶段）" />,
    },
    { key: 'llm', label: `LLM (${(job?.llm_calls || []).length})`, children: <LlmCallPanel calls={job?.llm_calls || []} /> },
    { key: 'validation', label: '校验', children: renderJSON(run?.validation_log) },
    { key: 'result', label: '落库', children: <ExtractedFieldsTable fields={run?.extracted_fields || []} /> },
  ]

  return <Tabs items={tabItems} />
}
