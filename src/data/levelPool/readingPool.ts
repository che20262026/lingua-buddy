/**
 * 阅读模块分级内容池（模块 2：经典阅读 / Seminar）
 *
 * 来源分层（README 第二十章有完整许可表）：
 * - gutenberg            Project Gutenberg 公有领域作品：全文可读，应用内只内嵌既有教学节选
 * - original             LinguaBuddy 原创章节简报与研讨问题（第一优先级，始终保留）
 * - reading_corner_method  The Reading Corner 分级框架：只参考「同一文本、按等级给不同注释深度」的思路，
 *                          不抓取其内容；三视图等级自适应由 LevelFilterService.annotationDepth() 提供
 *
 * 粒度：既有书籍给书籍级条目，另给部分章节单独标注章节级 cefr（允许与书籍级不同）。
 * 用户跳级/留级按章节粒度筛选，不整本书锁死。
 *
 * 明确未纳入：《The Red Raincoat》未确认公版版本；《The Great Gatsby》公版状态需逐地区确认，
 * 本轮改用同为 C1 难度的公有领域作品《The Picture of Dorian Gray》(1890) 替代。
 */

import type { ContentItem } from '../../levelTypes'

export const READING_POOL: ContentItem[] = [
  /* ---- 既有 5 本公版书：书籍级 ---- */
  {
    id: 'read-book-carol', module: 'reading', cefr: 'B1',
    title: 'A Christmas Carol', titleZh: '圣诞颂歌',
    source: 'gutenberg', sourceLabel: 'Project Gutenberg · 公有领域',
    licenseNote: 'Public Domain；既有教学节选已内嵌，全文可从 Gutenberg 获取',
    refId: 'christmas-carol',
    cefrBasis: { vocabCoverage: 0.88, avgSentenceLength: 15, syntaxComplexity: 'compound', pragmaticLoad: 'medium' },
    levelSource: 'estimated',
    levelNotes: '由 LiteraryAnalyzerAgent 按节选的词汇覆盖率、平均句长与句法复杂度估算为 B1。',
    blurb: '三章节选：从「Marley was dead」的开篇事实，走到人物态度的转折。',
    tags: ['gutenberg', 'B1', 'book'],
  },
  {
    id: 'read-book-alice', module: 'reading', cefr: 'B1',
    title: 'Alice’s Adventures in Wonderland', titleZh: '爱丽丝梦游仙境',
    source: 'gutenberg', sourceLabel: 'Project Gutenberg · 公有领域',
    licenseNote: 'Public Domain；既有教学节选已内嵌，全文可从 Gutenberg 获取',
    refId: 'alice-in-wonderland',
    cefrBasis: { vocabCoverage: 0.84, avgSentenceLength: 16, syntaxComplexity: 'compound', pragmaticLoad: 'medium' },
    levelSource: 'estimated',
    levelNotes: '约每 100 词 8 个生僻词；对话多、句法中等，双关与文字游戏抬高理解成本。',
    blurb: '三章节选：掉进兔子洞、眼泪池塘、毛毛虫的建议；适合练「从原文找证据」。',
    tags: ['gutenberg', 'B1', 'book'],
  },
  {
    id: 'read-book-sherlock', module: 'reading', cefr: 'B2',
    title: 'A Scandal in Bohemia', titleZh: '波希米亚丑闻',
    source: 'gutenberg', sourceLabel: 'Project Gutenberg · 公有领域',
    licenseNote: 'Public Domain；既有教学节选已内嵌，全文可从 Gutenberg 获取',
    refId: 'sherlock-holmes',
    cefrBasis: { vocabCoverage: 0.78, avgSentenceLength: 21, syntaxComplexity: 'complex', pragmaticLoad: 'high' },
    levelSource: 'estimated',
    levelNotes: '叙述层嵌套、推理链长，需从细节反推人物动机，语用负载高。',
    blurb: '两章节选：先看「没有数据」怎样成为一条线索，再练提出可验证的判断。',
    tags: ['gutenberg', 'B2', 'book'],
  },
  {
    id: 'read-book-wallpaper', module: 'reading', cefr: 'B2',
    title: 'The Yellow Wallpaper', titleZh: '黄色墙纸',
    source: 'gutenberg', sourceLabel: 'Project Gutenberg · 公有领域',
    licenseNote: 'Public Domain；既有教学节选已内嵌，全文可从 Gutenberg 获取',
    refId: 'yellow-wallpaper',
    cefrBasis: { vocabCoverage: 0.79, avgSentenceLength: 20, syntaxComplexity: 'complex', pragmaticLoad: 'high' },
    levelSource: 'estimated',
    levelNotes: '第一人称不可靠叙述，字面描述与心理状态分离，需要二阶推断。',
    blurb: '两章节选：从宅邸描写到墙纸图案，练「叙述者说的」和「文本暗示的」之间的区别。',
    tags: ['gutenberg', 'B2', 'book'],
  },
  {
    id: 'read-book-pride', module: 'reading', cefr: 'B2',
    title: 'Pride and Prejudice', titleZh: '傲慢与偏见',
    source: 'gutenberg', sourceLabel: 'Project Gutenberg · 公有领域',
    licenseNote: 'Public Domain；既有教学节选已内嵌，全文可从 Gutenberg 获取',
    refId: 'pride-and-prejudice',
    cefrBasis: { vocabCoverage: 0.76, avgSentenceLength: 24, syntaxComplexity: 'complex', pragmaticLoad: 'high' },
    levelSource: 'estimated',
    levelNotes: '约每 100 词 11 个生僻词；反讽与长周期句多，属 B2 上沿 / C1 入门。',
    blurb: '两章节选：开篇那句「举世公认的真理」怎样用语气而非词汇表达立场。',
    tags: ['gutenberg', 'B2', 'book'],
  },

  /* ---- 章节级：允许与书籍级不同 ---- */
  {
    id: 'read-ch-cc-1', module: 'reading', cefr: 'B1', chapterCefr: 'B1',
    title: 'Stave I · Marley was dead', titleZh: '第一章 · 马利已经死了',
    source: 'original', sourceLabel: 'LinguaBuddy 原创章节简报与研讨问题',
    licenseNote: '原创简报与问题；原文节选仍来自公有领域作品',
    refId: 'christmas-carol', chapterId: 'cc-1',
    cefrBasis: { vocabCoverage: 0.90, avgSentenceLength: 13, syntaxComplexity: 'compound', pragmaticLoad: 'low' },
    levelSource: 'estimated',
    levelNotes: '开篇以短陈述句交代事实，生僻词少，比同书后两章更容易。',
    blurb: '章节难度：B1。先确认「 narrator 为什么要反复强调马利死了」。',
    tags: ['chapter', 'B1', 'gutenberg'],
  },
  {
    id: 'read-ch-cc-3', module: 'reading', cefr: 'B2', chapterCefr: 'B2',
    title: 'Stave III · The Ghost of Christmas Present', titleZh: '第三章 · 现在之灵',
    source: 'original', sourceLabel: 'LinguaBuddy 原创章节简报与研讨问题',
    licenseNote: '原创简报与问题；原文节选仍来自公有领域作品',
    refId: 'christmas-carol', chapterId: 'cc-3',
    cefrBasis: { vocabCoverage: 0.80, avgSentenceLength: 22, syntaxComplexity: 'complex', pragmaticLoad: 'high' },
    levelSource: 'estimated',
    levelNotes: '同一本书内明显更难：场景切换快、群像对话多、隐含批判需推断；书籍级仍是 B1。',
    blurb: '章节难度：B2（高于书籍级 B1）。练「人物没说出口的评判藏在哪一句」。',
    tags: ['chapter', 'B2', 'gutenberg'],
  },
  {
    id: 'read-ch-al-1', module: 'reading', cefr: 'A2', chapterCefr: 'A2',
    title: 'Chapter I · Down the Rabbit-Hole', titleZh: '第一章 · 掉进兔子洞',
    source: 'original', sourceLabel: 'LinguaBuddy 原创章节简报与研讨问题',
    licenseNote: '原创简报与问题；原文节选仍来自公有领域作品',
    refId: 'alice-in-wonderland', chapterId: 'al-1',
    cefrBasis: { vocabCoverage: 0.93, avgSentenceLength: 10, syntaxComplexity: 'simple', pragmaticLoad: 'low' },
    levelSource: 'estimated',
    levelNotes: '动作句为主、句长短、词汇具体，比该书「毛毛虫」一章低一级；书籍级仍为 B1。',
    blurb: '章节难度：A2（低于书籍级 B1）。只做一件事：按顺序说清爱丽丝做了什么。',
    tags: ['chapter', 'A2', 'gutenberg'],
  },
  {
    id: 'read-ch-pp-2', module: 'reading', cefr: 'C1', chapterCefr: 'C1',
    title: 'Chapter I · You want to tell me', titleZh: '第一章 · 你想告诉我',
    source: 'original', sourceLabel: 'LinguaBuddy 原创章节简报与研讨问题',
    licenseNote: '原创简报与问题；原文节选仍来自公有领域作品',
    refId: 'pride-and-prejudice', chapterId: 'pp-2',
    cefrBasis: { vocabCoverage: 0.70, avgSentenceLength: 27, syntaxComplexity: 'complex', pragmaticLoad: 'high' },
    levelSource: 'estimated',
    levelNotes: '反讽、长周期句与话轮隐含意图叠加；章节级 C1，高于书籍级 B2。',
    blurb: '章节难度：C1（高于书籍级 B2）。练「一句话里同时有两层意思」的研讨提问。',
    tags: ['chapter', 'C1', 'gutenberg'],
  },

  /* ---- 新增公版篇目（来源卡：应用内不内嵌全文，只标来源与分级依据） ---- */
  {
    id: 'read-ext-aesop', module: 'reading', cefr: 'A2',
    title: 'Aesop’s Fables', titleZh: '伊索寓言',
    source: 'gutenberg', sourceLabel: 'Project Gutenberg · 公有领域',
    licenseNote: 'Public Domain；短篇优先、便于分章；本轮仅登记来源与分级依据，不内嵌全文',
    cefrBasis: { vocabCoverage: 0.95, avgSentenceLength: 9, syntaxComplexity: 'simple', pragmaticLoad: 'low' },
    levelSource: 'expert',
    levelNotes: '寓言以短句与具体名词为主，每段一个寓意，公版分级阅读常用 A2–B1 入门材料。',
    blurb: '短篇寓言：一篇只讲一个动作和一个结果，适合按章节粒度做最低门槛的研讨。',
    tags: ['gutenberg', 'A2', 'short', 'extended'],
  },
  {
    id: 'read-ext-oz', module: 'reading', cefr: 'B1',
    title: 'The Wonderful Wizard of Oz', titleZh: '绿野仙踪',
    source: 'gutenberg', sourceLabel: 'Project Gutenberg · 公有领域',
    licenseNote: 'Public Domain；本轮仅登记来源与分级依据，不内嵌全文',
    cefrBasis: { vocabCoverage: 0.87, avgSentenceLength: 14, syntaxComplexity: 'compound', pragmaticLoad: 'medium' },
    levelSource: 'expert',
    levelNotes: '约每 100 词 7 个生僻词；章节独立、情节推动明确，属 B1 典型难度。',
    blurb: '章节式冒险：每章一个同伴、一个障碍、一个解法，适合练情节与人物关系的证据定位。',
    tags: ['gutenberg', 'B1', 'extended'],
  },
  {
    id: 'read-ext-alice', module: 'reading', cefr: 'B1',
    title: 'Alice’s Adventures in Wonderland (extended)', titleZh: '爱丽丝梦游仙境 · 扩展篇目',
    source: 'gutenberg', sourceLabel: 'Project Gutenberg · 公有领域',
    licenseNote: 'Public Domain；既有 3 章节选已在书架，此处登记更多章节的扩展来源',
    cefrBasis: { vocabCoverage: 0.83, avgSentenceLength: 16, syntaxComplexity: 'compound', pragmaticLoad: 'medium' },
    levelSource: 'expert',
    levelNotes: '约每 100 词 8 个生僻词；双关与文字游戏使 B1–B2 之间浮动。',
    blurb: '扩展章节：从「疯狂茶会」到「法庭」，同一本书里难度会逐章上升。',
    tags: ['gutenberg', 'B1', 'extended'],
  },
  {
    id: 'read-ext-happy-prince', module: 'reading', cefr: 'B2',
    title: 'The Happy Prince', titleZh: '快乐王子',
    source: 'gutenberg', sourceLabel: 'Project Gutenberg · 公有领域（Oscar Wilde）',
    licenseNote: 'Public Domain；本轮仅登记来源与分级依据，不内嵌全文',
    cefrBasis: { vocabCoverage: 0.79, avgSentenceLength: 20, syntaxComplexity: 'complex', pragmaticLoad: 'high' },
    levelSource: 'expert',
    levelNotes: '约每 100 词 9 个生僻词；童话外壳下的反讽与道德隐含抬高语用负载。',
    blurb: '短篇但语义双层：先讲清雕像与燕子各自做了什么，再讨论作者真正在评价谁。',
    tags: ['gutenberg', 'B2', 'short', 'extended'],
  },
  {
    id: 'read-ext-pride', module: 'reading', cefr: 'C1',
    title: 'Pride and Prejudice (extended)', titleZh: '傲慢与偏见 · 扩展篇目',
    source: 'gutenberg', sourceLabel: 'Project Gutenberg · 公有领域',
    licenseNote: 'Public Domain；既有 2 章节选已在书架，此处登记更多章节的扩展来源',
    cefrBasis: { vocabCoverage: 0.72, avgSentenceLength: 26, syntaxComplexity: 'complex', pragmaticLoad: 'high' },
    levelSource: 'expert',
    levelNotes: '约每 100 词 11 个生僻词；后段书信体与长周期句达 C1 下沿。',
    blurb: '扩展章节：书信体与社交话轮的隐含意图，适合做「同一文本、不同注释深度」的对照。',
    tags: ['gutenberg', 'C1', 'extended'],
  },
  {
    id: 'read-ext-dorian', module: 'reading', cefr: 'C1',
    title: 'The Picture of Dorian Gray', titleZh: '道林·格雷的画像',
    source: 'gutenberg', sourceLabel: 'Project Gutenberg · 公有领域（Oscar Wilde，1890）',
    licenseNote: 'Public Domain；作为 C1 替代篇目（《The Great Gatsby》公版状态未确认，故不纳入）',
    cefrBasis: { vocabCoverage: 0.69, avgSentenceLength: 28, syntaxComplexity: 'complex', pragmaticLoad: 'high' },
    levelSource: 'expert',
    levelNotes: '哲思对话、悖论式警句与密集反讽，词汇覆盖率最低、平均句长最长，定为 C1。',
    blurb: 'C1 替代篇目：从一句警句出发，练「承认对方前提、再限定它的适用范围」的研讨话轮。',
    tags: ['gutenberg', 'C1', 'extended', 'gatsby-alternative'],
  },
]
