export const createDefaultDesignData = () => ({
  meta: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: 'crf-template',
    title: 'CRF模版',
    version: '1.0.0',
    projectId: 'demo',
    createdAt: new Date().toISOString(),
  },
  folders: [],
  enums: {},
})
