import { closed, deserializeError, type RpcError, TimeoutError } from './errors.ts'
import { createTracker } from './tracker.ts'
import type { Response } from './types.ts'

type ErrorFactory = (label: string) => RpcError

interface Call {
  label: string
  timer: ReturnType<typeof setTimeout>
  resolve(value: unknown): void
  reject(error: RpcError): void
}

export interface PendingCalls {
  add(id: string, label: string, timeout: number): Promise<unknown>
  settle(id: string, response: Response): void
  fail(id: string, createError: ErrorFactory): void
  failAll(createError: ErrorFactory): void
  close(): Promise<void>
}

export function createPendingCalls(): PendingCalls {
  const calls = new Map<string, Call>()
  const tracker = createTracker()
  let isClosed = false

  function take(id: string): Call | undefined {
    const call = calls.get(id)
    if (!call) return undefined
    calls.delete(id)
    clearTimeout(call.timer)
    return call
  }

  function fail(id: string, createError: ErrorFactory) {
    const call = take(id)
    call?.reject(createError(call.label))
  }

  return {
    add(id, label, timeout) {
      if (isClosed) return Promise.reject(closed(label))
      const result = new Promise((resolve, reject) => {
        const timer = setTimeout(() => fail(id, () => new TimeoutError(label, timeout)), timeout)
        calls.set(id, { label, timer, resolve, reject })
      })
      tracker.track(result)
      return result
    },
    settle(id, response) {
      const call = take(id)
      if (!call) return
      if (response.ok) call.resolve(response.value)
      else call.reject(deserializeError(response.error))
    },
    fail,
    failAll(createError) {
      for (const id of [...calls.keys()]) fail(id, createError)
    },
    async close() {
      isClosed = true
      await tracker.idle()
    },
  }
}
