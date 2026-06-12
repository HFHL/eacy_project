import * as XLSX from 'xlsx'

export const parseExcelFile = (file) => (
  new Promise((resolve, reject) => {
    const reader = new FileReader()

    reader.onload = (event) => {
      try {
        const data = new Uint8Array(event.target.result)
        const workbook = XLSX.read(data, { type: 'array' })
        const firstSheetName = workbook.SheetNames[0]
        const worksheet = workbook.Sheets[firstSheetName]
        const jsonData = XLSX.utils.sheet_to_json(worksheet, {
          raw: false,
          defval: ''
        })
        resolve(jsonData)
      } catch (error) {
        reject(error)
      }
    }

    reader.onerror = reject
    reader.readAsArrayBuffer(file)
  })
)

export const validatePatientData = (data, rowIndex, validDepartments) => {
  const errors = []
  const warnings = []

  if (!data['患者姓名'] || !data['患者姓名'].trim()) {
    errors.push('患者姓名不能为空')
  }

  if (!data['性别']) {
    errors.push('性别不能为空')
  } else if (!['男', '女'].includes(data['性别'])) {
    errors.push('性别只能是"男"或"女"')
  }

  if (!data['年龄'] && data['年龄'] !== 0) {
    errors.push('年龄不能为空')
  } else {
    const age = parseInt(data['年龄'])
    if (Number.isNaN(age) || age < 0 || age > 150) {
      errors.push('年龄必须是0-150之间的整数')
    }
  }

  if (!data['科室'] || !data['科室'].trim()) {
    errors.push('科室不能为空')
  } else {
    const deptName = data['科室'].trim()
    if (validDepartments && !validDepartments.includes(deptName)) {
      errors.push(`系统不存在科室: ${deptName}`)
    }
  }

  if (data['身份证号'] && data['身份证号'].length !== 18) {
    warnings.push('身份证号应为18位')
  }

  if (data['联系电话'] && !/^1[3-9]\d{9}$/.test(data['联系电话'])) {
    warnings.push('联系电话格式不正确')
  }

  return {
    hasError: errors.length > 0,
    errors,
    warnings,
    rowIndex: rowIndex + 2
  }
}

export const getFlatDepartmentNames = (treeData) => {
  const names = []
  const traverse = (nodes) => {
    nodes.forEach(node => {
      names.push(node.title)
      if (node.children) {
        traverse(node.children)
      }
    })
  }
  traverse(treeData)
  return names
}

export const getDepartmentIdByName = (deptName, treeData) => {
  let foundId = null
  const traverse = (nodes) => {
    for (const node of nodes) {
      if (node.title === deptName) {
        foundId = node.value
        return true
      }
      if (node.children && traverse(node.children)) {
        return true
      }
    }
    return false
  }
  traverse(treeData)
  return foundId
}
