export const normalizeValue = (value) => (value || '').toString().trim()

const IDENTIFIER_EQUIVALENCE_GROUPS = {
  inpatient: ['住院号', '病案号', 'MRN'],
  outpatient: ['门诊号', '急诊号']
}

const getCanonicalKey = (type, value) => {
  for (const [groupKey, types] of Object.entries(IDENTIFIER_EQUIVALENCE_GROUPS)) {
    if (types.includes(type)) return `${groupKey}:${value}`
  }
  return `${type}:${value}`
}

export const getDocumentIdentifiers = (doc) => {
  const identifiers = []
  const docIdentifiers = doc.identifiers || []
  if (Array.isArray(docIdentifiers)) {
    docIdentifiers.forEach(item => {
      if (item && typeof item === 'object') {
        const type = normalizeValue(item['标识符类型'] || item.type)
        const value = normalizeValue(item['标识符编号'] || item.value)
        if (type && value) identifiers.push(`${type}:${value}`)
      }
    })
  }
  return identifiers
}

export const groupDocumentsByIdentifiers = (docs) => {
  if (!docs.length) return []
  const parent = docs.map((_, index) => index)
  const find = (index) => {
    if (parent[index] !== index) parent[index] = find(parent[index])
    return parent[index]
  }
  const union = (a, b) => {
    const rootA = find(a)
    const rootB = find(b)
    if (rootA !== rootB) parent[rootB] = rootA
  }

  const identifierMap = new Map()
  const identifiersByIndex = docs.map(doc => getDocumentIdentifiers(doc))
  identifiersByIndex.forEach((identifiers, index) => {
    identifiers.forEach(identifier => {
      const colonIndex = identifier.indexOf(':')
      const type = colonIndex === -1 ? '' : identifier.slice(0, colonIndex)
      const value = colonIndex === -1 ? identifier : identifier.slice(colonIndex + 1)
      const canonicalKey = getCanonicalKey(type, value)
      if (identifierMap.has(canonicalKey)) {
        union(index, identifierMap.get(canonicalKey))
      } else {
        identifierMap.set(canonicalKey, index)
      }
    })
  })

  const groupMap = new Map()
  docs.forEach((doc, index) => {
    const root = find(index)
    if (!groupMap.has(root)) {
      groupMap.set(root, { items: [], identifiers: new Set(), order: index })
    }
    const group = groupMap.get(root)
    group.items.push(doc)
    identifiersByIndex[index].forEach(identifier => group.identifiers.add(identifier))
  })

  return Array.from(groupMap.values()).sort((a, b) => a.order - b.order)
}

export const getPatientNameForCreate = (doc) => {
  const name = (doc.documentMetadata?.name ?? doc.extractedInfo?.name ?? '').toString().trim()
  return name || ''
}

export const isolateGroupsByPatientName = (groups) => {
  const result = []
  for (const group of groups) {
    const byName = new Map()
    for (const item of group.items) {
      const name = getPatientNameForCreate(item)
      if (!byName.has(name)) byName.set(name, [])
      byName.get(name).push(item)
    }
    if (byName.size <= 1) {
      result.push(group)
      continue
    }
    let subOrder = 0
    for (const [, items] of byName) {
      const identifiers = new Set()
      items.forEach(doc => getDocumentIdentifiers(doc).forEach(id => identifiers.add(id)))
      result.push({ items, identifiers, order: group.order + subOrder * 0.001 })
      subOrder += 1
    }
  }
  return result.sort((a, b) => a.order - b.order)
}

export const mergeIdentifiersForDisplay = (identifiersSet) => {
  const byCanonical = new Map()
  identifiersSet.forEach(identifier => {
    const colonIndex = identifier.indexOf(':')
    if (colonIndex === -1) return
    const type = identifier.slice(0, colonIndex)
    const value = identifier.slice(colonIndex + 1)
    const canonicalKey = getCanonicalKey(type, value)
    if (!byCanonical.has(canonicalKey)) {
      byCanonical.set(canonicalKey, { types: new Set(), value })
    }
    byCanonical.get(canonicalKey).types.add(type)
  })

  const typeOrder = [...IDENTIFIER_EQUIVALENCE_GROUPS.inpatient, ...IDENTIFIER_EQUIVALENCE_GROUPS.outpatient]
  return Array.from(byCanonical.entries()).map(([, { types, value }]) => {
    const typesArr = Array.from(types).sort((a, b) => {
      const indexA = typeOrder.indexOf(a)
      const indexB = typeOrder.indexOf(b)
      if (indexA !== -1 && indexB !== -1) return indexA - indexB
      if (indexA !== -1) return -1
      if (indexB !== -1) return 1
      return String(a).localeCompare(b)
    })
    return `${typesArr.join('/')}:${value}`
  })
}

export const formatIdentifierTag = (identifier) => {
  const colonIndex = identifier.lastIndexOf(':')
  if (colonIndex === -1) {
    return { label: '唯一标识', value: identifier, color: 'default' }
  }

  const labelPart = identifier.slice(0, colonIndex)
  const value = identifier.slice(colonIndex + 1)
  const type = labelPart.includes('/') ? labelPart.split('/')[0] : labelPart
  const colorMap = {
    '病案号': 'purple',
    '住院号': 'blue',
    '门诊号': 'cyan',
    '急诊号': 'orange',
    MRN: 'green',
    '医保号': 'gold',
    '社保号': 'lime',
    '健康卡号': 'magenta',
    '身份证号': 'geekblue',
    ID号: 'default'
  }

  return {
    label: labelPart,
    value,
    color: colorMap[type] || 'default'
  }
}
