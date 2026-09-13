import { test, expect } from '@playwright/test'
import { mkdtempSync, readFileSync, writeFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { once } from 'node:events'
import { initWorkspace } from '../scripts/author-assembly.mjs'
import { createReviewServer } from '../scripts/review-assembly.mjs'

test('No.7の接続する2つの口を切り替え、板の位置と手順を保って保存できる', async ({ page }) => {
  test.setTimeout(60000)
  const dir=mkdtempSync(path.join(tmpdir(),'laq-orientation-')),workspace=path.join(dir,'work')
  initWorkspace({workspace,slug:'orientation-test',modelId:'purimatu:metamon',title:'向きのテスト',article:'https://example.com/',fromGuide:'public/assemblies/metamon/guide.json'})
  const pieces=[
    {id:'joint',partNo:7,color:'red',pose:{center:[0,0,0],axis:[1,0,0]}},
    {id:'plate-a',partNo:1,color:'white',pose:{vertices:[[-.5,.1,0],[.5,.1,0],[.5,1.1,0],[-.5,1.1,0]],normal:[0,0,1]}},
    {id:'plate-b',partNo:1,color:'blue',pose:{vertices:[[-.5,0,.1],[.5,0,.1],[.5,0,1.1],[-.5,0,1.1]],normal:[0,-1,0]}},
  ]
  const ports=[{piece:'plate-a',socket:0,port:0},{piece:'plate-b',socket:0,port:2}]
  const original={title:'向きのテスト',article:'https://example.com/',defaultVariant:'test',photos:[],limits:[],variants:{test:{label:'確認',model:{version:1,pieces,connections:[{joint:'joint',ports}]},units:[{id:'A',label:'A',quantity:1,pieceIds:pieces.map(p=>p.id),steps:[{id:'a',title:'組み立て',visiblePieces:pieces.map(p=>p.id),newPieces:pieces.map(p=>p.id),actions:ports.map(p=>({kind:'port',joint:'joint',...p}))}]}],assembly:[],finished:'A'}}}
  const file=path.join(workspace,'guide.json');writeFileSync(file,JSON.stringify(original))
  const server=createReviewServer({workspace});server.listen(0,'127.0.0.1');await once(server,'listening')
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message))
  try {
    await page.setViewportSize({width:1440,height:1100})
    await page.goto(`http://127.0.0.1:${(server.address() as {port:number}).port}/`)
    await expect(page.frameLocator('#viewer').locator('#loading')).toBeHidden({timeout:30000})
    await page.locator('#piece').selectOption('joint')
    await expect(page.locator('#joint-orientation option')).toHaveCount(2)
    await expect(page.locator('#apply-orientation')).toBeDisabled()
    const viewer=page.frames().find(frame=>frame.url().includes('/assemblies/viewer/'))!
    const bounds=()=>viewer.evaluate(()=>(window as any).__unitGuide().pieceScreens.map((p:any)=>({id:p.id,bounds:p.worldBounds})))
    const before=await bounds()
    await page.locator('#cycle-viewer-orientation').click()
    await expect(page.locator('#message')).toContainText('接続先の板を動かさず')
    await expect.poll(async()=>(await bounds()).find((p:any)=>p.id==='joint').bounds).not.toEqual(before.find((p:any)=>p.id==='joint').bounds)
    for(const id of ['plate-a','plate-b'])expect((await bounds()).find((p:any)=>p.id===id)).toEqual(before.find((p:any)=>p.id===id))
    await page.locator('#undo').click();await expect(page.locator('#message')).toContainText('直前の3D編集を戻しました')
    await expect.poll(async()=>(await bounds()).find((p:any)=>p.id==='joint').bounds).toEqual(before.find((p:any)=>p.id==='joint').bounds)
    const current=await page.locator('#joint-orientation').inputValue()
    const alternative=await page.locator('#joint-orientation option').evaluateAll((options,current)=>(options as HTMLOptionElement[]).find(option=>option.value!==current)!.value,current)
    await page.locator('#joint-orientation').selectOption(alternative)
    await page.locator('#apply-orientation').click();await expect(page.locator('#message')).toContainText('接続先の板を動かさず')
    await page.locator('#save').click();await expect(page.locator('#message')).toContainText('変更を保存しました')
    const saved=JSON.parse(readFileSync(file,'utf8')),v=saved.variants.test
    expect(v.model.pieces.slice(1)).toEqual(pieces.slice(1))
    expect(v.model.connections[0].ports).not.toEqual(ports)
    expect(v.model.connections[0].ports.map((p:any)=>({piece:p.piece,socket:p.socket}))).toEqual(ports.map(({piece,socket})=>({piece,socket})))
    expect(v.units[0].steps[0].actions).toEqual(v.model.connections[0].ports.map((p:any)=>({kind:'port',joint:'joint',...p})))
    await page.reload();await page.locator('#piece').selectOption('joint')
    await expect(page.locator('#joint-orientation option')).toHaveCount(2)
    await expect(page.locator('#apply-orientation')).toBeDisabled()
    await page.setViewportSize({width:390,height:844})
    await page.locator('#orientation-panel').screenshot({path:'test-results/joint-orientation-mobile.png'})
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(391)
    // A freely displaced joint no longer has a geometrically valid orientation.
    await page.locator('#dx').fill('17');await page.locator('#apply-transform').click()
    await expect(page.locator('#next-orientation')).toBeDisabled()
    await expect(page.locator('#joint-orientation option')).toHaveCount(0)
    expect(errors).toEqual([])
  } finally {
    await page.close();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));rmSync(dir,{recursive:true,force:true})
  }
})
