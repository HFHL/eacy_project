import React, { useMemo, useState } from 'react'
import {
  Button,
  Divider,
  Drawer,
  Space,
  Typography,
} from 'antd'

import RenderIssueBlock from './nestedDetailDrawer/RenderIssueBlock'
import StructuredValueRenderer from './nestedDetailDrawer/StructuredValueRenderer'
import { safeStringify } from './nestedDetailDrawer/nestedValueUtils'

const { Text } = Typography

const NestedDetailDrawer = ({
  open,
  title,
  node,
  schemaNode = null,
  rawValue = undefined,
  useSchemaKernel = true,
  onClose,
}) => {
  const drawerNode = useMemo(() => node || null, [node])
  const drawerSchemaNode = useMemo(() => schemaNode || null, [schemaNode])
  const [expandMode, setExpandMode] = useState('custom')
  const [customExpandedKeys, setCustomExpandedKeys] = useState([])
  const [showRawPayload, setShowRawPayload] = useState(false)
  const showDiagnostics = Boolean(import.meta?.env?.DEV)
  const effectiveValue = rawValue !== undefined ? rawValue : drawerNode?.value

  const handleTogglePanel = (panelKey) => {
    if (!panelKey) return
    setExpandMode('custom')
    setCustomExpandedKeys((prev) => {
      if (prev.includes(panelKey)) return prev.filter((key) => key !== panelKey)
      return [...prev, panelKey]
    })
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={title || '嵌套字段明细'}
      width={560}
      destroyOnHidden
      extra={(
        <Space size={8}>
          <Button size="small" type={showRawPayload ? 'primary' : 'default'} onClick={() => setShowRawPayload((prev) => !prev)}>
            原始 JSON
          </Button>
        </Space>
      )}
    >
      {useSchemaKernel && !drawerSchemaNode && showDiagnostics ? (
        <RenderIssueBlock
          title="Schema 未命中，已切换自适应渲染"
          detail="当前字段未解析到 schemaNode。请检查模板映射路径或字段定义。"
          path={drawerNode?.path || '(root)'}
        />
      ) : null}
      {effectiveValue !== undefined ? (
        <StructuredValueRenderer
          value={effectiveValue}
          schemaNode={useSchemaKernel ? drawerSchemaNode : null}
          label={title || drawerNode?.label || '字段详情'}
          path={drawerNode?.path || 'root'}
          depth={0}
          expandMode={expandMode}
          customExpandedKeys={customExpandedKeys}
          onTogglePanel={handleTogglePanel}
          showDiagnostics={showDiagnostics}
        />
      ) : (
        <Text type="secondary">暂无可展示的嵌套明细。</Text>
      )}
      {showRawPayload ? (
        <>
          <Divider style={{ marginBlock: 12 }} />
          <Text strong>原始 JSON（调试）</Text>
          <pre style={{ marginTop: 8, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {safeStringify(effectiveValue)}
          </pre>
        </>
      ) : null}
    </Drawer>
  )
}

export default NestedDetailDrawer
