export function connectDB(dbName) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName);

    request.onupgradeneeded = () => {
      // 초기에는 store 생성하지 않음
    };

    request.onsuccess = () => {
      const db = request.result;
      resolve({
        connectStore: (storeName) => connectStore(dbName, db, storeName),
      });
    };

    request.onerror = () => reject(request.error);
  });
}

function connectStore(dbName, db, storeName) {
  if (!db.objectStoreNames.contains(storeName)) {
    db.close();
    const version = db.version + 1;

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(dbName, version);

      request.onupgradeneeded = (event) => {
        const upgradedDb = event.target.result;
        upgradedDb.createObjectStore(storeName);
      };

      request.onsuccess = (event) => {
        const upgradedDb = event.target.result;
        resolve(createStore(upgradedDb, storeName));
      };

      request.onerror = () => reject(request.error);
    });
  }

  return Promise.resolve(createStore(db, storeName));
}

function createStore(db, storeName) {
  return {
    async get(key) {
      return new Promise((resolve, reject) => {
        const tx = db.transaction([storeName], "readonly");
        const store = tx.objectStore(storeName);
        const req = store.get(key);

        req.onsuccess = () => {
          const result = req.result;
          if (!result) return resolve(undefined);

          const { value, expiresAt } = result;
          if (expiresAt && Date.now() > expiresAt) {
            return resolve(undefined);
          }
          resolve(value);
        };

        req.onerror = () => reject(req.error);
      });
    },

    async set(key, value, config = {}) {
      const { ttl, expiresAt } = config;
      let finalExpiresAt;

      if (expiresAt !== undefined) {
        // 직접 지정된 만료 시간 (ms 단위 timestamp)이 최우선
        finalExpiresAt = expiresAt;
      } else if (ttl !== undefined) {
        // ttl 은 "초 단위" → ms 변환
        finalExpiresAt = Date.now() + ttl * 1000;
      }

      const data = {
        value,
        ...(finalExpiresAt !== undefined ? { expiresAt: finalExpiresAt } : {}),
      };

      return new Promise((resolve, reject) => {
        const tx = db.transaction([storeName], "readwrite");
        const store = tx.objectStore(storeName);
        const req = store.put(data, key);

        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    },

    async del(key) {
      return new Promise((resolve, reject) => {
        const tx = db.transaction([storeName], "readwrite");
        const store = tx.objectStore(storeName);
        const req = store.delete(key);

        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    },

    async getAll() {
      return new Promise((resolve, reject) => {
        const tx = db.transaction([storeName], "readonly");
        const store = tx.objectStore(storeName);
        const request = store.openCursor();
        const results = [];

        request.onsuccess = (event) => {
          const cursor = event.target.result;
          if (cursor) {
            const { value, expiresAt } = cursor.value;
            if (!expiresAt || Date.now() <= expiresAt) {
              results.push(value);
            }
            cursor.continue();
          } else {
            resolve(results);
          }
        };

        request.onerror = () => reject(request.error);
      });
    },

    async keys() {
      return new Promise((resolve, reject) => {
        const tx = db.transaction([storeName], "readonly");
        const store = tx.objectStore(storeName);
        const request = store.openCursor();
        const keys = [];

        request.onsuccess = (event) => {
          const cursor = event.target.result;
          if (cursor) {
            const { expiresAt } = cursor.value;
            if (!expiresAt || Date.now() <= expiresAt) {
              keys.push(String(cursor.key));
            }
            cursor.continue();
          } else {
            resolve(keys);
          }
        };

        request.onerror = () => reject(request.error);
      });
    },

    async delAll() {
      return new Promise((resolve, reject) => {
        const tx = db.transaction([storeName], "readwrite");
        const store = tx.objectStore(storeName);
        const req = store.clear();

        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    },

    async hget(key, field) {
      const value = await this.get(key);
      if (value && typeof value === "object" && value !== null) {
        return value[field];
      }
      return undefined;
    },

    async hset(key, field, fieldValue) {
      const tx = db.transaction([storeName], "readwrite");
      const store = tx.objectStore(storeName);

      return new Promise((resolve, reject) => {
        const getReq = store.get(key);

        getReq.onsuccess = () => {
          const existing = getReq.result || {};
          const { value = {}, expiresAt } = existing;

          if (typeof value !== "object" || value === null) {
            return reject(
              new Error("Cannot hset: stored value is not an object")
            );
          }

          value[field] = fieldValue;

          const updated = {
            value,
            ...(expiresAt ? { expiresAt } : {}),
          };

          const putReq = store.put(updated, key);
          putReq.onsuccess = () => resolve();
          putReq.onerror = () => reject(putReq.error);
        };

        getReq.onerror = () => reject(getReq.error);
      });
    },

    async hdel(key, field) {
      const tx = db.transaction([storeName], "readwrite");
      const store = tx.objectStore(storeName);

      return new Promise((resolve, reject) => {
        const getReq = store.get(key);

        getReq.onsuccess = () => {
          const existing = getReq.result;
          if (
            !existing ||
            typeof existing.value !== "object" ||
            existing.value === null
          ) {
            return resolve(false); // 삭제할 수 없음
          }

          if (!(field in existing.value)) {
            return resolve(false); // field 없음
          }

          delete existing.value[field];

          const updated = {
            value: existing.value,
            ...(existing.expiresAt ? { expiresAt: existing.expiresAt } : {}),
          };

          const putReq = store.put(updated, key);
          putReq.onsuccess = () => resolve(true);
          putReq.onerror = () => reject(putReq.error);
        };

        getReq.onerror = () => reject(getReq.error);
      });
    },

    async ttl(key) {
      return new Promise((resolve, reject) => {
        const tx = db.transaction([storeName], "readonly");
        const store = tx.objectStore(storeName);
        const req = store.get(key);

        req.onsuccess = () => {
          const doc = req.result;
          if (!doc) return resolve(-2); // 존재하지 않음

          const { expiresAt } = doc;
          if (!expiresAt) return resolve(-1); // 만료시간 없음(영구 저장)

          const now = Date.now();
          if (now >= expiresAt) return resolve(0); // 만료됨

          const seconds = Math.ceil((expiresAt - now) / 1000);
          resolve(seconds);
        };

        req.onerror = () => reject(req.error);
      });
    },
  };
}
