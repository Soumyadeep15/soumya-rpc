import { createClient } from './client.ts'
import { connectionLost, serviceUnavailable } from './errors.ts'
import { createPendingCalls, type PendingCalls } from './pending.ts'
import { decodeResponse, queueName } from './protocol.ts'
import { createHandler } from './service.ts'
import { createAmqpTransport } from './transport/amqp.ts'
import type { Middleware, ReplyListener, Rpc, RpcOptions } from './types.ts'

const DEFAULT_TIMEOUT = 10_000
const DEFAULT_CONCURRENCY = 10

export async function createRpc(options: RpcOptions = {}): Promise<Rpc> {
  const onError = options.onError ?? logError
  const url = options.url ?? process.env.AMQP_URL ?? 'amqp://localhost'
  const transport = options.transport ?? (await createAmqpTransport(url, onError))
  const defaultTimeout = options.timeout ?? DEFAULT_TIMEOUT
  const calls = createPendingCalls()
  const middleware: Middleware[] = []

  transport.onReply(createReplyListener(calls))

  return {
    service(name, methods, { concurrency = DEFAULT_CONCURRENCY } = {}) {
      const handler = createHandler(name, methods, middleware)
      transport.serve(queueName(name), concurrency, handler).catch(onError)
      return methods
    },
    connect(name, { timeout = defaultTimeout } = {}) {
      return createClient(name, { transport, calls, timeout })
    },
    use(fn) {
      middleware.push(fn)
    },
    async close() {
      await calls.close()
      await transport.close()
    },
  }
}

function createReplyListener(calls: PendingCalls): ReplyListener {
  return {
    reply: (id, body) => calls.settle(id, decodeResponse(body)),
    unroutable: (id) => calls.fail(id, serviceUnavailable),
    disconnect: () => calls.failAll(connectionLost),
  }
}

function logError(error: Error) {
  console.error('[soumya-rpc]', error)
}
