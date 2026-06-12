import React from 'react'
import { Card, Space, Tooltip, Typography } from 'antd'
import { FileSearchOutlined, FormOutlined } from '@ant-design/icons'
import FieldRenderer from '../FieldRenderer'
import RepeatableForm from '../RepeatableForm'
import { appThemeToken } from '../../../styles/themeTokens'
import { useSchemaFieldGroups } from './useSchemaFieldGroups'

const { Text } = Typography

export const NestedObjectSection = ({
  title,
  schemaNode,
  path,
  data,
  onFieldChange,
  onFieldSelect,
  selectedFieldPath,
  level = 1,
}) => {
  const {
    nestedArrays,
    nestedObjects,
    propertiesToIterate,
    requiredFields,
    simpleFields,
  } = useSchemaFieldGroups(schemaNode, path)

  if (!propertiesToIterate) {
    console.log('[NestedObjectSection] 没有找到properties或items.properties，返回null')
    return null
  }

  const isInsideArray = /\.\d+\./.test(path)

  return (
    <Card
      size="small"
      title={
        <Space>
          <FormOutlined style={{ color: appThemeToken.colorSuccess }} />
          <Text strong>{title}</Text>
          {isInsideArray && (
            <Tooltip title="查看溯源">
              <FileSearchOutlined
                style={{ fontSize: 14, color: appThemeToken.colorPrimary, cursor: 'pointer' }}
                onClick={(e) => {
                  e.stopPropagation()
                  onFieldSelect?.(path, schemaNode, title, { forceOpen: true, trigger: 'source-icon' })
                }}
              />
            </Tooltip>
          )}
        </Space>
      }
      style={{
        marginBottom: 16,
        borderRadius: 8,
        border: `1px solid ${level === 1 ? appThemeToken.colorBorder : appThemeToken.colorBorderSecondary}`,
        background: level === 1 ? appThemeToken.colorBgContainer : appThemeToken.colorFillTertiary,
      }}
      bodyStyle={{ padding: 16 }}
    >
      {simpleFields.map(({ fieldName, fieldSchema }) => {
        const fieldPath = `${path}.${fieldName}`
        return (
          <FieldRenderer
            key={fieldName}
            fieldName={fieldName}
            fieldSchema={fieldSchema}
            path={fieldPath}
            value={data?.[fieldName]}
            onChange={(value) => onFieldChange(fieldName, value)}
            required={requiredFields.includes(fieldName)}
            onSourceClick={onFieldSelect}
            isSelected={selectedFieldPath === fieldPath}
            showSourceIcon={!isInsideArray}
          />
        )
      })}

      {nestedObjects.map(({ fieldName, fieldSchema }) => (
        <NestedObjectSection
          key={fieldName}
          title={fieldName}
          schemaNode={fieldSchema}
          path={`${path}.${fieldName}`}
          data={data?.[fieldName] || {}}
          onFieldChange={(subField, value) => {
            const newData = { ...(data?.[fieldName] || {}), [subField]: value }
            onFieldChange(fieldName, newData)
          }}
          onFieldSelect={onFieldSelect}
          selectedFieldPath={selectedFieldPath}
          level={level + 1}
        />
      ))}

      {nestedArrays.map(({ fieldName, fieldSchema }) => (
        <RepeatableForm
          key={fieldName}
          title={fieldName}
          arraySchema={fieldSchema}
          path={`${path}.${fieldName}`}
          data={data?.[fieldName] || []}
          minItems={typeof fieldSchema.minItems === 'number' ? fieldSchema.minItems : 0}
          maxItems={typeof fieldSchema.maxItems === 'number' ? fieldSchema.maxItems : 100}
          onDataChange={(newData) => onFieldChange(fieldName, newData)}
          onSourceClick={onFieldSelect}
          selectedFieldPath={selectedFieldPath}
          defaultExpanded={level < 2}
        />
      ))}
    </Card>
  )
}

export const FullFormRenderer = ({ schemaNode, path, data, onFieldChange, onFieldSelect, selectedFieldPath }) => {
  const {
    nestedArrays,
    nestedObjects,
    propertiesToIterate,
    requiredFields,
    simpleFields,
  } = useSchemaFieldGroups(schemaNode, path)

  if (!propertiesToIterate) return null

  return (
    <div>
      {simpleFields.length > 0 && (
        <div style={{ marginBottom: 24 }}>
          {simpleFields.map(({ fieldName, fieldSchema }) => {
            const fieldPath = `${path}.${fieldName}`
            return (
              <FieldRenderer
                key={fieldName}
                fieldName={fieldName}
                fieldSchema={fieldSchema}
                path={fieldPath}
                value={data?.[fieldName]}
                onChange={(value) => onFieldChange(fieldName, value)}
                required={requiredFields.includes(fieldName)}
                onSourceClick={onFieldSelect}
                isSelected={selectedFieldPath === fieldPath}
              />
            )
          })}
        </div>
      )}

      {nestedObjects.map(({ fieldName, fieldSchema }) => (
        <NestedObjectSection
          key={fieldName}
          title={fieldName}
          schemaNode={fieldSchema}
          path={`${path}.${fieldName}`}
          data={data?.[fieldName] || {}}
          onFieldChange={(subField, value) => {
            const newData = { ...(data?.[fieldName] || {}), [subField]: value }
            onFieldChange(fieldName, newData)
          }}
          onFieldSelect={onFieldSelect}
          selectedFieldPath={selectedFieldPath}
          level={1}
        />
      ))}

      {nestedArrays.map(({ fieldName, fieldSchema }) => (
        <RepeatableForm
          key={fieldName}
          title={fieldName}
          arraySchema={fieldSchema}
          path={`${path}.${fieldName}`}
          data={data?.[fieldName] || []}
          minItems={typeof fieldSchema.minItems === 'number' ? fieldSchema.minItems : 0}
          maxItems={typeof fieldSchema.maxItems === 'number' ? fieldSchema.maxItems : 100}
          onDataChange={(newData) => onFieldChange(fieldName, newData)}
          onSourceClick={onFieldSelect}
          selectedFieldPath={selectedFieldPath}
          defaultExpanded
        />
      ))}
    </div>
  )
}
