import { useEffect } from 'react'

export function useSynchronizedTableScroll({ activeGroupKey, leftPanelRef, rightPanelRef, visiblePatientsLength }) {
  useEffect(() => {
    const leftBody = leftPanelRef.current?.querySelector('.ant-table-body')
    const rightBody = rightPanelRef.current?.querySelector('.ant-table-body')
    if (!leftBody || !rightBody) return undefined

    let syncing = false
    const syncFromLeft = () => {
      if (syncing) return
      syncing = true
      rightBody.scrollTop = leftBody.scrollTop
      requestAnimationFrame(() => { syncing = false })
    }
    const syncFromRight = () => {
      if (syncing) return
      syncing = true
      leftBody.scrollTop = rightBody.scrollTop
      requestAnimationFrame(() => { syncing = false })
    }

    leftBody.addEventListener('scroll', syncFromLeft)
    rightBody.addEventListener('scroll', syncFromRight)
    return () => {
      leftBody.removeEventListener('scroll', syncFromLeft)
      rightBody.removeEventListener('scroll', syncFromRight)
    }
  }, [activeGroupKey, leftPanelRef, rightPanelRef, visiblePatientsLength])
}
