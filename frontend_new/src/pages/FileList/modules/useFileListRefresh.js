import { useCallback } from 'react'

export const useFileListRefresh = ({
  groupDocs,
  remoteData,
  treeRefreshPromiseRef,
  viewMode,
}) => useCallback(
  async (options = {}) => {
    const { forceTree = false } = options
    if (forceTree) {
      try {
        const treeRefreshPromise = remoteData.fetchTree({ force: true })
        treeRefreshPromiseRef.current = treeRefreshPromise
        await treeRefreshPromise
        await remoteData.fetchFileList()
        groupDocs.setGroupDocsMap({})
      } finally {
        treeRefreshPromiseRef.current = null
      }
      return
    }
    remoteData.fetchFileList()
    if (remoteData.hasLoadedTreeRef.current || viewMode === 'patient') {
      remoteData.fetchTree({ force: false })
      groupDocs.setGroupDocsMap({})
    }
  },
  [groupDocs, remoteData, treeRefreshPromiseRef, viewMode],
)
