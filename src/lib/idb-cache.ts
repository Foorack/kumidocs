// oxlint-disable promise/avoid-new, eslint/id-length, typescript/promise-function-async, typescript/no-confusing-void-expression, typescript/prefer-promise-reject-errors, typescript/no-unnecessary-type-parameters

/**
 * Tiny IndexedDB cache with TTL for large immutable data (emojis, icons).
 * Each entry is stored as a structured clone with an expiry timestamp.
 */

const DB_NAME = "kumidocs-cache";
const DB_VERSION = 1;
const STORE_NAME = "cache";

interface CacheEntry {
  data: unknown;
  expiresAt: number;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve: (db: IDBDatabase) => void, reject: (error: unknown) => void) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.addEventListener("upgradeneeded", () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    });
    request.addEventListener("success", () => {
      resolve(request.result);
    });
    request.addEventListener("error", () => {
      reject(request.error);
    });
  });
}

async function idbGet<T>(key: string): Promise<T | undefined> {
  let database: IDBDatabase;
  try {
    database = await openDb();
  } catch {
    return undefined;
  }
  return new Promise((resolve: (value: T | undefined) => void) => {
    const tx = database.transaction(STORE_NAME, "readonly");
    const store = tx.objectStore(STORE_NAME);
    const request = store.get(key);
    request.addEventListener("success", () => {
      // oxlint-disable-next-line typescript/no-unsafe-type-assertion
      const entry = request.result as CacheEntry | undefined;
      if (entry === undefined || Date.now() > entry.expiresAt) {
        resolve(undefined);
      } else {
        // oxlint-disable-next-line typescript/no-unsafe-type-assertion
        resolve(entry.data as T);
      }
    });
    request.addEventListener("error", () => {
      resolve(undefined);
    });
    tx.addEventListener("complete", () => {
      database.close();
    });
  });
}

async function idbSet<T>(key: string, data: T, ttlMs: number): Promise<void> {
  let database: IDBDatabase;
  try {
    database = await openDb();
  } catch {
    return;
  }
  return new Promise((resolve: () => void) => {
    const tx = database.transaction(STORE_NAME, "readwrite");
    const store = tx.objectStore(STORE_NAME);
    const entry: CacheEntry = { data, expiresAt: Date.now() + ttlMs };
    store.put(entry, key);
    tx.addEventListener("complete", () => {
      database.close();
      resolve();
    });
    tx.addEventListener("error", () => {
      database.close();
      resolve();
    });
  });
}

export { idbGet, idbSet };
