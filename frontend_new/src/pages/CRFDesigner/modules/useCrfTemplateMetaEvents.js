import { useEffect } from 'react'

import { RESEARCH_OPEN_TEMPLATE_META_KEY } from '../../../constants/researchStorageKeys'
import { templateView } from '../../../utils/researchPaths'

export const useCrfTemplateMetaEvents = ({
  navigate,
  setTemplateInfoVisible,
  templateId,
}) => {
  useEffect(() => {
    if (typeof window === 'undefined') return undefined

    const handleOpenTemplateMeta = (event) => {
      const targetId = String(event?.detail?.templateId || '')
      if (!targetId) return

      if (String(templateId || '') === targetId) {
        setTemplateInfoVisible(true)
        return
      }

      window.sessionStorage.setItem(RESEARCH_OPEN_TEMPLATE_META_KEY, targetId)
      navigate(templateView(targetId))
    }

    window.addEventListener('research-template-meta-open', handleOpenTemplateMeta)
    return () => {
      window.removeEventListener('research-template-meta-open', handleOpenTemplateMeta)
    }
  }, [navigate, setTemplateInfoVisible, templateId])

  useEffect(() => {
    if (typeof window === 'undefined' || !templateId) return

    const pendingTemplateId = window.sessionStorage.getItem(RESEARCH_OPEN_TEMPLATE_META_KEY)
    if (!pendingTemplateId) return
    if (String(pendingTemplateId) !== String(templateId)) return

    window.sessionStorage.removeItem(RESEARCH_OPEN_TEMPLATE_META_KEY)
    setTemplateInfoVisible(true)
  }, [setTemplateInfoVisible, templateId])
}
