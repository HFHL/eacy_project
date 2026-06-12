import { useEffect, useState } from 'react'

import { fetchCrfDocTypeOptions } from '../../../components/FormDesigner/utils/designerBridge'

export const useCrfDocTypeOptions = () => {
  const [docTypeOptions, setDocTypeOptions] = useState([])

  useEffect(() => {
    const loadDocTypes = async () => {
      const options = await fetchCrfDocTypeOptions()
      setDocTypeOptions(options)
    }
    loadDocTypes()
  }, [])

  return docTypeOptions
}
