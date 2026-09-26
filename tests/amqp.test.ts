import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { createRpc, type Rpc } from '../src/index.ts'
import { type UserService, userMethods } from './fixtures.ts'

const url = process.env.AMQP_URL

describe.skipIf(!url)('amqp transport', () => {
  let rpc: Rpc

  beforeAll(async () => {
    rpc = await createRpc({ url, timeout: 2000 })
    rpc.service('test-user', userMethods, { concurrency: 5 })
    rpc.service('test-math').add('double', (n: number) => n * 2)
  })

  afterAll(() => rpc?.close())

  it('calls a service right after registering it', async () => {
    const users = rpc.connect<UserService>('test-user')
    await expect(users.getUser('1')).resolves.toEqual({ id: '1', name: 'Soumya' })
    await expect(users.notFound('2')).rejects.toMatchObject({
      code: 'NOT_FOUND',
      data: { id: '2' },
    })
  })

  it('calls functions added one by one', async () => {
    await expect(rpc.connect('test-math').double?.(21)).resolves.toBe(42)
  })

  it('processes calls concurrently up to the limit', async () => {
    const users = rpc.connect<UserService>('test-user')
    const started = Date.now()
    await Promise.all(Array.from({ length: 5 }, () => users.sleep(200)))
    expect(Date.now() - started).toBeLessThan(900)
  })

  it('rejects immediately when no service queue exists', async () => {
    const ghost = rpc.connect(`ghost-${Date.now()}`)
    await expect(ghost.anything?.()).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' })
  })
})
