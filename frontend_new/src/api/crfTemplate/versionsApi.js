import { emptyList, emptySuccess } from '../_empty'
import request from '../request'
import {
  normalizeTemplate,
  normalizeVersion,
} from './normalizers'

export const listCrfTemplateVersions = async (templateId = '') => {
  if (!templateId) return emptyList()
  const template = normalizeTemplate(await request.get(`/schema-templates/${templateId}`))
  return emptySuccess(template.versions || [])
}

export const getCrfTemplateVersion = async (templateId = '', versionId = '') => {
  if (!templateId || !versionId) return emptySuccess(null)
  const versions = (await listCrfTemplateVersions(templateId)).data || []
  return emptySuccess(versions.find((item) => String(item.id) === String(versionId)) || null)
}

export const activateCrfTemplateVersion = async (_templateId = '', versionId = '') => {
  if (!versionId) return emptySuccess(null)
  const version = await request.post(`/schema-template-versions/${versionId}/publish`)
  return emptySuccess(normalizeVersion(version))
}

export const convertTemplate = async () => emptySuccess(null)
