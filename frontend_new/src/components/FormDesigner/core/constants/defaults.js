export const FILE_TYPES = {
  IMAGE: { value: 'image', label: '图片', accept: 'image/*' },
  PDF: { value: 'pdf', label: 'PDF', accept: '.pdf' },
  DICOM: { value: 'dicom', label: 'DICOM影像', accept: '.dcm,.dicom' },
  PATHOLOGY: { value: 'pathology', label: '病理切片', accept: '.svs,.scn,.ndpi' },
  ANY: { value: 'any', label: '任意文件', accept: '*' },
}

export const DEFAULT_CONFIG = {
  group: {
    repeatable: false,
    isExtractionUnit: true,
  },
  table: {
    multiRow: true,
  },
  field: {
    nullable: true,
    editable: true,
    sensitive: false,
    primary: false,
  },
}

export const CONFLICT_POLICIES = {
  PREFER_PRIMARY: 'prefer_primary',
  PREFER_LATEST: 'prefer_latest',
  PREFER_EARLIEST: 'prefer_earliest',
  KEEP_ALL: 'keep_all',
  KEEP_FIRST: 'keep_first',
  MANUAL: 'manual',
  APPEND_MERGE: 'append_merge',
  EVOLUTION: 'evolution',
}

export const CONFLICT_POLICY_LABELS = {
  [CONFLICT_POLICIES.PREFER_PRIMARY]: '优先主要来源',
  [CONFLICT_POLICIES.PREFER_LATEST]: '优先最新值',
  [CONFLICT_POLICIES.PREFER_EARLIEST]: '优先最早值',
  [CONFLICT_POLICIES.KEEP_ALL]: '保留所有值',
  [CONFLICT_POLICIES.KEEP_FIRST]: '保留首次值',
  [CONFLICT_POLICIES.MANUAL]: '手动确认',
  [CONFLICT_POLICIES.APPEND_MERGE]: '追加合并',
  [CONFLICT_POLICIES.EVOLUTION]: '值演变追踪',
}

export const COMPARE_TYPES = {
  STRICT: 'strict',
  NORMALIZED: 'normalized',
  NUMERIC_TOLERANCE: 'numeric_tolerance',
}

export const COMPARE_TYPE_LABELS = {
  [COMPARE_TYPES.STRICT]: '严格比较',
  [COMPARE_TYPES.NORMALIZED]: '标准化比较',
  [COMPARE_TYPES.NUMERIC_TOLERANCE]: '数值容差',
}

export const VALIDATION_TYPES = {
  MIN_LENGTH: 'minLength',
  MAX_LENGTH: 'maxLength',
  MIN: 'min',
  MAX: 'max',
  PATTERN: 'pattern',
}

export const PANEL_CONFIG = {
  leftPanel: {
    defaultWidth: 240,
    minWidth: 200,
    maxWidth: 320,
  },
  centerPanel: {
    minWidth: 600,
  },
  rightPanel: {
    defaultWidth: 360,
    minWidth: 300,
    maxWidth: 450,
  },
}

export const DND_TYPES = {
  FIELD: 'field',
  COMPONENT: 'component',
  GROUP: 'group',
}

export const FIELD_CATEGORIES = {
  SINGLE: 'single',
  FORM: 'form',
}

export const VERSION_CONFIG = {
  uidPrefix: 'f_',
  uidLength: 8,
  versionFormat: 'semver',
}

export const SHORTCUTS = {
  SAVE: 'ctrl+s',
  UNDO: 'ctrl+z',
  REDO: 'ctrl+y',
  COPY: 'ctrl+c',
  PASTE: 'ctrl+v',
  DELETE: 'delete',
  MOVE_UP: 'arrowup',
  MOVE_DOWN: 'arrowdown',
}
