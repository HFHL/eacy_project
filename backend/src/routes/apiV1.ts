import { Router } from 'express'
import { notImplemented } from './notImplemented.js'
import documentsRouter from './documents.js'
import archiveBatchesRouter from './archiveBatches.js'

const router = Router()

router.get('/health', (_req, res) => {
  res.json({
    success: true,
    code: 0,
    message: 'backend running',
    data: { service: 'eacy-backend', version: '0.1.0' }
  })
})

router.use('/auth', notImplemented('认证模块'))
router.use('/users', notImplemented('用户模块'))
import patientsRouter from './patients.js'
import ehrDataRouter from './ehrData.js'

router.use('/patients', patientsRouter)
router.use('/patients', ehrDataRouter)
router.use('/documents', documentsRouter)
router.use('/archive-batches', archiveBatchesRouter)
router.use('/projects', notImplemented('项目模块'))
router.use('/crf-templates', notImplemented('CRF模板模块'))
router.use('/stats', notImplemented('统计模块'))

export default router
