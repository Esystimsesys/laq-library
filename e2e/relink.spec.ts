import { test, expect } from '@playwright/test'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { once } from 'node:events'
import { initWorkspace } from '../scripts/author-assembly.mjs'
import { createReviewServer } from '../scripts/review-assembly.mjs'
import { attachPiece } from '../tools/assembly-review/pieces.js'

const square = (id: string, shift: number) => ({ id, partNo: 1, color: 'white',
  pose: { vertices: [[shift,0,0],[shift+1,0,0],[shift+1,1,0],[shift,1,0]], normal: [0,0,1] } })

/** p — j1 — m — j2 — tip in one group, with a spare No.5 on q to move the branch onto. */
function chainGuide() {
  const guide: any = { title: '付け替えのテスト', article: 'https://example.com/', defaultVariant: 'test', photos: [], limits: [], variants: { test: {
    label: '確認', model: { version: 1, pieces: [square('p', 0), square('q', 3)], connections: [] },
    units: [
      { id: 'A', label: 'くさり', quantity: 1, pieceIds: ['p'], steps: [{ id: 'a', title: 'くさりを つくろう', visiblePieces: ['p'], newPieces: ['p'], actions: [] }] },
      { id: 'B', label: 'どだい', quantity: 1, pieceIds: ['q'], steps: [{ id: 'b', title: 'どだいを つくろう', visiblePieces: ['q'], newPieces: ['q'], actions: [] }] },
    ],
    assembly: [{ id: 'ab', title: 'くさりを どだいに つけよう', inputs: ['A','B'], result: 'AB', visiblePieces: ['p','q'], newPieces: ['q'], actions: [] }], finished: 'AB',
  } } }
  attachPiece(guide, { targetId: 'p', targetSlot: 0, partNo: 6, id: 'j1' })
  attachPiece(guide, { targetId: 'j1', targetSlot: 1, partNo: 1, id: 'm' })
  attachPiece(guide, { targetId: 'm', targetSlot: 2, partNo: 7, id: 'j2' })
  attachPiece(guide, { targetId: 'j2', targetSlot: 2, partNo: 2, id: 'tip' })
  attachPiece(guide, { targetId: 'q', targetSlot: 0, partNo: 5, id: 'j3' })
  return guide
}

test('接続を1つ選んで付け替え、つながったパーツごと動かして残りの接続を保てる', async ({ page }) => {
  test.setTimeout(60000)
  const dir = mkdtempSync(path.join(tmpdir(), 'laq-relink-')), workspace = path.join(dir, 'work')
  initWorkspace({ workspace, slug: 'relink-test', modelId: 'purimatu:metamon', title: '付け替えのテスト', article: 'https://example.com/', fromGuide: 'public/assemblies/metamon/guide.json' })
  const file = path.join(workspace, 'guide.json')
  const before = chainGuide()
  writeFileSync(file, JSON.stringify(before))
  const pose = (guide: any, id: string) => JSON.stringify(guide.variants.test.model.pieces.find((p: any) => p.id === id).pose.vertices
    ?? guide.variants.test.model.pieces.find((p: any) => p.id === id).pose.center)
  const server = createReviewServer({ workspace }); server.listen(0, '127.0.0.1'); await once(server, 'listening')
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message))
  try {
    await page.setViewportSize({ width: 1440, height: 1100 })
    await page.goto(`http://127.0.0.1:${(server.address() as { port: number }).port}/`)
    await expect(page.frameLocator('#viewer').locator('#loading')).toBeHidden({ timeout: 30000 })
    await page.locator('#piece').selectOption('m')
    // Both of the plate's connections are listed, and only the picked one is released.
    await expect(page.locator('#connections li')).toHaveCount(2)
    await expect(page.locator('#release-link option')).toHaveCount(2)
    await expect(page.locator('#reattach-own')).toHaveValue('0')
    await page.locator('#release-link').selectOption({ index: 1 })
    await expect(page.locator('#reattach-own')).toHaveValue('2')
    await page.locator('#reattach-own').selectOption('1')
    await page.locator('#reattach-target').selectOption('j3')
    await expect(page.locator('#reattach-own')).toHaveValue('1')
    await page.locator('#release-link').selectOption({ index: 0 })
    await expect(page.locator('#reattach-own')).toHaveValue('0')
    // j2 and tip move with the plate, so they are not offered as a new partner.
    const targets = await page.locator('#reattach-target option').evaluateAll(options => (options as HTMLOptionElement[]).map(option => option.value))
    expect(targets).toEqual(['j1', 'j3'])
    await page.locator('#reattach-target').selectOption('j3')
    await expect(page.locator('#reattach-preview')).toContainText('動くパーツ 3 個')
    await expect(page.locator('#reattach-preview')).toContainText('残る接続 1 件')
    await page.locator('#reattach-piece').click()
    await expect(page.locator('#message')).toContainText('動いたパーツ 3 個')
    await page.locator('#save').click(); await expect(page.locator('#message')).toContainText('変更を保存しました')
    const after = JSON.parse(readFileSync(file, 'utf8'))
    for (const id of ['p','q','j1','j3']) expect(pose(after, id)).toEqual(pose(before, id))
    for (const id of ['m','j2','tip']) expect(pose(after, id)).not.toEqual(pose(before, id))
    const ports = after.variants.test.model.connections.flatMap((c: any) => c.ports.map((port: any) => `${c.joint}:${port.port}:${port.piece}:${port.socket}`)).sort()
    expect(ports).toEqual(['j1:0:p:0', 'j2:0:m:2', 'j2:2:tip:0', 'j3:0:q:0', 'j3:1:m:0'])
    // The relinked branch keeps its shape, so the new joint can still name its own orientation.
    await expect(page.locator('#piece')).toHaveValue('m')
    await page.locator('#piece').selectOption('j3')
    await expect(page.locator('#orientation-status')).not.toContainText('ずれています')
    await page.setViewportSize({ width: 390, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391)
    await page.locator('#relink-panel').screenshot({ path: 'test-results/relink-mobile.png' })
    expect(errors).toEqual([])
  } finally {
    await page.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); rmSync(dir, { recursive: true, force: true })
  }
})
