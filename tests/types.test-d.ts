import { expectTypeOf, test } from 'vitest'
import type { Client } from '../src/index.ts'
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
