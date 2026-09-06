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

/**
 * リクエストが成功しても、トランザクションが確定するまで書き込みは確定しない。
 * request.onsuccess で解決すると「保存できた」と言った直後に abort されうるので、
 * 必ず tx.oncomplete まで待つ。
 */
function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        let result: T
        const tx = db.transaction(STORE, mode)
        const request = run(tx.objectStore(STORE))
        request.onsuccess = () => {
          result = request.result
        }
        request.onerror = () => reject(request.error)
        tx.oncomplete = () => {
          db.close()
          resolve(result)
        }
        tx.onabort = () => {
          db.close()
          reject(tx.error ?? new Error('写真の保存が中断されました'))
        }
        tx.onerror = () => {
          db.close()
          reject(tx.error ?? new Error('写真の保存に失敗しました'))
        }
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

/**
 * 記録の書き出しに載せるため、写真を data URL にして取り出す。
 * 取り出せなかったものは missing に入れて返す。黙って落とすと、
 * 写真の無いファイルを「ほぞんしました」と言ってしまう。
 */
export async function exportPhotos(
  ids: string[],
): Promise<{ photos: Record<string, string>; missing: string[] }> {
  const photos: Record<string, string> = {}
  const missing: string[] = []
  for (const id of ids) {
    const blob = await getPhoto(id)
    if (blob) photos[id] = await blobToDataUrl(blob)
    else missing.push(id)
  }
  return { photos, missing }
}

/** 書き出したファイルから写真を戻す。入らなかった id を返す。 */
export async function importPhotos(
  photos: Record<string, string>,
): Promise<string[]> {
  const failed: string[] = []
  for (const [id, dataUrl] of Object.entries(photos)) {
    try {
      const blob = await (await fetch(dataUrl)).blob()
      await withStore('readwrite', (store) => store.put(blob, id))
    } catch {
      // 1 枚読めなくても、他の写真と記録は入れる
      failed.push(id)
    }
  }
  return failed
}

/**
 * 写真をすべて捨てる。記録を全部消すときと、読み込みで入れ替えるときに使う。
 * これをしないと、参照する登録が無い写真だけが端末に残り続ける。
 */
export async function clearPhotos(): Promise<void> {
  try {
    await withStore('readwrite', (store) => store.clear())
  } catch {
    // 触れない環境では何もしない
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
