/**
 * 视频模块分级内容池（模块 3：文化视频 / PostWatch）
 *
 * 分级依据：语速 WPM + 词汇覆盖率 + 话题抽象度 + 口音复杂度 + 语用负载。
 * A2 ≤130 WPM / B1 130–160 / B2 160–190 / C1 ≥190 WPM。
 *
 * 嵌入与版权约束（延续三层储量体系，不放松）：
 * - 只通过官方嵌入播放器播放；不下载、不转存、不抓取完整字幕全文；
 * - 每条标注 source / embeddable / licenseNote；
 * - BBC Learning English 等来源的嵌入权限需逐条确认：未确认前 embeddable=false、
 *   embedMode='external'，降级为外链，不得绕过；
 * - 本池只登记「来源 + 分级依据 + 许可状态」，不新增播放流程、不伪造 videoId。
 */

import type { ContentItem } from '../../levelTypes'

export const VIDEO_POOL: ContentItem[] = [
  /* ---- A2 ---- */
  {
    id: 'vid-a2-bbc', module: 'video', cefr: 'A2',
    title: 'BBC Learning English · short lessons', titleZh: 'BBC 学习英语 · 短课',
    source: 'bbc_learning', sourceLabel: 'BBC Learning English',
    licenseNote: '嵌入权限需逐条确认；未确认前降级为外链，不绕过、不转存',
    embeddable: false, embedMode: 'external',
    cefrBasis: { speechRateWpm: 120, vocabCoverage: 0.94, pragmaticLoad: 'low', accentDiversity: 'single' },
    levelSource: 'expert',
    levelNotes: '清晰发音、短课与 CC 字幕，语速约 120 WPM、单一标准口音、话题具体。',
    blurb: '短课与 6 Minute English 型材料：一句一个功能，适合练「先听懂再复述一句」。',
    tags: ['A2', 'cc-captions', 'external-only', 'bbc'],
  },
  {
    id: 'vid-a2-voa', module: 'video', cefr: 'A2',
    title: 'VOA Learning English · slow news', titleZh: 'VOA 慢速英语 · 新闻',
    source: 'voa_learning', sourceLabel: 'VOA Learning English',
    licenseNote: '公共领域（美国政府作品）；沿用既有官方嵌入白名单，不下载、不抓取字幕全文',
    embeddable: true, embedMode: 'official',
    cefrBasis: { speechRateWpm: 110, vocabCoverage: 0.95, pragmaticLoad: 'low', accentDiversity: 'single' },
    levelSource: 'expert',
    levelNotes: '慢速新闻约 110 WPM、每日词汇可控、话题具体，是 A2 的典型语速锚点。',
    blurb: '慢速新闻与每日词汇：听完后只回答「谁、做了什么、在哪里」三个问题。',
    tags: ['A2', 'slow-news', 'official-embed', 'voa'],
  },
  {
    id: 'vid-a2-easy', module: 'video', cefr: 'A2',
    title: 'Easy English · street interviews', titleZh: 'Easy English · 街头采访',
    source: 'easy_english', sourceLabel: 'Easy English',
    licenseNote: '嵌入权限需逐条确认；未确认前降级为外链；英文字幕仅作展示，不抓取全文',
    embeddable: false, embedMode: 'external',
    cefrBasis: { speechRateWpm: 128, vocabCoverage: 0.92, pragmaticLoad: 'low', accentDiversity: 'limited' },
    levelSource: 'estimated',
    levelNotes: '日常短语与英文字幕、语速约 128 WPM；真实路人偶有非标准口音但语用负载低。',
    blurb: '街头采访里的固定问答：把同一个问题下三种回答的差别说出来。',
    tags: ['A2', 'everyday-phrases', 'external-only'],
  },

  /* ---- B1 ---- */
  {
    id: 'vid-b1-teded', module: 'video', cefr: 'B1',
    title: 'TED-Ed · animated lessons', titleZh: 'TED-Ed · 教育动画',
    source: 'ted_ed', sourceLabel: 'TED-Ed',
    licenseNote: 'CC BY-NC-ND 4.0 · 署名，非商用；官方嵌入播放器，不下载、不转存',
    embeddable: true, embedMode: 'official',
    cefrBasis: { speechRateWpm: 145, vocabCoverage: 0.87, pragmaticLoad: 'medium', accentDiversity: 'single' },
    levelSource: 'expert',
    levelNotes: '5–10 分钟，复杂概念用易懂语言、准确 CC 字幕，语速约 145 WPM。',
    blurb: '把一个抽象概念讲成一条因果链：听完后用 2–3 句复述「为什么会这样」。',
    tags: ['B1', 'ted-ed', 'official-embed', 'cc-by-nc-nd'],
  },
  {
    id: 'vid-b1-kurz', module: 'video', cefr: 'B1',
    title: 'Kurzgesagt · animated science', titleZh: 'Kurzgesagt · 动画科普',
    source: 'kurzgesagt', sourceLabel: 'Kurzgesagt',
    licenseNote: '嵌入权限需逐条确认；未确认前降级为外链；多语言字幕仅作展示',
    embeddable: false, embedMode: 'external',
    cefrBasis: { speechRateWpm: 152, vocabCoverage: 0.85, pragmaticLoad: 'medium', accentDiversity: 'single' },
    levelSource: 'estimated',
    levelNotes: '清晰旁白、话题略抽象、语速约 152 WPM，词汇开始出现学科词。',
    blurb: '动画科普：先记三个关键名词，再看它们怎样被串成一条解释链。',
    tags: ['B1', 'science', 'external-only'],
  },
  {
    id: 'vid-b1-allears', module: 'video', cefr: 'B1',
    title: 'All Ears English · natural phrases', titleZh: 'All Ears English · 自然表达',
    source: 'all_ears_english', sourceLabel: 'All Ears English',
    licenseNote: '嵌入权限需逐条确认；未确认前降级为外链；不复制讲解文本',
    embeddable: false, embedMode: 'external',
    cefrBasis: { speechRateWpm: 155, vocabCoverage: 0.84, pragmaticLoad: 'medium', accentDiversity: 'limited' },
    levelSource: 'estimated',
    levelNotes: '自然美式表达与短语动词、语速约 155 WPM，需从语境推断短语含义。',
    blurb: '一个短语动词在三种语境里的用法：练「听懂字面之外的意思」。',
    tags: ['B1', 'phrasal-verbs', 'external-only'],
  },
  {
    id: 'vid-b1-mmm', module: 'video', cefr: 'B1',
    title: 'mmmEnglish · grammar in use', titleZh: 'mmmEnglish · 实用语法',
    source: 'mmmenglish', sourceLabel: 'mmmEnglish',
    licenseNote: '嵌入权限需逐条确认；未确认前降级为外链；不抓取讲解字幕全文',
    embeddable: false, embedMode: 'external',
    cefrBasis: { speechRateWpm: 140, vocabCoverage: 0.88, pragmaticLoad: 'low', accentDiversity: 'single' },
    levelSource: 'estimated',
    levelNotes: '讲解型语速约 140 WPM、结构清晰、语用负载低，适合 B1 入门。',
    blurb: '把一条语法观察放进真实对话里：只判断「说话人为什么选这个时态」。',
    tags: ['B1', 'grammar-in-use', 'external-only'],
  },

  /* ---- B2 ---- */
  {
    id: 'vid-b2-ted', module: 'video', cefr: 'B2',
    title: 'TED Talks · real speeches', titleZh: 'TED Talks · 真实演讲',
    source: 'ted_talks', sourceLabel: 'TED Talks',
    licenseNote: '官方嵌入播放器 + CC 字幕；沿用既有白名单，不下载、不转存、不抓取字幕全文',
    embeddable: true, embedMode: 'official',
    cefrBasis: { speechRateWpm: 172, vocabCoverage: 0.79, pragmaticLoad: 'high', accentDiversity: 'multi' },
    levelSource: 'expert',
    levelNotes: '真实演讲约 172 WPM、多口音、跨文化话题，修辞与停顿都承载意义。',
    blurb: '先定位讲者的主张，再找一处「短引用」作证据，观后讨论不背全文。',
    tags: ['B2', 'ted', 'official-embed', 'multi-accent'],
  },
  {
    id: 'vid-b2-veritasium', module: 'video', cefr: 'B2',
    title: 'Veritasium · science explanations', titleZh: 'Veritasium · 科学解释',
    source: 'veritasium', sourceLabel: 'Veritasium',
    licenseNote: '嵌入权限需逐条确认；未确认前降级为外链；不抓取完整字幕',
    embeddable: false, embedMode: 'external',
    cefrBasis: { speechRateWpm: 180, vocabCoverage: 0.77, pragmaticLoad: 'medium', accentDiversity: 'limited' },
    levelSource: 'estimated',
    levelNotes: '中等偏快语速约 180 WPM、学科词汇密集，但论证结构显性、语用隐含较少。',
    blurb: '跟着解释链走：把「假设 → 验证 → 结论」各写一句英文。',
    tags: ['B2', 'science', 'external-only'],
  },
  {
    id: 'vid-b2-teded-adv', module: 'video', cefr: 'B2',
    title: 'TED-Ed · abstract concepts', titleZh: 'TED-Ed · 抽象议题进阶',
    source: 'ted_ed', sourceLabel: 'TED-Ed',
    licenseNote: 'CC BY-NC-ND 4.0 · 署名，非商用；官方嵌入播放器',
    embeddable: true, embedMode: 'official',
    cefrBasis: { speechRateWpm: 165, vocabCoverage: 0.80, pragmaticLoad: 'medium', accentDiversity: 'limited' },
    levelSource: 'estimated',
    levelNotes: '同为教育动画，但话题从具体现象转向抽象伦理，词汇覆盖率降到 0.80。',
    blurb: '同一个「该不该」的问题，列出两方各一条理由，再给出你的有限同意。',
    tags: ['B2', 'ted-ed', 'official-embed', 'abstract'],
  },

  /* ---- C1 ---- */
  {
    id: 'vid-c1-ted-fast', module: 'video', cefr: 'C1',
    title: 'TED Talks · fast, interactive transcript', titleZh: 'TED Talks · 快速语流与交互式 Transcript',
    source: 'ted_talks', sourceLabel: 'TED Talks（交互式 Transcript）',
    licenseNote: '官方嵌入播放器 + 交互式 Transcript（点击时间轴跳转，便于研讨定位证据）；不抓取字幕全文',
    embeddable: true, embedMode: 'official',
    cefrBasis: { speechRateWpm: 196, vocabCoverage: 0.70, pragmaticLoad: 'high', accentDiversity: 'multi' },
    levelSource: 'expert',
    levelNotes: '从 B2 来源中筛选语速 ≥190 WPM、话题抽象、口音更多样的演讲；交互式 Transcript 供证据定位。',
    blurb: '用时间轴定位一处反讽或让步，研讨时直接引用那个时间点，而不是复述整段。',
    tags: ['C1', 'interactive-transcript', 'official-embed', 'fast-speech'],
  },
  {
    id: 'vid-c1-academic', module: 'video', cefr: 'C1',
    title: 'Academic talk · multiple accents', titleZh: '学术演讲 · 多口音',
    source: 'academic_talk', sourceLabel: '从 B2 白名单来源中筛选的学术 / 专业话题',
    licenseNote: '嵌入权限需逐条确认；未确认前降级为外链；仅嵌入，不转存',
    embeddable: false, embedMode: 'external',
    cefrBasis: { speechRateWpm: 205, vocabCoverage: 0.67, pragmaticLoad: 'high', accentDiversity: 'multi' },
    levelSource: 'estimated',
    levelNotes: '语速约 205 WPM、专业术语密集、多种口音与语用隐含叠加，定为 C1。',
    blurb: '先记讲者的限定条件（insofar as / unless），再判断结论在什么范围内成立。',
    tags: ['C1', 'academic', 'multi-accent', 'external-only'],
  },
]
