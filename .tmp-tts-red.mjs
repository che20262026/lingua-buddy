/**
 * RED 复现（临时）：真实 bundle + JSDOM，模拟 Chrome getVoices() 异步加载。
 * 期望（修复前会失败）：发送后 AI 回复自动发声。
 */
import { JSDOM, VirtualConsole } from 'jsdom'
import { pathToFileURL, fileURLToPath } from 'node:url'
import fs from 'node:fs'
import path from 'node:path'

const root = path.dirname(fileURLToPath(import.meta.url))
const html = fs.readFileSync(path.join(root, 'dist', 'index.html'), 'utf8')
const assetDir = path.join(root, 'dist', 'assets')
const jsFile = fs.readdirSync(assetDir).find((f) => /^index-.*\.js$/.test(f))
const vc = new VirtualConsole()
vc.on('jsdomError', (e) => console.log('[jsdom]', e.message))

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

/* ---- Chrome 风格语音合成桩：getVoices 首次为空，voiceschanged 后才有值 ---- */
const spoken = []
let deviceVoices = []          // ← 关键：初始为空
const listeners = []
class FakeUtterance {
  constructor(text) { this.text = text; this.lang = ''; this.rate = 1; this.pitch = 1; this.voice = null; this.onend = null; this.onerror = null }
}
w.speechSynthesis = {
  getVoices: () => deviceVoices,
  speak: (u) => { spoken.push(u.text); setTimeout(() => { try { u.onend?.() } catch {} }, 5) },
  cancel: () => {},
  addEventListener: (_, fn) => listeners.push(fn),
  removeEventListener: () => {},
}
w.SpeechSynthesisUtterance = FakeUtterance
globalThis.SpeechSynthesisUtterance = FakeUtterance

const tick = (ms = 120) => new Promise((r) => setTimeout(r, ms))
const fire = (el) => el.dispatchEvent(new (globalThis.MouseEvent)('click', { bubbles: true, cancelable: true }))
const click = (re, label) => {
  const el = [...document.querySelectorAll('button')]
    .find((b) => !b.disabled && re.test((b.textContent || '').replace(/\s+/g, ' ')))
  if (!el) throw new Error(`找不到按钮: ${label}`)
  fire(el)
}

await import(pathToFileURL(path.join(assetDir, jsFile)).href + '?red=' + Date.now())
await tick(300)

click(/Try an example/, '载入示例')
await tick(120)
click(/生成学习场景/, '生成场景')
await tick(1000)
click(/在农夫市集挑苹果/, '进入场景')
await tick(150)
click(/开始对话冒险/, '开始对话')
await tick(250)

// 确认自动朗读开关是开的
const toggle = [...document.querySelectorAll('button')]
  .find((b) => (b.getAttribute('aria-label') || '').includes('自动朗读'))
console.log('自动朗读开关 =', toggle?.getAttribute('aria-checked'))

// 打字 + 发送
const ta = document.querySelector('textarea')
const setter = Object.getOwnPropertyDescriptor(w.HTMLTextAreaElement.prototype, 'value').set
setter.call(ta, 'I would like some fresh apples please.')
ta.dispatchEvent(new (globalThis.Event)('input', { bubbles: true }))
await tick(80)
spoken.length = 0
fire(document.querySelector('button[aria-label="发送"]'))
await tick(900)

const aiBubble = [...document.querySelectorAll('[data-testid^="ai-bubble-"]')]
  .map((el) => el.querySelector('p')?.textContent || '').filter(Boolean)
console.log('AI 气泡最后一条 =', JSON.stringify(aiBubble[aiBubble.length - 1]?.slice(0, 60)))
console.log('自动朗读 synth.speak 次数 =', spoken.length)

// 音色在发送之后才就绪（模拟真实 Chrome voiceschanged 迟到）
deviceVoices = [{ voiceURI: 'urn:us', name: 'US', lang: 'en-US', default: true }]
listeners.forEach((fn) => fn())
await tick(300)

// 手动点重播（对照组）
const replay = document.querySelector('[data-testid^="replay-"]')
if (replay) { fire(replay); await tick(300) }
console.log('手动重播后 synth.speak 次数 =', spoken.length)

const passed = spoken.length > 0 && aiBubble.length > 0
console.log(passed ? '\n✅ GREEN：自动朗读发声' : '\n❌ RED：自动朗读静默无声（bug 复现）')
process.exitCode = passed ? 0 : 1
