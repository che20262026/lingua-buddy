/* ================================================================
 * 「文化视角视频」预配置视频库 + 本地索引（CultureCuratorAgent 的数据源）
 *
 * ================= 合规硬约束（最高优先级）================
 * 只嵌入，不下载，不转存：
 *   - 库里只有「视频 ID / slug」与「原页面 URL」，没有任何
 *     videoBlob / mp4 / m3u8 / streamUrl / playbackUrl 字段；
 *   - 播放一律交给平台「官方嵌入播放器」：TED 用 embed.ted.com，
 *     YouTube 用 youtube-nocookie.com/embed（IFrame Player API 同域）；
 *   - 不覆盖广告、不遮挡播放器控件、视口 ≥ 200×200；
 *   - 不支持嵌入 / 所有者禁用嵌入 → 降级为「在新窗口打开原页面」，
 *     并在 UI 明确标注「此视频需在原平台观看」，绝不伪装成可播放。
 *
 * 内容源白名单（见 PLATFORM_POLICIES）：
 *   第一优先级 开放许可：TED/TED-Ed（CC BY-NC-ND 4.0，保留署名）、
 *                        Pexels / Pixabay 免费视频、明确 CC / 公有领域教育视频
 *   第二优先级 官方嵌入：YouTube（IFrame Player API）、VOA Learning English
 *   明确排除：BBC（许可限制，不嵌入；本库不收录）、版权不明来源、
 *             用户上传的影视切片、未授权转载、需破解播放地址的内容
 *
 * 字幕与转写：
 *   - 不使用 captions.download（配额 200 单位且需编辑权限）；
 *   - 不在应用内重新渲染受版权保护的完整字幕；只用播放器自带 CC；
 *   - 应用内仅展示「单句 / 短语级短引用」，标注来源与大致时间段；
 *   - Mock 模式全部为原创示例注释，不内置任何第三方字幕全文。
 *
 * 配额与成本：
 *   - 预配置播放列表 + 本地索引，客户端只做筛选与展示；
 *   - 不调用 search.list，不做实时搜索，不暴露任何 API Key。
 * ================================================================ */

import type {
  CaptionPreference, CultureLibraryState, CultureNotesState, CultureTheme,
  CultureVideo, KeyExpression, PlatformPolicy, PostWatchState, VideoPlatform,
  WatchProgressState,
} from '../cultureTypes'
/** [修改点] 三层储量体系：39 条结构化种子库 + 旧条目元数据补齐 */
import {
  EXPANDED_SEED_VIDEOS, withLegacyLibraryMeta,
} from './cultureSeedExpanded'
import { CULTURE_LIBRARY_SEED_VERSION } from './playlistRegistrySeed'

/** [修改点] 2 = 视频库已并入 30+ 条结构化种子库；旧存档由迁移补齐 */
export const CULTURE_SEED_VERSION = CULTURE_LIBRARY_SEED_VERSION

/** 六个主题分类的中文标签（首页筛选维度） */
export const THEME_LABELS: Record<CultureTheme, { label: string; emblem: string; hint: string }> = {
  'daily-life': { label: '日常生活', emblem: '☕', hint: '问候、购物、作息与小习惯' },
  festivals: { label: '节日与习俗', emblem: '🎊', hint: '节庆、聚会与待客礼节' },
  'work-social': { label: '工作与社交', emblem: '🤝', hint: '会议、演讲、寒暄与表达' },
  'history-landmarks': { label: '历史与地标', emblem: '🏛️', hint: '城市、建筑与集体记忆' },
  'science-nature': { label: '科学与自然', emblem: '🌿', hint: '自然、科技与科学解释' },
  'arts-media': { label: '艺术与媒体', emblem: '🎨', hint: '文学、影像与媒体素养' },
}

/* ---------------------------------------------------------------- *
 * 平台白名单策略表 —— 唯一的准入来源
 * ---------------------------------------------------------------- */

export const PLATFORM_POLICIES: Record<VideoPlatform, PlatformPolicy> = {
  ted: {
    id: 'ted', label: 'TED / TED-Ed', tier: 'open-license',
    license: 'CC BY-NC-ND 4.0（非商用、不衍生、保留署名）',
    attribution: '需保留演讲者、TED 来源与原页面链接',
    allowedHosts: ['embed.ted.com'],
    note: 'TED 官方 embed.ted.com 嵌入播放器；TED 官方字幕由播放器自带 CC 提供。',
  },
  pexels: {
    id: 'pexels', label: 'Pexels 免费视频', tier: 'open-license',
    license: 'Pexels License（免费使用，无需署名）',
    attribution: '部分素材无需署名；本库条目为原创示例占位，不托管任何视频文件',
    allowedHosts: ['www.pexels.com'],
    note: '免费素材；本库用「纯占位状态」呈现，不下载、不重新托管视频文件。',
  },
  pixabay: {
    id: 'pixabay', label: 'Pixabay 免费视频', tier: 'open-license',
    license: 'Pixabay Content License（免费使用）',
    attribution: '无需署名；本库不内置任何第三方视频文件',
    allowedHosts: ['pixabay.com'],
    note: '免费素材；本库用「纯占位状态」呈现，不下载、不重新托管视频文件。',
  },
  cc: {
    id: 'cc', label: 'CC / 公有领域教育视频', tier: 'open-license',
    license: '明确标注 Creative Commons 或 Public Domain',
    attribution: '按素材自身许可保留署名',
    allowedHosts: [],
    note: '仅在许可状态可确认时收录；无官方嵌入域名时一律降级为链接到原页面。',
  },
  youtube: {
    id: 'youtube', label: 'YouTube', tier: 'official-embed',
    license: '遵守 YouTube API Services Terms 与 Developer Policies',
    attribution: '保留原频道署名；不向观看用户收费；通过 HTTP Referer 提供客户端身份',
    allowedHosts: ['www.youtube-nocookie.com', 'www.youtube.com'],
    note: '仅通过 YouTube IFrame Player API / 官方 embed 播放；视口 ≥ 200×200；不遮挡控件与广告。',
  },
  voa: {
    id: 'voa', label: 'VOA Learning English', tier: 'official-embed',
    license: '嵌入视为链接行为，不存储副本；谨慎避免转载可能侵权的内容',
    attribution: '保留 VOA Learning English 来源与原页面链接',
    allowedHosts: [],
    note: '部分内容不允许嵌入；本库相关条目降级为「在新窗口打开原页面」。',
  },
}

/** 明确排除、绝不允许构造 iframe 的来源（用于守门函数与冒烟断言） */
export const EXCLUDED_SOURCES = [
  'bbc', 'bbc.co.uk', 'bbc.com', 'bbc learning english',
  'bilibili', 'youku', 'iqiyi', 'netflix', 'disney', 'hbo',
] as const

/** 书架页顶部展示的版权与来源说明 */
export const CULTURE_SOURCE_NOTICE =
  '本模块只收录明确开放许可或提供官方嵌入播放器的视频来源：TED / TED-Ed（CC BY-NC-ND 4.0，保留署名）、Pexels / Pixabay 免费素材、明确 CC / 公有领域教育视频、YouTube 官方嵌入、VOA Learning English。视频只通过平台官方播放器播放，不下载、不转存、不抓取视频流，也不复制完整字幕脚本；应用内只展示带来源与时间戳的短引用。BBC 等许可限制来源、版权不明内容与影视切片一律不收录。'

/** 短引用声明：所有 keyExpressions 都是原创示例注释，不是视频字幕抄录 */
export const SHORT_QUOTE_NOTE =
  '原创示例短引用 · 非视频字幕抄录 · 不展示完整字幕脚本'

/* ---------------------------------------------------------------- *
 * 5 个预配置条目（3 个官方嵌入 + 1 个 Mock 占位 + 1 个链接降级）
 * ---------------------------------------------------------------- */

/** 构造短引用，统一挂上「非字幕」来源标注 */
function quote(expression: string, meaningZh: string, context: string, timestampHint: string): KeyExpression {
  return { expression, meaningZh, context, timestampHint, sourceNote: SHORT_QUOTE_NOTE }
}

const TED_ATTRIBUTION = 'TED Talks（CC BY-NC-ND 4.0）· 保留演讲者署名与原页面链接'
const TED_LICENSE = 'TED / TED-Ed 内容依 CC BY-NC-ND 4.0 提供：非商用、不衍生、保留署名。经官方 embed.ted.com 播放器嵌入，不下载、不转存、不修改。'

/** 1. TED：日常习惯（已验证官方 embed 200） */
const VIDEO_TED_30DAYS: CultureVideo = {
  id: 'ted-30-days',
  title: 'Try something new for 30 days',
  titleZh: '用 30 天试一件新事',
  platform: 'ted',
  theme: 'daily-life',
  tags: ['习惯养成', '自我表达', '日常节奏'],
  cefr: 'A2',
  durationSec: 184,
  durationLabel: '03:04',
  embeddable: true,
  embedMode: 'iframe',
  embedId: 'matt_cutts_try_something_new_for_30_days',
  watchUrl: 'https://www.ted.com/talks/matt_cutts_try_something_new_for_30_days',
  attribution: `${TED_ATTRIBUTION} · Matt Cutts`,
  licenseNote: TED_LICENSE,
  summaryZh: '演讲者提出一个很小的自我实验：连续 30 天试一件新事。他用骑行、拍照与写小说举例，说明「可持续的小改变」比宏大的决心更容易留下来。视频节奏慢、句子短，适合入门者抓日常表达。',
  emblem: '🚲',
  coverFrom: 'from-mint-400',
  coverTo: 'to-brand-600',
  blurb: '一段关于「小习惯」的短演讲：语速温和、句子短，最适合做第一次文化视听练习。',
  nativeCaptions: true,
  segments: [
    { id: 's1', label: '开场 · 一个小小的自我实验', startSec: 0, hintZh: '注意他怎么把「大目标」说成「小到能坚持的事」。' },
    { id: 's2', label: '中段 · 30 天里的具体尝试', startSec: 70, hintZh: '留意列举动作时用的连接词与过去式。' },
    { id: 's3', label: '结尾 · 为什么小改变留得下来', startSec: 140, hintZh: '注意他怎样用一句短句收束观点。' },
  ],
  seedExpressions: [
    quote('try something new for 30 days', '连续 30 天试一件新事', '提出整个自我实验时反复出现的核心说法', '00:10–00:40'),
    quote('a small, sustainable change', '一个小而可持续的改变', '对比「宏大决心」与「能坚持的小事」时', '01:30–02:00'),
    quote('I stuck with it', '我坚持下来了', '描述自己最终完成某次尝试时', '02:00–02:35'),
  ],
  seedThemes: [
    { theme: '自我实验与小习惯', briefZh: '英语语境里常把「改变」说成可量化、可复盘的小实验，而不是意志力的较量。', watchFor: '注意他如何把目标缩小到「30 天」这种可数的单位。' },
    { theme: '低调自述', briefZh: '演讲者用很轻的语气讲自己的尝试，避免夸张形容词，这是常见的英语公众表达习惯。', watchFor: '留意他描述成果时有没有用 very / amazing 这类放大词。' },
  ],
  seedQuestions: [
    'What exactly did the speaker do in the first 30 days, and how did he describe it?',
    'Is a "small, sustainable change" convincing to you? Which moment in the video supports your view?',
    'How would this idea be described differently in your own culture?',
  ],
}

/** 2. TED：工作与社交沟通（已验证官方 embed 200） */
const VIDEO_TED_SPEAK: CultureVideo = {
  id: 'ted-speak-listen',
  title: 'How to speak so that people want to listen',
  titleZh: '怎样说话，别人才愿意听',
  platform: 'ted',
  theme: 'work-social',
  tags: ['公共演讲', '会议表达', '语音语调'],
  cefr: 'B1',
  durationSec: 597,
  durationLabel: '09:57',
  embeddable: true,
  embedMode: 'iframe',
  embedId: 'julian_treasure_how_to_speak_so_that_people_want_to_listen',
  watchUrl: 'https://www.ted.com/talks/julian_treasure_how_to_speak_so_that_people_want_to_listen',
  attribution: `${TED_ATTRIBUTION} · Julian Treasure`,
  licenseNote: TED_LICENSE,
  summaryZh: '声音教练从「七种让人不想听的说话方式」讲起，再用 HAIL 四个字母给出可操作的正向建议，并示范语速、音高与停顿如何改变一句话的分量。适合观察英语工作场合的表达分寸。',
  emblem: '🎙️',
  coverFrom: 'from-brand-500',
  coverTo: 'to-coral-500',
  blurb: '一场关于「怎么说」的示范：既有反面清单，也有能立刻模仿的短句与停顿。',
  nativeCaptions: true,
  segments: [
    { id: 's1', label: '开场 · 七种让人不想听的说话方式', startSec: 0, hintZh: '注意列举时的短名词短语，不需要抄下来。' },
    { id: 's2', label: '中段 · HAIL 四个字母', startSec: 280, hintZh: '留意每个字母对应的一个词，以及他如何解释。' },
    { id: 's3', label: '结尾 · 用声音做一次示范', startSec: 490, hintZh: '闭眼听一次停顿与音高的变化，比记台词更重要。' },
  ],
  seedExpressions: [
    quote('speak so that people want to listen', '说得让人愿意听', '标题与开场反复点题的说法', '00:05–00:35'),
    quote('honesty, authenticity, integrity, love', '诚实、真实、一致、善意', '拆解 HAIL 四个字母时的并列结构', '05:10–06:20'),
    quote('a pause can do a lot of work', '停顿能承担很多表达功能', '示范语速与停顿时的一句点评', '08:10–08:50'),
  ],
  seedThemes: [
    { theme: '清单式公共表达', briefZh: '英语讲座常用「先列问题、再给缩写口诀」的结构，便于听众复述；这是体裁习惯，不是英语文化整体特征。', watchFor: '注意 HAIL 这类首字母缩写怎样被用来组织一段话。' },
    { theme: '对「声音」的显性讨论', briefZh: '部分英语职场培训会把音量、语速、停顿当作可训练的技能公开讨论，而非天赋。', watchFor: '留意他现场示范时，观众反应集中在哪些具体的声音变化上。' },
  ],
  seedQuestions: [
    'Which of the "habits to avoid" did the speaker name first, and why do you think he started there?',
    'The speaker demonstrates a pause near the end — what changed in that moment for you as a listener?',
    'Would the same advice about directness work unchanged in your own context? Give a concrete detail from the video.',
  ],
}

/** 3. TED：教育与机构（已验证官方 embed 200） */
const VIDEO_TED_CREATIVITY: CultureVideo = {
  id: 'ted-creativity',
  title: 'Do schools kill creativity?',
  titleZh: '学校会扼杀创造力吗？',
  platform: 'ted',
  theme: 'work-social',
  tags: ['教育观念', '幽默与反讽', '观点表达'],
  cefr: 'B2',
  durationSec: 1164,
  durationLabel: '19:24',
  embeddable: true,
  embedMode: 'iframe',
  embedId: 'sir_ken_robinson_do_schools_kill_creativity',
  watchUrl: 'https://www.ted.com/talks/sir_ken_robinson_do_schools_kill_creativity',
  attribution: `${TED_ATTRIBUTION} · Sir Ken Robinson`,
  licenseNote: TED_LICENSE,
  summaryZh: '演讲者以一连串轻快的轶事讨论学校教育如何排序学科、又如何对待「出错」。他主张创造力需要被当作与读写同等重要的能力来培养。语速较快、带英式幽默，适合进阶学习者练观点复述。',
  emblem: '🎨',
  coverFrom: 'from-sun-400',
  coverTo: 'to-brand-600',
  blurb: '一场英式幽默的观点的演讲：适合进阶者练「复述细节 + 表达同意或保留」。',
  nativeCaptions: true,
  segments: [
    { id: 's1', label: '开场 · 一段关于孩子的轶事', startSec: 0, hintZh: '注意他怎样用一个小故事代替开门见山的论点。' },
    { id: 's2', label: '中段 · 学科排序与「出错」', startSec: 520, hintZh: '留意反讽语气，别只看字面意思。' },
    { id: 's3', label: '结尾 · 把创造力与读写并列', startSec: 980, hintZh: '注意最后一句如何把整场收束成一个主张。' },
  ],
  seedExpressions: [
    quote('do schools kill creativity?', '学校会扼杀创造力吗', '标题式提问，整场围绕它展开', '00:05–00:30'),
    quote('being wrong is not the same as being creative', '出错不等于有创造力', '讨论「犯错」与「创造」关系时的一层区分', '09:40–10:30'),
    quote('we have to rethink ...', '我们得重新想一想……', '提出主张时常用的缓和式开头', '16:30–17:20'),
  ],
  seedThemes: [
    { theme: '以轶事代替宣言', briefZh: '英语公众演讲常用一段具体轶事开场，把主张留给听众自己归纳；这是修辞选择，不宜概括成民族性格。', watchFor: '注意开场几分钟里，他有没有先说「我的观点是……」。' },
    { theme: '反讽与自嘲', briefZh: '英式讲座里常见自嘲式幽默，用以降低说教感；听不懂笑点时不必推断为「不严肃」。', watchFor: '留意观众发笑的位置，以及他是否同时放轻了语气。' },
  ],
  seedQuestions: [
    'What did the child in the opening story actually do, and how did the speaker use that detail?',
    'Where does the speaker draw the line between "being wrong" and "being creative"?',
    'Which single moment in the talk made you agree or hesitate, and why?',
  ],
}

/** 4. Pexels：Mock 原创占位（不托管、不下载任何视频文件） */
const VIDEO_PEXELS_FESTIVAL: CultureVideo = {
  id: 'pexels-festival-placeholder',
  title: 'A neighbourhood festival morning（Mock 占位）',
  titleZh: '社区节日的早晨（Mock 占位）',
  platform: 'pexels',
  theme: 'festivals',
  tags: ['社区聚会', '待客礼节', '节庆用语'],
  cefr: 'B1',
  durationSec: 120,
  durationLabel: '02:00',
  embeddable: false,
  embedMode: 'placeholder',
  watchUrl: 'https://www.pexels.com/videos/',
  attribution: 'LinguaBuddy 原创示例条目 · 不托管任何第三方视频文件',
  licenseNote: 'Pexels License 允许免费使用；本条目为「纯占位状态」的原创教学示例，没有内置、下载或重新托管任何视频文件，也没有内置第三方字幕。',
  summaryZh: '这是一个原创示例占位条目：设想一段社区节日清晨的街景，摊位陆续摆开、邻居互相招呼、有人第一次尝试当志愿者。它用来演示「无真实视频时，观看占位 → 文化分析 → 观后讨论 → 复习」的完整闭环，不代表任何真实视频内容。',
  emblem: '🎊',
  coverFrom: 'from-coral-400',
  coverTo: 'to-sun-400',
  blurb: '原创示例占位：没有真实视频流，却能把整条学习闭环完整走一遍。',
  nativeCaptions: false,
  segments: [
    { id: 's1', label: '占位分段 · 摊位摆开', startSec: 0, hintZh: '想象问候与自我介绍会出现在哪些时刻。' },
    { id: 's2', label: '占位分段 · 邻居互相招呼', startSec: 45, hintZh: '留意「简短寒暄」在社区场合的作用。' },
    { id: 's3', label: '占位分段 · 第一次当志愿者', startSec: 90, hintZh: '想想你会怎样用一句英文主动提供帮助。' },
  ],
  seedExpressions: [
    quote('Would you like a hand with that?', '需要我搭把手吗？', '原创示例：主动提供帮助时的常见说法', '示例 01:10',),
    quote('Help yourself to some tea', '茶请自便', '原创示例：待客时表示随意、不必拘礼', '示例 01:35'),
    quote('It is a bit of a tradition around here', '这算是这儿的一个小传统', '原创示例：把习俗说得很轻，而非下定义', '示例 01:50'),
  ],
  seedThemes: [
    { theme: '轻量待客表达', briefZh: '在社区聚会里，主人常用「请自便」一类说法降低客人的拘束感；这只是常见场景用语，不代表所有场合。', watchFor: '注意提供帮助时怎样用问句把选择权留给对方。' },
    { theme: '把习俗说成「小传统」', briefZh: '英语里常用 a bit of / around here 把本地习惯说得轻松、不作概括，避免显得在替整个群体下结论。', watchFor: '留意这类「弱化词」怎样让描述更克制。' },
  ],
  seedQuestions: [
    'In this placeholder scene, what did the neighbour offer to do first, and how would you offer help in English?',
    'Why might "help yourself" feel less formal than a direct instruction? Refer to a detail from the card.',
    'How is a local custom usually introduced in your own context — as a rule, or as "a bit of a tradition"?',
  ],
}

/** 5. VOA：嵌入受限 → 明确降级为「在新窗口观看」 */
const VIDEO_VOA_LINKONLY: CultureVideo = {
  id: 'voa-landmarks-linkonly',
  title: 'A walk through a historic district（原平台观看）',
  titleZh: '走过一片历史街区（原平台观看）',
  platform: 'voa',
  theme: 'history-landmarks',
  tags: ['城市漫步', '地标介绍', '慢速英语'],
  cefr: 'A2',
  durationSec: 300,
  durationLabel: '05:00',
  embeddable: false,
  embedMode: 'linkOnly',
  watchUrl: 'https://learningenglish.voanews.com/',
  attribution: 'VOA Learning English · 保留原站来源与链接',
  licenseNote: 'VOA Learning English 部分内容不允许嵌入；嵌入被视为链接行为且不存储副本。本条目按平台要求「只做链接到原页面」，不嵌入、不下载、不转存，也不内置任何字幕全文。',
  summaryZh: '本条目演示「嵌入受限时的正确降级」：内容不在应用内播放，只提供到 VOA Learning English 原页面的链接。文化背景卡与短引用仍可在应用内阅读，观后讨论照常可用；不代表任何一条具体视频的字幕或台词。',
  emblem: '🏛️',
  coverFrom: 'from-brand-400',
  coverTo: 'to-mint-500',
  blurb: '嵌入受限示例：不伪装成可播放，明确标注「此视频需在原平台观看」。',
  nativeCaptions: true,
  segments: [
    { id: 's1', label: '观看提示 · 到原页面打开官方字幕', startSec: 0, hintZh: '在原站用播放器自带 CC，不在应用内复制字幕。' },
  ],
  seedExpressions: [
    quote('It dates back to ...', '它可以追溯到……', '原创示例：介绍建筑年代时的常用开头', '示例 · 原平台'),
    quote('the square is named after ...', '这个广场以……命名', '原创示例：说明地名来源的短句', '示例 · 原平台'),
  ],
  seedThemes: [
    { theme: '地标与集体记忆', briefZh: '介绍历史街区时常把建筑年代与人名并列，帮助听众建立时间线；不同媒体的取舍差别很大，不宜一概而论。', watchFor: '注意介绍里先给「年代」还是先给「用途」。' },
    { theme: '慢速讲解的措辞', briefZh: '面向语言学习者的解说会刻意放慢语速、缩短从句，这是教学调整，不是日常英语的普遍速度。', watchFor: '对比它和前几条 TED 演讲的句子长度。' },
  ],
  seedQuestions: [
    'This entry cannot be embedded here — what does the app do instead, and why is that the correct behaviour?',
    'Which short expression on the card would you use to introduce a building in your own city?',
    'How does a slow-learning narration differ from a conference talk, judging by the descriptions on these cards?',
  ],
}

/** 内置视频清单：旧 5 条手配条目，全部落在白名单内，语义与内容一字未改 */
export const BUILTIN_VIDEOS: CultureVideo[] = [
  VIDEO_TED_30DAYS, VIDEO_TED_SPEAK, VIDEO_TED_CREATIVITY,
  VIDEO_PEXELS_FESTIVAL, VIDEO_VOA_LINKONLY,
]

/** [修改点] 旧 5 条补扩展元数据 + 39 条结构化种子 = 44 条离线可用条目 */
export const ALL_SEED_VIDEOS: CultureVideo[] = [
  ...BUILTIN_VIDEOS.map(withLegacyLibraryMeta),
  ...EXPANDED_SEED_VIDEOS,
]

export const BUILTIN_VIDEO_IDS = BUILTIN_VIDEOS.map((v) => v.id)

/* ---------------- 新键的默认值 ---------------- */

export const DEFAULT_CULTURE_LIBRARY: CultureLibraryState = {
  seedVersion: CULTURE_SEED_VERSION,
  videos: ALL_SEED_VIDEOS,
}

export const DEFAULT_WATCH_PROGRESS: WatchProgressState = {}
export const DEFAULT_POSTWATCH_SESSIONS: PostWatchState = []
export const DEFAULT_CULTURE_NOTES: CultureNotesState = {
  notes: [], savedExpressions: [], favorites: [],
}

/** 设置页新增两项的默认值（迁移时只补缺，不覆盖旧值） */
export const CULTURE_SETTING_DEFAULTS: {
  captionPreference: CaptionPreference
  autoEnterPostWatch: boolean
} = {
  captionPreference: 'on',
  autoEnterPostWatch: false,
}
