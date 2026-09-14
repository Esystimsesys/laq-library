import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { journey } from '../src/assemblies/journey'
import type { Guide } from '../src/assemblies/types'

const guide = JSON.parse(readFileSync(new URL('../public/assemblies/giant-hornet/guide.json', import.meta.url), 'utf8')) as Guide
const steps = journey(guide)

test('オオスズメバチをオリジナル作品として検索し、6手順の3Dガイドで作れる', { tag: '@smoke' }, async ({ page }) => {
  test.setTimeout(90000)
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))

  await page.goto('./')
  await expect(page.locator('a[href*="/model/"]').first()).toHaveAttribute('href', /original%3Agiant-hornet$/)
  await page.getByRole('searchbox').fill('オオスズメバチ')
  const card = page.getByRole('link', { name: /オオスズメバチ/ })
  await expect(card).toBeVisible()
  await expect(card.getByText('オリジナル', { exact: true })).toBeVisible()
  await expect.poll(() => card.getByRole('img', { name: 'オオスズメバチ のしゃしん' })
    .evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(1000)
  await card.click()

  await expect(page.getByRole('heading', { level: 1 })).toHaveText('オオスズメバチ')
  await expect.poll(() => page.getByRole('img', { name: 'オオスズメバチ の かんせいひん' })
    .evaluate(image => (image as HTMLImageElement).naturalWidth)).toBeGreaterThan(1000)
  await expect(page.getByText('オリジナルのLaQ作品。', { exact: false })).toHaveCount(0)
  await expect(page.getByText('これは オリジナルの さくひんです。')).toBeVisible()
  await expect(page.getByText('3Dモデルと つくりかたは このアプリに あります。')).toHaveCount(0)
  await expect(page.locator('a[href^="http://localhost"]')).toHaveCount(0)
  await page.getByRole('link', { name: '3Dで 作る' }).click()

  const iframe = page.locator('iframe')
  const viewer = page.frameLocator('iframe')
  await expect(iframe).toHaveAttribute('data-shown', 'welcome', { timeout: 30000 })
  await expect(page.getByRole('note', { name: 'この図について' })).toContainText('オリジナル作品')
  await expect(page.getByRole('note', { name: 'この図について' })).toContainText('再組み立ては未確認')
  await expect(page.getByRole('listitem', { name: /ミニシャフト くろ 2こ/ })).toBeVisible()
  await expect(page.getByRole('listitem', { name: /ミニホイール くろ 2こ/ })).toBeVisible()

  await page.getByRole('button', { name: 'ぜんたいの ながれ' }).click()
  await expect(page.getByRole('region', { name: 'ぜんたいの ながれ' }).getByRole('listitem')).toHaveCount(6)
  await page.getByRole('button', { name: 'いまの てじゅんに もどる' }).click()

  for (const step of steps.slice(1)) {
    await page.getByRole('navigation', { name: 'てじゅんを すすめる' }).getByRole('button').last().click()
    await expect(iframe).toHaveAttribute('data-shown', step.key)
    if (step.source) {
      const frame = page.frames().find(item => item.url().includes('/assemblies/viewer/'))!
      const info = await frame.evaluate(() => (window as unknown as { __unitGuide: () => { visible: number; renderedIds: string[] } }).__unitGuide())
      expect(info.visible).toBe(step.source.visiblePieces.length)
      if (step.key === 'group:body-eyes') {
        expect(info.renderedIds).toEqual(expect.arrayContaining(['eye-right-shaft', 'eye-right-wheel', 'eye-left-shaft', 'eye-left-wheel']))
        await expect(viewer.locator('#stage canvas')).toBeVisible()
      }
    }
  }

  await expect(page.getByText('てじゅん 6 / 6')).toBeVisible()
  expect(errors).toEqual([])
})
