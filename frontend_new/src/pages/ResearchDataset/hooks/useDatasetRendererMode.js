import { useCallback, useEffect, useMemo, useState } from 'react'

export function useDatasetRendererMode({ location, navigate }) {
  const rendererModeFromQuery = useMemo(() => {
    const search = new URLSearchParams(location.search)
    return search.get('renderer') === 'v1' ? 'v1' : 'v2'
  }, [location.search])

  const showRendererSwitchFromQuery = useMemo(() => {
    const search = new URLSearchParams(location.search)
    return search.get('rendererSwitch') === '1'
  }, [location.search])

  const [rendererMode, setRendererMode] = useState(rendererModeFromQuery)

  const handleRendererModeChange = useCallback((event) => {
    const nextMode = event?.target?.value === 'v2' ? 'v2' : 'v1'
    setRendererMode(nextMode)
    const nextSearch = new URLSearchParams(location.search)
    nextSearch.set('renderer', nextMode)
    const nextSearchText = nextSearch.toString()
    navigate({
      pathname: location.pathname,
      search: nextSearchText ? `?${nextSearchText}` : '',
    }, { replace: true })
  }, [location.pathname, location.search, navigate])

  useEffect(() => {
    setRendererMode(rendererModeFromQuery)
  }, [rendererModeFromQuery])

  return {
    handleRendererModeChange,
    rendererMode,
    showRendererSwitchFromQuery,
  }
}
