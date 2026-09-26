import type { ErrorCode, SerializedError } from './types.ts'

export class RpcError extends Error {
  override name = 'RpcError'
  readonly code: ErrorCode
  readonly data: unknown

  constructor(code: ErrorCode, message: string, data?: unknown) {
    super(message)
    this.code = code
    this.data = data
  }
}

export class TimeoutError extends RpcError {
  override name = 'TimeoutError'

  constructor(label: string, timeout: number) {
    super('TIMEOUT', `${label} timed out after ${timeout}ms`)
  }
}

export function serializeError(error: unknown): SerializedError {
  if (error instanceof RpcError)
    return { code: error.code, message: error.message, data: error.data }
  if (error instanceof Error) return { code: 'INTERNAL', message: error.message }
  return { code: 'INTERNAL', message: String(error) }
}

export function deserializeError({ code, message, data }: SerializedError): RpcError {
  return new RpcError(code, message, data)
}

export function toRpcError(error: unknown): RpcError {
  return error instanceof RpcError ? error : deserializeError(serializeError(error))
}

export const serviceUnavailable = (label: string) =>
  new RpcError('SERVICE_UNAVAILABLE', `No service is listening for ${label}`)

export const connectionLost = (label: string) =>
  new RpcError('CONNECTION_LOST', `Connection lost while calling ${label}`)

export const closed = (label: string) =>
  new RpcError('CLOSED', `Cannot call ${label}: rpc is closed`)
