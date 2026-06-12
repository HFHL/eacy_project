import { useCallback } from 'react'

const FIELD_DOC_KEYWORDS = {
  personal_info: ['入院记录', '病案首页', '首页'],
  contact_info: ['入院记录', '病案首页'],
  demographics: ['入院记录', '病案首页'],
  lifestyle: ['入院记录', '病程记录', '病史'],
  personal_history: ['入院记录', '病程记录', '病史'],
  menstrual: ['入院记录', '病程记录'],
  diagnosis_records: ['入院记录', '出院小结', '出院记录', '诊断'],
  medication_records: ['医嘱', '用药', '处方'],
  treatment_records: ['手术记录', '治疗', '手术'],
  surgical_records: ['手术记录', '手术'],
  laboratory_records: ['检验报告', '检验', '化验'],
  imaging_records: ['影像', 'CT', 'MRI', 'X线', '超声', '检查报告'],
  pathology_records: ['病理报告', '病理'],
  genetics_records: ['基因检测', '基因'],
  past_medical_records: ['入院记录', '病史', '病程记录'],
  allergy_records: ['入院记录', '过敏'],
  family_history_records: ['入院记录', '家族史'],
  immunization_records: ['入院记录', '免疫', '接种'],
  reproductive_records: ['入院记录', '生育'],
  comorbidity_records: ['入院记录', '合并症'],
}

export const resolveFallbackDocument = (field, ehrDocuments = []) => {
  if (!ehrDocuments.length) return null

  const apiFieldId = field.apiFieldId || ''
  let keywords = []
  for (const [prefix, candidates] of Object.entries(FIELD_DOC_KEYWORDS)) {
    if (apiFieldId === prefix || apiFieldId.startsWith(`${prefix}_`) || apiFieldId.startsWith(prefix)) {
      keywords = candidates
      break
    }
  }

  const scoreDocument = (doc) => {
    const content = [doc.name, doc.category].filter(Boolean).join(' ').toLowerCase()
    return keywords.reduce((score, keyword, index) => {
      if (!content.includes(keyword.toLowerCase())) return score
      return score + (keywords.length - index) * 10
    }, 0)
  }

  if (keywords.length > 0) {
    const scored = ehrDocuments
      .map((doc, idx) => ({ doc, score: scoreDocument(doc), idx }))
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score || left.idx - right.idx)

    if (scored.length > 0) {
      console.log('🔄 兜底匹配到文档:', scored[0].doc.name, '匹配分:', scored[0].score)
      return scored[0].doc
    }
  }

  const fallback = ehrDocuments[ehrDocuments.length - 1]
  console.log('🔄 兜底：使用患者最近的文档:', fallback?.name)
  return fallback || null
}

const isLeafGroup = (groupKey, ehrFieldGroups = []) => {
  for (const group of ehrFieldGroups) {
    if (group.children?.some((child) => child.key === groupKey)) {
      return true
    }
  }

  const topLevelGroup = ehrFieldGroups.find((group) => group.key === groupKey)
  return Boolean(topLevelGroup && !topLevelGroup.children)
}

export const useEhrGroupSelection = ({
  ehrDocuments,
  ehrFieldGroups,
  ehrFieldsData,
  layoutMode,
  originalHandleEhrGroupSelect,
  selectedEhrGroup,
  setSelectedEhrDocument,
}) => {
  const getCurrentGroupData = useCallback(() => {
    const groupData = ehrFieldsData[selectedEhrGroup] || { name: '未知字段组', fields: [], repeatable: false }
    console.log('🔍 getCurrentGroupData:', {
      selectedEhrGroup,
      groupName: groupData.name,
      fieldsCount: groupData.fields?.length || 0,
      recordsCount: groupData.records?.length || 0,
      repeatable: groupData.repeatable,
      fields: groupData.fields?.map((field) => ({
        name: field.name,
        value: field.value,
        fieldType: field.fieldType,
      })),
    })
    return groupData
  }, [ehrFieldsData, selectedEhrGroup])

  const handleEhrGroupSelectWithDocument = useCallback((groupKey) => {
    originalHandleEhrGroupSelect(groupKey)

    const isLeafNode = isLeafGroup(groupKey, ehrFieldGroups)
    console.log(`字段组 ${groupKey} 是否为叶子节点: ${isLeafNode}, 当前布局模式: ${layoutMode}`)

    if (isLeafNode && layoutMode === 'three-column') {
      const currentGroup = getCurrentGroupData()
      const documentSource = currentGroup.fields?.[0]?.source || currentGroup.records?.[0]?.fields?.[0]?.source

      if (documentSource) {
        const relatedDoc = ehrDocuments.find((doc) => doc.id === documentSource)
        if (relatedDoc) {
          setSelectedEhrDocument(relatedDoc)
          console.log(`✅ 三栏模式 - 选中叶子节点 ${groupKey}，显示对应文档:`, relatedDoc.name)
        } else {
          console.log(`⚠️ 未找到source为 ${documentSource} 的文档`)
        }
      }
    } else if (layoutMode === 'two-column' && isLeafNode) {
      console.log(`🔒 两栏模式 - 选中叶子节点 ${groupKey}，不自动显示文档（需手动切换到三栏）`)
    } else if (!isLeafNode) {
      console.log(`❌ 选中父节点 ${groupKey}，不显示文档`)
    }
  }, [
    ehrDocuments,
    ehrFieldGroups,
    getCurrentGroupData,
    layoutMode,
    originalHandleEhrGroupSelect,
    setSelectedEhrDocument,
  ])

  return {
    getCurrentGroupData,
    handleEhrGroupSelectWithDocument,
  }
}
