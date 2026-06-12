import { CSV_COLUMNS } from '../../core/constants.js'

export const LEVEL_HEADERS = [CSV_COLUMNS.LEVEL1, ...CSV_COLUMNS.LEVEL2_10]

export const HEADER_KEYWORDS = new Set([
  CSV_COLUMNS.FOLDER,
  '文件夹',
  CSV_COLUMNS.LEVEL1,
  '层级1',
  '层级2',
  CSV_COLUMNS.DISPLAY_TYPE,
  CSV_COLUMNS.DATA_TYPE,
])
