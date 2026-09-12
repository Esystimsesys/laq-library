import { expect, test } from '@playwright/test'

test('デスカーンの統合した15手順を表示する', async ({ page }) => {
  test.setTimeout(90000)
  await page.goto('./assembly/desukan?step=unit%3Abody%3A0')

  await expect(page.getByRole('progressbar')).toHaveAttribute('max', '15')
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '3')
  await expect(page.locator('iframe')).toHaveAttribute('data-shown', 'unit:body:0', { timeout: 30000 })
  await expect(page.frameLocator('iframe').locator('#step-title')).toContainText('まえと そこ')
  await expect(page.frameLocator('iframe').locator('#fit')).toBeHidden()
  const stage = await page.frameLocator('iframe').locator('#stage').boundingBox()
  expect(stage!.height).toBeGreaterThanOrEqual(420)
  const initialView = await page.frames().find(frame => frame.url().includes('/assemblies/viewer/'))!.evaluate(() => (window as unknown as { __unitGuide: () => { zoom: number; screenBounds: { left: number; right: number } } }).__unitGuide())
  await page.frameLocator('iframe').getByRole('button', { name: '＋ 大きく' }).click()
  const enlargedView = await page.frames().find(frame => frame.url().includes('/assemblies/viewer/'))!.evaluate(() => (window as unknown as { __unitGuide: () => { zoom: number; screenBounds: { left: number; right: number } } }).__unitGuide())
  expect(enlargedView.zoom).toBeGreaterThan(initialView.zoom)
  expect(enlargedView.screenBounds.right - enlargedView.screenBounds.left).toBeGreaterThan(initialView.screenBounds.right - initialView.screenBounds.left)
  await page.frameLocator('iframe').getByRole('button', { name: '− 小さく' }).click()
  const viewerBottom = await page.getByRole('region', { name: 'まわせる 組み立て図' }).evaluate(element => element.getBoundingClientRect().bottom + scrollY)
  const quickNavBottom = await page.getByRole('navigation', { name: '図を えらぶ' }).evaluate(element => element.getBoundingClientRect().bottom + scrollY)
  const quickNavTop = await page.getByRole('navigation', { name: '図を えらぶ' }).evaluate(element => element.getBoundingClientRect().top + scrollY)
  expect(quickNavTop).toBeGreaterThanOrEqual(viewerBottom)
  await page.getByRole('button', { name: 'ぜんたいの ながれ', exact: true }).click()
  const flowMapTop = await page.getByRole('region', { name: 'ぜんたいの ながれ' }).evaluate(element => element.getBoundingClientRect().top + scrollY)
  expect(flowMapTop).toBeGreaterThanOrEqual(quickNavBottom)
  await page.getByRole('button', { name: 'いまの てじゅんに もどる' }).click()

  const next = page.getByRole('navigation', { name: 'てじゅんを すすめる' }).getByRole('button', { name: /つぎへ/ })
  await next.click()
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '4')
  await expect(page.locator('iframe')).toHaveAttribute('data-shown', 'unit:body:1', { timeout: 30000 })
  await expect(page.frameLocator('iframe').locator('#step-title')).toContainText('りょうがわの かべと てんじょう')

  const viewer = page.frames().find(frame => frame.url().includes('/assemblies/viewer/'))!
  await page.frameLocator('iframe').locator('#explode').fill('100')
  await page.frameLocator('iframe').locator('#explode').dispatchEvent('input')
  const separated = await viewer.evaluate(async () => {
    await new Promise(requestAnimationFrame)
    const host = window as unknown as {
      __unitGuide: () => { pieceScreens: { id: string; offset: number[] }[] }
      __LaQLibraryGuide: { defaultVariant: string; variants: Record<string, { units: { id: string; steps: { newPieces: string[]; explodeGroups: string[][] }[] }[] }> }
    }
    const guide = host.__LaQLibraryGuide
    const step = guide.variants[guide.defaultVariant].units.find(unit => unit.id === 'body')!.steps[1]
    return { ...host.__unitGuide(), newPieces: step.newPieces, explodeGroups: step.explodeGroups }
  })
  const offsets = new Map(separated.pieceScreens.map(piece => [piece.id, piece.offset]))
  const moved = (offset: number[]) => offset.some(value => Math.abs(value) > 1e-8)
  expect(separated.pieceScreens.filter(piece => !separated.newPieces.includes(piece.id)).every(piece => !moved(piece.offset))).toBe(true)
  for (const group of separated.explodeGroups) {
    expect(group.every(id => moved(offsets.get(id)!))).toBe(true)
    expect(new Set(group.map(id => JSON.stringify(offsets.get(id)))).size).toBe(1)
  }
  expect(new Set(separated.explodeGroups.map(group => JSON.stringify(offsets.get(group[0])))).size).toBe(3)

  await next.click()
  await expect(page.locator('iframe')).toHaveAttribute('data-shown', 'unit:body:2', { timeout: 30000 })
  await expect(page.frameLocator('iframe').locator('#step-title')).toContainText('せなか')

  await next.click()
  await expect(page.locator('iframe')).toHaveAttribute('data-shown', 'unit:body:3', { timeout: 30000 })
  await expect(page.frameLocator('iframe').locator('#step-title')).toContainText('えり')
})
