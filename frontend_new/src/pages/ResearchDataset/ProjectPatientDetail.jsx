import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import {
  Breadcrumb,
  Card,
  Button,
  Alert,
  message,
} from 'antd'
import { LoadingOutlined } from '@ant-design/icons'

import ProjectSchemaEhrTab from '../PatientDetail/tabs/SchemaEhrTab/ProjectSchemaEhrTab'
import { appThemeToken } from '../../styles/themeTokens'

// 导入数据 Hook
import useProjectPatientData from './hooks/useProjectPatientData'
import { deleteProjectCrfRecordInstance, updateProjectPatientCrfFields } from '@/api/project'
import { buildProjectCrfFieldUpdates } from './modules/projectPatientDetail/crfUpdateUtils'
import ProjectAiAssistantModal from './modules/projectPatientDetail/ProjectAiAssistantModal'
import { useProjectPatientSchema } from './modules/projectPatientDetail/useProjectPatientSchema'
import { useProjectSchemaData } from './modules/projectPatientDetail/useProjectSchemaData'

const ProjectPatientDetail = () => {
  const { projectId, patientId } = useParams()
  const navigate = useNavigate()

  // 使用 Hook 获取真实数据
  const {
    loading,
    projectLoading,
    projectError,
    patientError,
    patientInfo,
    projectInfo,
    crfData,
    documents,
    fieldGroups: projectTemplateGroups,
    refresh,
  } = useProjectPatientData(projectId, patientId)

  const projectName =
    projectInfo?.project_name ||
    projectInfo?.projectName ||
    projectInfo?.name ||
    '未知项目'
  const resolvedProjectPatientId = patientInfo?.id || patientInfo?.project_patient_id || null
  /**
   * 患者姓名脱敏展示：
   * 两字：王*；三字：王*宁；四字及以上：王**宁。
   * @param {string} name
   * @returns {string}
   */
  const maskPatientDisplayName = useCallback((name) => {
    const raw = String(name || '')
    if (!raw) return ''
    const chars = [...raw]
    const len = chars.length
    if (len <= 1) return raw
    if (len === 2) return `${chars[0]}*`
    if (len === 3) return `${chars[0]}*${chars[2]}`
    return `${chars[0]}${'*'.repeat(len - 2)}${chars[len - 1]}`
  }, [])

  const [schemaHistoryRefreshTick, setSchemaHistoryRefreshTick] = useState(0)

  useEffect(() => {
    const onProjectCrfRefresh = (ev) => {
      const d = ev.detail || {}
      if (d.projectId && projectId && String(d.projectId) !== String(projectId)) return
      if (
        d.projectPatientId &&
        resolvedProjectPatientId &&
        String(d.projectPatientId) !== String(resolvedProjectPatientId)
      ) {
        return
      }
      if (typeof refresh === 'function') refresh()
      setSchemaHistoryRefreshTick((t) => t + 1)
    }
    window.addEventListener('eacy:project-crf-refresh', onProjectCrfRefresh)
    return () => window.removeEventListener('eacy:project-crf-refresh', onProjectCrfRefresh)
  }, [projectId, resolvedProjectPatientId, refresh])

  const {
    effectiveProjectSchema,
    projectTemplateFieldGroups,
    projectSchemaLoading,
    projectSchemaError,
    reloadProjectSchema,
  } = useProjectPatientSchema(projectId, resolvedProjectPatientId, crfData)

  const schemaData = useProjectSchemaData({
    crfData,
    documents,
    effectiveProjectSchema,
    projectTemplateFieldGroups,
    projectTemplateGroups,
  })

  const normalizeValue = (value) => (value === undefined ? null : value)

  const isValueEqual = (a, b) => {
    const left = normalizeValue(a)
    const right = normalizeValue(b)
    if (left === right) return true
    if (typeof left !== typeof right) return false
    if (typeof left === 'object') {
      return JSON.stringify(left) === JSON.stringify(right)
    }
    return false
  }

  // 使用 ref 存储最新的 crfData 和 schemaData，避免 handleProjectSchemaSave 的依赖循环
  const crfDataRef = useRef(crfData)
  const schemaDataRef = useRef(schemaData)

  useEffect(() => {
    crfDataRef.current = crfData
  }, [crfData])

  useEffect(() => {
    schemaDataRef.current = schemaData
  }, [schemaData])

  /**
   * 保存科研项目 CRF 编辑结果。
   * 该页面仅允许通过 `updateProjectPatientCrfFields` 写入项目域数据，
   * 避免引入患者旧版 `/patients/{id}/ehr` 写路径形成旁路。
   * @param {Record<string, any>} draftData
   * @returns {Promise<void>}
   */
  const handleProjectSchemaSave = useCallback(async (draftData) => {
    console.log('[handleProjectSchemaSave] 🔥 函数被调用！', {
      hasProjectId: !!projectId,
      hasPatientId: !!resolvedProjectPatientId,
      draftDataKeys: draftData ? Object.keys(draftData) : []
    })

    if (!projectId || !resolvedProjectPatientId) {
      message.warning('保存失败：未找到患者信息')
      return
    }

    const currentCrfData = crfDataRef.current
    const currentSchemaData = schemaDataRef.current

    console.log('[handleProjectSchemaSave] 数据状态:', {
      hasCrfData: !!currentCrfData,
      hasSchemaData: !!currentSchemaData,
      crfDataKeys: currentCrfData ? Object.keys(currentCrfData) : [],
      crfDataGroupsKeys: currentCrfData?.groups ? Object.keys(currentCrfData.groups) : [],
      crfDataDataKeys: currentCrfData?.data ? Object.keys(currentCrfData.data) : [],
      crfDataStructure: {
        hasGroups: !!currentCrfData?.groups,
        hasData: !!currentCrfData?.data,
        hasTaskResults: !!currentCrfData?._task_results,
        groupsType: typeof currentCrfData?.groups,
        dataType: typeof currentCrfData?.data
      }
    })

    // 按实际 SchemaForm 草稿的叶子路径生成 delta。
    // 这样不会把可重复表单整列数组写到错误字段，也不会依赖模板 db_fields 与 UI 路径完全一致。
    const updates = buildProjectCrfFieldUpdates(draftData, currentSchemaData, isValueEqual)

    if (updates.length === 0) {
      message.info('没有需要保存的修改')
      return
    }

    try {
      const res = await updateProjectPatientCrfFields(projectId, resolvedProjectPatientId, {
        fields: updates,
      })

      if (res.success) {
        message.success(`保存成功：已更新 ${updates.length} 个字段`)
        if (typeof refresh === 'function') {
          await refresh()
        }
        setSchemaHistoryRefreshTick((tick) => tick + 1)
      } else {
        message.error(res.message || '保存失败')
      }
    } catch (e) {
      console.error('[handleProjectSchemaSave] 保存异常:', e)
      message.error(e?.message || '保存失败')
    }
  }, [projectId, resolvedProjectPatientId, refresh, isValueEqual])

  /**
   * 候选值固化后强制刷新科研患者详情，确保前后端状态一致。
   * @returns {Promise<void>}
   */
  const handleFieldCandidateSolidified = useCallback(async () => {
    if (typeof refresh === 'function') {
      await refresh()
    }
    setSchemaHistoryRefreshTick((tick) => tick + 1)
  }, [refresh])

  /**
   * 删除科研项目 CRF 可重复表单实例。
   * 只处理已有 record_instance_id 的记录；新建未保存的空行由 SchemaForm 本地移除即可。
   *
   * @param {string} formPath
   * @param {Array<Record<string, any>>} records
   * @returns {Promise<void>}
   */
  const handleDeleteRepeatableRecords = useCallback(async (formPath, records = []) => {
    if (!projectId || !resolvedProjectPatientId) {
      throw new Error('删除失败：未找到患者信息')
    }

    const recordIds = Array.from(new Set(
      (Array.isArray(records) ? records : [])
        .map((record) => (
          record?._record_instance_id ||
          record?.record_instance_id ||
          record?.recordInstanceId ||
          ''
        ))
        .map((id) => String(id || '').trim())
        .filter(Boolean)
    ))

    if (recordIds.length === 0) return

    for (const recordId of recordIds) {
      await deleteProjectCrfRecordInstance(projectId, resolvedProjectPatientId, recordId)
    }

    if (typeof refresh === 'function') {
      await refresh()
    }
    setSchemaHistoryRefreshTick((tick) => tick + 1)
  }, [projectId, refresh, resolvedProjectPatientId])

  // 是否仍在初次加载患者基础信息（仅作内联指示，不再阻塞整页）
  const initialPatientLoading = (loading || projectLoading) && !patientInfo?.patientId

  return (
    <div className="page-container fade-in">
      {/* 患者项目统计 */}
      <Card
        size="small"
        style={{ marginBottom: 16 }}
        styles={{ body: { padding: 0 } }}
        title={
          <Breadcrumb
            items={[
              {
                title: (
                  <Button
                    type="link"
                    size="small"
                    style={{ padding: 0, height: 'auto' }}
                    onClick={() => navigate(`/research/projects/${projectId}`)}
                  >
                    {projectName}
                  </Button>
                )
              },
              {
                title: initialPatientLoading
                  ? (
                    <span>
                      <LoadingOutlined spin style={{ marginRight: 6 }} />
                      正在加载患者数据…
                    </span>
                  )
                  : `${maskPatientDisplayName(patientInfo.name)} (${patientInfo.subjectId || patientInfo.patientCode || patientInfo.patientId || '-'})`
              }
            ]}
          />
        }
      >
        {(projectError || patientError) && (
          <div style={{ padding: 12 }}>
            <Alert
              type="error"
              showIcon
              message="项目/患者数据加载失败"
              description={
                <div>
                  {projectError && (
                    <div>项目详情失败：{projectError}</div>
                  )}
                  {patientError && (
                    <div>患者详情失败：{patientError}</div>
                  )}
                  <div style={{ marginTop: 8, opacity: 0.8 }}>
                    Debug: projectId={projectId}，patientId={patientId}
                  </div>
                </div>
              }
            />
          </div>
        )}
        <div style={{ borderTop: `1px solid ${appThemeToken.colorBorder}` }}>
          <ProjectSchemaEhrTab
            projectId={projectId}
            projectName={projectName}
            schemaData={effectiveProjectSchema}
            schemaLoading={projectSchemaLoading}
            schemaError={projectSchemaError}
            onReloadSchema={reloadProjectSchema}
            patientData={schemaData}
            patientId={resolvedProjectPatientId}
            sourcePatientId={patientInfo.patientId}
            projectDocuments={documents}
            onSave={handleProjectSchemaSave}
            onFieldCandidateSolidified={handleFieldCandidateSolidified}
            onDeleteRepeatableRecords={handleDeleteRepeatableRecords}
            externalHistoryRefreshKey={schemaHistoryRefreshTick}
          />
        </div>
      </Card>

      <ProjectAiAssistantModal
        patientName={patientInfo?.name}
        projectName={projectName}
      />
    </div>
  )
}

export default ProjectPatientDetail
