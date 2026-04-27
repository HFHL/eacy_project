import { emptyList, emptySuccess, emptyTask } from './_empty'

export const getAdminUsers = async () => emptyList()
export const getAdminProjects = async () => emptyList()
export const getAdminTemplates = async () => emptyList()
export const getAdminDocuments = async () => emptyList()
export const getAdminStats = async () => emptySuccess({})
export const getAdminActiveTasks = async () => emptyList()
export const getProjectExtractionTasks = async () => emptyList()
export const getAdminExtractionTasks = async () => emptyList()
export const getAdminExtractionTaskDetail = async () => emptyTask()
export const resubmitAdminExtractionTask = async () => emptyTask()
