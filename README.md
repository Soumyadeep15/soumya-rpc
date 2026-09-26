# soumya-rpc

Dead-simple, fully typed RPC between microservices over RabbitMQ.

- **Tiny**: under 10 kB packed, a single dependency (`amqplib`)
- **Service-first**: a service is a plain object of functions, and clients call them like local functions
- **No setup**: no ports, no service discovery, no schemas, no code generation
- **Works everywhere**: Node ≥ 20.19 (ESM and `require`), Bun, TypeScript, and plain JavaScript
- **Production ready**: auto-reconnect, timeouts, typed remote errors, middleware, graceful shutdown

```sh
npm i soumya-rpc
```

## Quick start

You need a running RabbitMQ. Both apps connect to the same RabbitMQ URL; neither one opens a port or needs the other's address.

### 1. Provider: the app that owns the functions

```js
// user-service/index.js
import { createRpc, RpcError } from 'soumya-rpc'

const rpc = await createRpc({ url: 'amqp://localhost:5672' })

const userService = rpc.service('user')

userService.add('getUser', async (id) => {
  const user = await db.users.findById(id)
  if (!user) throw new RpcError('NOT_FOUND', 'User not found', { id })
  return user
})

userService.add('createUser', async (name, email) => {
  return db.users.insert({ name, email })
})

console.log('user service is running')
```

You can add functions from different files. Every `rpc.service('user')` with the same name adds to the same service. If you prefer, you can also pass all functions at once:

```js
rpc.service('user', {
  async getUser(id) { ... },
  async createUser(name, email) { ... },
})
```

### 2. Client: any other app that wants to call them

```js
// order-service/index.js
import { createRpc } from 'soumya-rpc'

const rpc = await createRpc({ url: 'amqp://localhost:5672' })

const users = rpc.connect('user')

const newUser = await users.createUser('Soumya', 'soumya@example.com')
const user = await users.getUser(newUser.id)

console.log(user)
```

The client calls `users.getUser(...)` as if it were a local async function. Behind the scenes the call travels through RabbitMQ to the provider, runs there, and the result comes back.

### 3. Run them

```sh
node user-service/index.js    # start the provider first
node order-service/index.js   # then the client
```

Rules to remember:

- The name in `rpc.connect('user')` must match the name in `rpc.service('user', ...)`.
- Method names must match exactly: `getUser` on the client calls `getUser` on the provider.
- Keep the provider running, like any backend service. Run several copies of it to handle more load; RabbitMQ shares the calls between them.
- Create one `rpc` per app and reuse it everywhere, for example by exporting it from its own file.

## API

### `createRpc(options?)`

| Option | Default | |
|---|---|---|
| `url` | `process.env.AMQP_URL` or `amqp://localhost` | RabbitMQ URL |
| `timeout` | `10000` | Default call timeout in ms |
| `concurrency` | `10` | Default number of calls each service handles at once |
| `onError` | logs to `console.error` | Receives connection and background errors |
| `transport` | RabbitMQ | Swap in a custom transport, e.g. `createMemoryTransport()` |

The returned promise resolves once the first connection is up. If RabbitMQ is unreachable, it keeps retrying with backoff and reports each attempt to `onError`.

### `rpc.service(name)`

Creates the service `name` (or returns more of it, if it already exists) and gives back an object with one method:

- `.add(functionName, fn)` makes `fn` callable by clients. It returns the service, so calls can be chained.

### `rpc.service(name, methods, { concurrency })`

Serves every function in `methods`, which can be an object or a class instance, under `name`. `concurrency` overrides the default for this service; it takes effect on the first registration of a name. Run more copies of the app to scale further: RabbitMQ spreads calls across them.

### `rpc.connect(name, { timeout })`

Returns a client for the service called `name`. Any method you call on it runs on the provider and returns a `Promise` with the result.

### `rpc.use(middleware)`

Wraps every served call, for logging, auth, metrics or tracing:

```js
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

```js
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

```js
import { createRpc } from 'soumya-rpc'
import { createMemoryTransport } from 'soumya-rpc/testing'

const rpc = await createRpc({ transport: createMemoryTransport() })
rpc.service('user', {
  async getUser(id) {
    return { id, name: 'Test user' }
  },
})
const users = rpc.connect('user')

await users.getUser('1') // { id: '1', name: 'Test user' }
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
