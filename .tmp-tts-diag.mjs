/** 诊断脚本（临时）：验证「音色未就绪时 speakWithVoice 是否发声」 */
import { build } from 'esbuild'
import { pathToFileURL } from 'node:url'
import path from 'node:path'

const root = process.cwd()
const outfile = path.join(root, '.tmp-speech-diag.mjs')
await build({
  entryPoints: [path.join(root, 'src/lib/speech.ts')],
  bundle: true, format: 'esm', platform: 'node', outfile, logLevel: 'silent',
})

const spoken = []
let voices = []
class U { constructor(t) { this.text = t; this.onend = null; this.onerror = null } }
globalThis.window = {
  speechSynthesis: {
    getVoices: () => voices,
    speak: (u) => { spoken.push(u.text); setTimeout(() => { try { u.onend?.() } catch {} }, 5) },
    cancel: () => {},
  },
  setTimeout, clearTimeout,
}
globalThis.SpeechSynthesisUtterance = U

const S = await import(pathToFileURL(outfile).href + '?d=' + Date.now())

console.log('--- 场景 A：Chrome 首次 getVoices() 返回 []（音色未加载完）---')
spoken.length = 0
let endedA = false
const sessionA = S.speakWithVoice('Hello there, my friend.', {
  onEnd() { endedA = true },
})
await new Promise((r) => setTimeout(r, 1200))
console.log('  synth.speak 次数 =', spoken.length, '| mock(演示模式) =', sessionA.mock, '| onEnd 触发 =', endedA)
console.log('  → 结论：', spoken.length === 0 ? '❌ 静默无声（无声 bug 复现）' : '✅ 有发声')

console.log('--- 场景 B：音色就绪后（voiceschanged 已到来）---')
voices = [{ voiceURI: 'urn:x', name: 'X', lang: 'en-US', default: true }]
spoken.length = 0
const sessionB = S.speakWithVoice('Hello there, my friend.', { onEnd() {} })
await new Promise((r) => setTimeout(r, 300))
console.log('  synth.speak 次数 =', spoken.length, '| mock =', sessionB.mock)
console.log('  → 结论：', spoken.length > 0 ? '✅ 正常发声（对应手动「重播」）' : '❌ 仍无声')

console.log('--- 场景 C：模块级互斥锁残留 ---')
S.setMicActive(true)
spoken.length = 0
const sessionC = S.speakWithVoice('Hello there.', { onEnd() {} })
await new Promise((r) => setTimeout(r, 50))
console.log('  micActive =', S.isMicActive(), '| canSpeakNow =', S.canSpeakNow(),
  '| synth.speak 次数 =', spoken.length)
console.log('  → 结论：', spoken.length === 0 ? '❌ 麦克风假死会静默吞掉朗读' : '✅ 未被拦截')
S.setMicActive(false)
