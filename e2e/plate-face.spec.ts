import { test, expect } from '@playwright/test'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { once } from 'node:events'
import { initWorkspace } from '../scripts/author-assembly.mjs'
import { createReviewServer } from '../scripts/review-assembly.mjs'

test('板の表裏を入れ替え、接続を維持して戻す・保存・再開できる', async ({ page }) => {
  test.setTimeout(60000)
  const dir=mkdtempSync(path.join(tmpdir(),'laq-face-')),workspace=path.join(dir,'work')
  initWorkspace({workspace,slug:'face-test',modelId:'purimatu:metamon',title:'表裏のテスト',article:'https://example.com/',fromGuide:'public/assemblies/metamon/guide.json'})
  const file=path.join(workspace,'guide.json'),original=JSON.parse(readFileSync(file,'utf8')),v=original.variants[original.defaultVariant]
  const server=createReviewServer({workspace});server.listen(0,'127.0.0.1');await once(server,'listening')
  const errors:string[]=[];page.on('pageerror',e=>errors.push(e.message))
  try {
    await page.setViewportSize({width:1440,height:1100})
    await page.goto(`http://127.0.0.1:${(server.address() as {port:number}).port}/`)
    await expect(page.frameLocator('#viewer').locator('#loading')).toBeHidden({timeout:30000})
    const joint=v.model.pieces.find((p:any)=>p.partNo===7)
    await page.locator('#piece').selectOption(joint.id)
    await expect(page.locator('#flip-viewer-face')).toBeDisabled()
    await expect(page.locator('#face-hint')).toContainText('No.1')
    for(const partNo of [1,2]) {
      const plate=v.model.pieces.find((p:any)=>p.partNo===partNo)
      await page.locator('#piece').selectOption(plate.id)
      // The face action is always one plate, even with unit scope selected.
      await page.locator('#scope').selectOption('unit')
      await page.locator('#flip-viewer-face').click()
      await expect(page.locator('#message')).toContainText('板の位置と接続を保って表裏')
      await page.locator('#undo').click();await expect(page.locator('#message')).toContainText('直前の3D編集を戻しました')
      await page.locator('#flip-face').click()
      await expect(page.locator('#message')).toContainText('板の位置と接続を保って表裏')
      await page.locator('#save').click();await expect(page.locator('#message')).toContainText('変更を保存しました')
      const saved=JSON.parse(readFileSync(file,'utf8')),expected=structuredClone(original)
      expected.variants[original.defaultVariant].model.pieces.find((p:any)=>p.id===plate.id).pose.normal=plate.pose.normal.map((n:number)=>-n||0)
      expect(saved).toEqual(expected)
      await page.reload();await page.locator('#piece').selectOption(plate.id)
      await expect(page.locator('#flip-viewer-face')).toBeEnabled()
      await page.locator('#flip-viewer-face').click()
      await expect(page.locator('#message')).toContainText('板の位置と接続を保って表裏')
      await page.locator('#save').click();await expect(page.locator('#message')).toContainText('変更を保存しました')
      expect(JSON.parse(readFileSync(file,'utf8'))).toEqual(original)
    }
    await page.setViewportSize({width:390,height:844})
    await page.locator('#face-panel').screenshot({path:'test-results/plate-face-mobile.png'})
    expect(await page.evaluate(()=>document.documentElement.scrollWidth)).toBeLessThanOrEqual(391)
    expect(errors).toEqual([])
  } finally {
    await page.close();server.closeAllConnections();await new Promise<void>(resolve=>server.close(()=>resolve()));rmSync(dir,{recursive:true,force:true})
  }
})
