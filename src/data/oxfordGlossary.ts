/* ================================================================
 * 阅读页生词词典（牛津式词条结构）
 *
 * 设计说明（版权边界，重要）：
 *   - 「以牛津字典解释为主」= 采用词典的**呈现结构**：音标 / 词性 /
 *     英英释义优先 / 义项例句 / 词形 / 搭配 / 语域标签。
 *   - 下面的英文释义、IPA 与学习例句均为本项目**自编学习释义**，
 *     不是 Oxford University Press 或任何词典的原文内容，也不内置
 *     受版权保护的词典文本。UI 与 README 会明确标注这一点。
 *   - 「本章原句」来自 public domain 原文节选，逐字引用，不编造。
 *
 * 可替换接口：setDictionaryProvider() 允许接入自己的词典服务；
 * 默认实现完全离线，远程失败自动回退内置词条。
 * ================================================================ */

export interface OxfordEntry {
  /** 用户点击到的词形（保留原文大小写） */
  word: string
  /** 国际音标 */
  ipa: string
  /** 词性（全称，如 noun / verb / adjective） */
  pos: string
  /** 英英释义：词典卡的主角 */
  defEn: string
  /** 中文对照：辅助理解，不喧宾夺主 */
  defZh: string
  /** 自编学习例句（明确标为「非原文」） */
  example: string
  /** 本章中文语境注解（来自书库种子） */
  chapterNote: string
  /** 本章原句（真实原文，由阅读页注入） */
  chapterSentence: string
  forms: string
  collocations: string
  register: string
  extraNote: string
  /** 未收录内置词条时为 true，UI 不假装给出英英释义 */
  isFallback: boolean
}

export const OXFORD_DISCLAIMER =
  '词条采用牛津词典式结构（音标 / 词性 / 英英释义 / 例句 / 搭配），英文释义与例句为 LinguaBuddy 自编学习释义，不是 Oxford University Press 官方内容；「本章原句」逐字引自公有领域原文。'

/**
 * 紧凑词条表：[词形, IPA, 词性, 英英释义, 学习例句, 附加信息]
 * 附加信息格式：forms=…;coll=…;reg=…;note=…
 */
type Row = [string, string, string, string, string, string?]

const ROWS: Row[] = [
  ['register', '/ˈredʒɪstə(r)/', 'noun', 'an official written list or record of names, events or details', 'The parish register recorded the burial in a single line.', 'forms=registered, registering;coll=parish register, register of births;reg=formal'],
  ['executor', '/ɪɡˈzekjətə(r)/', 'noun', 'a person named in a will to carry out its instructions and deal with the estate', 'He was the sole executor of his partner\u2019s will.', 'coll=sole executor, appoint an executor;reg=legal'],
  ['counting-house', '/ˈkaʊntɪŋ haʊs/', 'noun', 'an office where a business kept its accounts and money, especially in former times', 'The merchant sat busy in his counting-house all afternoon.', 'reg=old-fashioned'],
  ['humbug', '/ˈhʌmbʌɡ/', 'noun', 'words or behaviour that someone regards as nonsense, pretence or a deliberate deception', '\u2018Bah!\u2019 he said. \u2018Humbug!\u2019', 'coll=complete humbug;reg=old-fashioned, informal'],
  ['bleak', '/bliːk/', 'adjective', 'cold, bare and cheerless; offering little hope of comfort or improvement', 'It was a cold, bleak, biting sort of morning.', 'coll=bleak weather, bleak prospects;forms=bleakly (adv)'],

  ['distinguish', '/dɪˈstɪŋɡwɪʃ/', 'verb', 'to recognise or point out the difference between two people or things', 'In the dark he could scarcely distinguish the window from the wall.', 'forms=distinguished, distinguishing;coll=distinguish A from B'],
  ['transparent', '/trænsˈpærənt/', 'adjective', 'allowing light to pass through so that objects behind can be seen clearly', 'The transparent glass gave no protection from the cold.', 'coll=transparent glass;ant=opaque'],
  ['opaque', '/əʊˈpeɪk/', 'adjective', 'not allowing light to pass through; also, hard to understand', 'The opaque walls kept the room in complete darkness.', 'ant=transparent;reg=formal'],
  ['foretold', '/fɔːˈtəʊld/', 'verb', 'past tense of foretell: said that something would happen in the future', 'Nobody foretold the visitor who arrived at one o\u2019clock.', 'forms=foretell, foretold, foretold;reg=literary'],
  ['vanished', '/ˈvænɪʃt/', 'verb', 'disappeared suddenly or completely from sight', 'The figure vanished as quickly as it had appeared.', 'forms=vanish, vanished;coll=vanish into thin air'],

  ['prodigiously', '/prəˈdɪdʒəsli/', 'adverb', 'to an unusually great degree; immensely or astonishingly', 'The flame shot up prodigiously in a single instant.', 'forms=prodigious (adj);reg=literary'],
  ['reverently', '/ˈrevərəntli/', 'adverb', 'with deep respect and a sense of awe', 'He reverently did as the spirit asked.', 'forms=reverent (adj), reverence (n)'],
  ['mantle', '/ˈmæntl/', 'noun', 'a loose cloak or outer garment worn over other clothes', 'A bright mantle was folded round the figure.', 'reg=literary, old-fashioned;note=Also used figuratively for a covering layer.'],
  ['genial', '/ˈdʒiːniəl/', 'adjective', 'warm, friendly and cheerful in manner', 'A genial smile made the room feel less cold.', 'coll=a genial host, a genial voice;forms=genially (adv)'],
  ['sparkling', '/ˈspɑːklɪŋ/', 'adjective', 'shining with many small flashes of light; lively and bright', 'Its eyes were clear and sparkling in the dark.', 'forms=sparkle (v);coll=sparkling eyes'],

  ['peeped', '/piːpt/', 'verb', 'looked quickly or secretly, often through a small opening', 'She peeped into the book her sister was reading.', 'forms=peep, peeped;coll=peep into, peep at'],
  ['daisy-chain', '/ˈdeɪzi tʃeɪn/', 'noun', 'a string of daisies joined together into a chain or garland', 'The children were making a daisy-chain on the grass.', 'reg=children\u2019s play'],
  ['remarkable', '/rɪˈmɑːkəbl/', 'adjective', 'unusual or surprising enough to be worth noticing', 'There was nothing very remarkable about the hole itself.', 'forms=remarkably (adv);coll=a remarkable achievement'],
  ['tunnel', '/ˈtʌnl/', 'noun', 'a passage built underground or through a hill', 'The rabbit-hole went straight on like a tunnel.', 'coll=a railway tunnel, dig a tunnel'],
  ['considering', '/kənˈsɪdərɪŋ/', 'verb', 'thinking carefully about something before deciding or acting', 'She jumped in without once considering how to get out again.', 'forms=consider, considered;coll=consider doing something'],

  ['curiouser', '/ˈkjʊəriəsə(r)/', 'adjective', 'a deliberately non-standard comparative of curious, meaning \u2018more strange\u2019', '\u2018Curiouser and curiouser!\u2019 she cried.', 'reg=non-standard, playful;note=Standard English would say \u201cmore curious\u201d; the form is a word-game.'],
  ['telescope', '/ˈtelɪskəʊp/', 'noun', 'an instrument with lenses that makes distant objects appear nearer and larger', 'She stretched up like a telescope.', 'coll=look through a telescope'],
  ['ashamed', '/əˈʃeɪmd/', 'adjective', 'feeling guilt, embarrassment or regret about something one has done', 'She felt a little ashamed of crying so much.', 'coll=be ashamed of, ashamed to admit'],
  ['pattering', '/ˈpætərɪŋ/', 'noun', 'a series of light, quick tapping sounds', 'There was a pattering of small feet on the stairs.', 'forms=patter (v);coll=the patter of rain'],
  ['hastily', '/ˈheɪstɪli/', 'adverb', 'quickly and in a hurry, often without enough care', 'She hastily dried her eyes and looked up.', 'forms=hasty (adj)'],

  ['hookah', '/ˈhʊkə/', 'noun', 'a pipe for smoking in which the smoke is cooled by passing through water', 'A hookah rested beside the Caterpillar on the mushroom.', 'reg=dated'],
  ['languid', '/ˈlæŋɡwɪd/', 'adjective', 'moving or speaking slowly, with little energy or interest', 'It asked the question in a languid, sleepy voice.', 'forms=languidly (adv)'],
  ['addressed', '/əˈdrest/', 'verb', 'spoke directly to someone; directed words at them', 'The Caterpillar addressed her without looking up.', 'forms=address, addressed;coll=address a person;reg=formal'],
  ['sternly', '/ˈstɜːnli/', 'adverb', 'in a strict, serious and disapproving way', '\u2018Who are you?\u2019 it said sternly.', 'forms=stern (adj)'],
  ['shyly', '/ˈʃaɪli/', 'adverb', 'in a timid or embarrassed way', 'Alice replied rather shyly.', 'forms=shy (adj)'],

  ['eclipses', '/ɪˈklɪpsɪz/', 'verb', 'makes a person or thing seem less important or impressive by comparison', 'For him, she eclipses every other woman.', 'forms=eclipse, eclipsed;note=As a noun, an eclipse is the hiding of the sun or moon.'],
  ['predominates', '/prɪˈdɒmɪneɪts/', 'verb', 'is the strongest, largest or most noticeable element', 'One feeling predominates throughout his account.', 'forms=predominate, predominant (adj);reg=formal'],
  ['abhorrent', '/əbˈhɒrənt/', 'adjective', 'causing strong dislike or moral disgust', 'The idea of deceiving a friend was abhorrent to him.', 'coll=abhorrent to somebody;reg=formal'],
  ['gibe', '/dʒaɪb/', 'noun', 'an unkind remark intended to mock or insult someone', 'He answered with a gibe rather than an argument.', 'forms=gibes (pl);note=Also spelled \u201cjibe\u201d in American English.'],
  ['save', '/seɪv/', 'preposition', 'except; apart from', 'He remembered nothing, save the woman\u2019s face.', 'reg=archaic, formal;note=Here it is a preposition, not the verb meaning \u201cto rescue\u201d.'],

  ['drifted', '/ˈdrɪftɪd/', 'verb', 'moved slowly without direction, or gradually became separated', 'The years had drifted the two friends apart.', 'forms=drift, drifted;coll=drift apart, drift away'],
  ['capital', '/ˈkæpɪtl/', 'adjective', 'very serious; or excellent, in an older use', 'It is a capital mistake to theorize before one has data.', 'reg=old-fashioned;note=Not the noun meaning \u201cchief city\u201d here.'],
  ['theorize', '/ˈθɪəraɪz/', 'verb', 'to form ideas or explanations without firm evidence', 'It is unwise to theorize before one has data.', 'forms=theorized, theory (n);reg=formal'],
  ['insensibly', '/ɪnˈsensəbli/', 'adverb', 'so gradually or slightly that the change is not noticed', 'The facts were insensibly bent to fit the theory.', 'forms=insensible (adj);reg=formal'],
  ['twist', '/twɪst/', 'verb', 'to bend something out of shape, or to change its meaning unfairly', 'He would twist facts instead of changing his theory.', 'forms=twisted;coll=twist the truth, twist facts'],

  ['ancestral', '/ænˈsestrəl/', 'adjective', 'inherited from or belonging to one\u2019s family in earlier generations', 'They had secured ancestral halls for the summer.', 'coll=ancestral home, ancestral halls'],
  ['hereditary', '/həˈredɪtri/', 'adjective', 'passed from parent to child, or held by right of inheritance', 'A hereditary estate came with the old house.', 'coll=a hereditary disease, a hereditary title;reg=formal'],
  ['felicity', '/fəˈlɪsəti/', 'noun', 'great happiness; or a pleasing, apt way of expressing something', 'A romantic felicity seemed to hang about the place.', 'reg=literary, formal'],
  ['queer', '/kwɪə(r)/', 'adjective', 'strange or unusual', 'There is something queer about the house.', 'reg=dated in this sense;note=In 1892 it chiefly meant \u201cstrange\u201d; modern senses did not yet apply.'],
  ['physician', '/fɪˈzɪʃn/', 'noun', 'a doctor who treats illness with medicine rather than surgery', 'Her husband was a physician and did not believe she was sick.', 'coll=attending physician;reg=formal'],

  ['repellant', '/rɪˈpelənt/', 'adjective', 'causing strong dislike; unpleasant to look at or be near', 'The colour was repellant, almost revolting.', 'forms=also spelled repellent;coll=a repellant smell'],
  ['smouldering', '/ˈsməʊldərɪŋ/', 'adjective', 'burning slowly with smoke but no flame; barely contained', 'A smouldering yellow lay beneath the pattern.', 'forms=smoulder (v);note=American spelling: smoldering.'],
  ['lurid', '/ˈljʊərɪd/', 'adjective', 'too bright or vivid in a shocking way; describing something unpleasant in graphic detail', 'It was a dull yet lurid orange in some places.', 'coll=a lurid description, lurid colour'],
  ['sickly', '/ˈsɪkli/', 'adjective', 'weak, pale and often unwell; unpleasantly pale in colour', 'The wallpaper had a sickly greenish tint.', 'forms=sick (adj);coll=a sickly child, sickly light'],
  ['inanimate', '/ɪnˈænɪmət/', 'adjective', 'not alive; showing no sign of life or feeling', 'I never saw so much expression in an inanimate thing before.', 'coll=an inanimate object;ant=animate'],

  ['universally', '/ˌjuːnɪˈvɜːsəli/', 'adverb', 'by everyone; in every case or every place', 'It is a truth universally acknowledged.', 'forms=universal (adj);coll=universally acknowledged, universally accepted'],
  ['acknowledged', '/əkˈnɒlɪdʒd/', 'adjective', 'generally accepted or recognised as true', 'The truth was acknowledged by every family in the neighbourhood.', 'forms=acknowledge (v);coll=a universally acknowledged truth'],
  ['in want of', '/ɪn ˈwɒnt ɒv/', 'phrase', 'in need of; lacking something', 'A single man of large fortune must be in want of a wife.', 'reg=formal, old-fashioned;note=Equivalent to \u201cin need of\u201d.'],
  ['rightful', '/ˈraɪtfl/', 'adjective', 'legally or morally entitled to something', 'He was considered the rightful owner of the estate.', 'forms=rightfully (adv);coll=rightful owner, rightful heir'],
  ['let', '/let/', 'verb', 'rented out a house, room or piece of land to a tenant', 'Netherfield Park is let at last.', 'forms=let, letting;reg=old-fashioned in this sense;note=\u201cis let\u201d means \u201chas been rented\u201d, not \u201cis allowed\u201d.'],

  ['impatiently', '/ɪmˈpeɪʃntli/', 'adverb', 'in an annoyed way because of having to wait or repeat something', '\u2018What is his name?\u2019 she asked impatiently.', 'forms=impatient (adj);coll=wait impatiently'],
  ['objection', '/əbˈdʒekʃn/', 'noun', 'a reason for disagreeing with or opposing something', 'I have no objection to his coming here.', 'coll=have no objection to, raise an objection'],
  ['fortune', '/ˈfɔːtʃuːn/', 'noun', 'a very large amount of money; wealth', 'A man of large fortune had arrived in the neighbourhood.', 'coll=a man of fortune, make a fortune'],
  ['to be sure', '/tə bi ˈʃʊə(r)/', 'phrase', 'certainly; indeed, used to concede a point before adding another', 'To be sure, it is a fine thing for our girls.', 'reg=old-fashioned, spoken'],
  ['fine', '/faɪn/', 'adjective', 'very good or impressive', 'What a fine thing for our girls!', 'note=Here the tone may be ironic rather than wholly sincere.'],
]

interface ParsedExtra {
  forms: string
  collocations: string
  register: string
  extraNote: string
}

function parseExtra(raw?: string): ParsedExtra {
  const out: ParsedExtra = { forms: '', collocations: '', register: '', extraNote: '' }
  if (!raw) return out
  for (const bit of raw.split(';')) {
    const at = bit.indexOf('=')
    if (at < 0) continue
    const key = bit.slice(0, at)
    const value = bit.slice(at + 1).trim()
    if (key === 'forms') out.forms = value
    else if (key === 'coll' || key === 'ant') out.collocations = out.collocations
      ? `${out.collocations}；${key === 'ant' ? '反义 ' : ''}${value}`
      : `${key === 'ant' ? '反义 ' : ''}${value}`
    else if (key === 'reg') out.register = value
    else if (key === 'note') out.extraNote = value
  }
  return out
}

/** 中文释义里已经带了「n. / v. / adj.」前缀，词典卡只展示后面的中文 */
export function stripPosPrefix(meaningZh: string): string {
  return meaningZh.replace(/^\s*(n|v|adj|adv|prep|phr)\.\s*/i, '').trim()
}

const INDEX = new Map<string, { row: Row; extra: ParsedExtra }>()
for (const row of ROWS) {
  INDEX.set(row[0].toLowerCase(), { row, extra: parseExtra(row[5]) })
}

/** 词形归一：大小写、连字符与常见屈折后缀 */
function normalize(word: string): string {
  return word.trim().toLowerCase().replace(/[\u2019\u2018']/g, '')
}

/** 未收录时尝试还原到词条原形（如 foretold → foretell） */
const INFLECTION: Record<string, string> = {
  foretold: 'foretell', vanished: 'vanish', peeped: 'peep', addressed: 'address',
  drifted: 'drift', eclipses: 'eclipse', predominates: 'predominate',
  acknowledged: 'acknowledge', considering: 'consider', sparkling: 'sparkle',
  pattering: 'patter', smouldering: 'smoulder', repellant: 'repellent',
  acknowledgeds: 'acknowledge',
}

export type DictionaryProvider = (
  word: string, meaningZh: string, note: string,
) => OxfordEntry | null | undefined

let customProvider: DictionaryProvider | null = null

/** 可替换入口：接入真实词典服务时调用；返回 null 会自动回退内置词条 */
export function setDictionaryProvider(fn: DictionaryProvider | null): void {
  customProvider = fn
}
export function resetDictionaryProvider(): void { customProvider = null }

/**
 * 查词。默认完全离线；未收录时返回 isFallback=true 的诚实条目
 * （不编造英英释义，只展示中文对照与本章语境）。
 */
export function lookupOxfordEntry(
  word: string,
  meaningZh = '',
  note = '',
  chapterSentence = '',
): OxfordEntry {
  const base: OxfordEntry = {
    word, ipa: '', pos: '', defEn: '', defZh: stripPosPrefix(meaningZh),
    example: '', chapterNote: note, chapterSentence,
    forms: '', collocations: '', register: '', extraNote: '', isFallback: true,
  }

  if (customProvider) {
    try {
      const custom = customProvider(word, meaningZh, note)
      if (custom) return { ...custom, chapterSentence: custom.chapterSentence || chapterSentence }
    } catch { /* 远程词典失败时静默回退内置词条 */ }
  }

  const key = normalize(word)
  let hit = INDEX.get(key)
  if (!hit) {
    const restored = INFLECTION[key]
    if (restored) hit = INDEX.get(restored)
  }
  if (!hit) {
    // 连字符 / 空格写法差异（如 counting house ↔ counting-house）
    const flat = key.replace(/[-\s]+/g, '')
    for (const [k, v] of INDEX) {
      if (k.replace(/[-\s]+/g, '') === flat) { hit = v; break }
    }
  }
  if (!hit) return base

  const [head, ipa, pos, defEn, example] = hit.row
  return {
    ...base,
    word, ipa, pos, defEn, example,
    forms: hit.extra.forms, collocations: hit.extra.collocations,
    register: hit.extra.register, extraNote: hit.extra.extraNote,
    isFallback: false,
  }
}

/** 供测试/设置页诊断：内置词条覆盖率 */
export function glossaryStats(): { entries: number; words: string[] } {
  return { entries: ROWS.length, words: ROWS.map((r) => r[0]) }
}
