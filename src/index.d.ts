export interface Store {
    get<T = any>(key: string): Promise<T | undefined>;
    set<T = any>(key: string, value: T, config?: { ttlMs?: number }): Promise<void>;
    del(key: string): Promise<void>;
    getAll<T = any>(): Promise<T[]>;
    keys(): Promise<string[]>;
    delAll(): Promise<void>;
    hget<T = Record<string, any>>(key: string, field: string): Promise<T[keyof T] | undefined>;
    hset<T = Record<string, any>>(key: string, field: string, fieldValue: any): Promise<void>;
    hdel(key: string, field: string): Promise<boolean>;
}

export interface DBConnection {
    connectStore(storeName: string): Promise<Store>;
}

export function connectDB(dbName: string): Promise<DBConnection>;