import { type ChannelModel, connect } from 'amqplib'

const MIN_DELAY = 500
const MAX_DELAY = 30_000

export interface ConnectionOptions {
  url: string
  onConnect(model: ChannelModel): Promise<void>
  onDisconnect(error: Error): void
  onError(error: Error): void
}

export interface Connection {
  close(): Promise<void>
}

export async function openConnection(options: ConnectionOptions): Promise<Connection> {
  const { url, onConnect, onDisconnect, onError } = options
  let model: ChannelModel | undefined
  let closed = false
  let cancelDelay = () => {}

  function delay(ms: number) {
    return new Promise<void>((resolve) => {
      const timer = setTimeout(resolve, ms)
      cancelDelay = () => {
        clearTimeout(timer)
        resolve()
      }
    })
  }

  function watch(next: ChannelModel) {
    next.on('error', ignore)
    next.once('close', (error?: Error) => {
      if (closed || model !== next) return
      model = undefined
      onDisconnect(describe(error ?? new Error('RabbitMQ connection closed')))
      void establish()
    })
  }

  async function establish() {
    for (let attempt = 0; !closed; attempt++) {
      try {
        const next = await connect(url)
        watch(next)
        await onConnect(next)
        model = next
        return
      } catch (error) {
        const wait = backoff(attempt)
        onError(new Error(`${describe(error).message}, retrying in ${wait}ms`, { cause: error }))
        await delay(wait)
      }
    }
  }

  await establish()

  return {
    async close() {
      closed = true
      cancelDelay()
      await model?.close().catch(ignore)
    },
  }
}

function backoff(attempt: number): number {
  const jitter = 0.8 + Math.random() * 0.4
  return Math.round(Math.min(MAX_DELAY, MIN_DELAY * 2 ** attempt) * jitter)
}

function describe(error: unknown): Error {
  if (!(error instanceof Error)) return new Error(String(error))
  if (error.message) return error
  const code = 'code' in error ? String(error.code) : 'unknown'
  return new Error(`RabbitMQ connection failed (${code})`, { cause: error })
}

function ignore() {}
