// index.d.ts

/** Options for setting a value in the store. */
export interface SetOptions {
  /**
   * Time-to-live in seconds.
   * - If `expiresAt` is provided, it takes precedence over `ttl`.
   * - If `ttl <= 0`, the key is considered immediately expired.
   */
  ttl?: number;

  /**
   * Absolute expiration time as a Unix timestamp in **milliseconds**.
   * This option always takes precedence over `ttl` when provided.
   */
  expiresAt?: number;
}

/** Options for connecting to a store. */
export interface StoreOptions {
  /**
   * Enable periodic automatic deletion of expired entries.
   * - `true`: sweep every 60 seconds (default interval)
   * - `{ interval: n }`: sweep every `n` seconds
   *
   * A sweep also runs immediately when the store is connected.
   * In multi-tab environments, the Web Locks API (when available)
   * ensures only one tab performs the sweep at a time.
   */
  autoCleanup?: boolean | { interval?: number };
}

/**
 * A typed interface for an IndexedDB-backed key-value store.
 * Use the generic parameter `T` to define the value type stored in this object store.
 */
export interface Store<T = any> {
  /**
   * Get a value by key. Returns `undefined` if the key does not exist
   * or is expired at read time. Reading an expired key also physically
   * deletes it in the background (lazy deletion).
   */
  get(key: IDBValidKey): Promise<T | undefined>;

  /**
   * Set a value by key.
   * - `ttl` is in **seconds**.
   * - `expiresAt` is a **ms** timestamp and has priority over `ttl`.
   * - If neither is provided, the key is stored without expiration.
   */
  set(key: IDBValidKey, value: T, options?: SetOptions): Promise<void>;

  /** Delete a single key. */
  del(key: IDBValidKey): Promise<void>;

  /** Get all **non-expired** values. */
  getAll(): Promise<T[]>;

  /** Get all keys for **non-expired** entries, returned as strings. */
  keys(): Promise<string[]>;

  /** Delete all entries in the store. */
  delAll(): Promise<void>;

  /**
   * Get a field from an object value.
   * Returns `undefined` if the key does not exist, is expired,
   * the stored value is not an object, or the field is not present.
   */
  hget<F extends string = string>(
    key: IDBValidKey,
    field: F
  ): Promise<any | undefined>;

  /**
   * Set a field on an existing object value.
   * Rejects if the stored value is not an object.
   * Preserves the existing `expiresAt` if present.
   */
  hset<F extends string = string>(
    key: IDBValidKey,
    field: F,
    fieldValue: any
  ): Promise<void>;

  /**
   * Delete a field from an existing object value.
   * Returns:
   * - `true` if a field was removed,
   * - `false` if the key/value is missing or not an object, or the field does not exist.
   * Preserves the existing `expiresAt` if present.
   */
  hdel<F extends string = string>(key: IDBValidKey, field: F): Promise<boolean>;

  /**
   * TTL in **seconds** for the given key.
   * Returns:
   * - `-2` if the key does not exist,
   * - `-1` if the key exists but has **no expiration**,
   * - `0` if the key is **expired** (the key is also lazily deleted),
   * - a positive number for the remaining seconds otherwise (rounded up).
   */
  ttl(key: IDBValidKey): Promise<number>;

  /**
   * Immediately delete all expired entries (active expiration).
   * Uses the `expiresAt` index, so cost is proportional to the number
   * of expired records only — no full scan.
   * @returns the number of deleted records
   */
  cleanupExpired(): Promise<number>;

  /**
   * Start periodic automatic cleanup. Runs one sweep immediately,
   * then repeats every `intervalSec` seconds.
   * Calling it again replaces the existing timer.
   * @param intervalSec sweep interval in seconds (default: 60)
   */
  startAutoCleanup(intervalSec?: number): void;

  /** Stop the automatic cleanup timer. */
  stopAutoCleanup(): void;
}

/**
 * A database handle that can connect/open individual object stores on-demand.
 */
export interface Database {
  /**
   * Connect to (and lazily create) an object store. If the store or its
   * `expiresAt` index does not exist, the database version is bumped and
   * they are created automatically (existing v2 stores are migrated).
   */
  connectStore<T = any>(
    storeName: string,
    options?: StoreOptions
  ): Promise<Store<T>>;
}

/**
 * Open (or create) an IndexedDB database and return a handle
 * with which you can connect to individual stores.
 *
 * @param dbName The IndexedDB database name.
 */
export function connectDB(dbName: string): Promise<Database>;

export type { IDBValidKey };
