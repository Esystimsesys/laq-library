import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { chromium } from '@playwright/test'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const { values } = parseArgs({ options: {
  url: { type: 'string', default: 'http://localhost:5175/' },
  id: { type: 'string' },
  out: { type: 'string' },
  'yaw-steps': { type: 'string', default: '7' },
  'pitch-steps': { type: 'string', default: '1' },
} })

if (!values.id || !/^[a-z0-9-]+$/.test(values.id)) throw new Error('--id must be a lowercase slug')
if (!values.out) throw new Error('--out is required')
const output = path.resolve(root, values.out)
const publicRoot = path.join(root, 'public')
if (!output.startsWith(`${publicRoot}${path.sep}`) || path.extname(output).toLowerCase() !== '.png') {
  throw new Error('--out must be a PNG inside public/')
}
const yawSteps = Number(values['yaw-steps'])
const pitchSteps = Number(values['pitch-steps'])
if (![yawSteps, pitchSteps].every(Number.isInteger)) throw new Error('view steps must be integers')

const base = new URL(values.url)
const viewer = new URL(`assemblies/viewer/index.html?id=${encodeURIComponent(values.id)}`, base)
const browser = await chromium.launch()
try {
  const page = await browser.newPage({ viewport: { width: 900, height: 760 }, deviceScaleFactor: 2 })
  await page.goto(viewer.href)
  await page.locator('#loading').waitFor({ state: 'hidden', timeout: 30000 })
  await page.addStyleTag({ content: '.hint{display:none!important}#stage{outline:none!important}' })
  await page.evaluate(() => window.LaQLibraryViewer.show({ phase: 'complete' }))
  const stage = page.locator('#stage')
  await stage.focus()
  for (let index = 0; index < Math.abs(yawSteps); index++) await stage.press(yawSteps < 0 ? 'ArrowRight' : 'ArrowLeft')
  for (let index = 0; index < Math.abs(pitchSteps); index++) await stage.press(pitchSteps < 0 ? 'ArrowDown' : 'ArrowUp')
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))))
  const stageBox = await stage.boundingBox()
  const screenBounds = await page.evaluate(() => window.__unitGuide().screenBounds)
  if (!stageBox || !screenBounds) throw new Error('Could not determine the model bounds')

  const modelLeft = stageBox.x + ((screenBounds.left + 1) / 2) * stageBox.width
  const modelRight = stageBox.x + ((screenBounds.right + 1) / 2) * stageBox.width
  const modelTop = stageBox.y + ((1 - screenBounds.top) / 2) * stageBox.height
  const modelBottom = stageBox.y + ((1 - screenBounds.bottom) / 2) * stageBox.height
  const modelCenterX = (modelLeft + modelRight) / 2
  const modelCenterY = (modelTop + modelBottom) / 2
  const targetRatio = stageBox.width / stageBox.height
  const paddedWidth = (modelRight - modelLeft) * 1.24
  const paddedHeight = (modelBottom - modelTop) * 1.24
  let captureWidth = Math.max(paddedWidth, paddedHeight * targetRatio)
  let captureHeight = captureWidth / targetRatio
  if (captureWidth > stageBox.width) {
    captureWidth = stageBox.width
    captureHeight = captureWidth / targetRatio
  }
  if (captureHeight > stageBox.height) {
    captureHeight = stageBox.height
    captureWidth = captureHeight * targetRatio
  }
  const captureX = Math.max(stageBox.x, Math.min(
    modelCenterX - captureWidth / 2,
    stageBox.x + stageBox.width - captureWidth,
  ))
  const captureY = Math.max(stageBox.y, Math.min(
    modelCenterY - captureHeight / 2,
    stageBox.y + stageBox.height - captureHeight,
  ))

  mkdirSync(path.dirname(output), { recursive: true })
  await page.screenshot({
    path: output,
    clip: { x: captureX, y: captureY, width: captureWidth, height: captureHeight },
  })
  console.log(`Captured ${values.id} → ${path.relative(root, output)}`)
} finally {
  await browser.close()
}
