export function hasAnyData(data) {
  if (data == null) return false
  if (Array.isArray(data)) return data.length > 0
  if (typeof data === 'object') {
    return Object.values(data).some((value) => hasAnyData(value))
  }
  return data !== ''
}

export function getFormPanelTitle(selectedPath, isArrayInstance, instanceIndex) {
  if (!selectedPath) return ''
  const parts = selectedPath.split('.')

  if (isArrayInstance && instanceIndex !== null) {
    const formNameParts = []
    for (let i = parts.length - 1; i >= 0; i--) {
      if (!/^\d+$/.test(parts[i])) {
        formNameParts.unshift(parts[i])
        break
      }
    }
    const formName = formNameParts[0] || parts[parts.length - 2]
    return `${formName}_${instanceIndex + 1}`
  }

  return parts[parts.length - 1]
}
