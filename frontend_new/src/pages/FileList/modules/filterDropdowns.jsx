import React, { memo, useCallback, useEffect, useMemo, useState } from 'react'
import { Button, Checkbox, DatePicker, Input } from 'antd'
import { CaretRightOutlined, SearchOutlined } from '@ant-design/icons'
import { appThemeToken } from '../../../styles/themeTokens'
import { toggleFilterValues } from './routeState'

const { RangePicker } = DatePicker

// ─── 筛选弹出面板组件 ───
export const CheckboxFilterDropdown = ({ options, value, onChange, onConfirm, onReset, locked = false }) => (
  <div style={{ padding: 12, minWidth: 180 }} onClick={(e) => e.stopPropagation()}>
    <Checkbox.Group
      value={value}
      onChange={locked ? undefined : onChange}
      style={{ display: 'flex', flexDirection: 'column', gap: 6 }}
    >
      {options.map((opt) => (
        <Checkbox
          key={typeof opt === 'string' ? opt : opt.value}
          value={typeof opt === 'string' ? opt : opt.value}
          disabled={locked}
        >
          {typeof opt === 'string' ? opt : opt.label}
        </Checkbox>
      ))}
    </Checkbox.Group>
    <div
      style={{
        display: 'flex',
        justifyContent: 'space-between',
        marginTop: 10,
        borderTop: '1px solid var(--border-color)',
        paddingTop: 8,
      }}
    >
      <Button size="small" type="link" onClick={locked ? undefined : onReset} disabled={locked}>
        清空
      </Button>
      <Button size="small" type="primary" onClick={onConfirm}>
        {locked ? '确定' : '筛选'}
      </Button>
    </div>
  </div>
)

export const FileTypeFilterDropdown = ({ categories, value, onChange, onConfirm, onReset }) => {
  const [activeCategoryKey, setActiveCategoryKey] = useState(null)
  const selectedValues = value || []
  const selectedSet = useMemo(() => new Set(selectedValues), [selectedValues])
  const activeCategory = categories.find((category) => category.key === activeCategoryKey) || null

  useEffect(() => {
    if (activeCategoryKey && !categories.some((category) => category.key === activeCategoryKey)) {
      setActiveCategoryKey(null)
    }
  }, [activeCategoryKey, categories])

  const getCategorySelectionMeta = useCallback((category) => {
    const selectedCount = category.children.filter((item) => selectedSet.has(item)).length
    return {
      selectedCount,
      allChecked: category.children.length > 0 && selectedCount === category.children.length,
      indeterminate: selectedCount > 0 && selectedCount < category.children.length,
    }
  }, [selectedSet])

  return (
    <div
      style={{
        width: 300,
        background: appThemeToken.colorBgContainer,
        borderRadius: 8,
        boxShadow: '0 6px 16px rgba(0,0,0,0.08)',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      <div
        style={{
          padding: '10px 12px 8px',
          borderBottom: '1px solid var(--border-color)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 8,
        }}
      >
        {activeCategory ? (
          <Button
            type="link"
            size="small"
            onClick={() => setActiveCategoryKey(null)}
            style={{ padding: 0, height: 'auto' }}
          >
            返回大类
          </Button>
        ) : (
          <span style={{ fontSize: 12, color: 'var(--text-color-secondary)' }}>按大类选择子类型</span>
        )}
        <span style={{ fontSize: 12, color: 'var(--text-color-secondary)', whiteSpace: 'nowrap' }}>
          已选 {selectedValues.length} 项
        </span>
      </div>

      <div style={{ maxHeight: 320, overflowY: 'auto', padding: 8 }}>
        {!categories.length ? (
          <div style={{ padding: '20px 12px', fontSize: 12, color: 'var(--text-color-secondary)', textAlign: 'center' }}>
            当前列表暂无可筛选的文档类型
          </div>
        ) : (
          activeCategory ? (
            <div>
              <div
                style={{
                  padding: '4px 4px 10px',
                  marginBottom: 8,
                  borderBottom: `1px solid ${appThemeToken.colorBorder}`,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: 8,
                }}
              >
                <Checkbox
                  checked={getCategorySelectionMeta(activeCategory).allChecked}
                  indeterminate={getCategorySelectionMeta(activeCategory).indeterminate}
                  onChange={(e) => onChange(toggleFilterValues(selectedValues, activeCategory.children, e.target.checked))}
                >
                  {activeCategory.label}
                </Checkbox>
                <span style={{ fontSize: 12, color: 'var(--text-color-secondary)' }}>
                  {getCategorySelectionMeta(activeCategory).selectedCount}/{activeCategory.children.length}
                </span>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {activeCategory.children.map((child) => (
                  <Checkbox
                    key={child}
                    checked={selectedSet.has(child)}
                    onChange={(e) => onChange(toggleFilterValues(selectedValues, [child], e.target.checked))}
                  >
                    {child}
                  </Checkbox>
                ))}
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {categories.map((category) => {
                const meta = getCategorySelectionMeta(category)
                return (
                  <div
                    key={category.key}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 8,
                      padding: '6px 4px',
                      borderRadius: 6,
                    }}
                  >
                    <Checkbox
                      checked={meta.allChecked}
                      indeterminate={meta.indeterminate}
                      onChange={(e) => onChange(toggleFilterValues(selectedValues, category.children, e.target.checked))}
                    />
                    <button
                      type="button"
                      onClick={() => setActiveCategoryKey(category.key)}
                      style={{
                        flex: 1,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        background: 'transparent',
                        border: 'none',
                        padding: 0,
                        cursor: 'pointer',
                        textAlign: 'left',
                      }}
                    >
                      <span style={{ fontSize: 14, color: 'var(--text-color)' }}>{category.label}</span>
                      <span style={{ fontSize: 12, color: 'var(--text-color-secondary)' }}>
                        {meta.selectedCount > 0 ? `${meta.selectedCount}/${category.children.length}` : `${category.children.length} 项`}
                      </span>
                    </button>
                    <Button
                      type="text"
                      size="small"
                      onClick={() => setActiveCategoryKey(category.key)}
                      style={{ color: 'var(--text-color-secondary)' }}
                    >
                      <CaretRightOutlined />
                    </Button>
                  </div>
                )
              })}
            </div>
          )
        )}
      </div>

      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          marginTop: 2,
          borderTop: '1px solid var(--border-color)',
          padding: '8px 12px',
        }}
      >
        <Button size="small" type="link" onClick={onReset}>
          清空
        </Button>
        <Button size="small" type="primary" onClick={onConfirm}>
          筛选
        </Button>
      </div>
    </div>
  )
}

// 筛选下拉 overlay 内容：memo 避免表格 data 更新时整表重渲染导致 overlay 重建（闪烁/多框）
export const FilterDropdownOverlayContent = memo(function FilterDropdownOverlayContent({
  filterKey,
  tempFilters,
  setTempFilters,
  onApply,
  onReset,
  options,
}) {
  if (filterKey === 'fileName') {
    return (
      <div style={{ padding: 12, minWidth: 220, background: appThemeToken.colorBgContainer, borderRadius: 8, boxShadow: '0 6px 16px rgba(0,0,0,0.08)' }} onClick={(e) => e.stopPropagation()}>
        <Input
          placeholder="搜索文件名或患者姓名..."
          prefix={<SearchOutlined style={{ color: 'var(--text-color-secondary)' }} />}
          allowClear
          value={tempFilters.fileName || ''}
          onChange={(e) => setTempFilters((prev) => ({ ...prev, fileName: e.target.value }))}
          onPressEnter={() => onApply('fileName')}
          style={{ marginBottom: 8 }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border-color)', paddingTop: 8 }}>
          <Button size="small" type="link" onClick={() => onReset('fileName')}>清空</Button>
          <Button size="small" type="primary" onClick={() => onApply('fileName')}>筛选</Button>
        </div>
      </div>
    )
  }
  if (filterKey === 'dateRange') {
    return (
      <div style={{ padding: 12, background: appThemeToken.colorBgContainer, borderRadius: 8, boxShadow: '0 6px 16px rgba(0,0,0,0.08)' }} onClick={(e) => e.stopPropagation()}>
        <RangePicker
          value={tempFilters.dateRange}
          onChange={(v) => setTempFilters((prev) => ({ ...prev, dateRange: v }))}
          style={{ width: '100%' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 8 }}>
          <Button size="small" type="link" onClick={() => onReset('dateRange')}>清空</Button>
          <Button size="small" type="primary" onClick={() => onApply('dateRange')}>确认</Button>
        </div>
      </div>
    )
  }
  if (filterKey === 'fileType') {
    return (
      <FileTypeFilterDropdown
        categories={options}
        value={tempFilters.fileType}
        onChange={(v) => setTempFilters((prev) => ({ ...prev, fileType: v }))}
        onConfirm={() => onApply('fileType')}
        onReset={() => onReset('fileType')}
      />
    )
  }
  const isArchivedStatusFilter =
    filterKey === 'taskStatus' &&
    Array.isArray(options) &&
    options.length === 1 &&
    ((typeof options[0] === 'string' && options[0] === 'archived') ||
      (typeof options[0] === 'object' && options[0].value === 'archived'))
  const effectiveValue = isArchivedStatusFilter ? ['archived'] : tempFilters[filterKey]
  return (
    <div style={{ background: appThemeToken.colorBgContainer, borderRadius: 8, boxShadow: '0 6px 16px rgba(0,0,0,0.08)' }}>
      <CheckboxFilterDropdown
        options={options}
        value={effectiveValue}
        onChange={(v) => setTempFilters((prev) => ({ ...prev, [filterKey]: v }))}
        onConfirm={() => onApply(filterKey)}
        onReset={() => onReset(filterKey)}
        locked={isArchivedStatusFilter}
      />
    </div>
  )
})
