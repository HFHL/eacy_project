export const normalizeSlashPath = (rawPath) => {
  return String(rawPath || '')
    .normalize('NFKC')
    .replace(/\s*\/\s*/g, '/')
    .trim()
}

export const unwrapFieldValue = (rawValue) => {
  if (rawValue && typeof rawValue === 'object' && Object.prototype.hasOwnProperty.call(rawValue, 'value')) {
    return rawValue.value
  }
  return rawValue
}

export const isMeaningfulValue = (value) => {
  if (value === null || value === undefined || value === '') return false
  if (Array.isArray(value)) return value.length > 0
  return true
}

export const isEmptyValue = (value) => {
  if (value === null || value === undefined || value === '') return true
  if (Array.isArray(value)) return value.length === 0
  return false
}

export const buildFieldPathCandidates = (fieldKey, groupName) => {
  const normalizedFieldKey = normalizeSlashPath(fieldKey)
  const keySegments = normalizedFieldKey.split('/').filter(Boolean)
  const candidates = [normalizedFieldKey]
  const normalizedGroupName = normalizeSlashPath(groupName)
  if (normalizedGroupName && normalizedFieldKey.startsWith(`${normalizedGroupName}/`)) {
    candidates.push(normalizedFieldKey.slice(normalizedGroupName.length + 1))
  }
  if (keySegments.length > 1) {
    candidates.push(keySegments.slice(1).join('/'))
  }
  return [...new Set(candidates.filter(Boolean))]
}

export const readValueBySegments = (rootValue, segments) => {
  if (!Array.isArray(segments) || segments.length === 0) {
    return unwrapFieldValue(rootValue)
  }
  if (Array.isArray(rootValue)) {
    const mapped = rootValue.map((item) => readValueBySegments(item, segments))
    const hasAny = mapped.some((item) => item !== null && item !== undefined)
    return hasAny ? mapped : undefined
  }
  if (!rootValue || typeof rootValue !== 'object') return undefined
  const [head, ...rest] = segments
  if (!Object.prototype.hasOwnProperty.call(rootValue, head)) return undefined
  return readValueBySegments(rootValue[head], rest)
}

export const readObjectPath = (root, pathKey) => {
  if (!root || typeof root !== 'object' || !pathKey) return null
  const segments = String(pathKey).split('/').filter(Boolean)
  if (segments.length === 0) return null
  let cursor = root
  for (const segment of segments) {
    if (cursor && typeof cursor === 'object' && Object.prototype.hasOwnProperty.call(cursor, segment)) {
      cursor = cursor[segment]
    } else {
      return null
    }
  }
  return unwrapFieldValue(cursor)
}

const isNumericSegment = (segment) => /^\d+$/.test(String(segment || ''))

const splitPathSegments = (pathKey) => normalizeSlashPath(pathKey).split('/').filter(Boolean)

const stripNumericSegments = (pathKey) => (
  splitPathSegments(pathKey).filter((segment) => !isNumericSegment(segment)).join('/')
)

const indexedPathMatchesCandidate = (rawKey, candidateKey) => {
  const canonicalRawKey = stripNumericSegments(rawKey)
  const normalizedCandidateKey = normalizeSlashPath(candidateKey)
  return canonicalRawKey === normalizedCandidateKey
    || canonicalRawKey.endsWith(`/${normalizedCandidateKey}`)
    || normalizedCandidateKey.endsWith(`/${canonicalRawKey}`)
}

const indexedSortKey = (rawKey) => {
  const numericSegments = splitPathSegments(rawKey)
    .filter(isNumericSegment)
    .map((segment) => Number.parseInt(segment, 10))
  if (numericSegments.length === 0) return Number.MAX_SAFE_INTEGER
  return numericSegments.reduce((score, value, index) => score + (value * (1000 ** (numericSegments.length - index - 1))), 0)
}

const readIndexedFieldValues = (entries, candidateKey) => {
  const matches = entries
    .filter(([rawKey]) => {
      const rawSegments = splitPathSegments(rawKey)
      return rawSegments.some(isNumericSegment) && indexedPathMatchesCandidate(rawKey, candidateKey)
    })
    .sort((a, b) => indexedSortKey(a[0]) - indexedSortKey(b[0]))

  if (matches.length === 0) return null

  const values = matches.map(([, rawValue]) => unwrapFieldValue(rawValue))
  return {
    value: values,
    matchedPath: matches.map(([rawKey]) => normalizeSlashPath(rawKey)).join(','),
    stage: 'indexed',
  }
}

export const readFromFieldsWithDiagnostics = (fields, candidates) => {
  if (!fields || typeof fields !== 'object') return null
  const entries = Object.entries(fields)
  let emptyCandidateHit = null

  for (const candidateKey of candidates) {
    const directEntry = entries.find(([rawKey]) => normalizeSlashPath(rawKey) === candidateKey)
    if (!directEntry) continue
    const directValue = unwrapFieldValue(directEntry[1])
    const directHit = { value: directValue, matchedPath: normalizeSlashPath(directEntry[0]), stage: 'exact' }
    if (isMeaningfulValue(directValue)) return directHit
    if (!emptyCandidateHit) emptyCandidateHit = directHit
  }

  for (const candidateKey of candidates) {
    const prefixMatches = entries
      .map(([rawKey, rawValue]) => ({ rawKey, rawValue, normalizedRawKey: normalizeSlashPath(rawKey) }))
      .filter((entry) => entry.normalizedRawKey && candidateKey.startsWith(`${entry.normalizedRawKey}/`))
    if (prefixMatches.length === 0) continue
    prefixMatches.sort((a, b) => b.normalizedRawKey.length - a.normalizedRawKey.length)
    const bestMatch = prefixMatches[0]
    const baseValue = unwrapFieldValue(bestMatch.rawValue)
    const restSegments = candidateKey.slice(bestMatch.normalizedRawKey.length + 1).split('/').filter(Boolean)
    const nestedValue = readValueBySegments(baseValue, restSegments)
    if (nestedValue === null || nestedValue === undefined) continue
    const prefixHit = { value: nestedValue, matchedPath: `${bestMatch.normalizedRawKey}/${restSegments.join('/')}`, stage: 'prefix' }
    if (isMeaningfulValue(nestedValue)) return prefixHit
    if (!emptyCandidateHit) emptyCandidateHit = prefixHit
  }

  for (const candidateKey of candidates) {
    const indexedHit = readIndexedFieldValues(entries, candidateKey)
    if (!indexedHit) continue
    if (isMeaningfulValue(indexedHit.value)) return indexedHit
    if (!emptyCandidateHit) emptyCandidateHit = indexedHit
  }

  for (const candidateKey of candidates) {
    const suffixMatches = entries.filter(([rawKey]) => {
      const normalizedRawKey = normalizeSlashPath(rawKey)
      return candidateKey.endsWith(`/${normalizedRawKey}`) || normalizedRawKey.endsWith(`/${candidateKey}`)
    })
    if (suffixMatches.length === 0) continue
    suffixMatches.sort((a, b) => String(b[0]).length - String(a[0]).length)
    for (const suffixEntry of suffixMatches) {
      const suffixValue = unwrapFieldValue(suffixEntry[1])
      const suffixHit = { value: suffixValue, matchedPath: normalizeSlashPath(suffixEntry[0]), stage: 'suffix' }
      if (isMeaningfulValue(suffixValue)) return suffixHit
      if (!emptyCandidateHit) emptyCandidateHit = suffixHit
    }
  }

  for (const candidateKey of candidates) {
    const nestedValue = readObjectPath(fields, candidateKey)
    if (nestedValue === null || nestedValue === undefined) continue
    const nestedHit = { value: nestedValue, matchedPath: candidateKey, stage: 'nested' }
    if (isMeaningfulValue(nestedValue)) return nestedHit
    if (!emptyCandidateHit) emptyCandidateHit = nestedHit
  }

  return emptyCandidateHit
}
