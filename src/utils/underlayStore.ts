/**
 * 바탕 도면 이미지를 브라우저(IndexedDB)에 보관한다.
 * 사진은 수백 KB~수 MB라서 도면 본문을 저장하는 localStorage(약 5MB 한도)에는 넣을 수 없다.
 */
const DB_NAME = 'minicad';
const STORE = 'underlay';
const KEY = 'current';

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await openDb();
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = action(tx.objectStore(STORE));
      tx.oncomplete = () => resolve(request.result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/** 저장에 성공하면 true (저장 공간 부족·사생활 보호 모드 등으로 실패할 수 있다) */
export async function saveUnderlayBlob(blob: Blob): Promise<boolean> {
  try {
    await run('readwrite', (store) => store.put(blob, KEY));
    return true;
  } catch {
    return false;
  }
}

export async function loadUnderlayBlob(): Promise<Blob | null> {
  try {
    const value = await run<unknown>('readonly', (store) => store.get(KEY));
    return value instanceof Blob ? value : null;
  } catch {
    return null;
  }
}

export async function clearUnderlayBlob(): Promise<void> {
  try {
    await run('readwrite', (store) => store.delete(KEY));
  } catch {
    // 지우지 못해도 다음 저장 때 덮어쓰므로 넘어간다
  }
}
