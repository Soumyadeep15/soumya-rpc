import type { Channel, ChannelModel, ConsumeMessage } from 'amqplib'
import { openConnection } from '../connection.ts'
import { createSlot } from '../slot.ts'
import { createTracker } from '../tracker.ts'
import type { ReplyListener, RequestHandler, Transport } from '../types.ts'

const REPLY_QUEUE = 'amq.rabbitmq.reply-to'

interface Route {
  queue: string
  concurrency: number
  handle: RequestHandler
  boundTo?: ChannelModel
}

interface Consumer {
  channel: Channel
  tag: string
}

const ignore = () => undefined

export async function createAmqpTransport(
  url: string,
  onError: (error: Error) => void,
): Promise<Transport> {
  const routes: Route[] = []
  const consumers: Consumer[] = []
  const client = createSlot<Channel>()
  const tracker = createTracker()
  let replies: ReplyListener | undefined
  let current: ChannelModel | undefined
  let closing = false

  async function openChannel(model: ChannelModel): Promise<Channel> {
    const channel = await model.createChannel()
    channel.on('error', onError)
    channel.on('close', () => {
      if (!closing && current === model) model.close().catch(ignore)
    })
    return channel
  }

  async function openClient(model: ChannelModel): Promise<Channel> {
    const channel = await openChannel(model)
    channel.on('return', (message) => replies?.unroutable(message.properties.correlationId))
    await channel.consume(
      REPLY_QUEUE,
      (message) => message && replies?.reply(message.properties.correlationId, message.content),
      { noAck: true },
    )
    return channel
  }

  async function bind(model: ChannelModel, route: Route) {
    if (route.boundTo === model) return
    route.boundTo = model
    const channel = await openChannel(model)
    await channel.assertQueue(route.queue, { durable: true })
    await channel.prefetch(route.concurrency)
    const { consumerTag } = await channel.consume(route.queue, (message) => {
      if (message) tracker.track(respond(channel, message, route.handle))
    })
    consumers.push({ channel, tag: consumerTag })
  }

  async function setup(model: ChannelModel) {
    current = model
    consumers.length = 0
    const channel = await openClient(model)
    for (const route of routes) await bind(model, route)
    client.set(channel)
  }

  const connection = await openConnection({
    url,
    onConnect: setup,
    onDisconnect(error) {
      current = undefined
      client.clear()
      onError(error)
      replies?.disconnect()
    },
    onError,
  })

  return {
    async serve(queue, concurrency, handle) {
      const route: Route = { queue, concurrency, handle }
      routes.push(route)
      if (current) await bind(current, route)
    },
    async send(queue, id, body, timeout) {
      const channel = await client.get()
      channel.sendToQueue(queue, Buffer.from(body), {
        correlationId: id,
        replyTo: REPLY_QUEUE,
        mandatory: true,
        expiration: String(timeout),
      })
    },
    onReply(listener) {
      replies = listener
    },
    async close() {
      closing = true
      await Promise.all(consumers.map(({ channel, tag }) => channel.cancel(tag).catch(ignore)))
      await tracker.idle()
      await connection.close()
    },
  }
}

async function respond(channel: Channel, message: ConsumeMessage, handle: RequestHandler) {
  const body = await handle(message.content)
  const { replyTo, correlationId } = message.properties
  try {
    if (replyTo) channel.sendToQueue(replyTo, Buffer.from(body), { correlationId })
    channel.ack(message)
  } catch {
    // The channel died mid-request; RabbitMQ redelivers the unacked message after recovery.
  }
}
