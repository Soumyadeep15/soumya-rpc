import { RpcError, serializeError } from './errors.ts'
import { compose } from './middleware.ts'
import { decodeRequest, encodeResponse } from './protocol.ts'
import type { AnyFunction, Handler, Middleware, RequestHandler } from './types.ts'

export function createHandler(
  service: string,
  sources: readonly object[],
  middleware: readonly Middleware[],
): RequestHandler {
  const invoke = createInvoker(sources)

  return async (body) => {
    try {
      const { method, args } = decodeRequest(body)
      const value = await compose(middleware, invoke)({ service, method, args })
      return encodeResponse({ ok: true, value })
    } catch (error) {
      return encodeResponse({ ok: false, error: serializeError(error) })
    }
  }
}

function createInvoker(sources: readonly object[]): Handler {
  return async ({ service, method, args }) => {
    if (method in Object.prototype) throw methodNotFound(service, method)
    for (const source of sources) {
      const fn = findMethod(source, method)
      if (fn) return Reflect.apply(fn, source, args)
    }
    throw methodNotFound(service, method)
  }
}

function findMethod(source: object, name: string): AnyFunction | undefined {
  const candidate: unknown = Reflect.get(source, name)
  return typeof candidate === 'function' ? (candidate as AnyFunction) : undefined
}

function methodNotFound(service: string, method: string) {
  return new RpcError('METHOD_NOT_FOUND', `${service}.${method} does not exist`)
}
