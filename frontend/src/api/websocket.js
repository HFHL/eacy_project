/**
 * 本地模式下的 WebSocket 占位实现
 */

export class ParseProgressWebSocket {
  constructor(options = {}) {
    this.documentId = options.documentId || null
    this.onProgress = options.onProgress || (() => {})
    this.onConnect = options.onConnect || (() => {})
    this.onDisconnect = options.onDisconnect || (() => {})
  }

  connect() {
    this.onConnect()
  }

  disconnect() {
    this.onDisconnect()
  }

  send() {}

  queryProgress(documentId) {
    this.onProgress({ document_id: documentId, progress: 100, status: 'completed' })
  }

  setDocumentId(documentId) {
    this.documentId = documentId
  }
}

export function createParseProgressWS(options) {
  return new ParseProgressWebSocket(options)
}

export async function pollParseProgress(documentId) {
  return { document_id: documentId, progress: 100, status: 'completed' }
}

export default {
  ParseProgressWebSocket,
  createParseProgressWS,
  pollParseProgress
}

