import { Modal } from 'antd'
import { getCrfTemplateProjectUsage } from '../api/crfTemplate'

const MAX_PROJECT_LINES = 8

/**
 * 删除确认文案（含占用项目提示）。
 *
 * @param {string} templateName
 * @param {Array<{ project_name?: string, name?: string }>} projects
 * @returns {string}
 */
export const buildDeleteCrfTemplateConfirmMessage = (templateName, projects = []) => {
  const base = `确定删除模板「${templateName || '未命名模板'}」吗？删除后将从模板列表中移除。`
  if (!projects.length) return base

  const lines = projects
    .slice(0, MAX_PROJECT_LINES)
    .map((item) => `· ${item.project_name || item.name || '未命名项目'}`)
  if (projects.length > MAX_PROJECT_LINES) {
    lines.push(`· 另有 ${projects.length - MAX_PROJECT_LINES} 个项目…`)
  }

  return [
    base,
    '',
    `以下 ${projects.length} 个科研项目正在使用该模板，删除后将自动解除关联，项目内需重新选择 CRF 模板：`,
    ...lines,
  ].join('\n')
}

/**
 * 查询模板占用项目。
 *
 * @param {string} templateId
 * @returns {Promise<{ projects: Array, total: number }>}
 */
export const fetchCrfTemplateProjectUsage = async (templateId) => {
  if (!templateId) {
    return { projects: [], total: 0 }
  }
  try {
    const response = await getCrfTemplateProjectUsage(templateId)
    const projects = Array.isArray(response?.data?.items) ? response.data.items : []
    const total = Number(response?.data?.total ?? projects.length)
    return { projects, total }
  } catch {
    return { projects: [], total: 0 }
  }
}

/**
 * 弹出删除确认框；用户确认后执行 onConfirm。
 *
 * @param {{
 *   templateId: string,
 *   templateName: string,
 *   onConfirm: () => Promise<void>,
 * }} options
 * @returns {Promise<boolean>} 是否已执行删除
 */
export const confirmDeleteCrfTemplate = async ({ templateId, templateName, onConfirm }) => {
  const { projects, total } = await fetchCrfTemplateProjectUsage(templateId)

  return new Promise((resolve) => {
    Modal.confirm({
      title: '确认删除模板',
      content: buildDeleteCrfTemplateConfirmMessage(templateName, projects),
      okText: '确认删除',
      cancelText: '取消',
      okButtonProps: { danger: true },
      onOk: async () => {
        await onConfirm({ affectedProjectCount: total, affectedProjects: projects })
        if (total > 0 && typeof window !== 'undefined') {
          window.dispatchEvent(new CustomEvent('research-project-rail-refresh'))
        }
        resolve(true)
      },
      onCancel: () => resolve(false),
    })
  })
}
