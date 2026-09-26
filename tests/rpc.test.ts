import { afterEach, describe, expect, it } from 'vitest'
import { createRpc, type Rpc, RpcError, TimeoutError } from '../src/index.ts'
import { createMemoryTransport } from '../src/testing.ts'
import { type UserService, userMethods } from './fixtures.ts'

let rpc: Rpc

async function setup(timeout?: number) {
  rpc = await createRpc({ transport: createMemoryTransport(), ...(timeout && { timeout }) })
  rpc.service('user', userMethods)
  return rpc.connect<UserService>('user')
}

afterEach(() => rpc.close())

describe('rpc', () => {
  it('calls a remote method and returns its value', async () => {
    const users = await setup()
    await expect(users.getUser('42')).resolves.toEqual({ id: '42', name: 'Soumya' })
  })

  it('passes multiple arguments and supports sync methods', async () => {
    const users = await setup()
    await expect(users.add(2, 3)).resolves.toBe(5)
  })

  it('returns undefined for void methods', async () => {
    const users = await setup()
    await expect(users.nothing()).resolves.toBeUndefined()
  })

  it('rethrows RpcError with code and data', async () => {
    const users = await setup()
    const error = await users.notFound('7').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(RpcError)
    expect(error).toMatchObject({ code: 'NOT_FOUND', message: 'User not found', data: { id: '7' } })
  })

  it('wraps unknown errors as INTERNAL', async () => {
    const users = await setup()
    await expect(users.crash()).rejects.toMatchObject({ code: 'INTERNAL', message: 'boom' })
  })

  it('rejects unknown methods', async () => {
    await setup()
    const loose = rpc.connect('user')
    await expect(loose.missing?.()).rejects.toMatchObject({ code: 'METHOD_NOT_FOUND' })
    await expect(loose.toString?.()).rejects.toMatchObject({ code: 'METHOD_NOT_FOUND' })
  })

  it('rejects when no service is listening', async () => {
    await setup()
    const ghost = rpc.connect('ghost')
    await expect(ghost.anything?.()).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' })
  })

  it('times out slow calls', async () => {
    const users = await setup(20)
    const error = await users.sleep(200).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(TimeoutError)
    expect(error).toMatchObject({ code: 'TIMEOUT', message: 'user.sleep timed out after 20ms' })
  })

  it('allows per-client timeouts', async () => {
    await setup()
    const users = rpc.connect<UserService>('user', { timeout: 10 })
    await expect(users.sleep(100)).rejects.toMatchObject({ code: 'TIMEOUT' })
  })

  it('runs middleware in order around the handler', async () => {
    const users = await setup()
    const trail: string[] = []
    rpc.use(async (context, next) => {
      trail.push(`a:${context.service}.${context.method}`)
      const result = await next()
      trail.push('a:after')
      return result
    })
    rpc.use(async (context, next) => {
      trail.push('b')
      context.args = [10, 20]
      return next()
    })
    await expect(users.add(1, 1)).resolves.toBe(30)
    expect(trail).toEqual(['a:user.add', 'b', 'a:after'])
  })

  it('lets middleware reject calls', async () => {
    const users = await setup()
    rpc.use(async () => {
      throw new RpcError('UNAUTHORIZED', 'nope')
    })
    await expect(users.add(1, 1)).rejects.toMatchObject({ code: 'UNAUTHORIZED' })
  })

  it('serves class instances', async () => {
    rpc = await createRpc({ transport: createMemoryTransport() })
    class Greeter {
      prefix = 'Hi'
      greet(name: string) {
        return `${this.prefix} ${name}`
      }
    }
    const greeter = rpc.service('greeter', new Greeter())
    const client = rpc.connect<typeof greeter>('greeter')
    await expect(client.greet('Soumya')).resolves.toBe('Hi Soumya')
  })

  it('can be awaited or spread without hanging', async () => {
    const users = await setup()
    expect(await Promise.resolve(users)).toBe(users)
  })

  it('drains in-flight calls on close and rejects new ones', async () => {
    const users = await setup()
    const inFlight = users.sleep(20)
    await rpc.close()
    await expect(inFlight).resolves.toBe('awake')
    await expect(users.add(1, 2)).rejects.toMatchObject({ code: 'CLOSED' })
  })

  it('connects two rpc instances over a shared transport', async () => {
    const transport = createMemoryTransport()
    const server = await createRpc({ transport })
    rpc = await createRpc({ transport })
    server.service('user', userMethods)
    await expect(rpc.connect<UserService>('user').add(4, 4)).resolves.toBe(8)
    await server.close()
  })
})
