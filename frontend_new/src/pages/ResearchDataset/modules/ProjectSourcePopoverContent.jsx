import React from 'react'
import { Typography } from 'antd'
import { FileTextOutlined } from '@ant-design/icons'

const { Text } = Typography

export const buildPatientDocTypeGroups = (patientDataset = []) => {
  const docTypeGroups = {}
  const seenDocIds = new Set()

  for (const patient of patientDataset) {
    const docs = patient.crf_data?._documents || {}
    for (const doc of Object.values(docs)) {
      if (seenDocIds.has(doc.id)) continue
      seenDocIds.add(doc.id)
      const label = doc.document_sub_type || doc.document_type || doc.file_name || '未知'
      if (!docTypeGroups[label]) docTypeGroups[label] = []
      docTypeGroups[label].push({
        id: doc.id,
        file_name: doc.file_name || doc.id,
        patient_name: patient.name || patient.subject_id || '',
      })
    }
  }

  return docTypeGroups
}

const matchesSource = (docLabel, sourceName) => {
  if (!docLabel || !sourceName) return false
  const docText = docLabel.replace(/[\s/\\-]/g, '').toLowerCase()
  const sourceText = sourceName.replace(/[\s/\\-]/g, '').toLowerCase()
  return docText.includes(sourceText) || sourceText.includes(docText)
}

const collectSourceMatches = (docTypeGroups, primary, secondary, includeUnmatched) => {
  const primaryMatched = []
  const secondaryMatched = []
  const unmatched = []

  for (const [label, docs] of Object.entries(docTypeGroups)) {
    let hit = false
    for (const source of primary) {
      if (matchesSource(label, source)) {
        primaryMatched.push({ label, docs })
        hit = true
        break
      }
    }
    if (!hit) {
      for (const source of secondary) {
        if (matchesSource(label, source)) {
          secondaryMatched.push({ label, docs })
          hit = true
          break
        }
      }
    }
    if (!hit && includeUnmatched) unmatched.push({ label, docs })
  }

  return { primaryMatched, secondaryMatched, unmatched }
}

const SourceDocList = ({ docs, maxDocLinkWidth, onOpenDoc, token }) => (
  <div style={{ marginLeft: 16, marginTop: 2, marginBottom: 4 }}>
    {docs.map((doc, index) => (
      <div key={doc.id || index} style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 1 }}>
        <FileTextOutlined style={{ fontSize: 12, color: token.colorTextSecondary, flexShrink: 0 }} />
        <a
          style={{ fontSize: 12, color: token.colorPrimary, cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: maxDocLinkWidth }}
          title={doc.file_name}
          onClick={(event) => { event.stopPropagation(); onOpenDoc(doc.id) }}
        >
          {doc.file_name}
        </a>
        {doc.patient_name ? (
          <span style={{ fontSize: 12, color: token.colorTextSecondary, flexShrink: 0 }}>({doc.patient_name})</span>
        ) : null}
      </div>
    ))}
  </div>
)

const SourceMatchSection = ({ color, docs, label, name, onOpenDoc, token, maxDocLinkWidth }) => (
  <div style={{ marginBottom: 4 }}>
    <span style={{ color, fontWeight: 500, fontSize: 12 }}>● {name}</span>{' '}
    <span style={{ fontSize: 12 }}>{label}</span>
    <span style={{ color: token.colorTextSecondary, marginLeft: 4, fontSize: 12 }}>× {docs.length}</span>
    <SourceDocList docs={docs} maxDocLinkWidth={maxDocLinkWidth} onOpenDoc={onOpenDoc} token={token} />
  </div>
)

const ProjectSourcePopoverContent = ({
  docTypeGroups,
  groupLabel,
  includeUnmatched = false,
  maxDocLinkWidth = 260,
  onOpenDoc,
  patientCount,
  sources,
  title,
  token,
}) => {
  const primary = (sources?.primary || []).filter(Boolean)
  const secondary = (sources?.secondary || []).filter(Boolean)
  const allSourceNames = [...primary, ...secondary]
  const { primaryMatched, secondaryMatched, unmatched } = collectSourceMatches(
    docTypeGroups,
    primary,
    secondary,
    includeUnmatched,
  )
  const hasDocInfo = patientCount > 0 && Object.keys(docTypeGroups).length > 0

  return (
    <div style={{ maxWidth: 440, maxHeight: 420, overflow: 'auto' }}>
      <div style={{ fontWeight: 600, marginBottom: 6, fontSize: 14 }}>
        {title}
        {groupLabel ? <span style={{ fontWeight: 400, color: token.colorTextSecondary }}>（{groupLabel}）</span> : null}
      </div>
      <div style={{ marginBottom: 4, fontSize: 12 }}>
        <Text strong>首要来源：</Text>
        <span>{primary.length ? primary.join('、') : '（空）'}</span>
      </div>
      <div style={{ marginBottom: hasDocInfo ? 8 : 0, fontSize: 12 }}>
        <Text strong>次要来源：</Text>
        <span>{secondary.length ? secondary.join('、') : '（空）'}</span>
      </div>
      {hasDocInfo ? (
        <div style={{ borderTop: `1px solid ${token.colorBorder}`, paddingTop: 8, marginTop: 2 }}>
          <div style={{ fontWeight: 600, marginBottom: 6, color: token.colorPrimary, fontSize: 12 }}>
            实际文档匹配（本页 {patientCount} 位受试者）
          </div>
          <div style={{ fontSize: 12, color: token.colorTextSecondary, marginBottom: 6 }}>
            抽取策略：优先使用全部首要文档；若首要覆盖不足则回退次要文档
          </div>
          {primaryMatched.map((match, index) => (
            <SourceMatchSection
              key={`p${index}`}
              color={token.colorSuccess}
              docs={match.docs}
              label={match.label}
              maxDocLinkWidth={maxDocLinkWidth}
              name="首要"
              onOpenDoc={onOpenDoc}
              token={token}
            />
          ))}
          {secondaryMatched.map((match, index) => (
            <SourceMatchSection
              key={`s${index}`}
              color={token.colorWarning}
              docs={match.docs}
              label={match.label}
              maxDocLinkWidth={maxDocLinkWidth}
              name="次要"
              onOpenDoc={onOpenDoc}
              token={token}
            />
          ))}
          {primaryMatched.length === 0 && secondaryMatched.length === 0 && allSourceNames.length > 0 ? (
            <div style={{ color: token.colorError, fontSize: 12 }}>⚠ 无匹配文档</div>
          ) : null}
          {includeUnmatched && unmatched.length > 0 ? (
            <div style={{ marginTop: 6 }}>
              <span style={{ color: token.colorTextSecondary, fontSize: 12 }}>其他文档：</span>
              {unmatched.map((item, index) => (
                <span key={item.label} style={{ fontSize: 12 }}>
                  {index > 0 ? '、' : ''}{item.label}
                  <span style={{ color: token.colorTextTertiary }}>({item.docs.length})</span>
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  )
}

export default ProjectSourcePopoverContent
