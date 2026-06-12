import { useCallback, useEffect, useRef, useState } from 'react'
import { Modal, message } from 'antd'
import { batchDeletePatients, getEhrExtractionStatusBatch, getPatientList } from '../../../api/patient'

export const usePatientRailController = ({
  activePatientId,
  activePrimaryNavKey,
  navigate,
  token,
}) => {
  const [patientRailSearch, setPatientRailSearch] = useState('')
  const [patientRailSort, setPatientRailSort] = useState('updated_desc')
  const [patientRailLoading, setPatientRailLoading] = useState(false)
  const [patientRailItems, setPatientRailItems] = useState([])
  const [deletingPatientId, setDeletingPatientId] = useState('')
  const [ehrExtractingMap, setEhrExtractingMap] = useState({})
  const ehrPollTimerRef = useRef(null)

  const triggerPatientDetailRefresh = useCallback((patientId) => {
    if (typeof window === 'undefined' || !patientId) return
    window.dispatchEvent(new CustomEvent('patient-detail-refresh', { detail: { patientId: String(patientId) } }))
  }, [])

  const refreshPatientRail = useCallback(async () => {
    setPatientRailLoading(true)
    try {
      const params = { page: 1, page_size: 24 }
      if (patientRailSearch.trim()) params.search = patientRailSearch.trim()
      const response = await getPatientList(params)
      if (!response?.success) {
        setPatientRailItems([])
        return
      }
      const rawItems = Array.isArray(response?.data?.items) ? response.data.items : (Array.isArray(response?.data) ? response.data : [])
      const mapped = rawItems
        .map((item) => ({
          id: item.id,
          name: item.name || '未命名患者',
          gender: item.gender || '',
          age: item.age,
          diagnosis: Array.isArray(item.diagnosis) ? item.diagnosis.filter(Boolean).slice(0, 1).join('；') : (item.diagnosis || ''),
          documentCount: Number(item.document_count || 0),
          projectsCount: Array.isArray(item.projects) ? item.projects.length : 0,
          updatedAt: item.updated_at || '',
        }))
        .sort((left, right) => {
          if (patientRailSort === 'name_asc') {
            return left.name.localeCompare(right.name, 'zh-Hans-CN')
          }
          return new Date(right.updatedAt || 0).getTime() - new Date(left.updatedAt || 0).getTime()
        })
      setPatientRailItems(mapped)
    } catch {
      setPatientRailItems([])
    } finally {
      setPatientRailLoading(false)
    }
  }, [patientRailSearch, patientRailSort])

  const handleDeletePatientFromRail = useCallback((patient) => {
    if (!patient?.id) return

    Modal.confirm({
      title: '确认删除患者',
      content: (
        <div>
          <p>确定删除患者「{patient.name || '未命名患者'}」吗？此操作不可恢复。</p>
          <p style={{ color: token.colorWarning, marginBottom: 0 }}>关联文档会一并删除，关联科研项目会自动退组。</p>
        </div>
      ),
      okText: '确认删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        setDeletingPatientId(String(patient.id))
        try {
          const response = await batchDeletePatients({ patient_ids: [patient.id] })
          if (!response?.success) {
            message.error(response?.message || '删除失败，请稍后重试')
            return
          }
          const successCount = Number(response?.data?.success_count || 0)
          if (successCount > 0) {
            message.success('患者删除成功')
          } else {
            message.warning(response?.message || '删除未生效，请刷新后重试')
          }
          await refreshPatientRail()
          if (String(activePatientId) === String(patient.id)) {
            navigate('/patient/pool')
          }
        } catch (error) {
          console.error('删除患者失败:', error)
          message.error(error?.message || '删除患者失败')
          throw error
        } finally {
          setDeletingPatientId('')
        }
      },
    })
  }, [activePatientId, navigate, refreshPatientRail, token.colorWarning])

  useEffect(() => {
    if (activePrimaryNavKey !== 'patient') return undefined
    refreshPatientRail()
    return undefined
  }, [activePrimaryNavKey, refreshPatientRail])

  useEffect(() => {
    if (activePrimaryNavKey !== 'patient') return undefined
    if (!patientRailItems.length) {
      setEhrExtractingMap({})
      return undefined
    }
    let cancelled = false
    const ids = patientRailItems.map((it) => String(it.id)).filter(Boolean)

    const tick = async () => {
      if (cancelled) return
      try {
        const resp = await getEhrExtractionStatusBatch(ids)
        if (cancelled) return
        const items = resp?.data?.items || []
        const next = {}
        for (const it of items) {
          if (it.active) next[String(it.patient_id)] = true
        }
        setEhrExtractingMap((prev) => {
          const wasActiveIds = Object.keys(prev)
          const justFinished = wasActiveIds.filter((pid) => !next[pid])
          if (justFinished.length > 0) {
            refreshPatientRail()
          }
          return next
        })
      } catch (err) {
        if (!cancelled) console.warn('EHR 抽取状态查询失败:', err?.message)
      }
    }

    tick()
    ehrPollTimerRef.current = setInterval(tick, 5000)

    return () => {
      cancelled = true
      if (ehrPollTimerRef.current) {
        clearInterval(ehrPollTimerRef.current)
        ehrPollTimerRef.current = null
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activePrimaryNavKey, patientRailItems.map((it) => it.id).join(',')])

  useEffect(() => {
    if (typeof window === 'undefined') return undefined
    const handlePatientRailRefresh = () => {
      if (activePrimaryNavKey !== 'patient') return
      refreshPatientRail()
    }
    window.addEventListener('patient-rail-refresh', handlePatientRailRefresh)
    return () => {
      window.removeEventListener('patient-rail-refresh', handlePatientRailRefresh)
    }
  }, [activePrimaryNavKey, refreshPatientRail])

  return {
    deletingPatientId,
    ehrExtractingMap,
    handleDeletePatientFromRail,
    patientRailItems,
    patientRailLoading,
    patientRailSearch,
    patientRailSort,
    refreshPatientRail,
    setPatientRailSearch,
    setPatientRailSort,
    triggerPatientDetailRefresh,
  }
}
