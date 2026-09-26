import { expect, test } from 'bun:test'
import { createRpc } from '../../src/index.ts'
import { createMemoryTransport } from '../../src/testing.ts'
import { type UserService, userMethods } from '../fixtures.ts'

test('works on bun', async () => {
  const rpc = await createRpc({ transport: createMemoryTransport() })
  rpc.service('user', userMethods)
  const users = rpc.connect<UserService>('user')
  expect(await users.add(20, 22)).toBe(42)
  expect(users.notFound('x')).rejects.toMatchObject({ code: 'NOT_FOUND' })
  await rpc.close()
})
