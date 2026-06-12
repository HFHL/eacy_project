const STORAGE_KEY_PREFIX = 'upload_manager_state'

export const getStorageKey = (userId) => `${STORAGE_KEY_PREFIX}_${userId ?? 'anonymous'}`

export const UploadStatus = {
  PENDING: 'pending',
  UPLOADING: 'uploading',
  SUCCESS: 'success',
  FAILED: 'failed',
  CANCELLED: 'cancelled',
}

export const generateFileFingerprint = (file) => (
  `${file.name}_${file.size}_${file.lastModified}`
)

export const generateTaskId = () => (
  `task_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`
)

export const createUploadTask = (file) => ({
  id: generateTaskId(),
  fileName: file.name,
  fileSize: file.size,
  fileType: file.type,
  fingerprint: generateFileFingerprint(file),
  status: UploadStatus.PENDING,
  progress: 0,
  error: null,
  retryCount: 0,
  createdAt: Date.now(),
  completedAt: null,
  needsFile: false,
})

export const serializeUploadState = (tasks) => ({
  tasks: tasks.map(({ file, ...rest }) => rest),
  savedAt: Date.now(),
})

export const restoreUploadTasks = (savedState) => {
  if (!savedState) return []
  const { tasks: savedTasks = [] } = JSON.parse(savedState)
  return savedTasks
    .filter((task) => task.status !== UploadStatus.SUCCESS)
    .map((task) => ({
      ...task,
      status: task.status === UploadStatus.UPLOADING ? UploadStatus.PENDING : task.status,
      progress: 0,
      needsFile: true,
    }))
}

export const getUploadStats = (tasks) => ({
  total: tasks.length,
  pending: tasks.filter((task) => task.status === UploadStatus.PENDING).length,
  uploading: tasks.filter((task) => task.status === UploadStatus.UPLOADING).length,
  success: tasks.filter((task) => task.status === UploadStatus.SUCCESS).length,
  failed: tasks.filter((task) => task.status === UploadStatus.FAILED).length,
  cancelled: tasks.filter((task) => task.status === UploadStatus.CANCELLED).length,
  needsFile: tasks.filter((task) => task.needsFile).length,
})
