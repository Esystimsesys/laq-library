import { expect, test } from '@playwright/test'

test('デスカーンの統合した15手順を表示する', async ({ page }) => {
  test.setTimeout(90000)
  await page.goto('./assembly/desukan?step=unit%3Abody%3A0')

  await expect(page.getByRole('progressbar')).toHaveAttribute('max', '15')
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '3')
  await expect(page.locator('iframe')).toHaveAttribute('data-shown', 'unit:body:0', { timeout: 30000 })
  await expect(page.frameLocator('iframe').locator('#step-title')).toContainText('まえと そこ')

  const next = page.getByRole('navigation', { name: 'てじゅんを すすめる' }).getByRole('button', { name: /つぎへ/ })
  await next.click()
  await expect(page.getByRole('progressbar')).toHaveAttribute('value', '4')
  await expect(page.locator('iframe')).toHaveAttribute('data-shown', 'unit:body:1', { timeout: 30000 })
  await expect(page.frameLocator('iframe').locator('#step-title')).toContainText('りょうがわの かべと てんじょう')

  await next.click()
  await expect(page.locator('iframe')).toHaveAttribute('data-shown', 'unit:body:2', { timeout: 30000 })
  await expect(page.frameLocator('iframe').locator('#step-title')).toContainText('せなか')

  await next.click()
  await expect(page.locator('iframe')).toHaveAttribute('data-shown', 'unit:body:3', { timeout: 30000 })
  await expect(page.frameLocator('iframe').locator('#step-title')).toContainText('えり')
})
