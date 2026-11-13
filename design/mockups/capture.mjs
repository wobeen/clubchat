import { mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import { chromium } from 'playwright'

const root = dirname(fileURLToPath(import.meta.url))
const manifest = JSON.parse(readFileSync(join(root, 'manifest.json'), 'utf8'))
const outDir = join(root, 'png')
const artifactDir = '/opt/cursor/artifacts'
mkdirSync(outDir, { recursive: true })
mkdirSync(artifactDir, { recursive: true })

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
  await page.screenshot({ path: join(artifactDir, `clubchat-${name}`), type: 'png' })
  await page.close()
  process.stdout.write(`ok ${name}\n`)
}

await browser.close()
if (failures.length) {
  console.error(failures.join('\n'))
  process.exit(1)
}
console.log(`captured ${manifest.length}`)
