import { useKeyboardShortcuts, SHORTCUT_KEYS } from './useKeyboardShortcuts'

export const useDesignerKeyboard = ({
  fieldModalVisible,
  handleDeleteField,
  handleDownloadSchema,
  handleSaveSchema,
  readonly,
  selectionPath,
  setEditingField,
  setFieldModalVisible,
  setPreviewVisible,
  setSelectionPath,
  previewVisible,
}) => {
  useKeyboardShortcuts(
    {
      [SHORTCUT_KEYS.SAVE]: () => {
        if (!readonly) handleSaveSchema()
      },
      [SHORTCUT_KEYS.DELETE]: () => {
        if (readonly || selectionPath.length === 0) return

        const deepest = selectionPath[selectionPath.length - 1]
        const folder = selectionPath.find((item) => item.type === 'folder')
        const group = selectionPath.find((item) => item.type === 'group')
        const field = selectionPath.find((item) => item.type === 'field')
        if (deepest?.type === 'field' && folder?.id && group?.id && field?.id) {
          handleDeleteField(folder.id, group.id, field.id)
        }
      },
      [SHORTCUT_KEYS.BACKSPACE]: () => {
        const target = document.activeElement
        const isInInput = (
          target.tagName === 'INPUT'
          || target.tagName === 'TEXTAREA'
          || target.contentEditable === 'true'
        )
        if (readonly || isInInput || selectionPath.length === 0) return

        const deepest = selectionPath[selectionPath.length - 1]
        const folder = selectionPath.find((item) => item.type === 'folder')
        const group = selectionPath.find((item) => item.type === 'group')
        const field = selectionPath.find((item) => item.type === 'field')
        if (deepest?.type === 'field' && folder?.id && group?.id && field?.id) {
          handleDeleteField(folder.id, group.id, field.id)
        }
      },
      [SHORTCUT_KEYS.ESC]: () => {
        if (selectionPath.length > 0) {
          setSelectionPath((prev) => prev.slice(0, -1))
        }
        if (fieldModalVisible) {
          setFieldModalVisible(false)
          setEditingField(null)
        }
      },
      [SHORTCUT_KEYS.PREVIEW]: () => {
        setPreviewVisible(true)
      },
      [SHORTCUT_KEYS.EXPORT]: () => {
        handleDownloadSchema()
      },
    },
    !readonly && !fieldModalVisible && !previewVisible,
  )
}
