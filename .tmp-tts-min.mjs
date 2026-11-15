/**
 * Phase 2 最小化复现：一次只切一个变量。
 * 变量 X = getVoices() 是否一开始就有音色。
 * 若「音色就绪时自动朗读仍无声」→ 根因与音色无关，另有其人。
 */
import { JSDOM, VirtualConsole } from 'jsdom'
import { pathToFileURL, fileURLToPath } from 'node:url'
import fs from 'node:fs'
import path from 'node:path'

const root = path.dirname(fileURLToPath(import.meta.url))
const html = fs.readFileSync(path.join(root, 'dist', 'index.html'), 'utf8')
const assetDir = path.join(root, 'dist', 'assets')
const jsFile = fs.readdirSync(assetDir).find((f) => /^index-.*\.js$/.test(f))
const tick = (ms = 120) => new Promise((r) => setTimeout(r, ms))

async function run(voicesReadyAtStart) {
  const vc = new VirtualConsole()
  vc.on('jsdomError', () => {})
  const dom = new JSDOM(html.replace(/<script[^>]*><\/script>/g, ''), {
    url: 'http://localhost:5173/', pretendToBeVisual: true, runScripts: 'outside-only', virtualConsole: vc,
  })
  const w = dom.window
  w.scrollTo = () => {}
  w.Element.prototype.scrollIntoView = () => {}
  for (const key of ['window', 'document', 'navigator', 'localStorage', 'HTMLElement', 'Node', 'MouseEvent',
    'Event', 'CustomEvent', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame',
    'MutationObserver', 'DOMParser', 'FileReader', 'Blob', 'File', 'HTMLInputElement', 'HTMLTextAreaElement']) {
    try { Object.defineProperty(globalThis, key, { value: w[key], writable: true, configurable: true }) } catch {}
  }

  const spoken = []
  let deviceVoices = voicesReadyAtStart
    ? [{ voiceURI: 'urn:us', name: 'US', lang: 'en-US', default: true }]
    : []
  class FakeUtterance {
    constructor(text) { this.text = text; this.lang = ''; this.rate = 1; this.pitch = 1; this.voice = null; this.onend = null; this.onerror = null }
  }
  w.speechSynthesis = {
    getVoices: () => deviceVoices,
    speak: (u) => { spoken.push(u.text); setTimeout(() => { try { u.onend?.() } catch {} }, 5) },
    cancel: () => {},
    addEventListener: () => {},
    removeEventListener: () => {},
  }
  w.SpeechSynthesisUtterance = FakeUtterance
  globalThis.SpeechSynthesisUtterance = FakeUtterance

  const fire = (el) => el.dispatchEvent(new (globalThis.MouseEvent)('click', { bubbles: true, cancelable: true }))
  const click = (re) => {
    const el = [...document.querySelectorAll('button')]
      .find((b) => !b.disabled && re.test((b.textContent || '').replace(/\s+/g, ' ')))
    if (el) fire(el)
  }

  await import(pathToFileURL(path.join(assetDir, jsFile)).href + `?min=${voicesReadyAtStart}=${Date.now()}`)
  await tick(300)
  click(/Try an example/); await tick(120)
  click(/生成学习场景/); await tick(1000)
  click(/在农夫市集挑苹果/); await tick(150)
  click(/开始对话冒险/); await tick(250)

  const ta = document.querySelector('textarea')
  const setter = Object.getOwnPropertyDescriptor(w.HTMLTextAreaElement.prototype, 'value').set
  setter.call(ta, 'I would like some fresh apples please.')
  ta.dispatchEvent(new (globalThis.Event)('input', { bubbles: true }))
  await tick(80)
  spoken.length = 0
  fire(document.querySelector('button[aria-label="发送"]'))
  await tick(900)

  const autoCount = spoken.length
  const bubbles = document.querySelectorAll('[data-testid^="ai-bubble-"]').length
  const replay = document.querySelector('[data-testid^="replay-"]')
  if (replay) { fire(replay); await tick(300) }
  console.log(`音色初始就绪=${voicesReadyAtStart} | AI气泡=${bubbles} | 自动朗读=${autoCount} | +手动重播后=${spoken.length}`)
  dom.window.close()
  return { autoCount, bubbles }
}

console.log('=== Phase 2 最小化复现（切变量：音色是否就绪）===')
const withVoices = await run(true)
const noVoices = await run(false)
console.log('\n判定：')
console.log('  音色就绪时自动朗读', withVoices.autoCount > 0 ? '✅ 有声' : '❌ 仍无声 → 音色不是唯一根因')
console.log('  音色未就绪时自动朗读', noVoices.autoCount > 0 ? '✅ 有声' : '❌ 无声')
