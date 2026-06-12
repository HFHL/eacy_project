import React, { useEffect } from 'react'
import { Form } from 'antd'

import {
  fromFieldFormValues,
  isOptionDisplayType,
  toFieldFormValues,
} from '../../utils/fieldContract'
import { AdvancedFieldSection } from './fieldConfigPanel/AdvancedFieldSection'
import { BasicFieldSection } from './fieldConfigPanel/BasicFieldSection'
import { FieldDescriptionSection } from './fieldConfigPanel/FieldDescriptionSection'
import { NoFieldSelected } from './fieldConfigPanel/NoFieldSelected'
import { ValidationSection } from './fieldConfigPanel/ValidationSection'
import { inferDataTypeByDisplayType } from './fieldConfigPanel/fieldConfigSettings'

const FieldConfigPanel = ({
  field = null,
  onUpdate = null,
  readonly = false,
  version = 0,
}) => {
  const [form] = Form.useForm()
  const displayType = Form.useWatch('displayType', form)
  const options = Form.useWatch('options', form)
  const isOptionType = isOptionDisplayType(displayType)

  useEffect(() => {
    if (field) {
      form.setFieldsValue(toFieldFormValues(field))
    } else {
      form.resetFields()
    }
  }, [field, form, version])

  useEffect(() => {
    if (!displayType) return
    const inferredDataType = inferDataTypeByDisplayType(displayType, options)
    const currentDataType = form.getFieldValue('dataType')
    if (currentDataType !== inferredDataType) {
      form.setFieldValue('dataType', inferredDataType)
    }
  }, [displayType, options, form])

  const handleValuesChange = (changedValues, allValues) => {
    if (!onUpdate) return
    const updates = fromFieldFormValues(allValues)
    if ('name' in changedValues) {
      updates.displayName = changedValues.name
    }
    onUpdate(updates)
  }

  if (!field) return <NoFieldSelected />

  return (
    <div className="field-config-panel hover-scrollbar">
      <Form
        form={form}
        layout="vertical"
        onValuesChange={handleValuesChange}
        disabled={readonly}
      >
        <BasicFieldSection displayType={displayType} isOptionType={isOptionType} />
        <FieldDescriptionSection />
        <ValidationSection />
        <AdvancedFieldSection field={field} />
      </Form>
    </div>
  )
}

export default FieldConfigPanel
