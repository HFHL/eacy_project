import { useEffect, useRef } from 'react'
import { useSchemaForm } from '../SchemaFormContext'

export function useAutoSave(enabled, interval, onSave) {
  const timerRef = useRef(null)
  const { isDirty, draftData } = useSchemaForm()
  const onSaveRef = useRef(onSave)
  onSaveRef.current = onSave

  useEffect(() => {
    if (!enabled || !isDirty) {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
      return undefined
    }

    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => {
      timerRef.current = null
      onSaveRef.current?.(draftData, 'auto')
    }, interval)

    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current)
        timerRef.current = null
      }
    }
  }, [enabled, isDirty, draftData, interval])
}
