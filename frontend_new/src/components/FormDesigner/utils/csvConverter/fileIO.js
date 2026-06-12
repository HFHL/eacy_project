import Papa from 'papaparse'
import { csvToDesignModel } from './modelBuilder.js'

export const downloadCSV = (csvData, filename = 'schema.csv') => {
  const csvString = Papa.unparse(csvData)
  const blob = new Blob(['\ufeff' + csvString], { type: 'text/csv;charset=utf-8;' })
  const link = document.createElement('a')
  const url = URL.createObjectURL(blob)

  link.setAttribute('href', url)
  link.setAttribute('download', filename)
  link.style.visibility = 'hidden'
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export const importCSV = (file) => (
  new Promise((resolve, reject) => {
    Papa.parse(file, {
      encoding: 'UTF-8',
      skipEmptyLines: true,
      complete: (results) => {
        try {
          resolve(csvToDesignModel(results.data))
        } catch (error) {
          reject(error)
        }
      },
      error: (error) => {
        reject(error)
      },
    })
  })
)

export const validateCSV = (csvData) => {
  const errors = []
  const warnings = []

  try {
    csvToDesignModel(csvData)
  } catch (error) {
    errors.push(error.message || 'CSV校验失败')
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}
