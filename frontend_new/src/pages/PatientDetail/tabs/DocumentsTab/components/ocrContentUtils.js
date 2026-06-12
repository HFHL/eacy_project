export const groupContentByPage = (contentList) => {
  if (!contentList || !Array.isArray(contentList)) return []

  const grouped = {}
  contentList.forEach((block, index) => {
    const pageIdx = block.page_idx || 0
    if (!grouped[pageIdx]) {
      grouped[pageIdx] = []
    }
    grouped[pageIdx].push({ ...block, _originalIndex: index })
  })

  return Object.entries(grouped)
    .sort(([a], [b]) => parseInt(a) - parseInt(b))
    .map(([pageIdx, blocks]) => ({
      pageNum: parseInt(pageIdx) + 1,
      blocks
    }))
}

export const getContentStats = (contentList) => {
  if (!contentList || !Array.isArray(contentList)) {
    return { total: 0, text: 0, table: 0, image: 0, other: 0, pages: 0 }
  }

  const stats = { total: contentList.length, text: 0, table: 0, image: 0, other: 0 }
  const pages = new Set()

  contentList.forEach(block => {
    pages.add(block.page_idx || 0)
    if (block.type === 'text') stats.text++
    else if (block.type === 'table') stats.table++
    else if (block.type === 'image') stats.image++
    else stats.other++
  })

  stats.pages = pages.size
  return stats
}

export const extractMarkdownFromParsedContent = (parsedContent) => {
  if (!parsedContent) return ''

  let parsed = parsedContent
  if (typeof parsedContent === 'string') {
    try {
      parsed = JSON.parse(parsedContent)
    } catch {
      return ''
    }
  }

  if (!parsed || typeof parsed !== 'object') return ''

  const stack = [parsed]
  const seen = new Set()
  let visited = 0
  const maxNodes = 5000

  while (stack.length > 0 && visited < maxNodes) {
    const current = stack.pop()
    visited += 1

    if (!current || typeof current !== 'object') continue
    if (seen.has(current)) continue
    seen.add(current)

    if (typeof current.markdown === 'string' && current.markdown.trim()) {
      return current.markdown
    }

    if (Array.isArray(current)) {
      current.forEach(item => stack.push(item))
    } else {
      Object.values(current).forEach(value => {
        if (value && typeof value === 'object') {
          stack.push(value)
        }
      })
    }
  }

  return ''
}
