import { createRpc } from '../src/index.ts'
import type { UserService } from './user-service.ts'

const rpc = await createRpc()
const users = rpc.connect<UserService>('user')

const created = await users.createUser('Joy')
console.log('created', created)
console.log('fetched', await users.getUser(created.id))

await users.getUser('404').catch((error) => console.log('failed', error.code, error.message))

await rpc.close()
