import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createRpc, type Rpc } from '../src/index.ts'
import { type UserService, userMethods } from './fixtures.ts'

const url = process.env.AMQP_URL

describe.skipIf(!url)('amqp transport', () => {
  let server: Rpc
  let client: Rpc

  beforeAll(async () => {
    server = await createRpc({ url })
    client = await createRpc({ url, timeout: 2000 })
    server.service('test-user', userMethods, { concurrency: 5 })
    await new Promise((resolve) => setTimeout(resolve, 200))
  })

  afterAll(async () => {
    await client?.close()
    await server?.close()
  })

  it('round-trips through RabbitMQ', async () => {
    const users = client.connect<UserService>('test-user')
    await expect(users.getUser('1')).resolves.toEqual({ id: '1', name: 'Soumya' })
    await expect(users.notFound('2')).rejects.toMatchObject({
      code: 'NOT_FOUND',
      data: { id: '2' },
    })
  })

  it('processes calls concurrently up to the limit', async () => {
    const users = client.connect<UserService>('test-user')
    const started = Date.now()
    await Promise.all(Array.from({ length: 5 }, () => users.sleep(200)))
    expect(Date.now() - started).toBeLessThan(900)
  })

  it('rejects immediately when no service queue exists', async () => {
    const ghost = client.connect(`ghost-${Date.now()}`)
    await expect(ghost.anything?.()).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' })
  })
})
