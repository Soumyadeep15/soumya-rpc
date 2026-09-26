import { randomUUID } from 'node:crypto'
import { toRpcError } from './errors.ts'
import type { PendingCalls } from './pending.ts'
import { encodeRequest, queueName } from './protocol.ts'
import type { Client, Transport } from './types.ts'

type Method = (...args: unknown[]) => Promise<unknown>

interface ClientContext {
  transport: Transport
  calls: PendingCalls
  timeout: number
}

export function createClient<T>(service: string, { transport, calls, timeout }: ClientContext) {
  const queue = queueName(service)
  const methods = new Map<string, Method>()

  function call(method: string, args: unknown[]): Promise<unknown> {
    const id = randomUUID()
    const body = encodeRequest(method, args)
    const result = calls.add(id, `${service}.${method}`, timeout)
    transport
      .send(queue, id, body, timeout)
      .catch((error) => calls.fail(id, () => toRpcError(error)))
    return result
  }

  function getMethod(name: string): Method {
    const existing = methods.get(name)
    if (existing) return existing
    const method: Method = (...args) => call(name, args)
    methods.set(name, method)
    return method
  }

  return new Proxy({} as Client<T>, {
    get: (_, name) => (typeof name === 'string' && name !== 'then' ? getMethod(name) : undefined),
  })
}
