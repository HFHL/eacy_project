import { emptyTask } from './_empty'

export function createParseProgressWS() {
  return {
    close() {},
    send() {},
    addEventListener() {},
    removeEventListener() {},
  }
}

export async function pollParseProgress() {
  return emptyTask()
}

export default { createParseProgressWS, pollParseProgress }
