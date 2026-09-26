import { createTracker } from '../tracker.ts'
import type { ReplyListener, RequestHandler, Transport } from '../types.ts'

export function createMemoryTransport(): Transport {
  const routes = new Map<string, RequestHandler>()
  const listeners = new Set<ReplyListener>()
  const tracker = createTracker()
  let closed = false

  function broadcast(notify: (listener: ReplyListener) => void) {
    for (const listener of listeners) notify(listener)
  }

  return {
    async serve(queue, _concurrency, handle) {
      routes.set(queue, handle)
    },
    async send(queue, id, body) {
      const handle = closed ? undefined : routes.get(queue)
      if (!handle) {
        queueMicrotask(() => broadcast((listener) => listener.unroutable(id)))
        return
      }
      const work = handle(body).then((reply) => broadcast((listener) => listener.reply(id, reply)))
      tracker.track(work)
    },
    onReply(listener) {
      listeners.add(listener)
    },
    async close() {
      closed = true
      await tracker.idle()
    },
  }
}
