/**
 * China Learner Track 的两个场景词包（接入既有 Word Lab，不新建学习机制）
 *
 * - chinglish_fix：轨道 D 的「中式英语纠偏词包」，释义是「地道搭配注释」而非中文直译；
 * - speaking_core：轨道 C 的「口语核心表达词包」，每条都是一个能立刻用上的交际动作。
 *
 * 全部搭配与例句原创；不复制任何培训机构词表、教辅或真题。
 * 词表来源与许可分层见 README 第十九章。
 */

import { makeWord, type WordEntry, type WordTuple } from '../../wordLabTypes'
import type { DeckMeta, DeckId } from '../../wordLabTypes'

export type ChinaTrackDeckId = 'chinglish_fix' | 'speaking_core'

export const CHINA_TRACK_DECK_IDS: ChinaTrackDeckId[] = ['chinglish_fix', 'speaking_core']

export const CHINA_TRACK_DECK_META: Record<ChinaTrackDeckId, DeckMeta> = {
  chinglish_fix: {
    id: 'chinglish_fix' as DeckId,
    name: '中式英语纠偏词包',
    subtitle: 'China Learner Track · 轨道 D · 地道搭配注释',
    cefr: 'B1',
    shardSize: 300,
    emblem: '🔍',
    tint: 'coral',
    source: 'china_track',
  },
  speaking_core: {
    id: 'speaking_core' as DeckId,
    name: '开口核心表达词包',
    subtitle: 'China Learner Track · 轨道 C · 最小可说完',
    cefr: 'A2',
    shardSize: 300,
    emblem: '💬',
    tint: 'sun',
    source: 'china_track',
  },
}

/** [短语, 音标, 词性, 地道搭配注释, 英文注释, CEFR, 例句, 配图场景, 英文替代描述, 搭配] */
const CHINGLISH_TUPLES: WordTuple[] = [
  ['acquire knowledge', '', 'phrase', '≠learn knowledge；知识用「获得」', 'Use acquire with knowledge, not learn.', 'B1',
    ['Reading widely helps us acquire knowledge, not just memorize words.'],
    'a student reading a book and taking notes', 'A student reading and taking notes',
    ['acquire knowledge', 'gain knowledge']],
  ['build skills', '', 'phrase', '≠improve ability；能力是「搭建」', 'Build or develop skills; do not improve an ability.', 'B1',
    ['Short daily practice builds the skills you actually need.'],
    'a person stacking wooden blocks', 'A person stacking blocks one by one',
    ['build skills', 'develop skills']],
  ["broaden one's horizons", '', 'phrase', '≠enlarge eyesight；眼界用 broaden', 'Broaden horizons is the fixed collocation.', 'B2',
    ['Travelling alone broadened her horizons more than any textbook.'],
    'a wide open landscape seen from a hill', 'A wide landscape seen from a hill',
    ["broaden one's horizons", "widen one's perspective"]],
  ['have a discussion of', '', 'phrase', '≠make a discussion about', 'Have a discussion of a topic.', 'B2',
    ['We had a thorough discussion of the plan before voting.'],
    'two people talking across a small table', 'Two people talking across a table',
    ['have a discussion of', 'a thorough discussion of']],
  ['have an impact on', '', 'phrase', '≠influence to；介词是 on', 'Impact takes on, influence takes on too.', 'B2',
    ['Cheaper data has had a real impact on how students study.'],
    'ripples spreading across water', 'Ripples spreading across water',
    ['have an impact on', 'a considerable impact on']],
  ['make a contribution to', '', 'phrase', '≠give a contribution；动词是 make', 'Make a contribution to something.', 'B2',
    ['She made a substantial contribution to the project.'],
    'one hand placing a brick into a wall', 'A hand placing a brick into a wall',
    ['make a contribution to', 'a substantial contribution to']],
  ['I think (that) ...', '', 'frame', '一个句子只留一个主谓语', 'One main clause per sentence; add a that-clause.', 'A2',
    ['I think he is right about the deadline.'],
    'a single clean sentence written on paper', 'A single sentence written on paper',
    ['I think that ...', 'It is true that ...']],
  ['Recent years have seen ...', '', 'frame', '让时间作主语，不必写 we can see', 'Let time or data be the subject.', 'B2',
    ['Recent years have seen a sharp drop in readership.'],
    'a calendar with pages turning', 'A calendar with turning pages',
    ['Recent years have seen', 'The number of ... has fallen']],
  ['Because ..., ...', '', 'frame', '主句前不再加 so', 'Do not add so after a because-clause.', 'A2',
    ['Because the bus was late, we missed the first ten minutes.'],
    'two arrows showing cause and effect', 'Two arrows showing cause and effect',
    ['Because ..., ...', '..., so ...']],
  ['Although ..., ...', '', 'frame', '主句前不再加 but', 'Do not add but after an although-clause.', 'B1',
    ['Although he was tired, he kept working.'],
    'a detour sign on a road', 'A detour sign on a road',
    ['Although ..., ...', '..., but ...']],
  ['extremely nervous', '', 'collocation', '≠very very nervous；用一个精确词', 'One precise adverb, not stacked very.', 'A2',
    ['I was extremely nervous, and my hands were shaking.'],
    'hands holding a cup that trembles slightly', 'Hands holding a trembling cup',
    ['extremely nervous', 'my hands were shaking']],
  ['pick up new skills', '', 'phrase', '≠learn knowledge；技能可 pick up', 'Pick up works with skills, not knowledge.', 'B1',
    ['Free short courses let you pick up new skills on a commute.'],
    'a person lifting a small tool from a table', 'A person lifting a small tool',
    ['pick up new skills', 'acquire knowledge']],
]

const SPEAKING_TUPLES: WordTuple[] = [
  ["Sorry, could you repeat that?", '', 'expression', '没听懂时最稳的一句追问', 'Ask for a repeat instead of pretending to follow.', 'A2',
    ["Sorry, could you repeat that a bit more slowly?"],
    'a hand raised slightly to ask a question', 'A hand raised to ask a question',
    ['could you repeat that', 'a bit more slowly']],
  ['I caught ...', '', 'frame', '复述听清的碎片，争取接住', 'Repeat the fragment you did hear.', 'A2',
    ['I caught "Friday" — did you say the deadline moved?'],
    'a few words highlighted on a page', 'A few highlighted words on a page',
    ['I caught ...', 'Did you say ...?']],
  ['Did you say ...?', '', 'frame', '把猜测变成一次确认', 'Confirm what you think you heard.', 'A2',
    ['Did you say the deadline moved to Friday?'],
    'a question mark drawn on a card', 'A question mark on a card',
    ['Did you say ...?', 'Just to check']],
  ['Let me think for a second', '', 'expression', '自然争取几秒，不用沉默', 'Buy a moment without going silent.', 'A2',
    ["Let me think for a second ... well, I'd probably change the order."],
    'a small clock with a short hand', 'A small clock face',
    ['Let me think for a second', "Well, I'd probably ..."]],
  ["I'd probably ...", '', 'frame', '给不绝对、能继续说的答案', 'Offer a tentative answer you can build on.', 'B1',
    ["I'd probably change the order of the two tasks."],
    'two alternative paths drawn on paper', 'Two alternative paths on paper',
    ["I'd probably ...", 'because ...']],
  ['I see your point about ...', '', 'frame', '先接住对方在意的东西', 'Acknowledge before you disagree.', 'B1',
    ['I see your point about speed, and that could work for the headings.'],
    'two people nodding across a table', 'Two people nodding across a table',
    ['I see your point about', 'That could work for']],
  ['That could work for ...', '', 'frame', '把同意限定在一个范围内', 'Agree with a limited part only.', 'B1',
    ["That could work for the short headings, but not the long paragraphs."],
    'a circle drawn around one part of a list', 'A circle around one part of a list',
    ['That could work for', "I'd rather"]],
  ["I'd rather ...", '', 'frame', '温和提出不同做法', 'Suggest a different option gently.', 'B1',
    ["I'd rather break the long sentences down first."],
    'a fork in a road with two signs', 'A fork in a road with two signs',
    ["I'd rather", 'I see your point']],
  ['Just to check ...', '', 'expression', '礼貌请求澄清，不说「我英语差」', 'Ask a precise clarification question.', 'B1',
    ['Just to check — do you mean the outline or the summary?'],
    'a checklist with one unticked box', 'A checklist with one unticked box',
    ['Just to check', 'Do you mean X or Y?']],
  ['Do you mean X or Y?', '', 'frame', '把模糊处变成选择题', 'Turn vagueness into two clear options.', 'B1',
    ['Do you mean the outline or the summary?'],
    'two labelled boxes side by side', 'Two labelled boxes side by side',
    ['Do you mean ... or ...?', 'Just to check']],
  ["I'd guess ...", '', 'frame', '看图说话时给有依据的猜测', 'Make a guess and leave room to be wrong.', 'A2',
    ["I'd guess the rain started quite suddenly."],
    'a cloud with a few raindrops over a street', 'A small rain cloud over a street',
    ["I'd guess ...", 'maybe']],
  ['read ... aloud', '', 'phrase', '朗读；关注停顿与句子重音', 'Read aloud, keeping the pauses.', 'A2',
    ["I'll listen for the pauses first, then read the passage aloud."],
    'an open book beside a small speaker', 'An open book beside a speaker',
    ['read aloud', 'keep the same pauses']],
]

/** 复用既有 makeWord：tags 会带上 deckId 与 china_track，供 DeckPicker / 成就筛选识别 */
export const CHINGLISH_FIX_SEED: WordEntry[] = CHINGLISH_TUPLES
  .map((t) => makeWord('chinglish_fix' as DeckId, t, ['china_track', 'track_D']))
export const SPEAKING_CORE_SEED: WordEntry[] = SPEAKING_TUPLES
  .map((t) => makeWord('speaking_core' as DeckId, t, ['china_track', 'track_C']))
