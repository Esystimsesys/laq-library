import { test, expect } from '@playwright/test'

/*
  検索窓が iPhone だけで画面の外へはみ出していた。.search の min-width が
  既定の auto のままだと、WebKit はその最小幅を中の input の既定幅
  （size=20 ＝ 20文字ぶん）から決めるため、flex:1 でも縮まない。
  Chromium では再現しないので、この spec だけ WebKit でも走らせる。
*/
const ROUTES = [
  './',
  './favorites',
  './made',
  './settings',
  './booklet/new',
  './assembly/metamon',
  `./model/${encodeURIComponent('laq-official:005337')}`,
]

test.beforeEach(async ({ page }) => {
  await page.route('https://fonts.**/*', route => route.abort())
  await page.route('https://www.laq.co.jp/**', route => route.abort())
})

async function pageWidths(page: import('@playwright/test').Page) {
  return page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    clientWidth: document.documentElement.clientWidth,
  }))
}

for (const route of ROUTES) {
  test(`${route} が横にはみ出さない`, async ({ page }) => {
    await page.goto(route)
    await expect(page.locator('main')).toBeVisible()
    const size = await pageWidths(page)
    expect(size.scrollWidth).toBe(size.clientWidth)
  })
}

/*
  はみ出しは、字が広い書体（本番は Zen Maru Gothic）で input の既定幅が
  ふくらんだときに出る。e2e はどの回も同じ結果になるよう Google Fonts を
  遮断しているので、代わりに字を大きくして同じ状態を作る。
  「入力欄の既定幅がどれだけ広くても、検索窓は画面に収まる」ことを見ている。
*/
test('入力欄の既定幅がふくらんでも検索窓は画面に収まる', async ({ page }) => {
  await page.goto('./')
  await expect(page.locator('main')).toBeVisible()
  await page.addStyleTag({ content: 'input[type="search"] { font-size: 40px }' })
  const size = await pageWidths(page)
  expect(size.scrollWidth).toBe(size.clientWidth)
})
