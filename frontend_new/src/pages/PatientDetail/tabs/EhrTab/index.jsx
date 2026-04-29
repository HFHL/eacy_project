/**
 * 电子病历Tab组件
 * 三栏布局：左侧字段组树 + 中间字段详情 + 右侧文档溯源侧边栏（默认收起）
 */
import React, { useState, useCallback, useRef, useEffect } from 'react'
import { Space, Button, message, Modal, Select, Upload } from 'antd'

// 导入子组件
import LeftPanel from './components/LeftPanel'
import MiddlePanel from './components/MiddlePanel'
import RightPanel from './components/RightPanel'
// 导入Hooks
import { useEhrLayout } from './hooks/useEhrLayout'
import { useEhrFieldGroups } from './hooks/useEhrFieldGroups'
import { useEhrFieldEdit } from './hooks/useEhrFieldEdit'
// 导入API
import { extractEhrData, extractEhrDataTargeted, getFreshDocumentPdfStreamUrl, getDocumentTempUrl, uploadDocument } from '@/api/document'
import { getEhrFieldEvidence, getEhrFieldHistory, getPatientEhr } from '@/api/patient'
import { appThemeToken } from '@/styles/themeTokens'

const EhrTab = ({
  // 患者ID（用于保存病历字段）
  patientId,
  
  // 字段组相关props
  ehrFieldGroups,
  
  // 文档相关props
  selectedEhrDocument,
  setSelectedEhrDocument,
  ehrDocuments,
  
  // 数据和工具函数
  ehrFieldsData,
  getEhrStatusIcon,
  getEhrConfidenceColor,
  
  // 事件处理函数
  handleEhrViewSource,
  
  // 刷新病历数据的回调
  onEhrRefresh,
  
  // 布局相关props
  layoutMode,
  
  // 项目模式相关props
  isProjectMode = false,
  projectDocuments = [],
  selectedProjectDocument = null,
  onProjectDocumentSelect = null,
  onUploadProjectDocument = null
}) => {
  // 使用布局管理Hook
  const {
    ehrLeftWidth,
    ehrRightWidth,
    setEhrRightWidth,
    handleLeftResize
  } = useEhrLayout()

  const rightPanelVisible = layoutMode === 'three-column'

  // 右侧面板宽度拖拽调整
  const handleRightResize = useCallback((e) => {
    e.preventDefault()
    const startX = e.clientX
    const startWidth = ehrRightWidth

    const handleMouseMove = (moveEvent) => {
      moveEvent.preventDefault()
      const delta = startX - moveEvent.clientX
      const newWidth = Math.max(280, Math.min(Math.round(window.innerWidth * 0.5), startWidth + delta))
      setEhrRightWidth(newWidth)
    }

    const handleMouseUp = () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.body.style.cursor = 'default'
      document.body.style.userSelect = 'auto'
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleMouseUp)
  }, [ehrRightWidth, setEhrRightWidth])

  // 使用字段组管理Hook
  const {
    selectedEhrGroup,
    expandedGroups,
    handleEhrGroupSelect: originalHandleEhrGroupSelect,
    handleGroupToggle,
    expandAllGroups,
    collapseAllGroups
  } = useEhrFieldGroups()

  // 使用字段编辑管理Hook，传入 patientId 和刷新回调
  const {
    editingEhrField,
    editingEhrValue,
    setEditingEhrValue,
    handleEhrFieldEdit,
    handleEhrSaveEdit,
    handleEhrCancelEdit,
    saving
  } = useEhrFieldEdit(patientId, onEhrRefresh)

  // 重新抽取状态
  const [extracting, setExtracting] = useState(false)
  const [targetModalOpen, setTargetModalOpen] = useState(false)
  const [targetDocumentId, setTargetDocumentId] = useState(null)
  const [targetFileList, setTargetFileList] = useState([])
  const [targetContext, setTargetContext] = useState(null)

  // 文档溯源相关状态
  const [selectedField, setSelectedField] = useState(null)
  const [fieldHistory, setFieldHistory] = useState([])
  const [historyLoading, setHistoryLoading] = useState(false)
  const [documentImageUrl, setDocumentImageUrl] = useState(null)
  const [imageLoading, setImageLoading] = useState(false)
  const [sourceLocation, setSourceLocation] = useState(null)
  const [fallbackDocument, setFallbackDocument] = useState(null) // 兜底文档（无变更历史时使用）

  /**
   * 兜底：根据字段的 apiFieldId 从患者关联文档中匹配最可能的来源文档
   * 规则：apiFieldId → 关键词列表 → 在 ehrDocuments 中按文档名/类型匹配
   * 如果关键词匹配不到，回退到患者最近的一份文档
   */
  const resolveFallbackDocument = useCallback((field) => {
    if (!ehrDocuments || ehrDocuments.length === 0) return null

    const apiFieldId = field.apiFieldId || ''

    // apiFieldId → 匹配关键词（按优先级排列）
    const FIELD_DOC_KEYWORDS = {
      // 基本信息类
      personal_info: ['入院记录', '病案首页', '首页'],
      contact_info: ['入院记录', '病案首页'],
      demographics: ['入院记录', '病案首页'],
      lifestyle: ['入院记录', '病程记录', '病史'],
      personal_history: ['入院记录', '病程记录', '病史'],
      menstrual: ['入院记录', '病程记录'],
      // 诊疗类
      diagnosis_records: ['入院记录', '出院小结', '出院记录', '诊断'],
      medication_records: ['医嘱', '用药', '处方'],
      treatment_records: ['手术记录', '治疗', '手术'],
      surgical_records: ['手术记录', '手术'],
      // 检查检验类
      laboratory_records: ['检验报告', '检验', '化验'],
      imaging_records: ['影像', 'CT', 'MRI', 'X线', '超声', '检查报告'],
      pathology_records: ['病理报告', '病理'],
      genetics_records: ['基因检测', '基因'],
      // 病史类
      past_medical_records: ['入院记录', '病史', '病程记录'],
      allergy_records: ['入院记录', '过敏'],
      family_history_records: ['入院记录', '家族史'],
      immunization_records: ['入院记录', '免疫', '接种'],
      reproductive_records: ['入院记录', '生育'],
      comorbidity_records: ['入院记录', '合并症'],
    }

    // 根据 apiFieldId 前缀匹配关键词列表
    let keywords = []
    for (const [prefix, kws] of Object.entries(FIELD_DOC_KEYWORDS)) {
      if (apiFieldId === prefix || apiFieldId.startsWith(prefix + '_') || apiFieldId.startsWith(prefix)) {
        keywords = kws
        break
      }
    }

    // 评分函数：文档名/类型与关键词的匹配度
    const scoreDocument = (doc) => {
      const content = [doc.name, doc.category].filter(Boolean).join(' ').toLowerCase()
      let score = 0
      for (let i = 0; i < keywords.length; i++) {
        const kw = keywords[i].toLowerCase()
        if (content.includes(kw)) {
          // 关键词靠前的优先级更高
          score += (keywords.length - i) * 10
        }
      }
      return score
    }

    // 尝试关键词匹配
    if (keywords.length > 0) {
      const scored = ehrDocuments
        .map((doc, idx) => ({ doc, score: scoreDocument(doc), idx }))
        .filter(item => item.score > 0)
        .sort((a, b) => b.score - a.score || a.idx - b.idx)

      if (scored.length > 0) {
        console.log('🔄 兜底匹配到文档:', scored[0].doc.name, '匹配分:', scored[0].score)
        return scored[0].doc
      }
    }

    // 关键词匹配不到：回退到最近（列表最后）的一份文档
    const fallback = ehrDocuments[ehrDocuments.length - 1]
    console.log('🔄 兜底：使用患者最近的文档:', fallback?.name)
    return fallback || null
  }, [ehrDocuments])

  // 处理字段点击 - 加载溯源历史
  const handleFieldViewSource = useCallback(async (field) => {
    if (!field || !patientId) {
      console.log('字段信息不完整，无法加载溯源历史')
      return
    }

    // 获取字段ID（优先使用后端数据库字段名 apiFieldId）
    // 如果没有 apiFieldId，则尝试使用 id 或 fieldId
    const fieldId = field.apiFieldId || field.id || field.fieldId
    if (!fieldId) {
      console.log('缺少字段ID')
      return
    }

    console.log('🔍 加载字段溯源历史:', { fieldId, fieldName: field.name, apiFieldId: field.apiFieldId })
    
    setSelectedField(field)
    setHistoryLoading(true)
    setFieldHistory([])
    setDocumentImageUrl(null)
    setSourceLocation(null)
    setFallbackDocument(null)

    try {
      // 1. 获取字段溯源历史和 TextIn 原始坐标证据
      const [historyRes, evidenceRes] = await Promise.all([
        getEhrFieldHistory(patientId, fieldId),
        getEhrFieldEvidence(patientId, fieldId),
      ])
      console.log('溯源历史响应:', historyRes)
      console.log('溯源证据响应:', evidenceRes)

      if (historyRes.success && historyRes.data) {
        const history = Array.isArray(historyRes.data) ? historyRes.data : (historyRes.data.history || [])
        const evidences = evidenceRes.success && Array.isArray(evidenceRes.data) ? evidenceRes.data : []
        const evidenceLocations = evidences
          .map(item => item.source_location)
          .filter(loc => loc && Array.isArray(loc.polygon) && loc.polygon.length >= 8)
        setFieldHistory(history)

        // 2. 优先使用 evidence 的 TextIn polygon；历史事件仅用于定位来源文档和变更信息
        if (evidenceLocations.length > 0) {
          setSourceLocation(evidenceLocations)
        }

        const traceableEvidence = evidences.find(item => item.document_id)

        // 3. 查找有 source_document_id 的最新记录
        const traceableHistory = history.find(h => h.source_document_id)
        const traceDocumentId = traceableEvidence?.document_id || traceableHistory?.source_document_id

        if (traceDocumentId) {
          if (evidenceLocations.length === 0 && traceableHistory?.source_location) {
            setSourceLocation(traceableHistory.source_location)
          }
          setImageLoading(true)
          try {
            const urlRes = await getDocumentTempUrl(traceDocumentId)
            console.log('文档URL响应:', urlRes)
            if (urlRes.success && urlRes.data?.temp_url) {
              const fileType = String(urlRes.data.file_type || urlRes.data.file_name || urlRes.data.mime_type || '').toLowerCase()
              if (evidenceLocations.length > 0) {
                setSourceLocation(evidenceLocations.map(location => ({
                  ...location,
                  file_name: urlRes.data.file_name,
                  mime_type: urlRes.data.mime_type,
                })))
              }
              setDocumentImageUrl(fileType === 'pdf'
                ? await getFreshDocumentPdfStreamUrl(traceDocumentId)
                : urlRes.data.temp_url)
            }
          } catch (urlError) {
            console.error('获取文档URL失败:', urlError)
          } finally {
            setImageLoading(false)
          }
        } else {
          console.log('无可溯源的变更历史，启动兜底匹配')
          const matched = resolveFallbackDocument(field)
          if (matched) {
            setFallbackDocument(matched)
            setImageLoading(true)
            try {
              const urlRes = await getDocumentTempUrl(matched.id)
              if (urlRes.success && urlRes.data?.temp_url) {
                const fileType = String(urlRes.data.file_type || urlRes.data.file_name || urlRes.data.mime_type || '').toLowerCase()
                setDocumentImageUrl(fileType === 'pdf'
                  ? await getFreshDocumentPdfStreamUrl(matched.id)
                  : urlRes.data.temp_url)
              }
            } catch (urlError) {
              console.error('获取兜底文档URL失败:', urlError)
            } finally {
              setImageLoading(false)
            }
          }
        }
      }
    } catch (error) {
      console.error('获取溯源历史失败:', error)
      message.error('获取溯源历史失败')
    } finally {
      setHistoryLoading(false)
    }
  }, [patientId, resolveFallbackDocument])

  // 查看完整文档
  const handleViewFullDocument = useCallback(async (documentId) => {
    if (!documentId) return
    
    try {
      const urlRes = await getDocumentTempUrl(documentId)
      if (urlRes.success && urlRes.data?.temp_url) {
        window.open(urlRes.data.temp_url, '_blank')
      } else {
        message.error('获取文档URL失败')
      }
    } catch (error) {
      console.error('获取文档URL失败:', error)
      message.error('获取文档URL失败')
    }
  }, [])

  // 处理重新抽取
  const handleReExtract = async (doc) => {
    if (!doc || !doc.id) {
      message.error('文档信息不完整')
      return
    }
    
    setExtracting(true)
    try {
      console.log('开始重新抽取文档:', doc.id)
      const response = await extractEhrData(doc.id)
      console.log('重新抽取响应:', response)
      
      if (response.success) {
        message.success(`重新抽取成功，共抽取 ${response.data?.fields_count || 0} 个字段`)
        // 刷新病历数据
        onEhrRefresh?.()
      } else {
        message.error(response.message || '重新抽取失败')
      }
    } catch (error) {
      console.error('重新抽取异常:', error)
      const errorMsg = error.response?.data?.message || error.message || '重新抽取失败'
      message.error(`重新抽取失败: ${errorMsg}`)
    } finally {
      setExtracting(false)
    }
  }

  const openTargetExtraction = async () => {
    if (!selectedEhrGroup) {
      message.warning('请先选择一个表单')
      return
    }
    setTargetDocumentId(selectedEhrDocument?.id || ehrDocuments?.[0]?.id || null)
    setTargetFileList([])
    setTargetModalOpen(true)
    if (!targetContext && patientId) {
      try {
        const response = await getPatientEhr(patientId)
        setTargetContext(response.data?.context || null)
      } catch (error) {
        console.error('获取病历上下文失败:', error)
      }
    }
  }

  const submitTargetExtraction = async () => {
    if (!patientId || !selectedEhrGroup) return
    setExtracting(true)
    try {
      let documentId = targetDocumentId
      let waitForDocumentReady = false
      const file = targetFileList[0]?.originFileObj
      if (file) {
        const uploadResponse = await uploadDocument(file, patientId)
        documentId = uploadResponse.data?.id || uploadResponse.data?.document_id
        waitForDocumentReady = true
      }
      if (!documentId) {
        message.warning('请选择或上传一个文档')
        return
      }
      const response = await extractEhrDataTargeted({
        documentId,
        patientId,
        contextId: targetContext?.id,
        schemaVersionId: targetContext?.schema_version_id,
        targetFormKey: selectedEhrGroup,
        waitForDocumentReady,
      })
      if (response.success) {
        message.success(waitForDocumentReady ? '文档已上传，OCR 完成后将自动专项抽取' : '专项抽取已完成')
        setTargetModalOpen(false)
        onEhrRefresh?.()
      } else {
        message.error(response.message || '专项抽取失败')
      }
    } catch (error) {
      console.error('专项抽取失败:', error)
      const detail = error.response?.data?.detail || error.response?.data?.message || error.message || '专项抽取失败'
      message.error(detail)
    } finally {
      setExtracting(false)
    }
  }

  // 内部实现getCurrentGroupData逻辑
  const getCurrentGroupData = () => {
    const groupData = ehrFieldsData[selectedEhrGroup] || { name: '未知字段组', fields: [], repeatable: false }
    // 调试日志
    console.log('🔍 getCurrentGroupData:', {
      selectedEhrGroup,
      groupName: groupData.name,
      fieldsCount: groupData.fields?.length || 0,
      recordsCount: groupData.records?.length || 0,
      repeatable: groupData.repeatable,
      fields: groupData.fields?.map(f => ({ name: f.name, value: f.value, fieldType: f.fieldType }))
    })
    return groupData
  }

  // 自定义字段组选择处理，结合文档关联和布局模式
  const handleEhrGroupSelectWithDocument = (groupKey) => {
    // 调用原始的字段组选择处理
    originalHandleEhrGroupSelect(groupKey)
    
    // 检查是否为叶子节点（子字段组）
    let isLeafNode = false
    
    // 遍历所有字段组，查找是否为某个字段组的子节点
    for (const group of ehrFieldGroups) {
      if (group.children) {
        for (const child of group.children) {
          if (child.key === groupKey) {
            isLeafNode = true
            break
          }
        }
      }
      if (isLeafNode) break
    }
    
    // 如果不是子节点，检查是否为没有children的顶级节点
    if (!isLeafNode) {
      const topLevelGroup = ehrFieldGroups.find(group => group.key === groupKey)
      if (topLevelGroup && !topLevelGroup.children) {
        isLeafNode = true
      }
    }
    
    console.log(`字段组 ${groupKey} 是否为叶子节点: ${isLeafNode}, 当前布局模式: ${layoutMode}`)
    
    // 只有在三栏模式下的叶子节点才自动显示对应的文档
    if (isLeafNode && layoutMode === 'three-column') {
      // 根据字段组查找对应的文档
      // 获取当前字段组的第一个字段的source，然后在ehrDocuments中查找对应文档
      const currentGroup = getCurrentGroupData()
      let documentSource = null
      
      if (currentGroup.fields && currentGroup.fields.length > 0) {
        // 普通字段组：取第一个字段的source
        documentSource = currentGroup.fields[0].source
      } else if (currentGroup.records && currentGroup.records.length > 0) {
        // 可重复字段组：取第一个记录的第一个字段的source
        documentSource = currentGroup.records[0].fields[0].source
      }
      
      if (documentSource) {
        const relatedDoc = ehrDocuments.find(doc => doc.id === documentSource)
        if (relatedDoc) {
          setSelectedEhrDocument(relatedDoc)
          console.log(`✅ 三栏模式 - 选中叶子节点 ${groupKey}，显示对应文档:`, relatedDoc.name)
        } else {
          console.log(`⚠️ 未找到source为 ${documentSource} 的文档`)
        }
      }
    } else {
      if (layoutMode === 'two-column' && isLeafNode) {
        console.log(`🔒 两栏模式 - 选中叶子节点 ${groupKey}，不自动显示文档（需手动切换到三栏）`)
      } else if (!isLeafNode) {
        console.log(`❌ 选中父节点 ${groupKey}，不显示文档`)
      }
      // 在两栏模式下或选择父节点时，不清空已选中的文档，保持当前状态
    }
  }

  return (
    <>
      <div style={{ display: 'flex', gap: '8px' }}>
        {/* 左侧面板：电子病历树形结构 */}
        <div style={{ width: `${ehrLeftWidth}px`, minWidth: '100px' }}>
          <LeftPanel
            ehrFieldGroups={ehrFieldGroups}
            selectedEhrGroup={selectedEhrGroup}
            expandedGroups={expandedGroups}
            getEhrStatusIcon={getEhrStatusIcon}
            onGroupSelect={handleEhrGroupSelectWithDocument}
            onGroupToggle={handleGroupToggle}
            onExpandAll={() => expandAllGroups(ehrFieldGroups)}
            onCollapseAll={collapseAllGroups}
            // 项目模式相关props
            isProjectMode={isProjectMode}
            projectDocuments={projectDocuments}
            selectedDocument={selectedProjectDocument}
            onDocumentSelect={onProjectDocumentSelect}
            onUploadDocument={onUploadProjectDocument}
          />
        </div>

        {/* 左侧拖动分隔条 */}
        <div 
          style={{ 
            width: '4px', 
            background: appThemeToken.colorBorder, 
            cursor: 'col-resize',
            borderRadius: '2px',
            transition: 'background 0.2s'
          }}
          onMouseDown={handleLeftResize}
          onMouseEnter={(e) => e.target.style.background = appThemeToken.colorBorderSecondary}
          onMouseLeave={(e) => e.target.style.background = appThemeToken.colorBorder}
        />

        {/* 中间面板：字段数据展示 */}
        <div style={{ flex: 1, minWidth: '400px' }}>
          <MiddlePanel
            currentGroup={getCurrentGroupData()}
            editingEhrField={editingEhrField}
            editingEhrValue={editingEhrValue}
            setEditingEhrValue={setEditingEhrValue}
            handleEhrFieldEdit={handleEhrFieldEdit}
            handleEhrSaveEdit={handleEhrSaveEdit}
            handleEhrCancelEdit={handleEhrCancelEdit}
            handleEhrGroupExtract={openTargetExtraction}
            handleEhrViewSource={handleFieldViewSource}
            handleEhrEditRecord={(recordId) => console.log('编辑记录:', recordId)}
            handleEhrDeleteRecord={(recordId) => console.log('删除记录:', recordId)}
            onDeleteTableRow={(fieldId, rowId) => console.log('删除表格行:', fieldId, rowId)}
            onAddTableRow={(fieldId, newRow) => console.log('新增表格行:', fieldId, newRow)}
            onAddNewGroup={(groupName) => console.log('添加新字段组:', groupName)}
            getEhrConfidenceColor={getEhrConfidenceColor}
          />
        </div>

        {/* 右侧侧边栏：文档溯源 */}
        {rightPanelVisible && (
          <>
            <div
              style={{
                width: 4,
                background: appThemeToken.colorBorder,
                cursor: 'col-resize',
                borderRadius: 2,
                transition: 'background 0.2s',
                flexShrink: 0,
              }}
              onMouseDown={handleRightResize}
              onMouseEnter={(e) => e.target.style.background = appThemeToken.colorBorderSecondary}
              onMouseLeave={(e) => e.target.style.background = appThemeToken.colorBorder}
            />
            {/* 右侧溯源区块：固定在视口右侧，随页面滚动始终可见 */}
            <div
              style={{
                width: `${ehrRightWidth}px`,
                minWidth: 280,
                flexShrink: 0,
                display: 'flex',
                flexDirection: 'column',
                borderLeft: `1px solid ${appThemeToken.colorBorder}`,
                background: appThemeToken.colorBgContainer,
                position: 'fixed',
                top: 64,                 // 与 MainLayout Header 高度对齐
                right: 0,
                height: 'calc(100vh - 64px)',
                overflowY: 'auto',
                zIndex: 90,
              }}
            >
              <div style={{ flex: 1 }}>
                <RightPanel
                  selectedField={selectedField}
                  fieldHistory={fieldHistory}
                  historyLoading={historyLoading}
                  documentImageUrl={documentImageUrl}
                  imageLoading={imageLoading}
                  sourceLocation={sourceLocation}
                  fallbackDocument={fallbackDocument}
                  onViewFullDocument={handleViewFullDocument}
                  onReExtract={handleReExtract}
                  extracting={extracting}
                />
              </div>
            </div>
          </>
        )}
      </div>

      <Modal
        title="表单专项抽取"
        open={targetModalOpen}
        onCancel={() => setTargetModalOpen(false)}
        onOk={submitTargetExtraction}
        okText="开始抽取"
        confirmLoading={extracting}
        destroyOnClose
      >
        <Space direction="vertical" style={{ width: '100%' }} size="middle">
          <div>当前表单：{getCurrentGroupData().name || selectedEhrGroup}</div>
          <Select
            allowClear
            style={{ width: '100%' }}
            placeholder="选择已有患者文档"
            value={targetDocumentId}
            onChange={setTargetDocumentId}
            disabled={targetFileList.length > 0}
            options={(ehrDocuments || []).map((doc) => ({
              value: doc.id,
              label: doc.name || doc.file_name || doc.original_filename || doc.id,
            }))}
          />
          <Upload
            beforeUpload={() => false}
            maxCount={1}
            fileList={targetFileList}
            onChange={({ fileList }) => {
              setTargetFileList(fileList.slice(-1))
              if (fileList.length > 0) setTargetDocumentId(null)
            }}
          >
            <Button>上传新文档并抽取</Button>
          </Upload>
        </Space>
      </Modal>
    </>
  )
}

export default EhrTab
