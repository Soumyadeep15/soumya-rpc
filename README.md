# soumya-rpc

Dead-simple, fully typed RPC between microservices over RabbitMQ.

- **Tiny**: under 10 kB packed, a single dependency (`amqplib`)
- **Service-first**: a service is a plain object of functions, and clients call them like local functions
- **Typed end to end**: argument and return types flow from server to client with no codegen and no schemas
- **Works everywhere**: Node ≥ 20.19 (ESM and `require`), Bun, TypeScript, and plain JavaScript
- **Production ready**: auto-reconnect, timeouts, typed remote errors, middleware, graceful shutdown

```sh
npm i soumya-rpc
```

## Quick start

**user-service** defines the service:

```ts
import { createRpc, RpcError } from 'soumya-rpc'

const rpc = await createRpc({ url: 'amqp://localhost' })

export const userService = rpc.service('user', {
  async getUser(id: string) {
    const user = await db.users.find(id)
    if (!user) throw new RpcError('NOT_FOUND', 'User not found', { id })
    return user
  },
  async createUser(name: string, email: string) {
    return db.users.insert({ name, email })
  },
})

export type UserService = typeof userService
```

**order-service** calls it:

```ts
import { createRpc } from 'soumya-rpc'
import type { UserService } from '@acme/user-service'

const rpc = await createRpc({ url: 'amqp://localhost' })
const users = rpc.connect<UserService>('user')

const user = await users.getUser('42')
```

`import type` pulls in only the types, so none of the user service's code is loaded. If your services live in separate repos, publish the `UserService` type in a small shared types package.

## API

### `createRpc(options?)`

| Option | Default | |
|---|---|---|
| `url` | `process.env.AMQP_URL` or `amqp://localhost` | RabbitMQ URL |
| `timeout` | `10000` | Default call timeout in ms |
| `onError` | logs to `console.error` | Receives connection and background errors |
| `transport` | RabbitMQ | Swap in a custom transport, e.g. `createMemoryTransport()` |

The returned promise resolves once the first connection is up. If RabbitMQ is unreachable, it keeps retrying with backoff and reports each attempt to `onError`.

### `rpc.service(name, methods, { concurrency })`

Serves `methods`, which can be an object or a class instance, under `name`. `concurrency` (default `10`) is how many calls a single instance processes at once. Run more instances of the service to scale: RabbitMQ spreads calls across them.

### `rpc.connect<T>(name, { timeout })`

Returns a client whose methods mirror `T`, each returning a `Promise`.

### `rpc.use(middleware)`

Wraps every served call, for logging, auth, metrics or tracing:

```ts
rpc.use(async (ctx, next) => {
  const started = Date.now()
  try {
    return await next()
  } finally {
    console.log(`${ctx.service}.${ctx.method} took ${Date.now() - started}ms`)
  }
})
```

### `rpc.close()`

Waits for in-flight calls on both sides to finish, then disconnects. Calls made after `close()` reject with `CLOSED`.

## Errors

Every failed call rejects with an `RpcError` that has a `code`, a `message` and optional `data`. Errors you throw in a service keep their `code` and `data` on the client, so you can check them directly:

```ts
try {
  await users.getUser('404')
} catch (error) {
  if (error instanceof RpcError && error.code === 'NOT_FOUND') {
    // handle it
  }
}
```

| Code | Meaning |
|---|---|
| `TIMEOUT` | No reply within the timeout (thrown as a `TimeoutError`) |
| `SERVICE_UNAVAILABLE` | No queue exists for that service, because it has never been started |
| `METHOD_NOT_FOUND` | The service has no method with that name |
| `CONNECTION_LOST` | The connection dropped while the call was waiting for a reply |
| `CLOSED` | The call was made after `rpc.close()` |
| `INTERNAL` | The service threw something that isn't an `RpcError` |

## Testing without RabbitMQ

```ts
import { createRpc } from 'soumya-rpc'
import { createMemoryTransport } from 'soumya-rpc/testing'

const rpc = await createRpc({ transport: createMemoryTransport() })
rpc.service('user', userMethods)
const users = rpc.connect<typeof userMethods>('user')
```

## How it works

- Each service consumes a durable queue named `rpc.<name>`, and the prefetch limit controls its concurrency.
- Clients publish to that queue and receive replies through RabbitMQ's [Direct Reply-To](https://www.rabbitmq.com/docs/direct-reply-to), so no temporary queues are created.
- Requests are published with `mandatory: true`, so a call to a service that doesn't exist fails immediately instead of timing out.
- Each request expires when its timeout does, so a service never works on a call its caller has already given up on.
- Arguments and return values are sent as JSON. Use plain data: a `Date`, for example, arrives as a string.

## Development

```sh
npm test                      # unit tests (in-memory)
docker compose up -d          # or a local RabbitMQ
AMQP_URL=amqp://localhost npm test   # plus integration tests
npm run test:bun
npm run build
```
