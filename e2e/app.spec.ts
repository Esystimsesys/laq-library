import { readFile } from 'node:fs/promises'
import { test, expect } from '@playwright/test'

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
  await page.goto('./')
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
  await page.locator('input[type=file]').setInputFiles({
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

test('登録をやめたら、選んだ写真は端末に残らない', async ({ page }) => {
  const png = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
    'base64',
  )
  await page.goto('./booklet/new')
  await page.locator('input[type=file]').setInputFiles({
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
