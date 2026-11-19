/* ================================================================
 * 第 1 层：结构化种子库（45 条扩展 + 5 条旧手配 = 50 条，离线可用，零 API 调用）
 *
 * ★ 真实性约束：本文件里的每一个 videoId 都来自公开可验证的官方页面，
 *   绝不自造 11 位 ID。来源见 playlistRegistrySeed.ts 的 verifiedUrl：
 *     - VOA  26 条：@VOALearningEnglish 官方频道播放列表页 / 官方频道简介 /
 *                   EduBrights 镜像的 VOA 官方视频描述（ytid<ID>）
 *     - TED-Ed 11 条：Open Culture 引用的官方播放列表、TED 官方视频页、
 *                    官方 bit.ly 短链；其中 4 条只有播放列表、没有单条 ID，
 *                    显式 videoId:'' + idStatus:'playlist-only'
 *     - British Council 5 条：@BritishCouncilEnglish/playlists 官方播放列表页
 *     - Pexels / Pixabay 4 条：原创教学占位，不托管任何第三方视频文件
 *
 *   [储量补强] 末 6 条全部为 playlist-only：只固定到已验证官方播放列表，
 *   videoId 显式留空，待 playlistItems.list 同步后自动补全。绝不为了凑数编 ID。
 *
 *   标题为 LinguaBuddy 原创「学习卡」命名，不代表平台原始标题（titleNote 说明）；
 *   短引用、文化主题、中文梗概全部为原创示例注释，不是字幕抄录。
 *
 * 配额约束：本文件是本地静态数据，不发起任何网络请求；
 *   客户端永不调用 search.list，也不在页面加载时自动拉取播放列表。
 * ================================================================ */

import type {
  CefrLevel, CultureTheme, CultureVideo, KeyExpression, VideoPlatform,
} from '../cultureTypes'
import type {
  CultureSource, LibraryVideoEntry, VideoAcquisition, VideoIdStatus,
} from '../cultureLibraryTypes'
import {
  SOURCE_LABELS, SOURCE_PROVENANCE, TOPIC_LABELS,
} from './playlistRegistrySeed'

/** 与 cultureSeed.ts 保持一致的短引用声明（此处独立声明，避免循环 import） */
const SHORT_QUOTE_NOTE = '原创示例短引用 · 非视频字幕抄录 · 不展示完整字幕脚本'

function quote(expression: string, meaningZh: string, context: string, timestampHint: string): KeyExpression {
  return { expression, meaningZh, context, timestampHint, sourceNote: SHORT_QUOTE_NOTE }
}

/** 单条种子 / 同步产物的构造参数 */
export interface VideoCardSpec {
  id: string
  source: CultureSource
  videoId: string
  playlistId?: string
  title: string
  titleZh: string
  topic: CultureTheme
  cefr: CefrLevel
  durationSec: number
  embeddable: boolean
  /** 3 组原创短引用（英文短语 + 中文释义） */
  ex?: [string, string][]
  /** 2 个原创文化主题标签 */
  th?: [string, string]
  seed?: boolean
  acquiredVia?: VideoAcquisition
  syncedFrom?: string
  syncedAt?: number
  /** 覆盖默认 watchUrl（同步产物可指向单条视频页） */
  watchUrl?: string
  officialUrl?: string
  titleNote?: string
}

interface TopicTemplate {
  emblem: string
  coverFrom: string
  coverTo: string
  summary: string
  blurb: string
  watchFor: string
  segments: [string, string, string]
  questions: [string, string, string]
  fallbackEx: [string, string][]
  fallbackTh: [string, string]
}

const TOPIC_TEMPLATES: Record<CultureTheme, TopicTemplate> = {
  'daily-life': {
    emblem: '☕', coverFrom: 'from-mint-400', coverTo: 'to-brand-600',
    summary: '围绕问候、作息、购物与日常小习惯的原创学习卡：用慢速、短句的真实语境练习「听清细节 + 复述」，不复制任何视频字幕。',
    blurb: '日常场景最适合练「听清再说」：先看一遍带 CC 的官方播放器，再用一句话复述你注意到的细节。',
    watchFor: '留意简短寒暄里怎样把选择权留给对方，以及时间、频率这类小词。',
    segments: ['开场 · 场景与人物', '中段 · 一个具体动作', '结尾 · 一句收束的话'],
    questions: [
      'What everyday detail did you notice first, and how would you describe it in one sentence?',
      'Which short expression on this card would you actually use in your own routine? Why?',
      'How is a similar daily scene usually described in your own context?',
    ],
    fallbackEx: [['How are you doing?', '最近怎么样'], ['I usually ...', '我通常会……'], ['See you tomorrow', '明天见']],
    fallbackTh: ['日常寒暄的分寸', '把习惯说成小动作'],
  },
  festivals: {
    emblem: '🎊', coverFrom: 'from-coral-400', coverTo: 'to-sun-400',
    summary: '关于节庆、聚会与身份话题的原创学习卡：观察人们怎样把习俗说得轻松而不是下定义，练习描述「一个具体瞬间」而非概括整群人。',
    blurb: '节日话题容易滑向空泛概括；这张卡只要求你抓住一个看得见的细节，再说自己的看法。',
    watchFor: '留意 a bit of / around here 这类弱化词，以及别人如何介绍一个本地习惯。',
    segments: ['开场 · 场合与准备', '中段 · 一个具体仪式', '结尾 · 参与者的反应'],
    questions: [
      'Which concrete moment in the scene tells you this is a celebration?',
      'How would you introduce a local custom without sounding like you speak for everyone?',
      'Is the custom presented as a rule or as "a bit of a tradition"? What is the difference?',
    ],
    fallbackEx: [['Help yourself to some tea', '茶请自便'], ['It is a bit of a tradition around here', '这算是这儿的一个小传统'], ['Would you like a hand with that?', '需要我搭把手吗']],
    fallbackTh: ['轻量待客表达', '把习俗说成小传统'],
  },
  'work-social': {
    emblem: '🤝', coverFrom: 'from-brand-500', coverTo: 'to-coral-500',
    summary: '面向会议、面试、课堂与社交寒暄的原创学习卡：练「先回应内容、再补充理由」的表达结构，观察礼貌措辞怎样缓和一个直接的观点。',
    blurb: '工作与社交场景里，说法的分寸往往比词汇难度更重要；留意对方怎样先接住话，再给出不同意见。',
    watchFor: '留意 I see what you mean, but ... 一类的缓冲句式与停顿。',
    segments: ['开场 · 场合与角色', '中段 · 一次意见交换', '结尾 · 如何收束'],
    questions: [
      'What did the speaker do before disagreeing, and did it change how the point landed?',
      'Which phrase on this card would make your own opinion sound less abrupt?',
      'Would the same level of directness work in your own study or workplace? Give a concrete detail.',
    ],
    fallbackEx: [['I see what you mean, but ...', '我明白你的意思，不过……'], ['Could we come back to that?', '我们能回头再聊这点吗'], ['That is a fair point', '这个说法有道理']],
    fallbackTh: ['先接住话再表达不同意见', '会议里的缓和措辞'],
  },
  'history-landmarks': {
    emblem: '🏛️', coverFrom: 'from-brand-400', coverTo: 'to-mint-500',
    summary: '围绕城市、建筑与集体记忆的原创学习卡：练「年代 + 用途 + 一个细节」的介绍顺序，不把地标解说当成对整段历史的下结论。',
    blurb: '历史与地标话题适合练时间线表达：先说清楚是什么、什么时候，再补一个你确实看到或听到的细节。',
    watchFor: '注意介绍里先给年代还是先给用途，以及 dates back to 这类开头的用法。',
    segments: ['开场 · 地点与年代', '中段 · 一个用途或人物', '结尾 · 它今天的意义'],
    questions: [
      'Which single detail helped you place this landmark in time?',
      'How would you introduce a building in your own city using "It dates back to ..."?',
      'What is left out when a place is described only by its most famous date?',
    ],
    fallbackEx: [['It dates back to ...', '它可以追溯到……'], ['The square is named after ...', '这个广场以……命名'], ['It is still used today', '它今天仍在使用']],
    fallbackTh: ['地标与集体记忆', '慢速讲解的措辞'],
  },
  'science-nature': {
    emblem: '🌿', coverFrom: 'from-mint-400', coverTo: 'to-sun-400',
    summary: '关于自然、环境与科学解释的原创学习卡：练「现象 → 原因 → 一个证据」的说明顺序，注意科普解说如何把因果说得可追踪。',
    blurb: '科普短片句子不长，但因果链很密；先抓一个能复述的解释，再谈你同不同意。',
    watchFor: '留意 because / so / as a result 这类连接词，以及数字与比较级。',
    segments: ['开场 · 一个现象', '中段 · 解释与证据', '结尾 · 仍未确定的部分'],
    questions: [
      'What phenomenon did the video open with, and what explanation followed?',
      'Which piece of evidence was most concrete to you? Why?',
      'Where does the explanation stop short of certainty? Use a detail from the card.',
    ],
    fallbackEx: [['As a result, ...', '结果是……'], ['One reason is that ...', '一个原因是……'], ['It is not yet clear whether ...', '目前还不清楚是否……']],
    fallbackTh: ['科普解说里的因果链', '把不确定性说清楚'],
  },
  'arts-media': {
    emblem: '🎨', coverFrom: 'from-sun-400', coverTo: 'to-brand-600',
    summary: '围绕文学、影像与媒体素养的原创学习卡：练「描述你看到/听到的 → 给出解释 → 保留另一种读法」，避免把个人感受说成普遍结论。',
    blurb: '艺术与媒体话题没有唯一答案，重点是把观点挂在具体细节上，而不是给出一个漂亮但空的判断。',
    watchFor: '留意 I noticed / It made me wonder 这类把观察与解释分开的说法。',
    segments: ['开场 · 一个画面或句子', '中段 · 它让人想到什么', '结尾 · 留下的问题'],
    questions: [
      'What exactly did you notice, and what did you make of it?',
      'Which phrase on this card helps separate observation from interpretation?',
      'What is one alternative reading of the same detail?',
    ],
    fallbackEx: [['I noticed ...', '我注意到……'], ['It made me wonder ...', '这让我想到……'], ['Another way to read it is ...', '另一种理解是……']],
    fallbackTh: ['观察与解释分开说', '媒体素养与来源辨识'],
  },
}

const PLACEHOLDER_URLS: Partial<Record<CultureSource, string>> = {
  pexels: 'https://www.pexels.com/videos/',
  pixabay: 'https://pixabay.com/videos/',
}

function durationLabel(sec: number): string {
  const m = Math.floor(sec / 60)
  const s = sec % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

/** 唯一的条目构造入口：种子库与播放列表同步产物共用 */
export function makeCultureVideo(spec: VideoCardSpec): LibraryVideoEntry {
  const tpl = TOPIC_TEMPLATES[spec.topic]
  const prov = SOURCE_PROVENANCE[spec.source]
  const platform: VideoPlatform = prov.platform
  const idStatus: VideoIdStatus = spec.videoId ? 'verified' : 'playlist-only'
  const hasId = Boolean(spec.videoId)
  const isPlaceholder = spec.source === 'pexels' || spec.source === 'pixabay'
  const playlistUrl = spec.playlistId ? `https://www.youtube.com/playlist?list=${spec.playlistId}` : ''
  const watchUrl = spec.watchUrl
    || (hasId
      ? `https://www.youtube.com/watch?v=${spec.videoId}${spec.playlistId ? `&list=${spec.playlistId}` : ''}`
      : playlistUrl || PLACEHOLDER_URLS[spec.source] || 'https://learningenglish.voanews.com/')
  const officialUrl = spec.officialUrl || playlistUrl || watchUrl
  const expressions = (spec.ex && spec.ex.length ? spec.ex : tpl.fallbackEx).slice(0, 3)
  const themes = spec.th || tpl.fallbackTh

  const video: LibraryVideoEntry = {
    id: spec.id,
    title: spec.title,
    titleZh: spec.titleZh,
    platform,
    theme: spec.topic,
    tags: [TOPIC_LABELS[spec.topic].label, SOURCE_LABELS[spec.source], ...themes],
    cefr: spec.cefr,
    durationSec: spec.durationSec,
    durationLabel: durationLabel(spec.durationSec),
    embeddable: spec.embeddable && hasId,
    embedMode: spec.embeddable && hasId ? 'iframe' : isPlaceholder ? 'placeholder' : 'linkOnly',
    embedId: spec.embeddable && hasId ? spec.videoId : undefined,
    watchUrl,
    attribution: prov.attribution,
    licenseNote: prov.license,
    summaryZh: `${tpl.summary} 本卡对应「${spec.title}」，内容梗概为应用内原创描述，不代表视频台词或字幕。`,
    emblem: tpl.emblem,
    coverFrom: tpl.coverFrom,
    coverTo: tpl.coverTo,
    blurb: tpl.blurb,
    nativeCaptions: platform === 'youtube' || platform === 'ted',
    segments: tpl.segments.map((label, i) => ({
      id: `s${i + 1}`, label, startSec: i * Math.floor(spec.durationSec / 3),
      hintZh: i === 0 ? tpl.watchFor : '抓一个能复述的细节，不必记完整台词。',
    })),
    seedExpressions: expressions.map(([en, zh], i) =>
      quote(en, zh, `原创示例 · ${TOPIC_LABELS[spec.topic].label}场景下的可模仿短句`, `示例 0${i + 1}`)),
    seedThemes: themes.map((theme, i) => ({
      theme,
      briefZh: i === 0
        ? `${theme}：这是该主题下常见的一种表达习惯，属于具体场景观察，不宜概括成整体文化特征。`
        : `${theme}：留意语言怎样把判断说得可商量，而非替一群人下结论。`,
      watchFor: tpl.watchFor,
    })),
    seedQuestions: [...tpl.questions],
    custom: false,

    /* 三层储量体系扩展字段 */
    source: spec.source,
    videoId: spec.videoId,
    playlistId: spec.playlistId,
    topic: spec.topic,
    culturalThemes: [...themes],
    seed: spec.seed ?? true,
    acquiredVia: spec.acquiredVia ?? 'seed',
    officialUrl,
    idStatus,
    titleNote: spec.titleNote
      || 'LinguaBuddy 原创学习卡标题；平台原始标题请以「在新窗口打开原页面」为准。',
    syncedFrom: spec.syncedFrom,
    syncedAt: spec.syncedAt,
  }
  return video
}

/* ---------------------------------------------------------------- *
 * 39 条种子库数据
 * s = source · vid = 已核实的官方 videoId（'' = 仅播放列表）
 * pl = 所属播放列表 · topic = 6 类主题 · cefr · dur = 秒 · emb = 可嵌入
 * ex = 3 组原创短引用 · th = 2 个原创文化主题
 * ---------------------------------------------------------------- */

/** 种子行（短键，便于逐条核对真实 ID）；下面统一映射到 VideoCardSpec */
interface Row {
  id: string
  s: CultureSource
  vid: string
  pl?: string
  t: string
  tz: string
  topic: CultureTheme
  cefr: CefrLevel
  dur: number
  emb: boolean
  ex?: [string, string][]
  th?: [string, string]
  titleNote?: string
}

const P = {
  lle1: 'PLd9hCvj34W5it4a-RMzhlwNJ-edf5HU3Q',
  lle2: 'PLd9hCvj34W5hWkRym8sljiEvEBJ1JGIu5',
  anna: 'PLd9hCvj34W5gfXecA2uPRsKv9q5L5nQng',
  eim: 'PLd9hCvj34W5hJZwjdghwQQi3XhpSZO9sx',
  grammar: 'PLd9hCvj34W5hIJ855osxqJ-fjgsmNB69n',
  word: 'PLd9hCvj34W5hPQ6hwu3X8foaf9tfq2L9j',
  talk2us: 'PLd9hCvj34W5jekhcE7BPlwkEqFiLrS_Wk',
  parks: 'PLd9hCvj34W5i4HBJAVHrMhtnPfATt73Oe',
  presidents: 'PLd9hCvj34W5hYSlv0Wxsuy4aqFJ2kq-qG',
  ushistory: 'PLd9hCvj34W5iBQaAPQ65o0Y4zd_nr0CBp',
  news: 'PLd9hCvj34W5gmAliTbPvJxZhAAzitreqp',
  newslit: 'PLd9hCvj34W5hHemY3weG4Py2oGRW-pkwb',
  pronounce: 'PLd9hCvj34W5gxnTUV-wHERehpInsTJgq7',
  route66: 'PLd9hCvj34W5j3mItIc6jVvlfpv169eeNR',
  podcast: 'PLd9hCvj34W5hZxGsu5etKF6bZ9w4Ap2hl',
  behind: 'PLd9hCvj34W5j05aIwhou83keajlWPIbJq',
  shorts: 'PLd9hCvj34W5hhwtDPv4hDN5UjERTj7oax',
  poem: 'PLJicmE8fK0Egxi0hgy5Tw-NFyLcpJ4bzJ',
  myths: 'PLJicmE8fK0EjW2AVwcSc4NvGyJJaw7bzh',
  coder: 'PLJicmE8fK0EgogMqDYMgcADT1j5b911or',
  bcSpeak: 'PLm7J5yZ2yc3nGd7QOvSC-7wCVR1iD5L8r',
  bcInterview: 'PLm7J5yZ2yc3neq-MGLMNHoxS0odMaCG4F',
  bcLife: 'PLm7J5yZ2yc3kBAeiMR-fts111lWIRbPbs',
  bcShakespeare: 'PLm7J5yZ2yc3ksm8YquBP82ZydteQGCzdM',
  bcPodcast: 'PLm7J5yZ2yc3ks6YIA4cizKkMXN-Q6DPKH',
} as const

const ROWS: Row[] = [
  // ---------- VOA Learning English（21 条，公共领域压舱石） ----------
  { id: 'voa-lle1', s: 'voa', vid: 'M8kGGThGdJE', pl: P.lle1, t: "Let's Learn English Level 1 · 课程片段", tz: '初级英语 · 见面与介绍', topic: 'daily-life', cefr: 'A2', dur: 360, emb: true,
    ex: [['Nice to meet you', '很高兴认识你'], ['Where are you from?', '你从哪里来'], ['See you tomorrow', '明天见']], th: ['问候与自我介绍', '把句子说短'] },
  { id: 'voa-lle2', s: 'voa', vid: 'mnmGvdVcQ-0', pl: P.lle2, t: "Let's Learn English Level 2 · 会话片段", tz: '进阶日常 · 计划与约定', topic: 'daily-life', cefr: 'B1', dur: 420, emb: true,
    ex: [['Are you free on Friday?', '你周五有空吗'], ['That works for me', '我这边可以'], ['Let me check my schedule', '我看一下日程']], th: ['约定时间的措辞', '留出商量余地'] },
  { id: 'voa-anna', s: 'voa', vid: 'Z2iXr8On3LI', pl: P.anna, t: "Let's Learn English with Anna · 日常片段", tz: '跟着 Anna 学日常对话', topic: 'daily-life', cefr: 'A2', dur: 300, emb: true,
    ex: [['I am looking for ...', '我在找……'], ['Could you say that again?', '能再说一遍吗'], ['That is very kind of you', '你真是太好了']], th: ['求助与澄清', '礼貌请求的短句'] },
  { id: 'voa-eim-head', s: 'voa', vid: 'B21JO6v2E_M', pl: P.eim, t: 'English in a Minute · Head and Shoulders Above', tz: '一分钟习语 · 明显更好', topic: 'daily-life', cefr: 'B1', dur: 90, emb: true,
    ex: [['head and shoulders above', '明显优于、高出一大截'], ['way too expensive', '太贵了'], ['the best pizza in town', '城里最好吃的披萨']], th: ['习语来自身体意象', '比较时的夸张与克制'] },
  { id: 'voa-eim-corner', s: 'voa', vid: 'fNk6ZFK8NsI', pl: P.eim, t: 'English in a Minute · Around the Corner', tz: '一分钟习语 · 即将到来', topic: 'festivals', cefr: 'B1', dur: 90, emb: true,
    ex: [['just around the corner', '近在眼前、快到了'], ['Not much time to plan', '没多少时间准备了'], ['New Year is coming', '新年要到了']], th: ['节庆前的时间表达', '把期待说得具体'] },
  { id: 'voa-eim-fair', s: 'voa', vid: 'P_QtdNMFEx0', pl: P.eim, t: 'English in a Minute · Fair and Square', tz: '一分钟习语 · 堂堂正正', topic: 'daily-life', cefr: 'B1', dur: 90, emb: true,
    ex: [['fair and square', '公平正当、毫无争议'], ['I won them fair and square', '我赢得光明正大'], ['Did you cheat?', '你作弊了吗']], th: ['押韵习语', '日常争论里的分寸'] },
  { id: 'voa-eim-series', s: 'voa', vid: 'J8EWSLZ36s0', pl: P.eim, t: 'English in a Minute · 系列片段', tz: '一分钟习语 · 合集', topic: 'daily-life', cefr: 'B1', dur: 120, emb: true,
    ex: [['And that is English in a Minute', '以上就是本期一分钟英语'], ['What does it mean?', '这是什么意思'], ['It rhymes', '它押韵']], th: ['短讲解的收束方式', '用例子解释习语'] },
  { id: 'voa-grammar', s: 'voa', vid: 'vyPofYmxIJA', pl: P.grammar, t: 'Everyday Grammar · 片段', tz: '日常语法 · 说得清楚', topic: 'work-social', cefr: 'B1', dur: 240, emb: true,
    ex: [['I have been working on ...', '我一直在做……'], ['Could we go over that?', '我们能过一遍吗'], ['That is a fair point', '这个说法有道理']], th: ['工作场合的时态选择', '把语法讲成场景'] },
  { id: 'voa-word', s: 'voa', vid: '4wpsRC6r2dE', pl: P.word, t: 'Word of the Day · 片段', tz: '每日一词 · 慢速讲解', topic: 'daily-life', cefr: 'A2', dur: 120, emb: true,
    ex: [['Today’s word is ...', '今天的词是……'], ['It means ...', '它的意思是……'], ['Can you use it in a sentence?', '能用它造个句吗']], th: ['词语讲解的固定框架', '一词一例的学习法'] },
  { id: 'voa-talk2us', s: 'voa', vid: '5cO5bcjmHII', pl: P.talk2us, t: 'TALK2US · English Conversation', tz: '会话示范 · 你来我往', topic: 'work-social', cefr: 'B1', dur: 300, emb: true,
    ex: [['What do you think?', '你怎么看'], ['I see what you mean, but ...', '我明白你的意思，不过……'], ['Let us move on to ...', '我们接着聊……']], th: ['轮流发言的信号词', '先回应再补充'] },
  { id: 'voa-parks', s: 'voa', vid: 'E-ZmaMjzJzE', pl: P.parks, t: "America's National Parks · 片段", tz: '国家公园 · 自然解说', topic: 'science-nature', cefr: 'B2', dur: 420, emb: true,
    ex: [['It covers more than ...', '它占地超过……'], ['Visitors come to see ...', '游客来看……'], ['The park was established in ...', '公园建于……']], th: ['自然解说的数量表达', '公共空间与集体记忆'] },
  { id: 'voa-presidents', s: 'voa', vid: 'CEPUTL09Itk', pl: P.presidents, t: "America's Presidents · 片段", tz: '总统系列 · 人物与年代', topic: 'history-landmarks', cefr: 'B2', dur: 360, emb: true,
    ex: [['He served from ... to ...', '他的任期从……到……'], ['It dates back to ...', '它可以追溯到……'], ['is remembered for ...', '因……而被记住']], th: ['人物介绍的时间线', '把评价挂在事实上'] },
  { id: 'voa-ushistory', s: 'voa', vid: 'vrcdZRIL3lY', pl: P.ushistory, t: 'US History · 片段', tz: '美国历史 · 慢速讲解', topic: 'history-landmarks', cefr: 'B2', dur: 420, emb: true,
    ex: [['At that time, ...', '在那时……'], ['As a result, ...', '结果是……'], ['Historians disagree about ...', '历史学家对……有分歧']], th: ['历史叙述的因果链', '保留分歧的说法'] },
  { id: 'voa-news', s: 'voa', vid: 'YhoGY9pkXWU', pl: P.news, t: 'Learning English News · 片段', tz: '慢速新闻 · 抓主旨', topic: 'work-social', cefr: 'B2', dur: 360, emb: true,
    ex: [['According to the report, ...', '据报道……'], ['Officials said ...', '官员表示……'], ['We will have more on this story', '我们将继续关注']], th: ['新闻里的转述动词', '把来源说清楚'] },
  { id: 'voa-newslit', s: 'voa', vid: '36l0ff0FGXg', pl: P.newslit, t: 'News Literacy · 片段', tz: '媒体素养 · 核对来源', topic: 'arts-media', cefr: 'B2', dur: 300, emb: true,
    ex: [['Where did this come from?', '这消息从哪来的'], ['Check the original source', '核对原始来源'], ['It is not yet clear whether ...', '目前还不清楚是否……']], th: ['来源辨识', '把不确定性说清楚'] },
  { id: 'voa-pronounce', s: 'voa', vid: 'oSEhAg_ZBQ0', pl: P.pronounce, t: 'How to Pronounce · 片段', tz: '发音示范 · 听清再模仿', topic: 'daily-life', cefr: 'A2', dur: 180, emb: true,
    ex: [['Listen and repeat', '听并跟读'], ['Put the stress on ...', '重音放在……'], ['Say it slowly first', '先慢慢说']], th: ['重音与节奏', '把模仿拆成小步'] },
  { id: 'voa-route66', s: 'voa', vid: 'jqfolCH1RyI', pl: P.route66, t: 'Learning English on U.S. Route 66', tz: '公路旅行 · 地标与故事', topic: 'history-landmarks', cefr: 'B1', dur: 420, emb: true,
    ex: [['We stopped at ...', '我们在……停了一下'], ['The road was built in ...', '这条路建于……'], ['It is still used today', '它今天仍在使用']], th: ['公路与地标', '旅行叙述的顺序'] },
  { id: 'voa-podcast', s: 'voa', vid: 'DL_wfKddoLs', pl: P.podcast, t: 'Learning English Podcast · 片段', tz: '播客片段 · 科学话题', topic: 'science-nature', cefr: 'B2', dur: 600, emb: true,
    ex: [['One reason is that ...', '一个原因是……'], ['Researchers found ...', '研究者发现……'], ['Let us look at the numbers', '我们来看数据']], th: ['科普里的因果链', '数字与证据'] },
  { id: 'voa-behind', s: 'voa', vid: 'xZSslAyawSI', pl: P.behind, t: 'Learning English Behind the Scenes', tz: '幕后花絮 · 节目怎么做的', topic: 'arts-media', cefr: 'B1', dur: 300, emb: true,
    ex: [['Behind the scenes, ...', '在幕后……'], ['We start with a script', '我们从稿子开始'], ['Then we record it', '然后录下来']], th: ['媒体制作流程', '顺序连接词'] },
  { id: 'voa-shorts', s: 'voa', vid: 'jW_45CLb0qo', pl: P.shorts, t: 'VOA Learning English Shorts · 片段', tz: '短片 · 节庆与日常', topic: 'festivals', cefr: 'A2', dur: 90, emb: true,
    ex: [['Happy holidays!', '节日快乐'], ['What are you celebrating?', '你们在庆祝什么'], ['It is a bit of a tradition', '这算是个小传统']], th: ['节庆问候', '把习俗说得轻松'] },
  { id: 'voa-tv-news', s: 'voa', vid: '2aTZSWfMYMg', pl: P.news, t: 'Learning English TV · 科学与教育新闻', tz: '电视新闻 · 自然与科技', topic: 'science-nature', cefr: 'B2', dur: 900, emb: true,
    ex: [['The species is at risk', '这个物种面临风险'], ['AI tools are being used in schools', '学校正在使用 AI 工具'], ['The report looks at ...', '报道关注……']], th: ['环境与科技新闻', '把现象与原因分开'] },

  // ---------- TED-Ed（9 条，CC BY-NC-ND 4.0） ----------
  { id: 'ted-ed-pandora', s: 'ted-ed', vid: 'ZEE-a0r-lXo', pl: P.myths, t: 'TED-Ed · The myth of Pandora’s box', tz: '神话与习俗 · 潘多拉', topic: 'festivals', cefr: 'B2', dur: 300, emb: true,
    ex: [['The myth explains ...', '这个神话解释了……'], ['What was left inside?', '里面还留下了什么'], ['It is a story about curiosity', '这是个关于好奇心的故事']], th: ['神话如何解释习俗', '故事里的因果'] },
  { id: 'ted-ed-norse', s: 'ted-ed', vid: 'Qytj-DbXMKQ', pl: P.myths, t: 'TED-Ed · A Norse myth', tz: '北欧神话 · 口头传统', topic: 'festivals', cefr: 'B2', dur: 300, emb: true,
    ex: [['According to the legend, ...', '传说中……'], ['The story has many versions', '故事有很多版本'], ['It was passed down orally', '它是口头传下来的']], th: ['口头传统与版本差异', '转述而非断言'] },
  { id: 'ted-ed-zodiac', s: 'ted-ed', vid: 'may2s9j4RLk', pl: P.myths, t: 'TED-Ed · The Chinese zodiac', tz: '十二生肖 · 身份与节庆', topic: 'festivals', cefr: 'B2', dur: 300, emb: true,
    ex: [['Each year is linked to an animal', '每年对应一种动物'], ['The order varies across cultures', '不同文化里顺序不同'], ['It is part of the New Year', '它是新年的一部分']], th: ['节庆与身份符号', '避免以偏概全'] },
  { id: 'ted-ed-isis', s: 'ted-ed', vid: '1yv_MXNYbAo', pl: P.myths, t: 'TED-Ed · The legend of Isis', tz: '古埃及神话 · 文化符号', topic: 'history-landmarks', cefr: 'B2', dur: 300, emb: true,
    ex: [['The story comes from ...', '故事源自……'], ['It dates back to ...', '它可以追溯到……'], ['Symbols can be read in many ways', '符号可以有多种读法']], th: ['神话与历史符号', '多种解释并存'] },
  { id: 'ted-ed-cambodia', s: 'ted-ed', vid: 'Ul9ysDvkuLA', pl: P.myths, t: 'TED-Ed · A Cambodian folktale', tz: '柬埔寨民间故事', topic: 'festivals', cefr: 'B2', dur: 300, emb: true,
    ex: [['In one version of the tale, ...', '在这个故事的一个版本里……'], ['The moral is not stated directly', '寓意没有直说'], ['It is told during ...', '它在……时候被讲述']], th: ['民间故事与讲述场合', '寓意留给听众'] },
  { id: 'ted-ed-irish', s: 'ted-ed', vid: 'aQbyVYUob1o', pl: P.myths, t: 'TED-Ed · An Irish legend', tz: '爱尔兰传说', topic: 'festivals', cefr: 'B2', dur: 300, emb: true,
    ex: [['The legend begins with ...', '传说以……开始'], ['It survives in oral tradition', '它在口头传统里留存'], ['There is more than one ending', '结局不止一个']], th: ['地方传说与身份', '版本意识'] },
  { id: 'ted-ed-catherine', s: 'ted-ed', vid: 'uJ_d-UD0xPE', t: 'TED-Ed · History vs. Catherine the Great', tz: '历史人物 · 两种评价', topic: 'history-landmarks', cefr: 'C1', dur: 330, emb: true,
    ex: [['Was she a reformer or ...?', '她是改革者还是……'], ['The evidence is mixed', '证据并不一致'], ['It depends on whose account', '这取决于谁的记述']], th: ['历史评价的多视角', '把判断挂在证据上'] },
  { id: 'ted-ed-poem', s: 'ted-ed', vid: '', pl: P.poem, t: "TED-Ed · There's a Poem for That（播放列表）", tz: '诗歌合集 · 待同步到单条视频', topic: 'arts-media', cefr: 'C1', dur: 300, emb: false,
    ex: [['I noticed ...', '我注意到……'], ['It made me wonder ...', '这让我想到……'], ['Another way to read it is ...', '另一种理解是……']], th: ['诗歌里的观察与解释', '保留另一种读法'],
    titleNote: '该条目只固定到官方播放列表，尚未获得可验证的单条 videoId；同步 playlistItems.list 后自动补全。' },
  { id: 'ted-ed-coder', s: 'ted-ed', vid: '', pl: P.coder, t: 'TED-Ed · Think Like A Coder（播放列表）', tz: '科普动画 · 待同步到单条视频', topic: 'science-nature', cefr: 'B2', dur: 420, emb: false,
    ex: [['One reason is that ...', '一个原因是……'], ['As a result, ...', '结果是……'], ['Let us test the idea', '我们来验证一下']], th: ['把问题拆成小步', '科学解释的因果链'],
    titleNote: '该条目只固定到官方播放列表，尚未获得可验证的单条 videoId；同步 playlistItems.list 后自动补全。' },

  // ---------- British Council（5 条，嵌入权限待逐条确认 → 全部外链降级） ----------
  { id: 'bc-speaking', s: 'british-council', vid: 'f0mNQyzTzX8', pl: P.bcSpeak, t: 'British Council · What to say（口语练习）', tz: 'B2 口语 · 该说什么', topic: 'work-social', cefr: 'B2', dur: 300, emb: false,
    ex: [['Could you tell me a bit more?', '能再多说一点吗'], ['I am not sure I follow', '我不太跟得上'], ['That is an interesting way to put it', '这个说法挺有意思']], th: ['口音多样性', '会话里的澄清请求'] },
  { id: 'bc-interview', s: 'british-council', vid: 'GszPDWy3o0s', pl: P.bcInterview, t: 'British Council · Job interview', tz: 'B2 面试 · 表达经历', topic: 'work-social', cefr: 'B2', dur: 360, emb: false,
    ex: [['I was responsible for ...', '我当时负责……'], ['One example would be ...', '一个例子是……'], ['I learned a lot from that', '我从中学到很多']], th: ['面试里的举例结构', '把成果说得具体'] },
  { id: 'bc-life', s: 'british-council', vid: 'B2y6KRLk86c', pl: P.bcLife, t: 'British Council · English for Life', tz: 'B1 生活场景 · 习语理解', topic: 'work-social', cefr: 'B1', dur: 300, emb: false,
    ex: [['It is not my cup of tea', '这不是我的菜'], ['I will give it a go', '我试一试'], ['That sounds like a plan', '听起来可行']], th: ['习语与语境', '礼貌地表达偏好'] },
  { id: 'bc-shakespeare', s: 'british-council', vid: 'gqqkn7gRNkE', pl: P.bcShakespeare, t: 'British Council · Shakespeare short film', tz: 'C1 文学影像 · 莎剧片段', topic: 'arts-media', cefr: 'C1', dur: 420, emb: false,
    ex: [['All the world’s a stage', '全世界是个舞台'], ['How do you read that line?', '你怎么理解这句台词'], ['The performance changes the meaning', '演绎改变了含义']], th: ['经典文本的当代演绎', '观察与解释分开'] },
  { id: 'bc-podcast', s: 'british-council', vid: 'bxy5MPIwPdc', pl: P.bcPodcast, t: 'British Council · English Podcast（科学话题）', tz: 'C1 播客 · 科学与自然', topic: 'science-nature', cefr: 'C1', dur: 1200, emb: false,
    ex: [['The findings suggest ...', '研究结果表明……'], ['It is worth noting that ...', '值得注意的是……'], ['We cannot say for certain', '我们还不能确定']], th: ['学术口语的谨慎措辞', '证据与推断的区别'] },

  // ---------- Pexels / Pixabay（4 条，原创教学占位，不托管任何视频文件） ----------
  { id: 'pexels-market', s: 'pexels', vid: '', t: 'A morning market walk（Mock 原创占位）', tz: '清晨市集 · 原创占位', topic: 'daily-life', cefr: 'A2', dur: 120, emb: false,
    ex: [['How much is this?', '这个多少钱'], ['Could I have a bag, please?', '能给我个袋子吗'], ['I am just looking, thanks', '我先看看，谢谢']], th: ['市集里的简短交易用语', '把请求说得轻一点'] },
  { id: 'pexels-parade', s: 'pexels', vid: '', t: 'A street parade afternoon（Mock 原创占位）', tz: '街头游行 · 原创占位', topic: 'festivals', cefr: 'B1', dur: 120, emb: false,
    ex: [['It is a bit of a tradition around here', '这算是这儿的一个小传统'], ['Everyone joins in', '大家都会参与'], ['Help yourself to some tea', '茶请自便']], th: ['社区节庆的参与感', '把习俗说成小传统'] },
  { id: 'pixabay-campus', s: 'pixabay', vid: '', t: 'An old campus courtyard（Mock 原创占位）', tz: '老校园 · 原创占位', topic: 'history-landmarks', cefr: 'B2', dur: 120, emb: false,
    ex: [['It dates back to ...', '它可以追溯到……'], ['The building was originally used for ...', '这栋楼最初用于……'], ['It is still in use today', '它今天仍在使用']], th: ['建筑与时间线', '用途的变化'] },
  { id: 'pixabay-nature', s: 'pixabay', vid: '', t: 'A rainy forest floor（Mock 原创占位）', tz: '雨林地表 · 原创占位', topic: 'science-nature', cefr: 'B1', dur: 120, emb: false,
    ex: [['As a result, ...', '结果是……'], ['One reason is that ...', '一个原因是……'], ['It is not yet clear whether ...', '目前还不清楚是否……']], th: ['观察自然现象', '解释里的不确定性'] },

  // ---------- [储量补强 6 条] 全部只固定到已验证官方播放列表，videoId 显式留空 ----------
  // 铁律：没有可验证的单条 ID 就绝不编造 11 位字符；同步 playlistItems.list 后再补全。
  // VOA 4 条（公有领域 · 压舱石占比 26/50=52%）+ TED-Ed 2 条（补最薄的 arts-media 4→6）。
  { id: 'voa-science-extra', s: 'voa', vid: '', pl: P.podcast, t: 'Learning English Podcast · 科学话题合集', tz: '播客合集 · 科学解释', topic: 'science-nature', cefr: 'B2', dur: 600, emb: false,
    ex: [['One explanation is that ...', '一种解释是……'], ['The evidence points to ...', '证据指向……'], ['We should be careful about ...', '我们对……要谨慎']], th: ['科学解释的因果链', '证据与推断的区别'],
    titleNote: '只固定到 VOA 官方播客播放列表，尚未获得可验证的单条 videoId；同步后自动补全。' },
  { id: 'voa-nature-extra', s: 'voa', vid: '', pl: P.parks, t: "America's National Parks · 自然解说合集", tz: '国家公园 · 自然词汇', topic: 'science-nature', cefr: 'B2', dur: 480, emb: false,
    ex: [['It is home to ...', '这里是……的栖息地'], ['The landscape changes as ...', '地貌随……变化'], ['What struck me was ...', '让我印象深刻的是……']], th: ['自然景观的具体描述', '把观察与评价分开'],
    titleNote: '只固定到 VOA 官方国家公园播放列表，尚未获得可验证的单条 videoId；同步后自动补全。' },
  { id: 'voa-history-extra', s: 'voa', vid: '', pl: P.ushistory, t: 'US History · 慢速历史合集', tz: '历史讲解 · 人物与年代', topic: 'history-landmarks', cefr: 'B2', dur: 480, emb: false,
    ex: [['It dates back to ...', '这可以追溯到……'], ['At the time, ...', '当时……'], ['Looking back, ...', '回头看……']], th: ['时间线的表达', '历史评价的留有余地'],
    titleNote: '只固定到 VOA 官方历史播放列表，尚未获得可验证的单条 videoId；同步后自动补全。' },
  { id: 'voa-news-extra', s: 'voa', vid: '', pl: P.news, t: 'Learning English News · 慢速新闻合集', tz: '慢速新闻 · 职场与社会', topic: 'work-social', cefr: 'B2', dur: 420, emb: false,
    ex: [['According to the report, ...', '据报告……'], ['The plan is expected to ...', '该计划预计会……'], ['Critics argue that ...', '批评者认为……']], th: ['转述与归因', '平衡对立观点'],
    titleNote: '只固定到 VOA 官方新闻播放列表，尚未获得可验证的单条 videoId；同步后自动补全。' },
  { id: 'ted-ed-art-extra', s: 'ted-ed', vid: '', pl: P.poem, t: 'TED-Ed · 诗歌与文学赏析合集', tz: '文学赏析 · 意象与读法', topic: 'arts-media', cefr: 'C1', dur: 360, emb: false,
    ex: [['The image suggests ...', '这个意象暗示……'], ['Another reading is ...', '另一种解读是……'], ['What stays with me is ...', '让我挥之不去的是……']], th: ['文学意象的解读', '保留另一种读法'],
    titleNote: '只固定到 TED-Ed 官方诗歌播放列表，尚未获得可验证的单条 videoId；同步后自动补全。' },
  { id: 'ted-ed-media-extra', s: 'ted-ed', vid: '', pl: P.myths, t: 'TED-Ed · 神话与当代媒体合集', tz: '神话改写 · 媒体素养', topic: 'arts-media', cefr: 'B2', dur: 360, emb: false,
    ex: [['The story was retold as ...', '这个故事被改写为……'], ['In the original version, ...', '在原版里……'], ['It raises the question of ...', '这引出了……的问题']], th: ['经典叙事的当代改写', '比较不同版本'],
    titleNote: '只固定到 TED-Ed 官方神话播放列表，尚未获得可验证的单条 videoId；同步后自动补全。' },
]

/** 45 条结构化种子条目：全部 seed:true / acquiredVia:'seed' */
export const EXPANDED_SEED_VIDEOS: LibraryVideoEntry[] = ROWS.map((r) => makeCultureVideo({
  id: r.id,
  source: r.s,
  videoId: r.vid,
  playlistId: r.pl,
  title: r.t,
  titleZh: r.tz,
  topic: r.topic,
  cefr: r.cefr,
  durationSec: r.dur,
  embeddable: r.emb,
  ex: r.ex,
  th: r.th,
  titleNote: r.titleNote,
  seed: true,
  acquiredVia: 'seed',
}))

/** 旧 5 条手配条目补扩展元数据（不改原对象，纯函数） */
export function withLegacyLibraryMeta(video: CultureVideo): LibraryVideoEntry {
  const source: CultureSource = video.platform === 'ted' ? 'ted'
    : video.platform === 'voa' ? 'voa'
      : video.platform === 'pexels' ? 'pexels'
        : video.platform === 'pixabay' ? 'pixabay'
          : video.platform === 'youtube' ? 'voa' : 'ted'
  const idStatus: VideoIdStatus = video.embedId ? 'verified' : 'playlist-only'
  return {
    ...video,
    source,
    videoId: video.embedId || '',
    topic: video.theme,
    culturalThemes: (video.seedThemes || []).map((t) => t.theme),
    seed: true,
    acquiredVia: 'seed',
    officialUrl: video.watchUrl,
    idStatus,
    titleNote: '旧版内置条目 · 保留原有许可说明与署名',
  } as LibraryVideoEntry
}

export const EXPANDED_SEED_COUNT = EXPANDED_SEED_VIDEOS.length
export const EXPANDED_SEED_TOPICS = Object.keys(TOPIC_LABELS) as CultureTheme[]
