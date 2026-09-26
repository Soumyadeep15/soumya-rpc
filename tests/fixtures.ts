import { RpcError } from '../src/index.ts'

export interface User {
  id: string
  name: string
}

export const userMethods = {
  getUser: async (id: string): Promise<User> => ({ id, name: 'Soumya' }),
  add: (a: number, b: number) => a + b,
  nothing: async () => undefined,
  notFound: async (id: string) => {
    throw new RpcError('NOT_FOUND', 'User not found', { id })
  },
  crash: async () => {
    throw new Error('boom')
  },
  sleep: (ms: number) => new Promise<string>((resolve) => setTimeout(() => resolve('awake'), ms)),
}

export type UserService = typeof userMethods
