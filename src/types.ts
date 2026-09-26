export type AnyFunction = (...args: never[]) => unknown

export type Methods = Record<string, (...args: unknown[]) => unknown>

type MethodKeys<T> = {
  [K in keyof T]: K extends string ? (T[K] extends AnyFunction ? K : never) : never
}[keyof T]

type Remote<F> = F extends (...args: infer A) => infer R
  ? (...args: A) => Promise<Awaited<R>>
  : never

export type Client<T> = { readonly [K in MethodKeys<T>]: Remote<T[K]> }

export type ErrorCode =
  | 'TIMEOUT'
  | 'METHOD_NOT_FOUND'
  | 'SERVICE_UNAVAILABLE'
  | 'CONNECTION_LOST'
  | 'CLOSED'
  | 'INVALID_REQUEST'
  | 'INVALID_RESPONSE'
  | 'INTERNAL'
  | (string & {})

export interface Context {
  readonly service: string
  readonly method: string
  args: unknown[]
}

export type Handler = (context: Context) => Promise<unknown>

export type Middleware = (context: Context, next: () => Promise<unknown>) => Promise<unknown>

export interface RpcOptions {
  url?: string | undefined
  timeout?: number | undefined
  transport?: Transport | undefined
  onError?: ((error: Error) => void) | undefined
}

export interface ServiceOptions {
  concurrency?: number | undefined
}

export interface ConnectOptions {
  timeout?: number | undefined
}

export interface Rpc {
  service<T extends object>(name: string, methods: T, options?: ServiceOptions): T
  connect<T extends object = Methods>(name: string, options?: ConnectOptions): Client<T>
  use(middleware: Middleware): void
  close(): Promise<void>
}

export type RequestHandler = (body: Uint8Array) => Promise<Uint8Array>

export interface ReplyListener {
  reply(id: string, body: Uint8Array): void
  unroutable(id: string): void
  disconnect(): void
}

export interface Transport {
  serve(queue: string, concurrency: number, handle: RequestHandler): Promise<void>
  send(queue: string, id: string, body: Uint8Array, timeout: number): Promise<void>
  onReply(listener: ReplyListener): void
  close(): Promise<void>
}

export interface Request {
  method: string
  args: unknown[]
}

export interface SerializedError {
  code: ErrorCode
  message: string
  data?: unknown
}

export type Response = { ok: true; value?: unknown } | { ok: false; error: SerializedError }
