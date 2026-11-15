/* ================================================================
 * 内置公版书库种子数据（LiteraryCuratorAgent 的书源）
 *
 * 版权准入规则（最高优先级）：
 *   1. 只收录作者逝世已久、且原作出版于 1929 年前、被 Project Gutenberg
 *      明确标为 Public Domain 的作品；每本都带 source / publicDomainRegion /
 *      licenseNote 三件套，缺一不入库。
 *   2. 内置的是「教学节选」，不是全书；每章都用 excerptRange 与
 *      excerptNote 明确说明，避免误导成完整章节。
 *   3. 所有 keyQuotes / themes[].evidence / symbols[].evidence 都必须是
 *      本章 paragraphs 的逐字子串；LiteraryAnalyzerAgent 会再做一次校验过滤。
 *   4. 简化视图是「学习用改写」，明确标注为「非原文」；双语注释是中文释义，
 *      二者都不冒充原文，也不新增情节。
 * ================================================================ */

import type {
  GuidanceStrength, LibraryState, LiteraryBook, LiteraryChapter, LiteraryNotesState,
  ReadingProgressState, ReadingViewMode, SeminarState,
} from '../literaryTypes'

export const LIBRARY_SEED_VERSION = 1

/** 书架页顶部展示的简短版权说明 */
export const PUBLIC_DOMAIN_NOTICE =
  '本模块只收录已进入公有领域（Public Domain）的经典作品，来源以 Project Gutenberg 为准。内置内容为教学节选，非全书；各书卡片均标注来源、适用地区与许可说明。版权状态无法确认的作品一律不内置。'

type T2 = [string, string]
type T3 = [string, string, string]

interface ChapterSeed {
  id: string
  title: string
  order: number
  range: string
  summary: string
  context?: string
  /** 原文段落（教学节选） */
  p: string[]
  /** 分级简化改写（非原文） */
  s: string[]
  /** 双语注释（中文） */
  n: string[]
  /** [word, meaningZh, note] */
  words: T3[]
  /** [quote, whyItMatters] —— quote 必须是 p 中某段的子串 */
  quotes: T2[]
  /** [name, evidence] */
  themes: T2[]
  /** [name, traits, arc] */
  chars: T3[]
  /** [item, meaning, evidence] */
  symbols: T3[]
  /** 开放性问题 */
  q: string[]
}

/** 保证三套视图的段落数一致，避免阅读页出现空段 */
function buildChapter(seed: ChapterSeed): LiteraryChapter {
  const size = Math.max(seed.p.length, seed.s.length, seed.n.length)
  const pad = (arr: string[]) => Array.from({ length: size }, (_, i) => arr[i] || '')
  return {
    id: seed.id,
    title: seed.title,
    order: seed.order,
    excerptRange: seed.range,
    paragraphs: pad(seed.p),
    simplified: pad(seed.s),
    notesZh: pad(seed.n),
    glosses: seed.words.map(([word, meaningZh, note]) => ({ word, meaningZh, note })),
    keyQuotes: seed.quotes.map(([quote, whyItMatters]) => ({ quote, whyItMatters })),
    seedThemes: seed.themes.map(([name, evidence]) => ({ name, evidence })),
    seedCharacters: seed.chars.map(([name, traits, arc]) => ({ name, traits, arc })),
    seedSymbols: seed.symbols.map(([item, meaning, evidence]) => ({ item, meaning, evidence })),
    seedQuestions: seed.q,
    summaryZh: seed.summary,
    historicalContext: seed.context,
  }
}

const EXCERPT_NOTE =
  '教学节选：文字依据 Project Gutenberg 公有领域原文，仅选取短小段落并按阅读界面整理分段与标点，非完整章节；分级简化视图为学习改写，双语注释为中文释义，均不冒充原文。'

/* ---------------------------------------------------------------- *
 * 1. A Christmas Carol — Charles Dickens, 1843
 * ---------------------------------------------------------------- */
const CHRISTMAS_CAROL: LiteraryBook = {
  id: 'christmas-carol',
  title: 'A Christmas Carol',
  author: 'Charles Dickens',
  year: 1843,
  emblem: '🕯️',
  coverFrom: 'from-brand-500',
  coverTo: 'to-brand-700',
  blurb: '一个吝啬的老人在圣诞前夜被三个精灵带着回看过去、现在与未来。狄更斯用冷与暖的强对照，写了一次关于记忆与改变的对话。',
  cefr: 'B1',
  source: 'Project Gutenberg eBook #46 — https://www.gutenberg.org/ebooks/46',
  publicDomainRegion: '全球多数法域：作者 1870 年逝世；1843 年出版，属美国 1929 年前作品。',
  licenseNote: '公有领域（Public Domain）。本应用仅内置短篇节选用于语言学习；Project Gutenberg 商标与站点使用条款另计。',
  excerptNote: EXCERPT_NOTE,
  themes: ['记忆与改变', '冷漠与善意', '时间'],
  characters: ['Ebenezer Scrooge', 'Scrooge 的侄子', 'Jacob Marley', '圣诞过去之灵', '圣诞现在之灵'],
  chapters: [
    buildChapter({
      id: 'cc-1', title: 'Stave I · Marley was dead', order: 1,
      range: 'Stave I · 开篇至侄子来访（教学节选）',
      summary: '故事以「马利已经死了」开篇，斯克鲁奇在阴冷的圣诞前夜独自守在账房里。侄子来道一声圣诞快乐，被他用「Bah! Humbug!」挡了回去；人物的冷与节日的暖第一次正面相撞。',
      context: '1843 年维多利亚时代，工业革命后城市贫富差距扩大，中产阶级正在重新想象「圣诞节该怎么过」。',
      p: [
        `Marley was dead: to begin with. There is no doubt whatever about that. The register of his burial was signed by the clergyman, the clerk, the undertaker, and the chief mourner. Scrooge signed it: and Scrooge's name was good upon 'Change, for anything he chose to put his hand to. Old Marley was as dead as a door-nail.`,
        `Scrooge knew he was dead? Of course he did. How could it be otherwise? Scrooge and he were partners for I don't know how many years. Scrooge was his sole executor, his sole administrator, his sole assign, his sole residuary legatee, his sole friend, and sole mourner.`,
        `Once upon a time—of all the good days in the year, on Christmas Eve—old Scrooge sat busy in his counting-house. It was cold, bleak, biting weather: foggy withal: and he could hear the people in the court outside, go wheezing up and down, beating their hands upon their breasts, and stamping their feet upon the pavement stones to warm them.`,
        `'A merry Christmas, uncle! God save you!' cried a cheerful voice. 'Bah!' said Scrooge, 'Humbug!' 'Christmas a humbug, uncle!' said Scrooge's nephew. 'You don't mean that, I am sure?' 'I do,' said Scrooge. 'Merry Christmas! What right have you to be merry? What reason have you to be merry? You're poor enough.' 'Don't be cross, uncle,' said the nephew.`,
      ],
      s: [
        `Marley was dead. Everyone agreed on that. Scrooge signed the burial papers. Old Marley was completely dead.`,
        `Of course Scrooge knew it. They had been partners for many years. Scrooge was Marley's only friend and the only person at his funeral.`,
        `One Christmas Eve, Scrooge was working in his office. It was very cold and foggy. Outside, people stamped their feet to keep warm.`,
        `'Merry Christmas, uncle!' said his nephew in a cheerful voice. 'Bah! Humbug!' said Scrooge. He could see no reason to be merry. 'Don't be cross, uncle,' said the nephew.`,
      ],
      n: [
        `开篇第一句就是全书著名起笔：先宣告马利已死，再反复强调「毫无疑问」。register 指登记簿；'Change 是旧时交易所的简称。`,
        `一连串 sole（唯一的）构成排比，写出两人关系的封闭：他既是合伙人，也是唯一的送葬者。`,
        `counting-house 是账房／办公室；cold, bleak, biting 三个形容词把「冷」层层加码，为后面的温情转折铺垫。`,
        `Humbug 意为「骗人的玩意儿、胡说」，是斯克鲁奇的标志性用词。侄子的 cheerful 与他的 Bah 形成直接对照。`,
      ],
      words: [
        ['register', 'n. 登记簿；名册', '此处指埋葬登记记录；也可作动词「登记、注册」。'],
        ['executor', 'n. 遗嘱执行人', '法律用语：负责按遗嘱处理遗产的人。'],
        ['counting-house', 'n. 账房；办公室', '旧式商业用语，狄更斯时代商人记账之处。'],
        ['humbug', 'n. 胡说；骗人的话', '带强烈不屑，几乎成了 Scrooge 的口头禅。'],
        ['bleak', 'adj. 阴冷荒凉的', '既可写天气，也可写前景或神情。'],
      ],
      quotes: [
        ['Marley was dead: to begin with.', '用最短的陈述开场，把「死亡」放在第一句，奠定全篇冷硬基调。'],
        ['Old Marley was as dead as a door-nail.', 'as dead as a door-nail 是当时俗语，重复强调事情无法挽回。'],
        [`'Bah!' said Scrooge, 'Humbug!'`, '一句台词立住人物的抗拒，是后面所有转变的起点。'],
      ],
      themes: [
        ['死亡与记忆', 'Marley was dead: to begin with.'],
        ['冷漠与节庆的对照', `'A merry Christmas, uncle! God save you!' cried a cheerful voice.`],
        ['孤独与封闭', 'Scrooge was his sole executor, his sole administrator'],
      ],
      chars: [
        ['Ebenezer Scrooge', '吝啬、冷硬、拒绝节日', '开篇用 Humbug 挡回祝福，是后续转变的起点'],
        [`Scrooge's nephew`, '热情、坚持善意', '以 cheerful voice 挑战叔父的冷漠'],
        ['Jacob Marley', '已故的合伙人', '虽已死去，却以「被反复确认的死亡」支配开篇'],
      ],
      symbols: [
        ['天气', '人物内心的冷', 'It was cold, bleak, biting weather'],
        ['账房', '把人困在金钱关系里的空间', 'old Scrooge sat busy in his counting-house'],
      ],
      q: [
        'Why do you think Dickens opens with death instead of with Christmas?',
        'Which line first makes you suspect that Scrooge is lonely, not merely unkind?',
        'How would the opening change if the weather were warm and bright?',
      ],
    }),
    buildChapter({
      id: 'cc-2', title: 'Stave II · The Ghost of Christmas Past', order: 2,
      range: 'Stave II · 精灵现身与出发（教学节选）',
      summary: '斯克鲁奇在深夜一点醒来，黑暗中分不清窗与墙。圣诞过去之灵出现，自称来自「你的过去」，并邀他起身同行；记忆之门就此打开。',
      context: '维多利亚时代的「自省叙事」常借幽灵带人物回看自身历史，把道德转变写成一次重新阅读自己的过程。',
      p: [
        `When Scrooge awoke, it was so dark, that looking out of bed, he could scarcely distinguish the transparent window from the opaque walls of his chamber. He was endeavouring to pierce the darkness with his ferret eyes, when the chimes of a neighbouring church struck the four quarters.`,
        `'Are you the Spirit, sir, whose coming was foretold to me?' asked Scrooge. 'I am!' said a voice. 'I am the Ghost of Christmas Past.' 'Long Past?' inquired Scrooge. 'No. Your past.'`,
        `'Rise! and walk with me!' said the Ghost. The city had entirely vanished. The darkness and the mist had vanished with it, for it was a clear, cold, winter day, with snow upon the ground.`,
      ],
      s: [
        `Scrooge woke up. The room was so dark that he could hardly tell the window from the wall. A nearby church clock struck the quarters.`,
        `'Are you the Spirit I was told about?' he asked. 'I am the Ghost of Christmas Past,' said the voice. 'No. Your past.'`,
        `'Rise! and walk with me!' said the Ghost. The city, the dark and the fog had all gone. It was now a clear, cold winter day with snow on the ground.`,
      ],
      n: [
        `transparent / opaque 一组反义词：连窗与墙都分不清，写的是感知失效，而不只是房间黑。ferret eyes 是「像雪貂一样细窄锐利的眼睛」。`,
        `foretold 是「预先告知」。Scrooge 追问 Long Past?（久远的过去？），精灵回答 Your past.（你的过去。）——把宏大时间收回到个人身上。`,
        `三个 vanished 把城市、黑暗、雾一并抹去，视觉从「看不清」突然切到「clear, cold」；这是记忆开始工作时的画面切换。`,
      ],
      words: [
        ['distinguish', 'v. 区分；辨别', 'distinguish A from B 是常用搭配。'],
        ['transparent', 'adj. 透明的', '与 opaque（不透明的）成对出现。'],
        ['opaque', 'adj. 不透明的；晦涩的', '也可形容文字或理论「难懂」。'],
        ['foretold', 'v. 预言；预先告知', 'foretell 的过去式／过去分词。'],
        ['vanished', 'v. 消失不见', '比 disappeared 更强调「一下子不见」。'],
      ],
      quotes: [
        ['I am the Ghost of Christmas Past.', '精灵不解释身份来历，只报出名字，把想象空间留给读者。'],
        [`'No. Your past.'`, '两个词把「时间」从抽象概念拉回到斯克鲁奇自己身上。'],
        [`'Rise! and walk with me!'`, '祈使句让精灵掌握节奏，人物从被动等待变成被带着走。'],
      ],
      themes: [
        ['记忆与身份', `'No. Your past.'`],
        ['看见与看不见', 'he could scarcely distinguish the transparent window from the opaque walls'],
        ['引导与顺从', `'Rise! and walk with me!' said the Ghost.`],
      ],
      chars: [
        ['Ebenezer Scrooge', '警惕、仍想用理性质问', '先问 Are you the Spirit，再追问 Long Past?'],
        ['圣诞过去之灵', '简短、不容商量', '用 No. Your past. 与祈使句推进'],
      ],
      symbols: [
        ['黑暗', '尚未被记起的过去', 'it was so dark'],
        ['雪地', '记忆重新变得清晰', 'a clear, cold, winter day, with snow upon the ground'],
      ],
      q: [
        'Why does the Ghost answer "Your past" instead of "Long Past"?',
        'What changes when the darkness and the mist vanish?',
        'Who seems to control this conversation, and which words show it?',
      ],
    }),
    buildChapter({
      id: 'cc-3', title: 'Stave III · The Ghost of Christmas Present', order: 3,
      range: 'Stave III · 第二位精灵现身（教学节选）',
      summary: '又是一点整，第二个精灵出现，自称「圣诞现在之灵」，要斯克鲁奇看着自己。它的绿袍、白毛边与明亮神态，和上一位精灵的幽暗形成鲜明反差。',
      context: '狄更斯把「当下」写成一位丰盛、外放、带着节庆气息的访客，与「过去」的幽暗构成结构上的对称。',
      p: [
        `Awaking in the middle of a prodigiously tough snore, and sitting up in bed to get his thoughts together, Scrooge had no occasion to be told that the bell was again upon the stroke of One.`,
        `'I am the Ghost of Christmas Present,' said the Spirit. 'Look upon me!' Scrooge reverently did so. It was clothed in one simple deep green robe, or mantle, bordered with white fur.`,
        `Its dark-brown curls were long and free: free as its genial face, its sparkling eye, its open hand, its cheery voice.`,
      ],
      s: [
        `Scrooge woke up in the middle of a loud snore. He sat up and knew at once that the clock was about to strike one again.`,
        `'I am the Ghost of Christmas Present,' said the Spirit. 'Look upon me!' Scrooge looked carefully. The Spirit wore a simple deep green robe with white fur on the edge.`,
        `Its dark-brown curls were long and loose, just like its friendly face, bright eye, open hand and cheerful voice.`,
      ],
      n: [
        `prodigiously tough snore 是带幽默感的夸张写法；had no occasion to be told 意为「根本不用别人告诉他」，说明他已经在等这个时刻。`,
        `Look upon me! 是命令式，与上一位精灵的 Rise! 呼应。reverently（恭敬地）是斯克鲁奇态度开始松动的第一个信号。`,
        `free 连用时从「头发不受束缚」滑向「神态不受拘束」，四个并列短语把 genial（和蔼）具体化。`,
      ],
      words: [
        ['prodigiously', 'adv. 极其；惊人地', '夸张副词，常带一点幽默。'],
        ['reverently', 'adv. 恭敬地', '与开篇的 Bah! Humbug! 构成态度反差。'],
        ['mantle', 'n. 披风；斗篷', '此处与 robe 并列指同一件外衣。'],
        ['genial', 'adj. 和蔼可亲的', '形容人的气氛感，不形容具体动作。'],
        ['sparkling', 'adj. 闪亮的；神采奕奕的', '既可写光，也可写眼睛。'],
      ],
      quotes: [
        [`'I am the Ghost of Christmas Present,' said the Spirit.`, '与上一章完全平行的句式，建立三段式结构。'],
        [`'Look upon me!'`, '命令句要求「看」，把学习任务交给斯克鲁奇的眼睛。'],
        ['Scrooge reverently did so.', '一个副词就写出了人物姿态的变化。'],
      ],
      themes: [
        ['当下与丰盛', 'Its dark-brown curls were long and free'],
        ['观看与被观看', `'Look upon me!' Scrooge reverently did so.`],
        ['重复中的变化', 'the bell was again upon the stroke of One'],
      ],
      chars: [
        ['Ebenezer Scrooge', '从抗拒转为恭敬', 'reverently did so 是态度转折的可观察证据'],
        ['圣诞现在之灵', '外放、明亮、好客', 'genial face / sparkling eye / open hand / cheery voice'],
      ],
      symbols: [
        ['绿色长袍', '节庆与生机', 'one simple deep green robe, or mantle'],
        ['一点钟', '三次访问的节奏标记', 'the bell was again upon the stroke of One'],
      ],
      q: [
        'How is this Spirit different from the Ghost of Christmas Past? Point to one line.',
        'Why might Dickens repeat the same clock time in two staves?',
        'What does the word "reverently" tell us that the dialogue does not say directly?',
      ],
    }),
  ],
}

/* ---------------------------------------------------------------- *
 * 2. Alice's Adventures in Wonderland — Lewis Carroll, 1865
 * ---------------------------------------------------------------- */
const ALICE: LiteraryBook = {
  id: 'alice-in-wonderland',
  title: `Alice's Adventures in Wonderland`,
  author: 'Lewis Carroll',
  year: 1865,
  emblem: '🐇',
  coverFrom: 'from-mint-400',
  coverTo: 'to-brand-500',
  blurb: '一个无聊的午后，爱丽丝追着一只白兔掉进洞里。身体忽大忽小，规则不断改写，而她始终认真地追问「我是谁」。',
  cefr: 'B1',
  source: 'Project Gutenberg eBook #11 — https://www.gutenberg.org/ebooks/11',
  publicDomainRegion: '全球多数法域：作者 1898 年逝世；1865 年出版，属美国 1929 年前作品。',
  licenseNote: '公有领域（Public Domain）。本应用仅内置短篇节选用于语言学习；Project Gutenberg 商标与站点使用条款另计。',
  excerptNote: EXCERPT_NOTE,
  themes: ['好奇与规则', '身份与变化', '语言游戏'],
  characters: ['Alice', '白兔', '毛毛虫'],
  chapters: [
    buildChapter({
      id: 'al-1', title: 'Chapter I · Down the Rabbit-Hole', order: 1,
      range: 'Chapter I · 开篇至坠入洞中（教学节选）',
      summary: '爱丽丝和姐姐坐在河岸边，无事可做，连姐姐那本没有图画和对话的书都提不起兴趣。一只粉红眼睛的白兔边跑边喊「要迟到了」，她毫不犹豫地跟着跳进兔子洞。',
      context: '维多利亚时代儿童读物常以道德训诫开场；卡罗尔却让「无聊」和「好奇」成为故事的发动机。',
      p: [
        `Alice was beginning to get very tired of sitting by her sister on the bank, and of having nothing to do: once or twice she had peeped into the book her sister was reading, but it had no pictures or conversations in it, 'and what is the use of a book,' thought Alice 'without pictures or conversations?'`,
        `So she was considering in her own mind (as well as she could, for the hot day made her feel very sleepy and stupid), whether the pleasure of making a daisy-chain would be worth the trouble of getting up and picking the daisies, when suddenly a White Rabbit with pink eyes ran close by her.`,
        `There was nothing so VERY remarkable in that; nor did Alice think it so VERY much out of the way to hear the Rabbit say to itself, 'Oh dear! Oh dear! I shall be late!'`,
        `In another moment down went Alice after it, never once considering how in the world she was to get out again. The rabbit-hole went straight on like a tunnel for some way, and then dipped suddenly down, so suddenly that Alice had not a moment to think about stopping herself before she found herself falling down what seemed to be a very deep well.`,
      ],
      s: [
        `Alice was bored. She sat by her sister with nothing to do. She looked at her sister's book, but it had no pictures and no conversations. 'What is the use of a book without pictures or conversations?' she thought.`,
        `It was a hot day and she felt sleepy. She wondered if it was worth standing up to make a daisy-chain. Just then a White Rabbit with pink eyes ran past her.`,
        `That did not seem very strange to her. She was not even very surprised to hear the Rabbit say, 'Oh dear! Oh dear! I shall be late!'`,
        `A moment later Alice ran after it and went down the rabbit-hole. She never stopped to think how she would get out again. The hole went straight like a tunnel, then turned suddenly down, and she was falling into what looked like a very deep well.`,
      ],
      n: [
        `第一句就把「无聊」写成 get very tired of sitting。without pictures or conversations 是爱丽丝对书的评判标准，也悄悄替整本书定了调。`,
        `括号里的插入语打断了句子，模拟半睡半醒的思考节奏；daisy-chain（雏菊花环）是具体而小的日常细节。`,
        `大写的 VERY 是卡罗尔的排版玩笑：越说「没什么了不起」，读者越觉得了不起。say to itself 表示自言自语。`,
        `never once considering 是全章最关键的一笔：好奇心先于谨慎。dipped suddenly down 让句子也跟着「往下掉」。`,
      ],
      words: [
        ['peeped', 'v. 偷看；瞥一眼', 'peep into 指快速、不经意地看。'],
        ['daisy-chain', 'n. 雏菊花环', '由 daisy 串成的儿童游戏。'],
        ['remarkable', 'adj. 值得注意的；非凡的', 'nothing so VERY remarkable 是带反讽的轻描淡写。'],
        ['tunnel', 'n. 隧道；地道', '此处用来形容兔子洞的形状。'],
        ['considering', 'v. 考虑', 'never once considering 表示「一次都没想过」。'],
      ],
      quotes: [
        [`'and what is the use of a book,' thought Alice 'without pictures or conversations?'`, '一句自问既写人物，也戏仿了当时的童书传统。'],
        [`'Oh dear! Oh dear! I shall be late!'`, '白兔的第一句话把「时间」带进一个不讲规则的世界。'],
        ['never once considering how in the world she was to get out again.', '好奇先于谨慎，是整趟冒险的起点。'],
      ],
      themes: [
        ['好奇与冒险', 'In another moment down went Alice after it'],
        ['无聊与想象', 'and of having nothing to do'],
        ['时间焦虑', `'Oh dear! Oh dear! I shall be late!'`],
      ],
      chars: [
        ['Alice', '好奇、爱推理、不过分惊慌', '跟着白兔跳下去，且不为怪事大惊小怪'],
        ['白兔', '匆忙、自言自语', '第一句台词就是 I shall be late!'],
      ],
      symbols: [
        ['兔子洞', '从日常跌入未知', 'The rabbit-hole went straight on like a tunnel'],
        ['没有图画的书', '成人世界的规则', 'it had no pictures or conversations in it'],
      ],
      q: [
        'Why does Alice follow the Rabbit? Find the line that tells us she does not stop to think.',
        'What is funny about the word "VERY" written in capitals?',
        'If the Rabbit had said nothing at all, would Alice still have gone after it?',
      ],
    }),
    buildChapter({
      id: 'al-2', title: 'Chapter II · The Pool of Tears', order: 2,
      range: 'Chapter II · 身体变化与泪池（教学节选）',
      summary: '爱丽丝忽然长高又缩小，惊得连语法都顾不上了，脱口说出 curiouser and curiouser。她一边命令自己别哭，一边哭出一大片泪池；白兔穿戴整齐地重新出现。',
      context: '这一章把「语言规则」也变成可伸缩的东西，是全书最著名的文字游戏之一。',
      p: [
        `'Curiouser and curiouser!' cried Alice (she was so much surprised, that for the moment she quite forgot how to speak good English); 'now I'm opening out like the largest telescope that ever was! Good-bye, feet!'`,
        `'You ought to be ashamed of yourself,' said Alice, 'a great girl like you,' (she might well say this), 'to go on crying in this way! Stop this moment, I tell you!' But she went on all the same, shedding gallons of tears, until there was a large pool all round her.`,
        `Presently she heard a little pattering of feet in the distance, and she hastily dried her eyes to see what was coming. It was the White Rabbit returning, splendidly dressed, with a pair of white kid gloves in one hand and a large fan in the other.`,
      ],
      s: [
        `'Curiouser and curiouser!' cried Alice. She was so surprised that she forgot how to speak good English. 'Now I am growing as tall as the biggest telescope! Good-bye, feet!'`,
        `'You should be ashamed of yourself,' Alice told herself. 'A big girl like you, crying like this! Stop now!' But she went on crying, and soon there was a large pool of tears around her.`,
        `Then she heard small feet in the distance. She dried her eyes quickly. It was the White Rabbit coming back, finely dressed, with white gloves in one hand and a big fan in the other.`,
      ],
      n: [
        `curiouser 是故意写错的比较级（规范写法 more curious）；括号里作者亲自点明「她连规范英语都忘了」，把语言本身变成笑点。`,
        `她用大人的口吻训自己，却完全无效：But she went on all the same。shedding gallons of tears 是夸张，把情绪变成可以量出来的水。`,
        `pattering 是轻快的脚步声；hastily dried her eyes 让画面从自怜立刻切回好奇。白兔的 gloves 与 fan 把「要迟到了」的慌张具体化。`,
      ],
      words: [
        ['curiouser', 'adj. 更古怪（故意的不规则比较级）', '规范英语应为 more curious，这里是文字游戏。'],
        ['telescope', 'n. 望远镜', '用「像望远镜一样伸展开」写身体变长。'],
        ['ashamed', 'adj. 羞愧的', 'be ashamed of oneself 是常用搭配。'],
        ['pattering', 'n. 轻快的啪嗒声', '常形容小而急的脚步或雨点。'],
        ['hastily', 'adv. 匆忙地', '比 quickly 多一层「顾不上」的意味。'],
      ],
      quotes: [
        [`'Curiouser and curiouser!' cried Alice`, '语法被情节压弯，是全书最著名的语言玩笑。'],
        ['she quite forgot how to speak good English', '叙述者直接出面解释笑点，把读者拉进游戏。'],
        ['But she went on all the same', '自我命令与实际行动的落差，写出人物的孩子气。'],
      ],
      themes: [
        ['身体与尺度', `now I'm opening out like the largest telescope that ever was!`],
        ['语言与规则', 'she quite forgot how to speak good English'],
        ['情绪的失控', 'shedding gallons of tears'],
      ],
      chars: [
        ['Alice', '既想当大人又控制不住自己', '训自己别哭，却 went on all the same'],
        ['白兔', '讲究体面、永远匆忙', 'splendidly dressed，手拿手套与扇子'],
      ],
      symbols: [
        ['泪池', '情绪有了体积与边界', 'until there was a large pool all round her'],
        ['手套与扇子', '成人世界的仪态', 'a pair of white kid gloves in one hand and a large fan in the other'],
      ],
      q: [
        'What makes "curiouser" funny, and why does the narrator explain it?',
        'Does Alice sound more like a child or an adult when she scolds herself? Use a line.',
        'Why might Carroll turn tears into a pool instead of just saying she cried a lot?',
      ],
    }),
    buildChapter({
      id: 'al-3', title: 'Chapter V · Advice from a Caterpillar', order: 3,
      range: 'Chapter V · 与毛毛虫的对话（教学节选）',
      summary: '毛毛虫从水烟袋上抬起头，懒洋洋地问「你是谁」。爱丽丝答不上来：起床时还知道自己是谁，可这一天里已经变了好几次。它只回了一句「把话说清楚」。',
      context: '这一章把「身份」变成可讨论的哲学问题，用儿童对话的语气讲出来。',
      p: [
        `The Caterpillar and Alice looked at each other for some time in silence: at last the Caterpillar took the hookah out of its mouth, and addressed her in a languid, sleepy voice. 'Who are YOU?' said the Caterpillar.`,
        `'I—I hardly know, sir, just at present,' Alice replied rather shyly, 'at least I know who I WAS when I got up this morning, but I think I must have been changed several times since then.'`,
        `'What do you mean by that?' said the Caterpillar sternly. 'Explain yourself!' 'I can't explain MYSELF, I'm afraid, sir,' said Alice, 'because I'm not myself, you see.'`,
      ],
      s: [
        `Alice and the Caterpillar looked at each other without speaking. At last it took the pipe out of its mouth and asked in a slow, sleepy voice: 'Who are YOU?'`,
        `'I hardly know, sir,' Alice said shyly. 'I knew who I was when I got up this morning, but I think I have changed several times since then.'`,
        `'What do you mean?' said the Caterpillar sternly. 'Explain yourself!' 'I am afraid I cannot explain myself,' said Alice, 'because I am not myself, you see.'`,
      ],
      n: [
        `大写的 YOU 表示重读：问题落在「你」而不是「是谁」。languid, sleepy 让提问者的节奏慢到几乎不关心答案。`,
        `破折号与 rather shyly 写出犹豫；I WAS 用大写把「今早的我」和「现在的我」分开，是全章最关键的一处语法细节。`,
        `Explain yourself! 与 I can't explain MYSELF 形成回环：同一个词被两种理解撞在一起，身份问题因此变成语言问题。`,
      ],
      words: [
        ['hookah', 'n. 水烟袋', '具有异域感的道具，让画面静止下来。'],
        ['languid', 'adj. 懒洋洋的；无力的', '形容语气或动作节奏。'],
        ['addressed', 'v. 对……说话', 'address somebody 较正式。'],
        ['sternly', 'adv. 严厉地', '与前面的 sleepy 形成语气反差。'],
        ['shyly', 'adv. 羞怯地', '写出爱丽丝少见的底气不足。'],
      ],
      quotes: [
        [`'Who are YOU?' said the Caterpillar.`, '一个最短的问题，把整章引向身份。'],
        ['at least I know who I WAS when I got up this morning', '用时态区分「过去的我」与「现在的我」。'],
        [`'Explain yourself!' 'I can't explain MYSELF, I'm afraid, sir,'`, '同一个短语的两次使用，把哲学问题变成语言问题。'],
      ],
      themes: [
        ['身份与变化', 'I think I must have been changed several times since then'],
        ['解释的困难', `I can't explain MYSELF, I'm afraid, sir,`],
        ['权力与提问', `'What do you mean by that?' said the Caterpillar sternly.`],
      ],
      chars: [
        ['Alice', '不确定但仍努力回答', '用 I—I hardly know 开头，仍试着讲清自己'],
        ['毛毛虫', '缓慢、居高临下', '先沉默，再用 sternly 的短句追问'],
      ],
      symbols: [
        ['水烟袋', '暂停与旁观', 'took the hookah out of its mouth'],
        ['大写词', '重音与概念的强调', 'Who are YOU?'],
      ],
      q: [
        'Why does Alice say "I WAS" instead of "I AM"? Point to the exact line.',
        'Who holds power in this conversation? Which short sentences show it?',
        'Is "Explain yourself" the same request as "explain myself"? Why or why not?',
      ],
    }),
  ],
}

/* ---------------------------------------------------------------- *
 * 3. The Adventures of Sherlock Holmes — Arthur Conan Doyle, 1892
 * ---------------------------------------------------------------- */
const HOLMES: LiteraryBook = {
  id: 'sherlock-holmes',
  title: 'The Adventures of Sherlock Holmes',
  author: 'Arthur Conan Doyle',
  year: 1892,
  emblem: '🔍',
  coverFrom: 'from-brand-600',
  coverTo: 'to-[#5b46c9]',
  blurb: '华生以回忆录的口吻写下福尔摩斯。本模块节选《波希米亚丑闻》的开篇：一位「那位女士」，以及一句关于「先有材料，再有推论」的著名提醒。',
  cefr: 'B2',
  source: 'Project Gutenberg eBook #1661 — https://www.gutenberg.org/ebooks/1661',
  publicDomainRegion: '美国：1891–1892 年连载／出版，属 1929 年前作品；欧盟与中国：作者 1930 年逝世，保护期已届满。',
  licenseNote: '公有领域（Public Domain）。本应用仅内置短篇节选用于语言学习；不同法域对后续汇编可能有差异，请以所在地法律与 Project Gutenberg 标注为准。',
  excerptNote: EXCERPT_NOTE,
  themes: ['观察与推论', '叙述者的可靠性', '理性与情感'],
  characters: ['Sherlock Holmes', 'Dr. Watson', 'Irene Adler'],
  chapters: [
    buildChapter({
      id: 'sh-1', title: 'A Scandal in Bohemia · The woman', order: 1,
      range: '《波希米亚丑闻》开篇（教学节选）',
      summary: '叙述者一开口就宣告：在福尔摩斯口中，她永远是「那位女士」。但他随即澄清，这不是爱情，而是这位冷静的推理机器对一个能胜过自己的人的另眼相看。',
      context: '十九世纪末的侦探小说把「观察」塑造成一种近乎科学的方法，叙述者华生则承担了把方法翻译成故事的角色。',
      p: [
        `To Sherlock Holmes she is always THE woman. I have seldom heard him mention her under any other name. In his eyes she eclipses and predominates the whole of her sex.`,
        `It was not that he felt any emotion akin to love for Irene Adler. All emotions, and that one particularly, were abhorrent to his cold, precise but admirably balanced mind.`,
        `He was, I take it, the most perfect reasoning and observing machine that the world has seen, but as a lover he would have placed himself in a false position. He never spoke of the softer passions, save with a gibe and a sneer.`,
      ],
      s: [
        `For Sherlock Holmes, she is always 'THE woman'. He hardly ever calls her by any other name. In his eyes, she stands above all other women.`,
        `That does not mean he loved Irene Adler. Feelings of any kind — especially love — were unwelcome to his cold, exact and very well-balanced mind.`,
        `I think he was the finest machine for reasoning and observing that the world had ever seen. But as a lover he would have been out of place. He only spoke of tender feelings with a joke or a mocking smile.`,
      ],
      n: [
        `大写的 THE 是重读标记，等于「独一无二的那位」。eclipses and predominates 两个动词把「胜过」写到近乎天文尺度。`,
        `akin to 意为「类似于」；abhorrent to 是「令……极为反感」。叙述者先替读者排除最通俗的解释，反而让悬念更强。`,
        `reasoning and observing machine 是全篇最著名的比喻；save with 意为「除了以……方式」，gibe and a sneer 把冷感落到语气上。`,
      ],
      words: [
        ['eclipses', 'v. 使黯然失色', 'eclipse 本义为「日食／月食」。'],
        ['predominates', 'v. 占主导；胜过', '正式用词，比 is better than 更有分量。'],
        ['abhorrent', 'adj. 令人厌恶的', 'abhorrent to somebody 是固定搭配。'],
        ['gibe', 'n. 嘲弄；讥笑', '与 sneer（冷笑）并列，写语气。'],
        ['save', 'prep. 除……之外', '此处为较古旧的书面用法。'],
      ],
      quotes: [
        ['To Sherlock Holmes she is always THE woman.', '用大写制造悬念，一句话定下整篇的视角。'],
        ['All emotions, and that one particularly, were abhorrent to his cold, precise but admirably balanced mind.', '叙述者主动否认爱情解释，把注意力转向「智识上的敬重」。'],
        ['the most perfect reasoning and observing machine that the world has seen', '比喻把人物写成工具，也为后面的反差埋线。'],
      ],
      themes: [
        ['理性与情感', 'All emotions, and that one particularly, were abhorrent'],
        ['叙述者视角', 'I have seldom heard him mention her under any other name'],
        ['敬重而非爱情', 'To Sherlock Holmes she is always THE woman.'],
      ],
      chars: [
        ['Sherlock Holmes', '冷静、精确、回避情感', '被比作 reasoning and observing machine'],
        ['Dr. Watson', '转述者、替读者解释的人', '用 I take it 表明这是他的判断而非事实'],
        ['Irene Adler', '尚未出场却已支配开篇', '只以 THE woman 出现，身份被悬置'],
      ],
      symbols: [
        ['机器', '绝对理性', 'the most perfect reasoning and observing machine'],
        ['大写的 THE', '唯一性与神话化', 'she is always THE woman'],
      ],
      q: [
        'Why does Watson deny that Holmes felt love? What does that denial make you look for instead?',
        'Which words tell you this is Watson\'s judgement, not an objective fact?',
        'What does the metaphor of a "machine" leave out about a person?',
      ],
    }),
    buildChapter({
      id: 'sh-2', title: 'A Scandal in Bohemia · No data yet', order: 2,
      range: '《波希米亚丑闻》华生回访与福尔摩斯的方法论（教学节选）',
      summary: '婚后华生与福尔摩斯渐行渐远，某个三月夜晚他路过贝克街，又想起这位老友。故事借福尔摩斯的一句提醒立住方法论：材料未齐之前不要先立理论，否则会不自觉地把事实掰弯去迁就猜想。',
      context: '「先证据、后假说」是十九世纪实证精神的文学化表达，也是侦探类型最核心的思维训练。',
      p: [
        `I had seen little of Holmes lately. My marriage had drifted us away from each other.`,
        `One night—it was on the twentieth of March, 1888—I was returning from a journey to a patient, when my way led me through Baker Street.`,
        `'I have no data yet. It is a capital mistake to theorize before one has data. Insensibly one begins to twist facts to suit theories, instead of theories to suit facts.'`,
      ],
      s: [
        `I had not seen much of Holmes recently. Since I got married, we had slowly moved apart.`,
        `One night, on the twentieth of March 1888, I was coming back from visiting a patient, and my road took me through Baker Street.`,
        `'I have no facts yet. It is a serious mistake to build a theory before you have facts. Without noticing, you start bending the facts to fit your theory, instead of changing the theory to fit the facts.'`,
      ],
      n: [
        `drifted us away 用「漂」写关系的疏远，比主动动词更轻、也更无奈。`,
        `破折号插入精确日期，是华生回忆录式的标记；when my way led me through 把重逢写成顺路，压低了戏剧性。`,
        `capital 在此意为「重大的」；Insensibly 指「不知不觉地」。twist facts to suit theories 与 theories to suit facts 的镜像结构，是这句格言好记的原因。`,
      ],
      words: [
        ['drifted', 'v. 渐渐漂离', '写关系疏远，不带责备。'],
        ['capital', 'adj. 重大的；极好的（旧用）', 'a capital mistake 意为「一个大错」。'],
        ['theorize', 'v. 建立理论；空想', 'before one has data 是它的限定条件。'],
        ['insensibly', 'adv. 不知不觉地', '强调偏差是在无意识中发生的。'],
        ['twist', 'v. 扭曲；掰弯', '此处指为了迁就结论而歪曲事实。'],
      ],
      quotes: [
        ['My marriage had drifted us away from each other.', '一个动词写出时间带来的距离。'],
        ['It is a capital mistake to theorize before one has data.', '把「先证据后推论」写成可引用的格言。'],
        ['instead of theories to suit facts.', '镜像结构让方法论变成一句容易记住的话。'],
      ],
      themes: [
        ['证据先于结论', 'It is a capital mistake to theorize before one has data.'],
        ['偏见的形成', 'Insensibly one begins to twist facts to suit theories'],
        ['时间与友谊', 'My marriage had drifted us away from each other.'],
      ],
      chars: [
        ['Dr. Watson', '怀旧、观察细致', '用精确日期与「顺路」重建两人关系'],
        ['Sherlock Holmes', '方法严谨、拒绝臆测', '以 I have no data yet 直接划出边界'],
      ],
      symbols: [
        ['贝克街', '旧日生活的坐标', 'my way led me through Baker Street'],
        ['材料 data', '推论的地基', 'I have no data yet'],
      ],
      q: [
        'Why is "Insensibly" important in Holmes\'s warning?',
        'How does the mirrored ending — "theories to suit facts" — change the meaning?',
        'Where in this chapter does Watson give us evidence about his own life rather than Holmes?',
      ],
    }),
  ],
}

/* ---------------------------------------------------------------- *
 * 4. The Yellow Wallpaper — Charlotte Perkins Gilman, 1892
 * ---------------------------------------------------------------- */
const YELLOW_WALLPAPER: LiteraryBook = {
  id: 'yellow-wallpaper',
  title: 'The Yellow Wallpaper',
  author: 'Charlotte Perkins Gilman',
  year: 1892,
  emblem: '🌿',
  coverFrom: 'from-sun-400',
  coverTo: 'to-coral-400',
  blurb: '一篇以日记体写成的短篇：叙述者被丈夫安排在一间旧宅里「休息」，不得写作。她开始盯着那面黄色墙纸，并一点点看出别的东西。',
  cefr: 'B2',
  source: 'Project Gutenberg eBook #1952 — https://www.gutenberg.org/ebooks/1952',
  publicDomainRegion: '美国：1892 年发表，属 1929 年前作品；欧盟与中国：作者 1935 年逝世，保护期已届满。',
  licenseNote: '公有领域（Public Domain）。本应用仅内置短篇节选用于语言学习；不同法域规则可能不同，请以所在地法律与 Project Gutenberg 标注为准。',
  excerptNote: EXCERPT_NOTE,
  themes: ['凝视与解释', '被规定的休息', '叙述的可信度'],
  characters: ['叙述者', 'John'],
  chapters: [
    buildChapter({
      id: 'yw-1', title: 'The ancestral hall', order: 1,
      range: '开篇 · 旧宅与医生丈夫（教学节选）',
      summary: '叙述者和丈夫约翰租下一座祖传老宅过夏天。她半开玩笑地觉得这房子「有点古怪」，又因为丈夫是医生、并不相信她真的病了，于是只能在「这张死纸上」悄悄写下自己的判断。',
      context: '十九世纪末的「休息疗法」常要求女性患者停止写作与工作；这篇小说正是对这种安排的文学回应。',
      p: [
        `It is very seldom that mere ordinary people like John and myself secure ancestral halls for the summer.`,
        `A colonial mansion, a hereditary estate, I would say a haunted house, and reach the height of romantic felicity—but that would be asking too much of fate! Still I will proudly declare that there is something queer about it.`,
        `John is a physician, and perhaps—(I would not say it to a living soul, of course, but this is dead paper and a great relief to my mind—) perhaps that is one reason I do not get well faster. You see he does not believe I am sick!`,
      ],
      s: [
        `Ordinary people like John and me do not often rent an old family house for the summer.`,
        `A colonial mansion, a family estate — I would even call it a haunted house, and be perfectly happy. But that would be asking too much of fate! Still, I will say it clearly: there is something strange about this place.`,
        `John is a doctor. Maybe — I would never say this to a living person, but this is only dead paper and it eases my mind — maybe that is one reason I am not getting better faster. You see, he does not believe I am ill!`,
      ],
      n: [
        `mere ordinary people 是自谦，ancestral halls 却夸张，第一句就带出叙述者又俏皮又不安的语气。secure 在此意为「租到、弄到」。`,
        `她主动把房子想象成 haunted house，又立刻用 but 收回来；proudly declare 与 something queer 并列，显示她既想辩护又想承认。`,
        `括号是「只能对纸说」的秘密通道：dead paper 与 a living soul 对立。末句 You see he does not believe I am sick! 用感叹号把整篇的冲突亮出来。`,
      ],
      words: [
        ['ancestral', 'adj. 祖传的', 'ancestral halls 指世代相传的宅邸。'],
        ['hereditary', 'adj. 世袭的；遗传的', '此处修饰 estate（地产）。'],
        ['felicity', 'n. 幸福；极乐', '较书面，带一点反讽的夸张。'],
        ['queer', 'adj. 古怪的', '在 1892 年主要表示「奇异」，不含现代性向含义。'],
        ['physician', 'n. 内科医生', '与 surgeon（外科医生）相对。'],
      ],
      quotes: [
        ['It is very seldom that mere ordinary people like John and myself secure ancestral halls for the summer.', '自谦与夸张并置，第一句就定下叙述语气。'],
        ['Still I will proudly declare that there is something queer about it.', '叙述者坚持自己的判断，即使刚刚自我否定过。'],
        ['You see he does not believe I am sick!', '冲突一句话说清：谁有权定义「生病」。'],
      ],
      themes: [
        ['谁有权判断病情', 'You see he does not believe I am sick!'],
        ['秘密书写', 'but this is dead paper and a great relief to my mind'],
        ['理性与不安', 'there is something queer about it'],
      ],
      chars: [
        ['叙述者', '敏感、自我审查、坚持观察', '把真实想法只写进 dead paper'],
        ['John', '医生、务实、否定她的感受', 'he does not believe I am sick'],
      ],
      symbols: [
        ['祖传老宅', '被安排好的处境', 'ancestral halls for the summer'],
        ['死纸', '唯一可倾诉的对象', 'this is dead paper'],
      ],
      q: [
        'Why does the narrator say she would not tell "a living soul"? Which line shows it?',
        'What is the effect of the brackets in the third paragraph?',
        'Who seems to have authority in this house? Find one sentence as evidence.',
      ],
    }),
    buildChapter({
      id: 'yw-2', title: 'The colour of the paper', order: 2,
      range: '中段 · 墙纸的颜色与表情（教学节选）',
      summary: '叙述者开始细描墙纸：发闷的脏黄、暗橙与病态的硫磺色。她由「孩子一定讨厌它」推到「我从没见过一件没有生命的东西有这么多表情」，观看逐渐变成解读。',
      context: '把「注视」写成逐步升级的动作，是这篇小说从写实滑向心理叙事的关键手法。',
      p: [
        `The color is repellant, almost revolting; a smouldering unclean yellow, strangely faded by the slow-turning sunlight.`,
        `It is a dull yet lurid orange in some places, a sickly sulphur tint in others. No wonder the children hated it!`,
        `I never saw so much expression in an inanimate thing before, and we all know how much expression they have!`,
      ],
      s: [
        `The colour is ugly, almost disgusting: a smoky, dirty yellow, oddly faded by the slowly moving sunlight.`,
        `In some places it is a dull but harsh orange; in others, a pale, unhealthy yellow. It is no surprise that the children hated it.`,
        `I had never seen so much expression in something without life before — and we all know how much expression such things can have!`,
      ],
      n: [
        `repellant / revolting 层层加码；smouldering（闷烧的）把颜色写成有温度、有隐患的东西。slow-turning sunlight 让时间进入画面。`,
        `dull yet lurid 是一组自相矛盾的形容，sickly 把颜色写成病态；No wonder 把「孩子讨厌它」说成理所当然，其实是叙述者在替自己的厌恶找同盟。`,
        `末句的 and we all know... 看似轻松，却把「无生命之物有表情」当成共识——这是叙述开始脱离共同现实的第一处信号。`,
      ],
      words: [
        ['repellant', 'adj. 令人反感的', '也写作 repellent。'],
        ['smouldering', 'adj. 闷烧的；压抑的', '暗示热度被压着，没有真正烧起来。'],
        ['lurid', 'adj. 刺眼的；骇人的', '与 dull 并列，制造矛盾感。'],
        ['sickly', 'adj. 病态的；苍白乏力的', '把颜色与身体状态连起来。'],
        ['inanimate', 'adj. 无生命的', '与 expression 搭配，形成全篇的张力。'],
      ],
      quotes: [
        ['a smouldering unclean yellow, strangely faded by the slow-turning sunlight.', '颜色被写成有温度、有时间的东西。'],
        ['It is a dull yet lurid orange in some places', '矛盾形容词显示描述已不再只是客观记录。'],
        ['I never saw so much expression in an inanimate thing before', '「观看」开始变成「解读」的转折句。'],
      ],
      themes: [
        ['凝视与解释', 'I never saw so much expression in an inanimate thing before'],
        ['厌恶的修辞', 'The color is repellant, almost revolting'],
        ['现实的松动', 'and we all know how much expression they have!'],
      ],
      chars: [
        ['叙述者', '越看越投入、把物人格化', '从颜色描写一路推到 inanimate thing 的「表情」'],
        ['孩子们', '被引用为看不见的同盟', 'No wonder the children hated it!'],
      ],
      symbols: [
        ['黄色墙纸', '被反复阅读的对象', 'a smouldering unclean yellow'],
        ['阳光', '缓慢改变观看的时间', 'strangely faded by the slow-turning sunlight'],
      ],
      q: [
        'Which adjectives in the first two paragraphs belong to a body rather than to a colour?',
        'At what exact line does description turn into interpretation?',
        'Why does the narrator add "and we all know how much expression they have!" at the end?',
      ],
    }),
  ],
}

/* ---------------------------------------------------------------- *
 * 5. Pride and Prejudice — Jane Austen, 1813（可选长篇，仅节选 2 章）
 * ---------------------------------------------------------------- */
const PRIDE: LiteraryBook = {
  id: 'pride-and-prejudice',
  title: 'Pride and Prejudice',
  author: 'Jane Austen',
  year: 1813,
  emblem: '🪶',
  coverFrom: 'from-coral-400',
  coverTo: 'to-brand-500',
  blurb: '一句「举世公认的真理」拉开全书的帷幕：有钱的单身汉总得娶位太太。紧接着，班纳特夫妇用一段短短的对话把这句「真理」拆成了街坊的算盘。',
  cefr: 'B2',
  source: 'Project Gutenberg eBook #1342 — https://www.gutenberg.org/ebooks/1342',
  publicDomainRegion: '全球多数法域：作者 1817 年逝世；1813 年出版。',
  licenseNote: '公有领域（Public Domain）。本应用仅内置短篇节选用于语言学习；Project Gutenberg 商标与站点使用条款另计。',
  excerptNote: EXCERPT_NOTE,
  themes: ['社会成规', '婚姻与财产', '反讽'],
  characters: ['班纳特太太', '班纳特先生', 'Mr. Bingley'],
  chapters: [
    buildChapter({
      id: 'pp-1', title: 'Chapter I · A truth universally acknowledged', order: 1,
      range: 'Chapter I · 开篇（教学节选）',
      summary: '叙述者先以近乎法律的口吻宣布一条「举世公认的真理」，第二句就悄悄把它还原成邻里们的共同期待。随后班纳特太太带来消息：尼日斐花园终于租出去了。',
      context: '摄政时期英国乡绅阶层中，财产、继承与婚姻紧密绑定；奥斯汀用反讽把这套社会逻辑写成一句笑话。',
      p: [
        `It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.`,
        `However little known the feelings or views of such a man may be on his first entering a neighbourhood, this truth is so well fixed in the minds of the surrounding families, that he is considered as the rightful property of some one or other of their daughters.`,
        `'My dear Mr. Bennet,' said his lady to him one day, 'have you heard that Netherfield Park is let at last?' Mr. Bennet replied that he had not. 'But it is,' returned she; 'for Mrs. Long has just been here, and she told me all about it.'`,
      ],
      s: [
        `Everyone agrees on one thing: a single man with a good income must want a wife.`,
        `Nobody knows what that man actually thinks when he first moves into an area. But the families nearby are so sure of this 'truth' that they already treat him as belonging to one of their daughters.`,
        `'My dear Mr. Bennet,' his wife said one day, 'have you heard that Netherfield Park has finally been let?' Mr. Bennet said he had not. 'But it has,' she answered, 'because Mrs. Long has just been here and told me all about it.'`,
      ],
      n: [
        `truth universally acknowledged 语气像格言或法律条文，must be in want of 又用了极正式的措辞；越庄重，后面拆台越好笑。`,
        `第二句把「真理」的来源点破：其实是 surrounding families 的心照不宣。rightful property 一词把人写成待分配的财产，是反讽的核心。`,
        `is let 意为「被租出」。班纳特先生只答了 that he had not，太太却立刻补上细节——两人的对话节奏已经写出性格。`,
      ],
      words: [
        ['universally', 'adv. 普遍地；举世地', '把一句闲话抬成「公理」。'],
        ['acknowledged', 'adj. 公认的', '暗示这是大家的共识，不是事实。'],
        ['in want of', 'phr. 需要；缺少', '较正式的旧式表达。'],
        ['rightful', 'adj. 名正言顺的', '与 property 搭配，制造反讽。'],
        ['let', 'v. 出租', 'is let = 已被租出，不是「让」。'],
      ],
      quotes: [
        ['It is a truth universally acknowledged, that a single man in possession of a good fortune, must be in want of a wife.', '英文小说最著名的开场之一，语气庄重得近乎可疑。'],
        ['this truth is so well fixed in the minds of the surrounding families', '第二句就把「真理」还原成街坊的共同想法。'],
        ['he is considered as the rightful property of some one or other of their daughters.', '把人称作 property，一句完成反讽。'],
      ],
      themes: [
        ['社会成规', 'It is a truth universally acknowledged'],
        ['婚姻与财产', 'a single man in possession of a good fortune'],
        ['反讽', 'he is considered as the rightful property of some one or other of their daughters.'],
      ],
      chars: [
        ['叙述者', '表面庄重、暗含讥讽', '先立「真理」，第二句立刻交代它来自谁'],
        ['班纳特太太', '消息灵通、急切', 'have you heard that Netherfield Park is let at last?'],
        ['班纳特先生', '简短、不动声色', 'Mr. Bennet replied that he had not.'],
      ],
      symbols: [
        ['尼日斐花园', '外来者与新机会', 'Netherfield Park is let at last'],
        ['财产', '被换算的人际关系', 'the rightful property of some one or other of their daughters'],
      ],
      q: [
        'Whose "truth" is this, really? Which phrase in sentence two gives it away?',
        'What is odd about calling a man "rightful property"?',
        'How much do we learn about Mr. and Mrs. Bennet from just two short lines of dialogue?',
      ],
    }),
    buildChapter({
      id: 'pp-2', title: 'Chapter I · You want to tell me', order: 2,
      range: 'Chapter I · 夫妻对话续（教学节选）',
      summary: '太太急着问租客是谁，班纳特先生却慢悠悠地说「你想讲，我不反对听」。于是消息倾泻而出：一位来自北方、每年四五千镑的年轻单身汉，姓宾利。',
      context: '收入数字在摄政时期小说里不是闲笔，它让读者立刻明白这段婚姻市场里的相对位置。',
      p: [
        `'Do you not want to know who has taken it?' cried his wife impatiently. 'YOU want to tell me, and I have no objection to hearing it.' This was invitation enough.`,
        `'Why, my dear, you must know, Mrs. Long says that Netherfield is taken by a young man of large fortune from the north of England.'`,
        `'What is his name?' 'Bingley.' 'Is he married or single?' 'Oh! single, my dear, to be sure! A single man of large fortune; four or five thousand a year. What a fine thing for our girls!'`,
      ],
      s: [
        `'Do you not want to know who has taken it?' cried his wife impatiently. 'YOU want to tell me, and I have no objection to hearing it.' That was enough of an invitation.`,
        `'Well, my dear, you must know — Mrs. Long says Netherfield has been taken by a young man with a large fortune from the north of England.'`,
        `'What is his name?' 'Bingley.' 'Is he married or single?' 'Oh! single, my dear, of course! A single man with a large fortune; four or five thousand a year. What a fine thing for our girls!'`,
      ],
      n: [
        `大写的 YOU 表示重读，班纳特先生不接问题，反而点破妻子的动机；I have no objection to hearing it 是礼貌到近乎逗弄的让步。`,
        `Why, my dear, you must know 用一串缓冲词拖住节奏，与上一句的 impatiently 形成喜剧性的快慢差。`,
        `四个短问句连发，最后落在 four or five thousand a year 这个具体数字上。What a fine thing for our girls! 把「真理」落回自家算盘。`,
      ],
      words: [
        ['impatiently', 'adv. 不耐烦地', '与 Mr. Bennet 的慢形成对照。'],
        ['objection', 'n. 反对；异议', 'have no objection to doing 是固定搭配。'],
        ['fortune', 'n. 财富；大笔财产', 'a man of large fortune 是当时常见说法。'],
        ['to be sure', 'phr. 当然；的确', '旧式口语，加强肯定。'],
        ['fine', 'adj. 极好的（此处带反讽）', 'What a fine thing 既像赞叹也像算计。'],
      ],
      quotes: [
        [`'YOU want to tell me, and I have no objection to hearing it.'`, '不答反问，反而点破对方的动机，是全章最妙的一句。'],
        ['This was invitation enough.', '叙述者一句短评，把夫妻间的默契写成笑点。'],
        ['A single man of large fortune; four or five thousand a year.', '抽象「真理」落到具体数字，反讽完成闭环。'],
      ],
      themes: [
        ['对话中的权力', `'YOU want to tell me, and I have no objection to hearing it.'`],
        ['婚姻与财产', 'A single man of large fortune; four or five thousand a year.'],
        ['反讽', 'What a fine thing for our girls!'],
      ],
      chars: [
        ['班纳特先生', '不动声色、善于逗弄', '用 YOU 的重读把问题推回去'],
        ['班纳特太太', '急切、目标明确', '连续追问姓名与婚姻状况'],
        ['Mr. Bingley', '尚未出场已被定价', 'four or five thousand a year'],
      ],
      symbols: [
        ['四五千镑', '婚姻市场的度量衡', 'four or five thousand a year'],
        ['大写的 YOU', '语气里的戏谑', 'YOU want to tell me'],
      ],
      q: [
        'Why does Mr. Bennet answer the question with a statement about his wife?',
        'What changes when the word "single" is repeated with a number after it?',
        'Is the narrator laughing with Mr. Bennet or at Mrs. Bennet? Give a line as evidence.',
      ],
    }),
  ],
}

/** 内置书单：只此 5 本，全部通过版权三件套校验 */
export const BUILTIN_BOOKS: LiteraryBook[] = [
  CHRISTMAS_CAROL, ALICE, HOLMES, YELLOW_WALLPAPER, PRIDE,
]

/** 内置书 id 白名单，迁移与自定义文本校验都用它 */
export const BUILTIN_BOOK_IDS = BUILTIN_BOOKS.map((b) => b.id)

/* ---------------- 四个新键的默认值 ---------------- */

export const DEFAULT_LIBRARY_STATE: LibraryState = {
  seedVersion: LIBRARY_SEED_VERSION,
  books: BUILTIN_BOOKS,
  briefs: {},
}

export const DEFAULT_READING_PROGRESS: ReadingProgressState = {}
export const DEFAULT_SEMINARS: SeminarState = []
export const DEFAULT_LITERARY_NOTES: LiteraryNotesState = {
  notes: [], highlights: [], bookmarks: [], savedWords: [],
}

/** 新增的两个设置项默认值（迁移时只补缺，不覆盖旧值） */
export const LITERARY_SETTING_DEFAULTS: {
  readingView: ReadingViewMode
  seminarGuidance: GuidanceStrength
} = {
  readingView: 'original',
  seminarGuidance: 'medium',
}
