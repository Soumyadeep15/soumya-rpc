import { RpcError } from './errors.ts'
import type { Request, Response } from './types.ts'

const encoder = new TextEncoder()
const decoder = new TextDecoder()

export const queueName = (service: string) => `rpc.${service}`

export function encodeRequest(method: string, args: unknown[]): Uint8Array {
  return encode({ method, args } satisfies Request)
}

export function decodeRequest(body: Uint8Array): Request {
  const request = decode(body)
  if (isRequest(request)) return request
  throw new RpcError('INVALID_REQUEST', 'Malformed request')
}

export function encodeResponse(response: Response): Uint8Array {
  return encode(response)
}

export function decodeResponse(body: Uint8Array): Response {
  const response = decode(body)
  if (isResponse(response)) return response
  return { ok: false, error: { code: 'INVALID_RESPONSE', message: 'Malformed response' } }
}

function encode(value: unknown): Uint8Array {
  return encoder.encode(JSON.stringify(value))
}

function decode(body: Uint8Array): unknown {
  try {
    return JSON.parse(decoder.decode(body))
  } catch {
    return undefined
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isRequest(value: unknown): value is Request {
  return isRecord(value) && typeof value.method === 'string' && Array.isArray(value.args)
}

function isResponse(value: unknown): value is Response {
  if (!isRecord(value)) return false
  return value.ok === true || (value.ok === false && isRecord(value.error))
}
