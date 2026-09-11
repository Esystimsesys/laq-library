import { test, expect } from '@playwright/test'
import { readFileSync } from 'node:fs'
const guide = JSON.parse(readFileSync(new URL('../public/assemblies/metamon/guide.json', import.meta.url), 'utf8'))
import { journey } from '../src/assemblies/journey'
import type { Guide } from '../src/assemblies/types'
const steps = journey(guide as Guide)
test.beforeEach(async ({ page }) => {
  await page.route(/^https:\/\/(fonts\.|www\.laq|purimatu)/, route => route.abort())
})
for (const width of [390, 1240]) {
  test(`メタモンの入口から完成まで ${width}px`, async ({ page }) => {
    test.setTimeout(180000)
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))
    await page.setViewportSize({ width, height: 900 })
    await page.goto('./model/purimatu%3Ametamon')
    const entry=page.getByRole('link', { name: /3Dで 作る/ })
    const source=page.getByRole('link', { name: 'ぷりまつラボの ページ', exact:true })
    await page.evaluate(() => document.fonts.ready)
    const a=await entry.boundingBox(), b=await source.boundingBox()
    expect(Math.abs(a!.y-b!.y)).toBeLessThan(3)
    expect(Math.abs(a!.width-b!.width)).toBeLessThan(1)
    expect(Math.abs(a!.height-b!.height)).toBeLessThan(1)
    const detailWidth = await entry.locator('..').evaluate(el => el.getBoundingClientRect().width)
    await expect(page.getByText('この まとまりを つくって、つなげよう')).toHaveCount(0)
    await entry.click()
    const iframe = page.locator('iframe'), viewer = page.frameLocator('iframe')
    await expect(iframe).toHaveAttribute('data-shown', 'welcome', { timeout: 30000 })
    expect(await viewer.locator('#stage canvas').count()).toBe(1)
    await expect(page.getByText('つくりかたの コツ',{exact:true})).toHaveCount(0)
    await expect(page.getByRole('note',{name:'この図について'})).toContainText('実物での差し込み')
    await expect(page.getByRole('region', {name:'つかう パーツの めやす'})).toBeVisible()
    await expect(page.getByRole('listitem', {name:/No.3 くろ/})).toBeVisible()
    await expect(page.getByRole('button', {name:'パーツ',exact:true})).toHaveCount(0)
    const diagramWidth = (await page.getByRole('region',{name:'まわせる 組み立て図'}).boundingBox())!.width
    expect(Math.abs(diagramWidth-detailWidth)).toBeLessThan(1)
    await page.getByRole('button', { name: 'ぜんたいの ながれ', exact: true }).click()
    await expect(page.getByRole('button', { name: 'てじゅん 2 うしろの からだを つくろう' })).toBeVisible()
    await page.getByRole('button', { name: 'いまの てじゅんに もどる' }).click()
    await page.screenshot({ path: `test-results/assembly-welcome-${width}.png`, fullPage: true })
    for (let at = 1; at < steps.length; at++) {
      await page.getByRole('navigation', { name: 'てじゅんを すすめる' }).getByRole('button').last().click()
      await expect(iframe).toHaveAttribute('data-shown', steps[at].key)
      const mainWidth = await page.evaluate(() => [document.documentElement.scrollWidth, document.documentElement.clientWidth])
      expect(mainWidth[0]).toBe(mainWidth[1])
      let frame = page.frames().find(f => f.url().includes('/assemblies/viewer/'))!
      const info = await frame.evaluate(() => (window as unknown as { __unitGuide: () => { visible: number; inFrame: boolean; actions: number } }).__unitGuide())
      expect(info.inFrame).toBe(true)
      if (steps[at].source) expect(info.visible).toBe(steps[at].source!.visiblePieces.length)
      if (steps[at].unit) await expect(page.getByRole('heading',{level:1})).toContainText(guide.displayLabels[steps[at].unit!])
      if (steps[at].phase==='assembly') {
        const inputIds=guide.variants[guide.defaultVariant].assembly[steps[at].step].inputs
        const tags=await viewer.locator('#stage .unit-label text').allTextContents()
        expect(tags.sort()).toEqual(inputIds.map((id:string)=>guide.displayLabels[id]).sort())
      }
      if (steps[at].key === 'unit:A2:0') {
        await expect(viewer.locator('#show-connections')).toBeHidden()
        await page.reload()
        await expect(page.locator('iframe')).toHaveAttribute('data-shown', 'unit:A2:0', { timeout: 30000 })
        frame = page.frames().find(f => f.url().includes('/assemblies/viewer/'))!
        await page.screenshot({ path: `test-results/assembly-A2-${width}.png`, fullPage: true })
      }
      if (steps[at].phase === 'assembly') {
        await expect(viewer.locator('#guide')).toBeHidden()
        await expect(viewer.locator('#stage .connection-arrow')).toHaveCount(guide.variants[guide.defaultVariant].assembly[steps[at].step].actions.length)
        await expect(viewer.locator('#stage .connection-arrow text')).toHaveCount(0)
      }
      if (steps[at].key === 'unit:C1:0') {
        expect(info.visible).toBe(8)
        await expect(viewer.locator('#guide')).toBeHidden()
        await page.screenshot({path:`test-results/assembly-C1-${width}.png`,fullPage:true})
      }
      if (steps[at].source) {
        const noOverlap = await frame.evaluate(() => {
          const screen = (window as unknown as { __unitGuide: () => { screenBounds: {left:number;right:number;top:number;bottom:number} } }).__unitGuide().screenBounds
          const stage = document.getElementById('stage')!.getBoundingClientRect()
          return [...document.querySelectorAll('#stage .unit-label rect')].every(rect => {
            const box=rect.getBoundingClientRect(), left=(box.left-stage.left)/stage.width*2-1, right=(box.right-stage.left)/stage.width*2-1
            return right < screen.left || left > screen.right
          })
        })
        expect(noOverlap).toBe(true)
      }
      if (steps[at].key === 'assembly:0') {
        await page.screenshot({ path: `test-results/assembly-merge-${width}.png`, fullPage: true })
        await page.getByRole('button', { name: 'A1 まえの からだ', exact: true }).click()
        await expect(iframe).toHaveAttribute('data-shown', 'unit:A1:0')
        await page.getByRole('button', { name: '← さっきの てじゅんに もどる' }).click()
        await expect(iframe).toHaveAttribute('data-shown', 'assembly:0')
      }
    }
    await page.getByRole('button', { name: '★ つくった！を きろく' }).click()
    await expect(page.getByRole('button', { name: '✓ つくった！ きろくずみ' })).toBeDisabled()
    await expect(page.getByText('17 / 17 できた')).toBeVisible()
    await page.goto('./assembly/metamon')
    await page.getByRole('button', { name: 'つづきから' }).click()
    await expect(page.locator('iframe')).toHaveAttribute('data-shown', 'done', { timeout: 30000 })
    expect(errors).toEqual([])
  })
}
test('図データが読み込めない場合に再試行できる', async ({ page }) => {
  await page.route('**/assemblies/metamon/guide.json', route => route.fulfill({ status: 503, body: '' }))
  await page.goto('./assembly/metamon')
  await expect(page.getByRole('alert')).toContainText('よみこめなかった')
  await page.unroute('**/assemblies/metamon/guide.json')
  await page.getByRole('button', { name: 'もういちど ひらく' }).click()
  await expect(page.locator('iframe')).toHaveAttribute('data-shown', 'welcome', { timeout: 30000 })
})

test('一度読み込んだ3Dの図はオフラインでも開ける', async ({ browser }) => {
  test.setTimeout(90000)
  const context = await browser.newContext({ serviceWorkers: 'allow', viewport: { width: 390, height: 844 } })
  const page = await context.newPage()
  try {
    await page.route(/^https:\/\/(fonts\.|www\.laq|purimatu)/, route => route.abort())
    await page.goto('http://127.0.0.1:4279/laq-library/assembly/metamon?at=2')
    await expect(page.locator('iframe')).toHaveAttribute('data-shown', 'unit:A1:0', { timeout: 30000 })
    await page.evaluate(async () => { await navigator.serviceWorker.ready })
    await expect.poll(() => page.evaluate(async () => Boolean(await caches.match('/laq-library/assemblies/metamon/guide.json', { ignoreSearch: true })))).toBe(true)
    await context.setOffline(true)
    await page.reload()
    await expect(page.locator('iframe')).toHaveAttribute('data-shown', 'unit:A1:0', { timeout: 30000 })
    await page.getByRole('button', { name: 'できた！ つぎへ →' }).click()
    await expect(page.locator('iframe')).toHaveAttribute('data-shown', 'unit:A2:0')
  } finally { await context.close() }
})

test('3D表示に失敗しても再試行でき、表示前に完了扱いにしない', async ({ page }) => {
  await page.route('**/assemblies/viewer/unit-instructions.js', route => route.abort())
  await page.goto('./assembly/metamon?at=2')
  await expect(page.getByRole('alert')).toContainText('図を ひらけなかった')
  await expect(page.getByRole('button', { name: 'できた！ つぎへ →' })).toBeDisabled()
  await page.unroute('**/assemblies/viewer/unit-instructions.js')
  await page.getByRole('button', { name: 'もういちど ひらく' }).click()
  await expect(page.locator('iframe')).toHaveAttribute('data-shown', 'unit:A1:0', { timeout: 30000 })
  await expect(page.getByRole('button', { name: 'できた！ つぎへ →' })).toBeEnabled()
})


test('旧URLの手順を保ち、C1は一枚の図で表示する', async ({page}) => {
  // Two full 3D page loads share this test budget; each load still has a 30s assertion.
  test.setTimeout(90000)
  await page.goto('./assembly/metamon?at=19')
  await expect(page.locator('iframe')).toHaveAttribute('data-shown','assembly:6',{timeout:30000})
  await page.goto('./assembly/metamon?step=unit:C1:0')
  await expect(page.locator('iframe')).toHaveAttribute('data-shown','unit:C1:0',{timeout:30000})
  await expect(page.frameLocator('iframe').locator('#guide')).toBeHidden()
  await expect(page.getByText(/まえを とじよう/)).toHaveCount(0)
  await expect(page.getByText(/ピース/)).toHaveCount(0)
})
