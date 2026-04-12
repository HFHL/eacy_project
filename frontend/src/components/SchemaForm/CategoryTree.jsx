/**
 * 分类目录树组件
 * 基于Schema结构生成左侧导航目录树
 * 只展示到层级1（文件夹 → 表单），不展示字段级别
 * 参考旧版设计：图标和文字在同一行
 *
 * 扩展功能：
 * - 项目模式：支持文档列表渲染
 * - 可重复表单：支持添加新实例
 */
import React, { useMemo, useCallback, useState } from 'react'
import { Tree, Typography, Tooltip, Button, Badge, List, Empty, Tabs, Tag, Space, Divider, Popover, message, Dropdown, Modal } from 'antd'
import {
  FolderOutlined,
  FolderOpenOutlined,
  FormOutlined,
  TableOutlined,
  FileTextOutlined,
  MinusSquareOutlined,
  PlusSquareOutlined,
  PlusOutlined,
  FilePdfOutlined,
  FileImageOutlined,
  CloudUploadOutlined,
  CheckCircleOutlined,
  ClockCircleOutlined,
  CopyOutlined,
  DeleteOutlined,
  BlockOutlined,
  ExclamationCircleOutlined,
  EyeOutlined,
  SaveOutlined,
  UndoOutlined,
  CloudSyncOutlined
} from '@ant-design/icons'
import { useSchemaForm, setNestedValue, orderedPropertyEntries } from './SchemaFormContext'
import DocumentCard from '../../pages/PatientDetail/tabs/DocumentsTab/components/DocumentCard'
import DocumentDetailModal from '../../pages/PatientDetail/tabs/DocumentsTab/components/DocumentDetailModal'

const { Text } = Typography

/**
 * 获取嵌套值
 */
function getNestedValue(obj, path) {
  if (!path || !obj) return undefined
  const keys = path.split('.')
  let result = obj
  for (const key of keys) {
    if (result == null) return undefined
    result = result[key]
  }
  return result
}

/**
 * 检查是否有任何数据
 */
function hasAnyData(data) {
  if (data == null) return false
  if (Array.isArray(data)) return data.length > 0
  if (typeof data === 'object') {
    return Object.values(data).some(v => hasAnyData(v))
  }
  return data !== '' && data !== null && data !== undefined
}

/**
 * 计算表单的填写进度
 */
function calculateFormProgress(schemaNode, data) {
  if (!schemaNode?.properties) return { filled: 0, total: 0 }

  let filled = 0
  let total = 0

  const countFields = (props, dataObj) => {
    for (const [key, fieldSchema] of Object.entries(props)) {
      if (fieldSchema.type === 'array') {
        // 数组类型算一个字段
        total++
        const arr = dataObj?.[key]
        if (Array.isArray(arr) && arr.length > 0) {
          filled++
        }
      } else if (fieldSchema.type === 'object' && fieldSchema.properties) {
        // 递归处理嵌套对象
        countFields(fieldSchema.properties, dataObj?.[key])
      } else {
        // 普通字段
        total++
        const value = dataObj?.[key]
        if (value !== null && value !== undefined && value !== '') {
          filled++
        }
      }
    }
  }

  countFields(schemaNode.properties, data)
  return { filled, total }
}

/**
 * 计算文件夹的总体进度（汇总所有子表单）
 */
function calculateFolderProgress(folderSchema, folderData) {
  if (!folderSchema?.properties) return { filled: 0, total: 0 }

  let totalFilled = 0
  let totalCount = 0

  for (const [formName, formSchema] of Object.entries(folderSchema.properties)) {
    const formData = folderData?.[formName]
    const progress = calculateFormProgress(formSchema, formData)
    totalFilled += progress.filled
    totalCount += progress.total
  }

  return { filled: totalFilled, total: totalCount }
}

/**
 * 从路径获取Schema节点
 * @param {Object} schema - 根Schema
 * @param {string} path - 点分隔的路径
 * @returns {Object|null} Schema节点
 */
function getSchemaAtPath(schema, path) {
  if (!path || !schema) return null

  const keys = path.split('.')
  let current = schema

  for (const key of keys) {
    if (!current) return null

    if (current.properties && current.properties[key]) {
      current = current.properties[key]
    } else if (current.items?.properties && current.items.properties[key]) {
      current = current.items.properties[key]
    } else {
      return null
    }
  }

  return current
}

/**
 * 判断是否为可重复表单（抽取单元级别的数组）
 * 条件：type === 'array' && items.type === 'object' && items.properties 存在
 */
function isRepeatableForm(schema) {
  return schema?.type === 'array' &&
         schema?.items?.type === 'object' &&
         schema?.items?.properties
}

/**
 * 获取可重复表单的命名规则
 * 优先使用 schema 中的 x-repeatable-naming，否则使用默认规则
 */
function getRepeatableNaming(formName, schema) {
  const naming = schema?.['x-repeatable-naming']
  if (naming?.pattern) {
    return naming.pattern
  }
  // 默认命名规则：简化表单名（序号由 generateInstanceName 决定；默认首条不加后缀）
  const simpleName = formName.replace(/检查报告单|报告单|记录单|记录/g, '')
  return `${simpleName}`
}

/**
 * 生成实例名称
 */
function generateInstanceName(pattern, index, startIndex = 1) {
  // 兼容旧 pattern（带 {index}）：直接替换
  if (pattern.includes('{index}')) {
  return pattern.replace('{index}', index + startIndex)
  }
  // 新默认：首条无后缀；后续从 2 开始（xxx_2、xxx_3...）
  if (index === 0) return pattern
  return `${pattern}_${index + startIndex}`
}

/**
 * 从Schema构建目录树数据
 * 层级0: 文件夹（如"检验检查"、"诊疗记录"）
 * 层级1: 表单 或 可重复表单实例
 *
 * 核心逻辑：
 * - 普通表单(type: object)：直接显示为一个节点
 * - 可重复表单(type: array + items.properties)：有数据时展开为实例节点；空时显示占位节点
 */
function buildTreeData(schema, draftData) {
  if (!schema?.properties) return []

  const treeData = []

  // 层级0: 文件夹（按 x-property-order 排序，保留 CRF 模板定义顺序）
  for (const [folderName, folderSchema] of orderedPropertyEntries(schema.properties, schema)) {
    const folderPath = folderName
    const folderData = draftData ? getNestedValue(draftData, folderPath) : null
    const folderProgress = calculateFolderProgress(folderSchema, folderData)

    const folderNode = {
      key: folderPath,
      title: folderName,
      path: folderPath,
      level: 0,
      schemaNode: folderSchema,
      isFolder: true,
      isLeaf: false,
      hasData: hasAnyData(folderData),
      progress: folderProgress,
      children: []
    }

    // 层级1: 表单（统一显示所有需要填写的表单，空表单也占位）
    if (folderSchema.type === 'object' && folderSchema.properties) {
      for (const [formName, formSchema] of orderedPropertyEntries(folderSchema.properties, folderSchema)) {
        const formPath = `${folderPath}.${formName}`
        const formData = draftData ? getNestedValue(draftData, formPath) : null
        const hasData = hasAnyData(formData)

        if (isRepeatableForm(formSchema)) {
          const dataArray = Array.isArray(formData) ? formData : []
          const formProgress = calculateFormProgress(formSchema, formData)
          const namingPattern = getRepeatableNaming(formName, formSchema)
          const startIndex = formSchema?.['x-repeatable-naming']?.startIndex || 1
          const totalInstances = dataArray.length

          if (dataArray.length === 0) {
            folderNode.children.push({
              key: formPath,
              title: formName,
              path: formPath,
              level: 1,
              schemaNode: formSchema,
              isFolder: false,
              isForm: true,
              isFormInstance: false,
              isLeaf: true,
              isArray: true,
              isRepeatableForm: true,
              isEmptyPlaceholder: true,
              hasData: false,
              progress: formProgress,
              recordCount: 0,
            })
          } else {
            dataArray.forEach((itemData, index) => {
              const instanceName = generateInstanceName(namingPattern, index, startIndex)
              const instancePath = `${formPath}.${index}`
              const itemSchema = formSchema.items
              const progress = calculateFormProgress(itemSchema, itemData)

              folderNode.children.push({
                key: instancePath,
                title: instanceName,
                path: instancePath,
                level: 1,
                schemaNode: itemSchema,
                originalFormName: formName,
                originalFormPath: formPath,
                originalFormSchema: formSchema,
                isFolder: false,
                isForm: true,
                isFormInstance: true,
                isLeaf: true,
                isArray: false,
                isRepeatableForm: true,
                isEmptyPlaceholder: !hasAnyData(itemData),
                hasData: hasAnyData(itemData),
                progress,
                recordCount: totalInstances,
                instanceIndex: index,
                totalInstances,
              })
            })
          }

        } else {
          // 普通表单：直接显示为一个节点
          const progress = calculateFormProgress(formSchema, formData)

          const formNode = {
            key: formPath,
            title: formName,
            path: formPath,
            level: 1,
            schemaNode: formSchema,
            isFolder: false,
            isForm: true,
            isFormInstance: false,
            isLeaf: true,
            isArray: false,
            isRepeatableForm: false,
            isEmptyPlaceholder: !hasData,
            recordCount: 0,
            hasData: hasAnyData(formData),
            progress
          }

          folderNode.children.push(formNode)
        }
      }
    }

    treeData.push(folderNode)
  }

  return treeData
}

/**
 * 目录树悬停样式
 */
const treeHoverStyle = `
  .category-tree-node .node-hover-actions {
    opacity: 0;
    transition: opacity 0.15s ease;
  }
  .category-tree-node:hover .node-hover-actions {
    opacity: 1;
  }
`

/**
 * 创建空记录模板
 */
function createEmptyTemplate(itemSchema) {
  if (!itemSchema?.properties) return {}

  const template = {}
  for (const [key, fieldSchema] of Object.entries(itemSchema.properties)) {
    if (fieldSchema.type === 'array') {
      template[key] = []
    } else if (fieldSchema.type === 'number') {
      template[key] = null
    } else if (fieldSchema.type === 'string') {
      template[key] = ''
    } else {
      template[key] = null
    }
  }
  return template
}

/**
 * 目录树节点标题 - 图标和文字在同一行
 * - 文件夹：右侧加号打开下拉，选择要添加的表单类型
 * - 表单实例：悬停显示删除按钮（不再在实例上显示添加）
 */
const NodeTitle = ({ node, expanded, onAddInstance, onDeleteInstance, onClearForm, onClearFormRequest }) => {
  const {
    hasData,
    progress,
    isForm,
    isFolder,
    isFormInstance,
    isRepeatableForm: nodeIsRepeatableForm,
    schemaNode,
    originalFormName,
    originalFormPath,
    originalFormSchema,
    instanceIndex,
    totalInstances,
    recordCount,
  } = node

  // 文件夹下可重复表单类型列表（用于右侧加号下拉）
  const folderRepeatableTypes = isFolder && schemaNode?.properties
    ? Object.entries(schemaNode.properties)
        .filter(([, s]) => isRepeatableForm(s))
        .map(([formName, formSchema]) => ({
          formName,
          formPath: `${node.key}.${formName}`,
          formSchema
        }))
    : []

  // 获取图标 - 区分可重复表单和普通表单
  const getIcon = () => {
    if (isFolder) {
      return expanded ?
        <FolderOpenOutlined style={{ color: '#faad14', marginRight: 6 }} /> :
        <FolderOutlined style={{ color: '#faad14', marginRight: 6 }} />
    }
    if (isForm && schemaNode?.type === 'array') {
      return <TableOutlined style={{ color: '#1890ff', marginRight: 6 }} />
    }
    if (isFormInstance) {
      return <BlockOutlined style={{ color: '#1890ff', marginRight: 6 }} />
    }
    // 普通表单 - 使用 FormOutlined 图标
    return <FormOutlined style={{ color: '#52c41a', marginRight: 6 }} />
  }

  // 获取进度显示
  const getProgressText = () => {
    if (progress && progress.total > 0) {
      return `${progress.filled}/${progress.total}`
    }
    return null
  }

  const progressText = getProgressText()

  // 文件夹：选择一种类型添加（由下拉触发）
  const handleFolderAddType = (formPath, formName, formSchema) => (e) => {
    e?.stopPropagation?.()
    if (onAddInstance) {
      onAddInstance(formPath, formName, formSchema)
    }
  }

  const handleAddClick = (e) => {
    e.stopPropagation()
    if (nodeIsRepeatableForm && onAddInstance) {
      if (isFormInstance) {
        onAddInstance(originalFormPath, originalFormName, originalFormSchema)
      } else {
        onAddInstance(node.path, node.title, schemaNode)
      }
    }
  }

  // 处理删除/清空：可重复实例删除当前项；空占位节点保持空遮罩
  const handleDeleteClick = (e) => {
    e.stopPropagation()
    if (nodeIsRepeatableForm) {
      if (isFormInstance && onDeleteInstance) {
        onDeleteInstance(originalFormPath, instanceIndex, totalInstances)
      } else if (onClearFormRequest) {
        onClearFormRequest(node.path)
      } else if (onClearForm) {
        onClearForm(node.path)
      }
      return
    }

    if (isFormInstance && onDeleteInstance) {
      onDeleteInstance(originalFormPath, instanceIndex, totalInstances)
    } else if (isForm && !isFormInstance) {
      if (onClearFormRequest) {
        onClearFormRequest(node.path)
      } else if (onClearForm) {
        onClearForm(node.path)
      }
    }
  }

  const canAdd = isForm && nodeIsRepeatableForm && !isFormInstance
  const canAddOnInstance = isFormInstance && nodeIsRepeatableForm
  const canDelete = nodeIsRepeatableForm ? true : (isFormInstance || (isForm && hasData))
  const deleteTooltip = nodeIsRepeatableForm
    ? (hasData ? '清空全部记录' : '保持空表单')
    : '清空表单'

  return (
    <div
      className="category-tree-node"
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '4px 0',
        width: '100%'
      }}
    >
      <style>{treeHoverStyle}</style>
      <div style={{ display: 'flex', alignItems: 'center', flex: 1, minWidth: 0 }}>
        {getIcon()}
        <Text
          style={{
            fontSize: 13,
            fontWeight: isFolder ? 500 : 400,
            color: hasData ? '#333' : '#666',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}
        >
          {node.title}
        </Text>
        {isFolder && (
          <Text style={{ fontSize: 12, color: '#999', marginLeft: 5, flexShrink: 0 }}>
            #{node.children?.length ?? 0}
          </Text>
        )}
        {!isFormInstance && isForm && nodeIsRepeatableForm && (
          <Text style={{ fontSize: 12, color: '#999', marginLeft: 5, flexShrink: 0 }}>
            #{recordCount || 0}
          </Text>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0 }}>
        {/* 进度显示（仅子节点；主文件夹计数在名称旁 #N） */}
        {!isFolder && progressText && (
          <Text
            style={{
              fontSize: 12,
              color: '#999'
            }}
          >
            {progressText}
          </Text>
        )}

        {/* 文件夹：右侧加号 - 下拉选择要添加的表单类型 */}
        {isFolder && folderRepeatableTypes.length > 0 && (
          <Dropdown
            menu={{
              items: folderRepeatableTypes.map(({ formName, formPath, formSchema }) => ({
                key: formPath,
                label: formName,
                onClick: () => handleFolderAddType(formPath, formName, formSchema)()
              })),
              onClick: (e) => e.domEvent?.stopPropagation?.()
            }}
            trigger={['click']}
            placement="bottomLeft"
          >
            <Tooltip title="添加表单（选择类型）" placement="top">
              <Button
                type="text"
                size="small"
                icon={<PlusOutlined style={{ fontSize: 12 }} />}
                className="node-hover-actions"
                onClick={(e) => e.stopPropagation()}
                style={{
                  padding: '0 4px',
                  height: 18,
                  minWidth: 18,
                  color: '#1890ff'
                }}
              />
            </Tooltip>
          </Dropdown>
        )}

        {(canAdd || canAddOnInstance) && (
          <Tooltip title={hasData ? '新增记录' : '进入空表单'} placement="top">
            <Button
              type="text"
              size="small"
              icon={<PlusOutlined style={{ fontSize: 12 }} />}
              onClick={handleAddClick}
              className="node-hover-actions"
              style={{
                padding: '0 4px',
                height: 18,
                minWidth: 18,
                color: '#1890ff'
              }}
            />
          </Tooltip>
        )}

        {canDelete && (
          <Tooltip title={isFormInstance ? '删除此记录' : deleteTooltip} placement="top">
            <Button
              type="text"
              size="small"
              icon={<DeleteOutlined style={{ fontSize: 12 }} />}
              onClick={handleDeleteClick}
              className="node-hover-actions"
              style={{
                padding: '0 4px',
                height: 18,
                minWidth: 18,
                color: '#ff4d4f'
              }}
            />
          </Tooltip>
        )}
        {!canAdd && !canDelete && (
          <span style={{ display: 'inline-block', width: 24, height: 18, minWidth: 18 }} aria-hidden />
        )}
      </div>
    </div>
  )
}

/**
 * 文档列表组件
 * 用于项目模式下显示关联文档
 */
const DocumentList = ({
  documents = [],
  selectedDocumentId,
  onDocumentSelect,
  onUploadDocument,
  onViewDocumentDetail
}) => {
  if (documents.length === 0) {
    return (
      <Empty
        image={Empty.PRESENTED_IMAGE_SIMPLE}
        description="暂无文档"
        style={{ padding: '20px 0' }}
      >
        {onUploadDocument && (
          <Button
            type="dashed"
            size="small"
            icon={<CloudUploadOutlined />}
            onClick={onUploadDocument}
          >
            上传文档
          </Button>
        )}
      </Empty>
    )
  }

  // 按状态分组
  const extractedDocs = documents.filter(d => d.status === 'extracted')
  const pendingDocs = documents.filter(d => d.status !== 'extracted')

  const renderDocItem = (doc) => {
    const isSelected = doc.id === selectedDocumentId
    const isPdf = doc.name.toLowerCase().includes('.pdf')

    return (
      <div
        key={doc.id}
        onClick={() => onDocumentSelect?.(doc)}
        style={{
          padding: '8px 10px',
          marginBottom: 4,
          borderRadius: 6,
          cursor: 'pointer',
          background: isSelected ? '#e6f4ff' : '#fff',
          border: `1px solid ${isSelected ? '#91caff' : '#f0f0f0'}`,
          transition: 'all 0.2s'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {isPdf ? (
            <FilePdfOutlined style={{ color: '#ff4d4f', fontSize: 14 }} />
          ) : (
            <FileImageOutlined style={{ color: '#1890ff', fontSize: 14 }} />
          )}
          <Text
            ellipsis={{ tooltip: doc.name }}
            style={{
              flex: 1,
              fontSize: 12,
              fontWeight: isSelected ? 500 : 400
            }}
          >
            {doc.name}
          </Text>
          {onViewDocumentDetail && (
            <Tooltip title="查看文档详情">
              <Button
                type="text"
                size="small"
                icon={<EyeOutlined style={{ fontSize: 12 }} />}
                onClick={(e) => {
                  e.stopPropagation()
                  onViewDocumentDetail(doc)
                }}
                style={{
                  padding: '0 4px',
                  height: 18,
                  minWidth: 18,
                  color: '#1890ff'
                }}
              />
            </Tooltip>
          )}
          {doc.status === 'extracted' ? (
            <CheckCircleOutlined style={{ color: '#52c41a', fontSize: 12 }} />
          ) : (
            <ClockCircleOutlined style={{ color: '#faad14', fontSize: 12 }} />
          )}
        </div>
        <div style={{
          marginTop: 4,
          fontSize: 10,
          color: '#999',
          display: 'flex',
          gap: 8
        }}>
          <span>{doc.type}</span>
          <span>{doc.pages}页</span>
        </div>
      </div>
    )
  }

  return (
    <div style={{ padding: '0 4px' }}>
      {/* 已抽取文档 */}
      {extractedDocs.length > 0 && (
        <div style={{ marginBottom: 8 }}>
          <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>
            已抽取 ({extractedDocs.length})
          </Text>
          {extractedDocs.map(renderDocItem)}
        </div>
      )}

      {/* 待处理文档 */}
      {pendingDocs.length > 0 && (
        <div>
          <Text type="secondary" style={{ fontSize: 11, display: 'block', marginBottom: 4 }}>
            待处理 ({pendingDocs.length})
          </Text>
          {pendingDocs.map(renderDocItem)}
        </div>
      )}

      {/* 上传按钮 */}
      {onUploadDocument && (
        <Button
          type="dashed"
          size="small"
          icon={<CloudUploadOutlined />}
          onClick={onUploadDocument}
          block
          style={{ marginTop: 8 }}
        >
          上传文档
        </Button>
      )}
    </div>
  )
}

/**
 * 分类目录树组件
 */
const CategoryTree = ({
  onSelect,
  /** 切换选中项前调用，返回 Promise<boolean>：true 允许切换，false 取消 */
  onBeforeSelect,
  /** 删除可重复记录后立即持久化（调接口保存），传入删除后的完整 draft 数据 */
  onPersistAfterChange,
  /** 清空不重复表单前确认（有未保存修改时同切换表单：保存/不保存/取消） */
  onBeforeClearForm,
  style,
  defaultExpandAll = true,

  // 项目模式相关
  projectMode = false,
  projectDocuments = [],
  selectedDocument = null,
  onDocumentSelect,
  onUploadDocument,

  // Repeatable 表单相关
  onAddRepeatableInstance,
  repeatableNamingPattern = '{formName}_{index}',

  // 工具栏相关 props（从 SchemaForm 传入）
  toolbarProps = null,

  // 患者ID（用于文档详情弹窗）
  patientId = null
}) => {
  const { schema, draftData, selectedPath, actions } = useSchemaForm()

  // 项目模式下的Tab状态
  const [activeTab, setActiveTab] = useState('forms')

  // 文档详情弹窗状态
  const [detailDoc, setDetailDoc] = useState(null)
  const [detailVisible, setDetailVisible] = useState(false)

  const handleViewDocumentDetail = useCallback((doc) => {
    setDetailDoc(doc)
    setDetailVisible(true)
  }, [])

  const handleCloseDocumentDetail = useCallback(() => {
    setDetailVisible(false)
    setDetailDoc(null)
  }, [])

  // 构建树数据（只到层级1）
  const treeData = useMemo(() => {
    if (!schema) return []
    return buildTreeData(schema, draftData)
  }, [schema, draftData])

  const treeNodeKeys = useMemo(() => {
    const keys = new Set()
    treeData.forEach((folder) => {
      keys.add(folder.key)
      folder.children?.forEach((child) => keys.add(child.key))
    })
    return keys
  }, [treeData])

  const selectedTreeKey = useMemo(() => {
    if (!selectedPath) return null
    if (treeNodeKeys.has(selectedPath)) return selectedPath
    const normalizedPath = selectedPath.replace(/\.\d+(?=\.|$)/g, '')
    if (treeNodeKeys.has(normalizedPath)) return normalizedPath
    return null
  }, [selectedPath, treeNodeKeys])

  // 获取所有可展开的key（文件夹节点）
  const allExpandableKeys = useMemo(() => {
    return treeData.map(node => node.key)
  }, [treeData])

  // 展开状态 - 默认全部展开
  const [expandedKeys, setExpandedKeys] = useState(allExpandableKeys)

  // 是否全部展开状态
  const isAllExpanded = expandedKeys.length === allExpandableKeys.length && allExpandableKeys.length > 0

  // 切换全部展开/收起
  const handleToggleExpandAll = useCallback(() => {
    if (isAllExpanded) {
      setExpandedKeys([])
    } else {
      setExpandedKeys(allExpandableKeys)
    }
  }, [isAllExpanded, allExpandableKeys])

  // 处理展开/收起
  const handleExpand = useCallback((keys) => {
    setExpandedKeys(keys)
  }, [])

  // 尝试切换选中路径（若有 onBeforeSelect 则先确认）
  const trySetSelectedPath = useCallback(async (path, node) => {
    if (onBeforeSelect) {
      const allow = await onBeforeSelect(path)
      if (!allow) return
    }
    actions.setSelectedPath(path)
    if (onSelect) {
      onSelect(path, node || { key: path })
    }
  }, [actions, onBeforeSelect, onSelect])

  const createRepeatableInstance = useCallback((path, title, schemaNode) => {
    // 创建空模板（使用 items 的 schema）
    const itemSchema = schemaNode?.items || schemaNode
    const template = createEmptyTemplate(itemSchema)

    // 使用context的action添加
    actions.addRepeatableItem(path, template)

    // 计算新实例的名称
    const currentCount = (getNestedValue(draftData, path) || []).length
    const namingPattern = getRepeatableNaming(title, schemaNode)
    const startIndex = schemaNode?.['x-repeatable-naming']?.startIndex || 1
    const newName = generateInstanceName(namingPattern, currentCount, startIndex)

    // 如果外部有回调，也调用一下
    if (onAddRepeatableInstance) {
      onAddRepeatableInstance(path, newName, currentCount + 1)
    }

    message.success(`已添加 ${newName}`)

    // 自动选中新添加的实例（经 onBeforeSelect 确认）
    const newInstancePath = `${path}.${currentCount}`
    setTimeout(() => {
      trySetSelectedPath(newInstancePath)
    }, 100)
  }, [actions, draftData, onAddRepeatableInstance, trySetSelectedPath])

  // 处理添加可重复表单实例（使用Context中的action，须在 handleSelect 前定义）
  const handleAddRepeatableItem = useCallback((path, title, schemaNode) => {
    const currentArray = getNestedValue(draftData, path) || []
    const isEmptyRepeatableForm = !Array.isArray(currentArray) || currentArray.length === 0

    if (isEmptyRepeatableForm) {
      // 空表单首次点击 + ：进入空表单遮罩
      if (selectedPath !== path) {
        trySetSelectedPath(path, {
          key: path,
          title,
          path,
          schemaNode,
          isForm: true,
          isFormInstance: false,
          isArray: true,
          isRepeatableForm: true,
          isEmptyPlaceholder: true,
        })
        return
      }

      // 已经停留在空表单遮罩上，再点 + ：直接创建第一条空记录
      createRepeatableInstance(path, title, schemaNode)
      return
    }

    createRepeatableInstance(path, title, schemaNode)
  }, [createRepeatableInstance, draftData, selectedPath, trySetSelectedPath])

  // 处理选择
  const handleSelect = useCallback(async (selectedKeys, { node }) => {
    // 文件夹点击时展开/收起
    if (node.isFolder) {
      const key = node.key
      if (expandedKeys.includes(key)) {
        setExpandedKeys(expandedKeys.filter(k => k !== key))
      } else {
        setExpandedKeys([...expandedKeys, key])
      }
      return
    }

    // 添加按钮节点：触发添加操作
    if (node.isAddButton) {
      handleAddRepeatableItem(node.path, node.originalFormName, node.schemaNode)
      return
    }

    // 表单或表单实例：先确认再设置选中路径
    const path = selectedKeys[0]
    await trySetSelectedPath(path, node)
  }, [expandedKeys, trySetSelectedPath, handleAddRepeatableItem])

  // 处理删除可重复表单实例：真删除该条记录，删除前二次确认，确认后立即调接口保存
  const handleDeleteInstance = useCallback((arrayPath, instanceIndex, totalInstances) => {
    Modal.confirm({
      title: '确认删除',
      icon: <ExclamationCircleOutlined />,
      content: '确定要删除该条记录吗？删除后不可恢复。',
      okText: '确定删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        const currentArray = getNestedValue(draftData, arrayPath) || []
        const newArray = currentArray.filter((_, idx) => idx !== instanceIndex)
        const newDraftData = JSON.parse(JSON.stringify(draftData || {}))
        setNestedValue(newDraftData, arrayPath, newArray)

        actions.updateFieldValue(arrayPath, newArray)

        const deletedWasSelected = selectedPath === `${arrayPath}.${instanceIndex}` || selectedPath?.startsWith(`${arrayPath}.${instanceIndex}.`)
        if (deletedWasSelected) {
          if (newArray.length > 0) {
            trySetSelectedPath(`${arrayPath}.0`)
          } else {
            actions.setSelectedPath(arrayPath)
          }
        }

        if (onPersistAfterChange) {
          try {
            await onPersistAfterChange(newDraftData)
            message.success('已删除并保存')
          } catch (e) {
            message.error('删除失败: ' + (e?.message || '未知错误'))
          }
        } else {
          message.success('已删除记录')
        }
      }
    })
  }, [actions, draftData, selectedPath, trySetSelectedPath, onPersistAfterChange])

  // 处理清空表单数据（仅前端清空，需再点保存）
  const handleClearForm = useCallback((formPath) => {
    const schemaAtPath = getSchemaAtPath(schema, formPath)
    if (schemaAtPath?.type === 'array' && schemaAtPath?.items?.properties) {
      actions.updateFieldValue(formPath, [])
    } else if (schemaAtPath?.properties) {
      const emptyData = {}
      for (const [key, fieldSchema] of Object.entries(schemaAtPath.properties)) {
        if (fieldSchema.type === 'array') {
          emptyData[key] = []
        } else if (fieldSchema.type === 'number') {
          emptyData[key] = null
        } else if (fieldSchema.type === 'string') {
          emptyData[key] = ''
        } else {
          emptyData[key] = null
        }
      }
      actions.updateFieldValue(formPath, emptyData)
    } else {
      actions.updateFieldValue(formPath, {})
    }
    message.success('已清空表单数据，请点击保存提交')
  }, [actions, schema])

  // 清空表单：先确认当前未保存修改（同切换表单），再二次确认清空，清空后切换到该表单页
  const handleClearFormWithConfirm = useCallback(async (formPath) => {
    const currentValue = getNestedValue(draftData, formPath)
    const schemaAtPath = getSchemaAtPath(schema, formPath)
    const isRepeatable = schemaAtPath?.type === 'array' && schemaAtPath?.items?.properties
    const isAlreadyEmpty = isRepeatable
      ? !Array.isArray(currentValue) || currentValue.length === 0
      : !hasAnyData(currentValue)

    if (isAlreadyEmpty) {
      actions.setSelectedPath(formPath)
      return
    }

    const allow = onBeforeClearForm ? await onBeforeClearForm() : true
    if (!allow) return
    Modal.confirm({
      title: isRepeatable ? '确定清空全部记录' : '确定清空',
      icon: <ExclamationCircleOutlined />,
      content: isRepeatable
        ? '确定清空该表单下的全部记录吗？清空后将恢复为空表单状态，且需点击保存才会提交。'
        : '确定清空该表单数据吗？清空后需点击保存才会提交。',
      okText: isRepeatable ? '确定清空全部' : '确定清空',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: () => {
        handleClearForm(formPath)
        actions.setSelectedPath(formPath)
      }
    })
  }, [actions, draftData, handleClearForm, onBeforeClearForm, schema])

  // 自定义节点渲染
  const titleRender = useCallback((nodeData) => {
    return (
      <NodeTitle
        node={nodeData}
        expanded={expandedKeys.includes(nodeData.key)}
        onAddInstance={handleAddRepeatableItem}
        onDeleteInstance={handleDeleteInstance}
        onClearForm={handleClearForm}
        onClearFormRequest={handleClearFormWithConfirm}
      />
    )
  }, [expandedKeys, handleAddRepeatableItem, handleDeleteInstance, handleClearForm, handleClearFormWithConfirm])

  if (!schema) {
    return (
      <div style={{
        padding: 16,
        color: '#999',
        textAlign: 'center',
        ...style
      }}>
        请加载Schema
      </div>
    )
  }

  // 自定义滚动条样式
  const scrollbarStyle = `
    .category-tree-scrollable::-webkit-scrollbar {
      width: 4px;
    }
    .category-tree-scrollable::-webkit-scrollbar-track {
      background: transparent;
    }
    .category-tree-scrollable::-webkit-scrollbar-thumb {
      background: #d9d9d9;
      border-radius: 2px;
    }
    .category-tree-scrollable::-webkit-scrollbar-thumb:hover {
      background: #bfbfbf;
    }
    /* Tabs 内容区域高度修复 */
    .category-tree-tabs .ant-tabs-content-holder {
      flex: 1;
      overflow: hidden;
    }
    .category-tree-tabs .ant-tabs-content {
      height: 100%;
    }
    .category-tree-tabs .ant-tabs-tabpane {
      height: 100%;
      overflow: hidden;
    }
  `

  // 目录树节点样式
  const treeNodeStyles = `
    .category-tree-nodes .ant-tree-treenode {
      width: 100%;
      overflow: hidden;
      padding: 0 4px 0 0 !important;
    }
    .category-tree-nodes .ant-tree-switcher {
      width: 0 !important;
      min-width: 0 !important;
      margin: 0 !important;
      padding: 0 !important;
      flex: none !important;
    }
    .category-tree-nodes .ant-tree-node-content-wrapper {
      overflow: hidden;
      flex: 1;
      min-width: 0;
      padding: 0 4px !important;
    }
    .category-tree-nodes .ant-tree-title {
      overflow: hidden;
      display: block;
    }
    .category-tree-nodes .ant-tree-indent {
      display: inline-flex !important;
      align-self: stretch;
    }
    .category-tree-nodes .ant-tree-indent-unit {
      width: 16px !important;
      min-width: 16px !important;
      display: inline-block !important;
    }
    .category-tree-nodes .ant-tree-list-holder-inner {
      padding-left: 8px;
    }
  `

  // 渲染目录树部分（项目模式下使用）
  const renderTreeContent = () => (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden'
    }}>
      {/* 目录树滚动区域 */}
      <div
        style={{
          flex: 1,
          overflow: 'auto',
          minHeight: 0
        }}
        className="category-tree-scrollable"
      >
        <Tree
          treeData={treeData}
          expandedKeys={expandedKeys}
          onExpand={handleExpand}
          selectedKeys={selectedTreeKey ? [selectedTreeKey] : []}
          onSelect={handleSelect}
          titleRender={titleRender}
          showIcon={false}
          switcherIcon={() => null}
          blockNode
          style={{
            padding: '8px 0',
            background: 'transparent'
          }}
          className="category-tree-nodes"
        />
      </div>
    </div>
  )

  // 底部工具栏渲染
  const renderBottomToolbar = () => {
    if (!toolbarProps) return null
    const { onSave, onReset, saving, autoSaveEnabled, onToggleAutoSave, isDirty } = toolbarProps
    return (
      <div style={{
        padding: '8px 10px',
        borderTop: '1px solid #f0f0f0',
        background: '#fff',
        borderRadius: '0 0 8px 8px',
        flexShrink: 0,
        display: 'flex',
        justifyContent: 'flex-end',
        gap: 6
      }}>
        <Tooltip title={autoSaveEnabled ? '关闭自动保存' : '开启自动保存'}>
          <Button type={autoSaveEnabled ? 'primary' : 'default'} ghost={autoSaveEnabled} size="small" icon={<CloudSyncOutlined />} onClick={onToggleAutoSave}>{autoSaveEnabled ? '自动' : '手动'}</Button>
        </Tooltip>
        <Button size="small" icon={<UndoOutlined />} onClick={onReset} disabled={!isDirty}>重置</Button>
        <Button type="primary" size="small" icon={<SaveOutlined />} onClick={() => onSave('manual')} loading={saving} disabled={!isDirty}>保存</Button>
      </div>
    )
  }

  // 项目模式：带Tab切换的布局
  if (projectMode) {
    const tabItems = [
      {
        key: 'forms',
        label: (
          <span style={{ fontSize: 12 }}>
            <FormOutlined style={{ marginRight: 4 }} />
            表单
          </span>
        ),
        children: renderTreeContent()
      },
      {
        key: 'documents',
        label: (
          <span style={{ fontSize: 12 }}>
            <FileTextOutlined style={{ marginRight: 4 }} />
            文档
            {projectDocuments.length > 0 && (
              <Badge
                count={projectDocuments.length}
                size="small"
                style={{ marginLeft: 4 }}
              />
            )}
          </span>
        ),
        children: (
          <div
            style={{
              height: '100%',
              overflow: 'auto'
            }}
            className="category-tree-scrollable"
          >
            <DocumentList
              documents={projectDocuments}
              selectedDocumentId={selectedDocument?.id}
              onDocumentSelect={onDocumentSelect}
              onUploadDocument={onUploadDocument}
              onViewDocumentDetail={handleViewDocumentDetail}
            />
          </div>
        )
      }
    ]

    return (
      <div
        style={{
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          background: '#fafafa',
          borderRadius: 8,
          overflow: 'hidden',
          ...style
        }}
      >
        <style>{scrollbarStyle}</style>
        <style>{treeNodeStyles}</style>

        {/* Tab切换 */}
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={tabItems}
          size="small"
          tabBarExtraContent={activeTab === 'forms' ? (
            <Tooltip title={isAllExpanded ? '收起全部' : '展开全部'}>
              <Button
                type="text"
                size="small"
                icon={isAllExpanded ? <MinusSquareOutlined /> : <PlusSquareOutlined />}
                onClick={handleToggleExpandAll}
                style={{
                  padding: '2px 6px',
                  height: 'auto',
                  fontSize: 14,
                  color: '#999'
                }}
              />
            </Tooltip>
          ) : null}
          className="category-tree-tabs"
          style={{
            flex: 1,
            display: 'flex',
            flexDirection: 'column',
            minHeight: 0,
            overflow: 'hidden'
          }}
          tabBarStyle={{
            margin: 0,
            padding: '0 12px',
            background: '#fff',
            borderBottom: '1px solid #f0f0f0',
            flexShrink: 0
          }}
        />

        {/* 底部工具栏 */}
        {renderBottomToolbar()}

        {/* 文档详情弹窗 */}
        <DocumentDetailModal
          visible={detailVisible}
          document={detailDoc}
          patientId={patientId}
          onClose={handleCloseDocumentDetail}
        />
      </div>
    )
  }

  // 标准模式
  return (
    <div
      style={{
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        background: '#fafafa',
        borderRadius: 8,
        overflow: 'hidden',
        ...style
      }}
    >
      <style>{scrollbarStyle}</style>
      <style>{treeNodeStyles}</style>

      {/* 标题栏 */}
      <div style={{
        padding: '8px 12px',
        borderBottom: '1px solid #f0f0f0',
        background: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <FileTextOutlined style={{ color: '#1890ff', marginRight: 8 }} />
          <Text strong style={{ fontSize: 14, color: '#333' }}>
            电子病历
          </Text>
        </div>
        <Tooltip title={isAllExpanded ? '收起全部' : '展开全部'}>
          <Button
            type="text"
            size="small"
            icon={isAllExpanded ? <MinusSquareOutlined /> : <PlusSquareOutlined />}
            onClick={handleToggleExpandAll}
            style={{
              padding: '2px 6px',
              height: 'auto',
              fontSize: 14,
              color: '#999'
            }}
          />
        </Tooltip>
      </div>

      {/* 目录树 */}
      <div
        className="category-tree-scrollable"
        style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', minHeight: 0 }}
      >
        <Tree
          treeData={treeData}
          expandedKeys={expandedKeys}
          onExpand={handleExpand}
          selectedKeys={selectedTreeKey ? [selectedTreeKey] : []}
          onSelect={handleSelect}
          titleRender={titleRender}
          showIcon={false}
          switcherIcon={() => null}
          blockNode
          style={{
            padding: '8px 0',
            background: 'transparent'
          }}
          className="category-tree-nodes"
        />
      </div>

      {/* 底部工具栏 */}
      {renderBottomToolbar()}
    </div>
  )
}

export default CategoryTree
