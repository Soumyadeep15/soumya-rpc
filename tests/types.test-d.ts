import { expectTypeOf, test } from 'vitest'
import type { Client, Rpc, Service } from '../src/index.ts'
import type { User, UserService } from './fixtures.ts'

test('client methods are promisified with the same arguments', () => {
  type Users = Client<UserService>
  expectTypeOf<Users['getUser']>().toEqualTypeOf<(id: string) => Promise<User>>()
  expectTypeOf<Users['add']>().toEqualTypeOf<(a: number, b: number) => Promise<number>>()
  expectTypeOf<Users['sleep']>().returns.toEqualTypeOf<Promise<string>>()
})

test('non-function properties are dropped', () => {
  type Mixed = Client<{ version: string; ping(): 'pong' }>
  expectTypeOf<keyof Mixed>().toEqualTypeOf<'ping'>()
})

test('service returns a handle without methods and the methods object otherwise', () => {
  const rpc = {} as Rpc
  expectTypeOf(rpc.service('math')).toEqualTypeOf<Service>()
  expectTypeOf(rpc.service('math').add('double', (n: number) => n * 2)).toEqualTypeOf<Service>()
  const methods = { ping: () => 'pong' as const }
  expectTypeOf(rpc.service('ping', methods)).toEqualTypeOf<typeof methods>()
})
