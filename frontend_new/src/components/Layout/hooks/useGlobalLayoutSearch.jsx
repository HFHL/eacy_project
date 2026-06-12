import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { FileOutlined } from '@ant-design/icons'
import { getDocumentList } from '../../../api/document'
import { getPatientList } from '../../../api/patient'
import { PAGE_SEARCH_ENTRIES } from '../layoutShellConfig'
import { searchIconMap } from '../layoutRailModel'

export const useGlobalLayoutSearch = ({
  documentView,
  location,
  navigate,
}) => {
  const [searchVisible, setSearchVisible] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [searchLoading, setSearchLoading] = useState(false)
  const [searchResults, setSearchResults] = useState({ patients: [], documents: [], pages: [] })
  const searchTimerRef = useRef(null)
  const searchInputRef = useRef(null)

  const pageEntries = useMemo(
    () => PAGE_SEARCH_ENTRIES.map((entry) => ({ ...entry, icon: searchIconMap[entry.iconKey] || <FileOutlined /> })),
    []
  )

  const handleSearchChange = useCallback((value) => {
    setSearchQuery(value)
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current)
    if (!value.trim()) {
      setSearchResults({ patients: [], documents: [], pages: [] })
      setSearchLoading(false)
      return
    }

    const normalizedQuery = value.trim().toLowerCase()
    const matchedPages = pageEntries.filter((page) =>
      page.label.toLowerCase().includes(normalizedQuery) || page.keywords.toLowerCase().includes(normalizedQuery)
    )
    setSearchResults((current) => ({ ...current, pages: matchedPages }))
    setSearchLoading(true)

    searchTimerRef.current = setTimeout(async () => {
      try {
        const [patientRes, documentRes] = await Promise.all([
          getPatientList({ search: value.trim(), page: 1, page_size: 5 }).catch(() => null),
          getDocumentList({ search: value.trim(), page: 1, page_size: 5 }).catch(() => null),
        ])
        setSearchResults((current) => ({
          ...current,
          patients: patientRes?.data?.items || patientRes?.data || [],
          documents: documentRes?.data?.items || documentRes?.data || [],
        }))
      } catch {
        setSearchResults((current) => ({ ...current, patients: [], documents: [] }))
      } finally {
        setSearchLoading(false)
      }
    }, 350)
  }, [pageEntries])

  const resetSearchOverlay = useCallback(() => {
    setSearchVisible(false)
    setSearchQuery('')
    setSearchResults({ patients: [], documents: [], pages: [] })
    setSearchLoading(false)
  }, [])

  const handleSearchResultClick = useCallback((type, item) => {
    const keyword = searchQuery.trim()
    resetSearchOverlay()

    if (type === 'page') {
      navigate(item.path)
      return
    }

    if (type === 'patient') {
      navigate(`/patient/detail/${item.id}`, {
        state: { from: `${location.pathname}${location.search || ''}` },
      })
      return
    }

    if (type === 'document') {
      const params = new URLSearchParams()
      params.set('tab', 'all')
      params.set('view', documentView)
      if (keyword) params.set('q', keyword)
      navigate(`/document/file-list?${params.toString()}`)
    }
  }, [documentView, location.pathname, location.search, navigate, resetSearchOverlay, searchQuery])

  const toggleSearch = useCallback(() => {
    setSearchVisible((current) => !current)
  }, [])

  useEffect(() => {
    if (searchVisible) {
      setTimeout(() => searchInputRef.current?.focus(), 100)
    }
  }, [searchVisible])

  useEffect(() => {
    const handleKeyDown = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
        event.preventDefault()
        setSearchVisible((current) => !current)
      }
      if (event.key === 'Escape' && searchVisible) {
        resetSearchOverlay()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [resetSearchOverlay, searchVisible])

  return {
    searchOverlayProps: {
      inputRef: searchInputRef,
      loading: searchLoading,
      onBackdropClick: resetSearchOverlay,
      onQueryChange: handleSearchChange,
      onResultClick: handleSearchResultClick,
      pageEntries,
      query: searchQuery,
      results: searchResults,
      visible: searchVisible,
    },
    toggleSearch,
  }
}
