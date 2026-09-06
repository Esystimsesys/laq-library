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
