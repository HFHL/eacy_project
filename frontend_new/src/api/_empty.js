export const emptySuccess = (data = null, extra = {}) => ({
  success: true,
  code: 0,
  message: 'ok',
  data,
  ...extra,
})

export const emptyList = (extra = {}) => emptySuccess([], {
  total: 0,
  page: 1,
  page_size: 20,
  ...extra,
})

export const emptyPaged = (extra = {}) => emptySuccess({
  list: [],
  items: [],
  total: 0,
  page: 1,
  page_size: 20,
  ...extra,
})

export const emptyTask = (extra = {}) => emptySuccess({
  status: 'idle',
  progress: 0,
  events: [],
  ...extra,
})

export const emptyFileUrl = () => emptySuccess({
  url: '',
  temp_url: '',
  preview_url: '',
})
