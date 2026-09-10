import { readFile } from 'node:fs/promises'
import { test, expect } from '@playwright/test'

async function countStoredPhotos(page: import('@playwright/test').Page) {
  return page.evaluate(
    () =>
      new Promise<number>((resolve, reject) => {
        const request = indexedDB.open('laq-library-photos', 1)
        request.onerror = () => reject(request.error)
        request.onsuccess = () => {
          const db = request.result
          const count = db.transaction('photos', 'readonly').objectStore('photos').count()
          count.onsuccess = () => {
            resolve(count.result)
            db.close()
          }
          count.onerror = () => reject(count.error)
        }
      }),
  )
}

/** 保存した写真を、キーの順に縦横の画素数で返す */
async function storedPhotoSizes(page: import('@playwright/test').Page, keys: string[]) {
  return page.evaluate(async (keys) => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const request = indexedDB.open('laq-library-photos', 1)
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
    const sizes: [number, number][] = []
    for (const key of keys) {
      const blob: Blob = await new Promise((resolve, reject) => {
        const get = db.transaction('photos', 'readonly').objectStore('photos').get(key)
        get.onsuccess = () => resolve(get.result)
        get.onerror = () => reject(get.error)
      })
      const bitmap = await createImageBitmap(blob)
      sizes.push([bitmap.width, bitmap.height])
      bitmap.close()
    }
    db.close()
    return sizes
  }, keys)
}

// 公式画像を取得せず、通信失敗からの復帰を含めて再現可能にする。
test.beforeEach(async ({ page }) => {
  await page.route('https://fonts.**/*', route => route.abort())
  await page.route('https://www.laq.co.jp/**', route => route.abort())
})

test('スマホ幅の一覧、カテゴリ展開、キーボード選択', async ({ page }) => {
  await page.goto('./')
  const card = page.locator('a[href*="/model/"]').first()
  await expect(card).toBeVisible()
  const box = await card.boundingBox()
  expect(box!.y + box!.height).toBeLessThan(760)
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390)
  const more = page.getByRole('button', { name: 'ぜんぶ見る' })
  await more.click()
  await expect(page.getByRole('button', { name: '1れつに する' })).toHaveAttribute('aria-expanded', 'true')
  await page.getByRole('button', { name: '1れつに する' }).click()
  const all = page.getByRole('radio', { name: 'ぜんぶ', exact: true })
  await all.focus()
  await page.keyboard.press('ArrowRight')
  await expect(page.getByRole('radio', { name: 'おきにいり', exact: true })).toBeFocused()
  await expect(page.getByRole('radio', { name: 'おきにいり', exact: true })).toBeChecked()
  await page.keyboard.press('ArrowLeft')
  await expect(card).toBeVisible()
  await page.screenshot({ path: 'test-results/browse-mobile.png' })
})

test('バックアップの再選択が失敗したら古い復元候補を消す', async ({ page }) => {
  await page.goto('./settings')
  const input = page.locator('input[type=file]')
  await input.setInputFiles({ name: 'valid.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify({ version: 1, favorites: ['laq-official:005171'], made: {} })) })
  await expect(page.getByRole('button', { name: 'よみこむ', exact: true })).toBeVisible()
  await input.setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{') })
  await expect(page.getByText('ファイルを よみこめませんでした。')).toBeVisible()
  await expect(page.getByRole('button', { name: 'よみこむ', exact: true })).toHaveCount(0)
})

test('図の失敗表示とオンライン復帰、閉じた後のフォーカス', async ({ page }) => {
  await page.goto('./model/laq-official%3A005171')
  const opener = page.getByRole('button', { name: '大きく見る' }).first()
  await opener.click()
  const dialog = page.getByRole('dialog')
  await expect(dialog.locator('[role=img]')).toBeVisible()
  await dialog.locator('[role=img]').click()
  await expect(dialog).toBeVisible()
  await page.route('https://www.laq.co.jp/**', route => route.fulfill({ contentType: 'image/svg+xml', body: '<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="red"/></svg>' }))
  await page.evaluate(() => window.dispatchEvent(new Event('online')))
  await expect(dialog.locator('img')).toBeVisible()
  await expect.poll(() => dialog.locator('img').evaluate((img: HTMLImageElement) => img.naturalWidth)).toBe(100)
  await page.keyboard.press('Escape')
  await expect(dialog).toHaveCount(0)
  await expect(opener).toBeFocused()
})

test('存在しないURLから図鑑に戻れる', async ({ page }) => {
  await page.goto('./missing-page')
  await expect(page.getByRole('heading', { name: 'ページが みつかりません' })).toBeVisible()
  await page.getByRole('link', { name: 'ずかんに もどる' }).click()
  await expect(page.locator('a[href*="/model/"]').first()).toBeVisible()
})

test('手元の冊子から自分で登録し、一覧と検索に出る', async ({ page }) => {
  await page.goto('./settings')
  await page.getByRole('link', { name: /じぶんで とうろく/ }).click()

  await page.getByLabel('なまえ（かならず）').fill('きょうりゅうロボ')
  await page.getByLabel('どの さっし？').fill('ベーシック401')
  await page.getByLabel('なんページ？').fill('12')
  await page.getByRole('radio', { name: 'ふつう' }).click()
  await page.getByRole('button', { name: 'きょうりゅう', exact: true }).click()
  await page.getByRole('button', { name: 'とうろくする' }).click()

  // 登録すると、その作品のページへ移る
  await expect(page.getByRole('heading', { name: 'きょうりゅうロボ' })).toBeVisible()
  await expect(page.getByText('ベーシック401', { exact: true })).toBeVisible()
  await expect(page.getByText(/12ページを 見てね/)).toBeVisible()

  // 冊子名でも引ける
  await page.goto('./')
  await page.getByRole('searchbox').fill('ベーシック401')
  const card = page.locator('a[href*="/model/my-booklet"]').first()
  await expect(card).toBeVisible()
  await expect(card).toContainText('きょうりゅうロボ')

  // 名前を入れずには登録できない
  await page.goto('./settings')
  await page.getByRole('link', { name: /じぶんで とうろく/ }).click()
  await page.getByRole('button', { name: 'とうろくする' }).click()
  await expect(page.getByRole('alert')).toContainText('なまえを 入れてください')
})

test('写真つきの登録が、書き出し→ぜんぶ消す→よみこみ で戻る', async ({ page }) => {
  // 1x1 の PNG。実際の写真である必要はなく、往復できることを見たい
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  )

  await page.goto('./booklet/new')
  await page.getByLabel('なまえ（かならず）').fill('しゃしんつき')
  await page.getByLabel('アルバムから えらぶ').setInputFiles({
    name: 'photo.png',
    mimeType: 'image/png',
    buffer: png,
  })
  await page.getByRole('button', { name: 'とうろくする' }).click()
  await expect(page.getByRole('heading', { name: 'しゃしんつき' })).toBeVisible()
  // 保存した写真が詳細で描けている
  await expect
    .poll(() =>
      page.locator('main img').first().evaluate((i: HTMLImageElement) => i.naturalWidth),
    )
    .toBeGreaterThan(0)

  // 書き出す
  await page.goto('./settings')
  const download = await Promise.all([
    page.waitForEvent('download'),
    page.getByRole('button', { name: 'ファイルに ほぞん' }).click(),
  ]).then(([d]) => d)
  const saved = JSON.parse((await readFile(await download.path())).toString())
  // 写真が書き出しに載っていること（載せないと端末を替えたとき置き去りになる）
  expect(Object.keys(saved.photos ?? {})).toHaveLength(1)

  // ぜんぶ消す
  await page.getByRole('button', { name: 'きろくを けす' }).click()
  await page.getByRole('button', { name: 'ほんとうに けす' }).click()
  await expect(page.getByText('きろくを けしました。')).toBeVisible()
  await expect.poll(() => countStoredPhotos(page)).toBe(0)

  // 読み込むと、登録も写真も戻る
  await page.locator('input[type=file]').setInputFiles({
    name: 'backup.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(saved)),
  })
  await page.getByRole('button', { name: 'よみこむ', exact: true }).click()
  await expect(page.getByText('よみこみました。')).toBeVisible()

  await page.goto('./')
  await page.getByRole('searchbox').fill('しゃしんつき')
  const card = page.locator('a[href*="/model/my-booklet"]').first()
  await expect(card).toBeVisible()
  await expect
    .poll(() => card.locator('img').evaluate((i: HTMLImageElement) => i.naturalWidth))
    .toBeGreaterThan(0)
})

test('写真の復元中は画面を操作できず、完了後の全削除で写真も消える', async ({ page }) => {
  const backup = {
    version: 1,
    favorites: [],
    made: {},
    booklets: [{
      id: 'my-booklet:busy', title: '復元中', booklet: '', page: '', level: null,
      categories: [], note: '', hasPhoto: true, createdAt: '',
    }],
    photos: {
      'my-booklet:busy': 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    },
  }
  await page.goto('./')
  await page.getByRole('link', { name: 'せってい', exact: true }).click()
  await page.evaluate(() => {
    const originalFetch = window.fetch
    ;(window as Window & { photoImportStarted?: boolean; releasePhotoImport?: () => void }).fetch = async (...args) => {
      if (String(args[0]).startsWith('data:image/')) {
        const state = window as Window & { photoImportStarted?: boolean; releasePhotoImport?: () => void }
        state.photoImportStarted = true
        await new Promise<void>((resolve) => { state.releasePhotoImport = resolve })
      }
      return originalFetch(...args)
    }
  })
  await page.locator('input[type=file]').setInputFiles({
    name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)),
  })
  await page.getByRole('button', { name: 'よみこむ', exact: true }).click()
  await expect.poll(() => page.evaluate(() => (window as Window & { photoImportStarted?: boolean }).photoImportStarted)).toBe(true)
  await expect(page.getByRole('status')).toContainText('せいりしています')
  await expect(page.locator('main')).toHaveAttribute('inert', '')
  await expect(page.locator('nav')).toHaveAttribute('inert', '')
  // ブラウザ履歴で設定を再マウントしても、進行中のロックは残る。
  await page.goBack()
  await expect(page).toHaveURL(/\/laq-library\/$/)
  await page.goForward()
  await expect(page).toHaveURL(/\/settings$/)
  await expect(page.locator('main')).toHaveAttribute('inert', '')
  await page.evaluate(() => (window as Window & { releasePhotoImport?: () => void }).releasePhotoImport?.())
  await expect(page.getByRole('status')).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('laq-library:v1') || '{}').booklets?.length)).toBe(1)
  await page.getByRole('button', { name: 'きろくを けす' }).click()
  await page.getByRole('button', { name: 'ほんとうに けす' }).click()
  await expect(page.getByText('きろくを けしました。', { exact: true })).toBeVisible()
  await expect.poll(() => countStoredPhotos(page)).toBe(0)
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('laq-library:v1') || '{}').booklets?.length)).toBe(0)
})

test('写真の削除・復元に失敗したら成功表示せず既存データを残す', async ({ page }) => {
  const backup = {
    version: 1, favorites: [], made: {},
    booklets: [{ id: 'my-booklet:failure', title: '失敗確認', booklet: '', page: '', level: null, categories: [], note: '', hasPhoto: true, createdAt: '' }],
    photos: {
      'my-booklet:failure': 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    },
  }
  await page.goto('./settings')
  await page.locator('input[type=file]').setInputFiles({
    name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)),
  })
  await page.getByRole('button', { name: 'よみこむ', exact: true }).click()
  await expect(page.getByText('よみこみました。', { exact: true })).toBeVisible()
  await page.evaluate(() => {
    const originalClear = IDBObjectStore.prototype.clear
    IDBObjectStore.prototype.clear = function () { throw new Error('forced clear failure') }
    ;(window as Window & { restoreOriginalClear?: () => void }).restoreOriginalClear = () => {
      IDBObjectStore.prototype.clear = originalClear
    }
  })
  await page.getByRole('button', { name: 'きろくを けす' }).click()
  await page.getByRole('button', { name: 'ほんとうに けす' }).click()
  await expect(page.getByText(/すべての きろくと しゃしんを けせませんでした/)).toBeVisible()
  await expect(page.getByText('きろくを けしました。', { exact: true })).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('laq-library:v1') || '{}').booklets?.length)).toBe(1)
  await expect.poll(() => countStoredPhotos(page)).toBe(1)

  await page.locator('input[type=file]').setInputFiles({
    name: 'backup-again.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(backup)),
  })
  await page.getByRole('button', { name: 'よみこむ', exact: true }).click()
  await expect(page.getByText(/よみこめませんでした。もういちど/)).toBeVisible()
  await expect(page.getByText('よみこみました。', { exact: true })).toHaveCount(0)
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('laq-library:v1') || '{}').booklets?.length)).toBe(1)
  await expect.poll(() => countStoredPhotos(page)).toBe(1)

  await page.evaluate(() => (window as Window & { restoreOriginalClear?: () => void }).restoreOriginalClear?.())
})

test('登録をやめたら、選んだ写真は端末に残らない', async ({ page }) => {
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  )
  await page.goto('./booklet/new')
  await page.getByLabel('カメラで とる').setInputFiles({
    name: 'photo.png',
    mimeType: 'image/png',
    buffer: png,
  })
  await expect(page.getByText(/ボタンを おすまで ほぞんされません/)).toBeVisible()

  // 確定せずに離れる
  await page.goto('./settings')
  const count = await page.evaluate(async () => {
    const db: IDBDatabase = await new Promise((resolve, reject) => {
      const r = indexedDB.open('laq-library-photos', 1)
      r.onupgradeneeded = () => r.result.createObjectStore('photos')
      r.onsuccess = () => resolve(r.result)
      r.onerror = () => reject(r.error)
    })
    return new Promise<number>((resolve) => {
      const req = db.transaction('photos', 'readonly').objectStore('photos').count()
      req.onsuccess = () => resolve(req.result)
    })
  })
  expect(count).toBe(0)
})

test('冊子の何ページぶんもの写真を、字が読める大きさで順に登録して読める', async ({ page }) => {
  await page.goto('./booklet/new')
  // スマホで撮った写真と同じ 4032x3024 と、並びを見分けるための小さな 2 枚
  const pngs = await page.evaluate(async () => {
    const make = async (width: number, height: number) => {
      const canvas = document.createElement('canvas')
      canvas.width = width
      canvas.height = height
      canvas.getContext('2d')!.fillRect(0, 0, width, height)
      const blob: Blob = await new Promise((resolve) => canvas.toBlob((b) => resolve(b!), 'image/png'))
      let binary = ''
      for (const byte of new Uint8Array(await blob.arrayBuffer())) binary += String.fromCharCode(byte)
      return btoa(binary)
    }
    return [await make(4032, 3024), await make(40, 30), await make(30, 40)]
  })
  await page.getByLabel('なまえ（かならず）').fill('なんページも')
  await page.getByLabel('アルバムから えらぶ').setInputFiles(
    pngs.map((b64, i) => ({ name: `page${i + 1}.png`, mimeType: 'image/png', buffer: Buffer.from(b64, 'base64') })),
  )
  await expect(page.getByRole('button', { name: /まいめを けす/ })).toHaveCount(3)
  // 保存する前から、選んだ写真がその順に見えている
  await expect
    .poll(() =>
      page.locator('main ol img').evaluateAll((imgs) =>
        imgs.map((img) => (img as HTMLImageElement).naturalWidth),
      ),
    )
    .toEqual([2560, 40, 30])

  // 3 枚目を 2 枚目の前へ動かしてから、うしろに回った 3 枚目（40x30）をけす
  await page.getByRole('button', { name: '3まいめを まえへ' }).click()
  await page.getByRole('button', { name: '3まいめを けす' }).click()
  await page.getByRole('button', { name: 'とうろくする' }).click()
  await expect(page.getByRole('heading', { name: 'なんページも' })).toBeVisible()

  const stored = () =>
    page.evaluate(() => JSON.parse(localStorage.getItem('laq-library:v1') || '{}').booklets[0])
  const { id, photoCount } = await stored()
  expect(photoCount).toBe(2)
  // 長辺 800px まで縮めていたころは、冊子の図の数字がつぶれて読めなかった
  expect(await storedPhotoSizes(page, [id, `${id}#2`])).toEqual([[2560, 1920], [30, 40]])

  // ページの順に並び、大きく見ると 2 枚目へめくれる
  const zoom = page.getByRole('button', { name: '大きく見る' })
  await expect(zoom).toHaveCount(2)
  await zoom.nth(1).click()
  const dialog = page.getByRole('dialog')
  await expect(dialog).toContainText('2 / 2')
  await expect
    .poll(() => dialog.locator('img').evaluate((i: HTMLImageElement) => i.naturalWidth))
    .toBe(30)
  await page.keyboard.press('Escape')

  // 直すときは保存済みの写真が並び、1 枚目をけすと後ろが繰り上がって余りは消える
  await page.getByRole('link', { name: 'とうろくを なおす' }).click()
  await expect(page.getByRole('button', { name: /まいめを けす/ })).toHaveCount(2)
  await page.getByRole('button', { name: '1まいめを けす' }).click()
  await page.getByRole('button', { name: 'なおす', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'なんページも' })).toBeVisible()
  expect((await stored()).photoCount).toBe(1)
  await expect.poll(() => countStoredPhotos(page)).toBe(1)
  expect(await storedPhotoSizes(page, [id])).toEqual([[30, 40]])
})

test('おきにいりを「つくってない」「つくった」でしぼれる', async ({ page }) => {
  await page.goto('./')
  const titles = page.locator('a[href*="/model/"] p')
  await expect(titles.first()).toBeVisible()
  const made = (await titles.nth(0).textContent())!.trim()
  const notMade = (await titles.nth(1).textContent())!.trim()

  // 一覧のカードから ★ を 2 つ付ける
  await page.getByRole('button', { name: `${made} をおきにいりに いれる` }).click()
  await page.getByRole('button', { name: `${notMade} をおきにいりに いれる` }).click()

  // 片方だけ「つくった」にする
  await page.getByRole('link', { name: new RegExp(made) }).first().click()
  await page.getByRole('button', { name: 'つくった！を きろく' }).click()

  await page.goto('./favorites')
  const cards = page.locator('a[href*="/model/"]')
  await expect(cards).toHaveCount(2)

  await page.getByRole('radio', { name: 'つくってない', exact: true }).click()
  await expect(cards).toHaveCount(1)
  await expect(cards.first()).toContainText(notMade)

  await page.getByRole('radio', { name: 'つくった', exact: true }).click()
  await expect(cards).toHaveCount(1)
  await expect(cards.first()).toContainText(made)

  // ぜんぶ つくった状態で「つくってない」を見ると、から の知らせから戻れる
  await page.getByRole('radio', { name: 'ぜんぶ', exact: true }).click()
  await page.getByRole('button', { name: `${notMade} をおきにいりから はずす` }).click()
  await page.getByRole('radio', { name: 'つくってない', exact: true }).click()
  await expect(page.getByText('おきにいりは ぜんぶ つくったね！')).toBeVisible()
  await page.getByRole('button', { name: 'おきにいりを ぜんぶ みる' }).click()
  await expect(cards).toHaveCount(1)
})
