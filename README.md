# IndexedDB TTL Store

A lightweight wrapper for IndexedDB that provides a Redis-like key-value API with TTL (time-to-live) support.

## Features

- Key-value storage with **expiration (TTL)**
- Redis-like commands: `get`, `set`, `del`, `keys`, `ttl`, `getAll`, `delAll`
- Hash-like methods: `hget`, `hset`, `hdel`
- Automatic object store creation if missing
- TypeScript support (`index.d.ts` included)

## Installation

```bash
npm install yosie
```

## Usage

```ts
import { connectDB } from "yosie";

async function demo() {
  // Connect to a database
  const db = await connectDB("mydb");

  // Connect to a store (auto-creates if missing)
  const store = await db.connectStore("mystore");

  // Set with TTL of 10 seconds
  await store.set("foo", "bar", { ttl: 10 });

  // Get value
  const val = await store.get("foo"); // "bar"

  // TTL check
  const ttl = await store.ttl("foo"); // e.g., 8 (seconds left)

  // Delete key
  await store.del("foo");
}
```

## API

### `connectDB(dbName: string): Promise<Database>`
Connect (or create) an IndexedDB database.

### `Database.connectStore(storeName: string): Promise<Store>`
Connect to (or create) an object store.

### Store Methods

- `get(key)` → value or `undefined`
- `set(key, value, { ttl?, expiresAt? })` → void
  - `ttl`: seconds (≤ 0 means immediate expiration)
  - `expiresAt`: absolute ms timestamp (takes precedence over `ttl`)
- `del(key)` → void
- `getAll()` → all non-expired values
- `keys()` → all keys of non-expired values
- `delAll()` → void
- `hget(key, field)` → field value from stored object
- `hset(key, field, value)` → set field in object
- `hdel(key, field)` → delete field in object
- `ttl(key)` → number
  - `-2`: key does not exist
  - `-1`: key exists but has no expiration
  - `0`: key expired
  - `> 0`: seconds remaining

## License

MIT
