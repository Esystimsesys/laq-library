import { test, expect } from '@playwright/test'
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { once } from 'node:events'
import { initWorkspace } from '../scripts/author-assembly.mjs'
import { createReviewServer } from '../scripts/review-assembly.mjs'

test('コメント保存中の編集を止め、成功・失敗後に未確認点を保存できる',async({page})=>{
 const dir=mkdtempSync(path.join(tmpdir(),'laq-review-save-')),workspace=path.join(dir,'work')
 initWorkspace({workspace,slug:'save-test',modelId:'purimatu:metamon',title:'Save test',article:'https://example.com/',fromGuide:'public/assemblies/metamon/guide.json'})
 const server=createReviewServer({workspace});server.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address() as {port:number}
 let release!:()=>void,responded!:()=>void
 const held=new Promise<void>(resolve=>release=resolve),received=new Promise<void>(resolve=>responded=resolve)
 try{
  await page.goto(`http://127.0.0.1:${address.port}/`)
  await expect(page.locator('#state')).toHaveText('下書き')
  await page.route('**/api/save',async route=>{const response=await route.fetch();responded();await held;await route.fulfill({response})})
  await page.locator('#comment-text').fill('保存するコメント');await page.locator('#add-comment').click();await received
  await expect(page.locator('main')).toHaveJSProperty('inert',true)
  await expect(page.locator('header')).toHaveJSProperty('inert',true)
  // Even trying to focus an edit field cannot change it until the save finishes.
  await page.locator('#new-issue').evaluate((input:HTMLInputElement)=>input.focus())
  await page.keyboard.type('保存中の入力')
  await expect(page.locator('#new-issue')).toHaveValue('')
  release();await expect(page.locator('#comment-status')).toContainText('コメントを保存しました')
  await expect(page.locator('main')).toHaveJSProperty('inert',false)
  await expect(page.locator('header')).toHaveJSProperty('inert',false)
  await page.unroute('**/api/save')
  await page.locator('#new-issue').fill('保存後に追加した未確認点');await page.locator('#add-issue').click()
  await page.route('**/api/save',route=>route.fulfill({status:503,json:{error:'保存に失敗しました'}}))
  await page.locator('#save').click();await expect(page.locator('#message')).toContainText('保存に失敗しました')
  await expect(page.locator('main')).toHaveJSProperty('inert',false)
  await expect(page.locator('#save')).toBeEnabled()
  await expect(page.locator('#issues')).toContainText('保存後に追加した未確認点')
  await page.unroute('**/api/save');await page.locator('#save').click()
  await expect(page.locator('#message')).toContainText('変更を保存しました')
  const saved=JSON.parse(readFileSync(path.join(workspace,'review.json'),'utf8'))
  expect(saved.comments.map((c:{text:string})=>c.text)).toEqual(['保存するコメント'])
  expect(saved.unresolved.map((issue:{description:string})=>issue.description)).toContain('保存後に追加した未確認点')
 }finally{release();await page.close();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));rmSync(dir,{recursive:true,force:true})}
})

test('塊の途中の手順では、作成済みの部分を動かさず新しい部分だけをまとめて離す',async({page})=>{
 const dir=mkdtempSync(path.join(tmpdir(),'laq-review-join-')),workspace=path.join(dir,'work'),photo=path.join(dir,'photo.png')
 writeFileSync(photo,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64'))
 initWorkspace({workspace,slug:'join-test',modelId:'purimatu:metamon',title:'Join test',article:'https://example.com/',photos:[photo],fromGuide:'public/assemblies/metamon/guide.json'})
 // Split A1 (a chain of 9 pieces) into a first step of 5 pieces and a join step adding the other 4.
 const file=path.join(workspace,'guide.json'),guide=JSON.parse(readFileSync(file,'utf8')),unit=guide.variants[guide.defaultVariant].units.find((u:{id:string})=>u.id==='A1')
 const [only]=unit.steps,first=new Set<string>(unit.pieceIds.slice(0,5)),inFirst=(a:{joint:string;piece:string})=>first.has(a.joint)&&first.has(a.piece)
 unit.steps=[{...only,id:'A1-a',presentation:'overview',visiblePieces:[...first],newPieces:[...first],actions:only.actions.filter(inFirst)},{...only,id:'A1-b',presentation:'join',visiblePieces:unit.pieceIds,newPieces:unit.pieceIds.slice(5),actions:only.actions.filter((a:{joint:string;piece:string})=>!inFirst(a))}]
 for(const order of [guide.sequence,guide.reading.sequence])order.splice(order.indexOf('unit:A1:0')+1,0,'unit:A1:1')
 writeFileSync(file,JSON.stringify(guide,null,2)+'\n')
 const server=createReviewServer({workspace});server.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address() as {port:number}
 try{
  await page.setViewportSize({width:1440,height:1100});await page.goto(`http://127.0.0.1:${address.port}/`)
  await expect(page.frameLocator('#viewer').locator('#loading')).toBeHidden({timeout:30000})
  await page.locator('#step').selectOption('unit:A1:1')
  const frame=page.frames().find(f=>f.url().includes('/assemblies/viewer/'))!
  await frame.locator('#explode').fill('100');await frame.locator('#explode').dispatchEvent('input')
  const view=await frame.evaluate(async()=>{await new Promise(requestAnimationFrame);return (window as any).__unitGuide()}) as {pieceScreens:{id:string;offset:number[]}[]}
  const moved=(p:{offset:number[]})=>p.offset.some(v=>Math.abs(v)>1e-8),built=view.pieceScreens.filter(p=>first.has(p.id)),added=view.pieceScreens.filter(p=>!first.has(p.id))
  expect(built).toHaveLength(5);expect(added).toHaveLength(4)
  expect(built.some(moved)).toBe(false);expect(added.every(moved)).toBe(true)
  for(const p of added)expect(p.offset).toEqual(added[0].offset)
 }finally{await page.close();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));rmSync(dir,{recursive:true,force:true})}
})

test('写真と3Dを照合し、色・位置を修正、戻す、保存して再開できる',async({page})=>{
 const dir=mkdtempSync(path.join(tmpdir(),'laq-review-ui-')),workspace=path.join(dir,'work'),photo=path.join(dir,'photo.png'),photo2=path.join(dir,'photo-2.png')
 const photoBytes=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64')
 writeFileSync(photo,photoBytes);writeFileSync(photo2,photoBytes)
 initWorkspace({workspace,slug:'review-test',modelId:'purimatu:metamon',title:'Review test',article:'https://example.com/',photos:[photo,photo2],fromGuide:'public/assemblies/metamon/guide.json'})
 const server=createReviewServer({workspace});server.listen(0,'127.0.0.1');await once(server,'listening');const address=server.address() as {port:number}
 const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message))
 try{
  await page.setViewportSize({width:1440,height:1100});await page.goto(`http://127.0.0.1:${address.port}/`)
  const frame=page.frameLocator('#viewer');await expect(frame.locator('#loading')).toBeHidden({timeout:30000})
  await expect(frame.locator('#explode')).toHaveValue('100')
  await expect(page.locator('#source')).toBeVisible();expect(await page.locator('#source').evaluate((img:HTMLImageElement)=>img.naturalWidth)).toBe(1)
  // Opening view controls must not clip the bottom of the diagram in the fixed-height review iframe.
  await frame.locator('.view-options summary').click()
  await expect.poll(async()=>{
   const inner=page.frames().find(f=>f.url().includes('/assemblies/viewer/'))!
   return inner.evaluate(()=>document.getElementById('stage')!.getBoundingClientRect().bottom<=innerHeight)
  }).toBe(true)
  await frame.locator('.view-options summary').click()
  await expect(page.locator('#photo-prev')).toBeDisabled();await expect(page.locator('#photo-next')).toBeEnabled();await expect(page.locator('#step-prev')).toBeDisabled()
  await page.locator('#step-next').click();await expect(page.locator('#step')).toHaveValue('unit:A1:0');await expect(page.locator('#step-prev')).toBeEnabled();await expect(frame.locator('#explode')).toHaveValue('100')
  await expect(frame.locator('#stage .connection-path').first()).toHaveAttribute('stroke-width','1.5')
  await expect(frame.locator('#stage #main-arrow')).toHaveAttribute('markerWidth','4')
  await page.locator('#step-prev').click();await expect(page.locator('#step')).toHaveValue('complete')
  const before=JSON.parse(readFileSync(path.join(workspace,'guide.json'),'utf8')),v=before.variants[before.defaultVariant],piece=v.model.pieces[0]
  await page.locator('#piece').selectOption(piece.id);await page.locator('#step').selectOption('unit:A1:0')
  await expect(page.locator('#transform-panel #save')).toHaveText('変更を保存');await expect(page.locator('header #save')).toHaveCount(0)
  await expect(page.locator('#apply-color')).toHaveCSS('background-color','rgb(37, 97, 69)')
  await expect(page.locator('#apply-color')).toHaveText('色を反映');await expect(page.locator('#save')).toBeDisabled()
  await page.locator('#color').selectOption('red');await page.locator('#apply-color').click();await expect(page.locator('#message')).toContainText('赤に反映しました')
  expect(JSON.parse(readFileSync(path.join(workspace,'guide.json'),'utf8')).variants[before.defaultVariant].model.pieces.find((p:{id:string})=>p.id===piece.id).color).toBe(piece.color)
  await expect(page.locator('#save')).toBeEnabled()
  await page.locator('#comment-text').fill('色の保存前に残すコメント');await page.locator('#add-comment').click();await expect(page.locator('#comment-status')).toContainText('コメントを保存しました')
  expect(JSON.parse(readFileSync(path.join(workspace,'guide.json'),'utf8')).variants[before.defaultVariant].model.pieces.find((p:{id:string})=>p.id===piece.id).color).toBe(piece.color)
  await expect(page.locator('#save')).toBeEnabled()
  await page.locator('#scope').selectOption('unit');await page.locator('#dx').fill('1');await page.locator('#apply-transform').click();await expect(page.locator('#message')).toContainText('移動 1/0/0')
  await page.locator('#evidence-panel summary').click();await page.locator('#observation').fill('写真の端と照合');await page.locator('#interpretation').fill('位置を1mm修正');await page.locator('#add-evidence').click()
  await page.locator('#save').click();await expect(page.locator('#message')).toContainText('変更を保存しました')
  const saved=JSON.parse(readFileSync(path.join(workspace,'guide.json'),'utf8')),savedPiece=saved.variants[saved.defaultVariant].model.pieces[0]
  expect(savedPiece.color).toBe('red')
  const x=piece.pose.center?.[0]??piece.pose.vertices[0][0],after=savedPiece.pose.center?.[0]??savedPiece.pose.vertices[0][0];expect(after-x).toBeCloseTo(1/17)
  const savedVariant=saved.variants[saved.defaultVariant],unitIds=new Set(savedVariant.units.find((u:{id:string})=>u.id==='A1').pieceIds)
  const linked=savedVariant.model.connections.find((c:{joint:string;ports:{piece:string}[]})=>unitIds.has(c.joint)&&c.ports.some(port=>unitIds.has(port.piece)&&port.piece!==piece.id))!
  const single=savedVariant.model.pieces.find((p:{id:string})=>p.id===linked.ports.find((port:{piece:string})=>unitIds.has(port.piece)&&port.piece!==piece.id)!.piece)!
  await page.locator('#scope').selectOption('unit')
  const viewerFrame=page.frames().find(frame=>frame.url().includes('/assemblies/viewer/'))!
  await viewerFrame.evaluate(id=>window.parent.postMessage({channel:'laq-assembly',type:'selected',id},location.origin),single.id)
  await expect(page.locator('#piece')).toHaveValue(single.id);await expect(page.locator('#scope')).toHaveValue('piece')
  const jointBoundsBefore=await viewerFrame.evaluate(id=>(window as any).__unitGuide().pieceScreens.find((p:{id:string})=>p.id===id).worldBounds,linked.joint)
  await page.locator('#dx').fill('0');await page.locator('#rz').fill('15');await page.locator('#apply-transform').click()
  await expect.poll(()=>viewerFrame.evaluate(id=>(window as any).__unitGuide().pieceScreens.find((p:{id:string})=>p.id===id).worldBounds,linked.joint)).toEqual(jointBoundsBefore)
  await page.locator('summary',{hasText:'JSON'}).click();await page.locator('#refresh-json').click()
  const rotated=JSON.parse(await page.locator('#json').inputValue()),rotatedPieces=rotated.variants[rotated.defaultVariant].model.pieces
  expect(rotatedPieces.find((p:{id:string})=>p.id===single.id).pose).not.toEqual(saved.variants[saved.defaultVariant].model.pieces.find((p:{id:string})=>p.id===single.id).pose)
  for(const p of rotatedPieces)if(p.id!==single.id)expect(p.pose).toEqual(saved.variants[saved.defaultVariant].model.pieces.find((before:{id:string})=>before.id===p.id).pose)
  await page.locator('#undo').click();await page.locator('summary',{hasText:'JSON'}).click();await page.locator('#piece').selectOption(piece.id)
  const reviewFile=path.join(workspace,'review.json')
  await frame.locator('#explode').fill('0');await frame.locator('#explode').dispatchEvent('input')
  await page.locator('#photo').selectOption('photo-2');await page.locator('#photo-zoom').fill('180');await page.locator('#rotate-photo').click();await page.locator('#comment-pieces').check()
  await page.locator('#comment-text').fill('あたまの ふちに ジョイントが足りない');await page.locator('#add-comment').click();await expect(page.locator('#comment-status')).toContainText('コメントを保存しました')
  await expect(page.locator('#comment-text')).toHaveValue('')
  await expect(page.locator('#photo')).toHaveValue('photo-2');await expect(page.locator('#photo-zoom')).toHaveValue('180');await expect(page.locator('#source')).toHaveCSS('transform','matrix(0, 1, -1, 0, 0, 0)')
  await expect(page.locator('#comment-context')).toBeChecked();await expect(page.locator('#comment-pieces')).toBeChecked()
  await expect(frame.locator('#explode')).toHaveValue('0')
  let comments=JSON.parse(readFileSync(reviewFile,'utf8')).comments
  expect(comments).toHaveLength(2);expect(comments[1]).toMatchObject({author:'human',status:'open',stepKey:'unit:A1:0',photoId:'photo-2',text:'あたまの ふちに ジョイントが足りない'});expect(comments[1].pieceIds).toContain(piece.id)
  await page.locator('#comments .comment').filter({hasText:'あたまの ふちに'}).getByRole('button',{name:'対応済みにする'}).click();await expect(page.locator('#comment-status')).toContainText('対応済み')
  comments=JSON.parse(readFileSync(reviewFile,'utf8')).comments;expect(comments[1].status).toBe('resolved')
  await expect(page.locator('#comments')).toContainText('色の保存前に残すコメント');await expect(page.locator('#comments')).not.toContainText('あたまの ふちに')
  await page.reload();await expect(page.locator('#evidence')).toContainText('位置を1mm修正');await expect(page.locator('#comments')).not.toContainText('あたまの ふちに')
  await page.locator('#toggle-resolved').click();await expect(page.locator('#comments')).toContainText('あたまの ふちに');await expect(page.locator('#toggle-resolved')).toHaveText('対応済みを隠す')
  await page.locator('summary',{hasText:'JSON'}).click();await page.locator('#refresh-json').click();await page.locator('#json').fill('{"broken":true}');await page.locator('#apply-json').click();await expect(page.locator('#message')).toHaveClass('error')
  expect(JSON.parse(readFileSync(path.join(workspace,'guide.json'),'utf8'))).toEqual(saved)
  await page.setViewportSize({width:390,height:844});expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(391)
  expect(errors).toEqual([])
 }finally{await page.close();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));rmSync(dir,{recursive:true,force:true})}
})
