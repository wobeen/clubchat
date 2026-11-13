import { mkdirSync, readdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
const { chromium } = await import('playwright').catch(() =>
  import('/tmp/pw/node_modules/playwright/index.mjs')
)

const root = dirname(fileURLToPath(import.meta.url))
const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'))
const outDir = join(root, 'png')
const artifactDir = '/opt/cursor/artifacts'
mkdirSync(outDir, { recursive: true })
mkdirSync(artifactDir, { recursive: true })

const artifactNames = new Set([
  'foundations-desktop-light.png',
  'login-desktop-light.png',
  'clubs-desktop-light.png',
  'clubs-mobile-light.png',
  'club-home-desktop-light.png',
  'club-home-mobile-light.png',
  'room-home-desktop-light.png',
  'chat-desktop-light.png',
  'chat-mobile-light.png',
  'message-menu-desktop-light.png',
  'event-detail-desktop-light.png',
  'event-detail-mobile-light.png',
])

const browser = await chromium.launch({ headless: true })
const failures = []

for (const job of manifest) {
  const viewport = job.device === 'desktop' ? { width: 1440, height: 900 } : { width: 390, height: 844 }
  const page = await browser.newPage({ viewport, deviceScaleFactor: 2 })
  const url = pathToFileURL(join(root, 'pages', job.file)).href
  await page.goto(url, { waitUntil: 'load' })
  await page.evaluate(async () => { await document.fonts.ready })
  const fontOk = await page.evaluate(() => document.fonts.check('16px Pretendard'))
  if (!fontOk) failures.push(`font ${job.file}`)
  const name = `${job.id}-${job.device}-${job.theme}.png`
  const dest = join(outDir, name)
  await page.screenshot({ path: dest, type: 'png' })
  if (artifactNames.has(name)) {
    await page.screenshot({ path: join(artifactDir, `clubchat-${name}`), type: 'png' })
  }
  await page.close()
  process.stdout.write(`ok ${name}\n`)
}

for (const file of readdirSync(artifactDir)) {
  if (file.startsWith('clubchat-') && file.endsWith('.png') && !artifactNames.has(file.slice('clubchat-'.length))) {
    rmSync(join(artifactDir, file))
  }
}

await browser.close()
if (failures.length) {
  console.error(failures.join('\n'))
  process.exit(1)
}
console.log(`captured ${manifest.length}`)
