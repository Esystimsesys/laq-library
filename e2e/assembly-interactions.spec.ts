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
    if (origin) await page.getByRole('link', {name:'おきにいり',exact:true}).click()
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
  const read=()=>frame.evaluate(()=>(window as unknown as {__unitGuide:()=>View}).__unitGuide())
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
