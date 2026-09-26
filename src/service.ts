import { RpcError, serializeError } from './errors.ts'
import { compose } from './middleware.ts'
import { decodeRequest, encodeResponse } from './protocol.ts'
import type { AnyFunction, Handler, Middleware, RequestHandler } from './types.ts'

export function createHandler(
  service: string,
  methods: object,
  middleware: readonly Middleware[],
): RequestHandler {
  const invoke = createInvoker(methods)

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

function createInvoker(methods: object): Handler {
  return async ({ service, method, args }) => {
    const fn = findMethod(methods, method)
    if (!fn) throw new RpcError('METHOD_NOT_FOUND', `${service}.${method} does not exist`)
    return Reflect.apply(fn, methods, args)
  }
}

function findMethod(methods: object, name: string): AnyFunction | undefined {
  if (name in Object.prototype) return undefined
  const candidate: unknown = Reflect.get(methods, name)
  return typeof candidate === 'function' ? (candidate as AnyFunction) : undefined
}
