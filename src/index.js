const EXPIRES_INDEX = "expiresAt";

export function connectDB(dbName) {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName);

    request.onupgradeneeded = () => {
      // 초기에는 store 생성하지 않음
    };

    request.onsuccess = () => {
      // 커넥션을 공유 가변 상태로 관리:
      // store 생성/인덱스 추가로 버전 업그레이드가 일어나면 state.db가 교체되고,
      // 모든 store 메서드는 호출 시점의 최신 커넥션을 사용한다.
      const state = { db: request.result, closed: false };
      attachVersionChange(state);

      resolve({
        connectStore: (storeName, options) =>
          connectStore(dbName, state, storeName, options),
      });
    };

    request.onerror = () => reject(request.error);
  });
}

/** 다른 탭의 버전 업그레이드를 블로킹하지 않도록 커넥션을 양보 */
function attachVersionChange(state) {
  state.db.onversionchange = () => {
    state.db.close();
    state.closed = true;
  };
}

/** 현재 커넥션 반환. 닫혀 있으면 재연결 */
function getDb(dbName, state) {
  if (state.db && !state.closed) {
    return Promise.resolve(state.db);
  }
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName);
    request.onsuccess = () => {
      state.db = request.result;
      state.closed = false;
      attachVersionChange(state);
      resolve(state.db);
    };
    request.onerror = () => reject(request.error);
  });
}

async function connectStore(dbName, state, storeName, options = {}) {
  const db = await getDb(dbName, state);

  const hasStore = db.objectStoreNames.contains(storeName);
  const hasIndex =
    hasStore &&
    db
      .transaction([storeName], "readonly")
      .objectStore(storeName)
      .indexNames.contains(EXPIRES_INDEX);

  // store와 expiresAt 인덱스가 모두 있으면 그대로 사용
  if (hasStore && hasIndex) {
    return createStore(dbName, state, storeName, options);
  }

  // store가 없거나, (구버전에서 생성되어) 인덱스가 없으면 버전 업그레이드
  const version = db.version + 1;
  db.close();
  state.closed = true;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(dbName, version);

    request.onupgradeneeded = (event) => {
      const upgradedDb = event.target.result;
      let store;
      if (!upgradedDb.objectStoreNames.contains(storeName)) {
        store = upgradedDb.createObjectStore(storeName);
      } else {
        // 기존 store에 인덱스만 추가 (upgrade transaction 사용)
        store = event.target.transaction.objectStore(storeName);
      }
      if (!store.indexNames.contains(EXPIRES_INDEX)) {
        // expiresAt이 없는 레코드(영구 저장)는 인덱스에 포함되지 않음
        store.createIndex(EXPIRES_INDEX, "expiresAt");
      }
    };

    request.onsuccess = () => {
      state.db = request.result;
      state.closed = false;
      attachVersionChange(state);
      resolve(createStore(dbName, state, storeName, options));
    };

    request.onerror = () => reject(request.error);
    request.onblocked = () =>
      console.warn(
        `[yosie] upgrade blocked: 다른 탭이 "${dbName}"을 사용 중입니다.`
      );
  });
}

function createStore(dbName, state, storeName, options = {}) {
  let cleanupTimer = null;

  const db = () => getDb(dbName, state);

  /** 만료된 레코드를 실제로 삭제. 삭제된 개수를 반환 */
  async function sweep() {
    const conn = await db();
    return new Promise((resolve, reject) => {
      const tx = conn.transaction([storeName], "readwrite");
      const index = tx.objectStore(storeName).index(EXPIRES_INDEX);
      // expiresAt <= now 인 레코드만 커서로 순회 → 전체 스캔 없음
      const range = IDBKeyRange.upperBound(Date.now());
      const request = index.openCursor(range);
      let deleted = 0;

      request.onsuccess = (event) => {
        const cursor = event.target.result;
        if (cursor) {
          cursor.delete();
          deleted++;
          cursor.continue();
        }
      };

      tx.oncomplete = () => resolve(deleted);
      tx.onerror = () => reject(tx.error);
      request.onerror = () => reject(request.error);
    });
  }

  /**
   * 멀티탭 환경에서 동시에 sweep이 돌지 않도록 Web Locks로 조정.
   * (sweep 자체는 멱등이므로 락 없이 중복 실행돼도 안전 — 최적화 목적)
   */
  function sweepCoordinated() {
    const lockName = `yosie:${dbName}:${storeName}:cleanup`;
    if (typeof navigator !== "undefined" && navigator.locks?.request) {
      return navigator.locks.request(
        lockName,
        { ifAvailable: true },
        async (lock) => {
          if (!lock) return 0; // 다른 탭이 청소 중
          return sweep();
        }
      );
    }
    return sweep();
  }

  /** get/ttl에서 만료를 발견했을 때 비동기로 삭제 (lazy deletion) */
  async function lazyDelete(key) {
    try {
      const conn = await db();
      const tx = conn.transaction([storeName], "readwrite");
      const store = tx.objectStore(storeName);
      const getReq = store.get(key);
      getReq.onsuccess = () => {
        const doc = getReq.result;
        // 삭제 직전에 재확인: 그 사이 같은 키가 새 값으로 덮어써졌을 수 있음
        if (doc && doc.expiresAt && Date.now() > doc.expiresAt) {
          store.delete(key);
        }
      };
      tx.onerror = () => {};
    } catch (_) {
      // lazy 삭제 실패는 무시 — 다음 sweep에서 정리됨
    }
  }

  const storeApi = {
    async get(key) {
      const conn = await db();
      return new Promise((resolve, reject) => {
        const tx = conn.transaction([storeName], "readonly");
        const store = tx.objectStore(storeName);
        const req = store.get(key);

        req.onsuccess = () => {
          const result = req.result;
          if (!result) return resolve(undefined);

          const { value, expiresAt } = result;
          if (expiresAt && Date.now() > expiresAt) {
            lazyDelete(key); // 만료 발견 → 즉시 물리 삭제 예약
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

      const conn = await db();
      return new Promise((resolve, reject) => {
        const tx = conn.transaction([storeName], "readwrite");
        const store = tx.objectStore(storeName);
        const req = store.put(data, key);

        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    },

    async del(key) {
      const conn = await db();
      return new Promise((resolve, reject) => {
        const tx = conn.transaction([storeName], "readwrite");
        const store = tx.objectStore(storeName);
        const req = store.delete(key);

        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    },

    async getAll() {
      const conn = await db();
      return new Promise((resolve, reject) => {
        const tx = conn.transaction([storeName], "readonly");
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
      const conn = await db();
      return new Promise((resolve, reject) => {
        const tx = conn.transaction([storeName], "readonly");
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
      const conn = await db();
      return new Promise((resolve, reject) => {
        const tx = conn.transaction([storeName], "readwrite");
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
      const conn = await db();
      const tx = conn.transaction([storeName], "readwrite");
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
      const conn = await db();
      const tx = conn.transaction([storeName], "readwrite");
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
      const conn = await db();
      return new Promise((resolve, reject) => {
        const tx = conn.transaction([storeName], "readonly");
        const store = tx.objectStore(storeName);
        const req = store.get(key);

        req.onsuccess = () => {
          const doc = req.result;
          if (!doc) return resolve(-2); // 존재하지 않음

          const { expiresAt } = doc;
          if (!expiresAt) return resolve(-1); // 만료시간 없음(영구 저장)

          const now = Date.now();
          if (now >= expiresAt) {
            lazyDelete(key); // 만료 발견 → 즉시 물리 삭제 예약
            return resolve(0); // 만료됨
          }

          const seconds = Math.ceil((expiresAt - now) / 1000);
          resolve(seconds);
        };

        req.onerror = () => reject(req.error);
      });
    },

    /**
     * 만료된 레코드를 즉시 전부 삭제 (active expiration).
     * expiresAt 인덱스를 사용하므로 만료된 레코드 수에만 비례하는 비용.
     * @returns 삭제된 레코드 수
     */
    async cleanupExpired() {
      return sweepCoordinated();
    },

    /**
     * 주기적 자동 청소 시작. 시작 즉시 1회 sweep 후 intervalSec마다 반복.
     * 이미 실행 중이면 기존 타이머를 교체.
     * @param intervalSec 청소 주기(초). 기본 60초
     */
    startAutoCleanup(intervalSec = 60) {
      this.stopAutoCleanup();
      sweepCoordinated().catch(() => {});
      cleanupTimer = setInterval(() => {
        sweepCoordinated().catch(() => {});
      }, intervalSec * 1000);
      // Node/테스트 환경에서 프로세스 종료를 막지 않도록
      if (cleanupTimer && typeof cleanupTimer.unref === "function") {
        cleanupTimer.unref();
      }
    },

    /** 자동 청소 중지 */
    stopAutoCleanup() {
      if (cleanupTimer !== null) {
        clearInterval(cleanupTimer);
        cleanupTimer = null;
      }
    },
  };

  // connectStore 옵션으로 자동 청소 활성화
  // { autoCleanup: true } 또는 { autoCleanup: { interval: 30 } }
  if (options.autoCleanup) {
    const interval =
      typeof options.autoCleanup === "object"
        ? options.autoCleanup.interval
        : undefined;
    storeApi.startAutoCleanup(interval);
  }

  return storeApi;
}
