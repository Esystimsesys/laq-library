import { test, expect } from '@playwright/test'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { once } from 'node:events'
import { initWorkspace } from '../scripts/author-assembly.mjs'
import { createReviewServer } from '../scripts/review-assembly.mjs'

test('ミニシャフトとホイールを追加・保存し、再読込後も接続矢印と部品の形を表示できる', async ({ page }) => {
  test.setTimeout(60000)
  const dir = mkdtempSync(path.join(tmpdir(), 'laq-special-')), workspace = path.join(dir, 'work')
  const photo = path.join(dir, 'photo.png')
  writeFileSync(photo, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64'))
  initWorkspace({ workspace, slug: 'special-test', modelId: 'purimatu:special-test', title: '特殊パーツの確認', article: 'https://example.com/', photos: [photo] })
  const file = path.join(workspace, 'guide.json'), readGuide = () => JSON.parse(readFileSync(file, 'utf8'))
  writeFileSync(file, JSON.stringify({
    title: '特殊パーツの確認', displayName: '特殊パーツ', article: 'https://example.com/', defaultVariant: 'test', photos: [], limits: [],
    variants: { test: { label: 'テスト', model: { version: 1, pieces: [
      { id: 'base', partNo: 1, color: 'red', pose: { vertices: [[3,4,2],[4,4,2],[4,5,2],[3,5,2]], normal: [0,0,1] } },
    ], connections: [] }, units: [{ id: 'A', label: '車軸', quantity: 1, pieceIds: ['base'], steps: [
      { id: 'a', title: '車軸を組む', visiblePieces: ['base'], newPieces: ['base'], actions: [] },
    ] }], assembly: [], finished: 'A' } },
  }))
  const initial = readGuide(), server = createReviewServer({ workspace })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  const errors: string[] = []; page.on('pageerror', error => errors.push(error.message))
  try {
    await page.setViewportSize({ width: 1440, height: 1100 })
    await page.goto(`http://127.0.0.1:${(server.address() as { port: number }).port}/`)
    const viewer = page.frameLocator('#viewer')
    await expect(viewer.locator('#loading')).toBeHidden({ timeout: 30000 })
    await page.locator('#step').selectOption('unit:A:0')
    await page.locator('#piece').selectOption('base')
    await page.locator('#attach-slot').selectOption('0')
    await page.locator('#add-part').selectOption('mini-shaft')
    await page.locator('#attach-piece').click()
    await expect(page.locator('#message')).toContainText('パーツをはめました')
    await expect(page.locator('#piece')).not.toHaveValue('base')
    const shaft = await page.locator('#piece').inputValue()
    await page.locator('#attach-slot').selectOption('3')
    await expect(page.locator('#add-part option')).toHaveCount(1)
    await page.locator('#add-part').selectOption('mini-wheel')
    await expect(page.locator('#add-color')).toBeDisabled()
    await page.locator('#attach-piece').click()
    await expect(page.locator('#message')).toContainText('パーツをはめました')
    await expect(page.locator('#piece')).not.toHaveValue(shaft)
    const wheel = await page.locator('#piece').inputValue()
    await expect(page.locator('#attach-piece')).toBeDisabled()
    await page.locator('#piece').selectOption(shaft)
    await page.locator('#attach-slot').selectOption('2')
    await page.locator('#add-part').selectOption('2')
    await page.locator('#attach-piece').click()
    await expect(page.locator('#message')).toContainText('パーツをはめました')
    await expect(page.locator('#piece')).not.toHaveValue(shaft)
    const triangle = await page.locator('#piece').inputValue()
    expect(readGuide()).toEqual(initial)
    await page.locator('#save').click()
    await expect(page.locator('#message')).toContainText('変更を保存しました')
    const saved = readGuide().variants.test
    expect(saved.model.pieces.map((p: any) => p.partNo)).toEqual([1, 'mini-shaft', 'mini-wheel', 2])
    expect(saved.model.axleConnections).toEqual([{ shaft, wheel }])
    expect(saved.units[0].steps[0].actions).toContainEqual({ kind: 'axle', shaft, wheel })
    await page.reload()
    await expect(viewer.locator('#loading')).toBeHidden({ timeout: 30000 })
    await expect(page.locator('#piece option')).toHaveCount(4)
    await page.locator('#step').selectOption('unit:A:0')
    const frame = page.frames().find(item => item.url().includes('/assemblies/viewer/'))!
    await expect.poll(() => frame.evaluate(() => (window as any).__unitGuide().renderedIds)).toEqual(expect.arrayContaining(['base', shaft, wheel, triangle]))
    await viewer.locator('#explode').fill('0'); await viewer.locator('#explode').dispatchEvent('change')
    // Model Z points up in the viewer. Check a translated assembly so losing a
    // part's stored position cannot pass accidentally at the origin.
    const screens = await frame.evaluate(() => (window as any).__unitGuide().pieceScreens)
    for (const id of [shaft, wheel]) {
      const [x, y, z] = saved.model.pieces.find((p: any) => p.id === id).pose.center
      const expected = [x, z, -y], bounds = screens.find((p: any) => p.id === id).worldBounds
      for (let i = 0; i < 3; i++) {
        expect(bounds.min[i]).toBeLessThanOrEqual(expected[i] + 1e-5)
        expect(bounds.max[i]).toBeGreaterThanOrEqual(expected[i] - 1e-5)
        if (id === wheel) expect((bounds.min[i] + bounds.max[i]) / 2).toBeCloseTo(expected[i], 5)
      }
    }
    await viewer.locator('#explode').fill('60'); await viewer.locator('#explode').dispatchEvent('change')
    await expect(viewer.locator('.connection-arrow')).toHaveCount(3)
    const paths = await viewer.locator('.connection-path').evaluateAll(elements => elements.map(element => element.getAttribute('d')))
    expect(paths.every(d => d && !/NaN|Infinity/.test(d))).toBe(true)
    for (const partNo of ['mini-shaft', 'mini-wheel']) {
      await frame.evaluate(partNo => (window as any).LaQLibraryViewer.show({ phase: 'parts', partNo }), partNo)
      await expect.poll(() => frame.evaluate(() => (window as any).__unitGuide().preview)).toBe(partNo)
      await expect(viewer.locator('#guide')).toBeVisible()
      await expect(viewer.locator('#detail-stage canvas')).toBeVisible()
      const images = await frame.evaluate(() => (window as any).LaQLibraryViewer.images())
      expect(images[`part:${partNo}:black`]).toMatch(/^data:image\/png/)
    }
    await page.locator('#step').selectOption('complete')
    await page.locator('#step').selectOption('unit:A:0')
    await viewer.locator('#explode').fill('40'); await viewer.locator('#explode').dispatchEvent('change')
    await page.locator('#piece').selectOption(shaft)
    await page.locator('#viewer').screenshot({ path: 'test-results/special-parts.png' })
    expect(errors).toEqual([])
  } finally {
    await page.close(); server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
    rmSync(dir, { recursive: true, force: true })
  }
})
