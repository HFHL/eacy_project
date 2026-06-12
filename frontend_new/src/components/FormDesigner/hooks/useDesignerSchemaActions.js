import { useCallback } from 'react'
import { message } from 'antd'

import SchemaGenerator from '../core/SchemaGenerator'

export const useDesignerSchemaActions = ({
  data,
  designData,
  onSave,
  schemaParser,
}) => {
  const handleSaveSchema = useCallback(() => {
    const schema = SchemaGenerator.generateSchema(designData.getData())
    const validation = designData.validateDesign()

    if (!validation.valid) {
      message.error(`设计数据验证失败: ${validation.errors.map((item) => item.message).join(', ')}`)
      return
    }

    if (onSave) {
      onSave(schema)
    }
  }, [designData, onSave])

  const handleDownloadSchema = useCallback(() => {
    const schema = SchemaGenerator.generateSchema(designData.getData())
    schemaParser.downloadSchema(schema, data.meta.$id || 'schema.json')
  }, [data.meta.$id, designData, schemaParser])

  return {
    handleDownloadSchema,
    handleSaveSchema,
  }
}
