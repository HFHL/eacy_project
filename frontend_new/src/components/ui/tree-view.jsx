import React, { useState, useCallback, useEffect } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import { TreeNode } from './treeView/TreeNode';
import './tree-view.css';

/**
 * @typedef {Object} TreeNode
 * @property {string} id
 * @property {import('react').ReactNode} label
 * @property {import('react').ReactNode} [icon]
 * @property {TreeNode[]} [children]
 * @property {any} [data]
 */

/**
 * @typedef {Object} TreeDropInfo
 * @property {TreeNode} dragNode
 * @property {TreeNode} dropNode
 * @property {number} dropPosition
 * @property {boolean} dropToGap
 */

/**
 * @param {Object} props
 * @param {TreeNode[]} props.data
 * @param {string} [props.className]
 * @param {(node: TreeNode) => void} [props.onNodeClick]
 * @param {(nodeId: string, expanded: boolean) => void} [props.onNodeExpand]
 * @param {string[]} [props.defaultExpandedIds]
 * @param {string[]} [props.expandedIds]
 * @param {(ids: string[]) => void} [props.onExpandedChange]
 * @param {boolean} [props.showLines]
 * @param {boolean} [props.showIcons]
 * @param {boolean} [props.selectable]
 * @param {boolean} [props.multiSelect]
 * @param {string[]} [props.selectedIds]
 * @param {(selectedIds: string[]) => void} [props.onSelectionChange]
 * @param {number} [props.indent]
 * @param {boolean} [props.animateExpand]
 * @param {boolean} [props.bordered]
 * @param {boolean} [props.draggable]
 * @param {(info: TreeDropInfo) => void} [props.onDrop]
 * @param {(args: { dragNode: TreeNode, dropNode: TreeNode, dropPosition: number }) => boolean} [props.allowDrop]
 */
export function TreeView({
  data,
  className,
  onNodeClick,
  onNodeExpand,
  defaultExpandedIds = [],
  expandedIds: controlledExpandedIds,
  onExpandedChange,
  showLines = true,
  showIcons = true,
  selectable = true,
  multiSelect = false,
  selectedIds = [],
  onSelectionChange,
  indent = 20,
  animateExpand = true,
  bordered = true,
  draggable = false,
  onDrop,
  allowDrop,
}) {
  const [internalExpandedIds, setInternalExpandedIds] = useState(
    () => new Set(defaultExpandedIds),
  );
  const [internalSelectedIds, setInternalSelectedIds] = useState(selectedIds);
  const [dragOverNodeId, setDragOverNodeId] = useState(null);
  const dragNodeRef = React.useRef(null);

  const isExpandControlled =
    controlledExpandedIds !== undefined && onExpandedChange !== undefined;
  const expandedIdSet = isExpandControlled
    ? new Set(controlledExpandedIds)
    : internalExpandedIds;

  const isSelectionControlled =
    selectedIds !== undefined && onSelectionChange !== undefined;
  const currentSelectedIds = isSelectionControlled ? selectedIds : internalSelectedIds;

  useEffect(() => {
    if (!isSelectionControlled) {
      setInternalSelectedIds(selectedIds);
    }
  }, [selectedIds, isSelectionControlled]);

  const applyExpandedIds = useCallback(
    (nextIds) => {
      if (isExpandControlled) {
        onExpandedChange?.(nextIds);
      } else {
        setInternalExpandedIds(new Set(nextIds));
      }
    },
    [isExpandControlled, onExpandedChange],
  );

  const toggleExpanded = useCallback(
    (nodeId) => {
      const next = new Set(expandedIdSet);
      const isExpanded = next.has(nodeId);
      if (isExpanded) {
        next.delete(nodeId);
      } else {
        next.add(nodeId);
      }
      onNodeExpand?.(nodeId, !isExpanded);
      applyExpandedIds([...next]);
    },
    [expandedIdSet, onNodeExpand, applyExpandedIds],
  );

  const handleSelection = useCallback(
    (nodeId, ctrlKey = false) => {
      if (!selectable) return;

      let newSelection;
      if (multiSelect && ctrlKey) {
        newSelection = currentSelectedIds.includes(nodeId)
          ? currentSelectedIds.filter((id) => id !== nodeId)
          : [...currentSelectedIds, nodeId];
      } else {
        newSelection = [nodeId];
      }

      if (isSelectionControlled) {
        onSelectionChange?.(newSelection);
      } else {
        setInternalSelectedIds(newSelection);
      }
    },
    [
      selectable,
      multiSelect,
      currentSelectedIds,
      isSelectionControlled,
      onSelectionChange,
    ],
  );

  const handleDragStart = (node, event) => {
    if (!draggable) return;
    dragNodeRef.current = node;
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', node.id);
  };

  const handleDragOver = (node, event) => {
    if (!draggable || !dragNodeRef.current) return;
    const dragNode = dragNodeRef.current;
    const canDrop = allowDrop
      ? allowDrop({ dragNode, dropNode: node, dropPosition: 0 })
      : true;
    if (!canDrop) return;
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    setDragOverNodeId(node.id);
  };

  const handleDropOnNode = (dropNode, event) => {
    if (!draggable || !dragNodeRef.current || !onDrop) return;
    event.preventDefault();
    event.stopPropagation();
    const dragNode = dragNodeRef.current;
    const rect = event.currentTarget.getBoundingClientRect();
    const offsetY = event.clientY - rect.top;
    const dropToGap = offsetY < rect.height * 0.25 || offsetY > rect.height * 0.75;
    const dropPosition = offsetY < rect.height / 2 ? -1 : 1;
    const canDrop = allowDrop
      ? allowDrop({ dragNode, dropNode, dropPosition })
      : true;
    if (canDrop) {
      onDrop({ dragNode, dropNode, dropPosition, dropToGap });
    }
    dragNodeRef.current = null;
    setDragOverNodeId(null);
  };

  const handleDragEnd = () => {
    dragNodeRef.current = null;
    setDragOverNodeId(null);
  };

  return (
    <motion.div
      className={cn(
        'eacy-tree-view',
        !bordered && 'eacy-tree-view--plain',
        className,
      )}
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, ease: 'easeOut' }}
    >
      <div className="eacy-tree-view__body">
        {data.map((node, index) => (
          <TreeNode
            key={node.id}
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
            isLast={index === data.length - 1}
            node={node}
            onNodeClick={onNodeClick}
            setDragOverNodeId={setDragOverNodeId}
            showIcons={showIcons}
            showLines={showLines}
            toggleExpanded={toggleExpanded}
          />
        ))}
      </div>
    </motion.div>
  );
}

export default TreeView;
