import { useCallback, useState } from 'react'

const resolveDrawerKernelFlag = () => {
  if (typeof window === 'undefined') return true

  const queryValue = new URLSearchParams(window.location.search).get('drawerKernel')
  if (queryValue === '1' || queryValue === 'true') return true
  if (queryValue === '0' || queryValue === 'false') return false

  const storageValue = window.localStorage?.getItem('projectDatasetV2DrawerKernel')
  if (storageValue === 'true') return true
  if (storageValue === 'false') return false
  return true
}

export const useNestedDetailDrawerState = () => {
  const [useSchemaKernelDrawer] = useState(resolveDrawerKernelFlag)
  const [nestedDetailOpen, setNestedDetailOpen] = useState(false)
  const [nestedDetailTitle, setNestedDetailTitle] = useState('')
  const [nestedDetailPayload, setNestedDetailPayload] = useState(null)

  const openNestedDetail = useCallback((payload) => {
    const safePayload = payload || {}
    setNestedDetailTitle(safePayload.title || '')
    setNestedDetailPayload({
      node: safePayload.node || null,
      schemaNode: safePayload.schemaNode || null,
      rawValue: safePayload.rawValue,
    })
    setNestedDetailOpen(true)
  }, [])

  const closeNestedDetail = useCallback(() => {
    setNestedDetailOpen(false)
    setNestedDetailPayload(null)
  }, [])

  return {
    nestedDetailOpen,
    nestedDetailTitle,
    nestedDetailPayload,
    useSchemaKernelDrawer,
    openNestedDetail,
    closeNestedDetail,
  }
}
