/**
 * 对话模块分级内容池（模块 1：角色对话）
 *
 * 来源分层（README 第二十章有完整许可表与署名）：
 * - original             原创场景脚本（第一优先级，始终保留）
 * - slanglane_reference  SlangLane CEFR B1–C2 语用语料库（CC BY 4.0）参考语料：
 *                        仅参考「同一功能在英式 / 爱尔兰 / 美式中的语用差异」这一思路，
 *                        生成原创微场景，**不复制任何条目全文**
 * - ace_cefr_anchor      Ace-CEFR 对话数据集（GitHub GliteTech/research-ace-cefr，开源）难度锚点：
 *                        只用其 CEFR 1–6 级标注带来的句长 / 词汇 / 语用分布作校准，
 *                        **不直接复制对话文本**，levelSource 标 expert
 *
 * 每个条目都带 cefr + cefrBasis（≥3 项）+ levelSource + levelNotes。
 */

import type { ContentItem } from '../../levelTypes'

export const DIALOGUE_POOL: ContentItem[] = [
  {
    id: 'dlg-a2-01', module: 'dialogue', cefr: 'A2',
    title: 'Meeting a new classmate', titleZh: '认识新同学',
    source: 'original', sourceLabel: 'LinguaBuddy 原创场景脚本',
    licenseNote: '原创内容；不含任何第三方语料字节',
    cefrBasis: { vocabCoverage: 0.94, avgSentenceLength: 7, syntaxComplexity: 'simple', pragmaticLoad: 'low', accentDiversity: 'single' },
    levelSource: 'estimated',
    levelNotes: '高频词覆盖率 94%、平均 7 词短句，只完成「问候 + 确认姓名」一个功能。',
    blurb: '用 2–3 句完成一次问候：说名字、问对方名字、确认彼此在同一个班。',
    tags: ['greeting', 'confirming', 'A2', 'original'],
  },
  {
    id: 'dlg-a2-02', module: 'dialogue', cefr: 'A2',
    title: 'Asking someone to slow down', titleZh: '请对方说慢一点',
    source: 'original', sourceLabel: 'LinguaBuddy 原创场景脚本',
    licenseNote: '原创内容；不含任何第三方语料字节',
    cefrBasis: { vocabCoverage: 0.95, avgSentenceLength: 6, syntaxComplexity: 'simple', pragmaticLoad: 'low', accentDiversity: 'single' },
    levelSource: 'estimated',
    levelNotes: '单一请求功能、全部最常用词，无从句与隐含意义。',
    blurb: '没听清时用一句固定的追问把话接住，再复述你听到的那个词。',
    tags: ['request', 'repair', 'A2', 'original'],
  },
  {
    id: 'dlg-a2-03', module: 'dialogue', cefr: 'A2',
    title: 'Finding the library', titleZh: '问路去图书馆',
    source: 'original', sourceLabel: 'LinguaBuddy 原创场景脚本',
    licenseNote: '原创内容；不含任何第三方语料字节',
    cefrBasis: { vocabCoverage: 0.93, avgSentenceLength: 8, syntaxComplexity: 'simple', pragmaticLoad: 'low', accentDiversity: 'single' },
    levelSource: 'estimated',
    levelNotes: '位置词 + 祈使方向，语用功能为单一「询问 + 道谢」。',
    blurb: '问一句路、听一句方向、道一次谢，三句话把一个真实小任务做完。',
    tags: ['direction', 'thanks', 'A2', 'original'],
  },
  {
    id: 'dlg-b1-01', module: 'dialogue', cefr: 'B1',
    title: 'I see your point, but…', titleZh: '有限同意',
    source: 'original', sourceLabel: 'LinguaBuddy 原创场景脚本',
    licenseNote: '原创内容；不含任何第三方语料字节',
    cefrBasis: { vocabCoverage: 0.87, avgSentenceLength: 13, syntaxComplexity: 'compound', pragmaticLoad: 'medium', accentDiversity: 'single' },
    levelSource: 'estimated',
    levelNotes: '出现从句与让步，需组合「接住对方 + 保留意见」两个语用功能。',
    blurb: '先接住同伴真正在意的点，再用 because / but 说出你保留的部分。',
    tags: ['opinion', 'partial-agreement', 'B1', 'original'],
  },
  {
    id: 'dlg-b1-02', module: 'dialogue', cefr: 'B1',
    title: 'That sounds grand / That sounds good', titleZh: '同一功能的两种地域说法',
    source: 'slanglane_reference', sourceLabel: 'SlangLane CEFR B1–C2 语用语料库（CC BY 4.0）· 参考语料',
    licenseNote: 'CC BY 4.0 · 署名 SlangLane（Zenodo / Harvard Dataverse）；仅参考语用差异思路，未复制条目全文',
    cefrBasis: { vocabCoverage: 0.86, avgSentenceLength: 12, syntaxComplexity: 'compound', pragmaticLoad: 'medium', accentDiversity: 'limited' },
    levelSource: 'expert',
    levelNotes: '需辨认同一肯定功能在爱尔兰/英式与通用美式中的语域差异，语用负载中等。',
    blurb: '同一句「这听起来不错」，在不同地域的说法里语气略有不同；先听懂，再选一句自己说得出口的。',
    tags: ['pragmatics', 'regional-variation', 'B1', 'slanglane_reference'],
  },
  {
    id: 'dlg-b1-03', module: 'dialogue', cefr: 'B1',
    title: 'Opinion + one concrete reason', titleZh: '观点加一个具体理由',
    source: 'ace_cefr_anchor', sourceLabel: 'Ace-CEFR 对话数据集（GitHub GliteTech/research-ace-cefr，开源）· 难度锚点',
    licenseNote: '开源数据集，仅用于 CEFR 难度分布校准；未复制任何对话文本',
    cefrBasis: { vocabCoverage: 0.85, avgSentenceLength: 14, syntaxComplexity: 'compound', pragmaticLoad: 'medium', accentDiversity: 'single' },
    levelSource: 'expert',
    levelNotes: '按专家标注的 CEFR 3 级锚点校准：句长约 14 词、允许一个从句、观点需附一个理由。',
    blurb: '给一个立场，再给一个能被追问的具体理由；目标是「说完整」，不是「说漂亮」。',
    tags: ['opinion', 'reason', 'B1', 'ace_cefr_anchor'],
  },
  {
    id: 'dlg-b2-01', module: 'dialogue', cefr: 'B2',
    title: 'A polite interruption', titleZh: '礼貌打断',
    source: 'slanglane_reference', sourceLabel: 'SlangLane CEFR B1–C2 语用语料库（CC BY 4.0）· 参考语料',
    licenseNote: 'CC BY 4.0 · 署名 SlangLane（Zenodo / Harvard Dataverse）；仅参考语用差异思路，未复制条目全文',
    cefrBasis: { vocabCoverage: 0.79, avgSentenceLength: 18, syntaxComplexity: 'complex', pragmaticLoad: 'high', accentDiversity: 'limited' },
    levelSource: 'expert',
    levelNotes: '打断本身带面子威胁，需要缓和语与话轮管理，属于高语用负载。',
    blurb: '在小组讨论里插一句话，既不抢话也不丢掉自己的观点：先致意、再给理由、把话轮还回去。',
    tags: ['turn-taking', 'politeness', 'B2', 'slanglane_reference'],
  },
  {
    id: 'dlg-b2-02', module: 'dialogue', cefr: 'B2',
    title: 'What’s the craic?', titleZh: '用地域寒暄开启话题',
    source: 'slanglane_reference', sourceLabel: 'SlangLane CEFR B1–C2 语用语料库（CC BY 4.0）· 参考语料',
    licenseNote: 'CC BY 4.0 · 署名 SlangLane（Zenodo / Harvard Dataverse）；仅参考语用差异思路，未复制条目全文',
    cefrBasis: { vocabCoverage: 0.78, avgSentenceLength: 17, syntaxComplexity: 'complex', pragmaticLoad: 'high', accentDiversity: 'multi' },
    levelSource: 'expert',
    levelNotes: '寒暄语的真实含义不写在字面上，需依赖语域与文化语境推断。',
    blurb: '听到一句不按字面理解的寒暄时，先判断它是在问候、在找话题，还是在开玩笑，再决定怎么接。',
    tags: ['phatic', 'indirectness', 'B2', 'slanglane_reference'],
  },
  {
    id: 'dlg-b2-03', module: 'dialogue', cefr: 'B2',
    title: 'Disagreeing without saying no', titleZh: '间接异议',
    source: 'original', sourceLabel: 'LinguaBuddy 原创场景脚本',
    licenseNote: '原创内容；不含任何第三方语料字节',
    cefrBasis: { vocabCoverage: 0.80, avgSentenceLength: 19, syntaxComplexity: 'complex', pragmaticLoad: 'high', accentDiversity: 'limited' },
    levelSource: 'estimated',
    levelNotes: '立场靠让步与条件句间接表达，字面没有否定词但语义是异议。',
    blurb: '用「这个方案在 X 情况下成立，不过……」表达不同意，全程不出现直接否定。',
    tags: ['indirect-disagreement', 'hedging', 'B2', 'original'],
  },
  {
    id: 'dlg-c1-01', module: 'dialogue', cefr: 'C1',
    title: 'Understatement and gentle irony', titleZh: '委婉与轻讽刺',
    source: 'slanglane_reference', sourceLabel: 'SlangLane CEFR B1–C2 语用语料库（CC BY 4.0）· 参考语料',
    licenseNote: 'CC BY 4.0 · 署名 SlangLane（Zenodo / Harvard Dataverse）；仅参考语用差异思路，未复制条目全文',
    cefrBasis: { vocabCoverage: 0.70, avgSentenceLength: 23, syntaxComplexity: 'complex', pragmaticLoad: 'high', accentDiversity: 'multi' },
    levelSource: 'expert',
    levelNotes: '字面与意图相反，需要二阶语用推断；多种口音与快速语流同时出现。',
    blurb: '对方说「That went well」时语气其实在说反话；先判断意图，再决定要不要顺着接。',
    tags: ['irony', 'implicature', 'C1', 'slanglane_reference'],
  },
  {
    id: 'dlg-c1-02', module: 'dialogue', cefr: 'C1',
    title: 'A multi-accent seminar', titleZh: '多口音学术研讨',
    source: 'ace_cefr_anchor', sourceLabel: 'Ace-CEFR 对话数据集（GitHub GliteTech/research-ace-cefr，开源）· 难度锚点',
    licenseNote: '开源数据集，仅用于 CEFR 难度分布校准；未复制任何对话文本',
    cefrBasis: { vocabCoverage: 0.68, avgSentenceLength: 25, syntaxComplexity: 'complex', pragmaticLoad: 'high', accentDiversity: 'multi' },
    levelSource: 'expert',
    levelNotes: '按专家标注的 CEFR 5–6 级锚点校准：长句、抽象话题、多口音与学术话轮结构。',
    blurb: '三位持不同口音的发言人就同一议题互相追问；你要先复述对方立场，再提出一个限定条件。',
    tags: ['seminar', 'multi-accent', 'C1', 'ace_cefr_anchor'],
  },
  {
    id: 'dlg-c1-03', module: 'dialogue', cefr: 'C1',
    title: 'Grand as a quiet no', titleZh: '一个词里的保留态度',
    source: 'slanglane_reference', sourceLabel: 'SlangLane CEFR B1–C2 语用语料库（CC BY 4.0）· 参考语料',
    licenseNote: 'CC BY 4.0 · 署名 SlangLane（Zenodo / Harvard Dataverse）；仅参考语用差异思路，未复制条目全文',
    cefrBasis: { vocabCoverage: 0.71, avgSentenceLength: 22, syntaxComplexity: 'complex', pragmaticLoad: 'high', accentDiversity: 'multi' },
    levelSource: 'expert',
    levelNotes: '同一个地域词在肯定与保留之间摇摆，需结合停顿、语调与前一轮立场判断。',
    blurb: '一句很短的地域回应背后可能藏着保留意见；用一次澄清把它问明白，而不是直接当同意。',
    tags: ['implicature', 'regional-variation', 'C1', 'slanglane_reference'],
  },
]
