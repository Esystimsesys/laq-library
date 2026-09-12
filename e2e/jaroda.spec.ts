import { test, expect } from '@playwright/test'
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs'
import { once } from 'node:events'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { createReviewServer } from '../scripts/review-assembly.mjs'
import { initWorkspace } from '../scripts/author-assembly.mjs'

const guide = JSON.parse(readFileSync(new URL('../public/assemblies/jaroda/guide.json', import.meta.url), 'utf8'))
const variant = guide.variants[guide.defaultVariant]

test('レビュー修正：鼻の左右ジョイントを閉じる手順で追加し、変更した口で首を合体する', async ({ page }) => {
  test.setTimeout(120000)
  await page.route(/^https:\/\/(fonts\.|www\.laq|purimatu)/, route => route.abort())
  await page.setViewportSize({ width: 1240, height: 1000 })
  await page.goto('./assembly/jaroda?step=unit:head:0')
  const iframe = page.locator('iframe')
  await expect(iframe).toHaveAttribute('data-shown', 'unit:head:0', { timeout: 60000 })
  const frame = page.frames().find(frame => frame.url().includes('/assemblies/viewer/'))!
  const rendered = () => frame.evaluate(() => (window as unknown as { __unitGuide: () => { renderedIds: string[] } }).__unitGuide().renderedIds)
  const closingIds = ['head-nose-left-j', 'head-nose-right-j', 'head-nose',
    'head-roof-left-j', 'head-roof-right-j', 'head-back-left-j', 'head-back-right-j',
    'head-back-right-extension', 'head-back-right-extension-j']
  for (const id of closingIds) expect(await rendered()).not.toContain(id)
  await page.screenshot({path:'test-results/jaroda-comment-head1.png',fullPage:true})
  await page.getByRole('navigation', { name: 'てじゅんを すすめる' }).getByRole('button').last().click()
  await expect(iframe).toHaveAttribute('data-shown', 'unit:head:1')
  for (const id of closingIds) expect(await rendered()).toContain(id)
  const parts = new Map(variant.model.pieces.map((p: {id:string;partNo:number;color:string}) => [p.id,p]))
  expect(parts.has('rear-head-j')).toBe(false)
  expect(parts.has('rear-bridge')).toBe(false)
  for (const id of ['head-nose-left-j','head-nose-right-j']) expect(parts.get(id)).toMatchObject({color:'lime'})
  expect(parts.get('head-bottom-right-j')).toMatchObject({partNo:6})
  expect(parts.get('head-back-right-j')).toMatchObject({partNo:7})
  expect(parts.get('head-back-right-extension')).toMatchObject({partNo:2,color:'lime'})
  expect(parts.get('head-back-right-extension-j')).toMatchObject({partNo:7,color:'lime'})
  for (const side of ['left','right']) {
    expect(parts.get(`rear-${side}-tip-j`)).toMatchObject({partNo:5})
    expect(parts.get(`neck-chest-${side}`)).toMatchObject({partNo:3,color:'white'})
    expect(parts.get(`neck-front-${side}`)).toMatchObject({partNo:2,color:'white'})
    expect(parts.get(`neck-chest-${side}-front-j`)).toMatchObject({partNo:6,color:'white'})
  }
  await page.screenshot({path:'test-results/jaroda-comment-head2.png',fullPage:true})
  for (const key of ['unit:rearhead:0','assembly:0','unit:neck:0','unit:neck:1','assembly:1']) {
    await page.getByRole('navigation', { name: 'てじゅんを すすめる' }).getByRole('button').last().click()
    await expect(iframe).toHaveAttribute('data-shown', key)
    if(key==='unit:neck:0') {
      for (const id of ['neck-front-left','neck-front-right','neck-chest-left-front-j','neck-chest-right-front-j']) expect(await rendered()).toContain(id)
      await page.screenshot({path:'test-results/jaroda-comment-neck.png',fullPage:true})
    }
  }
  const arrows=page.frameLocator('iframe').locator('#stage .connection-arrow')
  await expect(arrows).toHaveCount(variant.assembly[1].actions.length)
  expect(variant.assembly[1].actions.every((a:{joint:string}) => a.joint!=='head-bottom-right-j')).toBe(true)
  await page.screenshot({path:'test-results/jaroda-comment-neck-join.png',fullPage:true})
})

test('制作室で英語の内部IDを表示せず、まとまりの共通IDと日本語のパーツ・色を表示する', async ({page}) => {
  test.setTimeout(90000)
  const dir=mkdtempSync(path.join(tmpdir(),'laq-jaroda-labels-')),workspace=path.join(dir,'work'),photo=path.join(dir,'photo.png')
  writeFileSync(photo,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64'))
  initWorkspace({workspace,slug:'jaroda-labels',modelId:'purimatu:jaroda',title:'ジャローダ',article:'https://example.com/',photos:[photo],fromGuide:'public/assemblies/jaroda/guide.json'})
  const source=structuredClone(guide);delete source.displayLabels
  writeFileSync(path.join(workspace,'guide.json'),JSON.stringify(source,null,2)+'\n')
  const server=createReviewServer({workspace})
  server.listen(0,'127.0.0.1');await once(server,'listening')
  const address=server.address() as {port:number}
  try {
    await page.setViewportSize({width:1440,height:1100})
    await page.goto(`http://127.0.0.1:${address.port}/`)
    const frame=page.frameLocator('#viewer')
    await expect(frame.locator('#loading')).toBeHidden({timeout:60000})
    await page.locator('#step').selectOption('unit:rearhead:0')
    await page.locator('#piece').selectOption('rear-center-mount')
    await expect(page.locator('#piece option:checked')).toContainText('B1のパーツ')
    await expect(page.locator('#piece option:checked')).toContainText('黄緑')
    await expect(page.locator('#color option:checked')).toHaveText('黄緑')
    await expect(frame.locator('#stage .unit-label text')).toHaveText('B1')
    await expect(frame.locator('#step-title')).toContainText('B1')
    for(const selector of ['#piece','#connections','#comment-pieces-label','#comments .context'])
      expect(await page.locator(selector).allTextContents()).not.toEqual(expect.arrayContaining([expect.stringMatching(/rear-|head-|lime|yellow/)]))
    await page.screenshot({path:'test-results/jaroda-review-labels.png',fullPage:true})
  } finally {
    await page.close();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()))
    rmSync(dir,{recursive:true,force:true})
  }
})

test('同じ番号の部品見本を同じ大きさにし、複数図の案内と未分解時の矢印を表示しない', async ({page}) => {
  test.setTimeout(90000)
  await page.route(/^https:\/\/(fonts\.|www\.laq|purimatu)/, route => route.abort())
  await page.setViewportSize({width:390,height:1000})
  await page.goto('./assembly/jaroda')
  const iframe=page.locator('iframe'),viewer=page.frameLocator('iframe')
  await expect(iframe).toHaveAttribute('data-shown','welcome',{timeout:60000})
  const inventory=page.getByRole('region',{name:'つかう パーツの めやす'})
  for(const color of ['みどり','きみどり','オレンジ'])await expect(inventory).toContainText(color)
  await expect(inventory).not.toContainText(/green|lime|orange/)
  const partSizes=await page.getByRole('region',{name:'つかう パーツの めやす'}).locator('img').evaluateAll(async images=>{
    const sizes:Record<string,Array<{width:number;height:number}>>={}
    for(const image of images as HTMLImageElement[]){
      await image.decode()
      const canvas=document.createElement('canvas');canvas.width=image.naturalWidth;canvas.height=image.naturalHeight
      const context=canvas.getContext('2d')!;context.drawImage(image,0,0)
      const pixels=context.getImageData(0,0,canvas.width,canvas.height).data
      let left=canvas.width,right=-1,top=canvas.height,bottom=-1
      for(let y=0;y<canvas.height;y++)for(let x=0;x<canvas.width;x++)if(pixels[(y*canvas.width+x)*4+3]){left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y)}
      const no=image.closest('li')!.querySelector('b')!.textContent!
      ;(sizes[no]??=[]).push({width:right-left+1,height:bottom-top+1})
    }
    return sizes
  })
  for(const sizes of Object.values(partSizes))for(const size of sizes.slice(1))expect(size).toEqual(sizes[0])

  await page.goto('./assembly/jaroda?step=unit:head:0')
  await expect(iframe).toHaveAttribute('data-shown','unit:head:0',{timeout:60000})
  await page.getByText(/この図の パーツを見る/).click()
  await expect(page.locator('details').filter({hasText:'この図の パーツを見る'})).toContainText('オレンジ')
  await expect(page.locator('details').filter({hasText:'この図の パーツを見る'})).not.toContainText(/green|lime|orange/)
  await expect(page.getByText(/この まとまりは/)).toHaveCount(0)
  const arrows=viewer.locator('#stage .connection-arrow')
  await expect(arrows).toHaveCount(0)
  await viewer.locator('#explode').fill('100');await viewer.locator('#explode').dispatchEvent('input')
  await expect(arrows).toHaveCount(variant.units.find((unit:{id:string})=>unit.id==='head').steps[0].actions.length)
})

test('前へ・次へでは作成済みの3D形状を再利用し、読み込み表示を出し直さない', async ({page}) => {
  test.setTimeout(90000)
  await page.route(/^https:\/\/(fonts\.|www\.laq|purimatu)/, route => route.abort())
  await page.goto('./assembly/jaroda?step=unit:head:0')
  const iframe=page.locator('iframe')
  await expect(iframe).toHaveAttribute('data-shown','unit:head:0',{timeout:60000})
  const frame=page.frames().find(frame=>frame.url().includes('/assemblies/viewer/'))!
  const cached=()=>frame.evaluate(()=>(window as unknown as {__unitGuide:()=>{cachedMainParts:number}}).__unitGuide().cachedMainParts)
  const first=await cached()
  await page.getByRole('button',{name:'つぎへ →',exact:true}).click()
  await expect(iframe).toHaveAttribute('data-shown','unit:head:1')
  const second=await cached();expect(second).toBeGreaterThan(first)
  await expect(page.getByRole('status')).toHaveCount(0)
  await page.getByRole('button',{name:'← まえへ',exact:true}).click()
  await expect(iframe).toHaveAttribute('data-shown','unit:head:0')
  expect(await cached()).toBe(second)
  await expect(page.getByRole('status')).toHaveCount(0)
})

for (const width of [390, 1240]) {
  test(`ジャローダを全手順・全方向から確認し完成を記録する ${width}px`, async ({ page }) => {
    test.setTimeout(180000)
    const errors: string[] = []
    page.on('pageerror', error => errors.push(error.message))
    await page.route(/^https:\/\/(fonts\.|www\.laq|purimatu)/, route => route.abort())
    await page.setViewportSize({ width, height: 1000 })
    await page.goto('./model/purimatu%3Ajaroda')
    await page.getByRole('link', { name: /3Dで 作る/ }).click()
    const iframe = page.locator('iframe')
    const viewer = page.frameLocator('iframe')
    await expect(iframe).toHaveAttribute('data-shown', 'welcome', { timeout: 60000 })
    await page.screenshot({ path: `test-results/jaroda-${width}-welcome.png`, fullPage: true })
    const keys = [...guide.sequence, 'done']
    for (const key of keys) {
      await page.getByRole('navigation', { name: 'てじゅんを すすめる' }).getByRole('button').last().click()
      await expect(iframe).toHaveAttribute('data-shown', key)
      const frame = page.frames().find(frame => frame.url().includes('/assemblies/viewer/'))!
      const info = await frame.evaluate(() => (window as unknown as { __unitGuide: () => { inFrame: boolean; visible: number; actions: number } }).__unitGuide())
      expect(info.inFrame, key).toBe(true)
      const [kind, id, index] = key.split(':')
      const stage = kind === 'unit' ? variant.units.find((unit: { id: string }) => unit.id === id).steps[Number(index)]
        : kind === 'assembly' ? variant.assembly[Number(id)] : null
      expect(info.visible, key).toBe(stage ? stage.visiblePieces.length : variant.model.pieces.length)
      if (kind === 'assembly') {
        expect(await viewer.locator('#stage .connection-arrow').count()).toBeLessThanOrEqual(stage.actions.length)
        const labels = await viewer.locator('#stage .unit-label text').allTextContents()
        expect(labels.sort()).toEqual(stage.inputs.map((id: string) => guide.displayLabels[id]).sort())
      }
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(width)
      await page.screenshot({ path: `test-results/jaroda-${width}-${key.replaceAll(':', '-')}.png`, fullPage: true })
    }
    await viewer.locator('.view-options summary').click()
    for (const [i, label] of ['ななめ', 'まえ', 'よこ', 'うえ', 'した'].entries()) {
      await viewer.getByRole('button', { name: label, exact: true }).click()
      const frame = page.frames().find(frame => frame.url().includes('/assemblies/viewer/'))!
      expect(await frame.evaluate(() => (window as unknown as { __unitGuide: () => { inFrame: boolean } }).__unitGuide().inFrame)).toBe(true)
      await viewer.locator('#stage').screenshot({ path: `test-results/jaroda-${width}-view-${i}.png` })
    }
    await page.getByRole('button', { name: '★ つくった！を きろく' }).click()
    await expect(page.getByRole('button', { name: '✓ つくった！ きろくずみ' })).toBeDisabled()
    await page.goto('./assembly/jaroda')
    await page.getByRole('button', { name: 'つづきから' }).click()
    await expect(iframe).toHaveAttribute('data-shown', 'done', { timeout: 30000 })
    expect(errors).toEqual([])
  })
}

test('完成ガイドの表示名と矢印サイズをライブラリ・製作室でそろえる', async ({ page }) => {
  test.setTimeout(90000)
  const dir = mkdtempSync(path.join(tmpdir(), 'laq-final-sync-'))
  const workspace = path.join(dir, 'work'), photo = path.join(dir, 'photo.png')
  writeFileSync(photo, Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=', 'base64'))
  initWorkspace({ workspace, slug: 'final-sync', modelId: 'purimatu:jaroda', title: 'ジャローダ', article: guide.article, photos: [photo], fromGuide: 'public/assemblies/jaroda/guide.json' })
  const server = createReviewServer({ workspace })
  server.listen(0, '127.0.0.1'); await once(server, 'listening')
  const address = server.address() as { port: number }
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message))
  try {
    await page.route(/^https:\/\/(fonts\.|www\.laq|purimatu)/, route => route.abort())
    await page.setViewportSize({ width: 1240, height: 1000 })
    await page.goto('./assembly/jaroda?step=unit:head:0')
    await expect(page.locator('iframe')).toHaveAttribute('data-shown', 'unit:head:0', { timeout: 60000 })
    const library = page.frameLocator('iframe')
    await library.locator('#explode').fill('100'); await library.locator('#explode').dispatchEvent('input')
    await expect(library.locator('#stage .connection-path').first()).toHaveAttribute('stroke-width', '1.5')
    await expect(library.locator('#main-arrow')).toHaveAttribute('markerWidth', '4')
    const frame = page.frames().find(f => f.url().includes('/assemblies/viewer/'))!
    expect(await frame.evaluate(() => (window as unknown as { __unitGuide: () => { total: number } }).__unitGuide().total)).toBe(219)
    await page.screenshot({ path: 'test-results/jaroda-final-library.png', fullPage: true })
    await page.goto(`http://127.0.0.1:${address.port}/`)
    const review = page.frameLocator('#viewer')
    await expect(review.locator('#loading')).toBeHidden({ timeout: 30000 })
    await page.locator('#step').selectOption('unit:head:0')
    await expect(page.locator('#step option:checked')).toHaveText('1. A1 あたま')
    await expect(review.locator('#stage .connection-path').first()).toHaveAttribute('stroke-width', '1.5')
    await expect(review.locator('#main-arrow')).toHaveAttribute('markerWidth', '4')
    await page.screenshot({ path: 'test-results/jaroda-final-review.png', fullPage: true })
    expect(errors).toEqual([])
  } finally {
    await page.close(); server.closeAllConnections()
    await new Promise<void>(resolve => server.close(() => resolve()))
    rmSync(dir, { recursive: true, force: true })
  }
})
