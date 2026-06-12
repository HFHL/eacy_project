import { useCallback, useState } from 'react'

const createInitialAiMessages = () => [
  {
    type: 'ai',
    content: '您好！我是AI助手，可以帮您查询患者的相关信息。',
    timestamp: new Date().toISOString(),
  },
]

const generateAiResponse = (input) => {
  const inputLower = input.toLowerCase()
  if (inputLower.includes('血常规') || inputLower.includes('血检')) {
    return '根据2024-01-15的血常规报告，患者白细胞计数为6.5×10⁹/L（正常范围），红细胞计数为4.2×10¹²/L（略低），血红蛋白为125g/L（略低）。建议关注贫血情况。'
  }
  if (inputLower.includes('用药') || inputLower.includes('药物')) {
    return '患者目前正在服用吉非替尼250mg，每日一次，用于靶向治疗。开始时间为2024-01-10，目前持续用药中。'
  }
  if (inputLower.includes('诊断')) {
    return '患者主要诊断为肺腺癌和高血压。肺腺癌确诊时间为2024-01-10，目前正在接受靶向治疗。'
  }
  return '我理解您的问题。基于患者张三的当前数据，我可以为您提供相关信息。请您具体说明需要了解哪方面的情况？'
}

export const usePatientAiAssistant = () => {
  const [aiMessages, setAiMessages] = useState(createInitialAiMessages)
  const [aiInput, setAiInput] = useState('')
  const [aiModalPosition, setAiModalPosition] = useState({ x: 20, y: 80 })
  const [isDragging, setIsDragging] = useState(false)

  const handleSendAiMessage = useCallback(() => {
    if (!aiInput.trim()) return

    const userMessage = {
      type: 'user',
      content: aiInput,
      timestamp: new Date().toLocaleString(),
    }
    const aiReply = {
      type: 'ai',
      content: generateAiResponse(aiInput),
      timestamp: new Date().toLocaleString(),
    }

    setAiMessages((prev) => [...prev, userMessage, aiReply])
    setAiInput('')
  }, [aiInput])

  const handleDragEnd = useCallback(({ x, y, dragging }) => {
    if (typeof x === 'number' && typeof y === 'number') {
      setAiModalPosition({ x, y })
    }
    setIsDragging(dragging)
  }, [])

  return {
    aiInput,
    aiMessages,
    aiModalPosition,
    handleDragEnd,
    handleSendAiMessage,
    isDragging,
    setAiInput,
    setAiMessages,
    setIsDragging,
  }
}
