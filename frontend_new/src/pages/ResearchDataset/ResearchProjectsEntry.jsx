import React, { useEffect, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Button, Card, Empty, Spin, Typography } from 'antd'
import { ExperimentOutlined, FileTextOutlined, PlusOutlined } from '@ant-design/icons'
import { getProjects } from '../../api/project'
import { getCRFTemplates } from '../../api/crfTemplate'
import { pickMostRecentlyUpdatedItem } from '../../utils/researchProjectSelection'
import {
  researchProjectDetail,
  templateCreate,
  templateView,
} from '../../utils/researchPaths'
import {
  dispatchRequestProjectCreate,
  dispatchRequestTemplateCreate,
} from '../../utils/createIntentEvents'

const { Text } = Typography

const RESEARCH_RETURN_FROM_TEMPLATE_KEY = 'research:return-from-template-once'

/**
 * 科研域入口：不渲染旧版列表/Tabs，仅负责跳转最近项目或展示空状态。
 * 项目与 CRF 模板列表由 MainLayout 左侧栏承担。
 */
const ResearchProjectsEntry = () => {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [view, setView] = useState('loading')

  useEffect(() => {
    let cancelled = false

    const stripQueryKeys = (keys = []) => {
      const next = new URLSearchParams(searchParams)
      keys.forEach((key) => next.delete(key))
      const search = next.toString()
      setSearchParams(search ? next : {}, { replace: true })
    }

    const goFirstTemplate = async () => {
      try {
        const response = await getCRFTemplates()
        const items = Array.isArray(response?.data)
          ? response.data
          : (Array.isArray(response?.data?.items) ? response.data.items : [])
        const first = pickMostRecentlyUpdatedItem(items, [
          (item) => item.updated_at || item.updatedAt,
          (item) => item.created_at || item.createdAt,
        ])
        const firstId = first?.id || first?.template_id
        if (firstId) {
          navigate(templateView(firstId), { replace: true })
          return true
        }
        dispatchRequestTemplateCreate()
        if (!cancelled) setView('empty-template')
        return true
      } catch {
        if (!cancelled) setView('empty-template')
        return true
      }
    }

    const run = async () => {
      const openCreate = searchParams.get('openCreate') === '1'
      const tab = searchParams.get('tab')
      const emptyState = searchParams.get('emptyState')

      if (openCreate) {
        if (tab === 'templates') {
          stripQueryKeys(['openCreate', 'tab'])
          dispatchRequestTemplateCreate()
          if (!cancelled) setView('idle')
          return
        }
        stripQueryKeys(['openCreate', 'tab'])
        dispatchRequestProjectCreate()
        if (!cancelled) setView('idle')
        return
      }

      if (typeof window !== 'undefined' && window.sessionStorage.getItem(RESEARCH_RETURN_FROM_TEMPLATE_KEY) === '1') {
        window.sessionStorage.removeItem(RESEARCH_RETURN_FROM_TEMPLATE_KEY)
        stripQueryKeys(['tab'])
        if (!cancelled) setView('idle')
        return
      }

      if (tab === 'templates') {
        stripQueryKeys(['tab'])
        const handled = await goFirstTemplate()
        if (handled || cancelled) return
      }

      if (emptyState === 'project') {
        if (!cancelled) setView('empty-project')
        return
      }
      if (emptyState === 'template') {
        if (!cancelled) setView('empty-template')
        return
      }

      try {
        const response = await getProjects({ page: 1, page_size: 100 })
        if (cancelled) return
        const items = Array.isArray(response?.data)
          ? response.data
          : (Array.isArray(response?.data?.items) ? response.data.items : [])
        const latest = pickMostRecentlyUpdatedItem(items, [
          (item) => item.updated_at,
          (item) => item.created_at,
        ])
        if (latest?.id) {
          navigate(researchProjectDetail(latest.id), { replace: true })
          return
        }
        stripQueryKeys(['tab'])
        const next = new URLSearchParams(searchParams)
        next.set('emptyState', 'project')
        setSearchParams(next, { replace: true })
        if (!cancelled) setView('empty-project')
      } catch {
        if (!cancelled) setView('empty-project')
      }
    }

    run()
    return () => {
      cancelled = true
    }
    // 仅在进入本入口页时引导一次，避免 setSearchParams 后重复自动跳转
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigate])

  if (view === 'loading') {
    return (
      <div className="page-container" style={{ display: 'flex', justifyContent: 'center', padding: 48 }}>
        <Spin size="large" />
      </div>
    )
  }

  if (view === 'empty-project') {
    return (
      <div className="page-container fade-in">
        <Card
          styles={{
            body: {
              minHeight: 420,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            },
          }}
        >
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={(
              <Text strong style={{ fontSize: 16 }}>
                暂无科研项目
              </Text>
            )}
          >
            <Button type="primary" icon={<PlusOutlined />} onClick={dispatchRequestProjectCreate}>
              新建项目
            </Button>
          </Empty>
        </Card>
      </div>
    )
  }

  if (view === 'empty-template') {
    return (
      <div className="page-container fade-in">
        <Card
          styles={{
            body: {
              minHeight: 420,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            },
          }}
        >
          <Empty
            image={Empty.PRESENTED_IMAGE_SIMPLE}
            description={(
              <Text strong style={{ fontSize: 16 }}>
                暂无 CRF 模板
              </Text>
            )}
          >
            <Button type="primary" icon={<PlusOutlined />} onClick={() => navigate(templateCreate())}>
              新建模板
            </Button>
          </Empty>
        </Card>
      </div>
    )
  }

  return (
    <div className="page-container fade-in">
      <Card
        styles={{
          body: {
            minHeight: 420,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          },
        }}
      >
        <Empty
          image={Empty.PRESENTED_IMAGE_SIMPLE}
          description={(
            <span style={{ textAlign: 'center' }}>
              <div style={{ marginBottom: 8 }}>
                <Text strong style={{ fontSize: 16 }}>科研数据集</Text>
              </div>
              <Text type="secondary">请从左侧选择科研项目或 CRF 模板</Text>
            </span>
          )}
        >
          <Button icon={<ExperimentOutlined />} onClick={dispatchRequestProjectCreate} style={{ marginRight: 8 }}>
            新建项目
          </Button>
          <Button type="primary" icon={<FileTextOutlined />} onClick={dispatchRequestTemplateCreate}>
            新建模板
          </Button>
        </Empty>
      </Card>
    </div>
  )
}

export default ResearchProjectsEntry
