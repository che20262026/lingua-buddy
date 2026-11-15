/* ================================================================
 * 第 2 / 3 层种子：播放列表注册表 + 人工精选频道白名单
 *
 * ★ 每一个 playlistId 都来自可验证的公开链接，绝不编造：
 *   VOA     —— 官方频道简介与 @VOALearningEnglish/playlists 公开的播放列表链接
 *   TED-Ed  —— 官方 lesson 页的 bit.ly 短链、ed.ted.com 合集页、
 *              以及公开引用官方播放列表的教育机构 / 媒体页面
 *   BC      —— 官方 @BritishCouncilEnglish/playlists 播放列表标签页
 *
 * 配额事实（YouTube Data API v3）：
 *   search.list         单次 1 单位，但独立配额桶默认仅 100 次/天 → 本应用永不调用
 *   playlistItems.list  单次 1 单位，从属 10,000 单位/天通用池 → 本应用唯一拉取方式
 * ================================================================ */

import type { CefrLevel, CultureTheme } from '../cultureTypes'
import type {
  CultureSource, PlaylistItemSnippet, PlaylistRegistryEntry,
  PlaylistRegistryState, WhitelistedChannel,
} from '../cultureLibraryTypes'

export const REGISTRY_SEED_VERSION = 1
/** 视频库种子版本：2 = 已并入 30+ 条结构化种子库 */
export const CULTURE_LIBRARY_SEED_VERSION = 2

export const SOURCE_LABELS: Record<CultureSource, string> = {
  voa: 'VOA Learning English',
  'ted-ed': 'TED-Ed',
  'british-council': 'British Council | LearnEnglish',
  pexels: 'Pexels',
  pixabay: 'Pixabay',
  ted: 'TED Talks',
}

/** 各来源的许可与署名模板（每个条目都会带上完整三件套） */
export const SOURCE_PROVENANCE: Record<CultureSource, { license: string; attribution: string; platform: 'youtube' | 'ted' | 'pexels' | 'pixabay' }> = {
  voa: {
    license: '美国联邦政府作品 · 公共领域（Public Domain）。允许为教育目的转载与嵌入，需署名 learningenglish.voanews.com；已避开含第三方音乐 / 影视片段的条目。',
    attribution: 'VOA Learning English · learningenglish.voanews.com · 保留原频道与原页面链接',
    platform: 'youtube',
  },
  'ted-ed': {
    license: 'TED-Ed 内容依 CC BY-NC-ND 4.0 提供：非商用、不衍生、保留署名。经 YouTube 官方嵌入播放器播放，不下载、不转存。',
    attribution: 'TED-Ed（CC BY-NC-ND 4.0）· 保留原作者、TED-Ed 来源与原页面链接',
    platform: 'youtube',
  },
  'british-council': {
    license: 'British Council | LearnEnglish 官方频道内容。Video zone 为 B2–C1 学习者精选，但逐条嵌入权限需人工确认；本库默认不嵌入，仅链接到原页面，不尝试绕过。',
    attribution: 'British Council | LearnEnglish · 保留原频道与原页面链接',
    platform: 'youtube',
  },
  pexels: {
    license: 'Pexels License（免费使用，无需署名）。本库条目为原创教学占位，未内置、下载或重新托管任何视频文件。',
    attribution: 'LinguaBuddy 原创示例学习卡 · Pexels 免费素材方向 · 不托管第三方视频文件',
    platform: 'pexels',
  },
  pixabay: {
    license: 'Pixabay Content License（免费使用）。本库条目为原创教学占位，未内置、下载或重新托管任何视频文件。',
    attribution: 'LinguaBuddy 原创示例学习卡 · Pixabay 免费素材方向 · 不托管第三方视频文件',
    platform: 'pixabay',
  },
  ted: {
    license: 'TED / TED-Ed 内容依 CC BY-NC-ND 4.0 提供：非商用、不衍生、保留署名。经官方 embed.ted.com 播放器嵌入。',
    attribution: 'TED Talks（CC BY-NC-ND 4.0）· 保留演讲者署名与原页面链接',
    platform: 'ted',
  },
}

/** 6 个主题的最低储量阈值（低于即在健康度面板提示「此主题内容偏少」） */
export const TOPIC_MIN_COUNTS: Record<CultureTheme, number> = {
  'daily-life': 8,
  festivals: 6,
  'work-social': 6,
  'history-landmarks': 6,
  'science-nature': 6,
  'arts-media': 4,
}

export const TOPIC_LABELS: Record<CultureTheme, { label: string; emblem: string; hint: string }> = {
  'daily-life': { label: '日常生活与习惯', emblem: '☕', hint: '问候、作息、购物与小习惯' },
  festivals: { label: '节日、习俗与身份', emblem: '🎊', hint: '节庆、聚会与待客礼节' },
  'work-social': { label: '工作、学习与社交', emblem: '🤝', hint: '会议、面试、寒暄与表达' },
  'history-landmarks': { label: '历史、地标与文化符号', emblem: '🏛️', hint: '城市、建筑与集体记忆' },
  'science-nature': { label: '科学、自然与环境', emblem: '🌿', hint: '自然、科技与科学解释' },
  'arts-media': { label: '艺术、媒体与流行文化', emblem: '🎨', hint: '文学、影像与媒体素养' },
}

/** 同步策略：手动触发 + 速率限制 + 缓存；页面加载时绝不自动批量拉取 */
export const SYNC_POLICY = {
  /** 同一播放列表的最短重拉间隔（6 小时） */
  minIntervalMs: 6 * 60 * 60 * 1000,
  /** 每次手动同步最多拉取的播放列表数 */
  maxPlaylistsPerRun: 3,
  /** playlistItems.list 单次最大条目数 */
  pageSize: 50,
  /** 单次调用配额（单位） */
  quotaUnitsPerCall: 1,
  /** 通用配额池（单位/天） */
  generalDailyQuota: 10000,
  /** search.list 独立配额桶（次/天）——仅用于说明为何禁用 */
  searchListDailyQuota: 100,
} as const

export const QUOTA_NOTICE =
  'playlistItems.list 每次仅 1 单位、从属每天 10,000 单位的通用配额池；search.list 虽也是 1 单位，但独立配额桶默认只有 100 次/天，因此本应用永不调用搜索接口，也不提供「按关键词实时拉视频」。同步由用户手动点击触发，单次最多 3 个播放列表，同一列表 6 小时内不重复拉取，结果缓存到 localStorage。'

/**
 * 预置注册表：11 个可验证播放列表。
 * British Council 三条默认 enabled=false，待逐条确认嵌入权限后由维护者手动启用。
 */
export const BUILTIN_PLAYLISTS: PlaylistRegistryEntry[] = [
  {
    playlistId: 'PLd9hCvj34W5it4a-RMzhlwNJ-edf5HU3Q', source: 'voa',
    label: "VOA · Let's Learn English（Level 1）", topicHint: 'daily-life', cefrHint: 'A2',
    lastFetchedAt: null, videoCount: 0, enabled: true,
    verifiedUrl: 'https://www.youtube.com/@VOALearningEnglish',
    note: 'VOA 官方频道简介「Lets Learn English Level 1」公开链接；52 周初级课程，公共领域压舱石来源。',
  },
  {
    playlistId: 'PLd9hCvj34W5hWkRym8sljiEvEBJ1JGIu5', source: 'voa',
    label: "VOA · Let's Learn English Level 2", topicHint: 'daily-life', cefrHint: 'B1',
    lastFetchedAt: null, videoCount: 0, enabled: true,
    verifiedUrl: 'https://www.youtube.com/@VOALearningEnglish',
    note: 'VOA 官方频道简介「Lets Learn English Level 2」公开链接；进阶日常会话。',
  },
  {
    playlistId: 'PLd9hCvj34W5hJZwjdghwQQi3XhpSZO9sx', source: 'voa',
    label: 'VOA · EIM: English in a Minute', topicHint: 'daily-life', cefrHint: 'B1',
    lastFetchedAt: null, videoCount: 0, enabled: true,
    verifiedUrl: 'https://www.youtube.com/@VOALearningEnglish/playlists',
    note: 'VOA 官方频道播放列表标签页「EIM: English in a Minute」；一分钟习语短片。',
  },
  {
    playlistId: 'PLd9hCvj34W5i4HBJAVHrMhtnPfATt73Oe', source: 'voa',
    label: "VOA · America's National Parks", topicHint: 'science-nature', cefrHint: 'B2',
    lastFetchedAt: null, videoCount: 0, enabled: true,
    verifiedUrl: 'https://www.youtube.com/@VOALearningEnglish/playlists',
    note: 'VOA 官方频道播放列表标签页；国家公园与自然环境，慢速解说。',
  },
  {
    playlistId: 'PLd9hCvj34W5hHemY3weG4Py2oGRW-pkwb', source: 'voa',
    label: 'VOA · News Literacy', topicHint: 'arts-media', cefrHint: 'B2',
    lastFetchedAt: null, videoCount: 0, enabled: true,
    verifiedUrl: 'https://www.youtube.com/@VOALearningEnglish/playlists',
    note: 'VOA 官方频道播放列表标签页；媒体素养与新闻辨识。',
  },
  {
    playlistId: 'PLJicmE8fK0Egxi0hgy5Tw-NFyLcpJ4bzJ', source: 'ted-ed',
    label: "TED-Ed · There's a Poem for That", topicHint: 'arts-media', cefrHint: 'C1',
    lastFetchedAt: null, videoCount: 0, enabled: true,
    verifiedUrl: 'https://ed.ted.com/lessons/for-estefani-third-grade-who-made-me-a-card-by-aracelis-girmay',
    note: 'TED-Ed 官方 lesson 页提供的官方短链 http://bit.ly/TEDEdTheresAPoemForThat 重定向到该播放列表；诗歌与语言。',
  },
  {
    playlistId: 'PLJicmE8fK0EjW2AVwcSc4NvGyJJaw7bzh', source: 'ted-ed',
    label: 'TED-Ed · Myths From Around the World', topicHint: 'festivals', cefrHint: 'B2',
    lastFetchedAt: null, videoCount: 0, enabled: true,
    verifiedUrl: 'https://www.openculture.com/2019/02/18-classic-myths-explained-with-animation-pandoras-box-sisyphus-more.html',
    note: 'Open Culture 专题引用 TED-Ed 官方播放列表完整链接；各国神话与习俗。',
  },
  {
    playlistId: 'PLJicmE8fK0EgogMqDYMgcADT1j5b911or', source: 'ted-ed',
    label: 'TED-Ed · Think Like A Coder', topicHint: 'science-nature', cefrHint: 'B2',
    lastFetchedAt: null, videoCount: 0, enabled: true,
    verifiedUrl: 'https://ed.ted.com/ted_ed_collections/think-like-a-coder',
    note: 'TED-Ed 官方合集页 + 世新大学教发中心公开引用的 YouTube 播放列表链接；10 集科普动画。',
  },
  {
    playlistId: 'PLm7J5yZ2yc3nGd7QOvSC-7wCVR1iD5L8r', source: 'british-council',
    label: 'British Council · What to say（口语练习）', topicHint: 'work-social', cefrHint: 'B2',
    lastFetchedAt: null, videoCount: 0, enabled: false,
    verifiedUrl: 'https://www.youtube.com/@BritishCouncilEnglish/playlists',
    note: '官方频道播放列表标签页；逐条嵌入权限待人工确认，默认停用、只走外链。',
  },
  {
    playlistId: 'PLm7J5yZ2yc3neq-MGLMNHoxS0odMaCG4F', source: 'british-council',
    label: 'British Council · Job interview', topicHint: 'work-social', cefrHint: 'B2',
    lastFetchedAt: null, videoCount: 0, enabled: false,
    verifiedUrl: 'https://www.youtube.com/@BritishCouncilEnglish/playlists',
    note: '官方频道播放列表标签页「How to succeed at your next job interview」；待验证嵌入权限。',
  },
  {
    playlistId: 'PLm7J5yZ2yc3ksm8YquBP82ZydteQGCzdM', source: 'british-council',
    label: 'British Council · Shakespeare 短片集', topicHint: 'arts-media', cefrHint: 'C1',
    lastFetchedAt: null, videoCount: 0, enabled: false,
    verifiedUrl: 'https://www.youtube.com/@BritishCouncilEnglish/playlists',
    note: '官方频道播放列表标签页「Exploring English: Shakespeare」；含第三方演出素材，默认停用。',
  },
]

/** 第 3 层：人工精选的机构频道白名单（严禁自动收录个人创作者频道） */
export const WHITELISTED_CHANNELS: WhitelistedChannel[] = [
  {
    id: 'ch-voa', name: 'VOA Learning English', handle: '@VOALearningEnglish',
    url: 'https://www.youtube.com/@VOALearningEnglish', source: 'voa',
    playlistIds: [
      'PLd9hCvj34W5it4a-RMzhlwNJ-edf5HU3Q', 'PLd9hCvj34W5hWkRym8sljiEvEBJ1JGIu5',
      'PLd9hCvj34W5hJZwjdghwQQi3XhpSZO9sx', 'PLd9hCvj34W5i4HBJAVHrMhtnPfATt73Oe',
      'PLd9hCvj34W5hHemY3weG4Py2oGRW-pkwb',
    ],
    status: 'verified',
    note: '美国联邦政府作品 / 公有领域；官方频道简介公开列出播放列表。避开含第三方音乐与影视片段的视频。',
  },
  {
    id: 'ch-teded', name: 'TED-Ed', handle: '@TEDEducation',
    url: 'https://www.youtube.com/@TEDEducation', source: 'ted-ed',
    playlistIds: [
      'PLJicmE8fK0Egxi0hgy5Tw-NFyLcpJ4bzJ',
      'PLJicmE8fK0EjW2AVwcSc4NvGyJJaw7bzh',
      'PLJicmE8fK0EgogMqDYMgcADT1j5b911or',
    ],
    status: 'verified',
    note: 'CC BY-NC-ND 4.0；官方站点合集页与官方短链可验证播放列表 ID。',
  },
  {
    id: 'ch-bc', name: 'British Council | English', handle: '@BritishCouncilEnglish',
    url: 'https://www.youtube.com/@BritishCouncilEnglish', source: 'british-council',
    playlistIds: [
      'PLm7J5yZ2yc3nGd7QOvSC-7wCVR1iD5L8r',
      'PLm7J5yZ2yc3neq-MGLMNHoxS0odMaCG4F',
      'PLm7J5yZ2yc3ksm8YquBP82ZydteQGCzdM',
    ],
    status: 'pending-verification',
    note: 'Video zone 面向 B2–C1，强调口音多样性与习语；但嵌入权限必须逐条确认，默认全部停用。',
  },
  {
    id: 'ch-american-english', name: 'American English（U.S. Department of State）',
    handle: 'americanenglish.state.gov', url: 'https://americanenglish.state.gov/',
    source: 'voa', playlistIds: [], status: 'pending-verification',
    note: '美国国务院教育资源，未标注版权的内容通常属公共领域；尚未确认官方 YouTube 播放列表与嵌入权限，故不纳入同步。',
  },
]

/** 明确禁止纳入白名单的个人创作者 / 版权不明来源（供守门与验收断言） */
export const EXCLUDED_CHANNEL_KEYWORDS = [
  'English with Emma', 'Bob the Canadian', '个人创作者', '未授权转载',
  'BBC Learning English', '影视切片', '破解播放地址',
] as const

export const DEFAULT_PLAYLIST_REGISTRY: PlaylistRegistryState = {
  version: REGISTRY_SEED_VERSION,
  playlists: BUILTIN_PLAYLISTS,
  channels: WHITELISTED_CHANNELS,
  lastSyncAt: null,
  proxyEndpoint: '',
  quotaUnitsUsed: 0,
}

/**
 * Mock 同步用的「本地精选条目」：
 * 全部为上面已核实的官方频道真实 videoId，用来在零网络、零密钥时演示
 * 「playlistItems.list → 去重 → 入库 seed:false」的完整过程。
 * 注意：这是本地模拟返回体，不代表这些 ID 与某个播放列表的真实归属关系；
 * 真实归属只能由服务端代理调用 playlistItems.list 后确定。
 */
export const MOCK_PLAYLIST_ITEMS: Record<string, PlaylistItemSnippet[]> = {
  'PLd9hCvj34W5it4a-RMzhlwNJ-edf5HU3Q': [
    { videoId: 'zn_CcrXMeQM', title: "Let's Teach English · classroom language", channelTitle: 'VOA Learning English' },
    { videoId: 'lcW9PqvUPpY', title: 'Let’s Learn English with Anna · greetings', channelTitle: 'VOA Learning English' },
  ],
  'PLd9hCvj34W5hWkRym8sljiEvEBJ1JGIu5': [
    { videoId: '5dLIMEIXuR0', title: 'Everyday conversations · Level 2 review', channelTitle: 'VOA Learning English' },
    { videoId: '2XPctdx-z5s', title: 'Making plans with a friend', channelTitle: 'VOA Learning English' },
  ],
  'PLd9hCvj34W5hJZwjdghwQQi3XhpSZO9sx': [
    { videoId: 'sW8HIAWrd0E', title: 'English in a Minute · everyday idioms', channelTitle: 'VOA Learning English' },
    { videoId: 'OUE-oM-69jQ', title: 'Watch & Learn · short news expressions', channelTitle: 'VOA Learning English' },
  ],
  'PLd9hCvj34W5i4HBJAVHrMhtnPfATt73Oe': [
    { videoId: 'jqfolCH1RyI', title: 'Learning English on U.S. Route 66', channelTitle: 'VOA Learning English' },
    { videoId: 'V6gZzJXAiEw', title: 'Landmarks and civic stories', channelTitle: 'VOA Learning English' },
  ],
  'PLd9hCvj34W5hHemY3weG4Py2oGRW-pkwb': [
    { videoId: 'Ld5X3C_8OdM', title: 'News literacy · checking a source', channelTitle: 'VOA Learning English' },
    { videoId: '_rl9aNEF3yI', title: 'Reading the news slowly', channelTitle: 'VOA Learning English' },
  ],
  'PLJicmE8fK0Egxi0hgy5Tw-NFyLcpJ4bzJ': [
    { videoId: 'uJ_d-UD0xPE', title: 'A poem about history and voice', channelTitle: 'TED-Ed' },
    { videoId: 'ZEE-a0r-lXo', title: 'The myth of Pandora’s box', channelTitle: 'TED-Ed' },
  ],
  'PLJicmE8fK0EjW2AVwcSc4NvGyJJaw7bzh': [
    { videoId: 'Qytj-DbXMKQ', title: 'A Norse myth, retold', channelTitle: 'TED-Ed' },
    { videoId: 'aQbyVYUob1o', title: 'An Irish legend', channelTitle: 'TED-Ed' },
  ],
  'PLJicmE8fK0EgogMqDYMgcADT1j5b911or': [
    { videoId: 'may2s9j4RLk', title: 'The Chinese zodiac, explained', channelTitle: 'TED-Ed' },
    { videoId: 'Ul9ysDvkuLA', title: 'A Cambodian folktale', channelTitle: 'TED-Ed' },
  ],
  'PLm7J5yZ2yc3nGd7QOvSC-7wCVR1iD5L8r': [
    { videoId: 'Q-SQePXWfAU', title: 'What to say · a Mini English Lesson', channelTitle: 'British Council | English' },
    { videoId: 'u1xBhFhDvz8', title: 'Speaking practice · short answers', channelTitle: 'British Council | English' },
  ],
  'PLm7J5yZ2yc3neq-MGLMNHoxS0odMaCG4F': [
    { videoId: 'AvxmoB8UZ8Q', title: 'Interview language · podcast clip', channelTitle: 'British Council | English' },
    { videoId: 'RDyljcd6z7I', title: 'IELTS speaking workshop', channelTitle: 'British Council | English' },
  ],
  'PLm7J5yZ2yc3ksm8YquBP82ZydteQGCzdM': [
    { videoId: 'nVDOZu92k-M', title: 'Exploring English · Shakespeare', channelTitle: 'British Council | English' },
    { videoId: 'VcA5diHiTHk', title: 'A live lesson on performance', channelTitle: 'British Council | English' },
  ],
}

/** 供 UI 展示的 CEFR 建议（注册表 topicHint / cefrHint 的说明） */
export const CEFR_HINTS: CefrLevel[] = ['A2', 'B1', 'B2', 'C1']
