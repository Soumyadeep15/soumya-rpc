import { createClient } from './client.ts'
import { connectionLost, serviceUnavailable } from './errors.ts'
import { createPendingCalls, type PendingCalls } from './pending.ts'
import { decodeResponse, queueName } from './protocol.ts'
import { createHandler } from './service.ts'
import { createTracker } from './tracker.ts'
import { createAmqpTransport } from './transport/amqp.ts'
import type {
  AnyFunction,
  Middleware,
  ReplyListener,
  Rpc,
  RpcOptions,
  Service,
  ServiceOptions,
} from './types.ts'

const DEFAULT_TIMEOUT = 10_000
const DEFAULT_CONCURRENCY = 10

export async function createRpc(options: RpcOptions = {}): Promise<Rpc> {
  const onError = options.onError ?? logError
  const url = options.url ?? process.env.AMQP_URL ?? 'amqp://localhost'
  const transport = options.transport ?? (await createAmqpTransport(url, onError))
  const defaultTimeout = options.timeout ?? DEFAULT_TIMEOUT
  const defaultConcurrency = options.concurrency ?? DEFAULT_CONCURRENCY
  const calls = createPendingCalls()
  const middleware: Middleware[] = []
  const registrations = createTracker()
  const services = new Map<string, object[]>()

  transport.onReply(createReplyListener(calls))

  function register(name: string, source: object, concurrency: number) {
    const existing = services.get(name)
    if (existing) {
      existing.push(source)
      return
    }
    const sources = [source]
    services.set(name, sources)
    const handler = createHandler(name, sources, middleware)
    registrations.track(transport.serve(queueName(name), concurrency, handler).catch(onError))
  }

  function service(name: string): Service
  function service<T extends object>(name: string, methods: T, options?: ServiceOptions): T
  function service(name: string, methods?: object, options: ServiceOptions = {}): object {
    if (methods) {
      register(name, methods, options.concurrency ?? defaultConcurrency)
      return methods
    }
    const added: Record<string, AnyFunction> = {}
    register(name, added, defaultConcurrency)
    const handle: Service = {
      add(method, fn) {
        added[method] = fn
        return handle
      },
    }
    return handle
  }

  return {
    service,
    connect(name, { timeout = defaultTimeout } = {}) {
      return createClient(name, { transport, calls, timeout, ready: registrations.idle })
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
