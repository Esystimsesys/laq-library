import { test, expect } from '@playwright/test'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { once } from 'node:events'
import { initWorkspace } from '../scripts/author-assembly.mjs'
import { createReviewServer } from '../scripts/review-assembly.mjs'

test('ピースをはめて交換・つなぎ直し・削除し、戻す・保存・再開できる', async ({ page }) => {
  test.setTimeout(60000)
  const dir = mkdtempSync(path.join(tmpdir(), 'laq-pieces-')), workspace = path.join(dir, 'work')
  const photo = path.join(dir, 'photo.png')
  writeFileSync(photo, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64'))
  initWorkspace({ workspace, slug: 'pieces-test', modelId: 'purimatu:metamon', title: 'Pieces test', article: 'https://example.com/', photos: [photo], fromGuide: 'public/assemblies/metamon/guide.json' })
  const file = path.join(workspace, 'guide.json'), readGuide = () => JSON.parse(readFileSync(file, 'utf8'))
  const initial = readGuide(), model = initial.variants[initial.defaultVariant].model
  const target = model.pieces.find((p: any) => p.partNo <= 2 && model.connections.flatMap((c: any) => c.ports).filter((port: any) => port.piece === p.id).length < p.pose.vertices.length)
  const server = createReviewServer({ workspace }); server.listen(0, '127.0.0.1'); await once(server, 'listening')
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message))
  try {
    await page.setViewportSize({ width: 1440, height: 1100 })
    await page.goto(`http://127.0.0.1:${(server.address() as { port: number }).port}/`)
    await expect(page.frameLocator('#viewer').locator('#loading')).toBeHidden({ timeout: 30000 })
    await page.locator('#piece').selectOption(target.id)
    const unit=initial.variants[initial.defaultVariant].units.find((u:any)=>u.pieceIds.includes(target.id))
    const stepIndex=unit.steps.findIndex((s:any)=>s.visiblePieces.includes(target.id)),stepKey=`unit:${unit.id}:${stepIndex}`
    await page.locator('#step').selectOption(stepKey)
    const viewer=page.frames().find(frame=>frame.url().includes('/assemblies/viewer/'))!
    await viewer.locator('#explode').fill('35');await viewer.locator('#explode').dispatchEvent('change')
    await viewer.locator('#zoom-in').click()
    const beforeView=await viewer.evaluate(()=>(window as any).__unitGuide())
    await expect(page.frameLocator('#viewer').locator('.edit-slot-marker')).toBeVisible()
    await page.locator('#add-part').selectOption('6'); await page.locator('#add-color').selectOption('red')
    await page.locator('#attach-piece').click(); await expect(page.locator('#message')).toContainText('パーツをはめました')
    const joint = await page.locator('#piece').inputValue()
    expect(joint).toMatch(/^manual-/)
    await expect(page.locator('#step')).toHaveValue(stepKey)
    await expect.poll(()=>viewer.evaluate(id=>(window as any).__unitGuide().renderedIds.includes(id),joint)).toBe(true)
    const afterView=await viewer.evaluate(()=>(window as any).__unitGuide())
    for(const key of ['phase','unit','step','zoom','explode'])expect(afterView[key]).toEqual(beforeView[key])
    expect(readGuide()).toEqual(initial)
    const assemblyKey=`assembly:${initial.variants[initial.defaultVariant].assembly.length-1}`
    await page.locator('#step').selectOption(assemblyKey)
    await page.locator('#add-part').selectOption('2'); await page.locator('#attach-piece').click()
    await expect(page.locator('#message')).toContainText('パーツをはめました')
    const plate = await page.locator('#piece').inputValue(); expect(plate).not.toBe(joint)
    await expect(page.locator('#step')).toHaveValue(assemblyKey)
    await expect.poll(()=>viewer.evaluate(id=>{const view=(window as any).__unitGuide();return view.phase==='assembly'&&view.renderedIds.includes(id)},plate)).toBe(true)
    await page.locator('#transform-panel summary').click()
    await page.locator('#replace-part').selectOption('1'); await page.locator('#replace-piece').click()
    await expect(page.locator('#piece-info')).toContainText('No.1')
    await page.locator('#reattach-target').selectOption(joint)
    await page.locator('#reattach-piece').click(); await expect(page.locator('#message')).toContainText('つなぎ直し')
    await page.locator('#evidence-panel summary').click()
    await page.locator('#observation').fill('追加した四角を確認'); await page.locator('#add-evidence').click()
    await page.locator('#comment-text').fill('追加したパーツのコメント'); await page.locator('#comment-pieces').check(); await page.locator('#add-comment').click()
    await expect(page.locator('#comment-status')).toContainText('コメントを保存しました')
    await page.locator('#save').click(); await expect(page.locator('#message')).toContainText('変更を保存しました')
    let saved = readGuide().variants[initial.defaultVariant].model
    expect(saved.pieces.length).toBe(model.pieces.length + 2)
    expect(saved.pieces.find((p: any) => p.id === plate).partNo).toBe(1)
    expect(JSON.parse(readFileSync(path.join(workspace, 'review.json'), 'utf8')).evidence.at(-1).pieceIds).toContain(plate)
    await page.locator('#delete-piece').click(); await expect(page.locator('#message')).toContainText('選択パーツを接続・手順から削除')
    await page.locator('#undo').click(); await expect(page.locator('#piece option')).toHaveCount(model.pieces.length + 2)
    await page.locator('#piece').selectOption(plate); await page.locator('#delete-piece').click()
    await page.locator('#save').click(); await expect(page.locator('#message')).toContainText('変更を保存しました')
    saved = readGuide().variants[initial.defaultVariant].model
    expect(saved.pieces.length).toBe(model.pieces.length + 1)
    expect(saved.connections.flatMap((c: any) => c.ports).some((port: any) => port.piece === plate)).toBe(false)
    const review = JSON.parse(readFileSync(path.join(workspace, 'review.json'), 'utf8'))
    expect(review.evidence.at(-1).pieceIds).toEqual([])
    expect(review.comments.at(-1).pieceIds).toContain(plate)
    await page.reload(); await expect(page.locator('#piece option')).toHaveCount(model.pieces.length + 1)
    await page.setViewportSize({ width: 390, height: 844 })
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(391)
    await page.locator('#transform-panel').screenshot({ path: 'test-results/piece-editor-mobile.png' })
    expect(errors).toEqual([])
  } finally {
    await page.close(); server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve())); rmSync(dir, { recursive: true, force: true })
  }
})
