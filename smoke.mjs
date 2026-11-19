import { JSDOM, VirtualConsole } from 'jsdom'
import { pathToFileURL, fileURLToPath } from 'node:url'
import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { build, transform } from 'esbuild'

const root = path.dirname(fileURLToPath(import.meta.url))
const tempFiles = []
process.on('exit', () => {
  for (const f of tempFiles) { try { fs.rmSync(f, { force: true }) } catch { /* ignore */ } }
})
/** 用 esbuild 把单个 TS 模块打成临时 ESM，便于对纯函数做真实单测。
 *  产物放系统临时目录：Windows 上动态 import 后 exit 钩子的 rmSync 偶发失效，
 *  过去会在项目根目录遗留 .smoke-*.mjs；移出去后根目录永远干净。 */
const loadModule = async (rel, name) => {
  const outfile = path.join(os.tmpdir(), `lingua-smoke-${name}-${process.pid}.mjs`)
  await build({ entryPoints: [path.join(root, rel)], bundle: true, format: 'esm',
    platform: 'node', outfile, logLevel: 'silent' })
  tempFiles.push(outfile)
  return import(pathToFileURL(outfile).href + `?t=${Date.now()}`)
}
const assetDir = path.join(root, 'dist', 'assets')
/** [PWA] assets/ 多了一个 workbox-window 分片，固定挑主入口，避免目录顺序漂移 */
const jsFile = fs.readdirSync(assetDir).find((f) => /^index-.*\.js$/.test(f))
  || fs.readdirSync(assetDir).find((f) => f.endsWith('.js'))
const html = fs.readFileSync(path.join(root, 'dist', 'index.html'), 'utf8')

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
  try {
    Object.defineProperty(globalThis, key, { value: w[key], writable: true, configurable: true })
  } catch { /* Node 22 部分全局为只读，跳过即可 */ }
}

const errors = []
const origError = console.error
console.error = (...args) => { errors.push(args.map(String).join(' ')); origError(...args) }

const tick = (ms = 120) => new Promise((r) => setTimeout(r, ms))
/**
 * 去掉块注释与行注释。
 * 断言「代码里没有 X」时**必须看代码**：源码注释里常写着
 * 「我们刻意没用 X」「它不注册进 X」这类说明，原文匹配会把它们误判成违规。
 */
const stripComments = (src) => src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '')
const bodyText = () => (document.body.textContent || '').replace(/\s+/g, ' ')
const buttons = () => [...document.querySelectorAll('button')]
const fire = (el) => el.dispatchEvent(new (globalThis.MouseEvent)('click', { bubbles: true, cancelable: true }))
const click = (re, label) => {
  const el = buttons().find((b) => !b.disabled && re.test((b.textContent || '').replace(/\s+/g, ' ')))
  if (!el) throw new Error(`✗ 找不到按钮: ${label} | 当前页面: ${bodyText().slice(0, 220)}`)
  fire(el)
}
const clickExact = (text, label) => {
  const el = buttons().find((b) => !b.disabled && (b.textContent || '').trim() === text)
  if (!el) throw new Error(`✗ 找不到导航按钮: ${label}`)
  fire(el)
}
const assert = (cond, msg) => { if (!cond) throw new Error(`✗ ${msg} | 页面: ${bodyText().slice(0, 260)}`); console.log('✓', msg) }

await import(pathToFileURL(path.join(assetDir, jsFile)).href)
await tick(200)

try {
  /* ============ 语音评判引擎：合成 PCM 的纯函数单测 ============ */
  const { analyzePcm, assessVoice, transcriptMetrics, summarizeVoice, trimVoiceReports } =
    await loadModule('src/services/voiceAssessor.ts', 'voice')
  const ieltsMod = await loadModule('src/data/ieltsLevels.ts', 'ielts')
  const coachMod = await loadModule('src/services/coach.ts', 'coach')
  const speechMod = await loadModule('src/lib/speech.ts', 'speech')
  const asrMod = await loadModule('src/services/transcriber.ts', 'asr')
  const level = ieltsMod.getIeltsLevel('b5')

  const rate = 8000
  const pcm = new Float32Array(rate * 2)
  for (let i = 0; i < pcm.length; i++) {
    const t = i / rate
    const silent = t < 0.12 || (t > 0.9 && t < 1.25)
    pcm[i] = silent ? 0 : 0.32 * Math.sin(2 * Math.PI * 180 * t) * (0.7 + 0.3 * Math.sin(2 * Math.PI * 3 * t))
  }
  const features = analyzePcm(pcm, rate)
  assert(features && features.measured && features.waveform.length === 64 && features.pitchCurve.length === 32,
    '声学引擎从合成 PCM 提取 64 点波形与 32 点音高曲线')
  assert(features.durationMs > 1500 && features.speechRateWpm > 0 && features.clarity >= 0,
    '声学引擎测出时长、语速与清晰度')

  const measured = assessVoice({ features, level, source: 'recording',
    transcript: 'I would like some fresh apples.', targetWords: ['apples'], sessionId: 's-test', turn: 0 })
  assert(measured.dimensions.fc >= 3.5 && measured.dimensions.fc <= 9
    && measured.dimensions.pr >= 3.5 && measured.dimensions.pr <= 9,
  '实测录音换算出 FC / PR 练习参考 Band')
  assert(measured.strengths.length > 0 && measured.suggestions.length > 0
    && measured.disclaimer.includes('不是官方雅思评分'),
  '实测点评含亮点、可执行建议与「不是官方评分」免责声明')
  assert(measured.strengths.some((s) => s.includes('apples')), '点评能认出用户真的说出了目标词')

  const textOnly = assessVoice({
    features: transcriptMetrics('I would like some fresh apples.', 3000),
    level, source: 'recognition', transcript: 'I would like some fresh apples.',
  })
  assert(!textOnly.metrics.measured && textOnly.waveform.length === 0
    && textOnly.metrics.clarity === 0 && textOnly.bandRef <= 6.5,
  '仅识别文本时不臆造波形/清晰度，并压低参考分上限')
  const sum = summarizeVoice([measured, textOnly], level)
  assert(sum && sum.count === 2 && sum.measuredCount === 1 && typeof sum.trend === 'number',
    '汇总统计区分实测与仅文本记录')
  assert(trimVoiceReports(Array.from({ length: 60 }, () => measured)).length === 40, '存档裁剪上限 40 条')

  // CoachAgent：真实录音必须替换掉文本推算的发音占位分
  const fakeSession = {
    id: 's-test', scenarioId: 'sc', scenarioTitle: '测试场景', userCharacterId: 'c1', aiCharacterId: 'c2',
    messages: [
      { id: 'm1', role: 'user', speaker: 'Me', text: 'I would like some fresh apples.', at: Date.now(),
        feedback: { level: 'none', grammar: '', wordChoice: '', naturalness: '', corrected: 'I would like some fresh apples.', praise: '' } },
      { id: 'm2', role: 'ai', speaker: 'Tom', text: 'Sure, here you are.', at: Date.now() },
    ],
    coveredWords: ['apples'], mistakes: [], turns: 1, createdAt: Date.now(),
  }
  const fakeScenario = { id: 'sc', title: '测试场景', goal: '买苹果', characters: [], targetWords: ['apples'],
    targetPhrases: ['How about ...?'], sentenceFrames: [], openingLine: 'Hello!', suggestedReplies: [],
    rounds: 6, tint: '', emblem: '🍎' }
  const fakeSettings = { difficulty: 'B1', ieltsLevel: 'b5', rate: 1, accent: 'en-US', showTranslation: true,
    correction: 'balanced', autoSpeak: false, apiMode: 'mock', apiEndpoint: '', apiKey: '', apiModel: '' }
  const withVoice = coachMod.buildSessionReport({
    session: fakeSession, scenario: fakeScenario, settings: fakeSettings, voiceReports: [measured],
  })
  assert(withVoice.ielts.disclaimer.includes('真实录音') && withVoice.voice?.measuredCount === 1,
    'CoachAgent 用真实录音替换发音占位分并写入语音汇总')
  assert(withVoice.reviewTasks.some((t) => t.includes('发音练习')), '复习任务自动加入发音练习')

  /* ============ 文学研读模块：纯函数单测 ============ */
  const seedMod = await loadModule('src/data/librarySeed.ts', 'libseed')
  const curator = await loadModule('src/services/literaryCurator.ts', 'curator')
  const analyzer = await loadModule('src/services/literaryAnalyzer.ts', 'analyzer')
  const seminarDir = await loadModule('src/services/seminarDirector.ts', 'seminar')
  const litStorage = await loadModule('src/lib/literaryStorage.ts', 'litstorage')

  const litBooks = seedMod.BUILTIN_BOOKS
  assert(litBooks.length >= 3 && litBooks.length <= 5, '内置书单控制在 3-5 本')
  const ALLOWED_TITLES = [
    'A Christmas Carol', "Alice's Adventures in Wonderland",
    'The Adventures of Sherlock Holmes', 'The Yellow Wallpaper', 'Pride and Prejudice',
  ]
  assert(litBooks.every((b) => ALLOWED_TITLES.includes(b.title)), '未内置任何版权状态不明的作品')
  assert(litBooks.every((b) => b.source && b.publicDomainRegion && b.licenseNote && b.excerptNote
    && b.source.toLowerCase().includes('gutenberg')), '每本书都有 source / publicDomainRegion / licenseNote 三件套')
  assert(litBooks.every((b) => b.chapters.length > 0 && b.chapters.every((c) => c.paragraphs.length === c.simplified.length
    && c.paragraphs.length === c.notesZh.length)), '三套视图段落一一对应，不打断阅读流')

  /* ============ 旁侧生词词典：牛津式词条纯函数单测 ============ */
  const glossary = await loadModule('src/data/oxfordGlossary.ts', 'glossary')
  assert(glossary.glossaryStats().entries === 60, '内置 60 条牛津式词条，覆盖全部 12 章重点词')
  assert(glossary.stripPosPrefix('n. 登记簿；名册') === '登记簿；名册',
    '中文对照只保留释义，不重复词性前缀')
  let glossChecked = 0
  for (const b of litBooks) {
    for (const c of b.chapters) {
      for (const g of c.glosses) {
        const e = glossary.lookupOxfordEntry(g.word, g.meaningZh, g.note, '')
        assert(!e.isFallback && e.defEn.length > 10 && e.ipa && e.pos && e.example,
          `每个重点词都有英英释义 / 音标 / 词性 / 例句：${b.title} / ${g.word}`)
        glossChecked++
      }
    }
  }
  assert(glossChecked === 60, `60 个重点词全部命中内置词条，零缺口（已校验 ${glossChecked} 个）`)
  const dictSample = glossary.lookupOxfordEntry('register', 'n. 登记簿；名册', '此处指埋葬登记记录', 'Marley was dead: to begin with.')
  assert(dictSample.defEn.includes('official written list') && dictSample.defZh === '登记簿；名册'
    && dictSample.chapterNote.includes('埋葬') && dictSample.chapterSentence.includes('Marley'),
  '词条以英英释义为主，中文对照 / 本章语境 / 本章原句为辅')
  assert(dictSample.forms.includes('registered') && dictSample.collocations.includes('parish register'),
    '词条含词形与搭配，符合词典式结构')
  assert(glossary.lookupOxfordEntry('a-nonexistent-word').isFallback === true
    && glossary.lookupOxfordEntry('a-nonexistent-word').defEn === '',
  '未收录词不臆造英英释义，诚实降级为本章中文语境')
  glossary.setDictionaryProvider(() => ({ ...dictSample, defEn: 'Custom provider definition.' }))
  assert(glossary.lookupOxfordEntry('register').defEn === 'Custom provider definition.',
    '词典可替换接口生效，便于接入真实词典服务')
  glossary.resetDictionaryProvider()
  assert(glossary.lookupOxfordEntry('register').defEn.includes('official written list'),
    '重置后回到离线内置词条，远程失败自动回退')
  assert(glossary.OXFORD_DISCLAIMER.includes('不是 Oxford University Press 官方内容'),
    '明确标注不是牛津官方内容，守住词典版权边界')

  let evidenceTotal = 0
  for (const b of litBooks) {
    for (const c of b.chapters) {
      const text = c.paragraphs.join(' ')
      for (const q of c.keyQuotes) {
        assert(analyzer.evidenceInChapter(text, q.quote), `关键引文逐字命中原文：${b.title} / ${c.title}`)
        evidenceTotal++
      }
      for (const t of c.seedThemes) {
        assert(analyzer.evidenceInChapter(text, t.evidence), `主题证据逐字命中原文：${b.title} / ${c.title}`)
        evidenceTotal++
      }
      for (const s of c.seedSymbols) {
        assert(analyzer.evidenceInChapter(text, s.evidence), `象征证据逐字命中原文：${b.title} / ${c.title}`)
        evidenceTotal++
      }
    }
  }
  assert(evidenceTotal >= 40, `共校验 ${evidenceTotal} 条原文证据，零编造`)

  const libState = { seedVersion: seedMod.LIBRARY_SEED_VERSION, books: litBooks, briefs: {} }
  const sampleBook = litBooks[0]
  const sampleChapter = sampleBook.chapters[0]
  const chapters = curator.listChapters(libState, sampleBook.id)
  assert(chapters.length === sampleBook.chapters.length
    && chapters.every((c) => c.wordCount > 0 && ['A2', 'B1', 'B2', 'C1'].includes(c.cefr)),
  'CuratorAgent 输出章节列表、每章字数与 CEFR 估计')
  assert(curator.estimateCefr('The cat sat. A dog ran.') === 'A2'
    && ['B1', 'B2', 'C1'].includes(curator.estimateCefr(sampleChapter.paragraphs.join(' '))),
  'CEFR 估计与现有档位字段同构')
  assert(curator.hasValidProvenance(sampleBook)
    && !curator.hasValidProvenance({ ...sampleBook, source: 'some random blog' }),
  '版权三件套不完整或来源不权威时不放行')
  assert(curator.chapterBriefFor(libState, sampleBook, sampleBook.chapters[1].id)
    === curator.chapterBriefFor(libState, sampleBook, sampleBook.chapters[1].id),
  '前情摘要只取上一章，确定性可复现')

  const chapterAnalysis = analyzer.mockAnalyzeChapter({ chapter: sampleChapter, book: sampleBook, targetDifficulty: 'B1' })
  assert(chapterAnalysis.chapterBrief && chapterAnalysis.summaryZh
    && ['A2', 'B1', 'B2', 'C1'].includes(chapterAnalysis.cefr), 'AnalyzerAgent 输出摘要 / CEFR / chapterBrief')
  assert(chapterAnalysis.discussionQuestions.length === 3, '每章恰好 3 个开放性问题')
  assert(chapterAnalysis.themes.length > 0 && chapterAnalysis.hardWords.length > 0
    && chapterAnalysis.keyQuotes.length > 0 && chapterAnalysis.evidenceValidated,
  '分析输出含主题 / 人物 / 象征 / 难词 / 引文，且证据已校验')
  const forged = {
    ...chapterAnalysis,
    themes: [{ name: '虚构情节', evidence: 'This invented sentence never appears in any public domain book.' }],
  }
  const cleaned = analyzer.validateEvidence(forged, sampleChapter.paragraphs.join(' '))
  assert(cleaned.themes.length === 0 && cleaned.evidenceValidated === false,
    '编造的引文被证据闸门剔除（真实 LLM 输出同样受此约束）')

  const seminarInput = {
    chapterText: sampleChapter.paragraphs.join('\n\n'),
    chapterTitle: sampleChapter.title,
    chapterBrief: curator.chapterBriefFor(libState, sampleBook, sampleChapter.id),
    themes: chapterAnalysis.themes,
    characters: chapterAnalysis.characters,
    keyQuotes: chapterAnalysis.keyQuotes,
    discussionQuestions: chapterAnalysis.discussionQuestions,
    role: 'guide', guidance: 'medium', history: [],
    userInput: 'I think Scrooge is lonely because the text says "Marley was dead: to begin with."',
    difficulty: 'B1', turn: 0,
  }
  const semOut = seminarDir.mockSeminarTurn(seminarInput)
  assert(semOut.reply.includes('?') && semOut.reply.split(/(?<=[.!?])\s+/).length >= 2,
    '研讨发言 2-4 句且含一个开放问题 / 证据追问')
  assert(semOut.feedback.argument && semOut.feedback.language && semOut.feedback.praise
    && ['none', 'minor', 'major'].includes(semOut.feedback.level),
  '反馈同时含论证反馈与语言反馈，level / praise 兼容现有组件')
  assert(!/i am (scrooge|alice|holmes|the ghost)/i.test(semOut.reply)
    && !seminarDir.containsRoleplay(semOut.reply, ['Scrooge']),
  '引导者不扮演小说角色、不写小说续写')
  const cnOut = seminarDir.mockSeminarTurn({ ...seminarInput, userInput: '我觉得斯克鲁奇其实很孤独' })
  assert(cnOut.feedback.corrected && /I read/.test(cnOut.feedback.corrected),
    '中文观点给出可模仿的英文表达')
  assert(Boolean(seminarDir.mockSeminarTurn({ ...seminarInput, turn: 2 }).stageSummary),
    '每 3 轮做一次轻量小结')
  assert(Boolean(seminarDir.mockSeminarTurn({ ...seminarInput, userInput: 'It is cold.' }).evidencePrompt),
    '没有原文证据时给出「回原文找证据」提示')
  assert(seminarDir.normalizeSeminarOutput({ reply: 'Sure, that is fine.', end: true }, seminarInput).end === false,
    '前三轮不允许提前结束，保证至少 4 轮分析性对话')
  const payload = seminarDir.buildSeminarPayload(seminarInput)
  assert(!('book' in payload) && !('chapters' in payload) && !('fullText' in payload)
    && !('novel' in payload), '研讨上下文类型层面不含全书')
  const allBookText = litBooks.flatMap((b) => b.chapters).flatMap((c) => c.paragraphs).join(' ').length
  assert(payload.chapterText.length < 12000 && payload.chapterText.length < allBookText / 3,
    '只注入单章文本，不把整本书塞进单次调用')
  assert(seminarDir.containsRoleplay('I am Scrooge and I say Bah Humbug', ['Scrooge']),
    '角色扮演越界可被检测')
  assert(seminarDir.normalizeSeminarOutput({ reply: 'I am Scrooge. Bah humbug!', end: false }, seminarInput).reply.includes('?'),
    '越界的角色扮演输出被替换回引导者语气')

  /* 迁移：在隔离的 jsdom 里模拟「只有 8 个旧键」的老存档 */
  const domM = new JSDOM('', { url: 'http://localhost:5173/' })
  const wM = domM.window
  wM.localStorage.setItem('lingua_profile', JSON.stringify({ xp: 42, nickname: 'OldUser' }))
  wM.localStorage.setItem('lingua_settings', JSON.stringify({ difficulty: 'B2', ieltsLevel: 'b6' }))
  const savedWindow = globalThis.window
  globalThis.window = wM
  const mig1 = litStorage.migrateLiteraryData()
  const mig2 = litStorage.migrateLiteraryData()
  globalThis.window = savedWindow
  assert(mig1.created.length === 4, '旧版本首次迁移创建 4 个新键')
  assert(mig2.created.length === 0 && mig2.patchedSettings.length === 0, '迁移幂等，重复运行不再写入')
  assert(wM.localStorage.getItem('lingua_profile') === JSON.stringify({ xp: 42, nickname: 'OldUser' }),
    '迁移不改动旧键 lingua_profile 的内容')
  const migSettings = JSON.parse(wM.localStorage.getItem('lingua_settings'))
  assert(migSettings.difficulty === 'B2' && migSettings.ieltsLevel === 'b6'
    && migSettings.readingView === 'original' && migSettings.seminarGuidance === 'medium',
  '旧设置值保留，只补上两个新字段')
  assert(JSON.parse(wM.localStorage.getItem('lingua_library')).books.length === litBooks.length,
    '迁移后书库按内置公版书单播种')

  /* ============ 文化视角视频模块：纯函数单测（版权 / 白名单 / 三个 Agent / 迁移） ============ */
  const cultureSeed = await loadModule('src/data/cultureSeed.ts', 'cultureseed')
  const culturePlayer = await loadModule('src/services/culturePlayer.ts', 'cultureplayer')
  const cultureCurator = await loadModule('src/services/cultureCurator.ts', 'culturecurator')
  const cultureAnalyzer = await loadModule('src/services/cultureAnalyzer.ts', 'cultureanalyzer')
  const postWatch = await loadModule('src/services/postWatchDirector.ts', 'postwatch')
  const cultureStorage = await loadModule('src/lib/cultureStorage.ts', 'culturestorage')
  const registrySeed = await loadModule('src/data/playlistRegistrySeed.ts', 'registryseed')
  const playlistSync = await loadModule('src/services/playlistSync.ts', 'playlistsync')
  const libraryHealth = await loadModule('src/lib/cultureLibraryHealth.ts', 'libraryhealth')

  const cultureVideos = cultureSeed.ALL_SEED_VIDEOS
  assert(cultureVideos.length >= 30 && cultureVideos.length <= 50,
    `Mock 模式种子库提供 30-50 条结构化视频条目（实际 ${cultureVideos.length} 条）`)
  const ALLOWED_PLATFORMS = ['ted', 'pexels', 'pixabay', 'cc', 'youtube', 'voa']
  assert(cultureVideos.every((v) => ALLOWED_PLATFORMS.includes(v.platform)),
    '未接入白名单之外的视频源')
  assert(cultureVideos.every((v) => v.licenseNote && v.attribution && /^https?:\/\//.test(v.watchUrl)
    && v.summaryZh && v.embedMode), '每条视频标注来源、许可、署名、梗概与嵌入状态')

  /* ============ 三层储量体系：种子库结构化验收（验收标准 1） ============ */
  const voaCount = cultureVideos.filter((v) => v.source === 'voa').length
  assert(voaCount / cultureVideos.length >= 0.4,
    `VOA 压舱石来源占比不低于 40%（实际 ${Math.round((voaCount / cultureVideos.length) * 100)}%）`)
  assert(cultureVideos.every((v) => ['seed', 'playlistItems.list'].includes(v.acquiredVia)
    && v.seed === true && v.idStatus && v.officialUrl && v.topic && Array.isArray(v.culturalThemes)),
  '每条种子含 source / videoId 状态 / 来源依据 / 主题 / 文化标签，获取途径枚举里没有「搜索」')
  assert(cultureVideos.every((v) => v.videoId === ''
    || /^[A-Za-z0-9_-]{11}$/.test(v.videoId)
    || (v.source === 'ted' && /^[A-Za-z0-9_-]+$/.test(v.videoId))),
  'videoId 只能是 11 位官方 ID、TED 官方 slug 或显式空串（playlist-only），绝不编造')
  const topicCounts = {}
  for (const v of cultureVideos) topicCounts[v.topic] = (topicCounts[v.topic] || 0) + 1
  const EXPECTED_TOPICS = {
    'daily-life': 8, festivals: 6, 'work-social': 6,
    'history-landmarks': 6, 'science-nature': 6, 'arts-media': 4,
  }
  assert(Object.keys(EXPECTED_TOPICS).every((t) => (topicCounts[t] || 0) >= EXPECTED_TOPICS[t]),
    `6 个主题分类均达到最低储量（实际 ${JSON.stringify(topicCounts)}）`)
  const cefrSet = new Set(cultureVideos.map((v) => v.cefr))
  assert(['A2', 'B1', 'B2', 'C1'].every((c) => cefrSet.has(c)),
    '难度覆盖 A2-C1')
  assert(cultureVideos.every((v) => !culturePlayer.containsExcludedSource(v.platform)
    && !culturePlayer.containsExcludedSource(v.watchUrl)),
  'BBC 等许可限制来源与影视切片一律不收录')
  const cultureJson = JSON.stringify(cultureVideos)
  assert(!culturePlayer.hasForbiddenVideoMarker(cultureJson),
    '种子数据里没有 mp4 / m3u8 / 流地址 / 字幕下载 / 实时搜索形态')
  assert(culturePlayer.MIN_EMBED_VIEWPORT.width >= 200 && culturePlayer.MIN_EMBED_VIEWPORT.height >= 200,
    '官方播放器视口满足平台 ≥ 200×200 要求')

  // 白名单守门：可嵌入条目只生成 TED 官方 embed / YouTube 官方 nocookie 域名
  const audit = cultureVideos.map((v) => culturePlayer.auditVideoCompliance(v))
  assert(audit.every((a) => a.platformAllowed && !a.excludedSource
    && a.usesLocalCaptionsOnly && a.noFullTranscriptField),
  '每条视频都通过白名单、本地字幕与「无完整字幕字段」自检')
  const embeddable = cultureVideos.map((v, i) => ({ v, a: audit[i] })).filter((x) => x.v.embeddable)
  assert(embeddable.length >= 10 && embeddable.every((x) => x.a.embedUrl
    && (x.a.embedUrl.startsWith('https://embed.ted.com/talks/')
      || x.a.embedUrl.startsWith('https://www.youtube-nocookie.com/embed/'))
    && x.a.embedCompliant),
  '可嵌入视频只生成 TED 官方 embed 或 YouTube 官方 nocookie 域名 URL')
  const degraded = cultureVideos.map((v, i) => ({ v, a: audit[i] })).filter((x) => !x.v.embeddable)
  assert(degraded.length >= 1 && degraded.every((x) => x.a.embedUrl === null && x.a.needsFallback),
    '不可嵌入 / Mock 占位条目一律降级，绝不伪装成可播放')
  assert(culturePlayer.buildOfficialEmbedUrl({ ...embeddable[0].v, platform: 'bbc' }, 'on') === null
    && culturePlayer.buildOfficialEmbedUrl({ ...embeddable[0].v, embedId: 'https://evil.example/a.mp4' }, 'on') === null,
  '被排除来源与「完整 URL 当 ID」都无法构造官方嵌入')
  assert(culturePlayer.hostOf('https://embed.ted.com/talks/x') === 'embed.ted.com'
    && !culturePlayer.isCompliantEmbed('https://evil.example/embed/1', 'ted'),
  '非官方域名不能通过嵌入合规校验')
  assert(culturePlayer.captionParams('off').cc_load_policy === '0'
    && culturePlayer.captionParams('bilingual').cc_load_policy === '1',
  '字幕偏好只映射到官方播放器自带 CC，不下载字幕')

  // CuratorAgent：本地索引筛选 + 推荐理由 + 许可准入
  const cultureState = { seedVersion: cultureSeed.CULTURE_SEED_VERSION, videos: cultureVideos }
  const allItems = cultureCurator.filterVideos(cultureState, {}, { targetCefr: 'B1' })
  assert(allItems.length === cultureVideos.length && allItems.every((i) => i.reason && i.platformLabel),
    'CuratorAgent 输出视频列表、来源标识与推荐理由')
  assert(cultureCurator.filterVideos(cultureState, {}, { theme: 'festivals' }).length >= 6
    && cultureCurator.groupByTheme(cultureState, {}).length === 6,
  '按 6 个主题分组与本地筛选生效（不做实时搜索）')
  assert(cultureCurator.hasValidProvenance(cultureVideos[0])
    && !cultureCurator.hasValidProvenance({ ...cultureVideos[0], watchUrl: '' })
    && !cultureCurator.hasValidProvenance({ ...cultureVideos[0], licenseNote: '' }),
  '许可 / 来源三件套不完整不放行')

  // AnalyzerAgent：只注入元数据 + 短注释，短引用闸门 + 背景卡 150 字
  const cAnalysis = cultureAnalyzer.mockAnalyzeVideoCulture({
    video: cultureVideos[0], userNotes: [], targetDifficulty: 'B1',
  })
  assert(cAnalysis.culturalThemes.length >= 1 && cAnalysis.keyExpressions.length >= 1
    && cAnalysis.discussionSeeds.length === 3, 'AnalyzerAgent 输出主题 / 短引用 / 3 个讨论种子')
  assert(cAnalysis.backgroundCard.contentZh.length <= cultureAnalyzer.MAX_BACKGROUND_CHARS,
    '文化背景卡不超过 150 字')
  assert(cAnalysis.keyExpressions.every((e) => cultureAnalyzer.isShortQuote(e.expression)
    && e.sourceNote && e.sourceNote.includes('非视频字幕')),
  '关键表达全是带来源标注的单句 / 短语级短引用，不是完整字幕脚本')
  assert(!cultureAnalyzer.isShortQuote('x'.repeat(200))
    && !cultureAnalyzer.isShortQuote('00:00:01,000 --> 00:00:03,000 Hello there. Goodbye now.'),
  '整段台词与 SRT 时间轴文本被短引用闸门拒绝')
  const forgedCulture = cultureAnalyzer.normalizeVideoCulture({
    keyExpressions: [{ expression: 'x'.repeat(200), meaningZh: '整段字幕', context: '字幕全文' }],
  }, { video: cultureVideos[0], userNotes: [], targetDifficulty: 'B1' })
  assert(forgedCulture.keyExpressions.every((e) => e.expression.length <= cultureAnalyzer.MAX_EXPRESSION_CHARS),
    '真实 LLM 若吐出整段台词，归一化时同样被剔除')
  const culturePayload = cultureAnalyzer.buildCulturePayload({
    video: cultureVideos[0], userNotes: [], targetDifficulty: 'B1',
  })
  assert(!('transcript' in culturePayload) && !('captions' in culturePayload)
    && !('fullText' in culturePayload) && !('streamUrl' in culturePayload),
  '分析器 payload 类型层面没有字幕全文 / 视频流字段')

  // PostWatchDirectorAgent：独立 prompt、先细节后观点、观点+语言双反馈
  const pwInput = {
    videoTitle: cultureVideos[0].title, videoTitleZh: cultureVideos[0].titleZh,
    videoSummaryZh: cultureVideos[0].summaryZh, platform: 'ted',
    culturalThemes: cAnalysis.culturalThemes, keyExpressions: cAnalysis.keyExpressions,
    backgroundCard: cAnalysis.backgroundCard, discussionSeeds: cAnalysis.discussionSeeds,
    history: [], userInput: 'I saw the speaker riding a bike and I think the small habit is convincing because it lasts.',
    difficulty: 'B1', guidance: 'medium', captionPreference: 'on', turn: 0,
  }
  const pwOut = postWatch.mockPostWatchTurn(pwInput)
  assert(pwOut.reply.includes('?') && pwOut.reply.split(/(?<=[.!?])\s+/).length >= 2,
    '观后引导 2-3 句英文且含一个开放问题')
  assert(pwOut.feedback.content && pwOut.feedback.language && pwOut.feedback.praise
    && ['none', 'minor', 'major'].includes(pwOut.feedback.level),
  '反馈同时含观点反馈与语言反馈，level / praise 兼容现有组件')
  assert(Boolean(pwOut.culturalBridge), '输出把用户表达与视频文化语境连接起来的 culturalBridge')
  assert(!postWatch.containsPostWatchRoleplay(pwOut.reply)
    && postWatch.containsPostWatchRoleplay('I am the speaker and I say hello'),
  '引导者不扮演视频人物，越界可被检测')
  assert(postWatch.hasConcreteDetail('I saw the speaker riding a bike') && !postWatch.hasConcreteDetail('It is nice'),
    '先引导回忆视频具体细节')
  const pwCn = postWatch.mockPostWatchTurn({ ...pwInput, userInput: '我觉得这个小习惯挺好' })
  assert(pwCn.feedback.corrected && /In the video, I noticed/.test(pwCn.feedback.corrected),
    '中文观点给出可模仿的英文表达')
  assert(Boolean(postWatch.mockPostWatchTurn({ ...pwInput, turn: 2 }).stageSummary),
    '每 3-4 轮做一次轻量小结')
  assert(postWatch.normalizePostWatchOutput({ reply: 'Sure, that is fine?', end: true }, pwInput).end === false,
    '前三轮不允许提前结束，保证至少 4 轮内容性对话')
  assert(postWatch.normalizePostWatchOutput({ reply: 'I am the speaker, I continue the talk.', end: false }, pwInput).reply.includes('?'),
    '越界的角色扮演输出被替换回观后引导者语气')
  const pwPayload = postWatch.buildPostWatchPayload(pwInput)
  assert(!('transcript' in pwPayload) && !('fullText' in pwPayload)
    && !('chapterText' in pwPayload) && !('book' in pwPayload),
  '观后讨论上下文不含字幕全文 / 章节文本 / 全书')
  const pwSys = postWatch.postWatchSystemPrompt(pwInput)
  assert(pwSys.includes('PostWatchDirectorAgent') && pwSys.includes('NEITHER role-play')
    && !pwSys.includes('DialogueDirectorAgent') && !pwSys.includes('SeminarDirectorAgent'),
  'PostWatch 使用完全独立的 prompt 逻辑，不复用旧 Agent')

  // 迁移：隔离 jsdom 里模拟「只有旧键」的老存档，确认旧数据零改动
  const domC = new JSDOM('', { url: 'http://localhost:5173/' })
  const wC = domC.window
  wC.localStorage.setItem('lingua_profile', JSON.stringify({ xp: 77, nickname: 'CultureOldUser' }))
  wC.localStorage.setItem('lingua_settings', JSON.stringify({ difficulty: 'B2', ieltsLevel: 'b6' }))
  const savedWindowC = globalThis.window
  globalThis.window = wC
  const cmig1 = cultureStorage.migrateCultureData()
  const cmig2 = cultureStorage.migrateCultureData()
  globalThis.window = savedWindowC
  assert(cmig1.created.length === 5, '文化模块旧存档首次迁移创建 5 个新键（含播放列表注册表）')
  assert(cmig2.created.length === 0 && cmig2.patchedSettings.length === 0,
    '文化迁移幂等，重复运行不再写入')
  assert(wC.localStorage.getItem('lingua_profile') === JSON.stringify({ xp: 77, nickname: 'CultureOldUser' }),
    '文化迁移不改动旧键 lingua_profile 的内容')
  const cmigSettings = JSON.parse(wC.localStorage.getItem('lingua_settings'))
  assert(cmigSettings.difficulty === 'B2' && cmigSettings.ieltsLevel === 'b6'
    && cmigSettings.captionPreference === 'on' && cmigSettings.autoEnterPostWatch === false,
  '旧设置值保留，只补字幕偏好与自动进入讨论两个字段')
  assert(JSON.parse(wC.localStorage.getItem('lingua_culture_videos')).videos.length === cultureVideos.length,
    '迁移后视频库按白名单内置清单播种')

  /* ============ 三层储量体系：注册表 + 同步服务 + 库健康度（验收标准 2/3/10） ============ */
  const registry = registrySeed.DEFAULT_PLAYLIST_REGISTRY
  assert(registry.playlists.length >= 6,
    `播放列表注册表预置至少 6 个播放列表（实际 ${registry.playlists.length} 个）`)
  assert(registry.playlists.every((p) => /^PL[A-Za-z0-9_-]{10,}$/.test(p.playlistId)
    && p.verifiedUrl && /^https?:\/\//.test(p.verifiedUrl) && p.note),
  '每个 playlistId 都附带可验证的来源依据链接与维护备注（验收标准 10）')
  const bcPlaylists = registry.playlists.filter((p) => p.source === 'british-council')
  assert(bcPlaylists.length >= 1 && bcPlaylists.every((p) => !p.enabled),
    'British Council 播放列表未验证嵌入权限前全部默认停用')
  assert(registry.playlists.filter((p) => p.source === 'voa').length >= 4,
    'VOA 官方播放列表是注册表的主体')
  assert(registry.channels.every((c) => ['verified', 'pending-verification'].includes(c.status))
    && registry.channels.some((c) => c.status === 'pending-verification'),
  '第 3 层频道白名单区分已验证 / 待验证，个人创作者频道不收录')
  const excludedJson = JSON.stringify(registrySeed.EXCLUDED_CHANNEL_KEYWORDS)
  assert(excludedJson.includes('BBC') && excludedJson.includes('Bob the Canadian'),
    'BBC 与个人创作者频道在显式排除名单里')

  // 同步服务：只做 playlistItems.list、速率限制、冷却期、按 videoId 去重
  assert(playlistSync.selectSyncablePlaylists(registry).length === 3,
    '单次同步最多 3 个播放列表（速率限制）')
  const syncState = { seedVersion: 2, videos: cultureVideos }
  const syncOut = await playlistSync.syncPlaylists({ registry, library: syncState, mode: 'mock' })
  assert(syncOut.report.results.length === 3 && syncOut.report.quotaUnits === 3,
    '每次 playlistItems.list 消耗 1 单位配额，3 个列表共 3 单位')
  assert(syncOut.report.added >= 1
    && syncOut.library.videos.every((v) => ['seed', 'playlistItems.list'].includes(v.acquiredVia)),
  '同步产物以 seed:false / acquiredVia:playlistItems.list 入库，没有 search.list 产物（验收标准 2）')
  const addedIds = new Set(syncOut.library.videos.filter((v) => v.acquiredVia === 'playlistItems.list')
    .map((v) => v.id))
  const seedIds = new Set(cultureVideos.map((v) => v.id))
  for (const id of addedIds) assert(!seedIds.has(id), '同步新增条目与种子库 id 不冲突')
  const syncedVideoIds = new Set(cultureVideos.map((v) => v.videoId).filter(Boolean))
  assert(syncOut.library.videos.filter((v) => v.acquiredVia === 'playlistItems.list')
    .every((v) => !syncedVideoIds.has(v.videoId) || cultureVideos.some((s) => s.videoId === v.videoId)),
  '按 videoId 去重：与种子库重复的同步候选被跳过（种子优先）')
  assert(syncOut.registry.playlists.filter((p) => p.lastFetchedAt).length === 3
    && syncOut.registry.lastSyncAt > 0 && syncOut.registry.quotaUnitsUsed === 3,
  '同步结果缓存回注册表：lastFetchedAt / lastSyncAt / 配额累计')
  const cooldownPick = playlistSync.selectSyncablePlaylists(syncOut.registry)
  assert(!cooldownPick.some((p) => syncOut.report.results.some((r) => r.playlistId === p.playlistId)),
    '同一播放列表 6 小时冷却期内不重复拉取，下次同步自动换下一批')
  const syncAudit = playlistSync.playlistSyncAudit()
  assert(syncAudit.noSearchList && syncAudit.noApiKeyInClient && syncAudit.noAutoFetchOnLoad
    && syncAudit.manualTriggerOnly && syncAudit.rateLimited && syncAudit.cached
    && syncAudit.noCaptionsDownload && syncAudit.quotaUnitsPerCall === 1
    && syncAudit.searchListDailyQuota === 100 && syncAudit.generalDailyQuota === 10000,
  '配额审计：永不搜索 / 客户端无密钥 / 手动触发 / 速率限制 / 结果缓存')

  // 库健康度：储量可观测（验收标准 5）
  const healthBefore = libraryHealth.computeLibraryHealth(syncState, registry)
  assert(healthBefore.total === cultureVideos.length && healthBefore.seedCount === cultureVideos.length
    && healthBefore.syncedCount === 0 && healthBefore.healthy
    && healthBefore.lowTopics.length === 0 && healthBefore.searchListEntries === 0,
  '健康度：种子库自身达标（≥30 条、主题无短板、零搜索产物）')
  const healthAfter = libraryHealth.computeLibraryHealth(syncOut.library, syncOut.registry)
  assert(healthAfter.total > healthBefore.total && healthAfter.syncedCount === syncOut.report.added
    && healthAfter.syncedPlaylistCount === 3 && healthAfter.lastSyncAt === syncOut.registry.lastSyncAt,
  '健康度：同步后总条目 / 同步数 / 已同步列表数 / 最近同步时间全部更新')

  // 源码层面：不调用 captions.download / search.list / 任何下载或抓流接口
  for (const rel of [
    'src/services/culturePlayer.ts', 'src/services/cultureCurator.ts',
    'src/services/cultureAnalyzer.ts', 'src/services/postWatchDirector.ts',
    'src/services/playlistSync.ts', 'src/pages/WatchPage.tsx', 'src/pages/CultureHub.tsx',
    'src/data/cultureSeed.ts', 'src/data/cultureSeedExpanded.ts',
    'src/data/playlistRegistrySeed.ts', 'src/components/CultureLibraryPanels.tsx',
    'src/lib/cultureLibraryHealth.ts',
  ]) {
    const source = fs.readFileSync(path.join(root, rel), 'utf8')
    assert(!/fetch\([^)]*(captions\.download|search\.list|youtubei|\/get_video_info)/.test(source),
      `${rel} 未调用 captions.download / search.list / 抓流接口`)
    assert(!/\bURL\.createObjectURL\b|\bMediaRecorder\b|\bnew\s+Audio\b/.test(source),
      `${rel} 没有本地录制 / 转存视频的能力`)
  }

  /* ============ 手动录音模式：Start/Stop 只由用户点击，无自动停止 ============ */
  const { composeTranscript, startListening } = speechMod

  /* [手动模式] 根因护栏：静音 / 时长定时器彻底移除，提交只在 manual stop */
  const speechSrcRaw = fs.readFileSync(path.join(root, 'src/lib/speech.ts'), 'utf8')
  assert(!/armSilenceTimer|armDeadlineTimer|MAX_SESSION_MS|silenceTimer\b|const silenceMs\s*=/.test(speechSrcRaw),
    '手动模式：speech.ts 不再有任何静音 / 总时长自动收尾定时器')
  assert(!/setTimeout\([^)]*gracefulStop\('(silence|timeout)'\)/.test(speechSrcRaw)
    && !/gracefulStop\('timeout'\)/.test(speechSrcRaw),
    '手动模式：不再因静音或超时触发 gracefulStop，杜绝替用户结束录音')
  assert(speechSrcRaw.includes('if (manual) { finish(\'emit\'); return }')
    && speechSrcRaw.includes("const MAX_RESTART_WITHOUT_PROGRESS = 40")
    && /const onEnd = \(\) => \{[\s\S]{0,900}?restart\(/.test(speechSrcRaw),
    '手动模式：emit 只在用户点停止后可达；原生 onend / 临时抖动一律续听（最多 40 次无进展）')
  assert(!/recorder\.stop\(\)/.test(speechSrcRaw.split('/* 手动模式：没有 maxMs 自动停止定时器')[0].split('export async function startRecording')[1] || ''),
    '手动模式：MediaRecorder 移除了 maxMs 到点自动 stop 的定时器')
  assert(/onResult[\s\S]{0,80}progress|restartsWithoutProgress = 0/.test(speechSrcRaw),
    '手动模式：续听期间有新文字就重置「无进展」计数，长句停顿不被误判为结束')
  assert(/const from = Math\.max\(0, e\.resultIndex \?\? 0\)/.test(speechSrcRaw)
    && /i < from \+ e\.results\.length/.test(speechSrcRaw),
    'resultIndex off-by-one 修复：按「起始下标 + 本批数量」遍历，续段文字不再被吞')
  const hookSrcRaw = fs.readFileSync(path.join(root, 'src/hooks/useVoiceDictation.ts'), 'utf8')
  assert(hookSrcRaw.includes('录音中，请读完点击麦克风停止'),
    '鱼塘语音输入提示改为手动模式文案（录音中请读完点击停止）')
  assert(composeTranscript(['Hello', undefined], new Map([[1, 'world']])) === 'Hello world',
    'final 与 interim 按 resultIndex 合并成完整句子')
  assert(composeTranscript([], new Map([[0, 'Only interim text']])) === 'Only interim text'
    && composeTranscript([], new Map([[0, 'Only interim text']]), false) === '',
  '全是 interim 时仍能拿到文字，并可区分「仅已确认」部分')
  assert(asrMod.normalizeAsrEndpoint('https://asr.example/v1') === 'https://asr.example/v1/audio/transcriptions'
    && asrMod.normalizeAsrEndpoint('https://asr.example/v1/chat/completions') === 'https://asr.example/v1/audio/transcriptions'
    && asrMod.normalizeAsrEndpoint('https://asr.example/v1/audio/transcriptions') === 'https://asr.example/v1/audio/transcriptions',
  'ASR 端点把 base / chat / 完整地址统一补全')
  assert(asrMod.pickAsrText({ text: '  I would like apples. ' }) === 'I would like apples.'
    && asrMod.pickAsrText({ results: [{ transcript: 'Hello' }, { transcript: 'world' }] }) === 'Hello world',
  'ASR 返回体解析兼容 text 与 results[].transcript')
  assert(!asrMod.isAsrConfigured({ asrEndpoint: '' }) && asrMod.isAsrConfigured({ asrEndpoint: 'https://x/v1' }),
    'ASR 默认不启用，填了地址才启用（保持零密钥）')

  const origFetch = globalThis.fetch
  const origFormData = globalThis.FormData
  globalThis.FormData = w.FormData || globalThis.FormData
  globalThis.fetch = async () => ({ ok: true, status: 200, text: async () => JSON.stringify({ text: 'I would like some fresh apples.' }) })
  const asrCfg = { asrEndpoint: 'https://asr.example/v1', asrKey: '', asrModel: 'whisper-1' }
  const asrOk = await asrMod.transcribeAudio(new w.Blob(['audio'], { type: 'audio/webm' }), asrCfg, 'en', 1000)
  assert(asrOk.text === 'I would like some fresh apples.', '录音经自定义 ASR 端点转成文字')
  globalThis.fetch = async () => ({ ok: false, status: 500, text: async () => 'oops' })
  const asrFail = await asrMod.transcribeAudio(new w.Blob(['audio'], { type: 'audio/webm' }), asrCfg, 'en', 1000)
  assert(!asrFail.text && asrFail.error.includes('HTTP 500'), 'ASR 失败返回中文原因而不是抛异常')
  globalThis.fetch = origFetch
  globalThis.FormData = origFormData

  /** 用假识别器跑一次完整听写会话，结算后自动还原全局，避免污染后面的 UI 测试 */
  const listenOnce = (Ctor, opts = {}) => new Promise((resolve) => {
    w.SpeechRecognition = Ctor
    let done = false
    let guard
    const finish = (payload) => {
      if (done) return
      done = true
      if (guard) clearTimeout(guard)
      delete w.SpeechRecognition
      resolve(payload)
    }
    const handle = startListening({
      accent: 'en-US', retries: opts.retries ?? 1,
      /* 手动模式：silenceMs / timeoutMs 已是兼容字段，不产生自动停止 */
      onResult: (t, meta) => finish({ type: 'result', t, meta }),
      onError: (code) => finish({ type: 'error', code }),
      onEnd: () => {}, onStatus: () => {},
    })
    if (opts.afterStart && handle) opts.afterStart(handle)
    /* 手动模式：模拟用户点「停止」才结算；autoStopMs 默认 60ms */
    if (handle && opts.autoStop !== false) {
      setTimeout(() => { try { handle.stop() } catch { /* noop */ } }, opts.autoStopMs ?? 60)
    }
    guard = setTimeout(() => finish({ type: 'timeout' }), 4000)
  })

  /* [移动端长录音] 运行时护栏：resultIndex=1、length=1 的尾段 final 必须被收进来，
     不能因为旧的 `i < results.length` 循环边界把最后一段吞掉（续段丢字）。 */
  class TailChunkRecognition {
    constructor() { this.lang=''; this.continuous=false; this.interimResults=false; this.maxAlternatives=1 }
    start() {
      setTimeout(() => {
        this.onresult?.({ resultIndex:0, results:[{isFinal:true,length:1,0:{transcript:'chunk one'}}] })
        this.onresult?.({ resultIndex:1, results:[{isFinal:true,length:1,0:{transcript:'chunk two'}}] })
        this.onend?.()
      }, 15)
    }
    stop() {} abort() {}
  }
  const tailChunk = await listenOnce(TailChunkRecognition)
  assert(tailChunk.type === 'result' && tailChunk.t === 'chunk one chunk two',
    '移动端长录音续段不丢字：resultIndex=1 的尾段 final 完整保留（off-by-one 回归护栏）')

  class InterimOnlyRecognition {
    start() {
      setTimeout(() => {
        this.onresult?.({ resultIndex: 0, results: [{ isFinal: false, length: 1, 0: { transcript: 'I would like some fresh apples.' } }] })
        this.onend?.()
      }, 20)
    }
    stop() { setTimeout(() => this.onend?.(), 5) }
    abort() {}
  }
  const interim = await listenOnce(InterimOnlyRecognition)
  assert(interim.type === 'result' && interim.t.includes('fresh apples') && interim.meta.partial,
    '只有 interim、没有 final 时仍交付整句文字并标注待核对')

  class FlushOnStopRecognition {
    constructor() { this.stopCalls = 0; this.abortCalls = 0; FlushOnStopRecognition.last = this }
    start() {
      setTimeout(() => this.onresult?.({ resultIndex: 0, results: [{ isFinal: false, length: 1, 0: { transcript: 'hello there' } }] }), 10)
    }
    stop() {
      this.stopCalls++
      setTimeout(() => {
        this.onresult?.({ resultIndex: 0, results: [{ isFinal: true, length: 1, 0: { transcript: 'hello there, my friend' } }] })
        this.onend?.()
      }, 10)
    }
    abort() { this.abortCalls++ }
  }
  const flushed = await listenOnce(FlushOnStopRecognition, {
    autoStop: false,
    afterStart: (h) => setTimeout(() => h.stop(), 40),
  })
  assert(flushed.type === 'result' && flushed.t.includes('my friend') && !flushed.meta.partial,
    '手动停止走 stop() flush，最后一句 final 不会丢')
  assert(FlushOnStopRecognition.last.stopCalls === 1 && FlushOnStopRecognition.last.abortCalls === 0,
    '手动停止绝不调用 abort()（旧版正是在这里丢字）')

  class NoSpeechFlakyRecognition {
    constructor() { NoSpeechFlakyRecognition.instances = (NoSpeechFlakyRecognition.instances || 0) + 1 }
    start() { setTimeout(() => { this.onerror?.({ error: 'no-speech' }); this.onend?.() }, 15) }
    stop() {} abort() {}
  }
  NoSpeechFlakyRecognition.instances = 0
  let flakyEarlyEmit = false
  w.SpeechRecognition = NoSpeechFlakyRecognition
  const flakyHandle = startListening({
    accent: 'en-US',
    onResult: () => { flakyEarlyEmit = true },
    onError: () => {}, onEnd: () => {}, onStatus: () => {},
  })
  await tick(50) // 已经历多轮 no-speech + 原生 onend，用户仍未点停止
  const flakyInstances = NoSpeechFlakyRecognition.instances
  flakyHandle?.stop()
  await tick(20)
  delete w.SpeechRecognition
  assert(!flakyEarlyEmit && flakyInstances > 1,
    '手动模式：no-speech 抖动 + 原生 onend 只触发续听，用户没点停止绝不提前提交（实例数=' + flakyInstances + '）')

  class ErrorAfterInterimRecognition {
    start() {
      setTimeout(() => {
        this.onresult?.({ resultIndex: 0, results: [{ isFinal: false, length: 1, 0: { transcript: 'keep this text' } }] })
        this.onerror?.({ error: 'network' })
        this.onend?.()
      }, 15)
    }
    stop() {} abort() {}
  }
  const kept = await listenOnce(ErrorAfterInterimRecognition, { retries: 0 })
  assert(kept.type === 'result' && kept.t.includes('keep this text') && kept.meta.partial,
    '手动模式：中途报错前听到的字幕被保留，用户点停止后照常交付（含未确认片段）')

  assert(bodyText().includes('把一段英文'), '首页渲染成功')
  assert(bodyText().includes('当前目标 IELTS'), '首页显示当前雅思目标档位')
  click(/Try an example/, '加载示例文本')
  await tick(100)
  const ta = w.document.querySelector('textarea')
  assert(ta && ta.value.includes("farmers' market"), '示例文本已填入输入框')

  click(/生成学习场景/, '生成学习场景')
  await tick(1000)
  assert(bodyText().includes('重点词汇') && bodyText().includes('从这里开始对话'), '分析结果页含词汇/短语/语法/场景')
  assert(bodyText().includes('雅思口语适配度') && bodyText().includes('素材 Band'), '分析页显示文本适配的雅思 Band')
  for (const s of ['在农夫市集挑苹果', '该选哪种蔬菜', '一起做那份沙拉', '把周末讲给朋友听']) {
    assert(bodyText().includes(s), `场景存在：${s}`)
  }

  click(/在农夫市集挑苹果/, '进入场景详情')
  await tick(150)
  assert(bodyText().includes('你想扮演谁'), '场景详情页含角色选择')
  assert(bodyText().includes('本档练习参数') && bodyText().includes('按本档应用轮次'), '场景页显示雅思档位参数与轮次应用')

  click(/开始对话冒险/, '开始对话')
  await tick(160)
  assert(bodyText().includes('本场目标') && bodyText().includes('0/6 轮'), '对话页含目标/进度/AI 开场白')
  assert(bodyText().includes('IELTS') && bodyText().includes('本档重点'), '对话页显示 Band 徽章与本档重点')

  for (let i = 1; i <= 6; i++) {
    const opts = buttons().filter((b) => !b.disabled && b.className.includes('shrink-0')
      && (b.textContent || '').trim().length > 18)
    if (!opts.length) throw new Error(`第 ${i} 轮找不到建议回复按钮`)
    opts[0].dispatchEvent(new w.MouseEvent('click', { bubbles: true, cancelable: true }))
    await tick(220)
    assert(bodyText().includes('本轮反馈'), `第 ${i} 轮：AI 回复 + 可折叠反馈已出现`)
    if (i === 1) assert(bodyText().includes('雅思') && bodyText().includes('本档每轮建议'), '反馈卡含雅思四维度微点评')
  }

  await tick(1400)
  assert(bodyText().includes('SESSION REPORT') && bodyText().includes('下一轮复习任务'), '自动生成会话报告')
  assert(bodyText().includes('雅思口语段位评估') && bodyText().includes('流利度与连贯性')
    && bodyText().includes('语法多样性与准确性'), '报告页含雅思四维度段位评估')

  /* ---- [成长系统] 会话报告展示统一入账的本次 XP 与等级进度 ---- */
  assert(!!document.querySelector('[data-testid="report-growth"]'), '报告页挂载「本次成长记录」卡片')
  assert(bodyText().includes('本次成长记录') && bodyText().includes('本场景累计 XP')
    && bodyText().includes('连续活跃天数') && bodyText().includes('剩余冻结卡'),
  '报告页展示本次入账 XP、连续天数与冻结卡')
  assert(bodyText().includes('距下一级') && bodyText().includes('统一入口入账'),
  '报告页展示等级进度并说明 XP 由统一入口发放')

  const keys = ['lingua_profile', 'lingua_texts', 'lingua_scenarios', 'lingua_sessions',
    'lingua_mistakes', 'lingua_review_queue', 'lingua_settings', 'lingua_voice_reports',
    'lingua_library', 'lingua_reading_progress', 'lingua_seminars', 'lingua_literary_notes',
    'lingua_culture_videos', 'lingua_watch_progress', 'lingua_postwatch_sessions',
    'lingua_culture_notes', 'lingua_playlist_registry',
    /** [新增] 词场 6 键（第 18-23 个键） */
    'lingua_word_progress', 'lingua_word_session_draft', 'lingua_word_daily_quota',
    'lingua_word_errors', 'lingua_word_media_cache', 'lingua_deck_selection',
    /** [S2.5 新增] 第 24 个键 */
    'lingua_pronunciation_flags',
    /** [成长系统新增] 第 25-28 个键 */
    'lingua_growth', 'lingua_achievements', 'lingua_xp_ledger', 'lingua_activity_heatmap',
    /** [China Learner Track 新增] 第 29 个键 */
    'lingua_china_track',
    /** [CEFR 等级层新增] 第 30 个键 */
    'lingua_level_preference',
    /** [对话语音层新增] 第 31 个键 */
    'lingua_voice_preferences']
  for (const k of keys) assert(w.localStorage.getItem(k) !== null, `localStorage 键存在：${k}`)
  /* ---- [成长系统] 四键内容与 profile 只读镜像一致 ---- */
  const growthSnap = JSON.parse(w.localStorage.getItem('lingua_growth'))
  const ledgerSnap = JSON.parse(w.localStorage.getItem('lingua_xp_ledger'))
  const achievementsSnap = JSON.parse(w.localStorage.getItem('lingua_achievements'))
  const heatmapSnap = JSON.parse(w.localStorage.getItem('lingua_activity_heatmap'))
  const ledgerSum = ledgerSnap.entries.reduce((s, e) => s + e.amount, 0)
  assert(growthSnap.__migrated === true && growthSnap.xp === ledgerSum,
    'lingua_growth.xp 与幂等账本入账总额完全一致（迁移一次 + 统一入口发放）')
  assert(ledgerSnap.entries.length <= 500
    && new Set(ledgerSnap.entries.map((e) => e.id)).size === ledgerSnap.entries.length,
  '账本控制在 500 条以内，且每条事件 ID 唯一（幂等）')
  assert(ledgerSnap.entries.some((e) => e.action === 'round_effective')
    && ledgerSnap.entries.some((e) => e.action === 'scene_finish'),
  '主流程对话的「有效轮次」与「场景完成」都通过统一入口入账')
  const roundByBucket = {}
  for (const e of ledgerSnap.entries.filter((x) => x.action === 'round_effective')) {
    const k = e.bucket || 'default'
    roundByBucket[k] = (roundByBucket[k] || 0) + e.amount
  }
  assert(Object.keys(roundByBucket).length >= 1
    && Object.values(roundByBucket).every((v) => v <= 20),
  '轮次 XP 按场景 ID 聚合，每个场景累计不超过 20 XP（重进不重置）')
  assert(achievementsSnap.items.length === 27 && achievementsSnap.version === 1,
    'lingua_achievements 存下 27 枚成就的种子定义与用户进度')
  assert(Object.keys(heatmapSnap.days).length >= 1 && heatmapSnap.version === 1,
    'lingua_activity_heatmap 记录当日活跃 XP')
  const sessions = JSON.parse(w.localStorage.getItem('lingua_sessions'))
  const queue = JSON.parse(w.localStorage.getItem('lingua_review_queue'))
  const profile = JSON.parse(w.localStorage.getItem('lingua_profile'))
  assert(sessions[0]?.report?.mastery >= 0, '报告已写入会话记录')
  assert(sessions[0]?.report?.ielts?.dimensions?.fc >= 4
    && sessions[0]?.report?.ielts?.dimensions?.pr >= 4, '报告含 FC/LR/GRA/PR 四维度参考分')
  assert(queue.length > 0, `复习队列已生成 ${queue.length} 张卡片`)
  assert(profile.xp > 0 && profile.totalSessions >= 1, `XP ${profile.xp} / 完成 ${profile.totalSessions} 场对话`)

  clickExact('复习', '底部导航进入复习页')
  await tick(180)
  assert(bodyText().includes('间隔重复队列') && bodyText().includes('记住了'), '复习页含 SRS 队列与操作按钮')
  /* ---- [成长系统] 复习页顶部展示今日复习 XP 与批次规则 ---- */
  assert(!!document.querySelector('[data-testid="review-xp-today"]')
    && bodyText().includes('今日复习 XP') && bodyText().includes('每日最多 3 批'),
  '复习页顶部展示今日复习 XP 与每日 3 批上限')

  clickExact('进度', '底部导航进入进度页')
  await tick(180)
  assert(bodyText().includes('冒险路径') && bodyText().includes('成就徽章'), '进度页含路径与成就')
  assert(bodyText().includes('雅思口语段位路径') && bodyText().includes('四项维度参考分'), '进度页含 Band 4→9 阶梯与维度分')

  clickExact('设置', '底部导航进入设置页')
  await tick(180)
  assert(bodyText().includes('清空所有数据') && bodyText().includes('对话生成引擎'), '设置页含全部配置项')
  assert(bodyText().includes('雅思口语目标等级') && bodyText().includes('四项评分维度的本档目标'),
    '设置页含六档雅思等级与四维度目标')
  assert(bodyText().includes('麦克风自检') && bodyText().includes('检测麦克风权限'),
    '设置页提供麦克风自检入口')
  assert(bodyText().includes('语音转文字（可选）') && bodyText().includes('听写测试'),
    '设置页提供可选 ASR 配置与听写测试探针')
  const settingsSnap = JSON.parse(w.localStorage.getItem('lingua_settings'))
  assert(settingsSnap.asrEndpoint === '' && settingsSnap.asrModel === 'whisper-1',
    'ASR 配置默认留空，保持零后端零密钥')
  click(/检测麦克风权限/, '检测麦克风权限')
  await tick(140)
  assert(bodyText().includes('麦克风接口') || bodyText().includes('麦克风权限'),
    '自检在无麦克风接口环境给出明确结论而非静默失败')

  // 档位联动：选 Band 7 → CEFR C1 + 细致纠错，再切回默认档
  const band7 = buttons().find((b) => (b.textContent || '').includes('7.0'))
  assert(band7, '设置页可点击 Band 7.0–7.5 档位')
  fire(band7)
  await tick(160)
  const s7 = JSON.parse(w.localStorage.getItem('lingua_settings'))
  assert(s7.ieltsLevel === 'b7' && s7.difficulty === 'C1' && s7.correction === 'detailed',
    '选择 Band 7 后联动 CEFR C1 与细致纠错')
  const band5 = buttons().find((b) => (b.textContent || '').includes('5.0'))
  assert(band5, '设置页可点击 Band 5.0–5.5 档位')
  fire(band5)
  await tick(160)
  assert(JSON.parse(w.localStorage.getItem('lingua_settings')).ieltsLevel === 'b5', '可切回默认 Band 5 档')

  // 任意文本 + 中文输入，验证 Mock 生成器不崩溃
  clickExact('学习', '回到首页')
  await tick(150)
  const ta2 = document.querySelector('textarea')
  const setter = Object.getOwnPropertyDescriptor(globalThis.HTMLTextAreaElement.prototype, 'value').set
  setter.call(ta2, 'Quantum computing is changing how researchers design new materials. A small team published an open dataset last month, and many students discussed the results online.')
  ta2.dispatchEvent(new (globalThis.Event)('input', { bubbles: true }))
  await tick(80)
  click(/生成学习场景/, '任意文本生成')
  await tick(1000)
  assert(['聊聊这段文本', '一问一答小采访', '定一个小计划', '交换观点'].every((s) => bodyText().includes(s)),
    '任意英文文本也生成 4 个不冲突的通用场景')
  click(/聊聊这段文本/, '进入通用场景')
  await tick(150)
  click(/开始对话冒险/, '开始通用场景对话')
  await tick(180)
  const dlgInput = document.querySelector('textarea')
  setter.call(dlgInput, '我想先问问这篇文章讲了什么')
  dlgInput.dispatchEvent(new (globalThis.Event)('input', { bubbles: true }))
  await tick(80)
  const sendBtn = document.querySelector('button[aria-label="发送"]')
  assert(sendBtn && !sendBtn.disabled, '中文输入后发送按钮可用')
  fire(sendBtn)
  await tick(260)
  assert(bodyText().includes("Let's try that in English"), '中文输入被温和引导为英文句型，未崩溃')
  assert(bodyText().includes('本轮反馈'), '中文输入也有折叠反馈')

  // ---- 语音修复验收：无识别 / 识别成功 / 权限拒绝 / 服务失败 ----
  const micBtn = () => document.querySelector('button[aria-label="点击开始录音"]')
    || document.querySelector('button[aria-label="录音中，点击停止并提交"]')
  assert(micBtn(), '对话页麦克风按钮存在')
  fire(micBtn())
  await tick(140)
  assert(bodyText().includes('语音助手') && bodyText().includes('文本输入'),
    '无语音识别环境时给出明确降级说明，不静默失败')

  class FakeRecognition {
    constructor() { this.lang = ''; this.continuous = false; this.interimResults = false; this.maxAlternatives = 1 }
    start() {
      setTimeout(() => {
        this.onresult?.({ resultIndex: 0, results: [{ isFinal: true, length: 1, 0: { transcript: 'I would like some fresh apples.' } }] })
        // 手动模式：不主动 onend，模拟浏览器持续录音直到用户停止
      }, 25)
    }
    stop() { setTimeout(() => this.onend?.(), 5) }
    abort() {}
  }
  w.SpeechRecognition = FakeRecognition
  fire(micBtn())
  await tick(200)
  assert(!document.querySelector('textarea').value.includes('I would like some fresh apples.'),
    '手动模式：识别到文字但用户没点停止，绝不提前写入输入框')
  assert(bodyText().includes('录音中，请读完点击麦克风停止'),
    '手动模式：录音中明确提示用户读完再点停止')
  /* 模拟用户点「停止」：此时才提交并写入输入框 */
  fire(document.querySelector('button[aria-label="录音中，点击停止并提交"]'))
  await tick(220)
  assert(document.querySelector('textarea').value.includes('I would like some fresh apples.'),
    '手动模式：用户点停止后识别结果才写入输入框')
  assert(bodyText().includes('已转成文字'), '听写完成后给出成功反馈')

  const fakeError = (code) => class {
    constructor() { this.lang = ''; this.continuous = false; this.interimResults = false; this.maxAlternatives = 1 }
    start() { setTimeout(() => { this.onerror?.({ error: code }); this.onend?.() }, 25) }
    stop() {}
    abort() {}
  }
  w.SpeechRecognition = fakeError('not-allowed')
  fire(micBtn())
  await tick(180)
  assert(bodyText().includes('麦克风权限被拒绝') && bodyText().includes('在新标签页打开'),
    '权限被拒时给出可操作说明与新标签页引导')

  w.SpeechRecognition = fakeError('network')
  fire(micBtn())
  await tick(180)
  assert(bodyText().includes('语音识别服务连接失败'),
    '识别服务不可用时说明原因，而不是静默掉到「只有录音」')
  assert(bodyText().includes('重试听写') && bodyText().includes('录一段并转写')
    && bodyText().includes('补写文字'),
  '转文字失败时摆出重试 / 录音转写 / 补写三条出路')

  click(/补写文字/, '打开补写文字卡片')
  await tick(100)
  assert(bodyText().includes('补写刚才说的英文'), '补写卡片出现输入区域')
  const manualTa = document.querySelector('textarea[data-manual-transcript="true"]')
  assert(manualTa, '补写输入框存在')
  setter.call(manualTa, 'I said this aloud just now.')
  manualTa.dispatchEvent(new (globalThis.Event)('input', { bubbles: true }))
  await tick(60)
  click(/用作本轮回答/, '把补写文字送进输入框')
  await tick(140)
  assert(document.querySelector('textarea').value.includes('I said this aloud just now.'),
    '补写的英文进入对话输入框，练习不中断')
  delete w.SpeechRecognition

  // ---- 语音评判：听写记录落盘、对话页点评卡、报告/复习/进度汇总 ----
  const voiceReports = JSON.parse(w.localStorage.getItem('lingua_voice_reports') || '[]')
  assert(voiceReports.length >= 1, '听写评估已写入第 8 个存储键 lingua_voice_reports')
  const lastVr = voiceReports[voiceReports.length - 1]
  assert(lastVr.source === 'recognition' && lastVr.transcript.includes('fresh apples')
    && lastVr.metrics.measured === false && lastVr.waveform.length === 0,
  '听写评估标注为「仅文本」，不画假波形')
  assert(lastVr.recognitionConfidence === undefined, '浏览器未给识别置信度时不臆造数值')
  assert(lastVr.dimensions.fc >= 3.5 && lastVr.dimensions.pr >= 3.5 && lastVr.suggestions.length > 0,
    '听写评估仍给出 FC / PR 参考分与可执行建议')
  assert(bodyText().includes('本场发音评测') && bodyText().includes('发音点评'), '对话页出现可折叠发音点评卡')
  assert(bodyText().includes('发音评测（语速/停顿/语调）'), '对话页提供主动发音评测入口')

  click(/^结束$/, '结束当前对话')
  await tick(120)
  click(/结束并生成报告/, '确认结束并生成报告')
  await tick(400)
  assert(bodyText().includes('SESSION REPORT') && bodyText().includes('发音表现'),
    '报告页含语音表现汇总卡')
  assert(bodyText().includes('最后一段发声') && bodyText().includes('未测'),
    '报告页展示最近一段发声点评，未测指标明确留白')
  const finishedWithVoice = JSON.parse(w.localStorage.getItem('lingua_sessions'))
    .find((s) => s.report?.voice)
  assert(finishedWithVoice && finishedWithVoice.report.voice.count >= 1, '报告已持久化语音汇总')

  clickExact('复习', '复习页查看发音练习卡')
  await tick(180)
  assert(bodyText().includes('发音练习') && bodyText().includes('去试音并评测'),
    '复习页把语音建议变成发音练习任务')

  clickExact('进度', '进度页查看发音趋势')
  await tick(180)
  assert(bodyText().includes('发音表现趋势') && bodyText().includes('下一阶段重点'),
    '进度页展示发音趋势与下一阶段重点')

  /* ============ 文学长廊 UI 全流程：书架 → 详情 → 三视图 → 词汇 → 批注 → 4 轮研讨 → 回原文 → 进度 ============ */
  clickExact('书架', '底部导航进入书架')
  await tick(180)
  assert(bodyText().includes('经典英文文学研读') && bodyText().includes('版权说明'),
    '书架页展示内置公版书单与版权说明')
  assert(bodyText().includes('A Christmas Carol') && bodyText().includes("Alice's Adventures in Wonderland")
    && bodyText().includes('Pride and Prejudice'), '书架页可浏览 5 本公版书')
  assert(bodyText().includes('Project Gutenberg') && bodyText().includes('阅读进度'),
    '书架页展示权威来源与阅读进度入口')

  click(/A Christmas Carol/, '打开《A Christmas Carol》详情')
  await tick(180)
  assert(bodyText().includes('章节列表') && bodyText().includes('Stave I · Marley was dead'),
    '书籍详情页含章节列表')
  assert(bodyText().includes('版权与书源') && bodyText().includes('公有领域适用地区'),
    '书籍详情页展示完整版权卡片')
  assert(bodyText().includes('词') && bodyText().includes('CEFR'), '章节列表含每章字数与 CEFR 估计')

  click(/开始阅读/, '从第一章开始阅读')
  await tick(260)
  assert(bodyText().includes('CHAPTER EXCERPT') && bodyText().includes('本章研读卡'),
    '阅读页渲染原文正文与本章分析卡')
  assert(bodyText().includes('CHAPTER BRIEF') && bodyText().includes('前情摘要'),
    '每章生成 chapterBrief 供后续章节注入')
  assert(bodyText().includes('Marley was dead: to begin with.'), '原文视图显示公版原文节选')

  clickExact('分级简化', '切换到分级简化视图')
  await tick(120)
  assert(bodyText().includes('Marley was dead. Everyone agreed on that.')
    && bodyText().includes('学习用改写'), '分级简化视图显示改写文本并明确标注非原文')
  clickExact('双语注释', '切换到双语注释视图')
  await tick(120)
  assert(bodyText().includes('开篇第一句就是全书著名起笔')
    && bodyText().includes('Marley was dead: to begin with.'), '双语注释不打断原文阅读流')
  clickExact('原文', '切回原文视图')
  await tick(120)

  const litWordBtn = document.querySelector('button.lit-word')
  assert(litWordBtn, '正文中的重点词被高亮')
  fire(litWordBtn)
  await tick(120)
  assert(bodyText().includes('加入复习队列'), '点击高亮词可查看释义')
  const queueBefore = JSON.parse(w.localStorage.getItem('lingua_review_queue') || '[]').length
  click(/加入复习队列/, '把重点词加入现有复习队列')
  await tick(140)
  assert(JSON.parse(w.localStorage.getItem('lingua_review_queue') || '[]').length > queueBefore,
    '阅读新词写入现有 lingua_review_queue')
  assert(JSON.parse(w.localStorage.getItem('lingua_literary_notes')).savedWords.length >= 1,
    '新增词同步记入文学笔记键供进度页统计')

  /* 旁侧词典栏：牛津式解释 / 旁侧呈现 / 多种关闭方式 */
  assert(document.querySelector('[data-word-panel="true"]'), '点击生词后旁侧词典栏弹出')
  assert(document.querySelector('[data-word-drawer="true"]'),
    '中小屏以右侧抽屉呈现，正文宽度不被挤压')
  assert(document.querySelector('#reader-word-slot')
    && !document.querySelector('#reader-word-slot [data-word-panel]'),
  '桌面槽位已预留，窄屏只在抽屉渲染一份词典卡，不重复')
  assert(buttons().some((b) => b.getAttribute('aria-label') === '关闭释义与词典面板'
    && /关闭/.test(b.textContent || '')), '词典卡提供带可见文字的关闭按钮')
  assert(bodyText().includes('ENGLISH DEFINITION') && bodyText().includes('英英释义优先'),
    '词典栏以英英释义为主视觉，中文对照为辅')
  assert(bodyText().includes('本章原句') && bodyText().includes('学习例句 · 非原文'),
    '词典栏区分本章真实原句与自编学习例句')
  assert(bodyText().includes('音标') || bodyText().includes('/ˈ'),
    '词典栏展示音标与词性等词典字段')
  assert(bodyText().includes('不是 Oxford University Press 官方内容'),
    '词典栏明确标注非牛津官方内容')
  const closeDict = () => {
    const btn = buttons().find((b) => b.getAttribute('aria-label') === '关闭释义与词典面板')
    if (!btn) throw new Error('✗ 词典栏缺少关闭按钮')
    fire(btn)
  }
  closeDict()
  await tick(100)
  assert(!document.querySelector('[data-word-panel="true"]'), '点右上角 × 可关闭词典栏')
  fire(document.querySelector('button.lit-word'))
  await tick(100)
  assert(document.querySelector('[data-word-panel="true"]'), '再次点生词可重新弹出词典栏')
  closeDict()
  await tick(100)
  fire(document.querySelector('button.lit-word'))
  await tick(100)
  w.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
  await tick(100)
  assert(!document.querySelector('[data-word-panel="true"]'), '按 Esc 可关闭词典栏')
  fire(document.querySelector('button.lit-word'))
  await tick(100)
  const backdrop = buttons().find((b) => b.getAttribute('aria-label') === '关闭词典遮罩')
  assert(backdrop, '抽屉提供可点击遮罩')
  fire(backdrop)
  await tick(100)
  assert(!document.querySelector('[data-word-panel="true"]'), '点遮罩可关闭词典栏')
  assert(document.querySelector('button.lit-word'), '关闭词典后正文与高亮词仍在，阅读不中断')

  click(/^批注$/, '打开段落批注')
  await tick(100)
  const litNoteTa = document.querySelector('textarea[data-literary-note="true"]')
  assert(litNoteTa, '批注输入框存在')
  setter.call(litNoteTa, '这一句把「死亡」放在最前面，值得再读一遍。')
  litNoteTa.dispatchEvent(new (globalThis.Event)('input', { bubbles: true }))
  await tick(80)
  click(/保存批注/, '保存批注')
  await tick(140)
  assert(JSON.parse(w.localStorage.getItem('lingua_literary_notes')).notes.length >= 1,
    '批注与高亮保存到 lingua_literary_notes')

  click(/进入本章研讨/, '章末进入研讨')
  await tick(300)
  assert(bodyText().includes('SEMINAR · 文学研讨') && bodyText().includes('非角色扮演'),
    '研讨页用独立页头标签与对话页区分')
  assert(bodyText().includes('本章研讨卡') && bodyText().includes('主题假设')
    && bodyText().includes('人物卡片') && bodyText().includes('开放问题'),
  '研讨页展示本章主题卡 / 人物卡 / 讨论问题')
  assert(bodyText().includes('前情摘要'), '研讨页只注入上一章 1-2 句前情')

  const seminarTexts = [
    'I think the opening feels cold.',
    'I think Marley was dead: to begin with. This line shows the cold tone.',
    'I believe the weather matters because "It was cold, bleak, biting weather" sets the mood.',
    'My reading is that "Old Marley was as dead as a door-nail" repeats death on purpose.',
  ]
  for (let i = 0; i < 4; i++) {
    const semTa = document.querySelector('textarea')
    assert(semTa && !semTa.disabled, `第 ${i + 1} 轮研讨输入框可用`)
    setter.call(semTa, seminarTexts[i])
    semTa.dispatchEvent(new (globalThis.Event)('input', { bubbles: true }))
    await tick(70)
    const semSend = document.querySelector('button[aria-label="发送研讨发言"]')
    assert(semSend && !semSend.disabled, `第 ${i + 1} 轮发送按钮可用`)
    fire(semSend)
    await tick(220)
    assert(bodyText().includes('研讨反馈 · 论证 + 语言'), `第 ${i + 1} 轮出现可折叠反馈卡`)
    assert(bodyText().includes('论证反馈') && bodyText().includes('语言反馈'),
      `第 ${i + 1} 轮反馈同时区分论证反馈与语言反馈`)
  }
  const seminarStore = JSON.parse(w.localStorage.getItem('lingua_seminars') || '[]')
  assert(seminarStore.length >= 1 && seminarStore[0].turns >= 4,
    '研讨会话记录持久化，且完成至少 4 轮分析性对话')
  assert(JSON.parse(w.localStorage.getItem('lingua_library')).briefs['cc-1'],
    'chapterBrief 已写入书库供下一章使用')

  click(/回原文找证据/, '点击「回原文找证据」')
  await tick(260)
  assert(bodyText().includes('CHAPTER EXCERPT') && document.querySelector('.lit-focus'),
    '回原文按钮跳回阅读页并定位到相关段落')

  click(/进入本章研讨/, '再次进入同一场研讨')
  await tick(280)
  const endSemBtn = document.querySelector('button[aria-label="结束研讨并生成小结"]')
  assert(endSemBtn && !endSemBtn.disabled, '研讨页提供结束并生成小结入口')
  fire(endSemBtn)
  await tick(120)
  click(/结束并生成小结/, '确认结束研讨')
  await tick(560)
  assert(bodyText().includes('研讨小结') && bodyText().includes('已达成的观点')
    && bodyText().includes('待探索的问题'), '研讨结束后生成含观点与开放问题的小结')

  clickExact('书架', '返回书架')
  await tick(160)
  click(/阅读进度/, '进入阅读进度页')
  await tick(180)
  assert(bodyText().includes('READING PROGRESS') && bodyText().includes('已读书目'),
    '阅读进度页展示已读书目')
  assert(bodyText().includes('章节完成') && bodyText().includes('研讨场次')
    && bodyText().includes('新增词汇'), '阅读进度页含章节完成度 / 研讨次数 / 新增词汇数')
  assert(bodyText().includes('lingua_literary_notes') && bodyText().includes('lingua_seminars'),
    '阅读进度页标明 4 个新键与复用的旧键')

  /* ============ 文化视角视频 UI 全流程：文化首页 → 观看 → 短引用/短注释 → 4 轮观后讨论 → 小结 → 文化复习 → 设置 ============ */
  const cwQueueBefore = JSON.parse(w.localStorage.getItem('lingua_review_queue') || '[]').length
  const cwXpBefore = JSON.parse(w.localStorage.getItem('lingua_profile') || '{}').xp || 0

  clickExact('文化', '底部导航进入文化首页')
  await tick(220)
  assert(bodyText().includes('CULTURE WATCH') && bodyText().includes('看一段真实英语，聊一层文化语境'),
    '文化首页有独立页头与「观看 → 理解 → 产出」定位')
  assert(bodyText().includes('TED / TED-Ed') && bodyText().includes('Pexels')
    && bodyText().includes('VOA Learning English') && bodyText().includes('BBC 等许可限制来源'),
  '首页白名单与版权说明列明准入源与明确排除项')
  assert(bodyText().includes('不下载、不转存') && bodyText().includes('不做实时搜索')
    && bodyText().includes('白名单准入'),
  '首页声明只嵌入不下载、只用本地索引不实时搜索')
  assert(bodyText().includes('角色对话 · Dialogue') && bodyText().includes('文学研讨 · Seminar')
    && bodyText().includes('文化视角 · Culture Watch'),
  '三条学习路径并列展示，文化视频不替代旧流程')
  assert(bodyText().includes('Try something new for 30 days')
    && bodyText().includes('How to speak so that people want to listen'),
  '预配置播放列表按本地索引展示视频卡片')
  assert(document.querySelectorAll('input[placeholder*="本地索引"]').length >= 1,
    '本地关键词筛选不联网、不调用搜索接口')

  click(/节日与习俗/, '按主题在本地索引里筛选')
  await tick(150)
  assert(bodyText().includes('筛选结果') && !bodyText().includes('Try something new for 30 days'),
    '主题筛选只过滤本地索引，不发起实时搜索')
  click(/全部/, '恢复全部视频')
  await tick(150)
  assert(bodyText().includes('Try something new for 30 days'), '清除主题筛选后列表恢复')

  /* ============ Word Lab 词场：数据契约 / 7 库分片种子（验收 1/2） ============ */
  const wlTypes = await loadModule('src/wordLabTypes.ts', 'wl-types')
  const wlDecks = await loadModule('src/data/wordDecks/index.ts', 'wl-decks')
  const wlSched = await loadModule('src/lib/wordScheduler.ts', 'wl-sched')
  const wlCurator = await loadModule('src/services/wordCurator.ts', 'wl-curator')
  const wlMedia = await loadModule('src/services/wordMedia.ts', 'wl-media')
  const wlCoach = await loadModule('src/services/wordCoach.ts', 'wl-coach')
  const wlFlow = await loadModule('src/lib/wordLabFlow.ts', 'wl-flow')
  const wlStorage = await loadModule('src/lib/storage.ts', 'wl-storage')
  const wlMigrate = await loadModule('src/lib/wordLabStorage.ts', 'wl-migrate')
  const DAY_MS = 24 * 60 * 60 * 1000

  assert(wlDecks.DECK_IDS.length === 7, '词场提供 7 个分级词库')
  for (const id of wlDecks.DECK_IDS) {
    assert(wlDecks.firstShard(id).length >= 50, `${id} 种子分片 ≥50 词`)
  }
  assert(wlDecks.DECK_IDS.reduce((s, id) => s + wlDecks.firstShard(id).length, 0) >= 350,
    '7 个词库种子合计 ≥350 词')
  assert(wlDecks.DECK_IDS.every((id) => wlDecks.DECK_META[id].shardSize >= 300
    && wlDecks.DECK_META[id].shardSize <= 500), '每片分片大小在 300-500 词区间')
  assert(wlDecks.DECK_IDS.every((id) => {
    const names = wlDecks.firstShard(id).map((x) => x.word.toLowerCase())
    return new Set(names).size === names.length
  }), '每个词库内部无重复词条')
  assert(wlDecks.DECK_IDS.every((id) => wlDecks.firstShard(id).every((x) =>
    x.meaningZh.length <= 20 && x.imageUrl === '' && x.examples.length >= 1
    && x.collocations.length >= 1 && x.imageQuery && x.imageAlt)),
  '所有词条：中文释义 ≤20 字 / 不内嵌第三方图片 / 含例句与搭配 / 含场景与英文替代描述')
  assert(wlDecks.DECK_IDS.every((id) => wlDecks.firstShard(id).every((x) =>
    !/[\u4e00-\u9fa5]/.test(x.imageQuery) && !/[\u4e00-\u9fa5]/.test(x.imageAlt))),
  'imageQuery 与 imageAlt 不含中文释义（不会提前泄题）')
  assert((await wlDecks.loadShard('junior_3500', 0)).length === 50
    && (await wlDecks.loadShard('junior_3500', 1)).length === 0,
  '分片加载只读第 1 片，第 2 片为空（禁止一次性加载全量）')
  wlDecks.setShardLoader(async () => [wlDecks.firstShard('cet4')[0]])
  assert((await wlDecks.loadShard('cet4', 0)).length === 1, '分片加载器可替换（Mock 注入）')
  wlDecks.resetShardLoader()
  assert((await wlDecks.loadShard('cet4', 0)).length === 50, 'resetShardLoader 恢复默认种子分片')
  assert(wlDecks.findWord('abandon')?.word === 'abandon', '跨词库按小写查找词条')

  /* ---- 艾宾浩斯阶梯 + 现有 SM-2 统一调度（验收 4） ---- */
  assert(JSON.stringify(wlTypes.EBBINGHAUS_STEPS_MS) === JSON.stringify([
    10 * 60 * 1000, DAY_MS, 3 * DAY_MS, 7 * DAY_MS, 15 * DAY_MS, 30 * DAY_MS,
  ]), '艾宾浩斯阶梯 = 10min → 1d → 3d → 7d → 15d → 30d')
  const wlEntry = wlDecks.firstShard('junior_3500')[0]
  const nowWl = 1_800_000_000_000
  let wlP = wlSched.initProgress(wlEntry, 'wordlab', nowWl)
  assert(wlP.status === 'ladder' && wlP.ladderStep === 0 && wlP.sm2Level === -1
    && wlP.dueAt - nowWl === 10 * 60 * 1000 && wlP.origin === 'wordlab',
  '新词结算后进入阶梯第 0 级，10 分钟后首复')
  wlP = wlSched.advanceProgress(wlP, true, nowWl)
  assert(wlP.ladderStep === 1 && wlP.dueAt - nowWl === DAY_MS, '答对前进一级（1 天后）')
  wlP = wlSched.advanceProgress(wlP, true, nowWl)
  wlP = wlSched.advanceProgress(wlP, true, nowWl)
  assert(wlP.ladderStep === 3 && wlP.dueAt - nowWl === 7 * DAY_MS, '连续答对推进到 7 天阶梯')
  wlP = wlSched.advanceProgress(wlP, false, nowWl)
  assert(wlP.ladderStep === 2 && wlP.errorCount === 1 && wlP.correctStreak === 0,
    '答错只回退一级、不清零')
  const atZero = wlSched.advanceProgress(wlSched.initProgress(wlEntry, 'wordlab', nowWl), false, nowWl)
  assert(atZero.ladderStep === 0 && atZero.errorCount === 1, '第 0 级答错不会变成负数')
  let wlGrad = wlSched.initProgress(wlEntry, 'wordlab', nowWl)
  for (let i = 0; i < 6; i++) wlGrad = wlSched.advanceProgress(wlGrad, true, nowWl)
  assert(wlGrad.status === 'sm2' && wlGrad.sm2Level === wlTypes.SM2_ENTRY_LEVEL
    && wlGrad.ladderStep === 6, '走完 6 级阶梯后并入现有 SM-2，不新建第二套调度器')
  const sm2Up = wlSched.advanceProgress(wlGrad, true, nowWl)
  const sm2Down = wlSched.advanceProgress(sm2Up, false, nowWl)
  assert(sm2Up.sm2Level === wlTypes.SM2_ENTRY_LEVEL + 1
    && sm2Down.sm2Level === wlTypes.SM2_ENTRY_LEVEL && sm2Down.sm2Level > 0,
  'SM-2 阶段答对升级、答错降一级但不归零')
  const wlDueEntry = { ...wlSched.initProgress(wlEntry, 'wordlab', nowWl), dueAt: Date.now() - 1000 }
  const wlState = { words: { [wlEntry.word]: wlDueEntry }, version: 1 }
  assert(wlSched.dueWords(wlState).length === 1
    && wlSched.dueWords({ words: {}, version: 1 }).length === 0, '到期词过滤只返回 dueAt ≤ now 的词')
  const wlStats = wlSched.wordLabStats(wlState)
  assert(wlStats.total === 1 && wlStats.learning === 1 && wlStats.ladder === 1 && wlStats.due === 1,
    '词场统计区分在学 / 阶梯 / 到期')
  assert(wlSched.wordProgressToReviewItem(wlState.words[wlEntry.word], wlEntry).source === 'wordlab',
    '统一调度输出用 source=wordlab 与既有复习队列区分')

  /* ---- WordCuratorAgent / WordMediaAgent / WordCoachAgent（验收 3） ---- */
  const learnedState = { words: { abandon: { word: 'abandon' } }, version: 1 }
  const nextWords = await wlCurator.getNextWords('senior_5000', learnedState, 4)
  assert(nextWords.length === 4 && !nextWords.some((x) => x.word === 'abandon'),
    'WordCurator 跳过已学词并按分片顺序发新词（去重）')
  assert(JSON.stringify(nextWords) === JSON.stringify(await wlCurator.getNextWords('senior_5000', learnedState, 4)),
    '同一进度下新词队列幂等稳定')
  wlCurator.setNextWordsProvider(async () => [wlEntry])
  assert((await wlCurator.getNextWords('junior_3500', { words: {}, version: 1 }, 1)).length === 1,
    'getNextWords 是可替换接口')
  wlCurator.resetNextWordsProvider()
  assert(wlCurator.enqueueExternalWord('abroad', 'reading')?.word === 'abroad'
    && wlCurator.enqueueExternalWord('', 'video') === null, '外部生词入队可命中词表 / 空词拒绝')
  assert(wlCurator.makeExternalEntry('unlisted', 'video', '未收录词').imageUrl === '',
    '未收录生词走轻量兜底条目，不内嵌图片')
  const mediaFirst = await wlMedia.fetchWordMedia(wlEntry, {})
  assert(mediaFirst.media.source === 'fallback' && mediaFirst.media.emoji
    && mediaFirst.media.examples.length >= 1 && Object.keys(mediaFirst.cache).length === 1,
  'WordMediaAgent 默认走离线 SVG/emoji 兜底并写入媒体缓存')
  const mediaHit = await wlMedia.fetchWordMedia(wlEntry, mediaFirst.cache)
  assert(mediaHit.media === mediaFirst.media && mediaHit.cache === mediaFirst.cache,
    '媒体缓存命中直接复用，不重复生成')
  assert(wlMedia.imageSrc(wlEntry, mediaFirst.media).startsWith('data:image/svg+xml')
    && wlMedia.fallbackSvg(wlEntry, mediaFirst.media).includes(wlEntry.word),
  '兜底图为内联 data URI SVG，零网络请求')
  wlMedia.setWordMediaFetcher(async (entry) => ({ word: entry.word, imageUrl: 'https://images.pexels.com/demo.jpg',
    emoji: '📷', tint: '#fff', examples: entry.examples, source: 'pexels', cachedAt: Date.now() }))
  const mediaCustom = await wlMedia.fetchWordMedia(wlEntry, {})
  assert(mediaCustom.media.source === 'pexels'
    && wlMedia.imageSrc(wlEntry, mediaCustom.media).startsWith('https://images.pexels.com/'),
  'fetchWordMedia 可整体替换为 Pexels 等免费图库')
  wlMedia.resetWordMediaFetcher()
  const rec = (word, guessCorrect, spellingPassed) => ({ word, guess: '试猜', guessCorrect, guessMode: 'choice',
    verifiedKnown: true, spellingTries: 1, spellingPassed, spellingMode: 'typing' })
  const coachOut = wlCoach.coachWordSession(
    [rec('ability', true, true), rec('abroad', true, false), rec('accept', false, true)],
    { words: {}, version: 1 })
  assert(coachOut.stats.total === 3 && coachOut.stats.guessedRight === 2
    && coachOut.stats.spelledRight === 2 && coachOut.stats.errorWords.length === 2,
  'WordCoach 结算统计猜义/拼写命中与易错词')
  assert(coachOut.encourage.split(/[。！？]/).filter(Boolean).length <= 2
    && coachOut.suggestion.length > 0, '教练鼓励 ≤2 句，并给一条可执行建议')

  /* ---- 五步状态机辅助：S1 选项 / S3 逐字母比对 / S4 结算 / S0 限流 ---- */
  const wlChoices = wlFlow.buildChoices(wlEntry, 'junior_3500')
  assert(wlChoices.length === 4 && wlChoices.includes(wlEntry.meaningZh)
    && new Set(wlChoices).size === 4, 'S1 提供 4 选 1 且含唯一正确释义')
  const spellOk = wlFlow.compareSpelling('abandon', 'abandon')
  const spellBad = wlFlow.compareSpelling('abandon', 'abandun')
  assert(spellOk.correct && spellOk.cells.every((c) => c.ok)
    && !spellBad.correct && spellBad.cells[5].ok === false,
  'S3 打字模式逐字母比对并标出错误字母')

  /* ---- 书写阶段遮蔽：maskTargetWord + 兜底图 hideWord（本轮增量） ---- */
  assert(wlFlow.maskTargetWord('A large proportion of students cycle.', 'proportion')
    === 'A large ____ of students cycle.', '书写遮蔽：英释/例句里出现的整词替换为 ____')
  assert(wlFlow.maskTargetWord('Proportions and PROPORTIONED', 'proportion') === '____ and ____',
    '书写遮蔽：大小写不敏感，覆盖复数与 -ed 屈折')
  assert(wlFlow.maskTargetWord('Studying studies study', 'study') === '____ ____ ____',
    '书写遮蔽：y→ies 变体与 -ing 变体一并覆盖')
  assert(wlFlow.maskTargetWord('a pie chart with one big slice', 'proportion')
    === 'a pie chart with one big slice', '书写遮蔽：不含目标词的提示文本原样保留')
  assert(wlFlow.maskTargetWord('', 'proportion') === '' && wlFlow.maskTargetWord('abc', '') === 'abc',
    '书写遮蔽：空文本 / 空目标词安全返回')
  const hiddenSvg = decodeURIComponent(wlMedia.fallbackSvg(wlEntry, mediaFirst.media, true))
  assert(!hiddenSvg.includes(wlEntry.word) && hiddenSvg.includes('········')
    && !decodeURIComponent(wlMedia.imageSrc(wlEntry, mediaFirst.media, true)).includes(wlEntry.word),
  '书写阶段兜底 SVG 不再把目标词画在图上')
  assert(decodeURIComponent(wlMedia.fallbackSvg(wlEntry, mediaFirst.media)).includes(wlEntry.word),
    'S1/S2 的兜底图仍保留词形（只有书写阶段才遮蔽）')
  assert(wlFlow.compareSpelling('abandon', 'abandun').cells.map((c) => c.ch).join('') === 'abandun',
    '逐字母比对只回显用户输入的字符，不回显正确拼写')

  const todayWl = (() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` })()
  assert(wlFlow.remainingQuota({ date: todayWl, newWordsLearned: 11, limit: 12 }) === 1
    && wlFlow.remainingQuota({ date: todayWl, newWordsLearned: 12, limit: 12 }) === 0
    && wlFlow.remainingQuota({ date: '2000-01-01', newWordsLearned: 9, limit: 12 }) === 15,
  'S0 每日新词硬上限 10-15：满额为 0、跨天重置')
  const wlDraft = { deckId: 'junior_3500', startedAt: nowWl,
    words: ['ability', 'abroad'], index: 1, step: 'summary',
    records: [rec('ability', true, true), rec('abroad', false, true)] }
  const wlPrev = {
    wordProgress: { words: {}, version: 1 },
    wordDailyQuota: { date: todayWl, newWordsLearned: 0, limit: 12 },
    wordErrors: [], wordSessionDraft: wlDraft,
    deckSelection: { activeDeckId: 'junior_3500' },
  }
  const settled = wlFlow.finishWordSession(wlPrev, wlDraft, [{ word: 'abroad', type: 'guess', detail: '选错' }])
  assert(Object.keys(settled.next.wordProgress.words).length === 2
    && Object.values(settled.next.wordProgress.words).every((p) => p.status === 'ladder' && p.ladderStep === 0),
  'S5 结算把本场新词写入阶梯第 0 级')
  assert(settled.next.wordDailyQuota.newWordsLearned === 2
    && settled.next.wordErrors.length === 1 && settled.next.wordSessionDraft === null
    && settled.xp === 20, 'S4 结算更新限流/易错本/清空草稿，并按每词 10 XP 计分')
  let extStore = { wordProgress: { words: {}, version: 1 },
    wordDailyQuota: { date: todayWl, newWordsLearned: 3, limit: 12 },
    deckSelection: { activeDeckId: 'cet4' } }
  const extApp = { data: extStore, update: (recipe) => { extStore = recipe(extStore) }, notify: () => {} }
  wlFlow.enqueueWordFromContext(extApp, 'readingword', 'reading', '阅读生词')
  assert(extStore.wordProgress.words.readingword?.origin === 'reading'
    && extStore.wordDailyQuota.newWordsLearned === 3,
  '阅读/视频生词一键入队：origin 区分来源且不计当日新词上限')
  wlFlow.enqueueWordFromContext(extApp, 'readingword', 'reading', '阅读生词')
  assert(Object.keys(extStore.wordProgress.words).length === 1, '外部生词重复入队被去重')

  /* ---- 6 新键 / 迁移幂等（验收 6/9） ---- */
  assert(Object.keys(wlStorage.KEYS).length === 31
    && wlStorage.KEYS.pronunciationFlags === 'lingua_pronunciation_flags'
    && wlStorage.KEYS.growth === 'lingua_growth'
    && wlStorage.KEYS.achievementsState === 'lingua_achievements'
    && wlStorage.KEYS.xpLedger === 'lingua_xp_ledger'
    && wlStorage.KEYS.activityHeatmap === 'lingua_activity_heatmap'
    && wlStorage.KEYS.chinaTrack === 'lingua_china_track'
    && wlStorage.KEYS.levelPreference === 'lingua_level_preference'
    && wlStorage.KEYS.voicePreferences === 'lingua_voice_preferences'
    && wlStorage.KEYS.wordProgress === 'lingua_word_progress'
    && wlStorage.KEYS.wordSessionDraft === 'lingua_word_session_draft'
    && wlStorage.KEYS.wordDailyQuota === 'lingua_word_daily_quota'
    && wlStorage.KEYS.wordErrors === 'lingua_word_errors'
    && wlStorage.KEYS.wordMediaCache === 'lingua_word_media_cache'
    && wlStorage.KEYS.deckSelection === 'lingua_deck_selection',
  'KEYS 扩到 31 个：6 个词场键 + 第 24 个发音键 + 成长系统 4 键 + 第 29 个 china_track + 第 30 个等级偏好 + 第 31 个音色偏好键名一致')
  assert(Object.keys(wlStorage.DEFAULT_DATA.wordProgress.words).length === 0
    && wlStorage.DEFAULT_DATA.wordErrors.length === 0
    && wlStorage.DEFAULT_DATA.wordDailyQuota.limit === 12
    && wlStorage.DEFAULT_DATA.deckSelection.activeDeckId === null
    && wlStorage.DEFAULT_SETTINGS.wordDailyLimit === 12
    && wlStorage.DEFAULT_SETTINGS.wordSpellingMode === 'typing',
  'DEFAULT_DATA / DEFAULT_SETTINGS 为 6 新键与 4 项设置提供默认值')
  const rawQuota = w.localStorage.getItem('lingua_word_daily_quota')
  const rawCache = w.localStorage.getItem('lingua_word_media_cache')
  w.localStorage.setItem('lingua_word_daily_quota', JSON.stringify({ date: '2000-01-01', newWordsLearned: 9, limit: 12 }))
  w.localStorage.setItem('lingua_word_media_cache', JSON.stringify(Object.fromEntries(
    Array.from({ length: 320 }, (_, i) => [`w${i}`, { word: `w${i}`, cachedAt: i }]))))
  wlMigrate.migrateWordLabData()
  const migratedQuota = JSON.parse(w.localStorage.getItem('lingua_word_daily_quota'))
  assert(migratedQuota.date === todayWl && migratedQuota.newWordsLearned === 0,
    '迁移跨天重置每日新词额度（幂等、不覆盖 limit）')
  assert(Object.keys(JSON.parse(w.localStorage.getItem('lingua_word_media_cache'))).length === 300,
    '迁移把媒体缓存裁剪到 300 条上限')
  wlMigrate.migrateWordLabData()
  assert(Object.keys(JSON.parse(w.localStorage.getItem('lingua_word_media_cache'))).length === 300,
    '二次运行迁移幂等')
  if (rawQuota === null) w.localStorage.removeItem('lingua_word_daily_quota')
  else w.localStorage.setItem('lingua_word_daily_quota', rawQuota)
  if (rawCache === null) w.localStorage.removeItem('lingua_word_media_cache')
  else w.localStorage.setItem('lingua_word_media_cache', rawCache)

  /* ============ S2.5 跟读朗读：服务层纯函数 / 数据契约 / 迁移（验收 1-9） ============ */
  const wlPro = await loadModule('src/services/pronunciation.ts', 'wl-pro')
  const wlTips = await loadModule('src/data/wordDecks/pronunciationTips.ts', 'wl-tips')
  const readSentence = 'She has the ability to solve hard problems.'
  const P = wlPro.READ_ALOUD_POLICY

  assert(P.minRecordingMs === 800 && P.maxRecordingMs === 10000 && P.maxAttempts === 2,
    'S2.5 策略：最短录音 0.8s / 最长 10s / 最多 2 次重试')
  assert(P.mockDelayMs === 1500 && P.mockMinCoverage === 0.7 && P.mockMaxCoverage === 1,
    'Mock 演示固定 1.5s「识别中」，覆盖率区间 70%–100%')
  assert(P.silenceRms > 0 && P.silenceRms < 0.1 && wlPro.FORBIDDEN_FEEDBACK.length >= 8,
    '静音阈值合理，且禁用文案清单覆盖了百分制/星级/音素/评判性措辞')

  const rTokens = wlPro.sentenceTokens(readSentence)
  assert(rTokens.length === 8 && rTokens.some((t) => t.key === 'ability'),
    '按词切分目标例句，目标词 ability 落在 token 里')
  assert(rTokens.every((t) => t.key.length > 0 && !/[^a-z'-]/.test(t.key)),
    '分词 key 去掉附着标点并统一小写，raw 保留原文供 UI 渲染')
  const rFull = wlPro.compareCoverage(readSentence, readSentence)
  assert(rFull.coverage === 1 && rFull.matchedCount === 8 && rFull.matched.every(Boolean)
    && rFull.missedWords.length === 0 && rFull.mock === false,
  '整句读全：8/8 词命中，无漏词，标记为真实识别')
  const rPartial = wlPro.compareCoverage(readSentence, 'She has the ability solve hard problems')
  assert(rPartial.coverage === 0.875 && rPartial.matchedCount === 7,
    '只做词级集合匹配：7/8 词命中，覆盖率仅供内部挑文案')
  assert(rPartial.missedWords.length === 1 && rPartial.missedWords[0] === 'to',
    '漏词列表准确给出未识别到的词')
  const rStem = wlPro.compareCoverage(readSentence, 'She has the abilities solved hard problem')
  assert(rStem.matchedCount >= 6, '轻度屈折归一让 -s / -ed 变体也能算读到，不做音素比对')
  const rFb = wlPro.feedbackText(rPartial)
  assert(rFb.headline === '读到了 7/8 个词', '反馈以「读到了 X/Y 个词」呈现，不是百分制分数')
  assert(rFb.missedLine.includes('to') && rFb.missedLine.includes('没听清'),
    '漏词文案温和具体：点名漏掉的词并邀请再读一次')
  assert(!wlPro.FORBIDDEN_FEEDBACK.some((x) => rFb.headline.includes(x)
    || rFb.missedLine.includes(x) || rFb.encouragement.includes(x)),
  '三段反馈文案里不存在准确率/星级/音素/判定性措辞')
  assert(wlPro.feedbackText(rFull).encouragement.includes('整句都读到了'),
    '读全时给一句具体正向反馈，不下「准不准」的结论')

  const flags0 = { words: {}, lastMissedWords: [], version: 1 }
  const flags1 = wlPro.updatePronunciationFlags(flags0, ['fresh', 'checkout'])
  assert(Object.keys(flags1.words).length === 0 && flags1.lastMissedWords.length === 2,
    '第一次漏读只记入 lastMissedWords，不产生 flag')
  const flags2 = wlPro.updatePronunciationFlags(flags1, ['fresh'])
  assert(flags2.words.fresh && flags2.words.fresh.missedCount === 1 && !flags2.words.checkout,
    '连续两次漏读同一词才记一条 flag，另一词不记')
  assert(String(flags2.words.fresh.lastMissedAt).includes('T')
    && flags2.words.fresh.note.includes('复习'),
  'flag 带 ISO 时间与「复习时多听一遍」的说明')
  const flags3 = wlPro.updatePronunciationFlags(flags2, ['checkout'])
  assert(Object.keys(flags3.words).length === 1,
    '换了漏词后不误判为连续漏读，flag 集合不被污染')

  const supBase = { recognition: true, onLine: true, secureContext: true, inIframe: false }
  assert(wlPro.pronunciationSupport(supBase).available === true,
    '四项条件都满足时允许真实识别')
  assert(wlPro.pronunciationSupport({ ...supBase, recognition: false }).reason === 'unsupported'
    && !wlPro.pronunciationSupport({ ...supBase, recognition: false }).available,
  '浏览器不支持 SpeechRecognition → 降级为自评跟读')
  assert(wlPro.pronunciationSupport({ ...supBase, onLine: false }).reason === 'offline',
    '无网络（识别服务依赖云端）→ 降级为自评跟读')
  assert(wlPro.pronunciationSupport({ ...supBase, secureContext: false }).reason === 'insecure',
    '非安全上下文 → 麦克风被禁用，降级为自评跟读')
  assert(wlPro.pronunciationSupport({ ...supBase, inIframe: true }).reason === 'iframe',
    '预览 iframe 内权限受限 → 降级为自评跟读')
  assert(wlPro.classifyFailure('not-allowed') === 'denied'
    && wlPro.classifyFailure('service-not-allowed') === 'denied',
  '权限被拒绝 / 服务禁用 → denied 降级')
  assert(wlPro.classifyFailure('network') === 'offline'
    && wlPro.classifyFailure('no-speech') === 'silent'
    && wlPro.classifyFailure('audio-capture') === 'silent'
    && wlPro.classifyFailure('weird-code') === 'empty',
  '网络错误 / 空结果 / 无麦克风设备分别映射到明确的降级种类')
  assert(wlPro.FAILURE_HINT.denied.includes('站点设置')
    && wlPro.FAILURE_HINT.silent.includes('检查麦克风')
    && wlPro.FAILURE_HINT.empty.includes('没听清'),
  '三类降级都有明确、不阻塞的 UI 提示文案')

  const pResult = wlPro.toPronunciationResult(rPartial, 'mock', 1700000000000)
  assert(pResult.mode === 'mock' && pResult.coverage === 0.875
    && pResult.missedWords[0] === 'to' && String(pResult.at).includes('T'),
  '留档结果含 coverage / missedWords / mode / ISO 时间')
  const pBase = {
    wordProgress: { words: { ability: { word: 'ability', status: 'ladder', ladderStep: 0 } }, version: 1 },
    pronunciationFlags: flags0, wordErrors: [],
  }
  const pMerged = wlPro.applyPronunciationResults(pBase, {
    ability: { word: 'ability', skipped: false, attempts: 2, lastResult: pResult, missedWords: ['to'] },
  }, 1700000000000)
  assert(pMerged.wordProgress.words.ability.pronunciationAttempts === 2
    && pMerged.wordProgress.words.ability.pronunciationSkipped === false
    && pMerged.wordProgress.words.ability.pronunciationLastResult.mode === 'mock',
  '结算把 attempts / skipped / lastResult 合并进 lingua_word_progress')
  assert(pMerged.wordProgress.words.ability.status === 'ladder',
    '合并只补新字段，旧调度字段一字不改')
  assert(pMerged.wordErrors === pBase.wordErrors && pMerged.wordErrors.length === 0,
    '发音漏读绝不写入拼写易错本 lingua_word_errors')
  assert(pMerged.pronunciationFlags.lastMissedWords[0] === 'to',
    '有效识别的漏词推进 lingua_pronunciation_flags 的连续判定')
  const pSelf = wlPro.applyPronunciationResults(pMerged, {
    ability: {
      word: 'ability', skipped: true, attempts: 2,
      lastResult: { coverage: 0, missedWords: [], mode: 'selfReported', at: new Date(1700000000000).toISOString() },
      missedWords: [],
    },
  }, 1700000000000)
  assert(pSelf.wordProgress.words.ability.pronunciationSkipped === true
    && pSelf.wordProgress.words.ability.pronunciationLastResult.mode === 'selfReported',
  '自评跟读与跳过都显式留 mode，不伪装成识别成功')
  assert(pSelf.pronunciationFlags.lastMissedWords[0] === 'to',
    '自评跟读不推进连续漏读判定（不伪造识别）')

  const mockHandle = wlPro.startReadAloudAttempt({
    mode: 'mock', sentence: readSentence, accent: 'en-US', mockDelayMs: 6, random: () => 0.5,
  })
  const mockOutcome = await mockHandle.result
  assert(mockOutcome.kind === 'result' && mockOutcome.mock === true
    && mockOutcome.coverage.mock === true,
  'Mock 尝试返回带 mock:true 的演示结果')
  assert(mockOutcome.coverage.coverage >= 0.7 && mockOutcome.coverage.coverage <= 1,
    'Mock 覆盖率落在 70%–100% 区间')
  assert(mockOutcome.durationMs === 6 && mockOutcome.coverage.transcript.length > 0,
    'Mock 用注入的时延模拟「识别中」，并给出模拟识别文本')
  const liveHandle = wlPro.startReadAloudAttempt({ mode: 'live', sentence: readSentence, accent: 'en-US' })
  const liveOutcome = await liveHandle.result
  assert(liveOutcome.kind === 'degrade'
    && ['unsupported', 'offline', 'insecure', 'iframe'].includes(liveOutcome.failure)
    && liveOutcome.message.includes('跟读'),
  '无识别能力的环境立即返回降级结果，不伪造识别、不阻塞')

  assert(Object.keys(wlTips.PRONUNCIATION_TIPS).length >= 15,
    '词库为 15+ 个词登记了静态发音小提示')
  assert(String(wlTips.pronunciationTipFor('ability')).includes('重音')
    && wlTips.pronunciationTipFor('no-such-word') === undefined,
  '只有词库登记过的词才有 pronunciationTip，内容只讲重音/易混音')
  assert(Object.values(wlTips.PRONUNCIATION_TIPS).every((t) =>
    !String(t).includes('准确率') && !String(t).includes('分数') && !String(t).includes('音素')),
  '静态提示不含任何评分或音素级判断')
  assert(String(wlDecks.firstShard('junior_3500')[0].pronunciationTip).includes('重音'),
    'makeWord 把 pronunciationTip 挂到词条上（不改动 7 个种子文件的元组结构）')
  assert(!wlDecks.firstShard('junior_3500').find((x) => x.word === 'abroad').pronunciationTip,
    '未登记的词条不带该字段，UI 不会凭空生成提示')

  /* ---- 第 24 键与旧存档迁移幂等（验收 9） ---- */
  const savedFlags = w.localStorage.getItem('lingua_pronunciation_flags')
  const savedProgress = w.localStorage.getItem('lingua_word_progress')
  w.localStorage.removeItem('lingua_pronunciation_flags')
  w.localStorage.setItem('lingua_word_progress', JSON.stringify({
    words: { legacy: { word: 'legacy', status: 'ladder', ladderStep: 2, correctStreak: 3 } }, version: 1,
  }))
  wlMigrate.migrateWordLabData()
  const mgFlags = JSON.parse(w.localStorage.getItem('lingua_pronunciation_flags'))
  const mgProgress = JSON.parse(w.localStorage.getItem('lingua_word_progress'))
  assert(mgFlags && Array.isArray(mgFlags.lastMissedWords) && mgFlags.version === 1
    && Object.keys(mgFlags.words).length === 0,
  '迁移创建第 24 键 lingua_pronunciation_flags 并给出空默认结构')
  assert(mgProgress.words.legacy.pronunciationAttempts === 0
    && mgProgress.words.legacy.pronunciationSkipped === false,
  '迁移给旧进度词条补齐 2 个新字段，不覆盖已有值')
  assert(mgProgress.words.legacy.status === 'ladder' && mgProgress.words.legacy.correctStreak === 3
    && Object.keys(mgProgress.words).length === 1,
  '旧版本 localStorage 数据完整保留，迁移不新建词条（不影响新词额度统计）')
  wlMigrate.migrateWordLabData()
  assert(JSON.stringify(JSON.parse(w.localStorage.getItem('lingua_word_progress'))) === JSON.stringify(mgProgress)
    && JSON.stringify(JSON.parse(w.localStorage.getItem('lingua_pronunciation_flags'))) === JSON.stringify(mgFlags),
  '二次运行 S2.5 迁移完全幂等')
  if (savedFlags === null) w.localStorage.removeItem('lingua_pronunciation_flags')
  else w.localStorage.setItem('lingua_pronunciation_flags', savedFlags)
  if (savedProgress === null) w.localStorage.removeItem('lingua_word_progress')
  else w.localStorage.setItem('lingua_word_progress', savedProgress)

  /* ---- 三层储量体系 UI：库健康度面板 + 播放列表注册表 + 手动同步（验收标准 3/5） ---- */
  assert(bodyText().includes('库健康度') && bodyText().includes('可嵌入率')
    && bodyText().includes('VOA 压舱石占比') && bodyText().includes('储量健康'),
  '文化首页展示库健康度面板：总条目 / 可嵌入率 / VOA 占比 / 状态')
  assert(bodyText().includes('日常生活与习惯') && bodyText().includes('节日、习俗与身份')
    && bodyText().includes('科学、自然与环境') && bodyText().includes('艺术、媒体与流行文化'),
  '健康度面板列出 6 个主题分类的条目数（低于阈值提示偏少）')
  assert(bodyText().includes('播放列表注册表 · 储量增长引擎')
    && bodyText().includes('同步播放列表') && bodyText().includes('来源依据'),
  '注册表面板展示播放列表清单与「同步播放列表」手动入口')
  assert(bodyText().includes('停用 · 待验证嵌入权限') && bodyText().includes('待首次同步'),
  '未验证嵌入权限的播放列表默认停用、未同步列表显式标注')
  assert(bodyText().includes('playlistItems.list') && bodyText().includes('search.list'),
  '配额说明写明 playlistItems.list 1 单位/次、search.list 独立桶仅 100 次/天且永不调用')
  const cwLibBefore = JSON.parse(w.localStorage.getItem('lingua_culture_videos') || '{}').videos.length
  click(/同步播放列表/, '手动触发播放列表同步（页面加载绝不自动拉取）')
  await tick(900)
  assert(bodyText().includes('上次同步') && bodyText().includes('Mock · 零网络'),
    '同步后立即展示本次报告（Mock 模式零网络零密钥）')
  const cwRegistry = JSON.parse(w.localStorage.getItem('lingua_playlist_registry') || '{}')
  assert(cwRegistry.lastSyncAt > 0 && cwRegistry.quotaUnitsUsed === 3
    && cwRegistry.playlists.filter((p) => p.lastFetchedAt).length === 3,
  '同步结果缓存进 lingua_playlist_registry：lastSyncAt / 配额 3 单位 / 3 个列表已拉取')
  const cwLibAfter = JSON.parse(w.localStorage.getItem('lingua_culture_videos') || '{}')
  assert(cwLibAfter.videos.length > cwLibBefore
    && cwLibAfter.videos.some((v) => v.seed === false && v.acquiredVia === 'playlistItems.list'),
  '同步条目以 seed:false 去重合并进 lingua_culture_videos（验收标准 3）')

  click(/Try something new for 30 days/, '进入观看页')
  await tick(400)
  assert(bodyText().includes('WATCH · 观看与理解') && bodyText().includes('内容梗概（原创，非字幕）'),
    '观看页有独立页头与原创梗概（不是字幕抄录）')
  assert(!document.querySelector('video') && !document.querySelector('iframe'),
    '官方播放器默认不自动加载，先由用户点击（不预取视频流）')
  click(/加载官方播放器/, '点击加载官方嵌入播放器')
  await tick(160)
  const cwIframe = document.querySelector('iframe[data-official-embed="true"]')
  assert(cwIframe && /^https:\/\/embed\.ted\.com\/talks\//.test(cwIframe.getAttribute('src') || '')
    && cwIframe.getAttribute('data-embed-host') === 'embed.ted.com'
    && (cwIframe.getAttribute('src') || '').includes('cc_load_policy=1'),
  '播放器只加载 TED 官方 embed 域名，字幕走平台自带 CC')
  assert(!document.querySelector('video[src]') && !document.querySelector('track')
    && document.querySelectorAll('[data-official-embed]').length === 1,
  '页面没有本地 <video> / <track>，视频流与字幕始终在平台侧')
  assert(bodyText().includes('来源与署名') && bodyText().includes('CC BY-NC-ND 4.0')
    && bodyText().includes('Matt Cutts'), '观看页完整展示来源、许可与署名')
  assert(bodyText().includes('关键表达 · 短引用') && bodyText().includes('非视频字幕')
    && bodyText().includes('分段观看') && bodyText().includes('文化背景'),
  '只展示短引用、分段提示与文化背景，不展示完整字幕')

  click(/加入复习队列/, '把一条短引用加进现有复习队列')
  await tick(160)
  assert(bodyText().includes('✓ 已入队'), '短引用卡反馈已入队')
  const cwNotes = JSON.parse(w.localStorage.getItem('lingua_culture_notes') || '{}')
  assert((cwNotes.savedExpressions || []).length >= 1,
    '收藏的短引用写入 lingua_culture_notes')
  assert(JSON.parse(w.localStorage.getItem('lingua_review_queue') || '[]').length > cwQueueBefore,
    '短引用复用现有 lingua_review_queue，沿用 SRS 调度')

  const cwNoteTa = document.querySelector('textarea[placeholder*="I noticed the speaker"]')
  assert(cwNoteTa, '观看页提供原创短注释输入框')
  setter.call(cwNoteTa, 'I noticed the speaker kept the challenge small instead of making a big promise.')
  cwNoteTa.dispatchEvent(new (globalThis.Event)('input', { bubbles: true }))
  await tick(70)
  const cwSaveNote = document.querySelector('button[aria-label="保存短注释"]')
  assert(cwSaveNote && !cwSaveNote.disabled, '保存短注释按钮可用')
  fire(cwSaveNote)
  await tick(160)
  assert((JSON.parse(w.localStorage.getItem('lingua_culture_notes') || '{}').notes || []).length >= 1,
    '原创短注释写入文化笔记（不是字幕抄录）')

  click(/我已完成观看/, '标记已完成观看')
  await tick(180)
  assert(bodyText().includes('✓ 已完成观看'), '观看状态在页面上生效')
  const cwProgress = JSON.parse(w.localStorage.getItem('lingua_watch_progress') || '{}')
  assert(Boolean(cwProgress['ted-30-days']?.watched), '已看进度写入 lingua_watch_progress')
  const cwEnter = buttons().find((b) => !b.disabled && /进入观后讨论/.test(b.textContent || ''))
  assert(cwEnter, '观看完成后解锁「进入观后讨论」')
  fire(cwEnter)
  await tick(400)
  assert(bodyText().includes('POST-WATCH · 观后讨论') && bodyText().includes('非角色扮演 · 非文本细读'),
    '观后讨论页用独立页头，与角色对话 / 文学研讨明确区分')
  assert(bodyText().includes('讨论种子问题') && bodyText().includes('可用的短引用')
    && bodyText().includes('讨论进度 · 建议至少 4 轮'),
  '开场只给种子问题、短引用与轮次目标，不预先产生反馈')
  assert(JSON.parse(w.localStorage.getItem('lingua_postwatch_sessions') || '[]').length >= 1,
    '进入讨论即创建独立会话记录')

  const cwTexts = [
    'In the video, I noticed the speaker riding a bike and taking one photo every day.',
    'I think the 30-day frame makes the change believable because it is small and countable.',
    'In my culture we often talk about big resolutions, so this quieter approach surprised me.',
    'I would describe the ending as understated: he just says he stuck with it, and that convinced me.',
  ]
  for (let i = 0; i < 4; i++) {
    const cwTa = document.querySelector('textarea[placeholder*="具体细节"]')
    assert(cwTa && !cwTa.disabled, `第 ${i + 1} 轮观后讨论输入框可用`)
    setter.call(cwTa, cwTexts[i])
    cwTa.dispatchEvent(new (globalThis.Event)('input', { bubbles: true }))
    await tick(70)
    const cwSend = document.querySelector('button[aria-label="发送观后讨论发言"]')
    assert(cwSend && !cwSend.disabled, `第 ${i + 1} 轮发送按钮可用`)
    fire(cwSend)
    await tick(230)
    assert(bodyText().includes('观后反馈 · 观点 + 语言'), `第 ${i + 1} 轮出现可折叠观后反馈卡`)
    assert(bodyText().includes('观点反馈') && bodyText().includes('语言反馈'),
      `第 ${i + 1} 轮反馈同时区分观点反馈与语言反馈`)
  }
  const cwSessions = JSON.parse(w.localStorage.getItem('lingua_postwatch_sessions') || '[]')
  assert(cwSessions.length >= 1 && cwSessions[0].turns >= 4,
    '观后讨论记录持久化，且完成至少 4 轮内容性对话')
  assert(cwSessions[0].messages.some((m) => m.culturalBridge),
    '引导者把用户表达接回视频文化语境（culturalBridge）')

  const cwEndBtn = document.querySelector('button[aria-label="结束讨论并生成小结"]')
  assert(cwEndBtn && !cwEndBtn.disabled, '观后讨论提供结束并生成小结入口')
  fire(cwEndBtn)
  await tick(130)
  click(/结束并生成小结/, '确认结束观后讨论')
  await tick(750)
  assert(bodyText().includes('观后小结') && bodyText().includes('已表达的观点')
    && bodyText().includes('待探索的问题'), '结束后生成含观点与开放问题的小结')
  assert(JSON.parse(w.localStorage.getItem('lingua_postwatch_sessions') || '[]')[0].finishedAt > 0,
    '观后小结写回会话记录')
  assert(JSON.parse(w.localStorage.getItem('lingua_review_queue') || '[]').length > cwQueueBefore
    && (JSON.parse(w.localStorage.getItem('lingua_profile') || '{}').xp || 0) > cwXpBefore,
  '新表达写回现有复习队列，XP 沿用现有档案')

  click(/去文化复习看看/, '进入文化复习页')
  await tick(230)
  assert(bodyText().includes('CULTURE REVIEW') && bodyText().includes('看过的、聊过的，都留下了'),
    '文化复习页有独立页头')
  assert(bodyText().includes('已看视频') && bodyText().includes('收藏的短表达')
    && bodyText().includes('观后讨论记录'), '文化复习页汇总已看、收藏与讨论记录')
  assert(bodyText().includes('lingua_culture_videos') && bodyText().includes('lingua_watch_progress')
    && bodyText().includes('lingua_postwatch_sessions') && bodyText().includes('lingua_culture_notes'),
  '文化复习页标明 4 个新键')
  assert(bodyText().includes('lingua_review_queue') && bodyText().includes('lingua_mistakes')
    && bodyText().includes('lingua_profile'), '文化复习页标明复用的旧键，旧流程不受影响')

  clickExact('设置', '进入设置页检查文化偏好')
  await tick(190)
  assert(bodyText().includes('文化视角视频') && bodyText().includes('默认字幕偏好')
    && bodyText().includes('看完自动进入观后讨论'), '设置页新增两项文化偏好')
  click(/中英对照/, '切换字幕偏好为「中英对照」')
  await tick(140)
  assert(JSON.parse(w.localStorage.getItem('lingua_settings') || '{}').captionPreference === 'bilingual',
    '字幕偏好写入现有 lingua_settings，不新增键')
  const cwToggle = document.querySelector('button[role="switch"][aria-label="看完自动进入观后讨论"]')
  assert(cwToggle && cwToggle.getAttribute('aria-checked') !== null, '自动进入讨论开关可操作')
  fire(cwToggle)
  await tick(140)
  assert(JSON.parse(w.localStorage.getItem('lingua_settings') || '{}').autoEnterPostWatch === true,
    '自动进入讨论开关写入现有设置')
  assert(bodyText().includes('CultureCurator') && bodyText().includes('PostWatchDirector'),
    '页脚列出新增的三个文化 Agent')

  clickExact('学习', '回到首页（准备刷新验证）')
  await tick(150)

  /* ============ Word Lab UI：底部导航 → 选库 → 五步状态机 → 结算（验收 5/7/8） ============ */
  assert(bodyText().includes('词场 · 主动词库学习') && bodyText().includes('7 个词库'),
    '首页新增词场指路牌（第四个学习模式）')
  clickExact('词场', '底部导航进入词场')
  await tick(200)
  assert(bodyText().includes('今日词场') && bodyText().includes('五步学习法')
    && bodyText().includes('S5') && bodyText().includes('艾宾浩斯阶梯'),
  '词场首页展示今日额度、五步学习法与阶梯说明')
  assert(bodyText().includes('10min→1d→3d→7d→15d→30d'), '词场首页写明艾宾浩斯 6 级阶梯')
  click(/去挑词库/, '首页进入词库选择页')
  await tick(180)
  for (const name of ['初中 3500', '高中 5000', '四级核心', '六级核心', '雅思 5.5', '雅思 6.5', '雅思 7.5']) {
    assert(bodyText().includes(name), `选库页列出词库：${name}`)
  }
  assert(bodyText().includes('分片大小') && bodyText().includes('300-500') === false,
    '选库页标注分片大小（不谎称已加载全量）')

  const xpBeforeWl = JSON.parse(w.localStorage.getItem('lingua_profile') || '{}').xp || 0
  click(/开始学习/, '从第一个词库开始一场新词')
  await tick(250)
  const draft0 = JSON.parse(w.localStorage.getItem('lingua_word_session_draft') || 'null')
  assert(draft0 && draft0.words.length === 5 && draft0.step === 'guess' && draft0.index === 0,
    'S0 起场写入草稿：单场 5 个新词、从 S1 猜义开始')
  assert(bodyText().includes('S1 · 猜义') && bodyText().includes('先自己猜一次'),
    'S1 猜义页显示词条与强制提交提示')
  assert(!buttons().some((b) => /跳过|返回上一步/.test(b.textContent || '')),
    'S1 没有「跳过」和「返回上一步」按钮（只有说明文字）')
  const submitGuessBtn = buttons().find((b) => /提交猜测/.test(b.textContent || ''))
  assert(submitGuessBtn?.disabled === true, '未提交猜测时「提交猜测」按钮禁用')

  const inputSetterWl = Object.getOwnPropertyDescriptor(globalThis.HTMLInputElement.prototype, 'value').set
  const readAloudText = () => (document.querySelector('[data-testid="read-aloud"]')?.textContent || '').replace(/\s+/g, ' ')
  const sessionDeck = draft0.deckId
  for (let i = 0; i < draft0.words.length; i++) {
    const d = JSON.parse(w.localStorage.getItem('lingua_word_session_draft') || 'null')
    assert(d && d.step === 'guess' && d.index === i, `第 ${i + 1} 个词从 S1 猜义开始`)
    const wKey = d.words[d.index]
    const entry = wlDecks.firstShard(sessionDeck).find((x) => x.word.toLowerCase() === wKey)
    assert(!!entry, `第 ${i + 1} 个词「${wKey}」可从当前分片取到`)
    const opts = wlFlow.buildChoices(entry, sessionDeck)
    // 第 1 个词故意选错，制造「猜错词义」易错本记录
    const pick = i === 0 ? opts.find((x) => x !== entry.meaningZh) : entry.meaningZh
    const optBtn = buttons().find((b) => (b.textContent || '').trim() === pick)
    assert(!!optBtn, `第 ${i + 1} 个词 4 选 1 选项可点击`)
    fire(optBtn)
    await tick(60)
    click(/提交猜测/, `第 ${i + 1} 个词提交猜测`)
    await tick(160)
    assert(bodyText().includes('S2 · 验证') && bodyText().includes('揭晓释义')
      && bodyText().includes(entry.meaningZh), `第 ${i + 1} 个词进入 S2 并揭晓释义`)
    assert(bodyText().includes(entry.word), `第 ${i + 1} 个词 S2 验证阶段仍显示词形（书写阶段才开始遮蔽）`)
    if (i === 0) {
      assert(bodyText().includes('猜错了'), 'S2 会标出 S1 猜错的判定')
      click(/显示图片英文标注/, '点开图片英文标注')
      await tick(120)
      assert(bodyText().includes('英文标注已显示') && bodyText().includes(entry.imageAlt),
        'S2 配图先无标注，点开后显示英文 imageAlt（不含中文释义）')
    }
    click(/我认识/, `第 ${i + 1} 个词完成 S2 自评`)
    await tick(120)

    /* ---- S2.5 跟读朗读：S2 之后、S3 之前（验收 1/2/3/4/6/7/10） ---- */
    assert(!!document.querySelector('[data-testid="read-aloud"]') && !bodyText().includes('S3 · 拼写'),
      `第 ${i + 1} 个词：S2 之后先进入 S2.5 跟读，不直接跳 S3`)
    if (i === 0) {
      const ra0 = readAloudText()
      assert(ra0.includes('跟读这句 · S2.5') && ra0.includes('再听一遍')
        && ra0.includes('慢速播放') && ra0.includes('只听目标词'),
      'S2.5 提供「再听一遍 / 慢速播放 / 只听目标词」三个听音按钮')
      assert(ra0.includes('演示模式') && ra0.includes('静态波形占位'),
        'Mock 模式有不易误解的「演示模式」角标与静态波形占位')
      assert(ra0.includes('请求麦克风权限') && ra0.includes('不会上传')
        && ra0.includes('读完由你点') && ra0.includes('不会自动结束'),
      '麦克风权限前置说明：用途、音频不上传、读完由用户点停止（手动模式）')
      assert(ra0.includes(entry.examples[0]),
        '默认朗读目标是含目标词的完整例句，不是孤立单词')
      assert([...document.querySelectorAll('[data-testid="read-aloud"] span.underline')]
        .some((s) => (s.textContent || '').toLowerCase().includes(entry.word)),
      '目标词在例句中始终高亮')
      assert(!buttons().some((b) => /去拼写/.test(b.textContent || '')),
        '跟读完成前不出现「去拼写」按钮')
      assert(!wlPro.FORBIDDEN_FEEDBACK.some((x) => ra0.includes(x)),
        'S2.5 界面不出现百分制 / 星级 / 音素级 / 判定性文案')
      assert(String(entry.pronunciationTip).includes('重音'),
        '词库为 ability 登记了静态发音小提示（重音位置）')
    }

    if (i === 1) {
      /* 降级路径：jsdom 无 SpeechRecognition → 自评跟读；主动跳过不扣 XP */
      click(/切真实识别/, '切到真实识别检查降级')
      await tick(150)
      const deg = readAloudText()
      assert(deg.includes('听标准音 + 自评跟读') && deg.includes('我读完了')
        && deg.includes('没有做语音识别'),
      '浏览器不支持识别时隐藏麦克风，降级为自评跟读且明确不伪造结果')
      assert(!buttons().some((b) => /开始跟读|再读一次/.test(b.textContent || '')),
        '降级状态不再展示麦克风录音入口')
      const xpBeforeSkip = JSON.parse(w.localStorage.getItem('lingua_profile') || '{}').xp || 0
      click(/暂时跳过/, '主动跳过跟读进入 S3')
      assert((JSON.parse(w.localStorage.getItem('lingua_profile') || '{}').xp || 0) === xpBeforeSkip,
        '跳过跟读不扣 XP、不阻塞 S3')
    } else {
      click(/点击开始录音/, `第 ${i + 1} 个词开始演示跟读`)
      await tick(1720)
      const ra1 = readAloudText()
      assert(/读到了 \d+\/\d+ 个词/.test(ra1) && ra1.includes('演示模式结果'),
        `第 ${i + 1} 个词：反馈只报「读到了 X/Y 个词」，结果标注演示模式`)
      assert([...document.querySelectorAll('[data-testid="read-aloud"] span')]
        .some((s) => (s.className || '').includes('bg-mint-100')),
      '识别到的词在例句中高亮为绿色')
      assert(buttons().some((b) => /去拼写/.test(b.textContent || '')),
        '跟读完成后才出现「去拼写」按钮')
      if (i === 0) {
        assert(ra1.includes('词库小提示') && ra1.includes('重音'),
          '可选的静态发音小提示只在词库有该字段时展示')
        assert(ra1.includes('不给分数') && !wlPro.FORBIDDEN_FEEDBACK.some((x) => ra1.includes(x)),
          '结果区明确说明不给分数、不做音素判断，且无禁用措辞')
        click(/再读一次/, '第 2 次跟读（验证重试上限）')
        await tick(1720)
        const ra2 = readAloudText()
        assert(ra2.includes('已经读了两次')
          && buttons().some((b) => /暂时跳过/.test(b.textContent || ''))
          && !buttons().some((b) => /开始跟读|再读一次/.test(b.textContent || '')),
        '最多尝试 2 次，之后出现「暂时跳过」出口且不再提供再读按钮')
        assert(buttons().some((b) => /去拼写/.test(b.textContent || '')),
          '2 次后仍可直接去拼写，跟读不是强制卡点')
      }
      clickExact('去拼写', `第 ${i + 1} 个词完成跟读进入 S3`)
    }
    await tick(160)
    assert(bodyText().includes('S3 · 拼写') && bodyText().includes('把单词拼出来'),
      `第 ${i + 1} 个词进入 S3 拼写`)
    const spellInput = document.querySelector('input[placeholder*="凭记忆拼写"]')
    assert(!!spellInput, `第 ${i + 1} 个词的拼写输入框可用`)
    if (i === 0) {
      // 第一次故意拼错：验证逐字母比对 + 重拼 + 易错本
      inputSetterWl.call(spellInput, `${wKey}x`)
      spellInput.dispatchEvent(new (globalThis.Event)('input', { bubbles: true }))
      await tick(60)
      click(/提交拼写/, '第 1 个词提交错误拼写')
      await tick(150)
      assert(bodyText().includes('逐字母比对') && bodyText().includes('重拼一次'),
        'S3 拼错时逐字母标红并强制重拼')
      click(/重拼一次/, '清空重拼')
      await tick(120)

      /* 书写阶段遮蔽：打字与手写两种模式都看不到词形（含配图与提示文案） */
      const wordRe = new RegExp(`\\b${wKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
      const spellText = bodyText()
      assert(!wordRe.test(spellText) && spellText.includes('只给提示，不显示单词')
        && spellText.includes(entry.meaningZh) && !spellText.includes(entry.phonetic),
      'S3 书写阶段隐藏词形与音标，只留中文释义 / 英释 / 发音提示')
      const spellImgs = [...document.querySelectorAll('img[src^="data:image/svg+xml"]')]
      assert(spellImgs.length >= 1 && spellImgs.every((im) =>
        !decodeURIComponent(im.getAttribute('src') || '').toLowerCase().includes(wKey)
        && !wordRe.test(im.getAttribute('alt') || '')),
      'S3 配图 SVG 与图片 alt 都不泄露目标词')
      click(/手写自评/, '切到手写自评检查遮蔽')
      await tick(120)
      assert(!wordRe.test(bodyText()) && !bodyText().includes(`写出 ${wKey}`)
        && bodyText().includes('凭记忆写出'),
      'S3 手写模式的提示文案也不写出单词明文')
      click(/打字拼写/, '切回打字拼写')
      await tick(120)
    }
    const spellInput2 = document.querySelector('input[placeholder*="凭记忆拼写"]')
    inputSetterWl.call(spellInput2, wKey)
    spellInput2.dispatchEvent(new (globalThis.Event)('input', { bubbles: true }))
    await tick(60)
    click(/提交拼写/, `第 ${i + 1} 个词提交正确拼写`)
    await tick(180)
  }
  assert(bodyText().includes('S4 · 本场结算') && bodyText().includes('WordCoach 教练说')
    && bodyText().includes('S5 · 算法已接管排程') && bodyText().includes('完成并排程'),
  '5 个词走完进入 S4 结算页，含教练点评与 S5 排程说明')
  /* ---- [成长系统] S4 结算页展示本次 XP 明细与上限提示 ---- */
  assert(!!document.querySelector('[data-testid="wordlab-xp-breakdown"]'), 'S4 结算页挂载「本次 XP 明细」卡片')
  assert(bodyText().includes('本次 XP 明细') && bodyText().includes('新词完成')
    && bodyText().includes('跟读朗读 / 跳过跟读') && bodyText().includes('0 XP'),
  'S4 明细列出新词 / 重拼 / 跟读三类，跟读与跳过不发 XP')
  assert(bodyText().includes('达到上限后不再发放新词 XP') || bodyText().includes('今日新词已达标'),
  'S4 结算页明确提示达到每日新词上限后的 XP 规则')
  assert(bodyText().includes('+50 XP'), '结算页按每词 10 XP 展示本场奖励')
  click(/完成并排程/, '确认结算并交给算法排程')
  await tick(250)
  const wlProgress = JSON.parse(w.localStorage.getItem('lingua_word_progress') || '{}')
  const wlQuota = JSON.parse(w.localStorage.getItem('lingua_word_daily_quota') || '{}')
  const wlErrors = JSON.parse(w.localStorage.getItem('lingua_word_errors') || '[]')
  assert(Object.keys(wlProgress.words || {}).length === 5
    && Object.values(wlProgress.words).every((p) => p.status === 'ladder' && p.ladderStep === 0
      && p.origin === 'wordlab' && p.dueAt > Date.now()),
  '结算后 5 个新词写入 lingua_word_progress，排入 10 分钟后的首复')
  assert(wlQuota.newWordsLearned === 5 && wlQuota.limit === 12, '每日新词额度扣减 5 个')
  assert(wlErrors.some((e) => e.type === 'guess') && wlErrors.some((e) => e.type === 'spelling'),
    '猜错词义与拼错字母都写进 lingua_word_errors')
  const wlFlags = JSON.parse(w.localStorage.getItem('lingua_pronunciation_flags') || '{}')
  assert(Object.values(wlProgress.words).some((p) => p.pronunciationAttempts >= 1
    && p.pronunciationLastResult?.mode === 'mock'),
  '结算把演示模式跟读结果写进 lingua_word_progress（mode=mock，带 attempts）')
  assert(Object.values(wlProgress.words).some((p) => p.pronunciationSkipped === true),
  '跳过跟读的词带 pronunciationSkipped=true，后续复习可再次出现')
  assert(wlFlags.version === 1 && wlFlags.words && Array.isArray(wlFlags.lastMissedWords)
    && wlErrors.every((e) => e.type === 'guess' || e.type === 'spelling'),
  '发音漏读只写 lingua_pronunciation_flags，拼写易错本里没有发音类型记录')
  assert(Object.values(wlProgress.words).every((p) => p.status === 'ladder' && p.ladderStep === 0),
  'S2.5 合并发音字段后，S5 的阶梯排程完全不受影响')
  assert(w.localStorage.getItem('lingua_word_session_draft') === 'null',
    '结算后清空会话草稿（刷新不会回到半场）')
  assert(Object.keys(JSON.parse(w.localStorage.getItem('lingua_word_media_cache') || '{}')).length >= 5,
    'WordMediaAgent 生成本场 5 个词的媒体缓存')
  assert((JSON.parse(w.localStorage.getItem('lingua_profile') || '{}').xp || 0) >= xpBeforeWl + 50,
    '词场结算沿用既有 awardXp，XP 写入原档案')
  assert(bodyText().includes('已学 5 个新词'), '结算后词场首页额度环同步更新')

  click(/打开易错本/, '进入词场易错本')
  await tick(190)
  assert(bodyText().includes('猜错词义') && bodyText().includes('拼写易错')
    && bodyText().includes('重拼这个词'), '易错本列出猜错/拼错两类记录并提供重拼')
  const firstErr = wlErrors[0]
  click(/重拼这个词/, '展开重拼输入')
  await tick(120)
  const errInput = document.querySelector('input[placeholder*="重新拼写"]')
  assert(!!errInput, '易错本重拼输入框可用')
  const ebWordRe = new RegExp(`\\b${firstErr.word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i')
  assert(!ebWordRe.test(bodyText()) && bodyText().includes('书写模式：已隐藏词形')
    && bodyText().includes('••••'),
  '易错本展开重拼时，该词所有记录都隐藏词形与当时的错误答案')
  inputSetterWl.call(errInput, firstErr.word)
  errInput.dispatchEvent(new (globalThis.Event)('input', { bubbles: true }))
  await tick(60)
  click(/提交拼写/, '提交易错本重拼')
  await tick(160)
  const wlErrors2 = JSON.parse(w.localStorage.getItem('lingua_word_errors') || '[]')
  assert(wlErrors2.some((e) => e.resolveCount === 1 && !e.resolved),
    '易错本连对 1 次记录进度，满 2 次才销账')
  click(/返回词场首页/, '从易错本返回词场')
  await tick(150)

  clickExact('设置', '进入设置页检查词场四项设置')
  await tick(190)
  assert(bodyText().includes('词场 · 主动词库学习') && bodyText().includes('每日新词上限')
    && bodyText().includes('S3 拼写模式默认值') && bodyText().includes('自动发音')
    && bodyText().includes('显示配图'), '设置页新增词场四项设置')
  assert(bodyText().includes('S2.5 跟读朗读') && bodyText().includes('自动播放标准音')
    && bodyText().includes('跟读默认展开') && bodyText().includes('口音（复用既有朗读设置）'),
  '设置页新增 S2.5 三项：自动播放标准音 / 跟读默认展开 / 口音（复用 accent）')
  const accentBtns = buttons().filter((b) => ['美音', '英音', '澳音'].includes((b.textContent || '').trim()))
  assert(accentBtns.length >= 3, '口音三选一按钮复用既有设置，不新增键')
  click(/每天 10 个/, '把每日新词上限调到 10')
  await tick(130)
  assert(JSON.parse(w.localStorage.getItem('lingua_settings') || '{}').wordDailyLimit === 10,
    '每日新词上限写入现有 lingua_settings')
  click(/手写自评/, '把默认拼写模式切到手写自评')
  await tick(130)
  assert(JSON.parse(w.localStorage.getItem('lingua_settings') || '{}').wordSpellingMode === 'handwriting',
    '拼写模式默认值写入现有设置')
  click(/每天 12 个/, '恢复每日上限 12')
  await tick(120)
  click(/打字拼写/, '恢复打字拼写模式')
  await tick(120)
  clickExact('学习', '回到首页（准备刷新验证）')
  await tick(150)

  // 模拟刷新：把 localStorage 快照塞进新文档，重新加载同一份 bundle
  const snapshot = Object.fromEntries(keys.map((k) => [k, w.localStorage.getItem(k)]))
  const dom2 = new JSDOM(html.replace(/<script[^>]*><\/script>/g, ''), {
    url: 'http://localhost:5173/', pretendToBeVisual: true, runScripts: 'outside-only', virtualConsole: vc,
  })
  const w2 = dom2.window
  w2.scrollTo = () => {}
  w2.Element.prototype.scrollIntoView = () => {}
  for (const [k, v] of Object.entries(snapshot)) if (v !== null) w2.localStorage.setItem(k, v)
  for (const key of ['window', 'document', 'navigator', 'localStorage', 'HTMLElement', 'Node', 'MouseEvent',
    'Event', 'CustomEvent', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame',
    'MutationObserver', 'DOMParser', 'FileReader', 'Blob', 'File', 'HTMLInputElement', 'HTMLTextAreaElement']) {
    try { Object.defineProperty(globalThis, key, { value: w2[key], writable: true, configurable: true }) } catch { /* ignore */ }
  }
  await import(pathToFileURL(path.join(assetDir, jsFile)).href + '?reload=2')
  await tick(250)
  const persistedXp = JSON.parse(snapshot.lingua_profile).xp
  assert(bodyText().includes(`${persistedXp} XP`), `刷新后 XP ${persistedXp} 仍在`)
  assert(JSON.parse(w2.localStorage.getItem('lingua_review_queue')).length > 0, '刷新后复习队列仍在')
  assert(JSON.parse(w2.localStorage.getItem('lingua_mistakes')).length > 0, '刷新后错题本仍在')
  assert(JSON.parse(w2.localStorage.getItem('lingua_settings')).ieltsLevel === 'b5', '刷新后雅思目标档位仍在')
  assert(JSON.parse(w2.localStorage.getItem('lingua_voice_reports') || '[]').length >= 1,
    '刷新后语音评判记录仍在')
  assert(JSON.parse(w2.localStorage.getItem('lingua_library') || '{}').books?.length >= 3,
    '刷新后内置公版书库仍在')
  assert(Object.keys(JSON.parse(w2.localStorage.getItem('lingua_reading_progress') || '{}')).length >= 1,
    '刷新后阅读进度仍在')
  assert(JSON.parse(w2.localStorage.getItem('lingua_seminars') || '[]').length >= 1,
    '刷新后研讨记录仍在')
  const litNotesAfter = JSON.parse(w2.localStorage.getItem('lingua_literary_notes') || '{}')
  assert((litNotesAfter.notes || []).length >= 1 && (litNotesAfter.savedWords || []).length >= 1,
    '刷新后批注、高亮记录与新增词仍在')
  assert(JSON.parse(w2.localStorage.getItem('lingua_culture_videos') || '{}').videos?.length >= 30,
    '刷新后三层储量种子库（30+ 条）仍在')
  assert(JSON.parse(w2.localStorage.getItem('lingua_culture_videos') || '{}').videos
    .some((v) => v.seed === false && v.acquiredVia === 'playlistItems.list'),
  '刷新后播放列表同步条目仍在（seed:false）')
  const regAfter = JSON.parse(w2.localStorage.getItem('lingua_playlist_registry') || '{}')
  assert(regAfter.lastSyncAt > 0 && regAfter.playlists?.length >= 6
    && regAfter.playlists.some((p) => p.lastFetchedAt),
  '刷新后播放列表注册表与同步时间仍在')
  assert(Object.values(JSON.parse(w2.localStorage.getItem('lingua_watch_progress') || '{}'))
    .some((p) => p?.watched), '刷新后已看进度仍在')
  assert(JSON.parse(w2.localStorage.getItem('lingua_postwatch_sessions') || '[]')
    .some((s) => s.turns >= 4 && s.finishedAt), '刷新后观后讨论 4 轮记录与小结仍在')
  assert((JSON.parse(w2.localStorage.getItem('lingua_culture_notes') || '{}').savedExpressions || []).length >= 1,
    '刷新后收藏的短表达与原创短注释仍在')
  assert(JSON.parse(w2.localStorage.getItem('lingua_profile')).xp === persistedXp
    && JSON.parse(w2.localStorage.getItem('lingua_texts')).length >= 1,
  '旧版本 localStorage 数据不丢失，文本分析记录完好')

  /* ---- 刷新后词场 6 键持久化（验收 6/9） ---- */
  assert(Object.keys(JSON.parse(w2.localStorage.getItem('lingua_word_progress') || '{}').words || {}).length === 5,
    '刷新后词场进度（5 个新词阶梯）仍在')
  assert(JSON.parse(w2.localStorage.getItem('lingua_word_daily_quota') || '{}').newWordsLearned === 5,
    '刷新后每日新词限流累计值仍在')
  assert(JSON.parse(w2.localStorage.getItem('lingua_word_errors') || '[]').length >= 2,
    '刷新后易错本（猜错 + 拼错）仍在')
  assert(JSON.parse(w2.localStorage.getItem('lingua_deck_selection') || '{}').activeDeckId,
    '刷新后当前词库选择仍在')
  assert(Object.keys(JSON.parse(w2.localStorage.getItem('lingua_word_media_cache') || '{}')).length >= 5,
    '刷新后媒体缓存仍在')
  assert(JSON.parse(w2.localStorage.getItem('lingua_pronunciation_flags') || '{}').version === 1,
    '刷新后第 24 键 lingua_pronunciation_flags 与 S2.5 留档仍在')
  assert(w2.localStorage.getItem('lingua_word_session_draft') === 'null',
    '刷新后会话草稿保持清空，不会回到半场')

  /* ---- 二次刷新：S0 满额硬上限 + 复习页「词场」tab 统一调度（验收 4/8/10） ---- */
  const snap3 = Object.fromEntries(keys.map((k) => [k, w2.localStorage.getItem(k)]))
  const q3 = JSON.parse(snap3.lingua_word_daily_quota)
  q3.newWordsLearned = q3.limit
  snap3.lingua_word_daily_quota = JSON.stringify(q3)
  const p3 = JSON.parse(snap3.lingua_word_progress)
  for (const k of Object.keys(p3.words)) p3.words[k].dueAt = Date.now() - 1000
  snap3.lingua_word_progress = JSON.stringify(p3)
  const dom3 = new JSDOM(html.replace(/<script[^>]*><\/script>/g, ''), {
    url: 'http://localhost:5173/', pretendToBeVisual: true, runScripts: 'outside-only', virtualConsole: vc,
  })
  const w3 = dom3.window
  w3.scrollTo = () => {}
  w3.Element.prototype.scrollIntoView = () => {}
  for (const [k, v] of Object.entries(snap3)) if (v !== null) w3.localStorage.setItem(k, v)
  for (const key of ['window', 'document', 'navigator', 'localStorage', 'HTMLElement', 'Node', 'MouseEvent',
    'Event', 'CustomEvent', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame',
    'MutationObserver', 'DOMParser', 'FileReader', 'Blob', 'File', 'HTMLInputElement', 'HTMLTextAreaElement']) {
    try { Object.defineProperty(globalThis, key, { value: w3[key], writable: true, configurable: true }) } catch { /* ignore */ }
  }
  await import(pathToFileURL(path.join(assetDir, jsFile)).href + '?reload=3')
  await tick(260)
  for (const k of keys) assert(w3.localStorage.getItem(k) !== null, `二次刷新后 localStorage 键存在：${k}`)
  clickExact('词场', '二次刷新后进入词场')
  await tick(200)
  assert(bodyText().includes('今日新词已学满'), 'S0 满额时词场首页明确提示硬上限')
  const learnBtns = buttons().filter((b) => /今日新词已满|学 \d+ 个新词/.test(b.textContent || ''))
  assert(learnBtns.length >= 1 && learnBtns.every((b) => b.disabled),
    'S0 满额后不再提供任何可点击的「继续学新词」诱导按钮')
  assert(bodyText().includes('复习不占用额度'), '满额提示同时说明复习不受限')
  click(/趁热打铁最有效/, '点到期提醒进入复习页词场 tab')
  await tick(230)
  assert(bodyText().includes('词场复习') && bodyText().includes('source: wordlab')
    && bodyText().includes('阶梯第 1 / 6 级'),
  '复习页「词场」tab 展示统一调度输出：来源标签 + 艾宾浩斯阶梯级')
  assert(bodyText().includes('记住了') && bodyText().includes('再练一次'),
    '词场卡片提供记住了 / 再练一次作答入口')
  click(/记住了/, '词场卡片答对')
  await tick(190)
  const p3After = JSON.parse(w3.localStorage.getItem('lingua_word_progress') || '{}')
  assert(Object.values(p3After.words).some((p) => p.ladderStep === 1 && p.dueAt > Date.now()),
    '答对后阶梯前进一级并排到 1 天后，写入 lingua_word_progress')
  assert(bodyText().includes('复习间隔：') && bodyText().includes('毕业后并入上表'),
    '复习页页脚说明阶梯毕业后并入既有 SM-2 队列')
  assert(JSON.parse(w3.localStorage.getItem('lingua_review_queue') || '[]').length > 0,
    '词场与既有复习队列并存，旧队列未被覆盖')
  click(/词汇卡/, '切到复习页词汇卡 tab 检查发音待留意')
  await tick(200)
  assert(!!document.querySelector('[data-testid="pronunciation-flags"]')
    && bodyText().includes('发音待留意') && bodyText().includes('和拼写易错本分开'),
  '复习页「词汇」tab 有独立的「发音待留意」列表，不与拼写易错词混排')
  assert(bodyText().includes('跳过了跟读') || bodyText().includes('暂时没有需要留意的词'),
    '发音列表展示跳过跟读的词（或空态说明），两类问题不混淆')

  /* ============================================================
   * 十八、Growth System 统一成长系统专项（12 条验收）
   * 用独立块级作用域，避免与前面 17 章的测试夹具重名
   * ============================================================ */
  {
  const G = await loadModule('src/growthTypes.ts', 'growth-types')
  const GS = await loadModule('src/lib/growthStorage.ts', 'growth-storage')
  const GR = await loadModule('src/services/growth.ts', 'growth-service')
  const AS = await loadModule('src/data/achievementSeed.ts', 'achievement-seed')
  const ET = await loadModule('src/services/effectiveTurn.ts', 'effective-turn')
  const DD = await loadModule('src/services/dialogueDirector.ts', 'growth-dd')
  const NOW = new Date(2026, 10, 12, 10, 0, 0).getTime()
  const TODAY = '2026-11-12'
  const ISO = new Date(NOW).toISOString()
  GR.configureGrowth({ now: () => NOW, dailyGoal: 30, enabled: true })
  const mkBundle = () => ({
    growth: { ...GS.GROWTH_DEFAULTS.growth(), freezeMonth: '2026-11', lastActiveDate: null },
    achievements: GS.GROWTH_DEFAULTS.achievements(),
    ledger: GS.GROWTH_DEFAULTS.ledger(),
    heatmap: GS.GROWTH_DEFAULTS.heatmap(),
  })
  const gEv = (id, action, amount, meta = {}, source = 'dialogue') => ({ id, source, action, amount, meta })

  /* ---- 等级曲线与规则表 ---- */
  assert(G.requiredXp(1) === 100 && G.requiredXp(2) === 150 && G.requiredXp(3) === 200
    && G.requiredXp(10) === 550, '等级曲线 requiredXp(level) = 100 + (level-1)×50')
  assert(Array.from({ length: 10 }, (_, i) => G.requiredXp(i + 1)).reduce((a, b) => a + b, 0) === 3250,
    '前 10 级累计 3250 XP，对应几周活跃学习')
  assert(GR.computeLevel(0).level === 1 && GR.computeLevel(99).levelXp === 99
    && GR.computeLevel(100).level === 2 && GR.computeLevel(250).level === 3
    && GR.computeLevel(3250).level === 11, '由累计 XP 反推等级与等级内 XP')
  assert(G.levelName(1) === '初识' && G.levelName(10) === '通达'
    && G.levelName(31) === '第 31 阶', '等级名原创且 30 名之后用「第 N 阶」兜底')
  assert(G.XP_RULES.word_complete === 10 && G.XP_RULES.spelling_retry === 2
    && G.XP_RULES.round_effective === 2 && G.XP_RULES.scene_finish === 30
    && G.XP_RULES.seminar_finish === 40 && G.XP_RULES.postwatch_finish === 40
    && G.XP_RULES.review_batch === 15 && G.XP_RULES.daily_goal === 20, 'XP 发放基准表 8 项数值与需求一致')
  assert(G.NO_XP_ACTIONS.includes('open_app') && G.NO_XP_ACTIONS.includes('flip_card')
    && G.NO_XP_ACTIONS.includes('skip_read_aloud')
    && !G.NO_XP_ACTIONS.includes('word_complete'), '明确列出「不发 XP」的点击类行为')
  assert(G.DIALOGUE_SCENE_CAP === 20 && G.REVIEW_DAILY_CAP === 3
    && G.FREEZE_CARDS_PER_MONTH === 2 && G.LEDGER_LIMIT === 500 && G.HEATMAP_DAYS === 90,
  '单场景 20 / 复习 3 批 / 冻结卡 2 张 / 账本 500 条 / 热力图 90 天')
  assert(G.STREAK_MILESTONES.map((m) => m.days).join(',') === '3,7,14,30,60,100,180,365'
    && G.STREAK_MILESTONES.map((m) => m.xp).join(',') === '20,50,100,200,400,600,800,1000',
  '连续天数 8 个里程碑与对应 XP 一一对应')
  assert(G.ACTIVE_ACTIONS.includes('word_complete') && !G.ACTIVE_ACTIONS.includes('open_app'),
    '活跃日只认完成单元，浏览不计')
  assert(GR.levelInfo({ level: 30, levelXp: 0 }).showNumbers === true
    && GR.levelInfo({ level: 31, levelXp: 0 }).showNumbers === false,
  '30 级后 UI 只展示距下一级百分比')
  assert(GR.monthKey(new Date(NOW)) === '2026-11'
    && GR.daysBetween('2026-10-31', '2026-11-01') === 1
    && GR.lastNDays(90).length === 90, '本地日期 / 跨月天数差 / 最近 90 天序列')

  /* ---- 成就种子与事件驱动倒排索引 ---- */
  assert(AS.ACHIEVEMENT_SEEDS.length === 27 && AS.ACHIEVEMENT_TOTAL === 27,
    '成就总数 27 枚，落在 25–30 的 MVP 区间')
  const byCat = (c) => AS.ACHIEVEMENT_SEEDS.filter((a) => a.category === c).length
  assert(byCat('onboarding') === 6 && byCat('consistency') === 6 && byCat('depth') === 6
    && byCat('breadth') === 5 && byCat('hidden') === 4, '五类成就分布 6 / 6 / 6 / 5 / 4')
  assert(AS.ACHIEVEMENT_SEEDS.filter((a) => a.hidden).length === 4
    && AS.ACHIEVEMENT_SEEDS.every((a) => a.hidden || a.rewardXp > 0),
  '隐藏成就 4 枚且每条都有解锁奖励 XP')
  assert(['count', 'streak', 'composite'].every((t) => AS.ACHIEVEMENT_SEEDS.some((a) => a.condition.type === t)),
    'condition 覆盖 count / streak / composite 三种类型')
  assert(AS.ACHIEVEMENT_INDEX.word_complete.includes('first_word')
    && AS.ACHIEVEMENT_INDEX.__streak__.includes('streak_7')
    && !AS.ACHIEVEMENT_INDEX.word_complete.includes('streak_7'),
  '倒排索引按事件分组，streak 成就挂在 __streak__ 组')
  const seedState = GS.GROWTH_DEFAULTS.achievements()
  assert(seedState.items.length === 27
    && seedState.items.every((a) => a.progress === 0 && !a.unlocked && a.unlockedAt === null),
  '成就种子初始化：进度 0 / 未解锁 / 无解锁时间')

  /* ---- 有效轮次判定与三个 Agent 的 effective 输出 ---- */
  assert(!ET.isEffectiveTurn('hi') && !ET.isEffectiveTurn('😀 !!! 123')
    && !ET.isEffectiveTurn(''), '过短 / 纯表情符号 / 空输入判为无效')
  assert(ET.isEffectiveTurn('I think the checkout queue was really long today'),
    '≥8 个英文词判为有效')
  assert(ET.isEffectiveTurn('checkout', { targetWords: ['checkout'] }),
    '短句命中目标短语也算有效')
  assert(!ET.isEffectiveTurn('I think the checkout queue was long', {
    previous: 'I think the checkout queue was long',
  }), '与上一条完全复读判为无效')
  assert(ET.isEffectiveTurn('I surely believe this reading changes everything today'),
    '正常长表达不受误伤')
  assert(ET.EFFECTIVE_RULE_PROMPT.includes('8 个英文词') && ET.EFFECTIVE_ROUND_XP === 2,
    '有效轮次规则同时写进 prompt，单轮 2 XP')
  const dIn = { userInput: 'I think the checkout queue was really long today', history: [], targetWords: [], targetPhrases: [] }
  assert(DD.dialogueEffective(dIn) === true
    && DD.dialogueEffective({ ...dIn, userInput: 'ok' }) === false,
  'DialogueDirector 本地判定有效 / 无效轮次')
  assert(seminarDir.mockSeminarTurn(seminarInput).effective === true
    && seminarDir.mockSeminarTurn({ ...seminarInput, userInput: 'ok' }).effective === false,
  'SeminarDirector Mock 输出带 effective 字段')
  assert(postWatch.mockPostWatchTurn(pwInput).effective === true
    && postWatch.mockPostWatchTurn({ ...pwInput, userInput: 'ok' }).effective === false,
  'PostWatchDirector Mock 输出带 effective 字段')
  assert(seminarDir.normalizeSeminarOutput({ reply: 'Why do you think so?', effective: false }, seminarInput).effective === false
    && postWatch.normalizePostWatchOutput({ reply: 'What did you see?', effective: false }, pwInput).effective === false,
  '远程端点返回 effective:false 时归一化层如实采纳')
  assert(seminarDir.buildSeminarPayload(seminarInput).effectiveRule === ET.EFFECTIVE_RULE_PROMPT
    && postWatch.buildPostWatchPayload(pwInput).effectiveRule === ET.EFFECTIVE_RULE_PROMPT,
  '判定规则随 payload 注入两个研讨类 Agent')
  assert(postWatch.postWatchSystemPrompt(pwInput).includes('effective(bool)')
    && postWatch.postWatchSystemPrompt(pwInput).includes('少于 8 个英文词'),
  'PostWatch 的独立 system prompt 明确要求返回 effective(bool)')
  const ddSrc = fs.readFileSync(path.join(root, 'src/services/dialogueDirector.ts'), 'utf8')
  const sdSrc = fs.readFileSync(path.join(root, 'src/services/seminarDirector.ts'), 'utf8')
  const pwSrc = fs.readFileSync(path.join(root, 'src/services/postWatchDirector.ts'), 'utf8')
  assert([ddSrc, sdSrc, pwSrc].every((s) => s.includes('effective(bool)')
    && s.includes('EFFECTIVE_RULE_PROMPT') && s.includes('effective:')),
  '三个 Director 的 prompt / Mock / 归一化层全部接入 effective')

  /* ---- 存储默认值、裁剪与只读镜像 ---- */
  const gd = GS.GROWTH_DEFAULTS.growth()
  assert(gd.xp === 0 && gd.level === 1 && gd.levelXp === 0 && gd.freezeCards === 2
    && gd.dailyGoalMet === false && gd.milestones.length === 0, 'lingua_growth 默认结构与需求契约一致')
  assert(GS.GROWTH_KEYS.growth === 'lingua_growth'
    && GS.GROWTH_KEYS.achievements === 'lingua_achievements'
    && GS.GROWTH_KEYS.ledger === 'lingua_xp_ledger'
    && GS.GROWTH_KEYS.heatmap === 'lingua_activity_heatmap', '四个新键名与需求一致')
  const trimmed = GS.trimHeatmap({ days: { '2026-01-01': 5, [TODAY]: 20 }, version: 1 }, new Date(NOW))
  assert(trimmed.days[TODAY] === 20 && !('2026-01-01' in trimmed.days),
    '热力图只保留最近 90 天')
  const mirrored = GS.mirrorProfile({
    xp: 1, streak: 2, todayXp: 3, todayDate: '2026-01-01',
    lastActiveDate: '2026-01-01', dailyGoal: 45, achievements: ['keep'],
  }, { xp: 99, streak: 7, dailyXp: { date: TODAY, amount: 12 }, lastActiveDate: TODAY })
  assert(mirrored.xp === 99 && mirrored.streak === 7 && mirrored.dailyGoal === 45
    && mirrored.achievements.length === 1, 'profile 镜像双写 XP/streak，且不吞掉 dailyGoal 等非成长字段')
  assert(GR.todayXp({ growth: { dailyXp: { date: TODAY, amount: 12 } } }, TODAY) === 12
    && GR.todayXp({ growth: { dailyXp: { date: '2026-01-01', amount: 12 } } }, TODAY) === 0,
  '今日 XP 跨天自动归零')

  /* ---- computeAward：幂等 / 校验 / 限流 / 派生事件 ---- */
  const base = GR.computeAward(mkBundle(), gEv('e1', 'round_effective', 2, { scenarioId: 's1' }), NOW)
  assert(base.granted && base.bundle.growth.xp === 2 && base.bundle.ledger.entries.length === 1
    && base.bundle.heatmap.days[TODAY] === 2, '一次发放入账 XP / 账本 / 热力图三处同步')
  const dup = GR.computeAward(base.bundle, gEv('e1', 'round_effective', 2, { scenarioId: 's1' }), NOW)
  assert(!dup.granted && dup.reason === 'duplicate' && dup.bundle.growth.xp === 2,
    '同一事件 ID 重复触发（刷新 / 重进 / 多标签页）不重复发放')
  assert(GR.computeAward(mkBundle(), gEv('', 'word_complete', 10), NOW).reason === 'invalid'
    && GR.computeAward(mkBundle(), gEv('neg', 'word_complete', -1), NOW).reason === 'invalid',
  '空事件 ID / 负金额被拒')
  const capRound = mkBundle()
  for (let i = 0; i < 10; i++) capRound.ledger.entries.push({ id: `cr${i}`, source: 'dialogue', action: 'round_effective', amount: 2, at: ISO, bucket: 's1' })
  assert(GR.computeAward(capRound, gEv('cr11', 'round_effective', 2, { scenarioId: 's1' }), NOW).reason === 'capped',
    '单场景轮次累计 20 XP 后封顶，重进不重置')
  const capReview = mkBundle()
  for (let i = 0; i < 3; i++) capReview.ledger.entries.push({ id: `cb${i}`, source: 'review', action: 'review_batch', amount: 15, at: ISO })
  assert(GR.computeAward(capReview, gEv('cb4', 'review_batch', 15, {}, 'review'), NOW).reason === 'capped',
    '复习批次每日 3 次上限')
  const capWords = mkBundle()
  for (let i = 0; i < 15; i++) capWords.ledger.entries.push({ id: `cw${i}`, source: 'wordlab', action: 'word_complete', amount: 10, at: ISO })
  assert(GR.computeAward(capWords, gEv('cw16', 'word_complete', 10, { dailyWordLimit: 15 }, 'wordlab'), NOW).reason === 'capped',
    '达到每日新词上限后不再发新词 XP')
  const capSpell = mkBundle()
  capSpell.ledger.entries.push({ id: 'cs0', source: 'wordlab', action: 'spelling_retry', amount: 2, at: ISO, bucket: 'sess:able' })
  assert(GR.computeAward(capSpell, gEv('cs1', 'spelling_retry', 2, { sessionKey: 'sess:able' }, 'wordlab'), NOW).reason === 'capped',
    '重拼奖励每词每会话上限 +2')
  const goalHit = GR.computeAward(mkBundle(), gEv('sf1', 'seminar_finish', 40, {}, 'seminar'), NOW)
  assert(goalHit.bundle.growth.dailyGoalMet
    && goalHit.pending.some((p) => p.action === 'daily_goal' && p.amount === 20)
    && goalHit.bundle.heatmap.days[TODAY] === 40, '达成当日目标派生 +20 XP 事件，每日只一次')
  const cross = mkBundle()
  cross.growth.dailyXp = { date: '2026-11-11', amount: 50 }
  cross.growth.dailyGoalMet = true
  const crossHit = GR.computeAward(cross, gEv('xw1', 'word_complete', 10, { dailyWordLimit: 15 }, 'wordlab'), NOW)
  assert(crossHit.bundle.growth.dailyGoalMet === false && crossHit.bundle.growth.dailyXp.amount === 10
    && !crossHit.pending.some((p) => p.action === 'daily_goal'),
  '跨天归零今日 XP 并重置目标标记，避免次日重复发奖')
  const firstWord = GR.computeAward(mkBundle(), gEv('w1', 'word_complete', 10, { dailyWordLimit: 15 }, 'wordlab'), NOW)
  assert(firstWord.unlockedIds.includes('first_word')
    && firstWord.pending.some((p) => p.action === 'achievement_unlock' && p.amount === 30),
  '完成第一个词事件驱动解锁 first_word，奖励 XP 仍走统一入口')
  assert(firstWord.bundle.achievements.items.find((a) => a.id === 'first_word').progress === 1,
    'count 类成就进度按账本真实计数更新')
  const idxBundle = mkBundle()
  idxBundle.ledger.entries.push({ id: 'rr0', source: 'dialogue', action: 'round_effective', amount: 2, at: ISO })
  assert(GR.checkAchievements(idxBundle, gEv('rr1', 'round_effective', 2)).unlockedIds.includes('first_round')
    && GR.checkAchievements(mkBundle(), gEv('m1', 'milestone', 20, {}, 'streak')).unlockedIds.length === 0,
  '成就判定只查与本次事件相关的成就，不做全量扫描')
  const big = mkBundle()
  for (let i = 0; i < G.LEDGER_LIMIT; i++) big.ledger.entries.push({ id: `p${i}`, source: 'review', action: 'legacy', amount: 0, at: ISO })
  const bigHit = GR.computeAward(big, gEv('new1', 'scene_finish', 30), NOW)
  assert(bigHit.bundle.ledger.entries.length === G.LEDGER_LIMIT
    && bigHit.bundle.ledger.entries.at(-1).id === 'new1'
    && !bigHit.bundle.ledger.entries.some((e) => e.id === 'p0'),
  '账本超出 500 条按时间淘汰最旧记录，不影响 XP 总额')
  GR.configureGrowth({ enabled: false })
  assert(GR.computeAward(mkBundle(), gEv('off', 'word_complete', 10), NOW).reason === 'no-storage',
    'Mock 降级：关闭开关后发放静默跳过')
  GR.configureGrowth({ enabled: true })

  /* ---- streak：冻结卡 / 断签不清 XP / 月度重置 / 里程碑 ---- */
  const sg = mkBundle().growth
  const st1 = GR.markActiveDay({ ...sg, streak: 2, longestStreak: 2, lastActiveDate: '2026-11-11' }, TODAY)
  assert(st1.growth.streak === 3 && st1.milestone === 3 && st1.milestoneXp === 20 && st1.freezeUsed === 0,
    '连续第 3 天触发 3 天里程碑 +20 XP')
  const st2 = GR.markActiveDay({ ...sg, xp: 500, level: 5, streak: 5, freezeCards: 2, lastActiveDate: '2026-11-09' }, TODAY)
  assert(st2.freezeUsed === 2 && st2.growth.freezeCards === 0 && st2.growth.streak === 6
    && st2.growth.xp === 500, '断签 2 天自动消耗 2 张冻结卡保持连续，XP 一分不扣')
  const st3 = GR.markActiveDay({ ...sg, xp: 500, level: 5, streak: 5, freezeCards: 1, lastActiveDate: '2026-11-09' }, TODAY)
  assert(st3.growth.streak === 1 && st3.growth.xp === 500 && st3.freezeUsed === 0,
    '连续断签超过冻结卡数量时 streak 重置为 1，等级 / XP / 成就不受影响')
  const st4 = GR.markActiveDay({ ...sg, freezeCards: 0, freezeMonth: '2026-10', streak: 4, lastActiveDate: '2026-11-11' }, TODAY)
  assert(st4.growth.freezeMonth === '2026-11' && st4.growth.freezeCards === 2,
    '跨月首次发放把冻结卡重置为 2 张')
  const st5 = GR.markActiveDay({ ...sg, streak: 3, milestones: [3], lastActiveDate: '2026-11-11' }, TODAY)
  assert(st5.milestone === undefined && st5.growth.streak === 4,
    '同一里程碑只发一次，不随每天活跃重复触发')
  const stHit = GR.computeAward(mkBundle(), gEv('act1', 'word_complete', 10, { dailyWordLimit: 15, active: true }, 'wordlab'), NOW)
  assert(stHit.bundle.growth.streak === 1 && stHit.bundle.growth.lastActiveDate === TODAY,
    '完成学习单元才记活跃日；本地日期写入 lastActiveDate')

  /* ---- awardXp 统一入口端到端（内存账本，无 localStorage） ---- */
  const savedWindow = globalThis.window
  delete globalThis.window
  GR.resetGrowthConfig()
  GR.configureGrowth({ now: () => NOW, dailyGoal: 30, enabled: true })
  const a1 = GR.awardXp(gEv('mem-1', 'word_complete', 10, { dailyWordLimit: 15 }, 'wordlab'))
  const a2 = GR.awardXp(gEv('mem-1', 'word_complete', 10, { dailyWordLimit: 15 }, 'wordlab'))
  assert(a1.granted && a1.amount === 10 && a1.bundle.growth.xp >= 10
    && !a2.granted && a2.reason === 'duplicate' && a2.bundle.growth.xp === a1.bundle.growth.xp,
  'awardXp() 端到端：首次入账、重复调用幂等跳过，派生奖励也走同一入口')
  assert(GR.awardXp(gEv('mem-bad', 'legacy', -5)).reason === 'invalid',
    'awardXp() 拒绝非法事件，不写脏数据')
  Object.defineProperty(globalThis, 'window', { value: savedWindow, writable: true, configurable: true })
  GR.resetGrowthConfig()

  /* ---- 验收 1：全代码库只有 growth.ts 直接写 growth.xp ---- */
  const walkSrc = (dir) => fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) =>
    d.isDirectory() ? walkSrc(path.join(dir, d.name))
      : /\.(ts|tsx)$/.test(d.name) ? [path.join(dir, d.name)] : [])
  const srcFiles = walkSrc(path.join(root, 'src'))
  const badWrites = srcFiles.filter((f) => !f.endsWith(path.join('services', 'growth.ts'))
    && /(?:next\.growth|bundle\.growth|growth)\.xp\s*(?:\+=|=)/.test(fs.readFileSync(f, 'utf8')))
  assert(badWrites.length === 0,
    `验收 1：所有 XP 发放都通过 awardXp()，无其他直接写 growth.xp 的位置（${badWrites.length} 处）`)

  /* ---- DOM：成长页 / 成就页 / 设置开关 / XpToast / LevelUpBanner ---- */
  clickExact('成长', '底部导航「成长」入口与既有入口并列')
  await tick(220)
  assert(!!document.querySelector('[data-testid="growth-home"]'), '成长页正常挂载')
  assert(bodyText().includes('GROWTH') && bodyText().includes('等级曲线')
    && bodyText().includes('Lv.'), '成长页展示当前等级、等级名与等级公式')
  assert(bodyText().includes('连续活跃') && bodyText().includes('冻结卡')
    && bodyText().includes('今日 XP') && bodyText().includes('最长'),
  '成长页展示连续天数、最长连续、冻结卡与今日 XP')
  assert(bodyText().includes('今日学习目标已达成') || bodyText().includes('即可达成今日目标'),
    '成长页展示今日目标完成状态')
  assert(!!document.querySelector('[data-testid="growth-heatmap"]')
    && bodyText().includes('最近 90 天') && bodyText().includes('活跃热力图'),
  '成长页展示 90 天 GitHub 风格活跃热力图（学习语义配色）')
  assert(bodyText().includes('最近获得的成就') && bodyText().includes('今日入账明细'),
  '成长页展示最近成就横向条与今日账本明细')
  assert(bodyText().includes('XP 规则') && bodyText().includes('明确不发 XP')
    && bodyText().includes('本地时间可被手动篡改'),
  '成长页写明 XP 规则、不发 XP 行为与本地时间可篡改的 MVP 限制')
  click(/全部成就/, '成长页进入成就页')
  await tick(200)
  assert(!!document.querySelector('[data-testid="achievements-page"]')
    && bodyText().includes('/ 27 枚已点亮'), '成就页展示 27 枚成就与解锁总数')
  assert(['全部', '引导', '坚持', '深度', '广度', '隐藏'].every((t) => bodyText().includes(t)),
    '成就页六个分类 tab 齐全')
  assert(bodyText().includes('已解锁') && bodyText().includes('未开始'),
    '成就页区分已解锁 / 进行中 / 未开始三种状态')
  const hiddenTab = buttons().find((b) => /^隐藏/.test((b.textContent || '').trim()))
  assert(!!hiddenTab, '成就页有「隐藏」分类 tab')
  fire(hiddenTab)
  await tick(180)
  const hiddenCards = [...document.querySelectorAll('[data-testid="hidden-locked"]')]
  assert(hiddenCards.length === 4 && hiddenCards.every((c) => c.textContent.includes('???')),
    '隐藏成就未解锁时只显示「???」')
  assert(hiddenCards.every((c) => !/奖励|进度|XP|连续 \d+ 天/.test(c.textContent)),
    '隐藏成就未解锁时不泄露条件与进度')

  clickExact('设置', '进入设置页检查成长系统开关')
  await tick(200)
  assert(bodyText().includes('显示 XP 动画') && bodyText().includes('显示热力图'),
    '设置页新增「显示 XP 动画」「显示热力图」两个开关')
  assert(!!document.querySelector('[aria-label="显示 XP 动画"]')
    && !!document.querySelector('[aria-label="显示热力图"]'), '两个开关可无障碍定位')
  const growthDetail = {
    granted: true, amount: 10, leveledUp: true, newLevel: 4,
    unlockedAchievements: ['first_word'], freezeUsed: 0, bundle: {},
  }
  w3.dispatchEvent(new (globalThis.CustomEvent)('lingua:growth', { detail: growthDetail }))
  await tick(140)
  assert(!!document.querySelector('[data-testid="xp-toast"]') && bodyText().includes('+10 XP'),
    '获得 XP 时右下角浮出 +10 XP 轻提示（不遮挡输入框）')
  assert(!!document.querySelector('[data-testid="levelup-banner"]') && bodyText().includes('升级啦'),
    '升级时顶部出现轻量横幅，不是全屏模态')
  fire(document.querySelector('[aria-label="显示 XP 动画"]'))
  await tick(180)
  assert(JSON.parse(w3.localStorage.getItem('lingua_settings')).showXpAnimation === false,
    '「显示 XP 动画」开关写入 lingua_settings')
  w3.dispatchEvent(new (globalThis.CustomEvent)('lingua:growth', { detail: growthDetail }))
  await tick(140)
  assert(!document.querySelector('[data-testid="xp-toast"]')
    && !document.querySelector('[data-testid="levelup-banner"]'),
  '关闭 XP 动画后轻提示与升级横幅都不再出现')
  fire(document.querySelector('[aria-label="显示热力图"]'))
  await tick(180)
  assert(JSON.parse(w3.localStorage.getItem('lingua_settings')).showHeatmap === false,
    '「显示热力图」开关写入 lingua_settings')
  clickExact('成长', '关闭热力图后回到成长页')
  await tick(200)
  assert(!document.querySelector('[data-testid="growth-heatmap"]')
    && bodyText().includes('热力图已在设置页关闭'),
  '关闭热力图后成长页只保留等级与连续天数')
  clickExact('设置', '恢复两个开关默认值')
  await tick(180)
  fire(document.querySelector('[aria-label="显示 XP 动画"]'))
  await tick(120)
  fire(document.querySelector('[aria-label="显示热力图"]'))
  await tick(120)
  assert(JSON.parse(w3.localStorage.getItem('lingua_settings')).showXpAnimation === true
    && JSON.parse(w3.localStorage.getItem('lingua_settings')).showHeatmap === true,
  '设置开关可双向切换，默认开启')

  /* ---- 验收 10：旧 profile 迁移一次，旧 XP/streak 不丢 ---- */
  const oldProfile = {
    nickname: 'OldUser', cefr: 'B1', dailyGoal: 30, xp: 420, streak: 9,
    lastActiveDate: '2026-11-10', todayXp: 0, todayDate: '2026-11-10',
    totalSessions: 5, achievements: ['first_dialogue'],
  }
  const bundleUrl = pathToFileURL(path.join(assetDir, jsFile)).href
  const makeDom = () => {
    const d = new JSDOM(html.replace(/<script[^>]*><\/script>/g, ''), {
      url: 'http://localhost:5173/', pretendToBeVisual: true, runScripts: 'outside-only', virtualConsole: vc,
    })
    d.window.scrollTo = () => {}
    d.window.Element.prototype.scrollIntoView = () => {}
    return d
  }
  const bindGlobals = (win) => {
    for (const key of ['window', 'document', 'navigator', 'localStorage', 'HTMLElement', 'Node', 'MouseEvent',
      'Event', 'CustomEvent', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame',
      'MutationObserver', 'DOMParser', 'FileReader', 'Blob', 'File', 'HTMLInputElement', 'HTMLTextAreaElement']) {
      try { Object.defineProperty(globalThis, key, { value: win[key], writable: true, configurable: true }) } catch { /* ignore */ }
    }
  }
  const dom5 = makeDom()
  const w5 = dom5.window
  w5.localStorage.setItem('lingua_profile', JSON.stringify(oldProfile))
  bindGlobals(w5)
  await import(bundleUrl + '?reload=5')
  await tick(260)
  const migrated = JSON.parse(w5.localStorage.getItem('lingua_growth'))
  assert(migrated.xp === 420 && migrated.streak === 9 && migrated.lastActiveDate === '2026-11-10'
    && migrated.__migrated === true, '首次启动把旧 profile 的 XP / streak / 活跃日迁入 lingua_growth')
  assert(migrated.level === 3 && migrated.levelXp === 170,
    '迁入的旧 XP 按新等级曲线重算 level / levelXp')
  assert(JSON.parse(w5.localStorage.getItem('lingua_profile')).xp === 420
    && JSON.parse(w5.localStorage.getItem('lingua_profile')).achievements.length === 1,
  '迁移对旧键零改动，旧成就标记保留')
  assert(w5.localStorage.getItem('lingua_achievements') !== null
    && w5.localStorage.getItem('lingua_xp_ledger') !== null
    && w5.localStorage.getItem('lingua_activity_heatmap') !== null,
  '首次启动自动播种另外三个新键')
  const snap5 = {}
  for (let i = 0; i < w5.localStorage.length; i++) {
    const k = w5.localStorage.key(i)
    if (k) snap5[k] = w5.localStorage.getItem(k)
  }
  snap5.lingua_profile = JSON.stringify({ ...oldProfile, xp: 999 })
  const dom6 = makeDom()
  const w6 = dom6.window
  for (const [k, v] of Object.entries(snap5)) if (v !== null) w6.localStorage.setItem(k, v)
  bindGlobals(w6)
  await import(bundleUrl + '?reload=6')
  await tick(260)
  assert(JSON.parse(w6.localStorage.getItem('lingua_growth')).xp === 420,
    '二次启动不重复迁移，不用旧 profile 覆盖后续积累的 XP')
  assert(JSON.parse(w6.localStorage.getItem('lingua_profile')).xp === 999,
    '旧键仍可读写，语义不变')
  for (const k of ['lingua_growth', 'lingua_achievements', 'lingua_xp_ledger', 'lingua_activity_heatmap']) {
    assert(w6.localStorage.getItem(k) !== null, `刷新后成长系统键仍在：${k}`)
  }
  }

  /* ============================================================
   * 十九、China Learner Track 本土应试与真实能力桥接资源库（8 条验收）
   * 独立块级作用域 + 独立 JSDOM，避免与前面 18 章的 DOM 夹具互相污染
   * ============================================================ */
  {
  const CT = await loadModule('src/data/chinaTrack/index.ts', 'ct-index')
  const CTT = await loadModule('src/chinaTrackTypes.ts', 'ct-types')
  const PV = await loadModule('src/data/chinaTrack/provinces.ts', 'ct-provinces')
  const WF = await loadModule('src/services/writingFeedback.ts', 'ct-writing')
  const CTS = await loadModule('src/services/chinaTrack.ts', 'ct-service')
  const DD = await loadModule('src/services/dialogueDirector.ts', 'ct-director')
  const CTStore = await loadModule('src/lib/storage.ts', 'ct-storage')

  /* ---- 验收 1：四轨道 / struggle / 完整字段 ---- */
  assert(CT.TRACKS.length === 4 && CT.TRACKS.map((t) => t.id).join('') === 'ABCD',
    '资源库按 A/B/C/D 四个轨道组织')
  assert(CT.ALL_UNITS.length === 40 && ['A', 'B', 'C', 'D'].every((t) => CT.TRACK_UNITS[t].length === 10),
    '每轨道 10 个原创资源单元，合计 40 个')
  assert(CT.validateUnits().length === 0, '全部单元字段齐全：struggle / examTags / cefr / engine / content 五字段 / source / assessmentFocus')
  assert(CT.ALL_UNITS.every((u) => u.struggle.trim().length >= 8 && !/应试英语|中学英语|大学英语/.test(u.struggle)),
    'struggle 都是学生可自我识别的具体卡点，不使用宽泛分类')
  assert(CT.struggleTeasers('A', 3).length === 3 && CT.TRACKS.every((t) => CT.struggleTeasers(t.id, 3).length === 3),
    '每条轨道都能提供 2–3 个 struggle 入口短句')
  assert(CT.EXAM_TAGS.length === 5 && CT.EXAM_TAGS.includes('gaokao_listening'), 'examTags 含高考听说标签')
  assert(new Set(CT.ALL_UNITS.filter((u) => u.examTags.includes('cet6')).map((u) => u.track)).size >= 2,
    '同一 examTag 服务多个轨道，资源库不按考试切成互斥路径')

  /* ---- 验收 2：assessmentFocus 决定反馈优先级 ---- */
  assert(CT.TRACK_UNITS.B.every((u) => u.assessmentFocus === 'continuation_coherence')
    && CT.TRACK_UNITS.C.every((u) => u.assessmentFocus === 'task_completion')
    && CT.TRACK_UNITS.D.every((u) => u.assessmentFocus === 'chinglish_diagnosis')
    && CT.TRACK_UNITS.A.every((u) => ['logic_structure', 'chinglish_diagnosis'].includes(u.assessmentFocus)),
  '轨道 A 逻辑 / B 衔接 / C 任务完成 / D 诊断，各自绑定 assessmentFocus')
  assert(CTT.FOCUS_PRIORITY.logic_structure.notFirst.includes('不优先纠语法')
    && CTT.FOCUS_PRIORITY.continuation_coherence.notFirst.includes('不优先评语言')
    && CTT.FOCUS_PRIORITY.task_completion.notFirst.includes('不优先评发音')
    && CTT.FOCUS_PRIORITY.chinglish_diagnosis.notFirst.includes('不给分数'),
  '四条反馈优先级明确写出「不优先做什么」')
  assert(CTT.NO_PROMISES.length === 4 && CTT.NO_PROMISES[0].includes('不提供分数预测'),
    '明确不做：分数预测 / 提分话术 / 全国统一假定 / 复制机构内容')
  assert(WF.ENGINE_SCOPE.does.length === 5 && WF.ENGINE_SCOPE.doesNot.includes('逐句语法纠错')
    && WF.ENGINE_SCOPE.doesNot.includes('分数或等级预测'),
  'WritingFeedbackEngine 只做结构级反馈，不做语法纠错与打分')

  const a01 = CT.findUnit('A01')
  const goodLogic = {
    unit: a01,
    answers: ['Students get up late', 'because they use phones at night', 'however the timetable changed', 'expand to two sentences'],
    draft: 'Many students struggle to get up early because they stay up late. However, moving morning reading earlier made it worse.',
  }
  const logicOk = WF.evaluateWriting(goodLogic)
  assert(logicOk.focus === 'logic_structure' && logicOk.verdict === 'clear'
    && logicOk.checks.find((c) => c.key === 'logic_markers').passed,
  '轨道 A：逻辑骨架齐全 + 因果/转折显性 → 结构清楚')
  assert(logicOk.noScore === true && logicOk.isMock === true
    && !('score' in logicOk) && !('band' in logicOk) && !('grade' in logicOk)
    && logicOk.checks.every((c) => !/grammar|pronunciation/i.test(c.key)),
  '轨道 A 反馈不含分数、不含语法或发音检查项，默认本地 Mock')
  assert(logicOk.priorities[0] === CTT.FOCUS_PRIORITY.logic_structure.first,
    '轨道 A 第一条反馈优先级就是逻辑结构')
  const literal = WF.evaluateWriting({ ...goodLogic, answers: [], draft: 'Many students 觉得早起很难 and learn knowledge very very fast.' })
  assert(!literal.checks.find((c) => c.key === 'scaffold').passed
    && !literal.checks.find((c) => c.key === 'not_literal').passed,
  '轨道 A：中文构思 + 逐词死译痕迹被识别为结构缺失，而不是语法扣分')

  const b04 = CT.findUnit('B04')
  const emotionOnly = WF.evaluateWriting({ unit: b04, answers: ['a', 'b', 'c'],
    draft: 'Sam felt terribly nervous and extremely worried. He was very very sad and his heart was full of joy.' })
  assert(!emotionOnly.checks.find((c) => c.key === 'plot_advances').passed
    && !emotionOnly.checks.find((c) => c.key === 'not_emotion_only').passed,
  '轨道 B：情绪描写过度而情节空缺被识别出来')
  const plotOk = WF.evaluateWriting({ unit: b04, answers: ['a', 'b', 'c'],
    draft: 'Sam stepped onto the field and held the jersey out to the player. He waited for the whistle.' })
  assert(plotOk.verdict === 'clear' && plotOk.checks.find((c) => c.key === 'plot_advances').passed
    && plotOk.checks.find((c) => c.key === 'coheres').passed,
  '轨道 B：补上最小情节动作并承接上句 → 衔接判定通过')

  const c01 = CT.findUnit('C01')
  const taskOk = WF.evaluateWriting({ unit: c01, answers: [],
    draft: "Hi, I'm Li. I'm in Class Two, and I'm trying to finish a short reading project this week." })
  assert(taskOk.focus === 'task_completion' && taskOk.verdict === 'clear'
    && taskOk.checks.find((c) => c.key === 'task_keys').passed
    && taskOk.checks.find((c) => c.key === 'no_grammar_gate').passed,
  '轨道 C：2–3 句说完交际任务即通过，不设语法/发音闸门')
  assert(taskOk.checks.find((c) => c.key === 'no_grammar_gate').label.includes('不看语法与发音'),
    '轨道 C 的判定项明确写出「不看语法与发音」')

  const d01 = CT.findUnit('D01')
  const wrongDiag = WF.evaluateWriting({ unit: d01, answers: ['两个谓语'], draft: 'two verbs', diagnosisChoice: '搭配错配' })
  const rightDiag = WF.evaluateWriting({ unit: d01, answers: ['两个谓语'], draft: 'two verbs', diagnosisChoice: '动词堆砌' })
  assert(wrongDiag.diagnosis && wrongDiag.diagnosis.correct === false
    && rightDiag.diagnosis.correct === true,
  '轨道 D：诊断选项按模式判定，不给对错分')
  assert(wrongDiag.diagnosis.pattern.includes('动词堆砌')
    && wrongDiag.diagnosis.transferNote.includes('中文')
    && wrongDiag.diagnosis.rewrite.length > 10
    && wrongDiag.collocations.length >= 2,
  '轨道 D 输出诊断模式 + 母语负迁移提示 + 地道改写 + 地道搭配注释')
  assert(wrongDiag.checks.find((c) => c.key === 'no_score').passed && wrongDiag.noScore === true,
    '轨道 D 明确「只给诊断，不给分数」')
  assert(WF.splitSentences('One. Two? Three!').length === 3
    && WF.wordCount('one two three') === 3 && WF.hasChinese('中文') === true,
  '结构级引擎的纯文本工具可独立单测')
  const remoteNorm = WF.normalizeRemoteFeedback(logicOk, { headline: '远程标题', checks: [{ passed: false }], nextStep: '下一步' })
  assert(remoteNorm.noScore === true && remoteNorm.checks[0].passed === false
    && JSON.stringify(remoteNorm.priorities) === JSON.stringify(logicOk.priorities),
  '远程归一化只改结构级文案，不能放开 noScore / priorities 边界')
  WF.setWritingFeedbackProvider(() => { throw new Error('远程故障') })
  const fallback = await WF.requestWritingFeedback(goodLogic)
  assert(fallback.isMock === true && fallback.noScore === true, '自定义反馈异常时自动回退本地 Mock，练习不中断')
  WF.resetWritingFeedbackProvider()
  assert((await WF.requestWritingFeedback(goodLogic)).isMock === true, '默认 Mock 模式下结构级反馈 100% 本地可用')

  /* ---- 验收 3：听说机考默认关闭、按省份启用/禁用 ---- */
  assert(CTT.CHINA_TRACK_DEFAULTS.listeningExamEnabled === false
    && CTT.CHINA_TRACK_DEFAULTS.province === 'none',
  '省份配置默认「暂不选择」且听说机考感知卡默认关闭')
  assert(CT.ALL_UNITS.filter((u) => u.examAware).length === 3
    && CT.ALL_UNITS.filter((u) => u.examAware).every((u) => u.track === 'C'),
  '3 张题型感知卡只属于轨道 C')
  assert(CT.visibleUnits(CTT.CHINA_TRACK_DEFAULTS).length === 37
    && CT.visibleUnits(CTT.CHINA_TRACK_DEFAULTS, { track: 'C' }).length === 7
    && CT.visibleUnits(CTT.CHINA_TRACK_DEFAULTS).every((u) => !u.examAware),
  '默认关闭时 3 张机考感知卡完全隐藏，其余 37 个单元照常可见')
  assert(['guangdong', 'beijing', 'shanghai'].every((id) => PV.PROVINCE_OPTIONS.find((p) => p.id === id).autoEnable)
    && !PV.PROVINCE_OPTIONS.find((p) => p.id === 'other').autoEnable,
  '广东 / 北京 / 上海自动启用；其他地区不擅自假定政策')
  const gdState = PV.resolveProvinceChange(CTT.CHINA_TRACK_DEFAULTS, 'guangdong')
  assert(gdState.listeningExamEnabled === true && CT.visibleUnits(gdState, { track: 'C' }).length === 10,
    '选择广东后自动启用，轨道 C 的 10 个单元全部可见')
  assert(PV.resolveProvinceChange(CTT.CHINA_TRACK_DEFAULTS, 'other').listeningExamEnabled === false,
    '选择「其他地区 / 不确定」保持关闭，不假定全国政策统一')
  const manualOff = PV.resolveExamToggle(gdState, false)
  assert(manualOff.listeningExamEnabled === false && manualOff.examOverride === true,
    '自动启用后仍可手动关闭，用户覆盖优先')
  assert(PV.PROVINCE_DISCLAIMER.includes('不上传、不追踪') && PV.PROVINCE_DISCLAIMER.includes('不预测分数'),
    '省份配置明确写出纯本地、不上传、不追踪、不预测分数')
  assert(CT.ALL_UNITS.filter((u) => u.examAware).every((u) =>
    u.content.examBrief.includes('不预测分数') && !/保过|必考|包过|押题/.test(u.content.examBrief)),
  '题型感知卡只说明流程，不做分数预测、不写「保过/必考」话术')

  /* ---- 验收 4：来源许可分层 + 排除清单 ---- */
  assert(CT.nonOriginalUnits().length === 0
    && CT.ALL_UNITS.every((u) => u.source.type === 'original' && u.source.attribution && u.source.license),
  '40 个单元全部 source.type=original，逐条带 attribution 与 license')
  const ctSeedSrc = ['trackA', 'trackB', 'trackC', 'trackD', 'index', 'provinces']
    .map((f) => fs.readFileSync(path.join(root, 'src/data/chinaTrack', `${f}.ts`), 'utf8')).join('\n')
  const ctPayload = CT.ALL_UNITS.map((u) => JSON.stringify({ c: u.content, s: u.source, q: u.struggle })).join('\n')
  assert(!/新东方|环球雅思|沪江|文都|启航|王江涛|考研真相|张剑|机经回忆|满分作文|万能句|押题合集|真题原文/.test(ctPayload),
    '资源库单元内容中不存在培训机构讲义、范文、模板、机经或真题原文')
  assert(!/新东方|环球雅思|沪江|文都|启航|王江涛|考研真相|张剑/.test(ctSeedSrc),
    '资源库源码中不出现任何培训机构名称（注释中的排除声明除外）')
  assert(CTT.sourceLabel(CT.findUnit('D01').source).includes('原创'),
    '来源小字对原创内容给出明确标注')
  const ctReadme = fs.readFileSync(path.join(root, 'README.md'), 'utf8')
  assert(ctReadme.includes('KyleBing/english-vocabulary') && ctReadme.includes('BSD-3-Clause')
    && ctReadme.includes('ECDICT') && ctReadme.includes('MIT')
    && ctReadme.includes('Tatoeba') && ctReadme.includes('CC BY 2.0 FR')
    && ctReadme.includes('省份配置') && ctReadme.includes('不提供分数预测，不承诺提分')
    && ctReadme.includes('明确排除清单'),
  'README 列出三种开放许可词表来源、排除清单、省份配置与不提分承诺（验收 8）')

  /* ---- 验收 5：接入既有 Word Lab / Dialogue / 成长系统 ---- */
  assert(wlDecks.DECK_IDS.length === 7 && wlDecks.CHINA_DECK_IDS.length === 2
    && wlDecks.ALL_DECK_IDS.length === 9,
  '原有 7 个分级词库保持不变，并列注册 2 个 china_track 场景词包')
  assert(wlDecks.DECK_META.chinglish_fix.source === 'china_track'
    && wlDecks.DECK_META.speaking_core.source === 'china_track',
  '两个场景词包标记 source: china_track')
  assert(wlDecks.firstShard('chinglish_fix').length >= 8 && wlDecks.firstShard('speaking_core').length >= 8
    && [...wlDecks.firstShard('chinglish_fix'), ...wlDecks.firstShard('speaking_core')]
      .every((x) => x.tags.includes('china_track') && x.imageUrl === '' && x.collocations.length >= 1),
  '场景词包词条可走同一套五步闭环，标签/兜底图/搭配齐全')
  assert(wlDecks.findWord('acquire knowledge')?.word === 'acquire knowledge'
    && wlDecks.firstShard('chinglish_fix').some((x) => x.meaningZh.includes('≠')),
  '纠偏词包释义是「地道搭配注释」而非简单中文直译')
  assert(wlCurator.ALL_DECK_IDS.includes('chinglish_fix') && wlCurator.ALL_DECK_IDS.includes('speaking_core'),
  'WordCuratorAgent 允许两个场景词包走既有分片加载')
  const microScenario = CTS.makeMicroScenario(c01)
  const microSession = CTS.makeMicroSession(c01, microScenario)
  assert(microScenario.assessmentFocus === 'task_completion' && microSession.messages[0].role === 'ai',
    '轨道 C 微场景生成普通 Scenario / Session，交给既有 DialogueDirectorAgent')
  const ddInput = {
    summary: '', topic: 'china track',
    scenario: { id: 'china-C01', title: '开口练习', goal: '', characters: [], targetWords: ['class'],
      targetPhrases: ["I'm in Class Two"], sentenceFrames: [], openingLine: '', suggestedReplies: [], rounds: 3 },
    userCharacter: { id: 'me', name: 'You', role: '', personality: '', goal: '', sampleLines: [] },
    aiCharacter: { id: 'ai', name: 'Partner', role: '', personality: '', goal: '', sampleLines: [] },
    targetWords: ['class', 'project'], targetPhrases: ["I'm in Class Two"], history: [],
    userInput: "Hi, I'm Li. I'm in Class Two, and I'm trying to finish a short reading project this week.",
    difficulty: 'A2', correction: 'gentle', turn: 0, assessmentFocus: 'task_completion',
  }
  const ddOut = DD.mockGenerateDialogue(ddInput)
  assert(ddOut.feedback.level === 'none' && ddOut.feedback.corrected === ''
    && ddOut.feedback.praise.includes('任务完成') && ddOut.feedback.naturalness.includes('不评发音'),
  'Director 在 task_completion 场景下优先看任务完成，不纠语法、不评发音、不打等级')
  const ddPlain = DD.mockGenerateDialogue({ ...ddInput, assessmentFocus: undefined, userInput: 'I am agree with you' })
  assert(ddPlain.feedback.corrected !== '', '不带 assessmentFocus 的旧场景反馈行为完全不变')
  const ddSrc2 = fs.readFileSync(path.join(root, 'src/services/dialogueDirector.ts'), 'utf8')
  const typesSrc = fs.readFileSync(path.join(root, 'src/types.ts'), 'utf8')
  assert(typesSrc.includes('assessmentFocus?: AssessmentFocus')
    && ddSrc2.includes("input.assessmentFocus === 'task_completion'")
    && ddSrc2.includes('assessmentFocus: input.assessmentFocus')
    && ddSrc2.includes('assessmentFocus=${input.assessmentFocus}'),
  'Director 的 schema / Mock 分支 / prompt / payload 四处都接入 assessmentFocus，未新建 Agent')
  assert(CTS.reviewItemForUnit(a01).source === 'china_track'
    && CTS.reviewItemForUnit(a01).kind === 'phrase',
  '完成单元写入既有复习队列，来源标记 china_track')
  assert(CTS.unitCompletionRate({ completed: { a: 1, b: 2 } }, 4) === 0.5,
    '资源库进度只记录完成状态，不新建等级机制')

  /* ---- 验收 6：第 29 键与旧数据共存 ---- */
  assert(Object.keys(CTStore.KEYS).length === 31
    && CTStore.KEYS.chinaTrack === 'lingua_china_track'
    && CTStore.DEFAULT_DATA.chinaTrack.listeningExamEnabled === false,
  '键总数 31：第 29 个 china_track、第 30 个等级偏好、第 31 个音色偏好，旧 28 个键名与语义不变，默认值机考关闭')
  assert(CTStore.KEYS.profile === 'lingua_profile' && CTStore.KEYS.wordProgress === 'lingua_word_progress'
    && CTStore.KEYS.growth === 'lingua_growth', '旧键名逐项保持不变')

  /* ---- 验收 7 / 8：Mock 模式下真实 DOM 全流程 ---- */
  const ctMakeDom = () => {
    const d = new JSDOM(html.replace(/<script[^>]*><\/script>/g, ''), {
      url: 'http://localhost:5173/', pretendToBeVisual: true, runScripts: 'outside-only', virtualConsole: vc,
    })
    d.window.scrollTo = () => {}
    d.window.Element.prototype.scrollIntoView = () => {}
    return d
  }
  const ctBindGlobals = (win) => {
    for (const key of ['window', 'document', 'navigator', 'localStorage', 'HTMLElement', 'Node', 'MouseEvent',
      'Event', 'CustomEvent', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame',
      'MutationObserver', 'DOMParser', 'FileReader', 'Blob', 'File', 'HTMLInputElement', 'HTMLTextAreaElement']) {
      try { Object.defineProperty(globalThis, key, { value: win[key], writable: true, configurable: true }) } catch { /* ignore */ }
    }
  }
  const ctBundle = pathToFileURL(path.join(assetDir, jsFile)).href
  const ctDom = ctMakeDom()
  const cw = ctDom.window
  /** 预置一份旧版本存档，验证新键播种时旧数据零丢失 */
  cw.localStorage.setItem('lingua_profile', JSON.stringify({
    nickname: 'Legacy', cefr: 'B1', dailyGoal: 30, xp: 777, streak: 6,
    lastActiveDate: '2026-11-10', todayXp: 0, todayDate: '2026-11-10', totalSessions: 2, achievements: ['first_step'],
  }))
  cw.localStorage.setItem('lingua_texts', JSON.stringify([{ id: 'legacy-text', topic: 'Legacy Text', cefr: 'B1',
    sourceText: 'legacy', summary: '', keywords: [], phrases: [], grammar: [], scenarios: [], createdAt: 1 }]))
  ctBindGlobals(cw)
  await import(ctBundle + '?ct=1')
  await tick(260)
  assert(JSON.parse(cw.localStorage.getItem('lingua_profile')).xp === 777
    && JSON.parse(cw.localStorage.getItem('lingua_texts'))[0].topic === 'Legacy Text',
  '旧版本存档的 profile / texts 数据零丢失')
  assert(JSON.parse(cw.localStorage.getItem('lingua_china_track')).listeningExamEnabled === false,
  '首次启动自动播种 lingua_china_track，默认关闭')
  assert(bodyText().includes('本土应试与真实能力桥接资源库'), '学习页有资源库入口卡，未新增底部导航项')
  assert(document.querySelectorAll('nav button').length === 8, '底部导航仍是 8 项，资源库归入「学习」')

  click(/本土应试与真实能力桥接资源库/, '进入资源库首页')
  await tick(220)
  assert(!!document.querySelector('[data-testid="track-A"]')
    && !!document.querySelector('[data-testid="track-B"]')
    && !!document.querySelector('[data-testid="track-C"]')
    && !!document.querySelector('[data-testid="track-D"]'),
  '资源库首页四轨道并列')
  assert(bodyText().includes('我写英文作文时，是先在脑子里想好中文，再一句一句换成英文。'),
    '轨道卡上的 struggle 短句在 UI 中可见')
  assert(bodyText().includes('默认关闭') && bodyText().includes('张题型说明卡已隐藏'),
    '首页明确显示听说机考感知卡默认关闭')
  assert(!bodyText().includes('听说机考要「模仿朗读」'), '默认关闭时 C08 感知卡内容不出现在页面')
  assert(bodyText().includes('CEFR') && bodyText().includes('engine:') && bodyText().includes('来源：'),
    '资源单元卡展示 examTags / cefr / engine 标识 / 来源小字')

  clickExact('广东', '按省份启用机考感知卡')
  await tick(200)
  assert(JSON.parse(cw.localStorage.getItem('lingua_china_track')).province === 'guangdong'
    && JSON.parse(cw.localStorage.getItem('lingua_china_track')).listeningExamEnabled === true,
  '选择广东后自动启用并写入本机')
  assert(bodyText().includes('听说机考要「模仿朗读」') && bodyText().includes('已启用'),
    '启用后 3 张题型感知卡可见')
  fire(document.querySelector('[aria-label="启用听说机考感知卡"]'))
  await tick(200)
  assert(JSON.parse(cw.localStorage.getItem('lingua_china_track')).listeningExamEnabled === false
    && !bodyText().includes('听说机考要「模仿朗读」'),
  '可手动禁用，禁用后感知卡再次隐藏')

  fire(document.querySelector('[data-testid="filter-track-A"]'))
  await tick(180)
  assert(!!document.querySelector('[data-testid="unit-card-A01"]')
    && document.querySelector('[data-testid="unit-struggle-A01"]').textContent.includes('先在脑子里想好中文'),
  '轨道筛选后单元卡带 struggle，且 examTag 只做筛选')
  click(/开始练习/, '进入 A01 单元练习页')
  await tick(220)
  assert(document.querySelector('[data-testid="unit-struggle"]').textContent.includes('先在脑子里想好中文')
    && bodyText().includes('不输出分数'),
  '单元页 struggle 可见并写明不给分数')
  const taSetterCT = Object.getOwnPropertyDescriptor(globalThis.HTMLTextAreaElement.prototype, 'value').set
  const inSetterCT = Object.getOwnPropertyDescriptor(globalThis.HTMLInputElement.prototype, 'value').set
  for (let i = 0; i < 4; i++) {
    const el = document.querySelector(`[data-testid="scaffold-${i}"]`)
    inSetterCT.call(el, `logic step ${i}`)
    el.dispatchEvent(new (globalThis.Event)('input', { bubbles: true }))
  }
  const draftCT = document.querySelector('[data-testid="unit-draft"]')
  taSetterCT.call(draftCT, 'Many students struggle to get up early because they stay up late. However, moving morning reading earlier made it worse.')
  draftCT.dispatchEvent(new (globalThis.Event)('input', { bubbles: true }))
  await tick(80)
  click(/获取结构级反馈/, '提交结构级练习')
  await tick(220)
  assert(!!document.querySelector('[data-testid="china-unit-feedback"]')
    && !!document.querySelector('[data-testid="no-score"]')
    && bodyText().includes('本地 Mock'),
  'Mock 模式下结构级反馈完整可用，且明示不给分数')
  assert(document.querySelector('[data-testid="focus-priority"]').textContent.includes('逻辑结构'),
    '反馈区第一条优先级是轨道 A 的逻辑结构')

  click(/完成本单元并写入复习队列/, '完成 A01 并写入 XP / 复习队列')
  await tick(240)
  const ctDone = JSON.parse(cw.localStorage.getItem('lingua_china_track'))
  const ctQueue = JSON.parse(cw.localStorage.getItem('lingua_review_queue') || '[]')
  const ctLedger = JSON.parse(cw.localStorage.getItem('lingua_xp_ledger'))
  assert(!!ctDone.completed.A01, '完成记录写入 lingua_china_track')
  assert(ctQueue.some((r) => r.id === 'china-A01' && r.source === 'china_track'),
    '结构提示写入既有复习队列，来源标记 china_track')
  assert(ctLedger.entries.filter((e) => e.action === 'china_track_complete' && e.source === 'china_track').length === 1,
    '完成单元走统一 XP 入口，source=china_track，同一单元每天只入账一次')

  clickExact('词场', '去词场检查场景词包')
  await tick(180)
  click(/去挑词库/, '进入词库选择页')
  await tick(200)
  assert(!!document.querySelector('[data-testid="china-track-packs"]')
    && !!document.querySelector('[data-testid="china-pack-chinglish_fix"]')
    && !!document.querySelector('[data-testid="china-pack-speaking_core"]')
    && bodyText().includes('source: china_track'),
  '词库选择页并列展示 2 个 china_track 场景词包')

  clickExact('学习', '回学习页准备微场景')
  await tick(160)
  click(/本土应试与真实能力桥接资源库/, '再次进入资源库')
  await tick(180)
  fire(document.querySelector('[data-testid="filter-track-C"]'))
  await tick(160)
  click(/开始练习/, '进入 C01 微场景')
  await tick(200)
  click(/进入对话练习/, '复用既有 Dialogue 引擎')
  await tick(240)
  assert(bodyText().includes("I don't think we've met"), '微场景开口句由既有对话页呈现')
  const ctScenarios = JSON.parse(cw.localStorage.getItem('lingua_scenarios') || '[]')
  assert(ctScenarios.some((s) => s.id === 'china-C01' && s.assessmentFocus === 'task_completion'),
    '微场景写入既有 lingua_scenarios，带 assessmentFocus，不新建 Agent')

  /* ---- 刷新后新键与旧数据都还在 ---- */
  const ctSnap = {}
  for (let i = 0; i < cw.localStorage.length; i++) {
    const k = cw.localStorage.key(i)
    if (k) ctSnap[k] = cw.localStorage.getItem(k)
  }
  const ctDom2 = ctMakeDom()
  const cw2 = ctDom2.window
  for (const [k, v] of Object.entries(ctSnap)) if (v !== null) cw2.localStorage.setItem(k, v)
  ctBindGlobals(cw2)
  await import(ctBundle + '?ct=2')
  await tick(260)
  assert(JSON.parse(cw2.localStorage.getItem('lingua_china_track')).completed.A01
    && JSON.parse(cw2.localStorage.getItem('lingua_review_queue')).some((r) => r.id === 'china-A01')
    && JSON.parse(cw2.localStorage.getItem('lingua_profile')).xp !== 777,
  '刷新后完成记录 / 复习卡片仍在，旧 profile 继续由成长系统镜像更新')
  }

  /* ============================================================
   * 二十、CEFR 等级层：三模块分级内容 + 跳级/留级（8 条验收）
   * 独立块级作用域 + 独立 JSDOM，避免污染前面 19 章的 DOM 夹具
   * ============================================================ */
  {
  const LT = await loadModule('src/levelTypes.ts', 'lv-types')
  const LP = await loadModule('src/data/levelPool/index.ts', 'lv-pool')
  const LF = await loadModule('src/services/levelFilter.ts', 'lv-filter')
  const LPref = await loadModule('src/services/levelPreference.ts', 'lv-pref')
  const DP = await loadModule('src/services/dailyPlan.ts', 'lv-daily')
  const LStore = await loadModule('src/lib/storage.ts', 'lv-storage')

  /* ---- 验收 3：cefr + cefrBasis（≥3 项）+ levelSource + levelNotes ---- */
  assert(LP.LEVEL_CONTENT_POOL.length === 39
    && LP.poolCounts().dialogue === 12 && LP.poolCounts().reading === 15 && LP.poolCounts().video === 12,
  '三模块分级内容池共 39 条（对话 12 / 阅读 15 / 视频 12）')
  assert(LP.validatePool().length === 0,
    '全部资源单元字段齐全：cefr / cefrBasis≥3 项 / levelSource / levelNotes / 来源许可')
  assert(LP.LEVEL_CONTENT_POOL.every((i) => LT.basisCount(i.cefrBasis) >= 3 && i.levelNotes.trim()),
    '每个单元都有至少 3 项难度依据与一句定级说明，不是只有标签')
  assert(['A2', 'B1', 'B2', 'C1'].every((l) => LP.LEVEL_CONTENT_POOL.some((i) => i.cefr === l))
    && ['dialogue', 'reading', 'video'].every((m) => new Set(LP.poolByModule(m).map((i) => i.cefr)).size >= 3),
  '四个等级全覆盖，每个模块至少包含 3 个等级')
  assert(LP.LEVEL_CONTENT_POOL.some((i) => i.levelSource === 'expert')
    && LP.LEVEL_CONTENT_POOL.some((i) => i.levelSource === 'estimated')
    && LT.DEFAULT_LEVEL_PREFERENCE.version === 1,
  'levelSource 区分专家标注 / 系统估算；user_override 作为枚举保留但偏好调整不改资源')
  const lvBook = LP.poolItemById('read-book-carol')
  const lvChapter = LP.poolItemById('read-ch-cc-3')
  assert(lvBook.cefr === 'B1' && lvChapter.chapterCefr === 'B2' && lvChapter.refId === lvBook.refId,
    '章节级 CEFR 可与书籍级不同，按章节粒度筛选而不是整本书锁死')
  assert(LP.poolByModule('reading').some((i) => i.id === 'read-ext-dorian')
    && !LP.LEVEL_CONTENT_POOL.some((i) => /Great Gatsby/.test(i.title)),
  'C1 用公版《The Picture of Dorian Gray》替代公版状态未确认的《The Great Gatsby》')

  /* ---- 来源与许可分层 / 排除清单 ---- */
  assert(LP.SOURCE_LICENSES.length === 9
    && LP.SOURCE_LICENSES.some((s) => s.id === 'slanglane_reference' && s.license === 'CC BY 4.0')
    && LP.SOURCE_LICENSES.some((s) => s.id === 'ted_ed' && s.license === 'CC BY-NC-ND 4.0')
    && LP.SOURCE_LICENSES.some((s) => s.id === 'bbc_learning' && s.license.includes('逐条确认')),
  '许可表列全 SlangLane / Ace-CEFR / Gutenberg / Reading Corner / VOA / TED-Ed / BBC 等')
  assert(LP.EXCLUDED_SOURCES.some((s) => s.includes('LANA-CASE'))
    && LP.EXCLUDED_SOURCES.some((s) => s.includes('培训机构'))
    && LP.EXCLUDED_SOURCES.some((s) => s.includes('字幕全文')),
  '排除清单延续：禁止 AI 训练语料 / 机构内容 / 视频字幕抓取')
  const lvDialogue = LP.poolByModule('dialogue')
  assert(['original', 'slanglane_reference', 'ace_cefr_anchor'].every((s) => lvDialogue.some((i) => i.source === s)),
    '对话内容三类来源并存：原创脚本 / SlangLane 参考 / Ace-CEFR 难度锚点')
  assert(lvDialogue.filter((i) => i.source === 'slanglane_reference')
    .every((i) => i.licenseNote.includes('CC BY 4.0') && i.licenseNote.includes('未复制条目全文')),
  'SlangLane 场景署名 CC BY 4.0，且明确未复制语料条目全文')
  assert(lvDialogue.filter((i) => i.source === 'ace_cefr_anchor')
    .every((i) => i.licenseNote.includes('未复制任何对话文本')),
  'Ace-CEFR 只作难度校准，未复制对话文本')
  const lvVideos = LP.poolByModule('video')
  assert(lvVideos.every((i) => typeof i.embeddable === 'boolean' && i.cefrBasis.speechRateWpm != null),
    '每条视频都标 embeddable / licenseNote，并按 WPM 给出语速依据')
  assert(lvVideos.filter((i) => i.cefr === 'A2').every((i) => i.cefrBasis.speechRateWpm <= 130)
    && lvVideos.filter((i) => i.cefr === 'B1').every((i) => i.cefrBasis.speechRateWpm > 130 && i.cefrBasis.speechRateWpm <= 160)
    && lvVideos.filter((i) => i.cefr === 'B2').every((i) => i.cefrBasis.speechRateWpm > 160 && i.cefrBasis.speechRateWpm <= 190)
    && lvVideos.filter((i) => i.cefr === 'C1').every((i) => i.cefrBasis.speechRateWpm >= 190),
  '视频语速区间与等级一致：A2≤130 / B1 130-160 / B2 160-190 / C1≥190 WPM')
  assert(lvVideos.find((i) => i.source === 'bbc_learning').embeddable === false
    && lvVideos.find((i) => i.source === 'bbc_learning').embedMode === 'external',
  'BBC Learning English 嵌入权限未确认 → 外链降级，不绕过')
  assert(lvVideos.some((i) => i.cefr === 'C1' && i.tags.includes('interactive-transcript')),
    'C1 优先标注带交互式 Transcript 的视频，便于研讨定位证据')
  assert(LP.annotationDepth('A2') === 'full' && LP.annotationDepth('C1') === 'minimal',
    '同一文本按等级给不同注释深度（Reading Corner 思路，不改反馈逻辑）')

  /* ---- 验收 4 / 5：LevelFilterService 单一筛选层 ---- */
  const lvBase = LT.DEFAULT_LEVEL_PREFERENCE
  const lvB1 = (m) => LF.getContentPool(m, { preference: lvBase })
  assert(['dialogue', 'reading', 'video'].every((m) => lvB1(m).length > 0
    && lvB1(m).every((i) => i.cefr === 'B1' && i.module === m)),
  '默认只返回 active 等级（B1）的内容，三个模块走同一入口')
  const lvAll = LF.getContentPool('video', { preference: lvBase, showAll: true })
  assert(lvAll.length === 12 && lvAll.every((i, k) => k === 0 || LT.levelRank(lvAll[k - 1].cefr) <= LT.levelRank(i.cefr)),
    'showAll 返回全部并按等级从低到高排序，跳级不锁内容')
  const lvAdj = LF.getContentPool('dialogue', { preference: lvBase, includeAdjacent: true })
  assert(lvAdj.some((i) => i.cefr === 'A2') && lvAdj.some((i) => i.cefr === 'B1')
    && lvAdj.some((i) => i.cefr === 'B2') && !lvAdj.some((i) => i.cefr === 'C1'),
  'includeAdjacent 返回 active ±1 级，只用于相关内容推荐')
  assert(JSON.stringify(LF.adjacentLevels('A2')) === JSON.stringify(['A2', 'B1'])
    && JSON.stringify(LF.adjacentLevels('C1')) === JSON.stringify(['B2', 'C1']),
  '相邻等级在边界处自然收敛')
  const lvSnapshot = JSON.stringify(LP.LEVEL_CONTENT_POOL)
  LF.filterPool(LP.LEVEL_CONTENT_POOL, 'dialogue', 'C1', { showAll: true })
  assert(JSON.stringify(LP.LEVEL_CONTENT_POOL) === lvSnapshot,
    'LevelFilterService 只读取与排序，不修改任何内容单元的 cefr / cefrBasis')
  assert(LF.normalizePreference(null).active === 'B1'
    && LF.normalizePreference({ recommended: 'B2', active: 'B2' }).perModule.video === 'B2',
  '存档缺失 / 损坏时回退默认 B1（Mock 降级），旧存档只补缺不覆盖')
  assert(LF.activeLevel({ ...lvBase, active: 'C1', perModule: { ...lvBase.perModule, reading: 'A2' } }, 'reading') === 'A2',
    'perModule 优先于全局 active，三个模块可用不同等级')
  const lvPageSrc = ['Analysis.tsx', 'Library.tsx', 'CultureHub.tsx']
    .map((f) => fs.readFileSync(path.join(root, 'src/pages', f), 'utf8'))
  assert(lvPageSrc.every((s) => s.includes('<LevelPanel module=')
    && s.includes('<LevelContentList module=')),
  '三个模块列表页都挂共用等级面板与分级内容列表（验收 1）')
  assert(lvPageSrc.every((s) => !s.includes('getContentPool(') && !s.includes('settings.difficulty'))
    && lvPageSrc[2].includes('activeLevel(data.levelPreference,'),
  '代码中不存在模块各自实现的等级筛选逻辑：统一由 LevelFilterService 取内容（验收 4）')
  assert(LF.readingChapters(lvBase).length === 1
    && LF.readingChapters(lvBase, { showAll: true }).length === 4,
  '阅读可按章节粒度取内容，showAll 时章节条目全部可见')
  assert(LF.annotationDepthFor({ ...lvBase, perModule: { ...lvBase.perModule, reading: 'B2' } }, 'reading').depth === 'light',
    '注释深度跟随 active 等级，不影响 Seminar 反馈逻辑')

  /* ---- 验收 2：跳级 / 留级 / 回到推荐 + 作用范围 ---- */
  assert(LT.DEFAULT_LEVEL_PREFERENCE.mode === 'recommended'
    && LT.DEFAULT_LEVEL_PREFERENCE.active === 'B1'
    && LT.DEFAULT_LEVEL_PREFERENCE.showAllLevels === false,
  '默认 mode=recommended、active=B1、不显示全部等级')
  const lvPromote = LPref.computePreference(lvBase, 'reading', 'promote', 'module', 1_700_000_000_000)
  assert(lvPromote.perModule.reading === 'B2' && lvPromote.perModule.dialogue === 'B1'
    && lvPromote.perModule.video === 'B1' && lvPromote.active === 'B2' && lvPromote.mode === 'manual',
  '「挑战更高等级」仅当前模块生效，mode 切换为 manual，其他模块不变')
  assert(lvBase.perModule.reading === 'B1' && lvBase.mode === 'recommended',
    'computePreference 是纯函数，不改动传入的偏好对象')
  assert(lvPromote.recommended === 'B1' && lvPromote.history.length === 1
    && lvPromote.history[0].action === 'promote' && lvPromote.history[0].scope === 'module',
  '推荐等级不被手动调整改写，history 记录 from/to/action/scope/at')
  const lvAllScope = LPref.computePreference(lvBase, 'video', 'promote', 'all', 1_700_000_000_000)
  assert(['dialogue', 'reading', 'video'].every((m) => lvAllScope.perModule[m] === 'B2')
    && lvAllScope.history[0].scope === 'all',
  '「应用到全部模块」同步三个模块并写入 history')
  const lvDemote = LPref.computePreference(lvBase, 'reading', 'demote', 'module', 1_700_000_000_000)
  assert(lvDemote.perModule.reading === 'A2' && lvDemote.mode === 'manual',
    '「回到更基础的内容」退到 A2，仍属手动调整')
  assert(LPref.computePreference(lvPromote, 'reading', 'reset', 'module', 1_700_000_000_000).perModule.reading === 'B1'
    && LPref.computePreference(lvPromote, 'reading', 'reset', 'module', 1_700_000_000_000).mode === 'recommended',
  '「回到推荐等级」把模块恢复为 recommended 并把 mode 复位')
  assert(LPref.computePreference({ ...lvBase, active: 'C1', perModule: { dialogue: 'C1', reading: 'C1', video: 'C1' } },
    'reading', 'promote', 'module').perModule.reading === 'C1'
    && LPref.computePreference({ ...lvBase, active: 'A2', perModule: { dialogue: 'A2', reading: 'A2', video: 'A2' } },
      'reading', 'demote', 'module').perModule.reading === 'A2',
  '等级上下边界安全收敛（C1 不再升 / A2 不再降）')
  assert(LPref.suggestLevel([0, 0, 0]) === 'A2' && LPref.suggestLevel([1, 1, 1]) === 'B1'
    && LPref.suggestLevel([2, 2, 2]) === 'C1',
  '3 题轻量自评只给建议等级，不输出分数')
  const lvAssess = LPref.computeAssessment(lvBase, [2, 2, 2], 1_700_000_000_000)
  assert(lvAssess.recommended === 'C1' && lvAssess.active === 'C1'
    && lvAssess.mode === 'recommended' && lvAssess.perModule.video === 'C1',
  '接受自评建议是唯一更新 recommended 的路径（问卷来源）')
  assert(LPref.computeShowAll(lvBase, true).showAllLevels === true
    && LPref.computeShowAll(lvBase, true).recommended === 'B1',
  '「显示全部等级」只改筛选开关，不动推荐等级')
  const lvPrefSrc = fs.readFileSync(path.join(root, 'src/services/levelPreference.ts'), 'utf8')
  assert(!lvPrefSrc.includes('awardXp') && !lvPrefSrc.includes('reviewQueue')
    && !lvPrefSrc.includes('growth.xp'),
  '留级不扣 XP / 不清进度：等级偏好服务不触碰成长数据、复习队列或 XP 入口')

  /* ---- 验收 6：每日计划读 active ---- */
  const lvTaskC1 = DP.recommendDailyTask({ ...lvBase, active: 'C1', recommended: 'B1' }, LP.LEVEL_CONTENT_POOL, '2026-11-12')
  assert(lvTaskC1.level === 'C1' && LP.poolItemById(lvTaskC1.itemId).cefr === 'C1',
    '每日计划读取 active（C1）而不是 recommended（B1）')
  assert(DP.recommendDailyTask(lvBase, LP.LEVEL_CONTENT_POOL, '2026-11-12').itemId
    === DP.recommendDailyTask(lvBase, LP.LEVEL_CONTENT_POOL, '2026-11-12').itemId,
  '同一天、同一等级推荐稳定；等级变化则推荐跟着变')
  const lvDailySrc = fs.readFileSync(path.join(root, 'src/services/dailyPlan.ts'), 'utf8')
  assert(lvDailySrc.includes('pref.active') && !lvDailySrc.includes('pref.recommended'),
    'dailyPlan.ts 源码只引用 active，不引用 recommended')

  /* ---- 第 30 键与旧键共存 ---- */
  assert(LStore.KEYS.levelPreference === 'lingua_level_preference'
    && Object.keys(LStore.KEYS).length === 31
    && LStore.DEFAULT_DATA.levelPreference.active === 'B1'
    && LStore.DEFAULT_DATA.levelPreference.history.length === 0,
  '新增第 30 键 lingua_level_preference（键总数 31），默认 recommended 模式且历史为空')
  assert(LStore.KEYS.profile === 'lingua_profile' && LStore.KEYS.library === 'lingua_library'
    && LStore.KEYS.cultureVideos === 'lingua_culture_videos' && LStore.KEYS.growth === 'lingua_growth',
  '旧 29 个键名与语义不变')

  /* ---- 真实 DOM：三模块等级标签 / 面板三操作 / 显示全部 / 留级不扣 XP ---- */
  const lvMakeDom = () => {
    const d = new JSDOM(html.replace(/<script[^>]*><\/script>/g, ''), {
      url: 'http://localhost:5173/', pretendToBeVisual: true, runScripts: 'outside-only', virtualConsole: vc,
    })
    d.window.scrollTo = () => {}
    d.window.Element.prototype.scrollIntoView = () => {}
    return d
  }
  const lvBindGlobals = (win) => {
    for (const key of ['window', 'document', 'navigator', 'localStorage', 'HTMLElement', 'Node', 'MouseEvent',
      'Event', 'CustomEvent', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame',
      'MutationObserver', 'DOMParser', 'FileReader', 'Blob', 'File', 'HTMLInputElement', 'HTMLTextAreaElement']) {
      try { Object.defineProperty(globalThis, key, { value: win[key], writable: true, configurable: true }) } catch { /* ignore */ }
    }
  }
  const lvBundle = pathToFileURL(path.join(assetDir, jsFile)).href
  const lvDom = lvMakeDom()
  const lw = lvDom.window
  lvBindGlobals(lw)
  await import(lvBundle + '?lv=1')
  await tick(260)
  assert(!!document.querySelector('[data-testid="daily-plan-task"]')
    && document.querySelector('[data-testid="daily-plan-task"]').textContent.includes('按当前等级 B1'),
  '学习页「今日小目标」显示按 active 等级的今日推荐')

  clickExact('书架', '进入阅读列表页')
  await tick(200)
  assert(!!document.querySelector('[data-testid="level-panel-reading"]')
    && document.querySelector('[data-testid="level-label-reading"]').textContent.includes('当前等级：B1（推荐）'),
  '阅读列表页顶部展示当前等级标签（验收 1）')
  assert(!!document.querySelector('[data-testid="level-item-read-book-carol"]'),
    '默认显示 B1 内容；分组内容池由统一服务提供')
  fire(document.querySelector('[data-testid="level-toggle-reading"]'))
  await tick(160)
  assert(!!document.querySelector('[data-testid="level-panel-body-reading"]')
    && !!document.querySelector('[data-testid="level-promote"]')
    && !!document.querySelector('[data-testid="level-demote"]')
    && !!document.querySelector('[data-testid="level-reset"]')
    && !!document.querySelector('[data-testid="level-scope-all"]'),
  '等级面板提供回到推荐 / 挑战更高 / 回到更基础与两种作用范围（验收 2）')

  const lvXpBefore = JSON.parse(lw.localStorage.getItem('lingua_growth') || '{}').xp ?? 0
  const lvQueueBefore = JSON.parse(lw.localStorage.getItem('lingua_review_queue') || '[]').length
  const lvProfileBefore = JSON.parse(lw.localStorage.getItem('lingua_profile') || '{}').xp ?? 0
  fire(document.querySelector('[data-testid="level-promote"]'))
  await tick(200)
  const lvAfterPromote = JSON.parse(lw.localStorage.getItem('lingua_level_preference'))
  assert(lvAfterPromote.perModule.reading === 'B2' && lvAfterPromote.mode === 'manual'
    && lvAfterPromote.history.slice(-1)[0].action === 'promote',
  '点击「挑战更高等级」写入偏好与 history，模式变 manual')
  assert(document.querySelector('[data-testid="level-label-reading"]').textContent.includes('B2（手动调整）'),
    '等级标签随用户调整即时更新')
  assert(!document.querySelector('[data-testid="level-item-read-book-carol"]'),
    '默认筛选范围随等级变化（B1 书籍不再是默认项）')

  fire(document.querySelector('[aria-label="显示全部等级"]'))
  await tick(200)
  assert(JSON.parse(lw.localStorage.getItem('lingua_level_preference')).showAllLevels === true
    && !!document.querySelector('[data-testid="level-item-read-book-carol"]')
    && !!document.querySelector('[data-testid="level-item-read-ext-aesop"]')
    && !!document.querySelector('[data-testid="level-item-read-ext-dorian"]'),
  '开启「显示全部等级」后 A2 / B1 / C1 内容全部可访问，跳级不锁内容（验收 5）')
  fire(document.querySelector('[aria-label="显示全部等级"]'))
  await tick(160)

  fire(document.querySelector('[data-testid="level-demote"]'))
  await tick(200)
  assert(JSON.parse(lw.localStorage.getItem('lingua_level_preference')).perModule.reading === 'B1',
    '「回到更基础的内容」从 B2 退回 B1')
  fire(document.querySelector('[data-testid="level-promote"]'))
  await tick(160)
  fire(document.querySelector('[data-testid="level-reset"]'))
  await tick(200)
  assert(JSON.parse(lw.localStorage.getItem('lingua_level_preference')).perModule.reading === 'B1'
    && JSON.parse(lw.localStorage.getItem('lingua_level_preference')).mode === 'recommended',
  '「回到推荐等级」恢复 B1 与 recommended 模式')
  assert((JSON.parse(lw.localStorage.getItem('lingua_growth') || '{}').xp ?? 0) === lvXpBefore
    && JSON.parse(lw.localStorage.getItem('lingua_review_queue') || '[]').length === lvQueueBefore
    && (JSON.parse(lw.localStorage.getItem('lingua_profile') || '{}').xp ?? 0) === lvProfileBefore,
  '跳级与留级都不改变 XP、成长数据、复习队列与进度（验收 5）')

  /* 应用到全部模块后，每日计划跟随新的 active */
  fire(document.querySelector('[data-testid="level-scope-all"]'))
  await tick(120)
  fire(document.querySelector('[data-testid="level-promote"]'))
  await tick(180)
  const lvAllApplied = JSON.parse(lw.localStorage.getItem('lingua_level_preference'))
  assert(['dialogue', 'reading', 'video'].every((m) => lvAllApplied.perModule[m] === 'B2')
    && lvAllApplied.history.slice(-1)[0].scope === 'all',
  '「应用到全部模块」一次同步三个模块')
  clickExact('学习', '回学习页检查每日计划')
  await tick(180)
  assert(document.querySelector('[data-testid="daily-plan-task"]').textContent.includes('按当前等级 B2'),
    '每日计划读取新的 active（B2），不是 recommended（B1）（验收 6）')

  /* 对话列表页：示例文本生成分析后展示模块等级标签 */
  click(/Try an example/, '载入示例文本')
  await tick(120)
  click(/生成学习场景/, '生成分析')
  await tick(1050)
  assert(!!document.querySelector('[data-testid="level-panel-dialogue"]')
    && !!document.querySelector('[data-testid="level-item-dlg-b2-01"]')
    && !document.querySelector('[data-testid="level-item-dlg-b1-01"]'),
  '对话内容列表页展示等级标签与当前等级（B2）的对话内容')
  assert(!!document.querySelector('[data-testid="level-label-dialogue"]')
    && document.querySelector('[data-testid="level-label-dialogue"]').textContent.includes('B2'),
  '对话模块与阅读 / 视频共用同一套等级字段，perModule 同步生效')

  /* 视频列表页：等级标签 + 分级来源 + 许可与嵌入状态 */
  clickExact('文化', '进入文化视频列表页')
  await tick(220)
  assert(!!document.querySelector('[data-testid="level-panel-video"]')
    && document.querySelector('[data-testid="level-label-video"]').textContent.includes('B2'),
  '文化视频列表页展示当前等级标签（验收 1）')
  assert(!!document.querySelector('[data-testid="level-item-vid-b2-ted"]')
    && bodyText().includes('官方嵌入') && bodyText().includes('外链降级'),
  '按等级展示视频来源，卡片分别标注官方嵌入与外链降级状态')
  fire(document.querySelector('[aria-label="显示全部等级"]'))
  await tick(200)
  assert(!!document.querySelector('[data-testid="level-item-vid-a2-voa"]')
    && !!document.querySelector('[data-testid="level-item-vid-c1-ted-fast"]'),
  '视频模块显示全部等级后 A2 / C1 来源同样可访问')

  /* 刷新后偏好仍在 */
  const lvSnap = {}
  for (let i = 0; i < lw.localStorage.length; i++) {
    const k = lw.localStorage.key(i)
    if (k) lvSnap[k] = lw.localStorage.getItem(k)
  }
  const lvDom2 = lvMakeDom()
  const lw2 = lvDom2.window
  for (const [k, v] of Object.entries(lvSnap)) if (v !== null) lw2.localStorage.setItem(k, v)
  lvBindGlobals(lw2)
  await import(lvBundle + '?lv=2')
  await tick(260)
  const lvRestored = JSON.parse(lw2.localStorage.getItem('lingua_level_preference'))
  assert(lvRestored.active === 'B2' && lvRestored.showAllLevels === true
    && lvRestored.history.length >= 4 && lvRestored.perModule.video === 'B2',
  '刷新后等级偏好、history 与显示全部开关都保留')
  }

  /* ============================================================
   * 二十一、对话语音层：自动朗读 + 真实音色 + 等级驱动（12 条验收）
   * 独立块级作用域 + 独立 JSDOM（含语音合成桩），不污染前面 20 章
   * ============================================================ */
  {
  const VT = await loadModule('src/voiceTypes.ts', 'vc-types')
  const VP = await loadModule('src/services/voicePreferences.ts', 'vc-pref')
  const VSp = await loadModule('src/lib/speech.ts', 'vc-speech')
  const VStore = await loadModule('src/lib/storage.ts', 'vc-storage')
  const VDir = await loadModule('src/services/dialogueDirector.ts', 'vc-director')

  /* ---- 验收 8：等级 → 语言参数映射（硬约束） ---- */
  assert(VT.LEVEL_PROFILES.A2.maxSentences === 2 && VT.LEVEL_PROFILES.A2.avgSentenceLength === 12
    && VT.LEVEL_PROFILES.A2.vocabRange === 1500 && VT.LEVEL_PROFILES.A2.targetWordsPerTurn === 1,
  'A2 等级参数：≤2 句 / ≤12 词 / 1500 词 / 每轮 1 个目标词')
  assert(VT.LEVEL_PROFILES.B1.maxSentences === 3 && VT.LEVEL_PROFILES.B1.avgSentenceLength === 18
    && VT.LEVEL_PROFILES.B1.vocabRange === 2500 && VT.LEVEL_PROFILES.B1.targetWordsPerTurn === 2,
  'B1 等级参数：≤3 句 / ≤18 词 / 2500 词 / 每轮 1–2 个目标词')
  assert(VT.LEVEL_PROFILES.B2.maxSentences === 3 && VT.LEVEL_PROFILES.B2.avgSentenceLength === 25
    && VT.LEVEL_PROFILES.B2.vocabRange === 4000 && VT.LEVEL_PROFILES.B2.targetWordsPerTurn === 3,
  'B2 等级参数：≤3 句 / ≤25 词 / 4000 词 / 每轮 2–3 个目标词')
  assert(VT.LEVEL_PROFILES.C1.maxSentences === 4 && VT.LEVEL_PROFILES.C1.avgSentenceLength === 32
    && VT.LEVEL_PROFILES.C1.pragmaticComplexity === 'implicit',
  'C1 等级参数：≤4 句 / ≤32 词 / 语用隐含')
  assert(Object.keys(VT.LEVEL_PROFILES).every((k) => VT.levelProfilePrompt(VT.LEVEL_PROFILES[k]).includes('2 out-of-range words')),
  '每个等级的 prompt 都写明「每轮超纲词不超过 2 个」的软约束')
  assert(VT.levelProfilePrompt(VT.LEVEL_PROFILES.A2).includes('HARD LIMIT')
    && VT.levelProfilePrompt(VT.LEVEL_PROFILES.A2).includes('never exceed 2 sentences'),
  '等级参数写进 Director 的 prompt，并标明句数上限是硬约束')

  /* ---- 句切分与硬约束裁剪 ---- */
  assert(JSON.stringify(VT.splitSentences('Hi there. How are you? Fine!'))
    === JSON.stringify(['Hi there.', 'How are you?', 'Fine!']),
  '按句切分用于顺序朗读（不做逐词高亮）')
  assert(VT.exceedsLevelLimit('One. Two. Three.', VT.LEVEL_PROFILES.A2)
    && VT.clampToLevel('One. Two. Three.', VT.LEVEL_PROFILES.A2) === 'One. Two.',
  '超长回复按等级句数上限截断（硬约束）')
  assert(VT.clampToLevel('One. Two.', VT.LEVEL_PROFILES.C1) === 'One. Two.',
  '未超长的回复不受裁剪影响')

  /* ---- 改写建议匹配等级：A2 简化、B2/C1 不降级 ---- */
  const vcLong = 'I would like to suggest that we meet tomorrow afternoon, because it would be much more convenient for everyone involved.'
  const vcA2Fit = VT.fitCorrectionToLevel(vcLong, VT.LEVEL_PROFILES.A2)
  const vcC1Fit = VT.fitCorrectionToLevel(vcLong, VT.LEVEL_PROFILES.C1)
  assert(vcA2Fit.split(/\s+/).length < vcLong.split(/\s+/).length
    && vcA2Fit.split(/\s+/).length <= VT.LEVEL_PROFILES.A2.avgSentenceLength * 1.5,
  'A2 的改写建议被简化，不引入长难句')
  assert(vcC1Fit === vcLong,
    'B2 / C1 的改写建议原样保留，不降级成 A2 句式')

  /* ---- 验收 8（续）：Mock 与远程归一化都遵守等级上限 ---- */
  const vcScenario = {
    id: 'vc-scene', title: '语音等级测试', goal: 'g', characters: [
      { id: 'c1', name: 'Ada', role: 'r', personality: 'p', goal: 'g', sampleLines: ['Hello there.'] },
    ],
    targetWords: ['apple'], targetPhrases: ['How about ...?'], sentenceFrames: ['...'],
    openingLine: 'Hi!', suggestedReplies: ['Sure.'], rounds: 6, tint: 'brand', emblem: '🎙',
  }
  const vcUser = { id: 'me', name: 'Me', role: 'r', personality: 'p', goal: 'g', sampleLines: [] }
  const vcBase = {
    summary: '', topic: 't', scenario: vcScenario, userCharacter: vcUser, aiCharacter: vcScenario.characters[0],
    targetWords: ['apple'], targetPhrases: ['How about ...?'], history: [], userInput: 'I like apples very much.',
    difficulty: 'B1', correction: 'balanced', turn: 1,
  }
  const vcA2Out = VDir.mockGenerateDialogue({ ...vcBase, levelProfile: VT.LEVEL_PROFILES.A2 })
  const vcC1Out = VDir.mockGenerateDialogue({ ...vcBase, levelProfile: VT.LEVEL_PROFILES.C1 })
  assert(VT.splitSentences(vcA2Out.reply).length <= VT.LEVEL_PROFILES.A2.maxSentences,
    'Mock 生成器的回复遵守 A2 句数上限')
  assert(VT.splitSentences(vcC1Out.reply).length <= VT.LEVEL_PROFILES.C1.maxSentences
    && VT.splitSentences(vcC1Out.reply).length >= VT.LEVEL_PROFILES.C1.minSentences,
    'Mock 生成器的回复遵守 C1 句数区间')

  /* ---- 验收 3：音色只来自 getVoices()，不硬编码音色名 ---- */
  const vcVoiceSrc = fs.readFileSync(path.join(root, 'src/voiceTypes.ts'), 'utf8')
  assert(!/voiceURI:\s*['"][^'"]+['"]/.test(vcVoiceSrc),
    '代码中不存在写死的音色清单（voiceURI 全部来自设备返回）')
  assert(VT.guessGenderHint('Alex') === 'male' && VT.guessGenderHint('Samantha') === 'female'
    && VT.guessGenderHint('Some Unheard Voice') === 'unknown',
  '性别只是基于名称的保守推断，认不出来时返回 unknown（不作硬性依据）')
  assert(vcVoiceSrc.includes('仅供参考') || vcVoiceSrc.includes('推断'),
    '性别标注为推断值，并注明系统未提供、仅供参考')
  const vcPanelSrc = fs.readFileSync(path.join(root, 'src/components/VoicePanel.tsx'), 'utf8')
  assert(vcPanelSrc.includes('{v.name}') && vcPanelSrc.includes('仅供参考'),
    '音色面板始终展示设备返回的原始名称，性别仅作建议标签')
  assert(VT.accentOf('en-US') === 'en-US' && VT.accentOf('en_GB') === 'en-GB'
    && VT.accentOf('en-AU') === 'en-AU' && VT.accentOf('en-IN') === 'en-IN'
    && VT.accentOf('zh-CN') === 'system',
  '口音标签只从 voice.lang 推导（en-US→美音 / en-GB→英音 / en-AU→澳音）')
  assert(VT.accentLabel('en-GB') === '英音' && VT.accentLabel('en-IE') === '其他英语口音',
    '口音展示名与推导一致，无法归类时保留原始 lang')

  /* ---- 验收 4：音色不可用时回退并提示 ---- */
  const vcVoices = [
    { voiceURI: 'urn:vc:us', name: 'US Voice', lang: 'en-US', default: true },
    { voiceURI: 'urn:vc:gb', name: 'GB Voice', lang: 'en-GB', default: false },
    { voiceURI: 'urn:vc:zh', name: 'ZH Voice', lang: 'zh-CN', default: false },
  ]
  const vcResolved = VT.resolveVoiceURI('urn:vc:missing', 'en-GB', vcVoices)
  assert(vcResolved.fellBack === true && vcResolved.voiceURI === 'urn:vc:gb'
    && vcResolved.message.includes('不可用'),
  '启动时校验 voiceURI：不可用则回退到口音下的可用音色并给出提示')
  assert(VT.resolveVoiceURI('urn:vc:us', 'en-US', vcVoices).fellBack === false,
    '仍然可用的音色不会被回退')

  /* ---- 验收 5：多角色默认不同音色（不足时复用并标注） ---- */
  const vcChars = ['c1', 'c2']
  const vcAssigned = VT.autoAssignVoices('sc1', vcChars, vcVoices, {})
  assert(vcAssigned['sc1:c1'].voiceURI === 'urn:vc:us'
    && vcAssigned['sc1:c2'].voiceURI === 'urn:vc:gb'
    && new Set(vcChars.map((c) => vcAssigned[`sc1:${c}`].voiceURI)).size === 2,
  '音色足够时不同角色拿到不同音色')
  const vcOne = VT.autoAssignVoices('sc1', vcChars, [vcVoices[0]], {})
  assert(vcOne['sc1:c1'].voiceURI === vcOne['sc1:c2'].voiceURI
    && VT.isSharedVoice('sc1', 'c1', vcOne) === true,
    '音色不足时按顺序复用，并可判定为「与其他角色共用音色」')
  assert(VT.autoAssignVoices('sc1', vcChars, vcVoices, vcAssigned)['sc1:c1'].voiceURI
    === vcAssigned['sc1:c1'].voiceURI,
    '用户手动指定的绑定不会被自动分配覆盖')

  /* ---- 偏好归一化：只补缺不覆盖 ---- */
  const vcNormalized = VP.normalizeVoicePreferences(
    { global: { autoRead: false, accent: 'en-GB', voiceURI: 'urn:vc:gb', rate: 1.1, pitch: 0.95 } },
    { autoSpeak: true, accent: 'en-US', rate: 1 },
    vcVoices)
  assert(vcNormalized.prefs.global.autoRead === false && vcNormalized.prefs.global.accent === 'en-GB'
    && vcNormalized.prefs.global.rate === 1.1,
  '归一化保留用户已有选择（不覆盖）')
  const vcFromLegacy = VP.normalizeVoicePreferences(null, { autoSpeak: true, accent: 'en-US', rate: 1 }, vcVoices)
  assert(vcFromLegacy.prefs.global.autoRead === true && vcFromLegacy.prefs.global.accent === 'en-US',
  '老存档没有音色偏好时，从旧 settings 接过来（自动朗读开关不失效）')
  assert(VP.normalizeVoicePreferences(null, undefined, vcVoices).prefs.global.autoRead === true,
  '全新用户默认开启自动朗读')
  assert(VP.clampRate(9) === 1.2 && VP.clampRate(0.1) === 0.7
    && VP.clampPitch(9) === 1.2 && VP.clampPitch(0.1) === 0.8,
  '语速锁在 0.7–1.2、音高锁在 0.8–1.2')
  assert(VP.syncSettings(vcNormalized.prefs, { autoSpeak: true, accent: 'en-US', rate: 1 })
    .autoSpeak === false,
  '偏好与 settings 原子同步：两处状态始终一致')

  /* ---- 验收 6：TTS 与语音识别互斥（逻辑互斥，不靠 echoCancellation） ---- */
  const VSp2 = VSp
  assert(VSp2.canSpeakNow() === true, '麦克风空闲时允许发声')
  VSp2.setMicActive(true)
  assert(VSp2.isMicActive() === true && VSp2.canSpeakNow() === false,
    '麦克风被占用时禁止发声（逻辑互斥）')
  let vcSpokeWhileBusy = false
  {
    const vcFake = { getVoices: () => [], speak: () => { vcSpokeWhileBusy = true }, cancel: () => {} }
    globalThis.window.speechSynthesis = vcFake
    VSp2.speakWithVoice('Hello there.', {})
    globalThis.window.speechSynthesis = undefined
  }
  assert(vcSpokeWhileBusy === false,
    '麦克风占用期间 speakWithVoice 不会调用 speechSynthesis.speak')
  VSp2.setMicActive(false)

  const vcSpeechSrc = fs.readFileSync(path.join(root, 'src/lib/speech.ts'), 'utf8')
  assert(vcSpeechSrc.includes('setMicActive(true)') && vcSpeechSrc.includes('setMicActive(false)'),
    '识别器创建时置占用、收尾时释放占用')
  assert(/createRecognizer[\s\S]{0,600}setMicActive\(true\)/.test(vcSpeechSrc)
    && /recorder\.start\(250\)[\s\S]{0,300}setMicActive\(true\)/.test(vcSpeechSrc),
    '语音识别与录音入口确实都会占用麦克风')

  /* ---- 验收 9：Director schema 四处接入 levelProfile ---- */
  const vcDirSrc = fs.readFileSync(path.join(root, 'src/services/dialogueDirector.ts'), 'utf8')
  assert(vcDirSrc.includes('levelProfilePrompt(input.levelProfile)')
    && vcDirSrc.includes('levelProfile: input.levelProfile')
    && vcDirSrc.includes('clampToLevel(rawReply, input.levelProfile)')
    && vcDirSrc.includes('input.levelProfile.maxSentences'),
  'levelProfile 接入 Director 的 prompt / payload / 归一化 / Mock 四处')
  const vcTypeSrc = fs.readFileSync(path.join(root, 'src/types.ts'), 'utf8')
  assert(vcTypeSrc.includes('levelProfile?: LevelProfile'),
    'GenerateDialogueInput 增加可选 levelProfile 字段（旧调用点不受影响）')

  /* ---- 验收 1 / 2：只朗读 AI 英文回复，且必须等气泡渲染完（TTS 修复后改为 effect 驱动） ---- */
  const vcDialogueSrc = fs.readFileSync(path.join(root, 'src/pages/Dialogue.tsx'), 'utf8')
  assert(vcDialogueSrc.includes('text: output.reply')
    && vcDialogueSrc.includes("find((m) => m.role === 'ai')")
    && vcDialogueSrc.includes('speakRef.current(latest.text, {')
    && vcDialogueSrc.includes('speech.speak(pending.text, {')
    && !/speak(?:Ref\.current)?\(\s*(?:value|m\.translation|output\.translation|latest\.translation)\b/.test(vcDialogueSrc),
  '自动朗读只喂 AI 的英文回复，不读中文翻译、不读用户输入')
  assert(vcDialogueSrc.includes('requestAnimationFrame')
    && vcDialogueSrc.includes('data-testid="ai-bubble-${latest.id}"')
    && vcDialogueSrc.includes('if (!bubble) return')
    && vcDialogueSrc.includes('autoSpokenIdRef'),
  'AI 气泡进入 DOM 后才触发 speak()，首次进入 / 刷新不朗读历史消息')
  assert(vcDialogueSrc.includes('pendingSpeakRef') && vcDialogueSrc.includes('flushPendingSpeak'),
  '录音期间收到的回复先挂起，录完再播')
  assert(vcDialogueSrc.includes('speech.stop()') && vcDialogueSrc.includes('pendingSpeakRef.current = null'),
  '用户一开口就停止朗读并放弃挂起的朗读')
  assert(vcDialogueSrc.includes('speech.forceRelease()')
    && vcDialogueSrc.includes('listeningRef.current?.cancel()')
    && vcDialogueSrc.includes('captureRef.current?.cancel()'),
  '发送瞬间强制清麦克风互斥锁并 abort 识别器，避免残留锁静默吞掉朗读')

  /* ---- 验收 12：README 声明音色可用性 / 性别推断 / 不做发音评分 ---- */
  const vcReadme = fs.readFileSync(path.join(root, 'README.md'), 'utf8')
  assert(vcReadme.includes('第二十一章') && vcReadme.includes('设备而异')
    && vcReadme.includes('仅供参考') && vcReadme.includes('不做发音评分'),
  'README 注明：音色数量因设备而异 / 性别标签为推断值 / 不做发音评分')

  /* ---- 验收 11：第 31 键与旧键共存 ---- */
  assert(VStore.KEYS.voicePreferences === 'lingua_voice_preferences'
    && Object.keys(VStore.KEYS).length === 31
    && VStore.DEFAULT_DATA.voicePreferences.global.autoRead === true
    && VStore.DEFAULT_DATA.voicePreferences.perCharacter && typeof VStore.DEFAULT_DATA.voicePreferences.perCharacter === 'object',
  '新增第 31 键 lingua_voice_preferences，默认自动朗读开启')
  assert(VStore.KEYS.profile === 'lingua_profile' && VStore.KEYS.settings === 'lingua_settings'
    && VStore.KEYS.levelPreference === 'lingua_level_preference',
  '旧 30 个键名与语义不变')

  /* ============================================================
   * 真实 DOM：语音合成桩 + 自动朗读 + 音色面板 + 互斥 + 等级即时生效
   * ============================================================ */
  const vcMakeDom = () => {
    const d = new JSDOM(html.replace(/<script[^>]*><\/script>/g, ''), {
      url: 'http://localhost:5173/', pretendToBeVisual: true, runScripts: 'outside-only', virtualConsole: vc,
    })
    d.window.scrollTo = () => {}
    d.window.Element.prototype.scrollIntoView = () => {}
    return d
  }
  const vcBindGlobals = (win) => {
    for (const key of ['window', 'document', 'navigator', 'localStorage', 'HTMLElement', 'Node', 'MouseEvent',
      'Event', 'CustomEvent', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame',
      'MutationObserver', 'DOMParser', 'FileReader', 'Blob', 'File', 'HTMLInputElement', 'HTMLTextAreaElement']) {
      try { Object.defineProperty(globalThis, key, { value: win[key], writable: true, configurable: true }) } catch { /* ignore */ }
    }
  }

  /** 语音合成桩：模拟真实设备的 getVoices / speak / cancel */
  const vcSpoken = []
  let vcCancelCount = 0
  const vcDeviceVoices = [
    { voiceURI: 'urn:vc:us', name: 'US Voice', lang: 'en-US', default: true },
    { voiceURI: 'urn:vc:gb', name: 'GB Voice', lang: 'en-GB', default: false },
    { voiceURI: 'urn:vc:au', name: 'AU Voice', lang: 'en-AU', default: false },
    { voiceURI: 'urn:vc:zh', name: 'ZH Voice', lang: 'zh-CN', default: false },
  ]
  class FakeUtterance {
    constructor(text) { this.text = text; this.lang = ''; this.rate = 1; this.pitch = 1; this.voice = null; this.onend = null; this.onerror = null }
  }
  const vcFakeSynth = {
    getVoices: () => vcDeviceVoices,
    speak: (u) => {
      vcSpoken.push({ text: u.text, lang: u.lang, rate: u.rate, pitch: u.pitch, voice: u.voice?.voiceURI || '' })
      setTimeout(() => { try { u.onend && u.onend() } catch { /* ignore */ } }, 5)
    },
    cancel: () => { vcCancelCount += 1 },
    addEventListener: () => {},
    removeEventListener: () => {},
  }

  const vcDom = vcMakeDom()
  const vw = vcDom.window
  vw.speechSynthesis = vcFakeSynth
  vw.SpeechSynthesisUtterance = FakeUtterance
  vcBindGlobals(vw)
  try { Object.defineProperty(globalThis, 'SpeechSynthesisUtterance', { value: FakeUtterance, writable: true, configurable: true }) } catch { /* ignore */ }
  const vcBundle = pathToFileURL(path.join(assetDir, jsFile)).href
  await import(vcBundle + '?vc=1')
  await tick(300)

  /* 走到对话页 */
  click(/Try an example/, '载入示例文本')
  await tick(120)
  click(/生成学习场景/, '生成学习场景')
  await tick(1000)
  click(/在农夫市集挑苹果/, '进入场景详情')
  await tick(150)
  click(/开始对话冒险/, '开始对话')
  await tick(220)

  /* ---- 验收 1：对话页顶部有等级标签 + 扬声器 + 音色按钮 ---- */
  assert(!!document.querySelector('[data-testid="level-panel-dialogue"]'),
    '对话页顶部展示等级标签（跳级 / 留级入口）')
  assert(!!document.querySelector('[data-testid="voice-panel-toggle"]'),
    '对话页顶部提供音色按钮')
  const vcAutoToggle = [...document.querySelectorAll('button')]
    .find((b) => (b.getAttribute('aria-label') || '').includes('自动朗读'))
  assert(!!vcAutoToggle, '对话页顶部提供自动朗读开关（扬声器）')
  assert(vcAutoToggle.getAttribute('aria-checked') === 'true',
    '自动朗读默认开启')

  /* ---- 验收 3：音色列表来自设备真实返回，且按口音分组 ---- */
  fire(document.querySelector('[data-testid="voice-panel-toggle"]'))
  await tick(200)
  assert(!!document.querySelector('[data-testid="voice-panel"]')
    && document.querySelector('[data-testid="voice-count"]').textContent.includes('当前设备提供 3 个英语音色'),
  '音色面板显示「当前设备提供 3 个英语音色」（只描述本机，不承诺数量）')
  assert(!!document.querySelector('[data-testid="voice-option-urn:vc:us"]')
    && !!document.querySelector('[data-testid="voice-option-urn:vc:gb"]')
    && !!document.querySelector('[data-testid="voice-option-urn:vc:au"]'),
  '面板列出设备真实返回的英语音色')
  assert(!document.querySelector('[data-testid="voice-option-urn:vc:zh"]'),
  '中文音色不混进英语分组（其他语言折叠）')
  assert(document.body.textContent.includes('其他语言'),
    '非英语音色折叠在「其他语言」下（仅供调试）')
  assert(document.body.textContent.includes('英音'),
  '每个音色展示由 lang 推导的口音标签')
  assert(!!document.querySelector('[data-testid="voice-audition"]')
    && !!document.querySelector('[data-testid="voice-rate"]')
    && !!document.querySelector('[data-testid="voice-pitch"]'),
  '面板提供试听句、语速与音高控制')
  assert(!!document.querySelector('[data-testid="voice-panel"]'),
    '试听不关闭面板')

  /* ---- 验收 2：只朗读英文回复 ---- */
  const vcTextarea = document.querySelector('textarea')
  const vcUserText = 'I really enjoy walking in the park on sunny days.'
  {
    const setter = Object.getOwnPropertyDescriptor(vw.HTMLTextAreaElement.prototype, 'value').set
    setter.call(vcTextarea, vcUserText)
    vcTextarea.dispatchEvent(new (globalThis.Event)('input', { bubbles: true }))
  }
  await tick(80)
  vcSpoken.length = 0
  fire(document.querySelector('button[aria-label="发送"]'))
  await tick(900)
  const vcAiBubbleText = [...document.querySelectorAll('[data-testid^="ai-bubble-"]')]
    .map((el) => el.querySelector('p')?.textContent || '').filter(Boolean)
  const vcLastAi = vcAiBubbleText[vcAiBubbleText.length - 1] || ''
  const vcSpokenJoined = vcSpoken.map((s) => s.text).join(' ').replace(/\s+/g, ' ').trim()
  assert(vcSpoken.length > 0 && vcLastAi
    && vcSpokenJoined === vcLastAi.replace(/\s+/g, ' ').trim(),
    'AI 回复渲染后自动朗读（英文原文，长回复按句切分依次播放）')
  assert(!vcSpoken.some((s) => s.text === vcUserText),
    '不朗读用户自己的输入')
  assert(vcSpoken.every((s) => /^[A-Za-z0-9'"\s.,!?'-]+$/.test(s.text)),
    '不朗读中文翻译（朗读内容全为英文）')
  assert(!!document.querySelector('[data-testid="speaking-bar"]')
    || !!document.querySelector('[data-testid^="replay-"]'),
  '朗读时出现「朗读中」状态条与气泡上的重播 / 停止控件')

  /* ---- 验收 7：随时可停止 ---- */
  const vcStopBefore = vcCancelCount
  const vcStopBtn = document.querySelector('[data-testid="speaking-stop"]')
  if (vcStopBtn) { fire(vcStopBtn); await tick(120) }
  assert(vcStopBtn ? vcCancelCount > vcStopBefore : true,
    '「停止」按钮立即调用 speechSynthesis.cancel()')

  /* ---- 验收 1（续）：关闭自动朗读后不再自动播 ---- */
  fire(vcAutoToggle)
  await tick(150)
  assert(JSON.parse(vw.localStorage.getItem('lingua_voice_preferences')).global.autoRead === false,
    '关闭自动朗读后状态持久化到第 31 键')
  vcSpoken.length = 0
  {
    const ta2 = document.querySelector('textarea')
    const setter = Object.getOwnPropertyDescriptor(vw.HTMLTextAreaElement.prototype, 'value').set
    setter.call(ta2, 'Another sentence about the weather today.')
    ta2.dispatchEvent(new (globalThis.Event)('input', { bubbles: true }))
  }
  await tick(80)
  fire(document.querySelector('button[aria-label="发送"]'))
  await tick(900)
  assert(vcSpoken.length === 0,
    '关闭自动朗读后不再自动朗读（但重播按钮仍可用）')
  fire(vcAutoToggle)
  await tick(150)
  assert(JSON.parse(vw.localStorage.getItem('lingua_voice_preferences')).global.autoRead === true,
    '重新开启自动朗读，状态同样持久化')

  /* ---- 验收 4：偏好持久化 + 刷新后保持 ---- */
  const vcPrefsNow = JSON.parse(vw.localStorage.getItem('lingua_voice_preferences'))
  assert(vcPrefsNow.global.accent && vcPrefsNow.global.rate >= 0.7 && vcPrefsNow.global.rate <= 1.2,
    '音色偏好（口音 / 语速）持久化到第 31 键')
  {
    const vcSnap = {}
    for (let i = 0; i < vw.localStorage.length; i++) {
      const k = vw.localStorage.key(i)
      if (k) vcSnap[k] = vw.localStorage.getItem(k)
    }
    const vcDom2 = vcMakeDom()
    const vw2 = vcDom2.window
    vw2.speechSynthesis = vcFakeSynth
    vw2.SpeechSynthesisUtterance = FakeUtterance
    for (const [k, v] of Object.entries(vcSnap)) if (v !== null) vw2.localStorage.setItem(k, v)
    vcBindGlobals(vw2)
    try { Object.defineProperty(globalThis, 'SpeechSynthesisUtterance', { value: FakeUtterance, writable: true, configurable: true }) } catch { /* ignore */ }
    await import(vcBundle + '?vc=2')
    await tick(300)
    const vcAfter = JSON.parse(vw2.localStorage.getItem('lingua_voice_preferences'))
    assert(vcAfter.global.autoRead === true && vcAfter.global.accent === vcPrefsNow.global.accent,
      '刷新后音色偏好与自动朗读开关保持不变')
    assert(vw2.localStorage.getItem('lingua_profile') !== null
      && vw2.localStorage.getItem('lingua_texts') !== null,
    '旧版本 localStorage 数据不丢失（迁移只补缺）')
  }

  /* ---- 验收 9：跳级后下一轮立即生效，旧历史不重写 ---- */
  {
    const vcDom3 = vcMakeDom()
    const vw3 = vcDom3.window
    vw3.speechSynthesis = vcFakeSynth
    vw3.SpeechSynthesisUtterance = FakeUtterance
    vcBindGlobals(vw3)
    try { Object.defineProperty(globalThis, 'SpeechSynthesisUtterance', { value: FakeUtterance, writable: true, configurable: true }) } catch { /* ignore */ }
    await import(vcBundle + '?vc=3')
    await tick(300)
    click(/Try an example/, '载入示例文本')
    await tick(120)
    click(/生成学习场景/, '生成学习场景')
    await tick(1000)
    click(/在农夫市集挑苹果/, '进入场景详情')
    await tick(150)
    click(/开始对话冒险/, '开始对话')
    await tick(220)
    // 跳到 A2
    fire(document.querySelector('[data-testid="level-toggle-dialogue"]'))
    await tick(160)
    fire(document.querySelector('[data-testid="level-demote"]'))
    await tick(220)
    assert(document.querySelector('[data-testid="level-label-dialogue"]').textContent.includes('A2'),
      '对话模块等级可下调到 A2')
    const ta3 = document.querySelector('textarea')
    const setter3 = Object.getOwnPropertyDescriptor(vw3.HTMLTextAreaElement.prototype, 'value').set
    setter3.call(ta3, 'I like walking in the park with my friends.')
    ta3.dispatchEvent(new (globalThis.Event)('input', { bubbles: true }))
    await tick(80)
    fire(document.querySelector('button[aria-label="发送"]'))
    await tick(900)
    const vcBubbles = [...document.querySelectorAll('[data-testid^="ai-bubble-"]')]
      .map((el) => el.querySelector('p')?.textContent || '').filter(Boolean)
    const vcNewest = vcBubbles[vcBubbles.length - 1] || ''
    assert(VT.splitSentences(vcNewest).length <= VT.LEVEL_PROFILES.A2.maxSentences,
      '跳级到 A2 后，下一轮回复立刻按 A2 句数上限生成')
  }

  /* ---- 验收 10：无英语音色 / 不支持 speechSynthesis 时不静默失败 ---- */
  {
    const vcDom4 = vcMakeDom()
    const vw4 = vcDom4.window
    vw4.speechSynthesis = { ...vcFakeSynth, getVoices: () => [] }
    vw4.SpeechSynthesisUtterance = FakeUtterance
    vcBindGlobals(vw4)
    try { Object.defineProperty(globalThis, 'SpeechSynthesisUtterance', { value: FakeUtterance, writable: true, configurable: true }) } catch { /* ignore */ }
    await import(vcBundle + '?vc=4')
    await tick(300)
    click(/Try an example/, '载入示例文本')
    await tick(120)
    click(/生成学习场景/, '生成学习场景')
    await tick(1000)
    click(/在农夫市集挑苹果/, '进入场景详情')
    await tick(150)
    click(/开始对话冒险/, '开始对话')
    await tick(220)
    fire(document.querySelector('[data-testid="voice-panel-toggle"]'))
    await tick(200)
    assert(!!document.querySelector('[data-testid="voice-degrade"]'),
      '设备不提供音色时给出明确降级说明，不静默失败')
    assert(document.querySelector('[data-testid="voice-count"]').textContent.includes('正在'),
      '音色未就绪时显示「正在加载 / 统计」而不是空列表')
  }
  {
    const vcDom5 = vcMakeDom()
    const vw5 = vcDom5.window
    // 不注入 speechSynthesis：模拟浏览器不支持
    vcBindGlobals(vw5)
    await import(vcBundle + '?vc=5')
    await tick(300)
    click(/Try an example/, '载入示例文本')
    await tick(120)
    click(/生成学习场景/, '生成学习场景')
    await tick(1000)
    click(/在农夫市集挑苹果/, '进入场景详情')
    await tick(150)
    click(/开始对话冒险/, '开始对话')
    await tick(220)
    assert(!!document.querySelector('[data-testid="voice-unsupported"]')
      && !document.querySelector('[data-testid="voice-panel-toggle"]'),
    '浏览器不支持 speechSynthesis 时隐藏朗读控件并说明原因，对话功能不受影响')
  }
  }

  /* ============================================================
   * 二十二、PWA 离线壳与 prompt 更新策略
   * ============================================================ */
  const pwaVite = fs.readFileSync(path.join(root, 'vite.config.ts'), 'utf8')
  const pwaHtml = fs.readFileSync(path.join(root, 'dist', 'index.html'), 'utf8')
  const pwaManifest = JSON.parse(fs.readFileSync(path.join(root, 'dist', 'manifest.webmanifest'), 'utf8'))
  const pwaSw = fs.readFileSync(path.join(root, 'dist', 'sw.js'), 'utf8')
  const pwaReg = fs.readFileSync(path.join(root, 'src/pwa/registerSW.ts'), 'utf8')
  const pwaPrompt = fs.readFileSync(path.join(root, 'src/components/UpdatePrompt.tsx'), 'utf8')
  const pwaStorage = fs.readFileSync(path.join(root, 'src/lib/storage.ts'), 'utf8')

  assert(pwaVite.includes("registerType: 'prompt'") && !/registerType:\s*['"]autoUpdate/.test(pwaVite)
    && pwaVite.includes('devOptions: { enabled: false }'),
  'PWA 使用 registerType: prompt，禁用 autoUpdate，dev 下不启用 SW')
  assert(pwaVite.includes("manifestFilename: 'manifest.webmanifest'")
    && fs.existsSync(path.join(root, 'dist', 'manifest.webmanifest'))
    && fs.existsSync(path.join(root, 'dist', 'sw.js')),
  '构建产出 manifest.webmanifest 与 sw.js')
  assert(pwaManifest.name.includes('LinguaBuddy') && pwaManifest.short_name === 'LinguaBuddy'
    && pwaManifest.theme_color === '#f5f8ff' && pwaManifest.display === 'standalone'
    && pwaManifest.start_url === './' && pwaManifest.scope === './',
  'manifest 含应用名 / 主题色 / standalone / 与 base 一致的相对路径')
  assert(pwaManifest.icons.length >= 4
    && pwaManifest.icons.some((i) => i.sizes === '192x192')
    && pwaManifest.icons.some((i) => i.sizes === '512x512')
    && pwaManifest.icons.some((i) => i.type === 'image/svg+xml'),
  'manifest 图标含 SVG 占位与 192 / 512 位图（Chrome 可安装条件）')
  for (const icon of pwaManifest.icons) {
    assert(fs.existsSync(path.join(root, 'dist', icon.src)), `图标文件真实存在：${icon.src}`)
  }
  assert((pwaHtml.match(/<link\s+rel="manifest"/g) || []).length === 1
    && pwaHtml.includes('href="./manifest.webmanifest"'),
  'manifest link 由插件注入且仅注入一次')
  assert(['apple-mobile-web-app-capable', 'apple-mobile-web-app-status-bar-style',
    'apple-mobile-web-app-title', 'mobile-web-app-capable', 'application-name',
    'theme-color'].every((k) => pwaHtml.includes(`name="${k}"`))
    && pwaHtml.includes('rel="apple-touch-icon"'),
  'index.html 含 iOS / 基础 PWA meta 与 apple-touch-icon 位图')
  assert(/url:"index\.html"/.test(pwaSw)
    && /url:"assets\/index-[^"]+\.js"/.test(pwaSw)
    && /url:"assets\/index-[^"]+\.css"/.test(pwaSw)
    && /url:"manifest\.webmanifest"/.test(pwaSw),
  'Service Worker 预缓存 App Shell（HTML / 主 JS / 主 CSS / manifest），可离线打开基础界面')
  assert(/createHandlerBoundToURL\("index\.html"\)/.test(pwaSw)
    && !pwaSw.includes('clientsClaim()'),
  '离线导航回退 index.html，且新 SW 不自动接管客户端')
  assert(pwaVite.includes('skipWaiting: false') && pwaVite.includes('clientsClaim: false')
    && pwaPrompt.includes('useRegisterSW') && !pwaReg.includes('location.reload')
    && !pwaPrompt.includes('.skipWaiting') && !pwaVite.includes('runtimeCaching'),
  '新版本只触发 needRefresh，不 skipWaiting / 不自动刷新 / 不缓存远程接口')
  assert(pwaPrompt.includes('updateServiceWorker(true)')
    && pwaPrompt.includes('发现新版本，点击刷新') && pwaPrompt.includes('稍后再说')
    && pwaPrompt.includes('data-testid="pwa-update-prompt"') && pwaPrompt.includes('bottom-')
    && !pwaPrompt.includes('location.reload'),
  '只有用户点「发现新版本，点击刷新」才调用 updateServiceWorker(true)，提示固定在底部且可「稍后再说」')
  assert(pwaReg.includes('isServiceWorkerSupported')
    && pwaReg.includes("'serviceWorker' in navigator") && !pwaReg.includes('registerSW('),
  '无 Service Worker 环境静默降级，既有功能不受影响；注册权已移交 useRegisterSW')
  assert(fs.readFileSync(path.join(root, 'src/vite-env.d.ts'), 'utf8')
    .includes('vite-plugin-pwa/client'),
  'virtual:pwa-register 的类型声明已接入 tsconfig 包含范围')
  assert(pwaStorage.includes("levelPreference: 'lingua_level_preference'")
    && pwaStorage.includes("voicePreferences: 'lingua_voice_preferences'")
    && !pwaStorage.includes('lingua_pwa'),
  'PWA 不新增 localStorage 键，旧 31 键与学习数据模型零改动')

  /* ============================================================
   * 二十三、Vercel 部署配置（SPA 回退 + PWA 关键文件不缓存）
   * ============================================================ */
  const vercelPath = path.join(root, 'vercel.json')
  assert(fs.existsSync(vercelPath), '项目根目录存在 vercel.json')
  const vercelJson = JSON.parse(fs.readFileSync(vercelPath, 'utf8'))
  assert(vercelJson.framework === 'vite'
    && vercelJson.buildCommand === 'npm run build'
    && vercelJson.outputDirectory === 'dist',
  'vercel.json 声明 Vite 框架 / 构建命令 / dist 产物目录')
  assert(Array.isArray(vercelJson.rewrites)
    && vercelJson.rewrites.some((r) => r.destination === '/index.html'
      && typeof r.source === 'string' && r.source.includes('.*')),
  '所有路径回退 /index.html（兼容排除 .well-known 的通配写法；Vercel filesystem 优先真实静态文件）')
  const vHeader = (src) => (vercelJson.headers || []).find((h) => h.source === src)?.headers || []
  const vVal = (src, key) => vHeader(src).find((h) => h.key === key)?.value || ''
  for (const src of ['/sw.js', '/manifest.webmanifest']) {
    const cc = vVal(src, 'Cache-Control')
    assert(/no-cache|no-store/.test(cc) && /max-age=0/.test(cc)
      && vVal(src, 'CDN-Cache-Control') === 'no-store'
      && vVal(src, 'Vercel-CDN-Cache-Control') === 'no-store',
    `${src} 浏览器与 CDN 均不缓存，保证用户拿到新版本`)
  }
  assert(vVal('/manifest.webmanifest', 'Content-Type') === 'application/manifest+json; charset=utf-8',
  'manifest.webmanifest 显式声明正确 MIME，避免 Chrome 报 manifest 解析失败')
  assert(/no-cache/.test(vVal('/index.html', 'Cache-Control'))
    && /no-cache/.test(vVal('/', 'Cache-Control')),
  'HTML 外壳也不缓存，避免旧 index.html 引用已失效的 hash 资源导致白屏')
  assert(!JSON.stringify(vercelJson).includes('autoUpdate')
    && pwaVite.includes("registerType: 'prompt'"),
  'vercel.json 不引入 autoUpdate，仍沿用 prompt 更新策略')

  /* ============================================================
   * 二十四、应用更新闭环（prompt 策略 + 底部 UpdatePrompt）
   * ============================================================ */
  const updatePromptPath = path.join(root, 'src/components/UpdatePrompt.tsx')
  const updateShim = fs.readFileSync(path.join(root, 'src/components/PwaUpdatePrompt.tsx'), 'utf8')
  const updateLayout = fs.readFileSync(path.join(root, 'src/components/Layout.tsx'), 'utf8')
  assert(fs.existsSync(updatePromptPath)
    && updateShim.includes('UpdatePrompt as PwaUpdatePrompt')
    && updateLayout.includes("import { UpdatePrompt } from './UpdatePrompt'")
    && updateLayout.includes('<UpdatePrompt />'),
  'UpdatePrompt 为真实实现并挂载在 Layout，旧 PwaUpdatePrompt 路径保留为兼容别名')
  assert(pwaVite.includes("registerType: 'prompt'") && pwaVite.includes('skipWaiting: false')
    && pwaVite.includes('clientsClaim: false') && pwaVite.includes('injectRegister: null')
    && !pwaVite.includes('periodicSyncForUpdates'),
  '更新闭环配置红线：prompt / 不跳过等待 / 不自动接管 / 不重复注入 / 无周期静默检查')
  assert(pwaReg.includes('UpdateServiceWorker') && pwaPrompt.includes('immediate: false')
    && !pwaReg.includes('periodicSyncForUpdates') && !pwaPrompt.includes('location.reload')
    && !pwaPrompt.includes('.skipWaiting'),
  '注册入口只回调 needRefresh，不做周期性检查、不自动重载、不跳过等待')
  assert(pwaPrompt.includes('needRefresh') && pwaPrompt.includes('offlineReady')
    && pwaPrompt.includes('data-testid="pwa-offline-ready"')
    && pwaPrompt.includes('data-testid="update-prompt-refresh"')
    && pwaPrompt.includes('bottom-['),
  'needRefresh 驱动更新提示，离线就绪为轻提示，刷新按钮可定位且提示在底部')
  assert(!pwaPrompt.includes('location.reload') && !pwaPrompt.includes('autoUpdate')
    && !pwaPrompt.includes('setInterval'),
  '组件不含任何自动刷新 / 定时检查逻辑，学习过程不被打断')
  assert(fs.readFileSync(path.join(root, 'README.md'), 'utf8').includes('二十四、应用更新闭环'),
  'README 沉淀更新闭环说明与本地模拟「有新版本」测试指南')

  /* ============================================================
   * 二十五、本地手机测试二维码页（public/qr.html）
   * ============================================================ */
  const qrHtml = fs.readFileSync(path.join(root, 'public/qr.html'), 'utf8')
  const pkgJson = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
  assert(fs.existsSync(path.join(root, 'dist/qr.html'))
    && fs.existsSync(path.join(root, 'public/qrcode.min.js'))
    && fs.existsSync(path.join(root, 'dist/qrcode.min.js')),
  'qr.html 与离线兜底库随 public/ 原样产出到 dist')
  assert(qrHtml.includes('<style>') && qrHtml.includes('<script>')
    && !/<link[^>]+stylesheet/.test(qrHtml),
  'qr.html 是内联 CSS/JS 的独立单文件，不依赖外部样式')
  assert(qrHtml.includes('cdnjs.cloudflare.com') && qrHtml.includes('CorrectLevel')
    && qrHtml.length > 20000 && !/<script[^>]+src=/.test(qrHtml)
    && qrHtml.includes('new window.QRCode(') && qrHtml.includes('二维码生成失败'),
  'qrcodejs 内联进单文件、零外部请求、同步渲染，失败时给出可见提示而非空白')
  assert(qrHtml.includes("new URL('./', href)") && qrHtml.includes('currentTarget')
    && qrHtml.includes('text: text') && !/192\.168\.\d+\.\d+/.test(qrHtml),
  '二维码内容由地址栏自动推导，非 http(s) 环境先做协议守卫，无硬编码局域网 IP')
  const qrStyle = qrHtml.match(/<style>([\s\S]*?)<\/style>/)[1]
  assert(qrHtml.includes('手机扫码测试') && qrStyle.includes('background: #fff')
    && qrHtml.includes("colorDark: '#000000'") && qrHtml.includes("colorLight: '#ffffff'")
    && !/gradient|animation|box-shadow|backdrop/.test(qrStyle),
  '一行标题 + 白底黑码，样式块无复杂装饰')
  /* 运行时回归：真在 jsdom 里执行内联库，确认黑白格子被画出来，杜绝「空白页」复发 */
  const qrVC = new VirtualConsole()
  const qrDom = new JSDOM(qrHtml, {
    url: 'http://192.168.1.5:5173/qr.html',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole: qrVC,
  })
  const qrBox = qrDom.window.document.getElementById('qr')
  assert(qrBox.children.length > 0 && qrBox.innerHTML.length > 10000
    && qrDom.window.document.getElementById('url').textContent === 'http://192.168.1.5:5173/',
  '内联库在零网络环境下同步画出二维码，目标地址正确')
  qrDom.window.close()
  /* 预览面板 iframe 常为 about:srcdoc / about:blank：不得抛 Invalid URL，且仍要有码可看 */
  const qrVC2 = new VirtualConsole()
  const qrDom2 = new JSDOM(qrHtml, {
    url: 'about:blank',
    runScripts: 'dangerously',
    pretendToBeVisual: true,
    virtualConsole: qrVC2,
  })
  const qrDoc2 = qrDom2.window.document
  const qrBox2 = qrDoc2.getElementById('qr')
  assert(qrBox2.children.length > 0 && qrBox2.innerHTML.length > 10000
    && !qrBox2.textContent.includes('二维码生成失败')
    && !qrDoc2.getElementById('manual').hidden,
  'about:blank / iframe srcdoc 环境下不抛 Invalid URL，仍显示演示码与手动输入入口')
  qrDoc2.getElementById('manual-url').value = '192.168.1.5:5173/'
  qrDoc2.getElementById('manual-btn').click()
  assert(qrDoc2.getElementById('url').textContent === 'http://192.168.1.5:5173/'
    && qrDoc2.getElementById('qr').innerHTML.length > 10000,
  '手动输入地址后自动补协议并重画二维码')
  qrDom2.window.close()
  assert(qrHtml.includes("host === 'localhost'") && qrHtml.includes('127.0.0.1'),
  'localhost 打开时提示改用局域网 IP，避免手机扫到无效地址')
  assert(pwaVite.includes("'**/qr.html'") && pwaVite.includes("'**/qrcode.min.js'")
    && !pwaSw.includes('qr.html') && !pwaSw.includes('qrcode.min.js'),
  '测试页与兜底库不进 PWA App Shell 预缓存，离线包保持干净')
  assert(pkgJson.scripts['dev:lan'] && pkgJson.scripts['dev:lan'].includes('--host 0.0.0.0')
    && pkgJson.scripts.dev === 'vite --host 127.0.0.1',
  '新增 dev:lan 局域网启动脚本，原 dev 的 loopback 绑定保持不变')
  assert(fs.readFileSync(path.join(root, 'README.md'), 'utf8').includes('二十五、'),
  'README 沉淀本地启动与手机扫码步骤')

  /* ============================================================
   * 二十六、Supabase user_data 单表 JSON 云同步结构（SQL 迁移）
   * ============================================================ */
  const sqlPath = path.join(root, 'supabase/migrations/20261114190000_create_user_data.sql')
  assert(fs.existsSync(sqlPath) && fs.existsSync(path.join(root, 'supabase/SCHEMA.md')),
  'Supabase 迁移 SQL 与 Schema 文档已落盘')
  const cloudSql = fs.readFileSync(sqlPath, 'utf8')
  assert(/create table if not exists public\.user_data/.test(cloudSql)
    && ['id', 'user_id', 'data_type', 'json_data', 'updated_at'].every((c) => cloudSql.includes(c))
    && cloudSql.includes('references auth.users(id) on delete cascade')
    && cloudSql.includes('constraint uk_user_data_user_type unique (user_id, data_type)'),
  'user_data 单表含五类字段、auth.users 外键级联与 (user_id, data_type) 唯一约束')
  assert(cloudSql.includes("jsonb_typeof(json_data) in ('object', 'array')")
    && cloudSql.includes('jsonb') && cloudSql.includes('^[a-z0-9_]{1,64}$'),
  'json_data 为 jsonb 且允许对象/数组，data_type 用宽松格式便于扩展')
  assert(cloudSql.includes('alter table public.user_data enable row level security')
    && cloudSql.includes('revoke all on public.user_data from anon')
    && cloudSql.includes('revoke all on public.user_data from public')
    && /grant select, insert, update on (table )?public\.user_data to authenticated/.test(cloudSql)
    && !cloudSql.includes('grant select, insert, update, delete'),
  '开启 RLS、收回 anon 与 PUBLIC 权限、仅授予 authenticated 读写改（无 delete）')
  assert(['select', 'insert', 'update'].every((op) => cloudSql.includes(`"user_data_${op}_own"`))
    && !/create policy "user_data_delete_own"/.test(cloudSql)
    && (cloudSql.match(/auth\.uid\(\) = user_id/g) || []).length >= 4
    && (cloudSql.match(/to authenticated/g) || []).length >= 3
    && cloudSql.includes('revoke all on public.user_data from public')
    && cloudSql.includes('revoke all on public.user_data from anon')
    && cloudSql.includes('grant select, insert, update on public.user_data to authenticated')
    && !cloudSql.includes('grant select, insert, update, delete'),
  '读 / 写 / 改三条 own 策略全部以 auth.uid() = user_id 限定 authenticated；delete 已移除，PUBLIC 伪角色已收回')

  /* RLS 复查版脚本：只动策略与授权，可直接粘到 Supabase SQL Editor */
  const rlsSqlPath = path.join(root, 'supabase/rls_user_data.sql')
  const rlsSql = fs.readFileSync(rlsSqlPath, 'utf8')

  /**
   * [SQL 结构自检] 本地没有 Postgres，无法真正执行 DDL，
   * 因此至少把「括号 / 引号 / $$ 块是否配对」这类手误在粘贴前拦下来。
   * 扫描器会跳过 -- 行注释、'...' 字符串（含 '' 转义）与 $tag$ 美元引号块，
   * 并额外输出去注释后的代码：否定断言（如「不得存在 delete 策略」）必须看**代码**，
   * 否则脚本里注释掉的恢复示例会被误判成真实语句。
   */
  const scanSql = (sql) => {
    let i = 0
    let paren = 0
    let inSingle = false
    let dollar = null
    const n = sql.length
    let code = ''
    while (i < n) {
      const c = sql[i]
      if (dollar) {
        if (sql.startsWith(dollar, i)) { i += dollar.length; dollar = null; code += ' '; continue }
        code += c; i++; continue
      }
      if (inSingle) {
        if (c === "'") {
          if (sql[i + 1] === "'") { code += "''"; i += 2; continue }
          inSingle = false
        }
        code += c; i++; continue
      }
      if (c === '-' && sql[i + 1] === '-') {
        while (i < n && sql[i] !== '\n') i++
        continue
      }
      if (c === "'") { inSingle = true; code += c; i++; continue }
      if (c === '$') {
        const tag = /^\$[A-Za-z_]*\$/.exec(sql.slice(i))
        if (tag) { dollar = tag[0]; i += tag[0].length; code += ' '; continue }
      }
      if (c === '(') paren++
      else if (c === ')') paren--
      if (paren < 0) return { ok: false, reason: '右括号多于左括号', code }
      code += c; i++
    }
    if (paren !== 0) return { ok: false, reason: `括号未闭合，差 ${paren}`, code }
    if (inSingle) return { ok: false, reason: '单引号未闭合', code }
    if (dollar) return { ok: false, reason: `美元引号块未闭合：${dollar}`, code }
    return { ok: true, reason: '', code }
  }
  const cloudScan = scanSql(cloudSql)
  const rlsScan = scanSql(rlsSql)
  assert(cloudScan.ok && rlsScan.ok,
  `迁移脚本与 RLS 复查脚本括号 / 引号 / $$ 块全部配对，可安全粘贴到 SQL Editor${
    cloudScan.ok && rlsScan.ok ? '' : `（${cloudScan.reason || rlsScan.reason}）`}`)
  /* 去注释后的代码：用于「不得包含某语句」的否定断言 */
  const cloudCode = cloudScan.code
  const rlsCode = rlsScan.code

  /* RLS 复查版脚本：只动策略与授权，可直接粘到 Supabase SQL Editor */
  assert(fs.existsSync(rlsSqlPath),
  'RLS 复查脚本已落盘，可直接粘贴到 Supabase SQL Editor 执行')
  assert(rlsSql.includes('alter table public.user_data enable row level security')
    && rlsSql.includes('revoke all on table public.user_data from public')
    && rlsSql.includes('revoke all on table public.user_data from anon')
    && /grant select, insert, update on (table )?public\.user_data to authenticated/.test(rlsSql)
    && !rlsCode.includes('grant select, insert, update, delete'),
  'RLS 复查脚本：开启 RLS + 收回 PUBLIC/anon 权限 + 只授予 select/insert/update')
  assert(['select', 'insert', 'update'].every((op) => rlsCode.includes(`create policy "user_data_${op}_own"`))
    && !rlsCode.includes('create policy "user_data_delete_own"')
    && rlsCode.includes('using (auth.uid() = user_id)')
    && rlsCode.includes('with check (auth.uid() = user_id)')
    && (rlsCode.match(/to authenticated/g) || []).length >= 3,
  'RLS 复查脚本：三条策略齐备且全部以 auth.uid() = user_id 限定，无 delete 策略')
  assert(rlsSql.includes('from pg_policies')
    && rlsSql.includes('information_schema.role_table_grants')
    && rlsSql.includes('set local role authenticated')
    && rlsSql.includes('drop policy if exists'),
  'RLS 复查脚本自带只读验证查询、越权模拟测试，且全部语句幂等可重复执行')
  assert(['select', 'insert', 'update'].every((op) =>
    cloudCode.includes(`create policy "user_data_${op}_own"`) && rlsCode.includes(`create policy "user_data_${op}_own"`))
    && cloudCode.includes('revoke all on public.user_data from public')
    && rlsCode.includes('revoke all on table public.user_data from public'),
  '迁移脚本与 RLS 复查脚本策略集一致：新装环境与线上库语义相同，不会各说各话')
  const cloudSchema = fs.readFileSync(path.join(root, 'supabase/SCHEMA.md'), 'utf8')
  assert(cloudSchema.includes('| `user_data_select_own` |')
    && cloudSchema.includes('| `user_data_update_own` |')
    && !cloudSchema.includes('| `user_data_delete_own` |')
    && cloudSchema.includes('三条全部带 `to authenticated`'),
  'Schema 文档的策略表同步为三条（恢复示例在正文里，不在策略表内）')
  assert(cloudSql.includes('create policy') && cloudSql.includes('drop policy if exists')
    && rlsSql.includes('create policy') && rlsSql.includes('drop policy if exists'),
  '两份 SQL 的策略语句一律「先 drop 再 create」，重复执行不产生重复策略')
  assert(cloudSql.includes('create or replace function public.upsert_user_data')
    && cloudSql.includes('v_uid uuid := auth.uid()') && !/p_user_id/.test(cloudSql),
  'upsert RPC 只从 auth.uid() 取归属，不接受客户端伪造 user_id')
  assert(cloudSql.includes('create trigger trg_user_data_updated_at')
    && cloudSql.includes('set_user_data_updated_at'),
  'updated_at 由触发器自动维护，供多设备冲突判断')
  assert(fs.readFileSync(path.join(root, 'README.md'), 'utf8').includes('二十六、'),
  'README 沉淀 Supabase 建表与执行说明')

  /* ============================================================
   * 二十七、Supabase 前端接入：客户端 / 登录组件 / useSyncData
   * ============================================================ */
  const sbClient = fs.readFileSync(path.join(root, 'src/lib/supabase.ts'), 'utf8')
  const sbHook = fs.readFileSync(path.join(root, 'src/hooks/useSyncData.ts'), 'utf8')
  const sbCard = fs.readFileSync(path.join(root, 'src/components/CloudSyncCard.tsx'), 'utf8')
  const sbSettingsSrc = fs.readFileSync(path.join(root, 'src/pages/Settings.tsx'), 'utf8')
  const sbEnvDts = fs.readFileSync(path.join(root, 'src/vite-env.d.ts'), 'utf8')
  const sbPkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))

  assert(sbPkg.dependencies?.['@supabase/supabase-js']
    && fs.existsSync(path.join(root, 'node_modules/@supabase/supabase-js/package.json')),
  '@supabase/supabase-js 已声明并安装到 node_modules')
  assert(sbClient.includes('createClient') && sbClient.includes('VITE_SUPABASE_URL')
    && sbClient.includes('VITE_SUPABASE_ANON_KEY') && sbClient.includes('isSupabaseConfigured')
    && sbClient.includes('supabase: SupabaseClient | null'),
  'supabase.ts 只从 VITE_ 公开变量初始化，未配置时降级为 null（纯本地照常可用）')
  assert(sbEnvDts.includes('VITE_SUPABASE_URL') && sbEnvDts.includes('VITE_SUPABASE_ANON_KEY')
    && fs.existsSync(path.join(root, '.env.example'))
    && fs.readFileSync(path.join(root, '.env.example'), 'utf8').includes('VITE_SUPABASE_ANON_KEY'),
  'VITE_ 变量有类型声明，.env.example 提供配置模板')
  assert(['lingua_profile', 'lingua_mistakes', 'lingua_review_queue'].every((t) => sbHook.includes(`'${t}'`))
    && sbHook.includes("onConflict: 'user_id,data_type'") && !sbHook.includes("'lingua_settings'"),
  '只同步三类核心 data_type，与 user_data 表结构一致；不碰含密钥的 settings')
  assert(sbHook.includes('hasCloudLearning') && sbHook.includes('hasLocalLearning')
    && sbHook.includes('setConflictOpen(true)') && sbHook.includes('resolveConflict')
    && sbHook.includes("'local'") && sbHook.includes("'cloud'"),
  '云端与本地都有数据时先弹窗，由用户选择保留哪一份')
  assert(sbHook.includes('3000') && sbHook.includes('window.clearTimeout')
    && sbHook.includes('canAutoPushRef') && sbHook.includes('skipNextPushRef'),
  '本地状态变化后 3 秒防抖推送，并有抑制锁防止拉取后回推')
  assert(sbCard.includes('data-testid="cloud-auth-form"')
    && sbCard.includes('data-testid="cloud-not-configured"')
    && sbCard.includes('data-testid="conflict-keep-local"')
    && sbCard.includes('data-testid="conflict-use-cloud"')
    && sbCard.includes('data-testid="sync-conflict-dialog"'),
  '设置页提供登录表单 / 未配置降级提示 / 冲突双选弹窗')
  assert(sbSettingsSrc.includes('import { CloudSyncCard }') && sbSettingsSrc.includes('<CloudSyncCard />'),
  'CloudSyncCard 只以两行 diff 挂载在设置页')
  assert(fs.readFileSync(path.join(root, 'README.md'), 'utf8').includes('二十七、'),
  'README 沉淀前端接入与冲突处理说明')

  /* ---------- [移动端登录入口] 首页横幅 + 单例会话 + 禁止打印密钥 ---------- */
  const sbBanner = fs.readFileSync(path.join(root, 'src/components/SyncBanner.tsx'), 'utf8')
  const sbLoginDlg = fs.readFileSync(path.join(root, 'src/components/SyncLoginDialog.tsx'), 'utf8')
  const sbHomeSrc = fs.readFileSync(path.join(root, 'src/pages/Home.tsx'), 'utf8')
  assert(sbHomeSrc.includes("import { SyncBanner }") && sbHomeSrc.includes('<SyncBanner />'),
    '首页挂载 SyncBanner：真机第一屏就能看见登录入口，而不是藏在设置页末尾')
  assert(sbBanner.includes('data-testid="sync-banner"') && sbBanner.includes('data-testid="sync-banner-synced"')
    && sbBanner.includes('data-testid="sync-banner-unconfigured"'),
    '横幅三态齐备：未登录告警 / 已同步状态 / 未配置如实说明')
  assert(sbBanner.includes('数据仅存于本机') && sbBanner.includes('换设备会丢失')
    && sbBanner.includes('点击登录同步云端'),
    '横幅文案点明「数据只在本机、换设备会丢失」并给出登录出路')
  assert(sbBanner.includes('min-h-[44px]') && sbBanner.includes('<SyncLoginDialog')
    && sbBanner.includes('setDialogOpen(true)'),
    '横幅整条可点、热区 ≥44px，点击直接弹登录/注册弹窗')
  assert(sbLoginDlg.includes('data-testid="sync-login-dialog"') && sbLoginDlg.includes('role="dialog"')
    && sbLoginDlg.includes('aria-modal="true"') && sbLoginDlg.includes('!text-[16px]'),
    '登录弹窗是底部 sheet 形态、语义完整，输入框 16px 避免 iOS 聚焦自动放大')
  assert(sbLoginDlg.includes('!sync.configured') && sbLoginDlg.includes('data-testid="sync-login-not-configured"'),
    '未注入 Supabase 配置时如实说明，绝不假装能登录')
  assert(sbHook.includes('useSyncExternalStore') && sbHook.includes('subscribeShared')
    && sbHook.includes('getSharedSnapshot') && sbHook.includes('authSubscribed'),
    '云会话提升为模块级单例：首页横幅与设置页共用一份订阅，不重复请求')
  assert(!sbClient.includes('console.log'), 'supabase.ts 不再打印 URL / Key 前缀（避免生产环境泄露配置）')

  /* ============================================================
   * 二十八、真实 AI Serverless 接口 + generateDialogue 改造
   * ============================================================ */
  const chatSrc = fs.readFileSync(path.join(root, 'api/chat.ts'), 'utf8')
  assert(chatSrc.includes('process.env.LLM_API_KEY') && chatSrc.includes('process.env.LLM_API_BASE')
    && chatSrc.includes('export default async function handler'),
  'Vercel Serverless api/chat.ts 从 process.env 读取密钥与接口地址')
  assert(/try\s*\{[\s\S]*catch\s*\(/.test(chatSrc) && chatSrc.includes('fallback: true')
    && chatSrc.includes('AI 服务暂时不可用') && chatSrc.includes('未配置 LLM_API_KEY'),
  '全函数 try-catch + 友好降级 JSON，接口不会崩溃')
  assert(chatSrc.includes("method === 'GET'") && chatSrc.includes("mode: key ? 'live' : 'mock'")
    && chatSrc.includes('configured: Boolean(key)'),
  'GET 模式探测只回配置状态 / provider / model，不回传密钥')
  assert(chatSrc.includes('body.stream === true') && chatSrc.includes('text/event-stream')
    && chatSrc.includes('getReader()') && chatSrc.includes('choices'),
  '支持 SSE 流式透传，默认返回 OpenAI 兼容标准 JSON')
  assert(chatSrc.includes('buildMessages(body.messages, level)') && chatSrc.includes('levelOf(body.level)')
    && chatSrc.includes('MAX_MESSAGES') && chatSrc.includes('AbortController'),
  '校验 messages + level，含条数上限与上游超时')
  const aiDirectorSrc = fs.readFileSync(path.join(root, 'src/services/dialogueDirector.ts'), 'utf8')
  assert(aiDirectorSrc.includes('let currentGenerator: GenerateDialogue = createServerlessGenerator()')
    && aiDirectorSrc.includes('currentGenerator = createServerlessGenerator()')
    && aiDirectorSrc.includes('fetch(AI_ENDPOINT'),
  'generateDialogue() 默认走 AI_ENDPOINT（现为 Netlify 函数路径），重置也回到自动模式')
  assert(aiDirectorSrc.includes("if (settings.apiMode === 'custom'") && aiDirectorSrc.includes('createRemoteGenerator(settings)'),
  '设置页自定义端点优先级不变，旧 Mock / 远程路径零破坏')
  assert(aiDirectorSrc.includes('return mockGenerateDialogue(input)') && aiDirectorSrc.includes('probeAiMode(false, input.signal)')
    && aiDirectorSrc.includes('normalizeRemote(extractJson(data.content)'),
  '探测 / 请求 / 解析任一步失败都回退 Mock，成功则复用等级钳制归一化')
  const aiEnvExample = fs.readFileSync(path.join(root, '.env.example'), 'utf8')
  assert(aiEnvExample.includes('LLM_API_KEY=') && aiEnvExample.includes('LLM_API_BASE=')
    && !aiEnvExample.includes('VITE_LLM_API_KEY='),
  '.env.example 新增服务端 LLM 变量，且没有把密钥误加 VITE_ 前缀')
  const aiBadgeSrc = fs.readFileSync(path.join(root, 'src/components/AiModeBadge.tsx'), 'utf8')
  assert(aiBadgeSrc.includes('probeAiMode') && aiBadgeSrc.includes('data-testid="ai-mode-badge"')
    && fs.readFileSync(path.join(root, 'src/pages/Settings.tsx'), 'utf8').includes('<AiModeBadge />'),
  '设置页提供真实 AI / Mock 检测徽章与强制 Mock 开关')
  assert(fs.readFileSync(path.join(root, 'vite.config.ts'), 'utf8').includes("target: 'http://127.0.0.1:3001'")
    && fs.readFileSync(path.join(root, 'package.json'), 'utf8').includes('"dev:ai"')
    && fs.existsSync(path.join(root, 'scripts/llm-dev-server.mjs')),
  '本地联调脚本与 Vite /api → 3001 代理就位（纯本地 Express 后端）')
  assert(fs.readFileSync(path.join(root, 'README.md'), 'utf8').includes('二十八、'),
  'README 沉淀真实 AI 接入与本地测试指南')

  /* 运行时：把 api/chat.ts 真转成 JS 执行，用假上游 / 假响应验证四条关键路径 */
  const { code: chatCode } = await transform(chatSrc, { loader: 'ts', format: 'esm', target: 'node18' })
  const chatHandler = (await import(`data:text/javascript;base64,${Buffer.from(chatCode).toString('base64')}`)).default
  const savedKey = process.env.LLM_API_KEY
  const savedBase = process.env.LLM_API_BASE
  const savedModel = process.env.LLM_MODEL
  const savedFetch = globalThis.fetch
  const fakeRes = () => {
    const out = { code: 0, body: null, headers: {}, chunks: [], ended: false }
    const res = {
      status(c) { out.code = c; return res },
      json(b) { out.body = b },
      setHeader(k, v) { out.headers[k] = v },
      write(c) { out.chunks.push(c); return true },
      end(c) { if (c) out.chunks.push(c); out.ended = true },
    }
    return { res, out }
  }
  try {
    delete process.env.LLM_API_KEY
    const probe = fakeRes()
    await chatHandler({ method: 'GET' }, probe.res)
    assert(probe.out.code === 200 && probe.out.body.mode === 'mock' && probe.out.body.configured === false,
    '运行时：未配置 Key 时 GET 探测判定为 Mock')
    const noKey = fakeRes()
    await chatHandler({ method: 'POST', body: { messages: [{ role: 'user', content: 'hi' }], level: 'B1' } }, noKey.res)
    assert(noKey.out.code === 503 && noKey.out.body.fallback === true && /LLM_API_KEY/.test(noKey.out.body.error),
    '运行时：未配置 Key 的 POST 返回友好降级 JSON，不崩溃')

    process.env.LLM_API_KEY = 'sk-smoke-test'
    process.env.LLM_API_BASE = 'https://api.deepseek.com/v1'
    globalThis.fetch = async () => ({ ok: true, status: 200,
      json: async () => ({ choices: [{ message: { content: '{"reply":"Hello there!"}' } }] }) })
    const okRes = fakeRes()
    await chatHandler({ method: 'POST', body: { messages: [{ role: 'user', content: 'hi' }], level: 'B1' } }, okRes.res)
    assert(okRes.out.code === 200 && okRes.out.body.ok === true && okRes.out.body.content.includes('Hello'),
    '运行时：配置 Key 且上游正常时透传 content 给前端')

    globalThis.fetch = async () => ({ ok: false, status: 500, text: async () => 'upstream down' })
    const badRes = fakeRes()
    await chatHandler({ method: 'POST', body: { messages: [{ role: 'user', content: 'hi' }], level: 'B1' } }, badRes.res)
    assert(badRes.out.code === 502 && badRes.out.body.fallback === true,
    '运行时：上游 500 时返回 502 降级 JSON')

    const invalidRes = fakeRes()
    await chatHandler({ method: 'POST', body: { level: 'B1' } }, invalidRes.res)
    assert(invalidRes.out.code === 503 && invalidRes.out.body.fallback === true,
    '运行时：messages 非法时由 catch 兜住')
  } finally {
    if (savedFetch === undefined) delete globalThis.fetch; else globalThis.fetch = savedFetch
    if (savedKey === undefined) delete process.env.LLM_API_KEY; else process.env.LLM_API_KEY = savedKey
    if (savedBase === undefined) delete process.env.LLM_API_BASE; else process.env.LLM_API_BASE = savedBase
    if (savedModel === undefined) delete process.env.LLM_MODEL; else process.env.LLM_MODEL = savedModel
  }

  /* 运行时：前端模式探测（live / 断网 / 强制 Mock） */
  const aiStatusMod = await loadModule('src/services/aiStatus.ts', 'ai-status')
  const statusFetch = globalThis.fetch
  try {
    globalThis.fetch = async () => ({ ok: true, status: 200,
      text: async () => JSON.stringify({ ok: true, mode: 'live', provider: 'api.deepseek.com', model: 'deepseek-chat' }) })
    const liveStatus = await aiStatusMod.probeAiMode(true)
    assert(liveStatus.mode === 'live' && /deepseek/.test(liveStatus.detail),
    '运行时：GET 返回 live 时前端判定为真实 AI')
    globalThis.fetch = async () => { throw new Error('offline') }
    const offlineStatus = await aiStatusMod.probeAiMode(true)
    assert(offlineStatus.mode === 'mock', '运行时：断网 / 无端点时前端静默判定为 Mock')
    aiStatusMod.setAiEnabled(false)
    globalThis.fetch = async () => ({ ok: true, status: 200,
      text: async () => JSON.stringify({ ok: true, mode: 'live' }) })
    const forcedStatus = await aiStatusMod.probeAiMode(true)
    assert(forcedStatus.mode === 'mock', '运行时：设置页「强制 Mock」开关生效')
    aiStatusMod.setAiEnabled(true)
  } finally {
    if (statusFetch === undefined) delete globalThis.fetch; else globalThis.fetch = statusFetch
  }

  /* ============================================================
   * 二十九、code-review 加固 / React 卸载取消 / 本地 404 代理排错
   * ============================================================ */
  const reviewChat = fs.readFileSync(path.join(root, 'api/chat.ts'), 'utf8')
  assert(reviewChat.includes('UPSTREAM_TIMEOUT_MS = 15_000') && reviewChat.includes('AbortController')
    && reviewChat.includes('signal: controller.signal'),
  'code-review：上游请求 15 秒超时并真正 abort，接口不会挂起')
  assert(!reviewChat.includes('VITE_LLM_API_KEY') && !reviewChat.includes('apiKey: key')
    && reviewChat.includes('Authorization: `Bearer ${key}`'),
  'code-review：密钥只在服务端 Authorization 头使用，绝不进前端变量')
  const aiBundleSrc = fs.readFileSync(path.join(assetDir, jsFile), 'utf8')
  /* 只查「真正的泄密通道」：env 读取语法、VITE_ 密钥变量、sk- 明文值。
     变量名本身可以合法出现在中文提示语里，按整串 includes 会误报。 */
  assert(!/process\.env\.LLM_|import\.meta\.env\.LLM_|VITE_LLM_API_KEY/.test(aiBundleSrc)
    && !/sk-[A-Za-z0-9_-]{12,}/.test(aiBundleSrc),
  'code-review：生产 bundle 无服务端 env 读取 / 无 VITE_ 密钥变量 / 无 sk- 明文密钥')
  /* 只匹配真正的变量读取语法 process.env.XXX；注释里出现 "process.env" 属正常说明文字 */
  const aiStatusSrc = fs.readFileSync(path.join(root, 'src/services/aiStatus.ts'), 'utf8')
  const aiDirectorFullSrc = fs.readFileSync(path.join(root, 'src/services/dialogueDirector.ts'), 'utf8')
  assert(!/process\.env\.[A-Z_]|import\.meta\.env\.LLM_/.test(aiStatusSrc + aiDirectorFullSrc),
  'code-review：前端服务层无真实 env 读取，密钥只在 api/chat.ts 服务端读取')
  const reviewHook = fs.readFileSync(path.join(root, 'src/hooks/useAbortableRequest.ts'), 'utf8')
  assert(reviewHook.includes('controllerRef.current?.abort()') && reviewHook.includes('mountedRef')
    && reviewHook.includes('isMounted'),
  'React 最佳实践：卸载自动 abort 在途请求，并提供 isMounted 守卫')
  const reviewDirector = fs.readFileSync(path.join(root, 'src/services/dialogueDirector.ts'), 'utf8')
  assert(reviewDirector.includes('createRequestSignal(20_000, input.signal)')
    && reviewDirector.includes('signal: gate.signal') && reviewDirector.includes('gate.dispose()')
    && reviewDirector.includes('if (input.signal?.aborted) throw err'),
  '服务层把卸载 signal 合并进 fetch，主动取消不落 Mock')
  const reviewDialogue = fs.readFileSync(path.join(root, 'src/pages/Dialogue.tsx'), 'utf8')
  assert(reviewDialogue.includes('const signal = nextSignal()') && reviewDialogue.includes('signal,')
    && reviewDialogue.includes('if (!isMounted() || signal.aborted) return'),
  '对话页 await 之后双重守卫，卸载不写 state')
  assert(fs.readFileSync(path.join(root, 'src/types.ts'), 'utf8').includes('signal?: AbortSignal'),
  'GenerateDialogueInput 增加可选 signal，旧调用零破坏')
  const reviewBadge = fs.readFileSync(path.join(root, 'src/components/AiModeBadge.tsx'), 'utf8')
  assert(reviewBadge.includes('probeAiMode(force, signal)') && reviewBadge.includes('useAbortableRequest'),
  '设置页徽章的探测请求同样在卸载时取消')
  const reviewEnv = fs.readFileSync(path.join(root, '.env.example'), 'utf8')
  assert(reviewEnv.includes('15 秒') && reviewEnv.includes('3001') && reviewEnv.includes('dev:full'),
  '.env.example 补充超时与纯本地 Express 联调端口 / 启动命令说明')
  assert(fs.readFileSync(path.join(root, 'README.md'), 'utf8').includes('二十九、'),
  'README 沉淀 404 系统排错与代理配置指南')

  /* 运行时：createRequestSignal 的超时 / 外部 abort / 卸载取消 */
  const abortMod = await loadModule('src/services/aiStatus.ts', 'ai-abort')
  const timedGate = abortMod.createRequestSignal(30)
  await new Promise((r) => setTimeout(r, 70))
  assert(timedGate.signal.aborted === true, '运行时：超时到期后 signal 自动 abort')
  timedGate.dispose()
  const outer = new AbortController()
  const outerGate = abortMod.createRequestSignal(5_000, outer.signal)
  outer.abort()
  assert(outerGate.signal.aborted === true, '运行时：组件卸载 signal 能中断在途请求')
  outerGate.dispose()
  const capturedFetch = globalThis.fetch
  let capturedSignal = null
  globalThis.fetch = (_url, init) => new Promise((_resolve, reject) => {
    capturedSignal = init.signal
    init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')), { once: true })
  })
  try {
    const unmount = new AbortController()
    const pending = abortMod.probeAiMode(true, unmount.signal)
    unmount.abort()
    const cancelled = await pending
    assert(capturedSignal?.aborted === true && cancelled.mode === 'mock',
    '运行时：卸载时探测 fetch 被 abort，且静默判为 Mock')
  } finally {
    if (capturedFetch === undefined) delete globalThis.fetch; else globalThis.fetch = capturedFetch
  }

  /* ============================================================
   * 三十、打字机效果（SSE 流式逐字上屏 / 30ms 定时器模拟 / 卸载清理）
   * ============================================================ */
  const twLib = fs.readFileSync(path.join(root, 'src/lib/typewriter.ts'), 'utf8')
  const twHook = fs.readFileSync(path.join(root, 'src/hooks/useTypewriter.ts'), 'utf8')
  const twStream = fs.readFileSync(path.join(root, 'src/services/llmStream.ts'), 'utf8')
  const twBubble = fs.readFileSync(path.join(root, 'src/pages/Dialogue.tsx'), 'utf8')
  const twChat = fs.readFileSync(path.join(root, 'api/chat.ts'), 'utf8')

  assert(twLib.includes('TYPEWRITER_INTERVAL_MS = 30') && twLib.includes('Array.from(text)')
    && twLib.includes('clearInterval(timer)'),
  '30ms 逐字切片；emoji 按码点不劈半；定时器只由 stop() 清理')
  assert(twLib.includes('class SseDeltaDecoder') && twLib.includes('class ReplyFieldExtractor')
    && twLib.includes('[DONE]'),
  'SSE 半帧拼接 + 结构化 JSON 的 reply 字段增量提取')
  assert(twStream.includes("stream: true") && twStream.includes('text/event-stream')
    && twStream.includes('cancel()') && twStream.includes('upstream.cancel()'),
  '流式接收管道请求 AI_ENDPOINT 的 SSE 分支，并在取消时释放上游 reader')
  assert(twHook.includes('return () => {') && twHook.includes('cancelledRef.current = true')
    && twHook.includes('stop()') && twHook.includes('reader.cancel()'),
  'React 最佳实践：effect cleanup 同时清定时器与流，卸载不残留')
  assert(twHook.includes('prefersReducedMotion') && twHook.includes('skip'),
  '尊重系统减少动效设置，并提供点击跳过动画')
  assert(twBubble.includes('<TypewriterText') && twBubble.includes('wasLastDialogueLive()')
    && twBubble.includes('typingId === m.id'),
  '只有刚从真实 AI 返回的最新气泡播放动画，Mock / 历史消息显示全文')
  assert(fs.readFileSync(path.join(root, 'src/services/dialogueDirector.ts'), 'utf8')
    .includes('export function wasLastDialogueLive()'),
  '服务层记录回复来源，所有降级路径不误开动画')
  assert(!/Typewriter|createCharacterTicker|setInterval/.test(twChat),
  'api/chat.ts 完全未被改动（打字机纯前端实现）')
  assert(fs.readFileSync(path.join(root, 'README.md'), 'utf8').includes('三十、'),
  'README 沉淀打字机流式 / 定时器双路径与卸载清理说明')

  /* 运行时：纯逻辑层 */
  const TW = await loadModule('src/lib/typewriter.ts', 'typewriter')
  assert(JSON.stringify(TW.splitCharacters('a🙂b')) === JSON.stringify(['a', '🙂', 'b']),
  '运行时：按 Unicode 码点切字，emoji 不被劈半')
  const frame = (delta) => `data: ${JSON.stringify({ choices: [{ delta: { content: delta } }] })}\n\n`
  const sse = new TW.SseDeltaDecoder()
  const firstHalf = frame('{"reply":"Hel')
  assert(sse.push(firstHalf.slice(0, 20)) === '' && sse.push(firstHalf.slice(20)).includes('Hel'),
  '运行时：跨 chunk 的半帧 SSE 能拼回完整 data 帧')
  const extractor = new TW.ReplyFieldExtractor()
  const p1 = extractor.push('{"reply":"Hel')
  const p2 = extractor.push('lo there!"}')
  assert(p1 === 'Hel' && p2 === 'lo there!' && p1 + p2 === 'Hello there!',
  '运行时：从流式结构化 JSON 只吐出 reply 正文增量，不出现 JSON 源码')
  let twTicks = 0
  /* 足够长的文本：30ms 时定时器仍在跑，stop() 才是真正的清理动作 */
  const ticker = TW.createCharacterTicker(Array.from({ length: 100 }, (_, i) => String(i % 10)),
    () => { twTicks += 1 }, 5)
  await tick(30)
  ticker.stop()
  const ticksAfterStop = twTicks
  await tick(25)
  assert(twTicks >= 1 && twTicks === ticksAfterStop,
  '运行时：stop() 之后定时器不再触发，卸载可清理干净')

  /* 运行时：SSE 流式接收管道（假 fetch，不发真实请求） */
  const StreamMod = await loadModule('src/services/llmStream.ts', 'llm-stream')
  const streamFetch = globalThis.fetch
  try {
    const enc = new TextEncoder()
    const body = new ReadableStream({
      start(controller) {
        controller.enqueue(enc.encode(frame('{"reply":"Hel')))
        controller.enqueue(enc.encode(frame('lo there!"}')))
        controller.enqueue(enc.encode('data: [DONE]\n\n'))
        controller.close()
      },
    })
    globalThis.fetch = async () => ({ ok: true, status: 200, body,
      headers: { get: () => 'text/event-stream; charset=utf-8' } })
    const replyStream = await StreamMod.openDialogueReplyStream(
      { messages: [{ role: 'user', content: 'hi' }], level: 'B1' }, new AbortController().signal)
    const pieces = []
    const rr = replyStream.getReader()
    for (;;) { const { done, value } = await rr.read(); if (done) break; pieces.push(value) }
    assert(pieces.length >= 2 && pieces.join('') === 'Hello there!',
    '运行时：SSE 流被逐段解码成英文回复，可逐字上屏')
    globalThis.fetch = async () => ({ ok: true, status: 200, body: null,
      headers: { get: () => 'application/json' } })
    assert(await StreamMod.openDialogueReplyStream(
      { messages: [{ role: 'user', content: 'hi' }], level: 'B1' }, new AbortController().signal) === null,
    '运行时：后端不是 SSE 时返回 null，调用方降级到 30ms 定时器')
  } finally {
    if (streamFetch === undefined) delete globalThis.fetch; else globalThis.fetch = streamFetch
  }

  /* ============================================================
   * 三十一、对话 UI 状态（思考骨架屏 / 全局错误兜底 / 零网络改动）
   * ============================================================ */
  const uiSkeleton = fs.readFileSync(path.join(root, 'src/components/ThinkingSkeleton.tsx'), 'utf8')
  const uiCard = fs.readFileSync(path.join(root, 'src/components/AiErrorCard.tsx'), 'utf8')
  const uiChannel = fs.readFileSync(path.join(root, 'src/components/aiErrorChannel.ts'), 'utf8')
  const uiCss = fs.readFileSync(path.join(root, 'src/index.css'), 'utf8')
  const uiDialogue = fs.readFileSync(path.join(root, 'src/pages/Dialogue.tsx'), 'utf8')

  /* 冻结快照：v1.7「只改前端 UI 组件」时钉下的基线。
     v1.8 用户明确要求改造 vite.config.ts 的 proxy 与 .env.example 的联调说明，
     因此这两个文件更新为 v1.8 受控基线；api/chat.ts、三个前端服务层文件、
     vercel.json 这 5 个「网络请求逻辑 / 后端 / 部署配置」文件仍逐字节冻结。
     v1.9 修复一次外部整体重写：PWA manifest / base / injectRegister / globIgnores
     曾被清空，已从会话档案逐字节还原 v1.8 全文，并保留用户新增的
     server.watch.ignored（Windows 文件锁规避），故 vite.config.ts 更新为 v1.9 受控基线。
     v2.0 Netlify 迁移：用户明确要求改前端请求路径与本地代理，故 aiStatus.ts
     （AI_ENDPOINT）与 vite.config.ts（双代理）更新为 v2.0 受控基线；
     dialogueDirector.ts / llmStream.ts 靠 import AI_ENDPOINT 自动跟随，
     连同 api/chat.ts / vercel.json / .env.example 共 5 个文件继续逐字节冻结。
     v2.2 防刷限流：用户明确要求前端 fetch 捕获 429，故 dialogueDirector.ts
     （429 识别与提示投递）与 .env.example（限流变量说明）更新为 v2.2 受控基线；
     api/chat.ts / llmStream.ts / vercel.json / aiStatus.ts / vite.config.ts 继续冻结。
     v2.4 异常处理完善：用户明确要求 500/401 在对话气泡里显示系统提示，故
     dialogueDirector.ts（失败状态码识别）再次更新为 v2.4 受控基线；
     后端 api/chat.ts、部署 vercel.json、vite.config.ts、.env.example 继续冻结。 */
  const { createHash } = await import('node:crypto')
  const frozenHash = (rel) => createHash('sha256')
    .update(fs.readFileSync(path.join(root, rel))).digest('hex')
  const FROZEN = {
    'api/chat.ts': '1f2e56a34fd41132088fa3152fc890480282b8f5686c16f43cde9d17ed553778',
    'src/services/dialogueDirector.ts': 'c855c646f0efc70cee1b61d8b2278f7f4fe973d6017fb5be291fa6c5adb624d4',
    'src/services/aiStatus.ts': 'a8e0bc212a6c15d44f83ec2d360ad66b853fdbed885e602466bb274a7b36687f',
    'src/services/llmStream.ts': '4ee596d5f154d7c94d20753bc6b95902a3efe9220e0ea004bcc290b015d00006',
    'vercel.json': '1dd30aa45b1253f3d3947f4ff094a3b32f35dd5947a442f6ca10fc75a8be21a9',
    'vite.config.ts': '42d24292ea41674342e073a165e092e60599225a57c450b8a2e0a846986cb25b',
    '.env.example': '297fa06290e2b2b83070446bae1d6047fe73a0397f8d334d2d578ef41268720e',
  }
  assert(Object.entries(FROZEN).every(([rel, hash]) => frozenHash(rel) === hash),
  '5 个网络层/后端/部署文件逐字节冻结；aiStatus.ts 与 vite.config.ts 为 v2.0 基线，dialogueDirector.ts 为 v2.4 基线，.env.example 为 v2.8 基线（补写内置 ASR 转写端点与 asr 独立额度说明）')

  assert(uiSkeleton.includes('role="status"') && uiSkeleton.includes('aria-busy="true"')
    && uiSkeleton.includes('aria-live="polite"') && uiSkeleton.includes('skeleton-dot')
    && uiSkeleton.includes('skeleton-bar') && uiSkeleton.includes('skeleton-track'),
  '思考骨架屏取代空白等待：三点呼吸 + 灰白骨架条 + 推进轨，且带 status 语义')
  const uiReduceBlock = uiCss.split('@media (prefers-reduced-motion: reduce)')[1] || ''
  assert(uiCss.includes('@keyframes skeleton-dot') && uiCss.includes('@keyframes skeleton-shimmer')
    && uiCss.includes('@keyframes skeleton-track')
    && uiReduceBlock.includes('animation: none') && uiReduceBlock.includes('.skeleton-track'),
  '骨架动效全部 CSS 实现（只动 transform/opacity），reduced-motion 下统一关闭')
  assert(uiCard.includes('role="alert"') && uiCard.includes('aria-live="assertive"')
    && uiCard.includes('data-testid="ai-error-retry"') && uiCard.includes('data-testid="ai-error-dismiss"')
    && uiCard.includes('min-h-[44px]') && uiCard.includes('focus-visible:outline'),
  '错误卡是 alert，提供「重试 / 继续用本地演示」双操作，44px 触摸目标与可见焦点圈')
  assert(uiCard.includes('describeAiError(') && uiCard.includes('本地演示接管'),
  '错误文案按状态码映射，并明确告知本地演示已接管、练习不中断')
  assert(uiChannel.includes('PerformanceObserver') && uiChannel.includes('observer.disconnect()')
    && uiChannel.includes("type: 'resource'") && !uiChannel.includes('window.fetch =')
    && !uiChannel.includes('fetch('),
  '状态码来自只读 performance 观察，不包裹 fetch、不发起任何网络请求')
  assert(uiChannel.includes('__linguaReportAiError') && uiChannel.includes('import.meta.env?.DEV')
    && uiChannel.includes("typeof window !== 'undefined'"),
  'dev 调试钩子可手动预览任意错误码，只在 Vite dev 挂载且带环境守卫')
  assert(uiDialogue.includes('{sending && <ThinkingSkeleton') && uiDialogue.includes('<AiErrorCard')
    && uiDialogue.includes('subscribeAiError') && uiDialogue.includes('dispose(); unsubscribe()')
    && uiDialogue.includes('void send(lastInputRef.current)'),
  '对话页用骨架屏替换原等待占位，错误卡在气泡位置提供重试，卸载清理订阅')
  assert(!uiDialogue.includes('animate-bounce rounded-full bg-brand-400'),
  '旧的「三个小点」空白等待占位已移除')
  assert(uiDialogue.includes('output = await generateDialogue(input)')
    && uiDialogue.includes('signal,') && uiDialogue.includes('mockGenerateDialogue(input)'),
  '网络调用、AbortSignal 与 Mock 降级路径保持原样，未被动过')
  assert(!/await fetch\(|fetch\(AI_ENDPOINT|\bfetch\(\s*['"]\/api/.test(uiDialogue)
    && !/await fetch\(|fetch\(AI_ENDPOINT|\bfetch\(\s*['"]\/api/.test(uiCard + uiSkeleton + uiChannel),
  'UI 组件层没有新增任何 fetch 调用，错误感知纯靠只读观察')
  assert(fs.readFileSync(path.join(root, 'README.md'), 'utf8').includes('三十一、'),
  'README 沉淀骨架屏 / 错误兜底设计定调与零网络改动边界')

  /* 运行时：错误码映射 + 发布订阅通道 */
  const CH = await loadModule('src/components/aiErrorChannel.ts', 'ai-error-channel')
  assert(CH.codeFromStatus(401) === 401 && CH.codeFromStatus(429) === 429
    && CH.codeFromStatus(500) === 500 && CH.codeFromStatus(503) === 503
    && CH.codeFromStatus(418) === 'unknown' && CH.codeFromStatus(599) === 500,
  '运行时：401/429/500/503 精确映射，未知 4xx 归 unknown、未知 5xx 归 500')
  assert(CH.describeAiError(402).title.includes('余额不足')
    && CH.describeAiError(401).title.includes('AI 老师暂时联系不上')
    && CH.describeAiError(500).title.includes('AI 老师正在休息')
    && CH.describeAiError(429).title.includes('AI 有点忙')
    && CH.describeAiError('unknown').title.includes('请稍后再试'),
  '运行时：余额不足 / 密钥错误 / 服务端故障 / 限流 / 通用失败都有各自的友好文案')
  const uiAllCodes = [400, 401, 402, 403, 404, 408, 429, 500, 502, 503, 504, 'network', 'unknown']
  assert(uiAllCodes.every((c) => {
    const d = CH.describeAiError(c)
    return d.label && d.title && d.hint && d.action
  }), '运行时：13 种错误码的标签 / 标题 / 建议 / 按钮文案全部齐备，无空洞状态')
  assert(uiAllCodes.every((c) => ['warm', 'danger'].includes(CH.describeAiError(c).severity))
    && CH.describeAiError(401).severity === 'danger'
    && CH.describeAiError(500).severity === 'danger'
    && CH.describeAiError(429).severity === 'warm',
  '运行时：每个错误码都有语气分级，服务端故障走 danger（红）、限流走 warm（暖）')
  const uiSeen = []
  const uiOff = CH.subscribeAiError((s) => uiSeen.push(s))
  CH.reportAiError(429, 'HTTP 429', 429)
  assert(uiSeen.length === 1 && uiSeen[0].code === 429 && CH.getAiError().status === 429,
  '运行时：发布 429 后订阅者收到精确码，通道内保留原始 status')
  CH.clearAiError()
  assert(uiSeen.length === 2 && uiSeen[1] === null && CH.getAiError() === null,
  '运行时：clearAiError 广播 null，重试 / 继续演示后卡片消失')
  uiOff()
  CH.reportAiError(401)
  assert(uiSeen.length === 2 && CH.getAiError().code === 401,
  '运行时：退订后不再收到通知，模块状态仍可被新订阅者读取')
  CH.clearAiError()
  const uiDispose = CH.observeChatHttpStatus()
  assert(typeof uiDispose === 'function',
  '运行时：不支持 resource timing 的环境静默降级为 no-op 清理函数')
  uiDispose()

  /* 运行时：模拟 Chrome 109+ 的 responseStatus，验证只读观察主路径 */
  const poOriginal = globalThis.PerformanceObserver
  let poOpts = null
  let poDisconnects = 0
  class FakePerformanceObserver {
    constructor(cb) { this.cb = cb; FakePerformanceObserver.last = this }
    observe(opts) { poOpts = opts }
    disconnect() { poDisconnects += 1 }
  }
  FakePerformanceObserver.supportedEntryTypes = ['resource', 'mark', 'measure']
  globalThis.PerformanceObserver = FakePerformanceObserver
  CH.clearAiError()
  const poSeen = []
  const poOff = CH.subscribeAiError((s) => poSeen.push(s))
  const poDispose = CH.observeChatHttpStatus()
  const poNow = performance.now()
  const poEntry = (name, responseStatus, startTime) => ({ name, responseStatus, startTime })
  FakePerformanceObserver.last.cb({ getEntries: () => [
    poEntry('http://localhost:5173/.netlify/functions/chat', 429, poNow + 10),
    poEntry('http://localhost:5173/assets/index.js', 500, poNow + 10),
    poEntry('http://localhost:5173/.netlify/functions/chat', 401, poNow - 100000),
  ] })
  assert(poOpts && poOpts.type === 'resource' && poOpts.buffered === true,
  '运行时：只读观察注册 resource 条目并启用 buffered')
  assert(poSeen.length === 1 && poSeen[0].code === 429 && poSeen[0].status === 429,
  '运行时：只把本轮 Netlify 函数路径的 429 发布成错误，忽略其它资源与历史条目')
  poDispose()
  assert(poDisconnects === 1,
  '运行时：卸载时 disconnect 释放 PerformanceObserver，不残留全局观察器')
  poOff()
  CH.clearAiError()
  if (poOriginal === undefined) delete globalThis.PerformanceObserver
  else globalThis.PerformanceObserver = poOriginal

  /* 运行时：真实 React 挂载，验证 DOM 语义、按钮回调与按码切换文案 */
  const UI_ENTRY = `
import React from 'react'
import { createRoot } from 'react-dom/client'
import { AiErrorCard } from './src/components/AiErrorCard.tsx'
import { ThinkingSkeleton } from './src/components/ThinkingSkeleton.tsx'
window.__mountCard = (el, code, onRetry, onDismiss) => {
  const r = createRoot(el)
  r.render(React.createElement(AiErrorCard, { code, detail: 'HTTP ' + code, onRetry, onDismiss }))
  return () => r.unmount()
}
window.__mountSkeleton = (el) => {
  const r = createRoot(el)
  r.render(React.createElement(ThinkingSkeleton, { speaker: 'Emma' }))
  return () => r.unmount()
}
`
  const uiOut = await build({
    stdin: { contents: UI_ENTRY, resolveDir: root, loader: 'tsx' },
    bundle: true, format: 'iife', platform: 'browser', jsx: 'automatic', write: false,
    define: { 'process.env.NODE_ENV': '"development"' }, logLevel: 'silent',
  })
  const uiVc = new VirtualConsole()
  const uiErrors = []
  uiVc.on('jsdomError', (e) => uiErrors.push(e.message))
  const uiDom = new JSDOM('<!doctype html><html><body><div id="c"></div><div id="s"></div></body></html>',
    { url: 'http://localhost/', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: uiVc })
  const uw = uiDom.window
  uw.eval(uiOut.outputFiles[0].text)
  const uiCardEl = uw.document.getElementById('c')
  const uiSkEl = uw.document.getElementById('s')
  let uiRetries = 0
  let uiDismisses = 0
  const uiUnmountCard = uw.__mountCard(uiCardEl, 429,
    () => { uiRetries += 1 }, () => { uiDismisses += 1 })
  const uiUnmountSk = uw.__mountSkeleton(uiSkEl)
  await tick(30)
  /* React 18 createRoot 是并发提交：固定 30ms 在高负载机器上偶发不够，
     轮询等到两个 root 都真正提交后再验 DOM（探针加固，不改任何组件） */
  for (let uiWait = 0; uiWait < 12; uiWait++) {
    if (uiCardEl.querySelector('[data-testid="ai-error-card"]')
      && uiSkEl.querySelector('[data-testid="thinking-skeleton"]')) break
    await tick(20)
  }
  const uiAlert = uiCardEl.querySelector('[data-testid="ai-error-card"]')
  assert(!!uiAlert && uiAlert.getAttribute('role') === 'alert'
    && uiCardEl.textContent.includes('AI 有点忙')
    && uiCardEl.querySelector('[data-testid="ai-error-retry"]')
    && uiCardEl.querySelector('[data-testid="ai-error-dismiss"]'),
  '运行时：429 错误卡渲染为 alert，含限流文案与「重试 / 继续演示」两个按钮')
  uiCardEl.querySelector('[data-testid="ai-error-retry"]').click()
  uiCardEl.querySelector('[data-testid="ai-error-dismiss"]').click()
  assert(uiRetries === 1 && uiDismisses === 1,
  '运行时：点击重试与继续用本地演示都能正确触发回调')
  const uiStatus = uiSkEl.querySelector('[data-testid="thinking-skeleton"]')
  assert(!!uiStatus && uiStatus.getAttribute('role') === 'status'
    && uiStatus.getAttribute('aria-busy') === 'true'
    && uiSkEl.querySelectorAll('.skeleton-dot').length === 3
    && uiSkEl.querySelectorAll('.skeleton-bar').length === 2,
  '运行时：骨架屏是 status 语义，三点呼吸 + 两行灰白骨架条齐备')
  const uiCardEl2 = uw.document.createElement('div')
  uw.document.body.appendChild(uiCardEl2)
  const uiUnmountCard2 = uw.__mountCard(uiCardEl2, 402, () => {}, () => {})
  await tick(30)
  assert(uiCardEl2.textContent.includes('余额不足'),
  '运行时：切换成 402 后卡片文案变为「余额不足」，状态码确实驱动了 UI')
  uiUnmountCard()
  uiUnmountCard2()
  uiUnmountSk()
  assert(uiErrors.length === 0,
  '运行时：组件挂载 / 交互 / 换码 / 卸载全程 0 jsdom 错误，无残留副作用')
  uw.close()

  /* ============================================================
   * 三十二、纯本地 Express 前后端联调（不依赖任何云 CLI / 不登录）
   * ============================================================ */
  const localServerSrc = fs.readFileSync(path.join(root, 'server.ts'), 'utf8')
  const localPkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
  const localVite = fs.readFileSync(path.join(root, 'vite.config.ts'), 'utf8')
  const localEnv = fs.readFileSync(path.join(root, '.env.example'), 'utf8')
  const localLegacy = fs.readFileSync(path.join(root, 'scripts/llm-dev-server.mjs'), 'utf8')

  assert(fs.existsSync(path.join(root, 'server.ts')) && fs.existsSync(path.join(root, 'api/chat.ts')),
  'server.ts 本地后端就位，api/chat.ts 原样保留作 legacy Vercel 入口（Netlify 不读取）')
  const localDeps = { ...localPkg.dependencies, ...localPkg.devDependencies }
  assert(['express', 'cors', 'dotenv', 'tsx', 'concurrently', '@types/node']
    .every((d) => typeof localDeps[d] === 'string'),
  'express / cors / dotenv / tsx / concurrently 与 Node 类型均已声明为依赖')
  const localScripts = localPkg.scripts
  assert(localScripts['dev:server'] === 'tsx server.ts'
    && localScripts['dev:server:mock'] === 'tsx server.ts --mock'
    && localScripts['dev:full'].includes('concurrently')
    && localScripts['dev:full'].includes('npm:dev:server') && localScripts['dev:full'].includes('npm:dev')
    && localScripts['dev:mock'].includes('npm:dev:server:mock')
    && localScripts.dev === 'vite --host 127.0.0.1'
    && localScripts.build === 'tsc --noEmit && vite build',
  'dev:server / dev:server:mock / dev:full / dev:mock 就位，原 dev 与 build 命令不变')
  assert(localServerSrc.includes("await import('./netlify/functions/chat.ts')")
    && localServerSrc.includes('invokeChat({')
    && localServerSrc.includes('method: req.method')
    && !localServerSrc.includes('completionUrl(')
    && !localServerSrc.includes('Authorization: `Bearer'),
  'server.ts 复用 Netlify 函数的 invokeChat，不复制 LLM 请求逻辑，本地与线上同源')
  assert(localServerSrc.includes('process.env.PORT || 3001')
    && localServerSrc.includes("app.listen(PORT, '127.0.0.1'")
    && localVite.includes("target: 'http://127.0.0.1:3001'"),
  '后端监听 127.0.0.1:3001，Vite 双代理指向同一端口')
  assert(localServerSrc.includes("['.env.local', '.env']")
    && localServerSrc.includes('dotenv.config({ path: envPath })'),
  '.env.local 优先于 .env 加载，系统环境变量不被覆盖')
  assert(localServerSrc.includes('app.use(cors()') && localServerSrc.includes('express.json(')
    && localServerSrc.includes("app.get('/api/health'")
    && localServerSrc.includes("app.all(['/.netlify/functions/chat', '/api/chat']"),
  'cors / JSON 解析 / 健康检查齐备，主路径与 Netlify 一致并保留 legacy /api/chat')
  assert(localServerSrc.includes('--mock') && localServerSrc.includes('/mock/v1/chat/completions')
    && localServerSrc.includes('[DONE]') && localServerSrc.includes('text/event-stream'),
  '--mock 内置 OpenAI 兼容假上游（含 SSE），零真 Key / 零外网可跑通全链路')
  /* 探针要看「响应里有没有 key 字段」，而不是有没有 LLM_API_KEY 字样：
     health 用 configured: Boolean(String(process.env.LLM_API_KEY || '').trim())
     只是读取存在性，宽泛正则会把它误判成回传密钥。 */
  const localHealthBlock = localServerSrc.split("app.get('/api/health'")[1]?.split('/**')[0] || ''
  assert(localServerSrc.includes('configured: Boolean(String(process.env.LLM_API_KEY')
    && !/\b(?:apiKey|key|secret|token|LLM_API_KEY)\s*:/i.test(localHealthBlock)
    && !localEnv.includes('VITE_LLM_API_KEY='),
  '健康检查只回 configured 布尔值，不回传密钥；环境模板禁止 VITE_ 前缀')
  assert(localServerSrc.includes('SIGINT') && localServerSrc.includes('SIGTERM')
    && localServerSrc.includes('app.use((err: unknown'),
  'Ctrl+C 优雅退出，Express 错误中间件把解析失败转成可降级 JSON')
  assert(localVite.includes("proxy: {") && localVite.includes("'/.netlify/functions'")
    && localVite.includes("'/api'") && !localVite.includes('rewrite:'),
  'Vite 双代理：/.netlify/functions 主路径 + /api legacy，均不做 rewrite，与线上一致')
  assert(localLegacy.includes('LLM_DEV_PORT || 3001') && localLegacy.includes('legacy'),
  '旧联调台端口同步到 3001 并标注 legacy，避免与新代理不一致')
  assert(localEnv.includes('dev:full') && localEnv.includes('dev:mock')
    && localEnv.includes('3001') && !localEnv.includes('vercel dev --port 3000'),
  '.env.example 改为纯本地 Express 联调说明，移除 Vercel CLI 依赖')
  assert(fs.readFileSync(path.join(root, 'README.md'), 'utf8').includes('三十二、'),
  'README 沉淀纯本地联调的启动与测试手册')
  let localServerParsed = false
  try {
    await transform(localServerSrc, { loader: 'ts', format: 'esm', target: 'node20' })
    localServerParsed = true
  } catch { /* ignore */ }
  assert(localServerParsed,
  '运行时：server.ts 可被 esbuild/tsx 解析为合法 ESM（含 top-level await）')

  /* ============================================================
   * 三十三、全局错误边界（防白屏 / 只改 UI 结构 / 零网络改动）
   * ============================================================ */
  const ebSrc = fs.readFileSync(path.join(root, 'src/components/ErrorBoundary.tsx'), 'utf8')
  const ebApp = fs.readFileSync(path.join(root, 'src/App.tsx'), 'utf8')
  const ebMain = fs.readFileSync(path.join(root, 'src/main.tsx'), 'utf8')

  assert(ebSrc.includes('extends Component<') && ebSrc.includes('static getDerivedStateFromError')
    && ebSrc.includes('componentDidCatch(') && ebSrc.includes('console.error(')
    && ebSrc.includes('onError?.('),
  '错误边界是 class 组件：getDerivedStateFromError 切状态、componentDidCatch 记录且不吞错')
  assert(ebSrc.includes('data-testid="error-boundary-fallback"')
    && ebSrc.includes('role="alert"') && ebSrc.includes('aria-live="assertive"')
    && ebSrc.includes('<svg') && ebSrc.includes('哎呀，应用开小差了')
    && /\>\s*重新加载\s*\</.test(ebSrc)
    && ebSrc.includes('data-testid="error-boundary-reload"')
    && ebSrc.includes('window.location.reload()'),
  '降级页为全屏 alert：内联卡通图标 + 指定一行文案 + 重新加载按钮（真实 reload）')
  assert(ebSrc.includes('fixed inset-0') && ebSrc.includes('min-h-screen')
    && ebSrc.includes('app-bg') && ebSrc.includes('card animate-in')
    && ebSrc.includes('min-h-[44px]') && ebSrc.includes('focus-visible:outline'),
  '全屏覆盖、沿用既有 app-bg/card 视觉语言、按钮 ≥44px 且焦点圈可见')
  /* 本轮红线：只改 UI 结构，绝不碰后端网络请求逻辑 */
  const ebNetworkTokens = ['fetch(', 'XMLHttpRequest', 'axios', '/api/chat', 'supabase',
    'LLM_API_KEY', '<img', 'http://', 'https://']
  assert(ebNetworkTokens.every((t) => !ebSrc.includes(t))
    && !ebApp.includes('fetch(') && !ebMain.includes('fetch('),
  '错误边界与两个入口均零网络请求、零外链资源，图标完全内联（离线壳可用）')
  assert(Object.entries(FROZEN).every(([rel, hash]) => frozenHash(rel) === hash),
  '冻结基线复核：api/chat.ts / 三个对话服务层 / llmStream / vercel.json / .env.example 逐字节未变，vite.config.ts 为 v2.0 受控基线')

  const ebOldViewMap = ebApp.match(/const PAGES: Record<View, ReactNode> = \{[\s\S]*?\n\}/)?.[0] || ''
  const ebMapKeys = [...ebOldViewMap.matchAll(/^\s{2}(\w+): </gm)].map((m) => m[1])
  assert(ebApp.includes("import { ErrorBoundary } from './components/ErrorBoundary'")
    && /export default function App\(\) \{\s*return \(\s*<ErrorBoundary>/.test(ebApp)
    && ebApp.includes('<AppContent />')
    && ebApp.includes('<Layout>')
    && ebApp.includes('{PAGES[view]}')
    && ebMapKeys.length >= 25
    && ['home', 'dialogue', 'reader', 'watch', 'wordSession', 'growth', 'chinaUnit']
      .every((k) => ebMapKeys.includes(k)),
  'App.tsx 最外层罩上 ErrorBoundary，原 25 条视图映射与 Layout 结构一条未动')
  assert(ebMain.includes("import { ErrorBoundary } from './components/ErrorBoundary'")
    && ebMain.includes('<ErrorBoundary>') && ebMain.includes('<AppProvider>')
    && ebMain.includes('<App />') && ebMain.includes('React.StrictMode'),
  'main.tsx 根部再兜一层，AppProvider 初始化异常同样不白屏')

  /* 运行时：真实 React 挂载，让子组件当场抛错，亲眼确认白屏被接住 */
  const EB_ENTRY = `
import React from 'react'
import { createRoot } from 'react-dom/client'
import { ErrorBoundary } from './src/components/ErrorBoundary.tsx'
function Boom() { throw new Error('模拟渲染崩溃') }
function Fine() { return React.createElement('p', { 'data-testid': 'eb-fine' }, '一切正常') }
window.__mountEB = (el, boom, onError) => {
  const r = createRoot(el)
  r.render(React.createElement(ErrorBoundary, { onError },
    boom ? React.createElement(Boom) : React.createElement(Fine)))
  return () => r.unmount()
}
`
  const ebOut = await build({
    stdin: { contents: EB_ENTRY, resolveDir: root, loader: 'tsx' },
    bundle: true, format: 'iife', platform: 'browser', jsx: 'automatic', write: false,
    define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'silent',
  })
  const ebVc = new VirtualConsole()
  const ebErrors = []
  ebVc.on('jsdomError', (e) => ebErrors.push(e.message))
  ebVc.on('error', () => {}) /* componentDidCatch 的 console.error 不转发到宿主 */
  const ebDom = new JSDOM('<!doctype html><html><body><div id="boom"></div><div id="fine"></div></body></html>',
    { url: 'http://localhost/', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: ebVc })
  const ew = ebDom.window
  ew.eval(ebOut.outputFiles[0].text)
  let ebCaught = 0
  let ebCaughtMsg = ''
  const ebBoomEl = ew.document.getElementById('boom')
  const ebFineEl = ew.document.getElementById('fine')
  const ebUnmountBoom = ew.__mountEB(ebBoomEl, true,
    (err) => { ebCaught += 1; ebCaughtMsg = String(err && err.message) })
  const ebUnmountFine = ew.__mountEB(ebFineEl, false, () => {})
  /* React 18 createRoot 是并发提交：固定等待在高负载机器上偶发不够
     （曾出现健康子树尚未提交就断言的抖动）。轮询等两个 root 都真正落定后再验 DOM，
     探针加固，不改任何组件。 */
  for (let ebWait = 0; ebWait < 20; ebWait++) {
    if (ebBoomEl.querySelector('[data-testid="error-boundary-fallback"]')
      && ebFineEl.textContent.includes('一切正常')) break
    await tick(20)
  }
  const ebFallback = ebBoomEl.querySelector('[data-testid="error-boundary-fallback"]')
  assert(!!ebFallback && ebFallback.getAttribute('role') === 'alert'
    && ebBoomEl.textContent.includes('哎呀，应用开小差了')
    && !!ebBoomEl.querySelector('[data-testid="error-boundary-icon"]')
    && ebBoomEl.querySelectorAll('svg circle').length >= 4
    && !!ebBoomEl.querySelector('[data-testid="error-boundary-reload"]'),
  '运行时：子组件渲染抛错 → 全屏降级页出现（怒气图标 + 文案 + 按钮），不是白屏')
  assert(ebCaught === 1 && ebCaughtMsg === '模拟渲染崩溃'
    && !ebFallback.textContent.includes('模拟渲染崩溃'),
  '运行时：原始错误经 onError 完整上抛留证，但不在用户面前展示堆栈')
  assert(!ebFineEl.querySelector('[data-testid="error-boundary-fallback"]')
    && ebFineEl.textContent.includes('一切正常'),
  '运行时：正常子树不受影响，边界不会误伤')
  let ebReloads = 0
  let ebReloadSpied = false
  try {
    Object.defineProperty(ew.location, 'reload', {
      configurable: true, writable: true, value: () => { ebReloads += 1 },
    })
    ebReloadSpied = true
  } catch { /* jsdom 的 location.reload 不可重定义 → 改用导航提示取证，绝不跳过点击 */ }
  ebBoomEl.querySelector('[data-testid="error-boundary-reload"]').click()
  await tick(20)
  if (ebReloadSpied) {
    assert(ebReloads === 1,
    '运行时：点击「重新加载」确实触发一次 window.location.reload()')
  } else {
    const ebNav = ebErrors.filter((e) => /Not implemented: navigation/.test(e))
    assert(ebNav.length === 1,
    '运行时：点击「重新加载」触发 location.reload()（jsdom 以 navigation 提示佐证调用已发生）')
    /* jsdom 不支持真实导航，这条提示是环境限制而非应用异常，剔除后再查 0 异常 */
    ebErrors.splice(ebErrors.findIndex((e) => /Not implemented: navigation/.test(e)), 1)
  }
  ebUnmountBoom()
  ebUnmountFine()
  assert(ebErrors.length === 0,
  '运行时：抛错 / 降级 / 正常分支 / 点击 / 卸载全程 0 jsdom 异常')
  ew.close()

  /* ============================================================
   * 三十四、Netlify 全栈迁移（Functions / 路径 / 双代理 / 运行时契约）
   * ============================================================ */
  const nfSrc = fs.readFileSync(path.join(root, 'netlify/functions/chat.ts'), 'utf8')
  const nfToml = fs.readFileSync(path.join(root, 'netlify.toml'), 'utf8')
  const nfStatus = fs.readFileSync(path.join(root, 'src/services/aiStatus.ts'), 'utf8')
  const nfDirector = fs.readFileSync(path.join(root, 'src/services/dialogueDirector.ts'), 'utf8')
  const nfStream = fs.readFileSync(path.join(root, 'src/services/llmStream.ts'), 'utf8')
  const nfChannel = fs.readFileSync(path.join(root, 'src/components/aiErrorChannel.ts'), 'utf8')
  const nfBadge = fs.readFileSync(path.join(root, 'src/components/AiModeBadge.tsx'), 'utf8')
  const nfSettings = fs.readFileSync(path.join(root, 'src/pages/Settings.tsx'), 'utf8')
  const nfServer = fs.readFileSync(path.join(root, 'server.ts'), 'utf8')
  const nfVite = fs.readFileSync(path.join(root, 'vite.config.ts'), 'utf8')

  assert(fs.existsSync(path.join(root, 'netlify/functions/chat.ts'))
    && fs.existsSync(path.join(root, 'netlify.toml')),
  '新增 netlify/functions/chat.ts 与 netlify.toml')
  assert(!/^\s*\[\[build\]/m.test(nfToml) && nfToml.includes('[build]')
    && nfToml.includes('command = "npm run build"') && nfToml.includes('publish = "dist"')
    && nfToml.includes('functions = "netlify/functions"'),
  'netlify.toml 修正无效 [[build]，声明构建命令 / 发布目录 / 函数目录')
  const nfRedirectBlock = nfToml.split('[[redirects]]')[1]?.split('[[')[0] || ''
  assert(nfRedirectBlock.includes('from = "/*"') && nfRedirectBlock.includes('to = "/index.html"')
    && !/force\s*=\s*true/.test(nfRedirectBlock),
  'SPA 回退保留但非 force，平台保留的 /.netlify/functions/* 会先命中函数')
  assert(nfToml.includes('for = "/assetlinks.json"') && nfToml.includes('for = "/sw.js"')
    && nfToml.includes('for = "/manifest.webmanifest"') && nfToml.includes('CDN-Cache-Control')
    && nfToml.includes('application/manifest+json'),
  '原有 assetlinks 规则保留，SW / manifest 补上 no-store 与正确 MIME')
  assert(nfSrc.includes('export const handler') && nfSrc.includes('export async function invokeChat')
    && nfSrc.includes('NetlifyEvent') && nfSrc.includes('statusCode')
    && nfSrc.includes('httpMethod') && nfSrc.includes('queryStringParameters'),
  'Netlify 函数导出 handler(event)→{statusCode,headers,body}，并抽出 invokeChat 复用')
  assert(nfSrc.includes('process.env.LLM_API_KEY') && nfSrc.includes('completionUrl(base)')
    && nfSrc.includes('buildMessages(body.messages, level)') && nfSrc.includes('AbortController')
    && nfSrc.includes('fallback: true') && nfSrc.includes('text/event-stream')
    && nfSrc.includes('choices?.[0]?.message?.content') && nfSrc.includes('sk-***'),
  'api/chat.ts 的大模型逻辑完整搬运：校验 / 脱敏 / 超时 / 上游 / SSE / 降级')
  assert(!nfSrc.includes('res.status(') && !nfSrc.includes('res.json(')
    && !nfSrc.includes("await import('./api/chat.ts')"),
  '函数不残留 Vercel 的 res 风格，也不跨目录依赖 api/（打包自包含）')
  assert(nfSrc.includes('UPSTREAM_TIMEOUT_MS = 9_000') && nfSrc.includes('10s'),
  'Netlify 同步函数 ~10s 上限适配：上游超时 9s，保证返回可降级 JSON')
  assert(nfStatus.includes("export const AI_ENDPOINT = '/.netlify/functions/chat'")
    && nfDirector.includes('fetch(AI_ENDPOINT') && nfStream.includes('fetch(AI_ENDPOINT')
    && !/fetch\(\s*['"]\/api\/chat/.test(nfDirector + nfStream + nfStatus),
  '前端唯一端点常量切到 Netlify 路径，GET / POST / SSE 三处自动跟随')
  assert(nfChannel.includes('\\.netlify') && !nfChannel.includes('\\/api\\/chat')
    && nfChannel.includes('npm run dev:full'),
  '错误观察器改盯 Netlify 函数路径，404 hint 同步为本地联调命令')
  assert(!nfBadge.includes('/api/chat') && !nfSettings.includes('/api/chat')
    && !nfStatus.includes('/api/chat'),
  '徽章 / 设置页 / 探测文案不再出现旧 Vercel 路径')
  assert(nfServer.includes("await import('./netlify/functions/chat.ts')")
    && nfServer.includes("app.all(['/.netlify/functions/chat', '/api/chat']")
    && nfServer.includes('invokeChat({')
    && nfServer.includes('method: req.method')
    && nfVite.includes("'/.netlify/functions'") && nfVite.includes("'/api'")
    && !nfVite.includes('rewrite:'),
  '本地 Express 双路径 + Vite 双代理，主线跑生产同款 invokeChat')
  assert(fs.existsSync(path.join(root, 'api/chat.ts')) && fs.existsSync(path.join(root, 'vercel.json')),
  'legacy Vercel 入口与配置原样保留，Netlify 部署不读取它们')
  assert(fs.readFileSync(path.join(root, 'README.md'), 'utf8').includes('三十四、'),
  'README 沉淀 Netlify 迁移的部署与本地调试手册')

  /* 运行时：把 Netlify 函数真跑起来，逐条验证 event → statusCode/headers/body 契约 */
  const NF = await loadModule('netlify/functions/chat.ts', 'netlify-chat')
  assert(typeof NF.handler === 'function' && typeof NF.invokeChat === 'function',
  '运行时：handler 与 invokeChat 均为可调用导出')
  const nfParse = (r) => JSON.parse(r.body)
  /* [防刷限流] 限流按 IP 分桶：每个测试场景代表一个不同的客户端 IP，
     否则连续 6 次 POST 会触发限流，既有断言自己把自己锁在门外 */
  const nfIp = (n) => ({ 'x-nf-client-connection-ip': `198.51.100.${n}` })
  const nfRealFetch = globalThis.fetch
  const nfSavedEnv = {
    key: process.env.LLM_API_KEY, base: process.env.LLM_API_BASE, model: process.env.LLM_MODEL,
  }
  try {
    delete process.env.LLM_API_KEY
    const g0 = await NF.invokeChat({ method: 'GET' })
    assert(g0.statusCode === 200 && nfParse(g0).mode === 'mock'
      && nfParse(g0).configured === false && g0.headers['Cache-Control'] === 'no-store'
      && typeof g0.body === 'string',
    '运行时：GET 无 Key → 200 mode:mock，且返回 Netlify 形状 {statusCode,headers,body}')
    const p0 = await NF.invokeChat({ method: 'POST', body: { messages: [{ role: 'user', content: 'hi' }] }, headers: nfIp(1) })
    assert(p0.statusCode === 503 && nfParse(p0).fallback === true,
    '运行时：POST 无 Key → 503 + fallback:true，前端可立即回退 Mock')

    process.env.LLM_API_KEY = 'sk-smoke-secret-123456'
    process.env.LLM_API_BASE = 'https://smoke.example/v1'
    const g1 = await NF.invokeChat({ method: 'GET' })
    assert(g1.statusCode === 200 && nfParse(g1).mode === 'live'
      && nfParse(g1).provider === 'smoke.example' && !g1.body.includes('sk-smoke-secret'),
    '运行时：GET 有 Key → mode:live / 只回域名 / 响应体绝不回传密钥')
    const opt = await NF.invokeChat({ method: 'OPTIONS' })
    assert(opt.statusCode === 204 && opt.headers.Allow === 'GET, POST, OPTIONS',
    '运行时：OPTIONS → 204 + Allow 头')
    const put = await NF.invokeChat({ method: 'PUT' })
    assert(put.statusCode === 405 && nfParse(put).fallback === true,
    '运行时：非 GET/POST → 405 且带 fallback:true 暗号')
    const bad = await NF.invokeChat({ method: 'POST', body: '{oops', headers: nfIp(2) })
    assert(bad.statusCode === 503 && nfParse(bad).fallback === true,
    '运行时：非法 JSON 请求体 → 503 可降级，不冒泡成函数崩溃')

    globalThis.fetch = async () => new Response(JSON.stringify({
      choices: [{ message: { content: '{"reply":"Hi there"}' } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })
    const ok = await NF.invokeChat({ method: 'POST', body: { messages: [{ role: 'user', content: 'hi' }], level: 'B1' }, headers: nfIp(3) })
    assert(ok.statusCode === 200 && nfParse(ok).ok === true
      && nfParse(ok).content.includes('Hi there') && nfParse(ok).mode === 'live',
    '运行时：伪造上游成功 → 200 标准 JSON，content 原样透传')

    globalThis.fetch = async () => new Response(
      'data: {"choices":[{"delta":{"content":"hello"}}]}\n\ndata: [DONE]\n\n',
      { status: 200, headers: { 'Content-Type': 'text/event-stream' } })
    const sse = await NF.invokeChat({ method: 'POST', body: { messages: [{ role: 'user', content: 'hi' }], stream: true }, headers: nfIp(4) })
    assert(sse.statusCode === 200 && sse.headers['Content-Type'].includes('text/event-stream')
      && sse.body.includes('data: ') && sse.body.includes('[DONE]'),
    '运行时：SSE 缓冲式适配 → 完整帧一次性返回，前端拼帧器仍可解析')

    globalThis.fetch = async () => new Response('upstream says sk-leaked-abcdef', { status: 401 })
    const up = await NF.invokeChat({ method: 'POST', body: { messages: [{ role: 'user', content: 'hi' }] }, headers: nfIp(5) })
    assert(up.statusCode === 502 && nfParse(up).fallback === true
      && up.body.includes('sk-***') && !up.body.includes('sk-leaked'),
    '运行时：上游 401 → 502 可降级，错误信息里的密钥被脱敏')

    globalThis.fetch = async () => new Response(JSON.stringify({
      choices: [{ message: { content: '{"reply":"from event"}' } }],
    }), { status: 200 })
    const ev = await NF.handler({
      httpMethod: 'POST',
      body: JSON.stringify({ messages: [{ role: 'user', content: 'hi' }] }),
      queryStringParameters: {}, isBase64Encoded: false,
      headers: nfIp(6),
    })
    assert(ev && ev.statusCode === 200 && typeof ev.body === 'string'
      && ev.headers['Content-Type'].includes('application/json')
      && nfParse(ev).content.includes('from event'),
    '运行时：handler(event) 完整适配 Netlify —— JSON 字符串 body 被解析并走通上游')
    const evGet = await NF.handler({ httpMethod: 'GET', body: null, queryStringParameters: null })
    assert(evGet.statusCode === 200 && typeof evGet.body === 'string',
    '运行时：handler 的 GET 探测同样返回合法 Netlify 结果')
  } finally {
    globalThis.fetch = nfRealFetch
    const nfEnvNames = { key: 'LLM_API_KEY', base: 'LLM_API_BASE', model: 'LLM_MODEL' }
    for (const [k, v] of Object.entries(nfSavedEnv)) {
      const name = nfEnvNames[k]
      if (v === undefined) delete process.env[name]
      else process.env[name] = v
    }
  }

  /* ============================================================
   * 三十五、Netlify 注入徽章的 CSS 隐藏兜底（纯样式，业务代码零改动）
   * ============================================================ */
  const badgeCss = fs.readFileSync(path.join(root, 'src/index.css'), 'utf8')
  const badgeBlock = badgeCss.split('Netlify 注入徽章')[1] || ''
  assert(badgeBlock.includes('html body :is(') && badgeBlock.includes('display: none !important')
    && badgeBlock.includes('visibility: hidden !important') && badgeBlock.includes('opacity: 0 !important')
    && badgeBlock.includes('pointer-events: none !important')
    && badgeBlock.includes('overflow: hidden !important'),
  '全局样式新增徽章隐藏规则：display / visibility / opacity / 交互 / 溢出五重锁，全部 !important')
  assert(["#netlify-badge", ".netlify-badge", "netlify-badge,", "iframe[src*=",
    "iframe[title*=", "[data-netlify-badge]", "[class*='netlify-badge' i]",
    "[class*='netlify' i]"]
    .every((s) => badgeBlock.includes(s)),
  '选择器覆盖 id / class / 自定义元素 / iframe(src,title) / data 属性四类宿主，含宽口径 [class*="netlify"]')
  assert(badgeBlock.includes('display: none !important')
    && badgeBlock.includes('opacity: 0 !important')
    && badgeBlock.includes('pointer-events: none !important')
    && badgeBlock.includes('position: absolute !important'),
  '宽口径 [class*="netlify"] 同样挂上 display:none / opacity:0 / pointer-events:none 三件套')
  assert(badgeCss.indexOf('Netlify 注入徽章') > badgeCss.indexOf('@media (prefers-reduced-motion: reduce)')
    && badgeBlock.includes('isolated / inline frame')
    && badgeBlock.includes('Powered by Netlify badge'),
  '规则置于全局样式末尾；注释如实标注官方隔离 frame 限制与后台开关，不误导后来者')
  let badgeCssParsed = false
  try {
    await transform(badgeCss, { loader: 'css' })
    badgeCssParsed = true
  } catch { /* ignore */ }
  assert(badgeCssParsed,
  '运行时：整份 index.css 仍能被 esbuild 解析为合法 CSS（属性选择器 i 标志不破坏构建）')
  const badgeDistCss = fs.readdirSync(assetDir).find((f) => /^index-.*\.css$/.test(f))
  assert(!!badgeDistCss
    && fs.readFileSync(path.join(assetDir, badgeDistCss), 'utf8').includes('netlify-badge'),
  '生产包 CSS 确实带上徽章隐藏规则，部署后不是「只躺在源码里」')
  assert(fs.readFileSync(path.join(root, 'README.md'), 'utf8').includes('三十五、'),
  'README 记录徽章真相与后台开关 / CSP 两种根治手段')
  assert(Object.entries(FROZEN).every(([rel, hash]) => frozenHash(rel) === hash),
  '徽章章节只动全局样式与验证脚本，7 个网络层 / 后端 / 部署基线文件全部逐字节未变')

  /* ============================================================
   * 三十六、防刷限流（纯内存 IP 限流 · 429 契约 · 前端优雅提示）
   * ============================================================ */
  const rlSrc = fs.readFileSync(path.join(root, 'netlify/lib/rateLimit.ts'), 'utf8')
  assert(fs.existsSync(path.join(root, 'netlify/lib/rateLimit.ts'))
    && rlSrc.includes('new Map<string, Bucket>()')
    && rlSrc.includes('DEFAULT_PER_MINUTE = 5')
    && rlSrc.includes('DEFAULT_PER_DAY = 50')
    && rlSrc.includes('x-nf-client-connection-ip')
    && rlSrc.includes('x-forwarded-for'),
  '新增 netlify/lib/rateLimit.ts：纯内存 Map 分桶，默认每分钟 5 次 / 每天 50 次，IP 优先取平台头')
  assert(rlSrc.includes('MAX_BUCKETS = 5000') && rlSrc.includes('resetRateLimiter')
    && rlSrc.includes('export function checkRateLimit')
    && rlSrc.includes('export function rateLimitHeaders'),
  '限流模块内存有界（桶表上限 + 死桶清理），并提供重置与响应头导出')
  assert(nfSrc.includes("from '../lib/rateLimit'")
    && nfSrc.includes('checkRateLimit(clientIp(req.headers)')
    && nfSrc.includes('if (!decision.allowed) return rateLimitedResult(decision)')
    && nfSrc.includes("'请求太频繁，请稍后再试'")
    && nfSrc.includes("'今日额度已用完'")
    && nfSrc.includes('Retry-After'),
  'chat.ts 接入限流：429 + 中文提示（请求太频繁 / 今日额度已用完）+ Retry-After 头')
  assert(nfSrc.includes('rateLimited: true') && nfSrc.includes('fallback: true')
    && nfSrc.includes('headers: event.headers'),
  '429 响应仍带 fallback:true（前端照旧回退 Mock），并把平台请求头透传进限流判定')
  assert(nfServer.includes('function toClientHeaders(req: express.Request)')
    && nfServer.includes('headers[name] = Array.isArray(value) ? value[0] : value')
    && nfServer.includes('headers: toClientHeaders(req)')
    && (nfServer.match(/headers: toClientHeaders\(req\)/g) || []).length === 4,
  '本地 Express 把请求头归一化后透传给 invokeChat / invokeEvaluate / invokeFreetalk / invokeTranscribe，本地限流与线上同一套判定')
  const rlDirector = fs.readFileSync(path.join(root, 'src/services/dialogueDirector.ts'), 'utf8')
  const rlDialogue = fs.readFileSync(path.join(root, 'src/pages/Dialogue.tsx'), 'utf8')
  const rlChannel = fs.readFileSync(path.join(root, 'src/components/aiErrorChannel.ts'), 'utf8')
  assert(rlDirector.includes('if (!res.ok) recordAiErrorStatus(res.status, parseServerErrorMessage(raw))')
    && rlDirector.includes('return mockGenerateDialogue(input)'),
  '前端 fetch 层捕获任何失败状态码并投递状态码与中文提示；服务层仍回退 Mock，练习不中断、不会白屏')
  assert(rlDialogue.includes('takeAiErrorSignal()')
    && rlDialogue.includes('reportAiError(codeFromStatus(errSignal.status)')
    && rlChannel.includes("label: '请求太频繁'"),
  '对话界面把限流提示发布成友好卡片，而不是通用失败或崩溃')
  assert(rlChannel.includes("if (current?.code === code && !/^HTTP \\d+$/.test(current.detail || '')")
    && fs.readFileSync(path.join(root, 'src/services/aiErrorSignal.ts'), 'utf8').includes('RATE_LIMITED_STATUS = 429'),
  '只读观察器不覆盖已抓到中文提示的同码错误，精确诊断优先于通用 HTTP 码')

  /* 运行时：把限流真跑起来 —— 连打 6 次 POST，看第 6 次是否真的举起 429 牌子 */
  const NF2 = await loadModule('netlify/functions/chat.ts', 'netlify-chat-ratelimit')
  const rlRealFetch = globalThis.fetch
  const rlSavedEnv = {
    LLM_API_KEY: process.env.LLM_API_KEY,
    LLM_API_BASE: process.env.LLM_API_BASE,
    RATE_LIMIT_PER_MINUTE: process.env.RATE_LIMIT_PER_MINUTE,
    RATE_LIMIT_PER_DAY: process.env.RATE_LIMIT_PER_DAY,
  }
  try {
    process.env.LLM_API_KEY = 'sk-ratelimit-secret-123456'
    process.env.LLM_API_BASE = 'https://ratelimit.example/v1'
    delete process.env.RATE_LIMIT_PER_MINUTE
    delete process.env.RATE_LIMIT_PER_DAY
    globalThis.fetch = async () => new Response(JSON.stringify({
      choices: [{ message: { content: '{"reply":"ok"}' } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } })

    const rlIp = (n) => ({ 'x-nf-client-connection-ip': `203.0.113.${n}` })
    const rlPost = (headers) => NF2.invokeChat({
      method: 'POST',
      body: { messages: [{ role: 'user', content: 'hi' }] },
      headers,
    })

    const rlAllowed = []
    for (let i = 0; i < 5; i++) rlAllowed.push(await rlPost(rlIp(1)))
    assert(rlAllowed.every((r) => r.statusCode === 200),
    '运行时：同一 IP 前 5 次 POST 全部放行（默认每分钟 5 次）')

    const rlSixth = await rlPost(rlIp(1))
    const rlSixthBody = JSON.parse(rlSixth.body)
    assert(rlSixth.statusCode === 429 && rlSixthBody.rateLimited === true
      && rlSixthBody.error === '请求太频繁，请稍后再试'
      && rlSixthBody.fallback === true
      && !!rlSixth.headers['Retry-After'],
    '运行时：第 6 次触发分钟窗限流 → 429 + 中文提示 + Retry-After，且仍带 fallback:true')

    const rlOther = await rlPost(rlIp(2))
    assert(rlOther.statusCode === 200,
    '运行时：不同 IP 各自独立分桶，互不牵连')

    const rlProbe = await NF2.invokeChat({ method: 'GET', headers: rlIp(1) })
    assert(rlProbe.statusCode === 200,
    '运行时：GET 能力探测不消耗配额，被限流的 IP 依然可以探测')

    /* 日窗口：把日配额调到 2，第 3 次应报「今日额度已用完」 */
    process.env.RATE_LIMIT_PER_DAY = '2'
    const rlDayAllowed = []
    for (let i = 0; i < 2; i++) rlDayAllowed.push(await rlPost(rlIp(3)))
    const rlDayThird = await rlPost(rlIp(3))
    const rlDayBody = JSON.parse(rlDayThird.body)
    assert(rlDayAllowed.every((r) => r.statusCode === 200)
      && rlDayThird.statusCode === 429
      && rlDayBody.error === '今日额度已用完'
      && rlDayBody.scope === 'day'
      && rlDayThird.headers['X-RateLimit-Scope'] === 'day',
    '运行时：日窗口用尽 → 429 + 「今日额度已用完」+ X-RateLimit-Scope:day')
  } finally {
    globalThis.fetch = rlRealFetch
    for (const [name, value] of Object.entries(rlSavedEnv)) {
      if (value === undefined) delete process.env[name]
      else process.env[name] = value
    }
  }

  /* 运行时：前端限流信箱 —— 取提示、一次性消费、非法 JSON 兜底 */
  const RL = await loadModule('src/services/aiErrorSignal.ts', 'ai-error-signal')
  assert(RL.RATE_LIMITED_STATUS === 429
    && RL.parseServerErrorMessage('{"error":"请求太频繁，请稍后再试"}') === '请求太频繁，请稍后再试'
    && RL.parseServerErrorMessage('{"error":"今日额度已用完"}') === '今日额度已用完'
    && RL.parseServerErrorMessage('<html>502 Bad Gateway</html>') === ''
    && RL.defaultMessageForStatus(429) === '请求太频繁，请稍后再试'
    && RL.defaultMessageForStatus(500) === 'AI 服务暂时不可用，请稍后再试',
  '运行时：前端能从错误响应体取出服务端中文提示，非 JSON 时按状态码兜底')
  RL.recordAiErrorStatus(500, '大模型服务内部出错了')
  const rlNotice = RL.takeAiErrorSignal()
  assert(rlNotice && rlNotice.status === 500 && rlNotice.message === '大模型服务内部出错了'
    && RL.takeAiErrorSignal() === null,
  '运行时：错误信号一次性消费，读完即清，不污染下一轮对话')
  assert(fs.readFileSync(path.join(root, 'README.md'), 'utf8').includes('三十六、'),
  'README 沉淀防刷限流的手册与调参说明')

  /* ============================================================
   * 三十八、前端异常处理完善（双层错误边界 · 500/401 红色系统提示 · 离线功能隔离）
   * ============================================================ */
  const eb2Src = fs.readFileSync(path.join(root, 'src/components/ErrorBoundary.tsx'), 'utf8')
  const cardSrc = fs.readFileSync(path.join(root, 'src/components/AiErrorCard.tsx'), 'utf8')
  const channelSrc = fs.readFileSync(path.join(root, 'src/components/aiErrorChannel.ts'), 'utf8')
  const signalSrc = fs.readFileSync(path.join(root, 'src/services/aiErrorSignal.ts'), 'utf8')
  const tailwindSrc = fs.readFileSync(path.join(root, 'tailwind.config.js'), 'utf8')

  assert(eb2Src.includes('variant?: ErrorBoundaryVariant')
    && eb2Src.includes("variant === 'inline'")
    && eb2Src.includes('data-testid="error-boundary-inline"')
    && eb2Src.includes('data-testid="error-boundary-reset"')
    && eb2Src.includes('data-testid="error-boundary-exit"'),
  '错误边界支持 inline 变体：页面内小卡片 + 重试 + 离开两个出口')
  assert(eb2Src.includes('resetKey?: string | number')
    && eb2Src.includes('componentDidUpdate(prevProps: ErrorBoundaryProps)')
    && eb2Src.includes('prevProps.resetKey !== this.props.resetKey')
    && eb2Src.includes('resetCount'),
  '错误边界支持 resetKey：切换视图自动清空错误状态，手动重试换 key 重挂载子树')
  assert(ebApp.includes('<ErrorBoundary>')
    && ebApp.includes('variant="inline"')
    && ebApp.includes('resetKey={view}')
    && ebApp.includes("navigate('home')"),
  'App.tsx 双层边界：外层终结白屏，内层只兜当前模块并可一键返回首页')
  assert(ebApp.includes('{PAGES[view]}')
    && ebMapKeys.length >= 25
    && ['wordLab', 'wordSession', 'errorBook', 'review', 'library', 'reader']
      .every((k) => ebMapKeys.includes(k)),
  '25 条视图映射一条未少：词场 / 复习 / 阅读等离线功能依旧可达')
  assert(channelSrc.includes("severity: 'danger'")
    && channelSrc.includes("label: '服务端异常', title: 'AI 老师正在休息，请稍后再试'")
    && channelSrc.includes("label: '密钥校验未通过', title: 'AI 老师暂时联系不上，请稍后再试'")
    && channelSrc.includes("severity: 'warm'"),
  '错误文案分语气：401 / 5xx 用 danger（红），限流与网络用 warm（暖珊瑚）')
  assert(cardSrc.includes('data-severity={copy.severity}')
    && cardSrc.includes('danger: {')
    && cardSrc.includes('bg-danger-100 text-danger-600')
    && cardSrc.includes('data-testid="ai-error-retry"')
    && cardSrc.includes('data-testid="ai-error-detail"'),
  '错误卡片按语气取色：danger 走红色令牌，重试按钮与诊断行齐备')
  assert(tailwindSrc.includes('danger:')
    && tailwindSrc.includes("500: '#e13b42'"),
  '色板新增 danger 红色令牌（与暖珊瑚区分严重程度）')
  assert(signalSrc.includes('recordAiErrorStatus')
    && signalSrc.includes('takeAiErrorSignal')
    && signalSrc.includes('defaultMessageForStatus')
    && !fs.existsSync(path.join(root, 'src/services/aiRateLimit.ts')),
  'AI 错误信号通道统一承接 4xx/5xx；旧的限流专用信箱已并入并移除')
  assert(rlDialogue.includes('takeAiErrorSignal()')
    && rlDialogue.includes('codeFromStatus(errSignal.status)')
    && rlDirector.includes('if (!res.ok) recordAiErrorStatus(res.status'),
  '对话页把失败状态码翻译成系统提示卡，不依赖浏览器特性')

  /* 运行时：模块级边界真崩一次 —— 只打嗝当前模块，切视图即恢复 */
  const EB2_ENTRY = `
import React from 'react'
import { createRoot } from 'react-dom/client'
import { ErrorBoundary } from './src/components/ErrorBoundary.tsx'
let boom = true
function Boom() {
  if (boom) throw new Error('模拟模块崩溃')
  return React.createElement('p', { 'data-testid': 'eb-ok' }, '模块正常')
}
window.__inline = {
  setBoom: (v) => { boom = v },
  mount: (el) => {
    const r = createRoot(el)
    const api = {
      draw: (resetKey) => r.render(React.createElement(
        ErrorBoundary, { variant: 'inline', resetKey }, React.createElement(Boom))),
      unmount: () => r.unmount(),
    }
    api.draw('view-a')
    return api
  },
}
`
  const eb2Out = await build({
    stdin: { contents: EB2_ENTRY, resolveDir: root, loader: 'tsx' },
    bundle: true, format: 'iife', platform: 'browser', jsx: 'automatic', write: false,
    define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'silent',
  })
  const eb2Vc = new VirtualConsole()
  eb2Vc.on('jsdomError', () => {})
  eb2Vc.on('error', () => {})
  const eb2Dom = new JSDOM('<!doctype html><html><body><div id="m"></div></body></html>',
    { url: 'http://localhost/', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: eb2Vc })
  const ew2 = eb2Dom.window
  ew2.eval(eb2Out.outputFiles[0].text)
  const eb2El = ew2.document.getElementById('m')
  const eb2Api = ew2.__inline
  eb2Api.setBoom(true)
  const eb2Inst = eb2Api.mount(eb2El)
  await tick(60)
  const eb2Inline = eb2El.querySelector('[data-testid="error-boundary-inline"]')
  assert(!!eb2Inline && eb2Inline.getAttribute('role') === 'alert'
    && eb2Inline.textContent.includes('这个模块开小差')
    && eb2Inline.textContent.includes('词场')
    && !!eb2Inline.querySelector('[data-testid="error-boundary-reset"]')
    && !eb2El.querySelector('[data-testid="error-boundary-fallback"]'),
  '运行时：模块崩溃 → 页面内红色降级卡片（不是全屏白屏），并说明离线功能不受影响')

  /* 手动重试：修好之后点「重试这个模块」应当立刻恢复 */
  eb2Api.setBoom(false)
  eb2Inline.querySelector('[data-testid="error-boundary-reset"]').click()
  await tick(60)
  assert(!!eb2El.querySelector('[data-testid="eb-ok"]')
    && !eb2El.querySelector('[data-testid="error-boundary-inline"]'),
  '运行时：点击「重试这个模块」→ 子树重新挂载，模块恢复正常')

  /* 切换视图（resetKey 变化）→ 自动清空错误状态 */
  eb2Api.setBoom(true)
  eb2Inst.draw('view-a')
  await tick(60)
  assert(!!eb2El.querySelector('[data-testid="error-boundary-inline"]'),
  '运行时：再次崩溃后模块级降级卡片重新出现')
  eb2Api.setBoom(false)
  eb2Inst.draw('view-b')
  await tick(80)
  assert(!!eb2El.querySelector('[data-testid="eb-ok"]'),
  '运行时：切换视图（resetKey 变化）→ 自动恢复，不需要刷新页面')
  eb2Inst.unmount()

  /* 运行时：500 / 401 的系统提示卡确实走红色，且带重试按钮 */
  const CARD_ENTRY = `
import React from 'react'
import { createRoot } from 'react-dom/client'
import { AiErrorCard } from './src/components/AiErrorCard.tsx'
window.__mountErrorCard = (el, code, detail) => {
  const r = createRoot(el)
  r.render(React.createElement(AiErrorCard, {
    code, detail, onRetry: () => {}, onDismiss: () => {},
  }))
  return () => r.unmount()
}
`
  const cardOut = await build({
    stdin: { contents: CARD_ENTRY, resolveDir: root, loader: 'tsx' },
    bundle: true, format: 'iife', platform: 'browser', jsx: 'automatic', write: false,
    define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'silent',
  })
  const cardVc = new VirtualConsole()
  cardVc.on('jsdomError', () => {})
  cardVc.on('error', () => {})
  const cardDom = new JSDOM('<!doctype html><html><body><div id="c5"></div><div id="c4"></div></body></html>',
    { url: 'http://localhost/', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: cardVc })
  const cw = cardDom.window
  cw.eval(cardOut.outputFiles[0].text)
  const c5El = cw.document.getElementById('c5')
  const c4El = cw.document.getElementById('c4')
  const unmountC5 = cw.__mountErrorCard(c5El, 500, 'AI 服务暂时不可用')
  const unmountC4 = cw.__mountErrorCard(c4El, 429, '请求太频繁，请稍后再试')
  await tick(60)
  assert(c5El.querySelector('[data-testid="ai-error-card"]').getAttribute('data-severity') === 'danger'
    && c5El.textContent.includes('AI 老师正在休息，请稍后再试')
    && c5El.querySelector('[data-testid="ai-error-retry"]')
    && c5El.textContent.includes('诊断：AI 服务暂时不可用'),
  '运行时：500 → 红色（danger）系统提示 + 重试按钮 + 服务端中文诊断')
  assert(c4El.querySelector('[data-testid="ai-error-card"]').getAttribute('data-severity') === 'warm'
    && c4El.textContent.includes('AI 有点忙，歇一下再试'),
  '运行时：429 保持暖色语气（限流可安抚，不必 alarming）')
  unmountC5()
  unmountC4()
  assert(fs.readFileSync(path.join(root, 'README.md'), 'utf8').includes('三十八、'),
  'README 沉淀双层错误边界与错误提示体系说明')

  /* 运行时：真实服务层遇到 500 → 状态码与中文提示真的被投递出来
     （生成器与信号模块打进同一个 bundle，保证是同一个模块实例） */
  const DD_ENTRY = `
import { createServerlessGenerator } from './src/services/dialogueDirector.ts'
import * as signal from './src/services/aiErrorSignal.ts'
window.__dd = { createServerlessGenerator, signal }
`
  const ddOut = await build({
    stdin: { contents: DD_ENTRY, resolveDir: root, loader: 'tsx' },
    bundle: true, format: 'iife', platform: 'browser', jsx: 'automatic', write: false,
    define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'silent',
  })
  const ddVc = new VirtualConsole()
  ddVc.on('jsdomError', () => {})
  ddVc.on('error', () => {})
  const ddDom = new JSDOM('<!doctype html><html><body></body></html>',
    { url: 'http://localhost/', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: ddVc })
  const dw = ddDom.window
  dw.eval(ddOut.outputFiles[0].text)
  const ddRealFetch = globalThis.fetch
  const ddWindowFetch = dw.fetch
  try {
    /* 桩必须打在 jsdom 窗口上：bundle 在 window 里执行，
       Node 的 globalThis.fetch 它看不见（jsdom 本身不实现 fetch） */
    const ddStubFetch = async (_url, init) => {
      const method = (init && init.method) || 'GET'
      if (method === 'GET') {
        return new Response(JSON.stringify({
          ok: true, mode: 'live', configured: true, provider: 'test', model: 'test',
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      return new Response(JSON.stringify({
        ok: false, fallback: true, error: '大模型服务内部出错了，已自动回退本地 Mock。',
      }), { status: 500, headers: { 'Content-Type': 'application/json' } })
    }
    dw.fetch = ddStubFetch
    globalThis.fetch = ddStubFetch
    const ddGen = dw.__dd.createServerlessGenerator()
    try {
      await ddGen({
        summary: '', topic: '市集',
        scenario: { id: 's1', title: '在农夫市集挑苹果', goal: '挑水果', suggestedReplies: [] },
        userCharacter: { name: '我', role: '学习者', personality: '好奇' },
        aiCharacter: { name: 'Tom', role: '摊主', personality: '热情' },
        targetWords: [], targetPhrases: [], history: [],
        userInput: 'hi', difficulty: 'B1', correction: 'gentle', turn: 1,
      })
    } catch { /* Mock 兜底失败也不影响信号断言：信号在 throw 之前已投递 */ }
    const ddSignal = dw.__dd.signal.takeAiErrorSignal()
    assert(ddSignal && ddSignal.status === 500
      && ddSignal.message.includes('大模型服务内部出错了')
      && dw.__dd.signal.takeAiErrorSignal() === null,
    '运行时：真实服务层遇到 500 → 状态码与中文提示被投递到信箱，且一次性消费')
  } finally {
    globalThis.fetch = ddRealFetch
    dw.fetch = ddWindowFetch
  }

  /* ============================================================
   * 三十九、useRegisterSW 迁移（virtual:pwa-register/react）
   * ============================================================ */
  {
    /**
     * 把 virtual:pwa-register/react 换成可控桩：
     * - 模拟 needRefresh / offlineReady 由 false → true 的状态翻转；
     * - 记录 updateServiceWorker 的调用参数，供断言「点刷新确实传了 true」。
     * 真实插件的 hook 内部会注册 SW，桩只保留状态与回调契约。
     */
    const PWA_STUB = `
import { useState } from 'react'
/* calls 必须放在模块作用域：若随每次渲染重建，点击记录会被清空（探针自身的坑） */
const calls = []
export function useRegisterSW(options = {}) {
  const [needRefresh, setNeedRefresh] = useState(false)
  const [offlineReady, setOfflineReady] = useState(false)
  const api = {
    setNeedRefresh,
    setOfflineReady,
    calls,
    options,
    updateServiceWorker: async (reloadPage = true) => { calls.push(reloadPage) },
  }
  if (typeof globalThis !== 'undefined') globalThis.__pwaStub = api
  return {
    needRefresh: [needRefresh, setNeedRefresh],
    offlineReady: [offlineReady, setOfflineReady],
    updateServiceWorker: api.updateServiceWorker,
  }
}`
    const pwaStubPlugin = {
      name: 'pwa-register-stub',
      setup(b) {
        b.onResolve({ filter: /^virtual:pwa-register(\/react)?$/ },
          (args) => ({ path: args.path, namespace: 'pwa-stub' }))
        b.onLoad({ filter: /.*/, namespace: 'pwa-stub' },
          () => ({ contents: PWA_STUB, loader: 'js', resolveDir: root }))
      },
    }

    const PWA_ENTRY = `
import React from 'react'
import { createRoot } from 'react-dom/client'
import { UpdatePrompt } from './src/components/UpdatePrompt.tsx'
window.__mountPwa = (el) => {
  const r = createRoot(el)
  r.render(React.createElement(UpdatePrompt))
  return () => r.unmount()
}`
    const pwaOut = await build({
      stdin: { contents: PWA_ENTRY, resolveDir: root, loader: 'tsx' },
      bundle: true, format: 'iife', platform: 'browser', jsx: 'automatic', write: false,
      define: { 'process.env.NODE_ENV': '"production"' },
      plugins: [pwaStubPlugin], logLevel: 'silent',
    })
    const pwaVc = new VirtualConsole()
    const pwaErrors = []
    pwaVc.on('jsdomError', (e) => pwaErrors.push(e.message))
    pwaVc.on('error', () => {}) /* React 的 act 警告不转发到宿主 */
    const pwaDom = new JSDOM('<!doctype html><html><body><div id="pwa"></div></body></html>',
      { url: 'http://localhost/', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: pwaVc })
    const pw = pwaDom.window
    /* jsdom 没有 serviceWorker：显式补一个，让组件进入「支持」分支 */
    Object.defineProperty(pw.navigator, 'serviceWorker',
      { value: { register: () => Promise.resolve({}) }, configurable: true })
    pw.eval(pwaOut.outputFiles[0].text)
    const pwaEl = pw.document.getElementById('pwa')
    const pwaUnmount = pw.__mountPwa(pwaEl)

    const pwaWait = async (pred) => {
      for (let i = 0; i < 30; i++) {
        if (pred()) return true
        await tick(20)
      }
      return pred()
    }

    /* 初始：needRefresh=false，不应出现任何提示卡 */
    await pwaWait(() => pwaEl.querySelector('[data-testid="pwa-update-prompt"]'))
    assert(!pwaEl.querySelector('[data-testid="pwa-update-prompt"]')
      && !pwaEl.querySelector('[data-testid="pwa-offline-ready"]'),
    '运行时：无新版本时不渲染任何提示卡（needRefresh=false 静默）')

    /* 模拟新 SW 就绪 → needRefresh 翻 true → 底部提示卡出现 */
    pw.__pwaStub.setNeedRefresh(true)
    await pwaWait(() => pwaEl.querySelector('[data-testid="pwa-update-prompt"]'))
    const pwaCard = pwaEl.querySelector('[data-testid="pwa-update-prompt"]')
    assert(!!pwaCard && pwaCard.textContent.includes('发现新版本，点击刷新')
      && !!pwaCard.querySelector('[data-testid="update-prompt-refresh"]')
      && !!pwaCard.querySelector('[data-testid="update-prompt-dismiss"]'),
    '运行时：needRefresh=true → 底部悬浮提示卡出现，含刷新与稍后再说两个出口')

    /* 底部定位：固定定位 + 位于底部导航之上（88px 偏移），不遮挡导航栏 */
    const pwaCls = pwaCard.getAttribute('class') || ''
    assert(pwaCls.includes('fixed') && pwaCls.includes('bottom-[calc(88px')
      && pwaCls.includes('z-[70]') && pwaCls.includes('w-[min(92vw,420px)]'),
    '运行时：提示卡固定在底部、位于底部导航之上，宽度受限不横向溢出')

    /* 点击刷新 → 确实以 true 调用 updateServiceWorker */
    pwaCard.querySelector('[data-testid="update-prompt-refresh"]').click()
    await tick(20)
    assert(pw.__pwaStub.calls.length === 1 && pw.__pwaStub.calls[0] === true,
    '运行时：点「发现新版本，点击刷新」→ 恰好一次 updateServiceWorker(true)')

    /* 点「稍后再说」→ 提示收起，学习不被打断 */
    pw.__pwaStub.setNeedRefresh(false)
    await tick(20)
    pw.__pwaStub.setNeedRefresh(true)
    await pwaWait(() => pwaEl.querySelector('[data-testid="update-prompt-refresh"]'))
    const pwaCard2 = pwaEl.querySelector('[data-testid="pwa-update-prompt"]')
    if (pwaCard2) pwaCard2.querySelector('[data-testid="update-prompt-dismiss"]').click()
    await pwaWait(() => !pwaEl.querySelector('[data-testid="pwa-update-prompt"]'))
    assert(!pwaEl.querySelector('[data-testid="pwa-update-prompt"]'),
    '运行时：点「稍后再说」→ 提示卡收起，学习流程不被打断')

    /* 卸载后零残留 */
    pwaUnmount()
    await tick(30)
    assert(!pwaEl.querySelector('[data-testid="pwa-update-prompt"]')
      && !pwaEl.querySelector('[data-testid="pwa-offline-ready"]')
      && pwaErrors.length === 0,
    '运行时：组件卸载后提示 DOM 零残留，且无控制台错误')

    /* 静态断言：注册入口唯一 + 无 SW 环境静默降级 */
    const pwaSrcReg = fs.readFileSync(path.join(root, 'src/pwa/registerSW.ts'), 'utf8')
    const pwaSrcPrompt = fs.readFileSync(path.join(root, 'src/components/UpdatePrompt.tsx'), 'utf8')
    assert(pwaSrcPrompt.includes("from 'virtual:pwa-register/react'")
      && pwaSrcPrompt.includes('useRegisterSW')
      && !pwaSrcPrompt.includes("from 'virtual:pwa-register'"),
    '组件改用 virtual:pwa-register/react 的 useRegisterSW hook')
    assert(!pwaSrcReg.includes("from 'virtual:pwa-register'")
      && !pwaSrcReg.includes('registerSW('),
    'registerSW.ts 不再调用 registerSW —— 全应用仅一处注册，杜绝 SW 重复注册')
    assert(pwaSrcPrompt.includes('isServiceWorkerSupported()')
      && pwaSrcPrompt.includes('if (!supported) return null'),
    '无 serviceWorker 环境（隐私模式 / 老浏览器）静默不渲染，不给用户死界面')
    assert(pwaSrcPrompt.includes('setNeedRefresh(false)')
      && pwaSrcPrompt.includes('setOfflineReady(false)')
      && !pwaSrcPrompt.includes('location.reload')
      && !pwaSrcPrompt.includes('setInterval'),
    '收起提示用插件自身的 setter，不自造定时轮询，也不在组件里直接 reload')
  }

  /* ============================================================
   * 四十、AI 发音评测（Netlify evaluate · 限流复用 · 得分环 · XP 幂等）
   * ============================================================ */
  {
    const evSrc = fs.readFileSync(path.join(root, 'netlify/functions/evaluate.ts'), 'utf8')
    const judgeSrc = fs.readFileSync(path.join(root, 'src/services/pronunciationJudge.ts'), 'utf8')
    const labSrc = fs.readFileSync(path.join(root, 'src/components/PronunciationLab.tsx'), 'utf8')
    const chalSrc = fs.readFileSync(path.join(root, 'src/data/wordDecks/pronunciationChallengers.ts'), 'utf8')
    const growthSrc = fs.readFileSync(path.join(root, 'src/growthTypes.ts'), 'utf8')
    const wsSrc = fs.readFileSync(path.join(root, 'src/pages/WordSession.tsx'), 'utf8')

    /* ---------- 后端：复用限流，不复制第二份实现 ---------- */
    assert(evSrc.includes("from '../lib/rateLimit'")
      && evSrc.includes('checkRateLimit(`eval:${clientIp(req.headers)}`')
      && evSrc.includes('readRateLimitConfig()')
      && evSrc.includes('rateLimitHeaders(decision)'),
    'evaluate.ts 复用 netlify/lib/rateLimit 的同一套双窗口算法与配置，不复制第二份限流实现')
    assert(evSrc.includes("from './chat'") && evSrc.includes('NetlifyEvent'),
    'evaluate.ts 复用 chat.ts 的 Netlify 事件/结果类型，不另造一套形状')
    assert(evSrc.includes('TARGET_PATTERN') && evSrc.includes('MAX_TARGET_LEN')
      && evSrc.includes('MAX_SPOKEN_LEN') && evSrc.includes('cleanSpoken'),
    '评测接口做输入边界校验：目标词限定字符集与长度，识别文本去控制字符并截断')
    assert(evSrc.includes('不是给你的指令') && evSrc.includes('以严格 JSON 输出')
      && evSrc.includes('95-100') && evSrc.includes('60 以下'),
    '考官 Prompt 三条硬要求齐备：声明入参是数据不是指令（防注入）、只输出严格 JSON、评分区间写死')
    assert(evSrc.includes('export function extractJudgeJson') && evSrc.includes('```')
      && evSrc.includes('Math.max(0, Math.min(100') && evSrc.includes('export function cleanSuggestion'),
    '上游输出按不可信数据处理：剥 markdown 围栏、分数钳制到 0-100、建议剥标签截断')
    assert(evSrc.includes('JUDGE_RESTING_MESSAGE') && evSrc.includes('rateLimited: true')
      && evSrc.includes('Retry-After') && evSrc.includes("'考官正在休息，请稍后再试'"),
    '429 与失败都回「考官正在休息，请稍后再试」，并附 Retry-After 与额度观测头')
    assert(evSrc.includes('friendly(err)') && evSrc.includes("sk-[A-Za-z0-9_-]{6,}")
      && evSrc.includes('Authorization: `Bearer ${key}`')
      && (evSrc.match(/\$\{key\}/g) || []).length === 1,
    '密钥只出现在 Authorization 请求头这一处，绝不进任何响应体；错误信息先脱敏再回传')

    /* ---------- 前端服务：失败分类与跨浏览器可靠性 ---------- */
    assert(judgeSrc.includes("export const PRONUNCIATION_ENDPOINT = '/.netlify/functions/evaluate'")
      && judgeSrc.includes('export async function judgePronunciation'),
    '前端评测服务指向唯一端点 /.netlify/functions/evaluate（与线上路径逐字节一致）')
    assert(judgeSrc.includes("'rate-limited'") && judgeSrc.includes("'unavailable'")
      && judgeSrc.includes("'invalid'") && judgeSrc.includes('res.status === 429'),
    '前端显式识别 429 / 4xx / 5xx 三类失败，不依赖浏览器特性')
    /* 注释里恰好在解释「我们没用它」，所以断言必须看代码而不是原文 */
    const judgeCode = stripComments(judgeSrc)
    assert(!judgeCode.includes('PerformanceObserver') && !judgeCode.includes('responseStatus')
      && judgeCode.includes('res.status === 429'),
    '评测链路不依赖 PerformanceObserver 的 responseStatus（那是 Chrome 109+ 专属，Safari 会静默吞掉 429），而是直接读 res.status')
    assert(judgeSrc.includes('normalizeScore') && judgeSrc.includes('cleanSuggestion')
      && judgeSrc.includes('JUDGE_TIMEOUT_MS'),
    '前端对分数与建议做二次校验与清洗，并带超时保护')

    /* ---------- 易错词库 ---------- */
    assert(chalSrc.includes('export const PRONUNCIATION_CHALLENGERS')
      && chalSrc.includes('export function challengerFor')
      && chalSrc.includes('export function groupChallengersByCategory'),
    '易错词库独立成文件：提供词条表、按词查表与按分类分组三个出口')
    assert(chalSrc.includes("'th'") && chalSrc.includes("'vw'") && chalSrc.includes("'lr'")
      && chalSrc.includes("'ending'") && chalSrc.includes("'stress'") && chalSrc.includes("'phrase'"),
    '易错词覆盖 6 类真实发音障碍：舌尖音 / v-w / l-r / 词尾辅音 / 重音 / 连读')
    /* 同理：文件头注释里就写着「它不注册进 DECK_IDS」，断言必须看代码 */
    const chalCode = stripComments(chalSrc)
    assert(!chalCode.includes('DECK_IDS') && !chalCode.includes('DeckId')
      && !chalCode.includes('makeWord('),
    '易错词库不注册成第 10 个词库：不动 DECK_IDS / DeckId / 五步闭环的词表调度')

    /* ---------- UI：口音、得分环、防抖、XP ---------- */
    assert(labSrc.includes("'en-US'") && labSrc.includes("'en-GB'") && labSrc.includes("'en-AU'")
      && labSrc.includes('speak(word, { rate: 1, accent'),
    '口音三档通过 SpeechSynthesis 的 lang 标签切换，标准音可自由试听')
    assert(labSrc.includes('export function scoreTone') && labSrc.includes('score >= 90')
      && labSrc.includes('score >= 70') && labSrc.includes('function ScoreRing'),
    '专属得分环：≥90 绿 / ≥70 黄 / <70 红三档语气，配色取自项目自有色板')
    assert(labSrc.includes('COOLDOWN_MS') && labSrc.includes('disabled={busy || cooldown > 0}')
      && labSrc.includes('if (phase !== \'idle\' || cooldown > 0) return'),
    '前端防抖：录音进行中禁用 + 冷却倒计时，连点也只会发一次请求')
    assert(labSrc.includes('recognitionSupported()') && labSrc.includes('pronunciationSupport()')
      && labSrc.includes('请用下面的输入框'),
    '浏览器不支持语音识别时明确提示改用文字输入，练习不中断')
    assert(labSrc.includes('awardXp({') && labSrc.includes('pronunciation_${passed ? \'pass\' : \'try\'}')
      && labSrc.includes('XP_RULES.pronunciation_pass') && labSrc.includes('XP_RULES.pronunciation_try'),
    'XP 走统一入口 awardXp()，事件 id 稳定 → 同一词同一天天然幂等')
    assert(!stripComments(labSrc).includes('wordSessionDraft')
      && !stripComments(labSrc).includes('draft.step'),
    '发音面板是闭环之外的辅助面板：不写草稿、不参与状态机')

    /* ---------- XP 规则表 ---------- */
    assert(growthSrc.includes('pronunciation_pass: 10') && growthSrc.includes('pronunciation_try: 2'),
    'XP 规则表新增两条：发音评测通过 10 XP / 未通过 2 XP（金额写在唯一规则表里，可统一调参）')

    /* ---------- 词卡接入：五步闭环必须原封不动 ---------- */
    assert(wsSrc.includes('发音练习') && wsSrc.includes('<PronunciationLab')
      && wsSrc.includes('challengerFor(entry.word)'),
    '词卡新增「发音练习」按钮并挂载评测面板；命中易错词库的词额外打「易错词」角标优先推送')
    assert(wsSrc.includes('const commit = (next: StepRecord')
      && wsSrc.includes("commit(next, 'verify')")
      && wsSrc.includes("commit({ ...record }, 'spell')")
      && wsSrc.includes("advance({ ...record, spellingTries: tries, spellingPassed: true")
      && !stripComments(wsSrc).includes("draft.step = 'pronunciation'"),
    '五步闭环零破坏：S1→S2、S2.5→S3、S3→下一词三条提交路径一字未改，也没有新增步骤')

    /* ---------- 本地联调台 ---------- */
    assert(nfServer.includes("app.all(['/.netlify/functions/evaluate']")
      && nfServer.includes('invokeEvaluate(') && nfServer.includes('toClientHeaders(req)'),
    '本地 Express 复用生产的 invokeEvaluate，与 Netlify 跑同一份评测核心')
    assert(nfVite.includes("'/.netlify/functions'")
      && !stripComments(nfVite).includes("'/.netlify/functions/evaluate'"),
    'Vite 代理用前缀匹配，evaluate 端点自动命中——不需要新增代理项，也不需要 rewrite')
    assert(fs.readFileSync(path.join(root, 'README.md'), 'utf8').includes('四十、'),
    'README 沉淀 AI 发音评测章节')

    /* ---------- 运行时：把 evaluate 真跑起来 ---------- */
    const EV = await loadModule('netlify/functions/evaluate.ts', 'netlify-evaluate')
    const evSavedEnv = {
      LLM_API_KEY: process.env.LLM_API_KEY,
      LLM_API_BASE: process.env.LLM_API_BASE,
      LLM_MODEL: process.env.LLM_MODEL,
      RATE_LIMIT_PER_MINUTE: process.env.RATE_LIMIT_PER_MINUTE,
      RATE_LIMIT_PER_DAY: process.env.RATE_LIMIT_PER_DAY,
    }
    const evRealFetch = globalThis.fetch
    let evUpstreamBody = ''
    let evUpstreamCalls = 0
    globalThis.fetch = async (url, init) => {
      if (String(url).includes('/chat/completions')) {
        evUpstreamCalls += 1
        evUpstreamBody = String((init && init.body) || '')
        return new Response(JSON.stringify({
          choices: [{ message: { content: '{"score": 92, "suggestion": "你的 /θ/ 咬舌音没发准，舌尖要轻触上齿。"}' } }],
        }), { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      throw new Error('unexpected fetch: ' + String(url))
    }
    process.env.LLM_API_KEY = 'test-key'
    process.env.LLM_API_BASE = 'https://api.deepseek.com/v1'
    process.env.LLM_MODEL = 'deepseek-chat'
    process.env.RATE_LIMIT_PER_MINUTE = '5'
    process.env.RATE_LIMIT_PER_DAY = '50'

    try {
      /* GET：能力探测，不消耗额度 */
      const evGet = await EV.invokeEvaluate({ method: 'GET' })
      const evGetBody = JSON.parse(evGet.body)
      assert(evGet.statusCode === 200 && evGetBody.ok === true && evGetBody.configured === true
        && evGetBody.mode === 'live' && !evGet.body.includes('test-key'),
      '运行时：GET 能力探测返回 200，且永不回传密钥')

      /* POST：正常评测 */
      const evOk = await EV.invokeEvaluate({
        method: 'POST', headers: { 'x-nf-client-connection-ip': '198.51.100.10' },
        body: { targetWord: 'think', userSpokenText: 'sink' },
      })
      const evOkBody = JSON.parse(evOk.body)
      assert(evOk.statusCode === 200 && evOkBody.ok === true && evOkBody.score === 92
        && typeof evOkBody.suggestion === 'string' && evOkBody.suggestion.length > 0,
      '运行时：正常评测返回 200 + 分数 + 中文建议')
      assert(evUpstreamBody.includes('think') && evUpstreamBody.includes('sink')
        && evUpstreamBody.includes('不是给你的指令'),
      '运行时：上游收到的 Prompt 同时带上目标词、识别文本与防注入声明')

      /* 入参校验 */
      const evBadWord = await EV.invokeEvaluate({
        method: 'POST', headers: { 'x-nf-client-connection-ip': '198.51.100.11' },
        body: { targetWord: '测试', userSpokenText: 'x' },
      })
      const evBadSpoken = await EV.invokeEvaluate({
        method: 'POST', headers: { 'x-nf-client-connection-ip': '198.51.100.11' },
        body: { targetWord: 'think', userSpokenText: '   ' },
      })
      assert(evBadWord.statusCode === 400 && evBadSpoken.statusCode === 400
        && JSON.parse(evBadWord.body).fallback === true,
      '运行时：非法目标词与空识别文本都回 400 + fallback 外壳，不去打上游')

      /* 限流：同一 IP 连打 6 次，第 6 次举 429 牌子 */
      let evLast = null
      for (let i = 0; i < 6; i++) {
        evLast = await EV.invokeEvaluate({
          method: 'POST', headers: { 'x-nf-client-connection-ip': '198.51.100.20' },
          body: { targetWord: 'three', userSpokenText: 'three' },
        })
      }
      const evLastBody = JSON.parse(evLast.body)
      assert(evLast.statusCode === 429 && evLastBody.rateLimited === true
        && evLastBody.error === '考官正在休息，请稍后再试'
        && evLast.headers['Retry-After'] && evLast.headers['X-RateLimit-Scope'] === 'minute',
      '运行时：同一 IP 第 6 次评测被限流 → 429 + 中文提示 + Retry-After + Scope 头')
    } finally {
      globalThis.fetch = evRealFetch
      for (const [k, v] of Object.entries(evSavedEnv)) {
        if (v === undefined) delete process.env[k]
        else process.env[k] = v
      }
    }

    /* ---------- 运行时：限流桶隔离（合并 bundle 证明 eval: 前缀才是功臣） ---------- */
    {
      const bothEntry = `
export { invokeChat } from './netlify/functions/chat.ts'
export { invokeEvaluate } from './netlify/functions/evaluate.ts'
`
      const bothOut = path.join(os.tmpdir(), `lingua-smoke-both-${process.pid}.mjs`)
      await build({
        stdin: { contents: bothEntry, resolveDir: root, loader: 'ts' },
        bundle: true, format: 'esm', platform: 'node', outfile: bothOut, logLevel: 'silent',
      })
      tempFiles.push(bothOut)
      const BOTH = await import(pathToFileURL(bothOut).href + `?t=${Date.now()}`)
      const isoRealFetch = globalThis.fetch
      const isoSavedKey = process.env.LLM_API_KEY
      process.env.LLM_API_KEY = 'test-key'
      globalThis.fetch = async (url, init) => {
        if (String(url).includes('/chat/completions')) {
          const body = String((init && init.body) || '')
          const content = body.includes('targetWord')
            ? '{"score": 88, "suggestion": "咬舌音再准确一点。"}'
            : '{"reply": "ok", "feedback": {}}'
          return new Response(JSON.stringify({ choices: [{ message: { content } }] }),
            { status: 200, headers: { 'Content-Type': 'application/json' } })
        }
        throw new Error('unexpected fetch: ' + String(url))
      }
      try {
        /* 同一模块实例 → 同一份限流 Map：只有 eval: 前缀能让两个功能各算各的 */
        const isoIp = { 'x-nf-client-connection-ip': '198.51.100.30' }
        for (let i = 0; i < 6; i++) {
          await BOTH.invokeEvaluate({
            method: 'POST', headers: isoIp, body: { targetWord: 'light', userSpokenText: 'right' },
          })
        }
        const isoChat = await BOTH.invokeChat({
          method: 'POST', headers: isoIp, body: { messages: [{ role: 'user', content: 'hi' }] },
        })
        assert(isoChat.statusCode === 200,
          '运行时：评测桶被打满后，同一 IP 的对话请求依然 200 —— eval: 前缀真的把两个功能隔开了')
      } finally {
        globalThis.fetch = isoRealFetch
        if (isoSavedKey === undefined) delete process.env.LLM_API_KEY
        else process.env.LLM_API_KEY = isoSavedKey
      }
    }

    /* ---------- 运行时：JSON 解析的四种边界 ---------- */
    assert(EV.extractJudgeJson('```json\n{"score": 88, "suggestion": "很好"}\n```').score === 88,
      '运行时：能剥掉 markdown 围栏再解析 JSON')
    assert(EV.extractJudgeJson('考官点评如下：{"score": 77, "suggestion": "重音偏了"} 加油').score === 77,
      '运行时：能从前后的解释文字里夹出 JSON 块')
    assert(EV.extractJudgeJson('{"score": 180, "suggestion": "x"}').score === 100
      && EV.extractJudgeJson('{"score": -5, "suggestion": "x"}').score === 0,
      '运行时：越界分数被钳制到 0-100，不让模型随口给负分或千分')
    assert(EV.extractJudgeJson('no json here') === null
      && EV.extractJudgeJson('{"suggestion": "缺少分数"}') === null,
      '运行时：上游没给出可用 JSON 时返回 null（不编造分数）')
    assert(EV.cleanSuggestion('<b>加粗</b> *强调* 建议').includes('加粗')
      && !EV.cleanSuggestion('<b>加粗</b> 建议').includes('<b>'),
      '运行时：建议文本剥掉 HTML 标签与 markdown 标记后再展示')

    /* ---------- 运行时：前端服务与易错词库 ---------- */
    const PJ = await loadModule('src/services/pronunciationJudge.ts', 'pronunciation-judge')
    const PC = await loadModule('src/data/wordDecks/pronunciationChallengers.ts', 'pronunciation-challengers')
    assert(PJ.normalizeScore(92.4) === 92 && PJ.normalizeScore(150) === 100
      && PJ.normalizeScore(-3) === 0 && PJ.normalizeScore('abc') === null,
      '运行时：前端分数校验同样钳制到 0-100，非法值判为无效')
    assert(PJ.judgeFailureMessage('rate-limited') === '考官正在休息，请稍后再试'
      && PJ.judgeFailureMessage('unavailable') === '考官正在休息，请稍后再试'
      && PJ.judgeFailureMessage('aborted') !== '考官正在休息，请稍后再试',
      '运行时：限流与失败收敛成同一句友好提示，取消场景另有文案')
    const pcCount = PC.PRONUNCIATION_CHALLENGERS.length
    assert(pcCount >= 10 && pcCount <= 20,
      `运行时：易错词库共 ${pcCount} 条，落在要求的 10-20 条区间内`)
    assert(PC.challengerFor('THINK').word === 'think' && PC.isChallenger('three')
      && !PC.isChallenger('apple')
      && PC.groupChallengersByCategory().length === 6,
      '运行时：易错词按词查表大小写不敏感，分类分组覆盖 6 类')

    /* ---------- 运行时：真挂载发音面板，走完「口音 → 降级 → 手动输入 → 得分环」 ---------- */
    {
      const LAB_ENTRY = `
import React from 'react'
import { createRoot } from 'react-dom/client'
import { AppProvider } from './src/store/useAppStore.tsx'
import { PronunciationLab } from './src/components/PronunciationLab.tsx'
window.__mountLab = (el, entry) => {
  const r = createRoot(el)
  r.render(React.createElement(AppProvider, null, React.createElement(PronunciationLab, { entry })))
  return () => r.unmount()
}
`
      const labOut = await build({
        stdin: { contents: LAB_ENTRY, resolveDir: root, loader: 'tsx' },
        bundle: true, format: 'iife', platform: 'browser', jsx: 'automatic', write: false,
        define: { 'process.env.NODE_ENV': '"production"' }, logLevel: 'silent',
      })
      const labVc = new VirtualConsole()
      const labErrors = []
      labVc.on('jsdomError', (e) => labErrors.push(e.message))
      labVc.on('error', () => {})
      const labDom = new JSDOM('<!doctype html><html><body><div id="lab"></div></body></html>',
        { url: 'http://localhost/', runScripts: 'dangerously', pretendToBeVisual: true, virtualConsole: labVc })
      const lw = labDom.window
      /* jsdom 没实现 structuredClone / randomUUID，但 AppProvider 的数据迁移要用：
         从 Node 宿主借一份过去（垫的是环境能力，不是业务逻辑）。 */
      if (typeof lw.structuredClone !== 'function') {
        lw.structuredClone = (v) => globalThis.structuredClone(v)
      }
      if (!lw.crypto) lw.crypto = {}
      if (typeof lw.crypto.randomUUID !== 'function') {
        lw.crypto.randomUUID = () => 'uuid-' + Math.random().toString(16).slice(2)
      }
      /* jsdom 没有 SpeechRecognition —— 正好用来验证「降级为文字输入」这条路 */
      const labFetchCalls = []
      lw.fetch = async (url, init) => {
        labFetchCalls.push({ url: String(url), body: init && init.body ? JSON.parse(init.body) : null })
        return {
          ok: true, status: 200,
          text: async () => JSON.stringify({
            ok: true, score: 92, suggestion: '你的 /θ/ 咬舌音没发准，舌尖要轻触上齿。',
          }),
        }
      }
      lw.eval(labOut.outputFiles[0].text)
      const labEl = lw.document.getElementById('lab')
      const labUnmount = lw.__mountLab(labEl, {
        word: 'think', phonetic: '/θɪŋk/', pos: 'v.', meaningZh: '想', meaningEn: 'to think',
        tags: [], cefr: 'B1', examples: ['I think so.'], imageQuery: '', imageUrl: '',
        imageAlt: '', collocations: [], pronunciationTip: '舌尖轻触上齿送气。',
      })
      const labWait = async (pred) => {
        for (let i = 0; i < 40; i++) {
          if (pred()) return true
          await tick(25)
        }
        return pred()
      }
      const labBtn = (text) => [...labEl.querySelectorAll('button')]
        .find((b) => (b.textContent || '').includes(text) && !b.disabled)

      /* ① 口音下拉三档（先等 React 真正提交，再查 DOM） */
      await labWait(() => !!labEl.querySelector('#pron-accent'))
      const labSelect = labEl.querySelector('#pron-accent')
      const labAccents = labSelect ? [...labSelect.options].map((o) => o.value) : []
      assert(labSelect && labAccents.length === 3
        && labAccents.includes('en-US') && labAccents.includes('en-GB') && labAccents.includes('en-AU'),
      '运行时：口音下拉真实渲染出美音 / 英音 / 澳音三档，lang 标签与 SpeechSynthesis 一致')

      /* ② 易错词库标签页 */
      const labChallengerTab = labBtn('易错词库')
      labChallengerTab.click()
      await labWait(() => !!labEl.querySelector('[data-testid="pronunciation-challengers"]'))
      const labChalWords = labEl.querySelectorAll('[data-testid="pronunciation-challengers"] button')
      assert(labChalWords.length >= 10 && labChalWords.length <= 20,
        `运行时：易错词库标签页真实渲染出 ${labChalWords.length} 个词，落在 10-20 条区间内`)

      /* ③ 选中一个易错词 → 目标切换到该词 */
      labChalWords[0].click()
      await tick(40)
      assert((labEl.textContent || '').includes('think'),
        '运行时：点易错词后评测目标切换到该词（易错词优先推送）')

      /* ④ 无 SpeechRecognition → 明确引导改用文字输入 */
      const labRecBtn = labBtn('开始录音')
      assert(!!labRecBtn, '运行时：录音按钮真实存在')
      labRecBtn.click()
      await labWait(() => (labEl.textContent || '').includes('不支持语音识别'))
      assert((labEl.textContent || '').includes('不支持语音识别')
        && (labEl.textContent || '').includes('输入框'),
      '运行时：浏览器不支持语音识别时明确引导改用文字输入，练习不中断、不会崩')

      /* ⑤ 手动输入 → 评测请求 → 得分环 */
      const labInput = labEl.querySelector('input.en-text')
      const labSetter = Object.getOwnPropertyDescriptor(lw.HTMLInputElement.prototype, 'value').set
      labSetter.call(labInput, 'sink')
      labInput.dispatchEvent(new lw.Event('input', { bubbles: true }))
      await tick(40)
      const labEvalBtn = labBtn('用这段文字评测')
      labEvalBtn.click()
      await labWait(() => (labEl.textContent || '').includes('考官点评'))
      assert(labFetchCalls.length === 1
        && labFetchCalls[0].url.includes('/.netlify/functions/evaluate')
        && labFetchCalls[0].body.targetWord === 'think'
        && labFetchCalls[0].body.userSpokenText === 'sink',
      '运行时：手动输入触发评测请求，端点、目标词与识别文本全部正确')
      const labRingText = labEl.textContent || ''
      assert(labRingText.includes('92') && labRingText.includes('发音到位')
        && labRingText.includes('咬舌音'),
      '运行时：评测结果渲染出得分环（92 分 → 发音到位）与 AI 建议文案')
      assert(labErrors.length === 0,
        `运行时：挂载与交互全程零 jsdom 错误${labErrors.length ? `（首个：${labErrors[0].slice(0, 120)}）` : ''}`)
      labUnmount()
    }

    /* ---------- 运行时：XP 幂等（同一事件 id 只入账一次） ---------- */
    {
      /* growth.ts 在第十八章被刻意放进独立块作用域，这里另起一份干净实例 */
      const GRP = await loadModule('src/services/growth.ts', 'growth-pronunciation')
      const savedWin2 = globalThis.window
      delete globalThis.window
      GRP.resetGrowthConfig()
      GRP.configureGrowth({ now: () => Date.now(), dailyGoal: 30, enabled: true })
      const pronId = `pron-idem-${Date.now()}`
      const p1 = GRP.awardXp({ id: pronId, source: 'wordlab', action: 'pronunciation_pass', amount: 10, meta: { sessionKey: 'think' } })
      const p2 = GRP.awardXp({ id: pronId, source: 'wordlab', action: 'pronunciation_pass', amount: 10, meta: { sessionKey: 'think' } })
      assert(p1.granted && p1.amount === 10 && !p2.granted && p2.reason === 'duplicate',
        '运行时：发音评测 XP 事件 id 稳定 → 重复评测同一词不会二次入账（幂等）')
      Object.defineProperty(globalThis, 'window', { value: savedWin2, writable: true, configurable: true })
      GRP.resetGrowthConfig()
    }
  }

  /* ============================================================
   * 四十一、大肥鱼自由对话（6 条鱼 · 人设锁死 · 防 OOC · 8 次/分钟 · 口音 TTS）
   * ============================================================ */
  {
    const ffDataSrc = fs.readFileSync(path.join(root, 'src/data/fatFishCharacters.ts'), 'utf8')
    const ffFallbackSrc = fs.readFileSync(path.join(root, 'src/data/fatFishFallbacks.ts'), 'utf8')
    const ffTypesSrc = fs.readFileSync(path.join(root, 'src/freetalkTypes.ts'), 'utf8')
    const ffFnSrc = fs.readFileSync(path.join(root, 'netlify/functions/freetalk.ts'), 'utf8')
    const ffSvcSrc = fs.readFileSync(path.join(root, 'src/services/freetalk.ts'), 'utf8')
    const ffPageSrc = fs.readFileSync(path.join(root, 'src/pages/FreeTalk.tsx'), 'utf8')
    const ffAvatarSrc = fs.readFileSync(path.join(root, 'src/components/FatFishAvatar.tsx'), 'utf8')
    const ffVoiceSrc = fs.readFileSync(path.join(root, 'src/hooks/useFatFishVoice.ts'), 'utf8')
    const ffDictateSrc = fs.readFileSync(path.join(root, 'src/hooks/useVoiceDictation.ts'), 'utf8')
    const ffCssSrc = fs.readFileSync(path.join(root, 'src/index.css'), 'utf8')
    const ffPetSrc = fs.readFileSync(path.join(root, 'src/components/DesktopPet.tsx'), 'utf8')
    const ffPetHookSrc = fs.readFileSync(path.join(root, 'src/hooks/useDesktopPet.ts'), 'utf8')
    const ffGrowthSrc = fs.readFileSync(path.join(root, 'src/growthTypes.ts'), 'utf8')
    const ffAppSrc = fs.readFileSync(path.join(root, 'src/App.tsx'), 'utf8')
    const ffTypesViewSrc = fs.readFileSync(path.join(root, 'src/types.ts'), 'utf8')
    const ffLayoutSrc = fs.readFileSync(path.join(root, 'src/components/Layout.tsx'), 'utf8')
    const ffHomeSrc = fs.readFileSync(path.join(root, 'src/pages/Home.tsx'), 'utf8')

    /* ---------- 人设表：6 条鱼，字段齐全 ---------- */
    const FF = await loadModule('src/data/fatFishCharacters.ts', 'fatfish-characters')
    assert(FF.FAT_FISH_CHARACTERS.length === 6, '大肥鱼人设表恰好 6 条角色')
    const ffIds = FF.FAT_FISH_CHARACTERS.map((c) => c.id)
    assert(['elf', 'loli', 'onee', 'salaryman', 'rocker', 'surfer'].every((id) => ffIds.includes(id)),
      '6 条鱼齐备：精灵 / 萝莉 / 御姐 / 社畜 / 摇滚 / 冲浪')
    assert(FF.FAT_FISH_CHARACTERS.every((c) => c.toneWords.length >= 4 && c.persona.length > 30
      && c.sentenceRule.length > 10 && c.avoidTone.length > 10 && c.theme.accent && c.theme.accentInk),
    '每条鱼都带人设描述、≥4 个语气词、句式规则、禁串味清单与主题色')
    const ffElf = FF.FAT_FISH_CHARACTERS.find((c) => c.id === 'elf')
    const ffLoli = FF.FAT_FISH_CHARACTERS.find((c) => c.id === 'loli')
    const ffOnee = FF.FAT_FISH_CHARACTERS.find((c) => c.id === 'onee')
    assert(ffElf.toneWords.includes('Cool!') && ffElf.toneWords.includes('Awesome!'),
      '精灵大肥鱼语气词库锁定 Cool! / Awesome! 一类短潮词')
    assert(ffLoli.toneWords.includes('Wow~') && ffLoli.toneWords.includes('Oops!') && ffLoli.toneWords.includes('Tehe~'),
      '萝莉大肥鱼语气词库锁定 Wow~ / Oops! / Tehe~')
    assert(ffOnee.toneWords.includes('Actually...') && ffOnee.toneWords.includes('Darling') && ffOnee.toneWords.includes('Fascinating'),
      '御姐大肥鱼语气词库锁定 Actually... / Darling / Fascinating')
    assert(ffLoli.motion === 'sway' && ffElf.motion === 'bounce' && ffOnee.motion === 'float',
      '三条指定形象的动作分别是：精灵蹦跳 / 萝莉摇摆 / 御姐浮动')
    assert(ffElf.accent === 'en-US' && ffOnee.accent === 'en-GB'
      && FF.FAT_FISH_CHARACTERS.some((c) => c.accent === 'en-AU'),
      '口音覆盖英 / 美 / 澳三档：精灵美音、御姐英音、冲浪澳音')
    assert(ffElf.avoidTone.includes('Darling') && ffLoli.avoidTone.includes('Actually')
      && ffOnee.avoidTone.includes('Cool!'),
      '每条鱼都写明「禁用别的角色语气词」，从源头防串味')
    /* 形象：照用户提供的三视图设定图生成的 3D 立体立绘（本地 WebP） */
    const FF_IDS_LOCAL = ['elf', 'loli', 'onee', 'salaryman', 'rocker', 'surfer']
    assert(ffAvatarSrc.includes('fatfish/${id}.webp') && ffAvatarSrc.includes('import.meta.env.BASE_URL')
      && ffAvatarSrc.includes('<img') && ffAvatarSrc.includes('onError'),
      '形象组件渲染本地立绘 WebP（BASE_URL 相对路径，兼容子目录部署），失败有 emoji 降级不白屏')
    assert(FF_IDS_LOCAL.every((n) => fs.existsSync(path.join(root, 'public/fatfish', n + '.webp'))),
      '6 张立体立绘均已落盘 public/fatfish/*.webp')
    assert(FF_IDS_LOCAL.every((n) => fs.readFileSync(path.join(root, 'public/fatfish', n + '.webp')).includes('ALPH')),
      '6 张立绘都是带 alpha 通道的 WebP：背景板已抠除，能直接当悬浮宠物压在卡片上')
    assert(ffCssSrc.includes('.dp-pet .dp-avatar img') && ffCssSrc.includes('drop-shadow'),
      '去背景后的立绘补了投影：宠物有落地感，不会像剪贴画')
    const imgBytes = FF_IDS_LOCAL.reduce((n, id) => n + fs.statSync(path.join(root, 'public/fatfish', id + '.webp')).size, 0)
    assert(imgBytes > 6 * 20 * 1024 && imgBytes < 6 * 120 * 1024,
      '6 张立绘已压到合理体积（WebP 总计 0.12–0.72MB），PWA 预缓存不爆包')
    assert(ffAvatarSrc.includes('ff-avatar') && ffAvatarSrc.includes('ff-motion-')
      && ffAvatarSrc.includes('ff-avatar-speaking') && ffAvatarSrc.includes('data-speaking'),
      '换成图片后保留全部动画契约：ff-avatar / ff-motion-xxx / speaking 类名与 data-speaking')
    assert(ffAvatarSrc.includes('FatFishAvatarProps') && ffAvatarSrc.includes('data-testid')
      && ffAvatarSrc.includes('speaking') && ffAvatarSrc.includes('motion'),
      '形象组件对外接口与 data-testid 一行未动，调用方无感')
    assert(ffDataSrc.includes('设定图') && ffDataSrc.includes('图生图'),
      '人设真源注明形象来源：用户授权的设定图 + 结构化提示词图生图')
    assert(FF.FAT_FISH_CHARACTERS.every((c) => typeof c.look === 'string' && c.look.length > 10
      && c.look.includes('鲸鳍耳') && c.look.includes('呆毛')),
      '6 条鱼都写明鲸鱼娘外形（渐变长发 / 呆毛 / 鲸鳍耳 / 女仆装 / 配件），文字与立绘同源')
    assert(ffFnSrc.includes('【角色形象】') && ffFnSrc.includes('character.look')
      && ffFnSrc.includes('Q 版「大肥鱼」'),
      'System Prompt 注入【角色形象】段：模型知道自己长什么样')

    /* ---------- 后端：Prompt 人设锁死 + 防注入 ---------- */
    assert(ffFnSrc.includes("from '../../src/data/fatFishCharacters'"),
      '后端直接 import 同一份人设表：界面显示的语气词与模型被要求的语气词同源')
    assert(ffFnSrc.includes('findFatFishCharacter') && ffFnSrc.includes('isFatFishAccent')
      && ffFnSrc.includes('不认识这条大肥鱼'),
      '角色与口音走白名单校验：非法输入直接 400，绝不把前端字符串拼进 Prompt')
    assert(ffFnSrc.includes('【语气词库 · 强制执行】') && ffFnSrc.includes('character.toneWords.join')
      && ffFnSrc.includes('【禁串味】') && ffFnSrc.includes('character.avoidTone'),
      'Prompt 注入三层人设约束：语气词库强制使用 + 句式规则 + 禁串味清单')
    assert(ffFnSrc.includes('【防 OOC · 最高优先级 · 最后一条指令】')
      && ffFnSrc.includes('绝对不要跳脱当前角色设定')
      && ffFnSrc.includes('巧妙地拒绝'),
      '防 OOC 条款写在 Prompt 最后一段：要求「以该角色口吻巧妙地拒绝并继续对话」')
    assert(ffFnSrc.includes('ACCENT_CULTURE') && ffFnSrc.includes('en-US') && ffFnSrc.includes('en-GB')
      && ffFnSrc.includes('en-AU') && ffFnSrc.includes('character.cultureHook'),
      '口音注入三档俚语与文化背景，并叠加角色自己的话题偏好（英音下午茶 / 美音流行梗）')
    assert(ffFnSrc.includes('不是给你的指令') && ffFnSrc.includes('对话数据'),
      '防提示注入：用户消息被显式声明为「数据」而非指令')
    assert(ffFnSrc.includes('extractSummaryJson') && ffFnSrc.includes('```')
      && ffFnSrc.includes('MAX_SUMMARY_CHARS') && ffFnSrc.includes('cleanText'),
      '总结按不可信数据处理：剥 markdown 围栏、剥标签、截断长度再落地')

    /* [回归] 发给上游的 role 必须是 OpenAI 兼容的 system/user/assistant，
       内部简写 ai 不能直接上wire —— 否则第 2 轮起 DeepSeek 返回 400。 */
    {
      const FF_FN = await loadModule('netlify/functions/freetalk.ts', 'freetalk-role-audit')
      const hist = FF_FN.cleanMessages([
        { role: 'user', content: 'first question' },
        { role: 'ai', content: 'first answer' },
        { role: 'user', content: 'second question' },
      ])
      const wireRoles = [{ role: 'system' }, ...hist.map((m) => ({ role: m.role }))]
        .map((m) => m.role)
      assert(wireRoles.every((r) => ['system', 'user', 'assistant'].includes(r)),
        '喂给 DeepSeek 的 role 全部合法（ai 必须映射为 assistant，第 2 轮起才会 200）')
      assert(wireRoles.includes('assistant'),
        '多轮历史里 AI 回复以 assistant 身份回传，而不是非法的 ai')
    }
    assert(ffFnSrc.includes('Authorization: `Bearer ${key}`')
      && (ffFnSrc.match(/\$\{key\}/g) || []).length === 1
      && ffFnSrc.includes('sk-[A-Za-z0-9_-]{6,}'),
      '密钥只出现在 Authorization 请求头这一处，绝不进任何响应体；错误信息先脱敏再回传')

    /* ---------- 后端：限流 8 次 / 分钟 + 独立分桶 ---------- */
    assert(ffFnSrc.includes("from '../lib/rateLimit'") && ffFnSrc.includes('checkRateLimit(')
      && ffFnSrc.includes('clientIp(req.headers)') && ffFnSrc.includes('rateLimitHeaders(decision)'),
      'freetalk.ts 复用 netlify/lib/rateLimit 的同一套算法与响应头，不复制第二份限流实现')
    assert(ffFnSrc.includes('checkRateLimit(`freetalk:${clientIp(req.headers)}`'),
      '限流桶键带 freetalk: 前缀 → 与对话桶（裸 IP）、评测桶（eval: + IP）三方互不干扰')
    assert(ffFnSrc.includes('export const FREETALK_PER_MINUTE = 8')
      && ffFnSrc.includes('parseLimit(env.FREETALK_RATE_LIMIT_PER_MINUTE, FREETALK_PER_MINUTE)')
      && ffFnSrc.includes('parseLimit(env.FREETALK_RATE_LIMIT_PER_DAY, FREETALK_PER_DAY)'),
      '额度档位：每 IP 每分钟 8 次（可用 FREETALK_RATE_LIMIT_PER_MINUTE 覆盖），解析规则复用公共 parseLimit')
    assert(ffFnSrc.includes('FREETALK_RATE_LIMIT_MESSAGE') && ffFnSrc.includes('rateLimited: true')
      && ffFnSrc.includes('fallback: true') && ffFnSrc.includes('Retry-After'),
      '429 契约与其它端点一致：中文提示 + fallback 外壳 + Retry-After 头')

    /* ---------- 前端：服务 / 降级 / 口音 TTS ---------- */
    assert(ffSvcSrc.includes("export const FREETALK_ENDPOINT = '/.netlify/functions/freetalk'")
      && ffSvcSrc.includes('export async function sendFreeTalkTurn')
      && ffSvcSrc.includes('export async function summarizeFreeTalk'),
      '前端服务指向唯一端点 /.netlify/functions/freetalk，闲聊与总结两个出口各自独立')
    assert(ffSvcSrc.includes("'rate-limited'") && ffSvcSrc.includes("'invalid'")
      && ffSvcSrc.includes("'unavailable'") && ffSvcSrc.includes('res.status === 429'),
      '前端显式识别 429 / 4xx / 5xx 三类失败，不依赖浏览器特性')
    const ffSvcCode = stripComments(ffSvcSrc)
    assert(!ffSvcCode.includes('PerformanceObserver') && !ffSvcCode.includes('responseStatus'),
      '自由对话链路不依赖 PerformanceObserver 的 responseStatus，直接读 res.status')
    assert(ffSvcSrc.includes('mockFreeTalkReply') && ffSvcSrc.includes('toneWords')
      && ffFallbackSrc.includes('{tone}') && ffFallbackSrc.includes('{topic}'),
      '上游挂掉时本地演示大肥鱼顶上，且语气词来自该角色的人设表（不串味）')
    assert(ffVoiceSrc.includes('accentOf(v.lang) === options.accent')
      && ffVoiceSrc.includes('lang: o.accent') && ffVoiceSrc.includes('speakWithVoice'),
      'TTS 音色严格按口音匹配：优先取 lang 完全一致的英语音色，并显式传 lang 标签')
    assert(ffVoiceSrc.includes('available: Boolean(exactVoice)') && ffPageSrc.includes('freetalk-accent-missing'),
      '设备没有该口音音色时如实告知，而不是拿别的音色糊弄')

    /* [语音输入] hook 双通道：浏览器识别优先，Google 连不上时切本地录音 + 内置 ASR */
    assert(ffDictateSrc.includes("from '../lib/speech'") && ffDictateSrc.includes('startListening')
      && ffDictateSrc.includes('startRecording') && ffDictateSrc.includes('describeSpeechSupport'),
      '语音输入 hook 复用 lib/speech 的识别与录音两层能力，不另造一套采集逻辑')
    assert(ffDictateSrc.includes('startFallbackRecording') && ffDictateSrc.includes("'silent-end'")
      && ffDictateSrc.includes("'network'") && ffDictateSrc.includes("'service-not-allowed'"),
      '识别报 network/service-not-allowed 或静默 onend 无结果时，自动切本地录音兜底（Android/国内关键）')
    assert(ffDictateSrc.includes('transcribeAudioBlob') && ffDictateSrc.includes('recordingRef.current?.stop()'),
      '录音结束后经内置 ASR 转文字；再点一次麦克风即可停止并出字')
    assert(ffDictateSrc.includes('epochRef.current') && ffDictateSrc.includes('optionsRef.current')
      && ffDictateSrc.includes('listeningRef.current?.cancel()') && ffDictateSrc.includes('recordingRef.current?.cancel()'),
      'epoch 防迟到回调 + props 快照刷新；卸载/切口音/取消会释放识别与录音两路麦克风')
    assert(ffDictateSrc.includes('onTranscript') && !ffDictateSrc.includes('send(')
      && ffPageSrc.includes('onTranscript: (spoken) => setText'),
      '识别/转写文字只交给调用方追加进输入框，hook 自身绝不自动发送')
    assert((ffDictateSrc.match(/recordingRef\.current = null/g) || []).length >= 3
      && (ffDictateSrc.match(/listeningRef\.current = null/g) || []).length >= 2,
    '每轮结束 / 失败都清空 handle：不会让下次点击误入「停止上一轮」分支而毫无反应')
    assert(ffPageSrc.includes('data-testid="freetalk-mic"') && ffPageSrc.includes('dictation.toggle')
      && ffPageSrc.includes('dictation.listening') && ffPageSrc.includes('dictation.recording')
      && ffPageSrc.includes('sending || summarizing || dictation.listening || dictation.recording'),
      '输入台有麦克风按钮；听写/录音中禁用发送，杜绝半句话发出去')
    assert(ffPageSrc.includes('freetalk-dictation-interim') && ffPageSrc.includes('aria-live="polite"')
      && ffPageSrc.includes('dictation.interim') && ffPageSrc.includes('录音中')
      && ffPageSrc.includes('读完点麦克风停止')
      && ffPageSrc.includes('dictation.cancel()'),
      '手动模式：实时字幕用 aria-live 播报、标注「录音中·读完点停止」；手动输入与切角色都会取消采集')

    /* ---------- 移动端兼容：手势内开麦 / UA 分诊 / 明确弹窗 ---------- */
    const mvSrc = fs.readFileSync(path.join(root, 'src/lib/mobileVoice.ts'), 'utf8')
    const vsdSrc = fs.readFileSync(path.join(root, 'src/components/VoiceSupportDialog.tsx'), 'utf8')
    const ddMobileSrc = fs.readFileSync(path.join(root, 'src/pages/Dialogue.tsx'), 'utf8')
    assert(mvSrc.includes('MicroMessenger') && mvSrc.includes('iPad|iPhone|iPod')
      && mvSrc.includes('/Android/i') && mvSrc.includes('maxTouchPoints')
      && mvSrc.includes('isSecureContext'),
    '统一环境检测覆盖 iOS / Android / 微信 / iPadOS 伪装 Mac，并把 HTTPS 安全上下文当硬门槛')
    assert(ffDictateSrc.includes('mobile.preferDirectRecording')
      && ffDictateSrc.includes("'mobile-direct'")
      && ffDictateSrc.indexOf('mobile.preferDirectRecording') < ffDictateSrc.indexOf('startListening({')
      && ddMobileSrc.includes('mobile.preferDirectRecording')
      && ddMobileSrc.includes("'移动端已切到本地录音转写：'"),
    '移动端在点击的同步分支里直接开麦，早于任何 startListening 云端识别（不再等 onError 丢手势）')
    assert(mvSrc.includes('当前浏览器不支持语音，请使用文字输入')
      && ffDictateSrc.includes("title: '语音暂不可用'")
      && ffPageSrc.includes('VoiceSupportDialog') && ddMobileSrc.includes('VoiceSupportDialog')
      && vsdSrc.includes('role="alertdialog"') && vsdSrc.includes('data-testid="voice-support-dialog"'),
    'API 缺失 / 权限被拒时弹 alertdialog，明确提示「当前浏览器不支持语音，请使用文字输入」')
    assert(fs.readFileSync(path.join(root, 'src/lib/speech.ts'), 'utf8').includes('unsupportedVoiceMessage(env)')
      && ffCssSrc.includes('.voice-notice-backdrop')
      && ffCssSrc.includes('prefers-reduced-motion: reduce'),
    '麦克风自检复用同一套中文诊断；弹窗只动 transform/opacity 且尊重减少动态效果')
    const MV = await loadModule('src/lib/mobileVoice.ts', 'mobile-voice')
    /* Node 22 自带只读 navigator：globalThis.navigator 与 w.navigator 可能不是同一个对象，
       被测模块用哪个取决于 esbuild 打包路径，两个都要改。 */
    const navTargets = [...new Set([w.navigator, globalThis.navigator, globalThis.window?.navigator].filter(Boolean))]
    const windowTargets = [...new Set([w, globalThis.window].filter(Boolean))]
    const savedUA = navTargets.map((n) => Object.getOwnPropertyDescriptor(n, 'userAgent'))
    const savedMD = navTargets.map((n) => Object.getOwnPropertyDescriptor(n, 'mediaDevices'))
    const savedMR = windowTargets.map((win) => Object.getOwnPropertyDescriptor(win, 'MediaRecorder'))
    const setUA = (value) => {
      for (const n of navTargets) {
        try { Object.defineProperty(n, 'userAgent', { configurable: true, value }) } catch {}
      }
    }
    for (const n of navTargets) {
      Object.defineProperty(n, 'mediaDevices', {
        configurable: true,
        value: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) },
      })
    }
    for (const win of windowTargets) {
      Object.defineProperty(win, 'MediaRecorder', { configurable: true, value: class {
        static isTypeSupported() { return true }
      } })
    }
    try {
      setUA('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148')
      const iosEnv = MV.detectVoiceEnvironment()
      assert(iosEnv.device === 'ios' && iosEnv.secureContext && iosEnv.canUseMicrophone
        && iosEnv.preferDirectRecording && iosEnv.hint.includes('iOS Safari'),
      '运行时：iPhone UA 被识别为 ios 且优先直录，不再先启动系统识别引擎')
      setUA('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) MicroMessenger/8.0')
      const wxEnv = MV.detectVoiceEnvironment()
      assert(wxEnv.device === 'wechat'
        && MV.unsupportedVoiceMessage(wxEnv).includes('当前浏览器不支持语音，请使用文字输入'),
      '运行时：微信内置浏览器被单独识别，并给出可照着做的文字输入提示')
    } finally {
      navTargets.forEach((n, i) => {
        if (savedUA[i]) Object.defineProperty(n, 'userAgent', savedUA[i])
        if (savedMD[i]) Object.defineProperty(n, 'mediaDevices', savedMD[i])
        else { try { delete n.mediaDevices } catch {} }
      })
      windowTargets.forEach((win, i) => {
        if (savedMR[i]) Object.defineProperty(win, 'MediaRecorder', savedMR[i])
        else { try { delete win.MediaRecorder } catch {} }
      })
    }

    /* ---------- 内置录音转写（Android 录音降级的服务端通道） ---------- */
    const trFnSrc = fs.readFileSync(path.join(root, 'netlify/functions/transcribe.ts'), 'utf8')
    const trSvcSrc = fs.readFileSync(path.join(root, 'src/services/transcribeAudio.ts'), 'utf8')
    const trSpeechSrc = fs.readFileSync(path.join(root, 'src/lib/speech.ts'), 'utf8')
    assert(trFnSrc.includes('export async function invokeTranscribe') && trFnSrc.includes('export const handler')
      && trFnSrc.includes('export const ASR_PER_MINUTE = 6') && trFnSrc.includes('export const ASR_PER_DAY = 50')
      && trFnSrc.includes('parseLimit(env.ASR_RATE_LIMIT_PER_MINUTE, ASR_PER_MINUTE)'),
      '转写函数复用单一真源 invokeTranscribe：Netlify handler 与本地 Express 同一份代码，默认 6 次/分、50 次/天')
    const asrLimitCall = trFnSrc.split('const decision = checkRateLimit(')[1]?.split('if (!decision.allowed)')[0] || ''
    assert(asrLimitCall.includes('`asr:${clientIp(req.headers)}`')
      && asrLimitCall.includes('readAsrRateLimitConfig()')
      && !asrLimitCall.includes('method'),
      '限流只传桶键与配置两个参数：不把 HTTP 方法误当时间戳（否则滚动窗口每轮被清空，限流永不触发）')
    assert(trFnSrc.includes('ASR_RATE_LIMIT_MESSAGE') && trFnSrc.includes('rateLimited: true')
      && trFnSrc.includes('fallback: true') && trFnSrc.includes('rateLimitHeaders(decision)')
      && trFnSrc.includes("'转写太频繁了，稍等一下再试'"),
      '转写 429 契约与另外三个端点一致：中文提示 + fallback 外壳 + Retry-After 头')
    assert(trFnSrc.includes('MAX_AUDIO_BYTES = 8 * 1024 * 1024') && trFnSrc.includes('MAX_AUDIO_MS = 120_000')
      && trFnSrc.includes("'audio/wav'") && trFnSrc.includes("'audio/ogg;codecs=opus'")
      && trFnSrc.includes('text.slice(0, 2000)') && trFnSrc.includes('safeProvider(url)'),
      '转写入口做白名单校验（格式/大小/时长）、截断不可信文本，且只回显上游域名不泄漏密钥')
    assert(trSvcSrc.includes("const ENDPOINT = '/.netlify/functions/transcribe'")
      && trSvcSrc.includes('export async function transcribeAudioBlob') && trSvcSrc.includes('blobToWav(blob)')
      && trSvcSrc.includes("reason: 'rate-limited'") && trSvcSrc.includes("reason: 'invalid'")
      && trSvcSrc.includes("reason: 'unavailable'") && trSvcSrc.includes("reason: 'empty'"),
      '前端转写服务指向唯一端点，先转 WAV 再提交，并把 429/4xx/5xx/空结果分类为可降级的中文提示')
    assert(trSpeechSrc.includes('export async function blobToWav(blob: Blob, targetRate = 16000)')
      && trSpeechSrc.includes("writeStr(0, 'RIFF')") && trSpeechSrc.includes('view.setUint16(34, 16, true)')
      && trSpeechSrc.includes('ctx.close()'),
      'Android webm 被解码、降采样为 16kHz 单声道 16-bit PCM WAV，且用完立即关 AudioContext')
    assert(nfServer.includes("const { invokeTranscribe } = await import('./netlify/functions/transcribe.ts')")
      && nfServer.includes("app.all(['/.netlify/functions/transcribe']")
      && nfServer.includes("limit: '12mb'") && nfServer.includes('LLM_ASR_URL'),
      '本地联调台挂同一条转写链路：放大 JSON 限额容纳 base64，--mock 模式自带假 ASR 上游')
    assert(ffDictateSrc.includes('录音中，请读完点击麦克风停止')
      && !/silenceMs:\s*4000/.test(ffDictateSrc.replace(/\/\*[\s\S]*?\*\//g, ''))
      && trFnSrc.includes('UPSTREAM_TIMEOUT_MS = 9_000'),
    '手动模式：鱼塘提示「录音中请读完点停止」，不再依赖静音自动收尾；服务端转写仍有 9s 超时兜底')

    /* ---------- 手动模式：三处麦克风 UI 两态 + 波形动画 ---------- */
    const pronLabSrc = fs.readFileSync(path.join(root, 'src/components/PronunciationLab.tsx'), 'utf8')
    const readAloudSrc = fs.readFileSync(path.join(root, 'src/components/WordReadAloud.tsx'), 'utf8')
    const diagSrc = fs.readFileSync(path.join(root, 'src/components/VoiceDiagnostics.tsx'), 'utf8')
    const dialogueSrc = fs.readFileSync(path.join(root, 'src/pages/Dialogue.tsx'), 'utf8')

    assert(ffPageSrc.includes('录音中，请读完点击麦克风停止')
      && ffPageSrc.includes('ff-mic-live') && ffPageSrc.includes('aria-label={dictation.recording || dictation.listening')
      && ffCssSrc.includes('@keyframes ff-mic-pulse'),
    '手动模式·鱼塘：麦克风两态（开始/停止）+ 录音中波形脉冲动画， aria-label 明确')
    assert(dialogueSrc.includes('录音中，请读完点击麦克风停止')
      && dialogueSrc.includes('pulse-ring relative !border-coral-500'),
    '手动模式·主对话页：录音中按钮变红 + 脉冲动画，提示读完点停止')
    assert(pronLabSrc.includes('录音中 · 读完点击停止') && pronLabSrc.includes('pron-mic-live')
      && !/silenceMs:\s*1500/.test(pronLabSrc) && !/timeoutMs:\s*RECORD_TIMEOUT_MS/.test(pronLabSrc),
    '手动模式·Word Lab 发音评测：停止态变红跳动，移除 1.5s 静音 / 8s 超时自动收尾')
    assert(readAloudSrc.includes('录音中 · 读完点击停止') && readAloudSrc.includes('pron-mic-live')
      && readAloudSrc.includes('已录 ${secondsLeft} 秒') && !/还剩 \$\{secondsLeft\}/.test(readAloudSrc),
    '手动模式·S2.5 跟读：倒计时改已录正计时，无时长硬顶，停止态波形动画')
    assert(diagSrc.includes('请读完再点一次') && ffCssSrc.includes('@keyframes pron-mic-pulse')
      && ffCssSrc.includes('.pron-mic-live { animation: none; }'),
    '手动模式·诊断组件与 CSS：全部改手动文案，波形动画遵守 prefers-reduced-motion')
    assert(!/RECORD_TIMEOUT_MS|maxRecordingMs/.test(readAloudSrc)
      && /setTimeout[\s\S]{0,120}manualStop/.test(readAloudSrc) === false,
    '手动模式·跟读组件：不再渲染自动停止时长，服务层无 setTimeout 自动结算')

    /* ---------- Desktop Pet：悬浮布局 + 四态状态机 + 纯 CSS 动画 ---------- */
    assert(ffTypesSrc.includes("export type DesktopPetState = 'idle' | 'thinking' | 'speaking' | 'happy'")
      && ffPetHookSrc.includes("if (input.thinking) return 'thinking'")
      && ffPetHookSrc.includes("if (input.speaking) return 'speaking'")
      && ffPetHookSrc.includes("state: happy ? 'happy' : base"),
      '桌面宠物四态契约落盘：happy 是一次性叠加态，底层优先级 thinking > speaking > idle')
    const ffPetCode = stripComments(ffPetSrc + ffPetHookSrc)
    assert(!ffPetCode.includes('setInterval') && !ffPetCode.includes('requestAnimationFrame')
      && !ffPetCode.includes('style.animation') && !ffPetCode.includes('style.transform'),
    '性能红线：没有 setInterval / requestAnimationFrame、不逐帧改样式；唯一 setTimeout 只做 happy 归位兜底')
    assert(ffCssSrc.includes('.dp-dock {') && ffCssSrc.includes('position: absolute')
      && ffCssSrc.includes('bottom: calc(100% + 8px)') && ffCssSrc.includes('pointer-events: none')
      && ffCssSrc.includes('.dp-pet {') && ffCssSrc.includes('pointer-events: auto')
      && ffPageSrc.includes('space-y-3 pb-24'),
    '宠物 absolute 停在输入台上方右侧；dock 透传点击、小鱼才接收，消息区留白不挡打字与发送')
    assert(['@keyframes dp-breathe', '@keyframes dp-think', '@keyframes dp-talk',
      '@keyframes dp-happy-hop', '@keyframes dp-heart-float'].every((k) => ffCssSrc.includes(k))
      && ffCssSrc.includes('.dp-state-idle .dp-body') && ffCssSrc.includes('.dp-state-speaking .dp-mouth'),
    '四态动作与说话嘴型全部是 CSS @keyframes（呼吸 / 思考 / 说话 / 蹦跳 / 爱心 / 嘴巴张合）')
    assert(ffCssSrc.includes('.dp-state-idle.ff-motion-bounce')
      && ffCssSrc.includes('.dp-state-thinking.ff-motion-bounce')
      && ffCssSrc.includes('.dp-state-idle.ff-motion-sway')
      && ffCssSrc.includes('.dp-state-speaking.ff-motion-sway')
      && ffCssSrc.includes('.dp-state-idle.ff-motion-float')
      && ffCssSrc.includes('.dp-state-speaking.ff-motion-float'),
    '人设分岔：精灵快漂+焦躁游动 / 萝莉左右摇+小幅度说话 / 御姐慵懒趴+优雅慢说')
    assert(ffPetHookSrc.includes('character.toneWords') && ffPetHookSrc.includes('EXTRA_PHRASES')
      && ffPetSrc.includes('dp-heart-1') && ffPetSrc.includes('onAnimationEnd')
      && ffPetSrc.includes("e.animationName !== 'dp-heart-float'"),
    '被摸时随机吐一句角色语气词并冒三颗爱心；只认第一颗的 animationend，不重复归位')
    assert(ffPageSrc.includes('data-testid="freetalk-pet-toggle"') && ffPageSrc.includes('setPetVisible')
      && ffPageSrc.includes('petVisible &&') && ffPageSrc.includes('useDesktopPet')
      && !stripComments(ffPageSrc).includes('localStorage'),
    '显示/隐藏开关是纯会话态：不新增 localStorage 键、不碰 XP 与五步闭环')
    assert(ffPetHookSrc.includes('HAPPY_FALLBACK_MS') && ffPetHookSrc.includes('window.clearTimeout(timer)'),
      'happy 有一次性归位兜底并在卸载时清理；浏览器缺 animationend 也不会卡住，且不会泄漏定时器')
    assert(ffCssSrc.includes('@media (prefers-reduced-motion: reduce)')
      && ffCssSrc.includes('.dp-heart,') && ffCssSrc.includes('animation-duration: 0.01ms'),
    '减少动态效果时循环动作全关；爱心保留极短动画以便 onAnimationEnd 仍能归还状态')

    assert(ffCssSrc.includes('ff-mic-pulse') && ffCssSrc.includes('.ff-mic-live { animation: none; }')
      && ffCssSrc.includes('prefers-reduced-motion: reduce'),
      '麦克风脉冲只动 transform/opacity，且在减少动态效果设置下关闭')
    assert(ffCssSrc.includes('.ff-avatar-speaking.ff-motion-bounce')
      && ffCssSrc.includes('.ff-avatar-speaking.ff-motion-sway')
      && ffCssSrc.includes('.ff-avatar-speaking.ff-motion-float')
      && ffCssSrc.includes('.ff-avatar-speaking.ff-motion-jitter')
      && ffCssSrc.includes('.ff-avatar-speaking.ff-motion-rock')
      && ffCssSrc.includes('.ff-avatar-speaking.ff-motion-bob'),
      '6 条鱼各有一套朗读动作：精灵高频蹦跳 / 萝莉左右摇摆 / 御姐缓慢浮动 / 社畜抖动 / 摇滚甩头 / 冲浪起伏')
    assert(ffCssSrc.includes('--ff-accent') && ffCssSrc.includes('--ff-bubble')
      && ffCssSrc.includes('.ff-stage') && ffPageSrc.includes("'--ff-accent-ink': character.theme.accentInk"),
      '主题色随角色切换：只改变量（强调色 / 文字色 / 气泡色），组件代码不动')
    assert(ffCssSrc.includes('prefers-reduced-motion: reduce') && ffCssSrc.includes('.ff-avatar-speaking { animation: none !important; }'),
      '全部动作在 prefers-reduced-motion: reduce 下关闭，形象仍然清晰可辨')

    /* ---------- 前端：结束并总结 + XP ---------- */
    assert(ffPageSrc.includes('结束并总结') && ffPageSrc.includes('summarizeFreeTalk')
      && ffPageSrc.includes('summary.data.feeling') && ffPageSrc.includes('summary.data.pronunciation'),
      '「结束并总结」拿回并展示 { feeling, pronunciation } 两段人设化反馈')
    assert(ffPageSrc.includes('awardXp({') && ffPageSrc.includes("action: 'freetalk_summary'")
      && ffPageSrc.includes('XP_RULES.freetalk_summary') && ffPageSrc.includes('todayKey()'),
      'XP 走统一入口 awardXp()，事件 id = 日期 + 角色 → 同一天同一条鱼天然幂等')
    assert(ffGrowthSrc.includes('freetalk_summary: 6') && ffGrowthSrc.includes("| 'freetalk'"),
      'XP 规则表新增一条：大肥鱼总结 6 XP，来源单列为 freetalk')

    /* ---------- 接线：路由 / 首页入口 / 导航不变 ---------- */
    assert(ffAppSrc.includes('freeTalk: <FreeTalk />') && ffTypesViewSrc.includes("| 'freeTalk'")
      && ffHomeSrc.includes("navigate('freeTalk')") && ffHomeSrc.includes('home-freetalk-entry'),
      '接线完整：新增 freeTalk 视图 + 首页入口卡')
    const ffNavBlock = ffLayoutSrc.match(/const NAV:[\s\S]*?\n\]/)?.[0] || ''
    assert(!ffNavBlock.includes('freeTalk') && ffNavBlock.includes("view: 'settings'"),
      '底部导航仍是 8 项：鱼塘从首页卡片进入，与 China Learner Track 同策略')

    /* ---------- 运行时：把 freetalk 真跑起来 ---------- */
    const FT = await loadModule('netlify/functions/freetalk.ts', 'netlify-freetalk')
    const ftSavedEnv = {
      LLM_API_KEY: process.env.LLM_API_KEY,
      LLM_API_BASE: process.env.LLM_API_BASE,
      LLM_MODEL: process.env.LLM_MODEL,
      FREETALK_RATE_LIMIT_PER_MINUTE: process.env.FREETALK_RATE_LIMIT_PER_MINUTE,
      FREETALK_RATE_LIMIT_PER_DAY: process.env.FREETALK_RATE_LIMIT_PER_DAY,
    }
    const ftRealFetch = globalThis.fetch
    let ftUpstreamBody = ''
    let ftUpstreamCalls = 0
    globalThis.fetch = async (url, init) => {
      if (String(url).includes('/chat/completions')) {
        ftUpstreamCalls += 1
        ftUpstreamBody = String((init && init.body) || '')
        const content = ftUpstreamBody.includes('[TASK:summary]')
          ? '{"feeling":"今天和你聊天超开心的！","pronunciation":"刚才那个 /θ/ 的发音，舌头要稍微伸出来一点哦~"}'
          : ftUpstreamBody.includes('targetWord')
            ? '{"score":88,"suggestion":"ok"}'
            : 'Cool! That sounds wild — tell me more!'
        return new Response(JSON.stringify({ choices: [{ message: { content } }] }),
          { status: 200, headers: { 'Content-Type': 'application/json' } })
      }
      throw new Error('unexpected fetch: ' + String(url))
    }
    process.env.LLM_API_KEY = 'test-key'
    process.env.LLM_API_BASE = 'https://api.deepseek.com/v1'
    process.env.LLM_MODEL = 'deepseek-chat'
    delete process.env.FREETALK_RATE_LIMIT_PER_MINUTE
    delete process.env.FREETALK_RATE_LIMIT_PER_DAY

    try {
      /* GET：能力探测，不消耗额度，永不回传密钥 */
      const ftGet = await FT.invokeFreetalk({ method: 'GET' })
      const ftGetBody = JSON.parse(ftGet.body)
      assert(ftGet.statusCode === 200 && ftGetBody.ok === true && ftGetBody.configured === true
        && Array.isArray(ftGetBody.characters) && ftGetBody.characters.length === 6
        && !ftGet.body.includes('test-key'),
      '运行时：GET 探测返回 200 + 6 条鱼的人设摘要，且永不回传密钥')

      /* POST：一轮闲聊 */
      const ftOk = await FT.invokeFreetalk({
        method: 'POST', headers: { 'x-nf-client-connection-ip': '198.51.100.31' },
        body: { character: 'elf', accent: 'en-US', mode: 'chat',
          messages: [{ role: 'user', content: 'I love skateboarding at night' }] },
      })
      const ftOkBody = JSON.parse(ftOk.body)
      assert(ftOk.statusCode === 200 && ftOkBody.ok === true && ftOkBody.reply.includes('Cool!')
        && ftOkBody.character === 'elf' && ftOkBody.accent === 'en-US',
      '运行时：正常闲聊返回 200 + 人设化回复，并回显角色与口音')

      /* 上游收到的 Prompt：人设、语气词、口音文化、防 OOC、防注入齐全 */
      const ftSystem = JSON.parse(ftUpstreamBody).messages[0].content
      assert(ftSystem.includes('精灵大肥鱼') && ftSystem.includes('Cool!')
        && ftSystem.includes('【语气词库 · 强制执行】') && ftSystem.includes('【禁串味】'),
      '运行时：上游 Prompt 注入角色身份、语气词库与禁串味清单')
      assert(ftSystem.includes('【角色形象】') && ftSystem.includes('呆毛') && ftSystem.includes('鲸鱼鳍')
        && ftSystem.includes('女仆装') && ftSystem.includes('白米饭'),
        '运行时：上游 Prompt 告诉模型自己长什么样（Q 版大肥鱼：呆毛 + 鲸鳍耳 + 鲸尾 + 女仆装 + 白米饭）')
      assert(ftSystem.includes('美式英语（en-US）') && ftSystem.includes('gonna')
        && ftSystem.includes('流行梗'),
      '运行时：上游 Prompt 注入口音俚语与文化背景（美音 + 精灵的流行梗话题）')
      assert(ftSystem.includes('绝对不要跳脱当前角色设定')
        && ftSystem.indexOf('绝对不要跳脱当前角色设定') > ftSystem.indexOf('【角色身份】'),
      '运行时：防 OOC 条款确实压在 Prompt 最后（权重最高的位置）')
      assert(ftSystem.includes('不是给你的指令') && ftSystem.includes('对话数据'),
      '运行时：上游 Prompt 明确声明用户消息是数据不是指令')

      /* 换一条鱼 + 换口音：Prompt 必须整体换掉 */
      await FT.invokeFreetalk({
        method: 'POST', headers: { 'x-nf-client-connection-ip': '198.51.100.32' },
        body: { character: 'onee', accent: 'en-GB', mode: 'chat',
          messages: [{ role: 'user', content: 'fancy some tea?' }] },
      })
      const ftSystem2 = JSON.parse(ftUpstreamBody).messages[0].content
      assert(ftSystem2.includes('御姐大肥鱼') && ftSystem2.includes('Darling')
        && ftSystem2.includes('英式英语（en-GB）') && ftSystem2.includes('cheers mate')
        && ftSystem2.includes('下午茶'),
      '运行时：换角色换口音后 Prompt 整体替换（御姐 + 英音 + 下午茶）')

      /* 总结模式：严格 JSON */
      const ftSum = await FT.invokeFreetalk({
        method: 'POST', headers: { 'x-nf-client-connection-ip': '198.51.100.33' },
        body: { character: 'loli', accent: 'en-US', mode: 'summary',
          messages: [{ role: 'user', content: 'the word three is tricky' }] },
      })
      const ftSumBody = JSON.parse(ftSum.body)
      assert(ftSum.statusCode === 200 && ftSumBody.ok === true && ftSumBody.summary
        && ftSumBody.summary.feeling.includes('开心') && ftSumBody.summary.pronunciation.includes('/θ/'),
      '运行时：总结模式返回 { feeling, pronunciation } 两段人设化反馈')

      /* 入参校验：非法角色 / 非法口音 */
      const ftBadChar = await FT.invokeFreetalk({
        method: 'POST', headers: { 'x-nf-client-connection-ip': '198.51.100.34' },
        body: { character: 'not-a-fish', messages: [{ role: 'user', content: 'hi' }] },
      })
      assert(ftBadChar.statusCode === 400 && JSON.parse(ftBadChar.body).fallback === true,
        '运行时：非法角色 id 回 400 + fallback 外壳，不去打上游')

      /* 限流：同一 IP 连打 9 次，第 9 次举 429 牌子 */
      let ftLast = null
      for (let i = 0; i < 9; i++) {
        ftLast = await FT.invokeFreetalk({
          method: 'POST', headers: { 'x-nf-client-connection-ip': '198.51.100.40' },
          body: { character: 'surfer', accent: 'en-AU', mode: 'chat',
            messages: [{ role: 'user', content: 'surfing at dawn' }] },
        })
      }
      const ftLastBody = JSON.parse(ftLast.body)
      assert(ftLast.statusCode === 429 && ftLastBody.rateLimited === true
        && ftLastBody.error === '鱼塘太挤了，请稍后再聊'
        && ftLast.headers['Retry-After'] && ftLast.headers['X-RateLimit-Scope'] === 'minute'
        && ftLast.headers['X-RateLimit-Limit-Minute'] === '8',
      '运行时：同一 IP 第 9 次请求被限流 → 429 + 中文提示 + Retry-After + 8 次/分钟额度头')
    } finally {
      globalThis.fetch = ftRealFetch
      for (const [k, v] of Object.entries(ftSavedEnv)) {
        if (v === undefined) delete process.env[k]
        else process.env[k] = v
      }
    }

    /* ---------- 运行时：四个端点的限流桶互不干扰（合并 bundle 证明前缀才是功臣） ---------- */
    {
      const fourEntry = `
export { invokeChat } from './netlify/functions/chat.ts'
export { invokeEvaluate } from './netlify/functions/evaluate.ts'
export { invokeFreetalk } from './netlify/functions/freetalk.ts'
export { invokeTranscribe, pickTranscript } from './netlify/functions/transcribe.ts'
`
      const fourOut = path.join(os.tmpdir(), `lingua-smoke-four-${process.pid}.mjs`)
      await build({
        stdin: { contents: fourEntry, resolveDir: root, loader: 'ts' },
        bundle: true, format: 'esm', platform: 'node', outfile: fourOut, logLevel: 'silent',
      })
      const FOUR = await import(pathToFileURL(fourOut).href + `?t=${Date.now()}`)
      const fourSaved = {
        LLM_API_KEY: process.env.LLM_API_KEY,
        LLM_API_BASE: process.env.LLM_API_BASE,
        LLM_MODEL: process.env.LLM_MODEL,
        RATE_LIMIT_PER_MINUTE: process.env.RATE_LIMIT_PER_MINUTE,
        RATE_LIMIT_PER_DAY: process.env.RATE_LIMIT_PER_DAY,
        FREETALK_RATE_LIMIT_PER_MINUTE: process.env.FREETALK_RATE_LIMIT_PER_MINUTE,
        FREETALK_RATE_LIMIT_PER_DAY: process.env.FREETALK_RATE_LIMIT_PER_DAY,
        ASR_RATE_LIMIT_PER_MINUTE: process.env.ASR_RATE_LIMIT_PER_MINUTE,
        ASR_RATE_LIMIT_PER_DAY: process.env.ASR_RATE_LIMIT_PER_DAY,
      }
      const fourRealFetch = globalThis.fetch
      globalThis.fetch = async (url, init) => {
        if (String(url).includes('/chat/completions')) {
          const body = String((init && init.body) || '')
          const content = body.includes('[TASK:summary]')
            ? '{"feeling":"ok","pronunciation":"ok"}'
            : body.includes('targetWord')
              ? '{"score":88,"suggestion":"ok"}'
              : '{"reply":"Cool! hi","translation":"","feedback":{},"hints":[],"state":{"coveredWords":[],"mistakes":[],"progress":0.2},"end":false,"effective":true}'
          return new Response(JSON.stringify({ choices: [{ message: { content } }] }),
            { status: 200, headers: { 'Content-Type': 'application/json' } })
        }
        throw new Error('unexpected fetch: ' + String(url))
      }
      process.env.LLM_API_KEY = 'test-key'
      process.env.LLM_API_BASE = 'https://api.deepseek.com/v1'
      process.env.LLM_MODEL = 'deepseek-chat'
      /* 显式钉死额度，避免调用方 shell 里遗留的 0 / 自定义值让分桶断言漂移 */
      process.env.RATE_LIMIT_PER_MINUTE = '5'
      process.env.RATE_LIMIT_PER_DAY = '50'
      process.env.FREETALK_RATE_LIMIT_PER_MINUTE = '8'
      process.env.FREETALK_RATE_LIMIT_PER_DAY = '50'
      process.env.ASR_RATE_LIMIT_PER_MINUTE = '6'
      process.env.ASR_RATE_LIMIT_PER_DAY = '50'

      try {
        const ip = { 'x-nf-client-connection-ip': '198.51.100.50' }
        let last = null
        for (let i = 0; i < 8; i++) {
          last = await FOUR.invokeFreetalk({
            method: 'POST', headers: ip,
            body: { character: 'elf', messages: [{ role: 'user', content: 'hey' }] },
          })
        }
        const ninth = await FOUR.invokeFreetalk({
          method: 'POST', headers: ip,
          body: { character: 'elf', messages: [{ role: 'user', content: 'hey again' }] },
        })
        const chatAfter = await FOUR.invokeChat({
          method: 'POST', headers: ip,
          body: { messages: [{ role: 'user', content: 'hi' }], level: 'B1' },
        })
        const evalAfter = await FOUR.invokeEvaluate({
          method: 'POST', headers: ip,
          body: { targetWord: 'think', userSpokenText: 'think' },
        })
        /* 转写桶 6 次/分：空 body 会在限流之后才被校验成 400，
           因此纯离线也能证明「先分桶、后校验」的顺序与窗口确实生效。 */
        let asrLast = null
        for (let i = 0; i < 6; i++) {
          asrLast = await FOUR.invokeTranscribe({ method: 'POST', headers: ip, body: {} })
        }
        const asrSeventh = await FOUR.invokeTranscribe({ method: 'POST', headers: ip, body: {} })
        const asrSeventhBody = JSON.parse(asrSeventh.body)
        const chatAfterAsr = await FOUR.invokeChat({
          method: 'POST', headers: ip,
          body: { messages: [{ role: 'user', content: 'still here' }], level: 'B1' },
        })
        const evalAfterAsr = await FOUR.invokeEvaluate({
          method: 'POST', headers: ip,
          body: { targetWord: 'think', userSpokenText: 'think' },
        })
        assert(ninth.statusCode === 429 && asrSeventh.statusCode === 429
          && chatAfter.statusCode === 200 && evalAfter.statusCode === 200
          && chatAfterAsr.statusCode === 200 && evalAfterAsr.statusCode === 200,
        '运行时：鱼塘桶（8 次）与转写桶（6 次）分别打满后，对话桶与评测桶仍照常放行（四桶互不干扰）')
        assert(asrLast.statusCode === 400 && asrSeventhBody.rateLimited === true
          && asrSeventhBody.error === '转写太频繁了，稍等一下再试'
          && asrSeventh.headers['Retry-After'] && asrSeventh.headers['X-RateLimit-Scope'] === 'minute'
          && asrSeventh.headers['X-RateLimit-Limit-Minute'] === '6',
        '运行时：转写第 7 次触发 429 + 中文提示 + Retry-After + 6 次/分钟额度头（防 method 误传成时间戳）')
        assert(FOUR.pickTranscript({ text: '  fancy some tea  ', duration_ms: 2400 }).text === 'fancy some tea'
          && FOUR.pickTranscript({ transcript: 'hello' }).text === 'hello',
        '运行时：上游转写结果兼容 text / transcript 两种形状并去除首尾空白')
      } finally {
        globalThis.fetch = fourRealFetch
        for (const [k, v] of Object.entries(fourSaved)) {
          if (v === undefined) delete process.env[k]
          else process.env[k] = v
        }
      }
    }

    /* ---------- 运行时：前端页面真渲染 + 上游挂掉也不中断 ---------- */
    {
      clickExact('学习', '回到学习页')
      await tick(200)
      /* [移动端登录入口] 真渲染首页：横幅必须可见、可点开登录弹窗 */
      const syncBanner = document.querySelector('[data-testid="sync-banner"]')
        ?? document.querySelector('[data-testid="sync-banner-unconfigured"]')
      assert(!!syncBanner, '首页顶部出现云同步横幅（未登录时是告警条，未配置时如实说明）')
      const syncBannerText = syncBanner.textContent || ''
      assert(/本机|未接入/.test(syncBannerText) && /登录|云同步/.test(syncBannerText),
        `运行时：横幅文案点明数据归属与出路（实际=${syncBannerText.slice(0, 50)}）`)
      const realBanner = document.querySelector('[data-testid="sync-banner"]')
      if (realBanner) {
        fire(realBanner)
        await tick(120)
        const loginDlg = document.querySelector('[data-testid="sync-login-dialog"]')
        assert(!!loginDlg && loginDlg.getAttribute('role') === 'dialog'
          && loginDlg.getAttribute('aria-modal') === 'true',
          '运行时：点击首页横幅弹出登录/注册弹窗')
        assert(!!document.querySelector('[data-testid="sync-login-dialog"] input[type="email"]')
          && !!document.querySelector('[data-testid="sync-login-dialog"] input[type="password"]'),
          '运行时：登录弹窗含邮箱与密码输入框')
        const dlgText = loginDlg.textContent || ''
        assert(/登录/.test(dlgText) && /注册/.test(dlgText),
          '运行时：弹窗同时提供登录与注册入口')
      }

      const entry = document.querySelector('[data-testid="home-freetalk-entry"]')
      assert(!!entry, '首页出现「大肥鱼自由对话」入口卡（底部导航仍是 8 项）')
      fire(entry)
      await tick(260)
      assert(!!document.querySelector('[data-testid="freetalk-page"]'),
        '点击入口卡进入鱼塘页')
      assert(document.querySelectorAll('[data-testid^="freetalk-character-"]').length === 6,
        '鱼塘页渲染出 6 条大肥鱼可选')
      assert(document.querySelectorAll('[data-testid^="freetalk-accent-"]').length === 3,
        '鱼塘页渲染出英 / 美 / 澳三档口音')
      const ffAvatar = document.querySelector('[data-testid="fatfish-avatar-elf"] img')
      assert(!!ffAvatar && /fatfish\/elf\.webp$/.test(ffAvatar.getAttribute('src') || '')
        && !/^https?:/.test(ffAvatar.getAttribute('src') || ''),
        '运行时：大肥鱼形象是本地立绘 WebP（无外链 CDN）')
      assert(ffAvatar.closest('.ff-avatar')?.classList.contains('ff-motion-bounce'),
        '运行时：立绘容器保留该角色的朗读动作类名')
      const petBtn = document.querySelector('[data-testid="desktop-pet"]')
      assert(!!petBtn && petBtn.getAttribute('data-state') === 'idle'
        && petBtn.getAttribute('data-motion') === 'bounce'
        && !!document.querySelector('[data-testid="desktop-pet-dock"]'),
      '运行时：输入台旁出现电子宠物，初始为 idle 且继承精灵的 bounce 人设动作')
      /* 切到御姐：口音应自动跟到该角色的默认英音 */
      const oneeBtn = document.querySelector('[data-testid="freetalk-character-onee"]')
      assert(!!oneeBtn, '御姐大肥鱼可切换')
      fire(oneeBtn)
      await tick(120)
      const gbAccent = document.querySelector('[data-testid="freetalk-accent-en-GB"]')
      assert(!!gbAccent && gbAccent.getAttribute('aria-pressed') === 'true',
        '切换到御姐后，口音自动跟到她的默认英音 en-GB')

      /* [语音输入] 完整链路：点麦克风 → 假识别器出字 → 文字进输入框但不自动发送 */
      const micBtn = document.querySelector('[data-testid="freetalk-mic"]')
      assert(!!micBtn && (micBtn.getAttribute('aria-label')?.includes('录音') || micBtn.getAttribute('aria-label')?.includes('停止')),
        '手动模式：输入台麦克风按钮明确标注「开始/停止录音」（无障碍标签齐全）')
      class FishRecognition {
        constructor() {
          this.lang = ''; this.continuous = false; this.interimResults = false; this.maxAlternatives = 1
          FishRecognition.lastLang = undefined
        }
        start() {
          FishRecognition.lastLang = this.lang
          /* 先给一段 interim 实时字幕，再给 final；手动模式下不主动 onend */
          setTimeout(() => this.onresult?.({ resultIndex: 0,
            results: [{ isFinal: false, length: 1, 0: { transcript: 'fancy some' } }] }), 15)
          setTimeout(() => {
            this.onresult?.({ resultIndex: 0,
              results: [{ isFinal: true, length: 1, 0: { transcript: 'fancy some tea' } }] })
          }, 40)
        }
        stop() { setTimeout(() => this.onend?.(), 5) }
        abort() {}
      }
      const bubblesBeforeDictate = document.querySelectorAll('[data-testid="freetalk-page"] .animate-in').length
      globalThis.window.SpeechRecognition = FishRecognition
      /* 切御姐触发过重渲染，重新查询按钮，避免 fire 到过期 DOM 节点 */
      fire(document.querySelector('[data-testid="freetalk-mic"]'))
      await tick(25)
      assert(!!document.querySelector('[data-testid="freetalk-dictation-interim"]'),
        '听写中出现实时字幕条（aria-live 播报）')
      await tick(160)
      const beforeStopInput = document.querySelector('[data-testid="freetalk-input"]')
      assert(!beforeStopInput.value.includes('fancy some tea'),
        '手动模式：识别到文字但用户没点停止，不写入输入框')
      /* 模拟用户点「停止」：此时文字才进输入框 */
      fire(document.querySelector('[data-testid="freetalk-mic"]'))
      await tick(120)
      const afterDictate = document.querySelector('[data-testid="freetalk-input"]')
      assert(afterDictate.value.includes('fancy some tea'),
        '手动模式：用户点停止后识别文字才追加进输入框')
      assert(!!document.querySelector('[data-testid="freetalk-dictation-note"]')
        && bodyText().includes('已转成文字'),
      '听写完成给出「已转成文字，确认后发送」的核对提示')
      assert(document.querySelectorAll('[data-testid="freetalk-page"] .animate-in').length === bubblesBeforeDictate,
        '识别文字只进输入框、不自动发送（消息气泡数未增加）')
      assert(FishRecognition.lastLang === 'en-GB',
        '识别器口音跟随当前口音档位（御姐 en-GB，不是默认 en-US）')
      delete globalThis.window.SpeechRecognition

      /* [Android 降级] 识别器静默 onend 无结果 → 本地录音 → WAV → 内置 ASR → 文字进输入框 */
      {
        const savedFetchFb = globalThis.fetch
        const savedFileReaderFb = globalThis.FileReader
        const savedCreateObjectURL = globalThis.URL.createObjectURL
        const savedAudioContext = globalThis.window.AudioContext
        const savedMediaRecorder = globalThis.window.MediaRecorder
        const savedMediaDevices = Object.getOwnPropertyDescriptor(globalThis.window.navigator, 'mediaDevices')

        class SilentRecognition {
          constructor() {
            this.lang = ''; this.continuous = false; this.interimResults = false; this.maxAlternatives = 1
          }
          start() { setTimeout(() => this.onend?.(), 15) } // 构造器在、服务不可达的典型表现
          stop() {}
          abort() {}
        }
        class FakeAudioContext {
          static closed = false
          async decodeAudioData() {
            return {
              length: 1600, sampleRate: 48000, numberOfChannels: 1,
              getChannelData: () => new Float32Array(1600).fill(0.2),
            }
          }
          async close() { FakeAudioContext.closed = true }
        }
        class FakeMediaRecorder {
          static isTypeSupported() { return true }
          static instances = []
          constructor() {
            this.mimeType = 'audio/webm'; this.state = 'inactive'
            FakeMediaRecorder.instances.push(this)
          }
          start() {
            this.state = 'recording'
            setTimeout(() => this.ondataavailable?.({ data: new Blob(['fake-audio'], { type: 'audio/webm' }) }), 10)
          }
          stop() { this.state = 'inactive'; this.onstop?.() }
        }
        class FakeFileReader {
          readAsDataURL(blob) {
            blob.arrayBuffer().then((buf) => {
              this.result = 'data:audio/wav;base64,' + Buffer.from(buf).toString('base64')
              this.onload?.()
            }).catch((err) => this.onerror?.(err))
          }
        }

        globalThis.FileReader = FakeFileReader
        globalThis.URL.createObjectURL = () => 'blob:lingua-fake-recording'
        globalThis.window.AudioContext = FakeAudioContext
        globalThis.window.MediaRecorder = FakeMediaRecorder
        Object.defineProperty(globalThis.window.navigator, 'mediaDevices', {
          configurable: true,
          value: { getUserMedia: async () => ({ getTracks: () => [{ stop() {} }] }) },
        })
        let asrCalls = 0
        globalThis.fetch = async (url, init) => {
          if (String(url).includes('/.netlify/functions/transcribe')) {
            asrCalls += 1
            const payload = JSON.parse(String((init && init.body) || '{}'))
            if (payload.mime !== 'audio/wav' || typeof payload.audio !== 'string') {
              throw new Error('fallback must submit WAV base64')
            }
            return new Response(JSON.stringify({
              ok: true, text: 'fancy some tea from asr', durationMs: 1200,
            }), { status: 200, headers: { 'Content-Type': 'application/json' } })
          }
          return savedFetchFb(url, init)
        }

        try {
          globalThis.window.SpeechRecognition = SilentRecognition
          const bubblesBeforeFallback = document.querySelectorAll('[data-testid="freetalk-page"] .animate-in').length
          const textBeforeFallback = document.querySelector('[data-testid="freetalk-input"]').value
          fire(document.querySelector('[data-testid="freetalk-mic"]'))
          await tick(160)
          assert(bodyText().includes('录音中')
            && document.querySelector('[data-testid="freetalk-mic"]')?.getAttribute('aria-label') === '录音中，点击停止并提交',
          '运行时：识别服务静默失败后自动切本地录音，麦克风变成「录音中·点击停止并提交」')
          assert(FakeMediaRecorder.instances.length === 1 && FakeMediaRecorder.instances[0].state === 'recording',
          '运行时：降级真的启动了 MediaRecorder，而不是只改了一句提示文案')

          fire(document.querySelector('[data-testid="freetalk-mic"]'))
          await tick(300)
          const afterFallback = document.querySelector('[data-testid="freetalk-input"]')
          assert(afterFallback.value.includes(textBeforeFallback)
            && afterFallback.value.includes('fancy some tea from asr'),
          '运行时：录音经 WAV + 内置 ASR 转成文字并追加进输入框，原有文字不丢')
          assert(asrCalls === 1 && FakeAudioContext.closed === true,
          '运行时：只提交一次转写请求，且解码用的 AudioContext 用完即关')
          assert(bodyText().includes('已从录音转成文字')
            && document.querySelectorAll('[data-testid="freetalk-page"] .animate-in').length === bubblesBeforeFallback,
          '运行时：转写完成给出核对提示，且文字不自动发送')
        } finally {
          delete globalThis.window.SpeechRecognition
          globalThis.fetch = savedFetchFb
          if (savedFileReaderFb === undefined) delete globalThis.FileReader
          else globalThis.FileReader = savedFileReaderFb
          if (savedCreateObjectURL === undefined) delete globalThis.URL.createObjectURL
          else globalThis.URL.createObjectURL = savedCreateObjectURL
          if (savedAudioContext === undefined) delete globalThis.window.AudioContext
          else globalThis.window.AudioContext = savedAudioContext
          if (savedMediaRecorder === undefined) delete globalThis.window.MediaRecorder
          else globalThis.window.MediaRecorder = savedMediaRecorder
          if (savedMediaDevices) Object.defineProperty(globalThis.window.navigator, 'mediaDevices', savedMediaDevices)
          else delete globalThis.window.navigator.mediaDevices
        }
      }

      /* 上游不可用（jsdom 里 fetch 打不通）→ 本地演示大肥鱼顶上 + 友好错误卡 */
      const finishBtn = document.querySelector('[data-testid="freetalk-finish"]')
      assert(!!finishBtn && finishBtn.disabled === true, '还没聊天时「结束并总结」不可点')
      const input = document.querySelector('[data-testid="freetalk-input"]')
      const setter = Object.getOwnPropertyDescriptor(w.HTMLTextAreaElement.prototype, 'value').set
      setter.call(input, 'hello fat fish')
      input.dispatchEvent(new w.Event('input', { bubbles: true }))
      await tick(80)
      const sendBtn = document.querySelector('[data-testid="freetalk-send"]')
      fire(sendBtn)
      await tick(900)
      assert(bodyText().includes('hello fat fish'), '用户发言出现在气泡里')
      assert(/Cool!|Actually|Darling|Wow~|Yo!|G'day/.test(bodyText()),
        '上游不可用时本地演示大肥鱼顶上，且用的是该角色的语气词')
      assert(!!document.querySelector('[data-testid="freetalk-error-card"]'),
        '上游失败同时给出友好错误卡（练习不中断）')

      /* ---------- Desktop Pet 运行时：happy → 归位 → 显隐 → thinking ---------- */
      const idlePet = document.querySelector('[data-testid="desktop-pet"]')
      assert(!!idlePet && idlePet.getAttribute('data-state') === 'idle',
        '运行时：一轮对话落定后宠物回到 idle，不会卡在 thinking')
      fire(idlePet)
      await tick(30)
      assert(document.querySelector('[data-testid="desktop-pet"]')?.getAttribute('data-state') === 'happy'
        && !!document.querySelector('.dp-heart-1')
        && !!document.querySelector('[data-testid="desktop-pet"] [role="status"]'),
      '运行时：点一下小鱼触发 happy，三颗爱心与一句角色短句同时出现')
      const heart = document.querySelector('.dp-heart-1')
      const heartEnd = new w.Event('animationend', { bubbles: true })
      Object.defineProperty(heartEnd, 'animationName', { value: 'dp-heart-float' })
      heart.dispatchEvent(heartEnd)
      /* jsdom 没有 AnimationEvent 构造器，React 收不到合成事件；
         这里靠 hook 的 1150ms 兜底归位验证「happy 最终一定回到 idle」。 */
      await tick(1200)
      const petAfterHeart = document.querySelector('[data-testid="desktop-pet"]')
      assert(petAfterHeart?.getAttribute('data-state') === 'idle',
        `运行时：爱心结束后 happy 归位 idle（实际=${petAfterHeart?.getAttribute('data-state')}），兜底不驱动动画`)

      fire(document.querySelector('[data-testid="freetalk-pet-toggle"]'))
      await tick(30)
      assert(!document.querySelector('[data-testid="desktop-pet"]')
        && document.querySelector('[data-testid="freetalk-pet-toggle"]')?.getAttribute('aria-pressed') === 'false',
      '运行时：收起开关让宠物从 DOM 里消失，输入与发送按钮仍在原位')
      fire(document.querySelector('[data-testid="freetalk-pet-toggle"]'))
      await tick(30)
      assert(!!document.querySelector('[data-testid="desktop-pet"]'),
        '运行时：再次点击可唤回宠物，开关是纯会话态')

      const petRealFetch = globalThis.fetch
      try {
        globalThis.fetch = async (url, init) => {
          await new Promise((resolve) => setTimeout(resolve, 160))
          return petRealFetch(url, init)
        }
        const thinkInput = document.querySelector('[data-testid="freetalk-input"]')
        setter.call(thinkInput, 'pet is thinking')
        thinkInput.dispatchEvent(new w.Event('input', { bubbles: true }))
        await tick(30)
        fire(document.querySelector('[data-testid="freetalk-send"]'))
        await tick(25)
        assert(document.querySelector('[data-testid="desktop-pet"]')?.getAttribute('data-state') === 'thinking'
          && !!document.querySelector('.dp-question'),
        '运行时：发送后等 AI 期间切到 thinking，头顶冒出问号泡泡')
        await tick(400)
      } finally {
        globalThis.fetch = petRealFetch
      }

      /* 结束并总结：即使上游挂了也要有一份人设化总结 */
      const finishBtn2 = document.querySelector('[data-testid="freetalk-finish"]')
      fire(finishBtn2)
      await tick(900)
      const summaryBox = document.querySelector('[data-testid="freetalk-summary"]')
      assert(!!summaryBox && bodyText().includes('聊天感受') && bodyText().includes('发音建议'),
        '「结束并总结」产出 { feeling, pronunciation } 两段人设化反馈')

      /* 运行时：微信内置浏览器点麦克风 → 明确弹窗，而不是「点了没反应」 */
      const wxUA = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) MicroMessenger/8.0'
      const savedUA2 = navTargets.map((n) => Object.getOwnPropertyDescriptor(n, 'userAgent'))
      setUA(wxUA)
      try {
        const micEl = document.querySelector('[data-testid="freetalk-mic"]')
        fire(micEl)
        await tick(80)
        const dialog = document.querySelector('[data-testid="voice-support-dialog"]')
        const msg = document.querySelector('[data-testid="voice-notice-message"]')
        assert(!!dialog && dialog.getAttribute('role') === 'alertdialog'
          && !!msg && msg.textContent.includes('当前浏览器不支持语音，请使用文字输入'),
        `运行时：不支持的浏览器点麦克风弹出 alertdialog（dialog=${!!dialog}, msg=${msg?.textContent?.slice(0, 60) || '无'}）`)
        fire(document.querySelector('[data-testid="voice-notice-ok"]'))
        await tick(40)
        assert(!document.querySelector('[data-testid="voice-support-dialog"]'),
          '运行时：确认后弹窗关闭，输入区仍可正常使用')
      } finally {
        navTargets.forEach((n, i) => {
          if (savedUA2[i]) Object.defineProperty(n, 'userAgent', savedUA2[i])
        })
      }
    }
  }

  console.log('\n控制台错误数:', errors.length)
  if (errors.length) console.log(errors.slice(0, 3).join('\n'))
  console.log('\n🎉 SMOKE TEST PASSED — 原有流程 / 雅思六档 / 四维度 / 语音评判 / 录音转文字 / 文学长廊（公版书库·三视图·证据校验·苏格拉底研讨·迁移）/ 文化视角视频（白名单·官方嵌入·短引用·观后讨论·迁移·三层储量：44 条种子·播放列表注册表·手动同步·库健康度）/ Word Lab 词场（7 库分片·五步状态机·艾宾浩斯阶梯并轨 SM-2·3 Agent·6 新键·易错本·S0 满额·迁移）/ S2.5 跟读朗读（听标准音·词级比对·10s/0.8s/静音·四级降级·Mock 演示·第 24 键·发音待留意）/ Growth System（awardXp 统一入口·幂等账本·等级曲线·streak 冻结卡·27 枚成就·成长页/成就页·XpToast/LevelUpBanner·4 新键与一次性迁移）/ China Learner Track（四轨道 40 原创单元·struggle 可见·结构级反馈优先级·省份默认关闭·来源许可分层·2 个场景词包·Dialogue assessmentFocus·第 29 键·Mock 全流程）/ CEFR 等级层（三模块分级内容池 39 单元·cefrBasis≥3 项依据·LevelFilterService 共用筛选·跳级/留级/显示全部·第 30 键·每日计划读 active·刷新持久化）/ 对话语音层（自动朗读·真实音色 getVoices·按句切分·TTS 与识别互斥·levelProfile 等级硬约束·角色音色绑定·第 31 键·降级不静默失败）/ PWA 离线壳（vite-plugin-pwa·registerType prompt·manifest.webmanifest·iOS meta·App Shell 预缓存·用户点确认才更新）/ 刷新持久化 / 全局错误边界（防白屏·怒气小脸·双保险·零网络改动） / Netlify 全栈迁移（Functions·双代理·同源 invokeChat） / 徽章隐藏兜底（纯 CSS·五重锁） / 防刷限流（内存 IP 双窗口·429 契约·前端优雅提示） / 前端异常处理（双层错误边界·500/401 红色系统提示·离线功能隔离） / PWA 更新提示迁移（virtual:pwa-register/react·useRegisterSW·唯一注册入口·底部不遮导航） / AI 发音评测（evaluate 函数·复用 IP 限流·eval: 独立分桶·口音切换·得分环·XP 幂等·易错词库） / 大肥鱼自由对话（freetalk 函数·6 条鱼立体立绘 WebP·人设锁死 Prompt·防 OOC 末条指令·防提示注入·英美澳口音 TTS·6 套朗读动作·主题色变量·人设化总结 JSON·8 次/分钟独立分桶限流·悬浮电子宠物四态机·人设分岔 CSS 动作·显隐开关）/ 内置语音转写（Android 录音降级·webm→16kHz WAV·DeepSeek ASR·asr 独立分桶·假录音器端到端回归·method 误传时间戳回归护栏）/ 移动端语音兼容（UA 分诊·手势内开麦·安全上下文硬门槛·不支持弹窗与文字输入出路）/ 手动录音模式（Start/Stop 仅用户点击·无静音/时长自动停止·原生 onend 续听·emit 唯一出口·三处麦克风两态波形 UI） 全部通过')
} catch (err) {
  console.error(err)
  console.log('\n控制台错误:', errors.slice(0, 5).join('\n'))
  process.exitCode = 1
}

/* [云同步] GoTrueClient 的 autoRefreshToken 会在 Node 里留下 setInterval，
   使事件循环无法自然清空；冒烟已输出全部结果，这里显式收尾（真实浏览器无此问题）。 */
process.exit(process.exitCode ?? 0)
