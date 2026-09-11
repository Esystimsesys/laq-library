import { test, expect } from '@playwright/test'

test.beforeEach(async ({ page }) => {
  await page.route(/^https:\/\/(fonts\.|www\.laq|purimatu)/, route => route.abort())
})

test('3Dから作品へ戻ったあと、検索した一覧・お気に入りへ戻れる', async ({ page }) => {
  test.setTimeout(90000)
  await page.goto('./')
  await page.getByRole('searchbox').fill('メタモン')
  const card = page.locator('a[href$="/model/purimatu%3Ametamon"]')
  await card.locator('..').getByRole('button').click()
  for (const origin of ['', 'favorites']) {
    if (origin) await page.getByRole('link', {name:'マイライブラリ',exact:true}).click()
    await card.click()
    await page.getByRole('link', {name:'3Dで 作る',exact:true}).click()
    await expect(page.locator('iframe')).toHaveAttribute('data-shown','welcome',{timeout:30000})
    await page.getByRole('button',{name:'つくりはじめる →'}).click()
    await expect(page.locator('iframe')).toHaveAttribute('data-shown','unit:A1:0')
    if (origin) await page.reload()
    await page.getByRole('link',{name:'← さくひん',exact:true}).click()
    await page.getByRole('button',{name:'もどる',exact:true}).click()
    await expect(page).toHaveURL(new RegExp(`/laq-library/${origin}$`))
    if (!origin) await expect(page.getByRole('searchbox')).toHaveValue('メタモン')
  }
  await page.goto('./assembly/metamon?step=unit:A1:0')
  await page.getByRole('link',{name:'← さくひん',exact:true}).click()
  await page.getByRole('button',{name:'もどる',exact:true}).click()
  await expect(page).toHaveURL(/\/laq-library\/$/)
})

for (const width of [390,1240]) test(`A1の左右も分解すると離れ、ゼロで元の形に戻る ${width}px`, async ({page}) => {
  await page.setViewportSize({width,height:844})
  await page.goto('./assembly/metamon?step=unit:A1:0')
  await expect(page.locator('iframe')).toHaveAttribute('data-shown','unit:A1:0',{timeout:30000})
  const frame=page.frames().find(f=>f.url().includes('/assemblies/viewer/'))!
  type Screen={id:string;offset:number[];bounds:{left:number;right:number;top:number;bottom:number}}
  type View={inFrame:boolean;pieceScreens:Screen[]}
  const read=()=>frame.evaluate(async()=>{await new Promise(requestAnimationFrame);return (window as unknown as {__unitGuide:()=>View}).__unitGuide()})
  const overlap=(pieces:Screen[])=>pieces.reduce((sum,a,i)=>sum+pieces.slice(i+1).reduce((n,b)=>n+Math.max(0,Math.min(a.bounds.right,b.bounds.right)-Math.max(a.bounds.left,b.bounds.left))*Math.max(0,Math.min(a.bounds.top,b.bounds.top)-Math.max(a.bounds.bottom,b.bounds.bottom)),0),0)
  const before=await read()
  expect(overlap(before.pieceScreens)).toBeGreaterThan(0)
  await frame.locator('#explode').fill('100')
  await frame.locator('#explode').dispatchEvent('input')
  const after=await read()
  expect(after.inFrame).toBe(true)
  expect(after.pieceScreens).toHaveLength(9)
  expect(overlap(after.pieceScreens)).toBeLessThan(.0001)
  await frame.locator('#stage').screenshot({path:`test-results/A1-separated-${width}.png`})
  await frame.locator('#explode').fill('0')
  await frame.locator('#explode').dispatchEvent('input')
  expect((await read()).pieceScreens).toEqual(before.pieceScreens)
})

test('平面ジョイントの表面に人工的な中央の区切り線を出さない', async ({page}) => {
  await page.goto('./assembly/metamon')
  await expect(page.locator('iframe')).toHaveAttribute('data-shown','welcome',{timeout:30000})
  const frame=page.frames().find(f=>f.url().includes('/assemblies/viewer/'))!
  const counts=await frame.evaluate(()=>{
    // Exercise the same geometry and edge extraction as the actual viewer.
    const w=window as unknown as {THREE:any;LaQRealisticParts:any}
    const T=w.THREE
    return [3,4].map(partNo=>{
      const material=new T.MeshStandardMaterial(),group=w.LaQRealisticParts.joint(T,{id:'sample',partNo,pose:{center:[0,0,0],axis:[1,0,0]}},null,new Map(),material)
      group.updateMatrixWorld(true)
      let centreLines=0,outerLines=0
      group.traverse((mesh:any)=>{
        if(!mesh.isMesh)return
        const edges=new T.EdgesGeometry(mesh.geometry,40),pos=edges.attributes.position
        for(let i=0;i<pos.count;i+=2){
          const a=new T.Vector3().fromBufferAttribute(pos,i).applyMatrix4(mesh.matrixWorld),b=new T.Vector3().fromBufferAttribute(pos,i+1).applyMatrix4(mesh.matrixWorld)
          if(Math.abs(a.y)<1e-5&&Math.abs(b.y)<1e-5&&Math.abs(a.z)>.08&&Math.abs(b.z)>.08&&Math.abs(a.x-b.x)>.1)centreLines++
          outerLines++
        }
        edges.dispose();mesh.geometry.dispose()
      })
      material.dispose()
      return {partNo,centreLines,outerLines}
    })
  })
  for(const p of counts){expect(p.centreLines).toBe(0);expect(p.outerLines).toBeGreaterThan(20)}
})

test('No.6・7も中央に継ぎ目がなく、外周・接続溝・端面のくぼみを保つ', async ({page}) => {
  await page.goto('./assembly/metamon')
  await expect(page.locator('iframe')).toHaveAttribute('data-shown','welcome',{timeout:30000})
  const frame=page.frames().find(f=>f.url().includes('/assemblies/viewer/'))!
  const samples=await frame.evaluate(()=>{
    const w=window as unknown as {THREE:any;LaQRealisticParts:any},T=w.THREE
    return [6,7].map(partNo=>{
      const material=new T.MeshStandardMaterial()
      const group=w.LaQRealisticParts.joint(T,{id:'sample',partNo,pose:{center:[0,0,0],axis:[1,0,0]}},null,new Map(),material)
      group.updateMatrixWorld(true)
      let seams=0,edges=0
      group.traverse((mesh:any)=>{
        if(!mesh.isMesh)return
        const geometry=new T.EdgesGeometry(mesh.geometry,40),positions=geometry.attributes.position
        for(let i=0;i<positions.count;i+=2){
          const a=new T.Vector3().fromBufferAttribute(positions,i).applyMatrix4(mesh.matrixWorld)
          const b=new T.Vector3().fromBufferAttribute(positions,i+1).applyMatrix4(mesh.matrixWorld)
          // The old half-wing root cuts a long line through an unbroken hub face.
          if(Math.abs(a.x-b.x)>.05&&Math.abs(a.y)<1e-5&&Math.abs(b.y)<1e-5&&Math.abs(a.z)>.08&&Math.abs(b.z)>.08)seams++
          edges++
        }
        geometry.dispose()
      })
      const ray=(origin:number[],direction:number[])=>new T.Raycaster(new T.Vector3(...origin),new T.Vector3(...direction)).intersectObject(group,true).map((hit:any)=>hit.distance)
      const result={partNo,seams,edges,
        slotBottom:ray([0,1,0],[0,-1,0])[0],
        throughSlot:ray([1,.25,0],[-1,0,0]).length,
        skin:ray([0,.25,1],[0,0,-1])[0],
        endFloor:ray([1,0,0],[-1,0,0])[0],
        solidEnd:ray([1,.08,.08],[-1,0,0])[0],
        thirdFork:ray([1,-.25,.09],[-1,0,0]).length,
      }
      group.traverse((mesh:any)=>{if(mesh.isMesh)mesh.geometry.dispose()});material.dispose()
      return result
    })
  })
  for(const p of samples){
    expect(p.seams).toBe(0)
    expect(p.edges).toBeGreaterThan(20)
    expect(p.slotBottom).toBeCloseTo(1-1.75/17,5)
    expect(p.throughSlot).toBe(0)
    expect(p.skin).toBeGreaterThan(.90);expect(p.skin).toBeLessThan(.91)
    expect(p.endFloor).toBeCloseTo(.5+1.3/17,5)
    expect(p.solidEnd).toBeCloseTo(.5,5)
    if(p.partNo===7)expect(p.thirdFork).toBeGreaterThan(0)
    else expect(p.thirdFork).toBe(0)
  }
})

for (const width of [390,1240]) test(`左右の手は本体を動かさず接続方向へ離れる ${width}px`, async ({page}) => {
  // CI renders WebGL in software; budget the complete multi-action scenario.
  test.setTimeout(90000)
  await page.setViewportSize({width,height:844})
  await page.goto('./assembly/metamon?step=assembly:6')
  await expect(page.locator('iframe')).toHaveAttribute('data-shown','assembly:6',{timeout:30000})
  const frame=page.frames().find(f=>f.url().includes('/assemblies/viewer/'))!
  type Screen={id:string;offset:number[];bounds:{left:number;right:number;top:number;bottom:number}}
  const read=()=>frame.evaluate(async()=>{await new Promise(requestAnimationFrame);return (window as any).__unitGuide()})
  for(const step of [6,7]){
    if(step===7){await page.getByRole('button',{name:'できた！ つぎへ →',exact:true}).click();await expect(page.locator('iframe')).toHaveAttribute('data-shown','unit:D2:0');await page.getByRole('button',{name:'できた！ つぎへ →',exact:true}).click();await expect(page.locator('iframe')).toHaveAttribute('data-shown','assembly:7')}
    await frame.locator('#explode').fill('0');await frame.locator('#explode').dispatchEvent('input')
    const before=await read()
    await frame.locator('#explode').fill('100');await frame.locator('#explode').dispatchEvent('input')
    const after=await read(),moving:Screen[]=after.pieceScreens.filter((p:Screen)=>p.offset.some(v=>Math.abs(v)>1e-8)),fixed:Screen[]=after.pieceScreens.filter((p:Screen)=>p.offset.every(v=>Math.abs(v)<1e-8))
    expect(after.inFrame).toBe(true);expect(moving).toHaveLength(2);expect(fixed.length).toBeGreaterThan(40)
    expect(moving[0].offset).toEqual(moving[1].offset)
    for(const a of moving)for(const b of fixed){const overlap=Math.max(0,Math.min(a.bounds.right,b.bounds.right)-Math.max(a.bounds.left,b.bounds.left))*Math.max(0,Math.min(a.bounds.top,b.bounds.top)-Math.max(a.bounds.bottom,b.bounds.bottom));expect(overlap).toBeLessThan(.0001)}
    await frame.locator('#explode').fill('0');await frame.locator('#explode').dispatchEvent('input')
    expect((await read()).pieceScreens).toEqual(before.pieceScreens)
  }
})

for(const width of [390,1240]) test(`分解スライダーを連続ドラッグしても形状を再生成しない ${width}px`,async({page})=>{
  // CI renders WebGL in software; budget the complete multi-action scenario.
  test.setTimeout(90000)
  await page.setViewportSize({width,height:844})
  await page.goto('./assembly/metamon?step=assembly:6')
  await expect(page.locator('iframe')).toHaveAttribute('data-shown','assembly:6',{timeout:30000})
  const frame=page.frames().find(f=>f.url().includes('/assemblies/viewer/'))!
  const slider=frame.locator('#explode')
  await slider.fill('0');await slider.dispatchEvent('change')
  await frame.evaluate(()=>{
    const w=window as any;w.__createdDuringDrag=0
    for(const key of ['plate','joint']){const original=w.LaQRealisticParts[key];w.LaQRealisticParts[key]=(...args:unknown[])=>{w.__createdDuringDrag++;return original(...args)}}
  })
  const box=(await slider.boundingBox())!
  expect(box.height).toBeGreaterThanOrEqual(44);expect(box.width).toBeGreaterThanOrEqual(110)
  await page.mouse.move(box.x+8,box.y+box.height/2);await page.mouse.down()
  await page.mouse.move(box.x+box.width*.5,box.y+box.height/2,{steps:12})
  const middle=await slider.inputValue();expect(Number(middle)).toBeGreaterThan(25);expect(Number(middle)).toBeLessThan(75)
  await expect(frame.locator('#stage .connection-path')).toHaveCount(1)
  await page.mouse.move(box.x+box.width-8,box.y+box.height/2,{steps:12});await page.mouse.up()
  await expect(slider).toHaveValue('100')
  const result=await frame.evaluate(async()=>{await new Promise(requestAnimationFrame);const w=window as any;return{created:w.__createdDuringDrag,view:w.__unitGuide()}})
  expect(result.created).toBe(0);expect(result.view.inFrame).toBe(true);expect(result.view.explode).toBe(1)
  expect(result.view.pieceScreens.filter((p:any)=>p.offset.some((n:number)=>Math.abs(n)>1e-8))).toHaveLength(2)
  await slider.focus();await page.keyboard.press('ArrowLeft');await expect(slider).toHaveValue('99')
  // Coalesce many input events and still apply the last value on the next frame.
  const final=await frame.evaluate(async()=>{const slider=document.getElementById('explode') as HTMLInputElement;for(let value=90;value>=0;value-=10){slider.value=String(value);slider.dispatchEvent(new Event('input',{bubbles:true}))}await new Promise(requestAnimationFrame);const w=window as any;return{created:w.__createdDuringDrag,view:w.__unitGuide()}})
  expect(final.created).toBe(0);expect(final.view.explode).toBe(0);expect(final.view.pieceScreens.every((p:any)=>p.offset.every((n:number)=>Math.abs(n)<1e-8))).toBe(true)
})
