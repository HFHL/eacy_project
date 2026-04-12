import db from './src/db.js'
import app from './src/app.js'
import http from 'http'
import { randomUUID } from 'crypto'

async function run() {
  console.log('Inserting mock data...')
  const batchId = 'batch_001'

  // Clear existing
  db.exec(`DELETE FROM documents WHERE batch_id = 'batch_001'`)
  db.exec(`DELETE FROM patients WHERE name = '陆梦涵test'`)

  // Patient
  const patientId = randomUUID()
  const pMetadata = JSON.stringify({
    gender: '女',
    age: 12,
    birthDate: '2011-01-01',
    identifiers: [{ value: '123456' }]
  })
  db.prepare(`INSERT INTO patients (id, name, metadata) VALUES (?, ?, ?)`).run(patientId, '陆梦涵test', pMetadata)

  // Docs
  const ts = new Date().toISOString()
  const insertDoc = db.prepare(`
    INSERT INTO documents (id, patient_id, file_name, file_size, mime_type, object_key, status, batch_id, metadata, created_at, updated_at) 
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  // Doc A
  let metaA = JSON.stringify({ result: { '唯一标识符': [{ '标识符编号': 'ZY001' }] } })
  insertDoc.run('docA', null, 'docA.pdf', 100, 'application/pdf', 'a', 'metadata_succeeded', batchId, metaA, ts, ts)

  // Doc B
  let metaB = JSON.stringify({ result: { '唯一标识符': [{ '标识符编号': 'ZY001' }, { '标识符编号': '123456' }] } })
  insertDoc.run('docB', null, 'docB.pdf', 100, 'application/pdf', 'b', 'metadata_succeeded', batchId, metaB, ts, ts)

  // Doc C
  let metaC = JSON.stringify({ result: { '患者姓名': '陆梦涵test', '出生日期': '2011-01-01' } })
  insertDoc.run('docC', null, 'docC.pdf', 100, 'application/pdf', 'c', 'metadata_succeeded', batchId, metaC, ts, ts)

  // Doc D
  let metaD = JSON.stringify({ result: { '患者姓名': '陆梦涵test', '出生日期': '2011-01-01' } })
  insertDoc.run('docD', null, 'docD.pdf', 100, 'application/pdf', 'd', 'metadata_succeeded', batchId, metaD, ts, ts)

  // Doc E
  let metaE = JSON.stringify({ result: {} })
  insertDoc.run('docE', null, 'docE.pdf', 100, 'application/pdf', 'e', 'metadata_succeeded', batchId, metaE, ts, ts)


  // Start server
  const server = http.createServer(app)
  const port = 8081
  server.listen(port, async () => {
    try {
      console.log('Testing endpoint...')
      const res = await fetch(`http://localhost:${port}/api/v1/archive-batches/${batchId}/groups`)
      const data = await res.json()
      console.log(JSON.stringify(data, null, 2))
    } catch (err) {
      console.error(err)
    } finally {
      server.close()
      process.exit(0)
    }
  })
}

run()
