import { test, expect } from '@playwright/test'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { once } from 'node:events'
import { initWorkspace } from '../scripts/author-assembly.mjs'
import { createReviewServer } from '../scripts/review-assembly.mjs'

test('写真と3Dを照合し、色・位置を修正、戻す、保存して再開できる',async({page})=>{
 const dir=mkdtempSync(path.join(tmpdir(),'laq-review-ui-')),workspace=path.join(dir,'work'),photo=path.join(dir,'photo.png')
 writeFileSync(photo,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64'))
 initWorkspace({workspace,slug:'review-test',modelId:'purimatu:metamon',title:'Review test',article:'https://example.com/',photos:[photo],fromGuide:'public/assemblies/metamon/guide.json'})
 const server=createReviewServer({workspace});server.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address() as {port:number}
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message))
 try{
  await page.setViewportSize({width:1440,height:1100});await page.goto(`http://127.0.0.1:${address.port}/`)
  const frame=page.frameLocator('#viewer');await expect(frame.locator('#loading')).toBeHidden({timeout:30000})
  await expect(page.locator('#source')).toBeVisible();expect(await page.locator('#source').evaluate((img:HTMLImageElement)=>img.naturalWidth)).toBe(1)
  const before=JSON.parse(readFileSync(path.join(workspace,'guide.json'),'utf8')),v=before.variants[before.defaultVariant],piece=v.model.pieces[0]
  await page.locator('#piece').selectOption(piece.id);await page.locator('#step').selectOption('unit:A1:0')
  await page.locator('#color').selectOption('red');await page.locator('#apply-color').click();await expect(page.locator('#message')).toContainText('色 red')
  await page.locator('#undo').click();await expect(page.locator('#message')).toContainText('戻しました')
  await page.locator('#scope').selectOption('unit');await page.locator('#dx').fill('1');await page.locator('#apply-transform').click();await expect(page.locator('#message')).toContainText('移動 1/0/0')
  await page.locator('#observation').fill('写真の端と照合');await page.locator('#interpretation').fill('位置を1mm修正');await page.locator('#add-evidence').click()
  await page.locator('#save').click();await expect(page.locator('#message')).toContainText('下書きを保存しました')
  const saved=JSON.parse(readFileSync(path.join(workspace,'guide.json'),'utf8')),savedPiece=saved.variants[saved.defaultVariant].model.pieces[0]
  expect(savedPiece.color).toBe(piece.color)
  const x=piece.pose.center?.[0]??piece.pose.vertices[0][0],after=savedPiece.pose.center?.[0]??savedPiece.pose.vertices[0][0];expect(after-x).toBeCloseTo(1/17)
  await page.reload();await expect(page.locator('#evidence')).toContainText('位置を1mm修正')
  await page.locator('summary').click();await page.locator('#refresh-json').click();await page.locator('#json').fill('{"broken":true}');await page.locator('#apply-json').click();await expect(page.locator('#message')).toHaveClass('error')
  expect(JSON.parse(readFileSync(path.join(workspace,'guide.json'),'utf8'))).toEqual(saved)
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(391)
  expect(errors).toEqual([])
 }finally{await page.close();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));rmSync(dir,{recursive:true,force:true})}
})
