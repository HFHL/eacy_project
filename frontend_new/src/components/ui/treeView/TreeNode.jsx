import React from 'react'
import { ChevronRight, File, Folder, FolderOpen } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'

import { cn } from '@/lib/utils'

const getDefaultIcon = ({ hasChildren, isExpanded }) => {
  if (!hasChildren) return <File size={16} />
  return isExpanded ? <FolderOpen size={16} /> : <Folder size={16} />
}

export function TreeNode({
  animateExpand,
  currentSelectedIds,
  dragOverNodeId,
  draggable,
  expandedIdSet,
  handleDragEnd,
  handleDragOver,
  handleDragStart,
  handleDropOnNode,
  handleSelection,
  indent,
  isLast = false,
  level = 0,
  node,
  onNodeClick,
  parentPath = [],
  setDragOverNodeId,
  showIcons,
  showLines,
  toggleExpanded,
}) {
  const hasChildren = (node.children?.length ?? 0) > 0
  const isExpanded = expandedIdSet.has(node.id)
  const isSelected = currentSelectedIds.includes(node.id)
  const currentPath = [...parentPath, isLast]

  return (
    <div key={node.id} className="eacy-tree-view__node">
      <motion.div
        className={cn(
          'eacy-tree-view__row',
          isSelected && 'eacy-tree-view__row--selected',
          dragOverNodeId === node.id && 'eacy-tree-view__row--drag-over',
        )}
        style={{ paddingLeft: level * indent + 8 }}
        draggable={draggable}
        onDragStart={(event) => handleDragStart(node, event)}
        onDragOver={(event) => handleDragOver(node, event)}
        onDrop={(event) => handleDropOnNode(node, event)}
        onDragEnd={handleDragEnd}
        onDragLeave={() => {
          if (dragOverNodeId === node.id) setDragOverNodeId(null)
        }}
        onClick={(event) => {
          if (hasChildren) toggleExpanded(node.id)
          handleSelection(node.id, event.ctrlKey || event.metaKey)
          onNodeClick?.(node)
        }}
        whileTap={{ scale: 0.99, transition: { duration: 0.1 } }}
      >
        {showLines && level > 0 && (
          <div className="eacy-tree-view__lines" style={{ pointerEvents: 'none' }}>
            {currentPath.map((isLastInPath, pathIndex) => (
              <div
                key={pathIndex}
                className="eacy-tree-view__line-v"
                style={{
                  left: pathIndex * indent + 12,
                  display:
                    pathIndex === currentPath.length - 1 && isLastInPath
                      ? 'none'
                      : 'block',
                }}
              />
            ))}
            <div
              className="eacy-tree-view__line-h"
              style={{
                left: (level - 1) * indent + 12,
                width: indent - 4,
              }}
            />
            {isLast && (
              <div
                className="eacy-tree-view__line-cap"
                style={{ left: (level - 1) * indent + 12 }}
              />
            )}
          </div>
        )}

        <motion.div
          className="eacy-tree-view__chevron"
          animate={{ rotate: hasChildren && isExpanded ? 90 : 0 }}
          transition={{ duration: 0.2, ease: 'easeInOut' }}
        >
          {hasChildren ? <ChevronRight size={12} /> : null}
        </motion.div>

        {showIcons && (
          <div className="eacy-tree-view__icon">
            {node.icon || getDefaultIcon({ hasChildren, isExpanded })}
          </div>
        )}

        <div className="eacy-tree-view__label">{node.label}</div>
      </motion.div>

      <AnimatePresence initial={false}>
        {hasChildren && isExpanded && (
          <motion.div
            key={`${node.id}-children`}
            initial={animateExpand ? { height: 0, opacity: 0 } : false}
            animate={{ height: 'auto', opacity: 1 }}
            exit={animateExpand ? { height: 0, opacity: 0 } : undefined}
            transition={{
              duration: animateExpand ? 0.25 : 0,
              ease: 'easeInOut',
            }}
            className="eacy-tree-view__children"
          >
            {node.children.map((child, index) => (
              <TreeNode
                key={child.id}
                animateExpand={animateExpand}
                currentSelectedIds={currentSelectedIds}
                dragOverNodeId={dragOverNodeId}
                draggable={draggable}
                expandedIdSet={expandedIdSet}
                handleDragEnd={handleDragEnd}
                handleDragOver={handleDragOver}
                handleDragStart={handleDragStart}
                handleDropOnNode={handleDropOnNode}
                handleSelection={handleSelection}
                indent={indent}
                isLast={index === node.children.length - 1}
                level={level + 1}
                node={child}
                onNodeClick={onNodeClick}
                parentPath={currentPath}
                setDragOverNodeId={setDragOverNodeId}
                showIcons={showIcons}
                showLines={showLines}
                toggleExpanded={toggleExpanded}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}
