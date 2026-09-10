/*
  冊子から登録した作品の写真を、端末の中だけに置く。

  localStorage は文字列しか入らず容量も 5MB 前後なので、写真を base64 で入れると
  数枚で他の記録ごと保存できなくなる。写真は IndexedDB に Blob のまま入れ、
  localStorage 側には「写真が何枚あるか」だけを持たせている。
*/

const DB_NAME = 'laq-library-photos'
const STORE = 'photos'
/**
 * 保存する長辺の上限。冊子のページは図の中の数字や細かいパーツまで読めないと
 * 意味がないので、拡大して読めるだけ残す（800px では字がつぶれて読めなかった）。
 * iOS の canvas の上限（約 1,670 万画素）にも収まる。
 */
const MAX_EDGE = 2560
const JPEG_QUALITY = 0.85
/** 1 つの登録に入れられる写真の枚数。冊子の作品は多くても数ページ */
export const MAX_PHOTOS = 30

/**
 * 登録の n 枚目（0 始まり）の写真を入れておくキー。
 * 1 枚目は登録の id そのままにして、写真が 1 枚だけだったころの保存と揃える。
 */
export function photoKey(id: string, index: number): string {
  return index === 0 ? id : `${id}#${index + 1}`
}

export function photoKeys(id: string, count: number): string[] {
  return Array.from({ length: count }, (_, i) => photoKey(id, i))
}

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
 * 何件もまとめて書くときは、run から何も返さなくてよい。
 */
function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T> | void,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        let result: T
        const tx = db.transaction(STORE, mode)
        const request = run(tx.objectStore(STORE))
        if (request) {
          request.onsuccess = () => {
            result = request.result
          }
          request.onerror = () => reject(request.error)
        }
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
      (blob) => {
        // iOS は canvas のメモリをすぐには返さないので、何枚も続けて縮めると
        // 上限に当たって描けなくなる。使い終わったらすぐ 0 にして手放す。
        canvas.width = 0
        canvas.height = 0
        if (blob) resolve(blob)
        else reject(new Error('写真を変換できませんでした'))
      },
      'image/jpeg',
      JPEG_QUALITY,
    )
  })
}

/**
 * 登録の写真を、ページの順にまるごと書き直す。1 つのトランザクションで書くので、
 * 途中で失敗しても前の写真と新しい写真が混ざらない。
 * 前より減った後ろのぶんは消す。残すと、どこからも参照されない写真が端末に残り続ける。
 */
export async function savePhotos(
  id: string,
  blobs: Blob[],
  previousCount: number,
): Promise<void> {
  await withStore('readwrite', (store) => {
    blobs.forEach((blob, i) => store.put(blob, photoKey(id, i)))
    for (let i = blobs.length; i < previousCount; i++) store.delete(photoKey(id, i))
  })
}

export async function getPhoto(key: string): Promise<Blob | null> {
  try {
    return (await withStore<Blob | undefined>('readonly', (store) => store.get(key))) ?? null
  } catch {
    return null
  }
}

/** 登録の写真をページの順に取り出す。読めなかったページは null */
export function getPhotos(id: string, count: number): Promise<(Blob | null)[]> {
  return Promise.all(photoKeys(id, count).map(getPhoto))
}

export async function deletePhotos(id: string, count: number): Promise<void> {
  try {
    await withStore('readwrite', (store) => {
      for (const key of photoKeys(id, count)) store.delete(key)
    })
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
  keys: string[],
): Promise<{ photos: Record<string, string>; missing: string[] }> {
  const photos: Record<string, string> = {}
  const missing: string[] = []
  for (const key of keys) {
    const blob = await getPhoto(key)
    if (blob) photos[key] = await blobToDataUrl(blob)
    else missing.push(key)
  }
  return { photos, missing }
}

/** 書き出したファイルから写真を戻す。入らなかったキーを返す。 */
export async function importPhotos(
  photos: Record<string, string>,
): Promise<string[]> {
  const failed: string[] = []
  for (const [key, dataUrl] of Object.entries(photos)) {
    try {
      const blob = await (await fetch(dataUrl)).blob()
      await withStore('readwrite', (store) => store.put(blob, key))
    } catch {
      // 1 枚読めなくても、他の写真と記録は入れる
      failed.push(key)
    }
  }
  return failed
}

/**
 * 写真をすべて捨てる。記録を全部消すときと、読み込みで入れ替えるときに使う。
 * これをしないと、参照する登録が無い写真だけが端末に残り続ける。
 */
export async function clearPhotos(): Promise<void> {
  // 呼び出し元が、削除できていないのに完了と案内しないよう失敗を伝える。
  await withStore('readwrite', (store) => store.clear())
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result))
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}
