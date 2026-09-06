/*
  冊子から登録した作品の写真を、端末の中だけに置く。

  localStorage は文字列しか入らず容量も 5MB 前後なので、写真を base64 で入れると
  数枚で他の記録ごと保存できなくなる。写真は IndexedDB に Blob のまま入れ、
  localStorage 側には「写真があるかどうか」だけを持たせている。
*/

const DB_NAME = 'laq-library-photos'
const STORE = 'photos'
/** 保存する長辺の上限。冊子の作品が分かればよいので、原寸は要らない */
const MAX_EDGE = 800
const JPEG_QUALITY = 0.75

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1)
    request.onupgradeneeded = () => {
      request.result.createObjectStore(STORE)
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE, mode)
        const request = run(tx.objectStore(STORE))
        request.onsuccess = () => resolve(request.result)
        request.onerror = () => reject(request.error)
        tx.oncomplete = () => db.close()
      }),
  )
}

/**
 * 撮った写真を縮めてから保存する。スマホの写真はそのままだと数MBあり、
 * 端末の容量をすぐ使い切ってしまう。
 */
export async function shrink(file: File | Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height))
  const width = Math.round(bitmap.width * scale)
  const height = Math.round(bitmap.height * scale)

  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, width, height)
  bitmap.close()

  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('写真を変換できませんでした'))),
      'image/jpeg',
      JPEG_QUALITY,
    )
  })
}

export async function putPhoto(id: string, file: File | Blob): Promise<void> {
  const blob = await shrink(file)
  await withStore('readwrite', (store) => store.put(blob, id))
}

export async function getPhoto(id: string): Promise<Blob | null> {
  try {
    return (await withStore<Blob | undefined>('readonly', (store) => store.get(id))) ?? null
  } catch {
    return null
  }
}

export async function deletePhoto(id: string): Promise<void> {
  try {
    await withStore('readwrite', (store) => store.delete(id))
  } catch {
    // 消せなくても記録側は消えているので、実害は無い
  }
}

/** 記録の書き出しに載せるため、写真を data URL にして取り出す。 */
export async function exportPhotos(ids: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {}
  for (const id of ids) {
    const blob = await getPhoto(id)
    if (blob) out[id] = await blobToDataUrl(blob)
  }
  return out
}

/** 書き出したファイルから写真を戻す。 */
export async function importPhotos(photos: Record<string, string>): Promise<void> {
  for (const [id, dataUrl] of Object.entries(photos)) {
    try {
      const blob = await (await fetch(dataUrl)).blob()
      await withStore('readwrite', (store) => store.put(blob, id))
    } catch {
      // 1 枚読めなくても、他の写真と記録は入れる
    }
  }
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}
