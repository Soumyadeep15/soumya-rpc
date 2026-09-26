import { createRpc, RpcError } from '../src/index.ts'

const users = new Map([['1', { id: '1', name: 'Soumya' }]])

const rpc = await createRpc()

export const userService = rpc.service('user', {
  async getUser(id: string) {
    const user = users.get(id)
    if (!user) throw new RpcError('NOT_FOUND', `User ${id} not found`)
    return user
  },
  async createUser(name: string) {
    const user = { id: String(users.size + 1), name }
    users.set(user.id, user)
    return user
  },
})

export type UserService = typeof userService

console.log('user service ready')
