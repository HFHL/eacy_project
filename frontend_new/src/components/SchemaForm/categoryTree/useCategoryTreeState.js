import { useCallback, useEffect, useMemo, useState } from 'react'
import { buildTreeData, getFirstFormPath } from './categoryTreeUtils'

export function useCategoryTreeState({
  actions,
  draftData,
  onBeforeSelect,
  onSelect,
  schema,
  selectedPath,
}) {
  const treeData = useMemo(() => {
    if (!schema) return []
    return buildTreeData(schema, draftData)
  }, [draftData, schema])

  const treeNodeKeys = useMemo(() => {
    const keys = new Set()
    treeData.forEach((folder) => {
      keys.add(folder.key)
      folder.children?.forEach((child) => keys.add(child.key))
    })
    return keys
  }, [treeData])

  const selectedTreeKey = useMemo(() => {
    if (!selectedPath) return null
    if (treeNodeKeys.has(selectedPath)) return selectedPath
    const normalizedPath = selectedPath.replace(/\.\d+(?=\.|$)/g, '')
    if (treeNodeKeys.has(normalizedPath)) return normalizedPath
    return null
  }, [selectedPath, treeNodeKeys])

  useEffect(() => {
    if (!treeData.length) return undefined
    if (selectedPath && selectedTreeKey) return undefined

    const selectFirstPath = () => {
      const firstPath = getFirstFormPath(treeData)
      if (!firstPath) return
      actions.setSelectedPath(firstPath)
      onSelect?.(firstPath, { key: firstPath, path: firstPath, isAutoSelected: true })
    }

    if (!selectedPath) {
      selectFirstPath()
      return undefined
    }

    const fallbackTimer = setTimeout(selectFirstPath, 200)
    return () => clearTimeout(fallbackTimer)
  }, [actions, onSelect, selectedPath, selectedTreeKey, treeData])

  const allExpandableKeys = useMemo(() => treeData.map((node) => node.key), [treeData])
  const [expandedKeys, setExpandedKeys] = useState(allExpandableKeys)
  const isAllExpanded = expandedKeys.length === allExpandableKeys.length && allExpandableKeys.length > 0

  const handleToggleExpandAll = useCallback(() => {
    setExpandedKeys(isAllExpanded ? [] : allExpandableKeys)
  }, [allExpandableKeys, isAllExpanded])

  const handleExpand = useCallback((keys) => {
    setExpandedKeys(keys)
  }, [])

  const trySetSelectedPath = useCallback(async (path, node) => {
    if (!path || typeof path !== 'string') return
    if (path === selectedPath) return

    if (onBeforeSelect) {
      const allow = await onBeforeSelect(path)
      if (!allow) return
    }
    actions.setSelectedPath(path)
    onSelect?.(path, node || { key: path })
  }, [actions, onBeforeSelect, onSelect, selectedPath])

  return {
    expandedKeys,
    handleExpand,
    handleToggleExpandAll,
    isAllExpanded,
    setExpandedKeys,
    selectedTreeKey,
    treeData,
    trySetSelectedPath,
  }
}
