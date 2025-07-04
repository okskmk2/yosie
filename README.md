# yosie

> A minimal IndexedDB wrapper with TTL support and Redis-style hash operations – built for the browser.

**yosie** is a lightweight and developer-friendly wrapper around IndexedDB that enables key-value storage, automatic expiration with TTL, and convenient hash-like operations such as `hset`, `hget`, and `hdel`.

---

## ✨ Features

- ✅ Easy key-value storage in the browser
- ⏳ Built-in TTL (Time-To-Live) expiration support
- 🧩 Hash-style operations (`hget`, `hset`, `hdel`)
- 🧹 Utility methods for working with keys and values (`getAll`, `keys`, `clear`)
- 🦺 TypeScript support with included type definitions

---

## 📦 Installation

```bash
npm install yosie
```

---

## 🚀 Quick Start

### 1. Connect to a database and store

```ts
import connectDB from 'yosie';

const db = await connectDB('my-database');
const store = await db.connectStore('my-store');
```

### 2. Set and get values

```ts
await store.set('username', 'Alice');

const username = await store.get('username'); // 'Alice'
```

### 3. Set with TTL (e.g., 10 seconds)

```ts
await store.set('session', { token: 'abc123' }, { ttlMs: 10_000 });
```

### 4. Work with hash-style values

```ts
await store.hset('user', 'name', 'Alice');
await store.hset('user', 'age', 30);

const name = await store.hget('user', 'name'); // 'Alice'
await store.hdel('user', 'age');
```

### 5. Utility functions

```ts
const keys = await store.keys();     // ['username', 'session', ...]
const values = await store.getAll(); // All valid (non-expired) values

await store.del('username');         // Delete a key
await store.delAll();                // Clear all data from the store
```

---

## 🧩 API Reference

### `connectDB(dbName: string): Promise<DBConnection>`
Creates or opens the IndexedDB database with the given name.

### `DBConnection.connectStore(storeName: string): Promise<Store>`
Connects to the given object store. If it doesn’t exist, it will be created automatically.

---

### `Store` Methods

| Method                    | Description                                                         |
|---------------------------|---------------------------------------------------------------------|
| `get(key)`                | Retrieves the value associated with the given key                  |
| `set(key, value, config)` | Stores a value with optional TTL (`{ ttlMs: number }`)             |
| `del(key)`                | Deletes a specific key                                              |
| `getAll()`                | Returns all valid (non-expired) values in the store                |
| `keys()`                  | Returns all valid keys                                              |
| `delAll()`                | Clears the entire store                                             |
| `hget(key, field)`        | Gets a specific field from a stored object                          |
| `hset(key, field, value)` | Sets a specific field in a stored object                            |
| `hdel(key, field)`        | Deletes a specific field from a stored object                       |

---

## 📐 TypeScript Support

`yosie` includes full type definitions. Example:

```ts
const user = await store.get<{ name: string }>('user');
console.log(user?.name); // Type-safe access
```

---

## 🧪 Testing

> Coming soon: Tests will be added using Jest or Vitest.

---

## 📄 License

MIT License  
Copyright © 2025  
Author: Eunsung Lee

---

## 🤝 Contributing

Pull requests are welcome! If you have suggestions or improvements, feel free to open an issue or submit a PR.

---

## 🌐 Example: Using yosie via CDN in a Web Page

You can use `yosie` directly in a browser using a CDN like jsDelivr:

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0"/>
  <title>Yosie Example</title>
</head>
<body>
  <script type="module">
    import { connectDB } from 'https://cdn.jsdelivr.net/npm/yosie/+esm';
    (async () => {
      const db = await connectDB('MyDB');
      const store = await db.connectStore('MyStore');

      await store.set('key1', 'hello world', { ttlMs: 3000 });
      await store.set('key2', 'hello231 world', { ttlMs: 3000 });

      const value1 = await store.get('key1');
      console.log(value1); // "hello world" or undefined if expired

      const value2 = await store.getAll();
      console.log(value2); // Array of all non-expired values
    })();
  </script>
</body>
</html>
```

This approach is useful for quick demos, JSFiddle/CodePen, or CDN-based web apps.