import { useImperativeHandle } from 'react'
import { message } from 'antd'

import SchemaGenerator from '../core/SchemaGenerator'
import { CSVConverter } from '../utils/csvConverter'
import { createEmptyDesignData } from '../data/designerSeedData'
import { buildInitialSelectionPath } from '../utils/selectionPath'

export const useDesignerImperativeApi = ({
  designData,
  ref,
  schemaParser,
  setPreviewVisible,
  setSelectionPath,
}) => {
  useImperativeHandle(ref, () => ({
    getData: () => designData.getData(),

    loadData: (data, options = {}) => {
      const {
        silent = false,
        successMessage = '数据加载成功',
        autoSelectFirst = true,
      } = options
      designData.resetData(data)
      setSelectionPath(autoSelectFirst ? buildInitialSelectionPath(data) : [])
      if (!silent && successMessage) {
        message.success(successMessage)
      }
      return data
    },

    clearData: (options = {}) => {
      const { silent = true } = options
      const emptyData = createEmptyDesignData()
      designData.resetData(emptyData)
      setSelectionPath([])
      if (!silent) {
        message.success('设计器已清空')
      }
      return emptyData
    },

    loadSchema: async (schema, options = {}) => {
      const {
        silent = false,
        successMessage = 'Schema加载成功',
        suppressError = false,
      } = options

      try {
        const result = schemaParser.parseSchema(schema, {
          suppressSuccess: silent || !successMessage,
          suppressError,
        })
        if (!result.success) {
          const errMsg = result.errors?.map((item) => item.message).join(', ') || '未知错误'
          if (!suppressError) {
            message.error(`Schema解析失败: ${errMsg}`)
          }
          return null
        }

        const parsedData = result.data
        setSelectionPath(buildInitialSelectionPath(parsedData))
        if (!silent && successMessage) {
          message.success(successMessage)
        }
        return parsedData
      } catch (error) {
        if (!suppressError) {
          message.error(`Schema解析失败: ${error.message}`)
        }
        throw error
      }
    },

    exportSchema: () => SchemaGenerator.generateSchema(designData.getData()),

    exportCSV: () => CSVConverter.designModelToCSV(designData.getData()),

    importCSV: async (file) => {
      try {
        const designModel = await CSVConverter.importCSV(file)
        designData.resetData(designModel)
        setSelectionPath(buildInitialSelectionPath(designModel))
        return designModel
      } catch (error) {
        message.error(`CSV导入失败: ${error.message}`)
        throw error
      }
    },

    refresh: () => {
      setSelectionPath((prev) => [...prev])
    },

    preview: () => {
      setPreviewVisible(true)
    },
  }), [designData, schemaParser, setPreviewVisible, setSelectionPath])
}
