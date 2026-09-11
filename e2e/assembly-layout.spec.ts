import { test, expect } from '@playwright/test'
test('スマホのメイン図に接続矢印を同時表示し、回転・分解に追従する', async ({ page }) => {
  test.setTimeout(60000)
  await page.goto('./assembly/metamon?step=assembly:0')
  const iframe = page.locator('iframe'), viewer = page.frameLocator('iframe')
  await expect(iframe).toHaveAttribute('data-shown', 'assembly:0', { timeout: 30000 })
  await expect(viewer.locator('#guide')).toBeHidden()
  await expect(viewer.locator('#show-connections')).toBeHidden()
  const arrows=viewer.locator('#stage .connection-path')
  await expect(arrows).toHaveCount(2)
  await expect(viewer.locator('#stage .connection-arrow text')).toHaveCount(0)
  const before=await arrows.first().getAttribute('d')
  await viewer.getByText('むきを かえる・すかして見る', { exact: true }).click()
  await viewer.getByRole('button', { name: 'まえ', exact: true }).click()
  await expect(arrows.first()).not.toHaveAttribute('d',before!)
  await viewer.locator('#stage').focus()
  await page.keyboard.press('ArrowRight')
  await expect(arrows).toHaveCount(2)
  for(const value of ['0','100']){
    await viewer.locator('#explode').fill(value)
    await viewer.locator('#explode').dispatchEvent('input')
    await expect(arrows).toHaveCount(2)
  }
  const frame=page.frames().find(f=>f.url().includes('/assemblies/viewer/'))!
  const sizes=await frame.evaluate(()=>[document.documentElement.scrollWidth,document.documentElement.clientWidth])
  expect(sizes[0]).toBe(sizes[1])
})
