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
import React, { useMemo, useCallback, useState, useEffect } from 'react'
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
  MenuFoldOutlined,
  MenuUnfoldOutlined
} from '@ant-design/icons'
import { useSchemaForm, setNestedValue, orderedPropertyEntries } from './SchemaFormContext'
import DocumentCard from '../../pages/PatientDetail/tabs/DocumentsTab/components/DocumentCard'
import DocumentDetailModal from '../../pages/PatientDetail/tabs/DocumentsTab/components/DocumentDetailModal'
import { appThemeToken } from '../../styles/themeTokens'

const { Text } = Typography
const HEADER_ICON_BUTTON_BASE_STYLE = {
  padding: 0,
  height: 24,
  minWidth: 24,
  fontSize: 14,
  borderRadius: 6,
  border: `1px solid ${appThemeToken.colorBorder}`
}
const HEADER_ICON_BUTTON_SECONDARY_STYLE = {
  ...HEADER_ICON_BUTTON_BASE_STYLE,
  color: appThemeToken.colorTextSecondary
}
const HEADER_ICON_BUTTON_MUTED_STYLE = {
  ...HEADER_ICON_BUTTON_BASE_STYLE,
  color: appThemeToken.colorTextTertiary
}

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

  const countFields = (props, dataObj, parentNode) => {
    for (const [key, fieldSchema] of orderedPropertyEntries(props, parentNode)) {
      if (fieldSchema.type === 'array') {
        // 数组类型算一个字段
        total++
        const arr = dataObj?.[key]
        if (Array.isArray(arr) && arr.length > 0) {
          filled++
        }
      } else if (fieldSchema.type === 'object' && fieldSchema.properties) {
        // 递归处理嵌套对象
        countFields(fieldSchema.properties, dataObj?.[key], fieldSchema)
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

  countFields(schemaNode.properties, data, schemaNode)
  return { filled, total }
}

/**
 * 计算文件夹的总体进度（汇总所有子表单）
 */
function calculateFolderProgress(folderSchema, folderData) {
  if (!folderSchema?.properties) return { filled: 0, total: 0 }

  let totalFilled = 0
  let totalCount = 0

  for (const [formName, formSchema] of orderedPropertyEntries(folderSchema.properties, folderSchema)) {
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
 * 判断是否为可重复表单（仅表单级语义）。
 * 条件：type === 'array' && items.type === 'object' && items.properties 存在。
 * 说明：object + table 的兼容语义属于“字段级 table”，不应在目录树层被识别为可重复表单。
 */
function isRepeatableForm(schema) {
  if (!schema || typeof schema !== 'object') return false
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
  // 默认命名规则：保留完整表单名，避免“诊断记录”被裁剪为“诊断”。
  return `${formName}`
}

/**
 * 生成实例名称
 */
function generateInstanceName(pattern, index, startIndex = 1) {
  // 兼容旧 pattern（带 {index}）：直接替换
  if (pattern.includes('{index}')) {
  return pattern.replace('{index}', index + startIndex)
  }
  // 默认：始终带序号，与中间栏标题规则保持一致（xxx_1、xxx_2...）。
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
        const repeatable = isRepeatableForm(formSchema)

        if (repeatable) {
          const dataArray = Array.isArray(formData) ? formData : []
          const formProgress = calculateFormProgress(formSchema, formData)
          const namingPattern = getRepeatableNaming(formName, formSchema)
          const startIndex = formSchema?.['x-repeatable-naming']?.startIndex || 1
          const totalInstances = dataArray.length

          if (dataArray.length === 0) {
            // 空可重复表单：保留一个根节点用于“新增第一条记录”。
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
            continue
          }

          // 非空可重复表单：仅展示实例节点，避免“根节点表格视图”和“实例视图”双轨并存。
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
 * 计算目录树默认应选中的首个表单路径。
 *
 * 规则：
 * 1. 优先取第一个文件夹的第一个子表单；
 * 2. 若第一个文件夹没有子表单，则顺序回退到后续文件夹；
 * 3. 若全树均无可选子表单，返回 null。
 *
 * @param {Array<Object>} treeData 目录树数据
 * @returns {string|null} 默认选中路径
 */
function getFirstFormPath(treeData) {
  if (!Array.isArray(treeData) || treeData.length === 0) return null
  for (const folder of treeData) {
    const firstChild = Array.isArray(folder?.children) ? folder.children[0] : null
    if (firstChild?.path) return firstChild.path
  }
  return null
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
  for (const [key, fieldSchema] of orderedPropertyEntries(itemSchema.properties, itemSchema)) {
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
    ? orderedPropertyEntries(schemaNode.properties, schemaNode)
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
        <FolderOpenOutlined style={{ color: appThemeToken.colorWarning, marginRight: 6 }} /> :
        <FolderOutlined style={{ color: appThemeToken.colorWarning, marginRight: 6 }} />
    }
    if (isForm && nodeIsRepeatableForm) {
      return <TableOutlined style={{ color: appThemeToken.colorPrimary, marginRight: 6 }} />
    }
    if (isFormInstance) {
      return <BlockOutlined style={{ color: appThemeToken.colorPrimary, marginRight: 6 }} />
    }
    // 普通表单 - 使用 FormOutlined 图标
    return <FormOutlined style={{ color: appThemeToken.colorSuccess, marginRight: 6 }} />
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
    ? (hasData ? '清空全部记录' : '清空表单')
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
            fontSize: 14,
            fontWeight: isFolder ? 500 : 400,
            color: hasData ? appThemeToken.colorText : appThemeToken.colorTextSecondary,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap'
          }}
        >
          {node.title}
        </Text>
        {isFolder && (
          <Text style={{ fontSize: 12, color: appThemeToken.colorTextTertiary, marginLeft: 5, flexShrink: 0 }}>
            #{node.children?.length ?? 0}
          </Text>
        )}
        {!isFormInstance && isForm && nodeIsRepeatableForm && (
          <Text style={{ fontSize: 12, color: appThemeToken.colorTextTertiary, marginLeft: 5, flexShrink: 0 }}>
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
              color: appThemeToken.colorTextTertiary
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
                  color: appThemeToken.colorPrimary
                }}
              />
            </Tooltip>
          </Dropdown>
        )}

        {(canAdd || canAddOnInstance) && (
          <Tooltip title={hasData ? '新增记录' : '新增记录'} placement="top">
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
                color: appThemeToken.colorPrimary
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
                color: appThemeToken.colorError
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
  // eslint-disable-next-line no-console
  console.log('[CategoryTree.DocumentList] 渲染:', {
    count: documents.length,
    sample: documents.length > 0
      ? { id: documents[0].id, name: documents[0].name, status: documents[0].status }
      : null,
  })
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
          background: isSelected ? appThemeToken.colorPrimaryBg : appThemeToken.colorBgContainer,
          border: `1px solid ${isSelected ? appThemeToken.colorPrimary : appThemeToken.colorBorder}`,
          transition: 'all 0.2s'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {isPdf ? (
            <FilePdfOutlined style={{ color: appThemeToken.colorError, fontSize: 14 }} />
          ) : (
            <FileImageOutlined style={{ color: appThemeToken.colorPrimary, fontSize: 14 }} />
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
                  color: appThemeToken.colorPrimary
                }}
              />
            </Tooltip>
          )}
          {doc.status === 'extracted' ? (
            <CheckCircleOutlined style={{ color: appThemeToken.colorSuccess, fontSize: 12 }} />
          ) : (
            <ClockCircleOutlined style={{ color: appThemeToken.colorWarning, fontSize: 12 }} />
          )}
        </div>
        <div style={{
          marginTop: 4,
          fontSize: 12,
          color: appThemeToken.colorTextTertiary,
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
          <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
            已抽取 ({extractedDocs.length})
          </Text>
          {extractedDocs.map(renderDocItem)}
        </div>
      )}

      {/* 待处理文档 */}
      {pendingDocs.length > 0 && (
        <div>
          <Text type="secondary" style={{ fontSize: 12, display: 'block', marginBottom: 4 }}>
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

  // 患者ID（用于文档详情弹窗）
  patientId = null,
  // 目录栏折叠控制（由 SchemaFormInner 管理）
  collapsed = false,
  onToggleCollapse,
  collapsible = true,
  /** 收起状态下展示的竖排标题文案 */
  collapsedTitle = '目录'
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

  /**
   * 首次进入时自动选中“第一个文件夹中的首个表单”。
   *
   * 交互策略：
   * - 当前未选中任何路径：立即选中首个表单（初始加载）。
   * - 已有 selectedPath 但当前树短暂失配：延迟兜底，避免保存/刷新瞬间误回首项。
   *
   * 注意：
   * - 使用内部 setSelectedPath，避免触发“未保存离开确认”弹窗；
   * - 同步触发 onSelect，保持外层联动一致。
   */
  useEffect(() => {
    if (!treeData.length) return

    if (selectedPath && selectedTreeKey) return

    /**
     * 执行一次首表单自动选中。
     * @returns {void}
     */
    const selectFirstPath = () => {
      const firstPath = getFirstFormPath(treeData)
      if (!firstPath) return
      actions.setSelectedPath(firstPath)
      if (onSelect) {
        onSelect(firstPath, { key: firstPath, path: firstPath, isAutoSelected: true })
      }
    }

    if (!selectedPath) {
      selectFirstPath()
      return
    }

    // 已有路径但暂时失配：给一次短暂缓冲，避免保存后数据回流瞬间触发误重置。
    const fallbackTimer = setTimeout(() => {
      selectFirstPath()
    }, 200)
    return () => clearTimeout(fallbackTimer)
  }, [actions, onSelect, selectedPath, selectedTreeKey, treeData])

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

  /**
   * 尝试切换选中路径（若有 onBeforeSelect 则先确认）。
   *
   * 交互约束：
   * 1. 传入空路径时不进行任何状态写入；
   * 2. 点击当前已选中的同一路径时保持原位，不重复触发外层联动。
   *
   * @param {string | undefined | null} path - 目标路径
   * @param {Object} [node] - 目录树节点
   * @returns {Promise<void>}
   */
  const trySetSelectedPath = useCallback(async (path, node) => {
    if (!path || typeof path !== 'string') return
    if (path === selectedPath) return

    if (onBeforeSelect) {
      const allow = await onBeforeSelect(path)
      if (!allow) return
    }
    actions.setSelectedPath(path)
    if (onSelect) {
      onSelect(path, node || { key: path })
    }
  }, [actions, onBeforeSelect, onSelect, selectedPath])

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

    // 自动选中新添加的实例（内部状态切换，避免被“未保存离开确认”拦截）
    const newInstancePath = `${path}.${currentCount}`
    setTimeout(() => {
      actions.setSelectedPath(newInstancePath)
      if (onSelect) {
        onSelect(newInstancePath, { key: newInstancePath, path: newInstancePath, isFormInstance: true })
      }
    }, 100)
  }, [actions, draftData, onAddRepeatableInstance, onSelect])

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
    const path = selectedKeys?.[0] || node?.path || node?.key
    if (!path) return
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
      for (const [key, fieldSchema] of orderedPropertyEntries(schemaAtPath.properties, schemaAtPath)) {
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
        color: appThemeToken.colorTextTertiary,
        textAlign: 'center',
        ...style
      }}>
        请加载Schema
      </div>
    )
  }

  // Tabs 内容区域高度修复
  const tabsLayoutStyle = `
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
        className="category-tree-scrollable hover-scrollbar scroll-edge-hint"
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

  /**
   * 渲染目录头部操作按钮（顺序统一：展开/收起全部 -> 收起/展开目录）。
   * @returns {React.ReactNode} 头部操作按钮区域
   */
  const renderHeaderActions = () => (
    <Space size={4}>
      <Tooltip title={isAllExpanded ? '收起全部' : '展开全部'}>
        <Button
          type="text"
          size="small"
          aria-label={isAllExpanded ? '收起全部' : '展开全部'}
          icon={isAllExpanded ? <MinusSquareOutlined /> : <PlusSquareOutlined />}
          onClick={handleToggleExpandAll}
          style={HEADER_ICON_BUTTON_MUTED_STYLE}
        />
      </Tooltip>
      {collapsible && (
        <Tooltip title="收起目录">
          <Button
            type="text"
            size="small"
            aria-label="收起目录"
            icon={<MenuFoldOutlined />}
            onClick={onToggleCollapse}
            style={HEADER_ICON_BUTTON_SECONDARY_STYLE}
          />
        </Tooltip>
      )}
    </Space>
  )

  if (collapsed) {
    return (
      <div
        style={{
          height: '100%',
          minHeight: 42,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'flex-start',
          gap: 10,
          paddingTop: 10,
          background: appThemeToken.colorBgContainer,
          borderRadius: 0,
          border: 'none',
          ...style
        }}
      >
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            color: appThemeToken.colorTextSecondary,
            fontSize: 12,
            lineHeight: 1.25,
            letterSpacing: 1,
            writingMode: 'vertical-rl',
            textOrientation: 'upright',
            userSelect: 'none'
          }}
          aria-label="收起目录标题"
        >
          {collapsedTitle}
        </div>
        {collapsible && (
          <Tooltip title="展开目录" placement="right">
            <Button
              type="text"
              aria-label="展开目录"
              icon={<MenuUnfoldOutlined />}
              onClick={onToggleCollapse}
              style={HEADER_ICON_BUTTON_SECONDARY_STYLE}
            />
          </Tooltip>
        )}
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
            className="category-tree-scrollable hover-scrollbar scroll-edge-hint"
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
          background: appThemeToken.colorBgContainer,
          borderRadius: 0,
          overflow: 'hidden',
          ...style
        }}
      >
        <style>{tabsLayoutStyle}</style>
        <style>{treeNodeStyles}</style>

        {/* Tab切换 */}
        <Tabs
          activeKey={activeTab}
          onChange={setActiveTab}
          items={tabItems}
          size="small"
          tabBarExtraContent={activeTab === 'forms' ? renderHeaderActions() : null}
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
            minHeight: 41,
            background: appThemeToken.colorBgContainer,
            borderBottom: `1px solid ${appThemeToken.colorBorder}`,
            flexShrink: 0,
            display: 'flex',
            alignItems: 'center'
          }}
        />

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
        background: appThemeToken.colorBgContainer,
        borderRadius: 0,
        overflow: 'hidden',
        ...style
      }}
    >
      <style>{tabsLayoutStyle}</style>
      <style>{treeNodeStyles}</style>

      {/* 标题栏 */}
      <div style={{
        height: 41,
        padding: '0 12px',
        borderBottom: `1px solid ${appThemeToken.colorBorder}`,
        background: appThemeToken.colorBgContainer,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0
      }}>
        <div style={{ display: 'flex', alignItems: 'center' }}>
          <FileTextOutlined style={{ color: appThemeToken.colorPrimary, marginRight: 8 }} />
          <Text strong style={{ fontSize: 14, color: appThemeToken.colorText }}>
            目录
          </Text>
        </div>
        {renderHeaderActions()}
      </div>

      {/* 目录树 */}
      <div
        className="category-tree-scrollable hover-scrollbar scroll-edge-hint"
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

    </div>
  )
}

export default CategoryTree
