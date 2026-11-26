/**
 * 俄语分级词库（ТРКИ / CEFR A1、A2）—— 接入既有 Word Lab 五步闭环。
 *
 * 设计约束：
 * - 词条字段忠实保留用户契约：id / word（带重音）/ meaning / pos / gender /
 *   exampleRu / exampleCn / level；同时映射成既有 WordEntry，五步状态机一行不改。
 * - word 字段存【非重音】形式以保证 findWord 小写命中；带重音写法放 wordAccented。
 * - 例句为原创教学句，不复制任何教材字节；配图走 emoji/SVG 兜底，零外链。
 * - DeckId 为 ru_a1 / ru_a2，不进 DECK_IDS（仍 7 个），仿 china_track 并列注册。
 */

import type { DeckId, DeckMeta, RussianCases, WordEntry } from '../../wordLabTypes'

export type RussianDeckId = 'ru_a1' | 'ru_a2'

/** 用户契约里的俄语词条原始结构（静态 JSON 等价物） */
export interface RussianWordSeed {
  id: string
  /** 带重音的西里尔词（展示用） */
  word: string
  /** 中文释义 */
  meaning: string
  /** 词性（中文标注） */
  pos: string
  /** 俄语特有：阳性 / 阴性 / 中性 */
  gender: '阳性' | '阴性' | '中性'
  exampleRu: string
  exampleCn: string
  /** ТРКИ / CEFR 分级 */
  level: 'A1' | 'A2'
  /** [S2 语法卡] 名词六格变格；动词/形容词省略（无性数格变化） */
  cases?: RussianCases
}

export const RUSSIAN_DECK_IDS: RussianDeckId[] = ['ru_a1', 'ru_a2']

export const RUSSIAN_DECK_META: Record<RussianDeckId, DeckMeta> = {
  ru_a1: {
    id: 'ru_a1' as DeckId,
    name: '俄语 A1',
    subtitle: 'ТРКИ A1 · 最基础的日常词',
    cefr: 'A1',
    shardSize: 300,
    emblem: '🇷🇺',
    tint: 'brand',
    language: 'ru',
  },
  ru_a2: {
    id: 'ru_a2' as DeckId,
    name: '俄语 A2',
    subtitle: 'ТРКИ A2 · 生活与出行高频词',
    cefr: 'A2',
    shardSize: 300,
    emblem: '🇷🇺',
    tint: 'mint',
    language: 'ru',
  },
}

/** 俄语 A1 种子：12 个最基础名词/动词/形容词，带重音与性数标注 */
const RU_A1_SEEDS: RussianWordSeed[] = [
  { id: 'ru-a1-01', word: 'во́да', meaning: '水', pos: '名词', gender: '阴性',
    exampleRu: 'Я пью во́ду.', exampleCn: '我在喝水。', level: 'A1',
    cases: { nom: 'во́да', gen: 'воды́', dat: 'воде́', acc: 'во́ду', ins: 'водо́й', pre: 'воде́' } },
  { id: 'ru-a1-02', word: 'хлеб', meaning: '面包', pos: '名词', gender: '阳性',
    exampleRu: 'Это све́жий хлеб.', exampleCn: '这是新鲜的面包。', level: 'A1',
    cases: { nom: 'хлеб', gen: 'хле́ба', dat: 'хле́бу', acc: 'хлеб', ins: 'хле́бом', pre: 'хле́бе' } },
  { id: 'ru-a1-03', word: 'ма́ма', meaning: '妈妈', pos: '名词', gender: '阴性',
    exampleRu: 'Моя́ ма́ма дома.', exampleCn: '我妈妈在家。', level: 'A1',
    cases: { nom: 'ма́ма', gen: 'ма́мы', dat: 'ма́ме', acc: 'ма́му', ins: 'ма́мой', pre: 'ма́ме' } },
  { id: 'ru-a1-04', word: 'друг', meaning: '朋友', pos: '名词', gender: '阳性',
    exampleRu: 'Он мой друг.', exampleCn: '他是我的朋友。', level: 'A1',
    cases: { nom: 'друг', gen: 'дру́га', dat: 'дру́гу', acc: 'дру́га', ins: 'дру́гом', pre: 'дру́ге' } },
  { id: 'ru-a1-05', word: 'ко́мната', meaning: '房间', pos: '名词', gender: '阴性',
    exampleRu: 'Эта ко́мната больша́я.', exampleCn: '这个房间很大。', level: 'A1',
    cases: { nom: 'ко́мната', gen: 'ко́мнаты', dat: 'ко́мнате', acc: 'ко́мнату', ins: 'ко́мнатой', pre: 'ко́мнате' } },
  { id: 'ru-a1-06', word: 'окно́', meaning: '窗户', pos: '名词', gender: '中性',
    exampleRu: 'Окно́ откры́то.', exampleCn: '窗户开着。', level: 'A1',
    cases: { nom: 'окно́', gen: 'окна́', dat: 'окну́', acc: 'окно́', ins: 'окно́м', pre: 'окне́' } },
  { id: 'ru-a1-07', word: 'чита́ть', meaning: '读', pos: '动词', gender: '中性',
    exampleRu: 'Я люблю́ чита́ть.', exampleCn: '我喜欢阅读。', level: 'A1' },
  { id: 'ru-a1-08', word: 'писа́ть', meaning: '写', pos: '动词', gender: '中性',
    exampleRu: 'Он пи́шет письмо́.', exampleCn: '他在写信。', level: 'A1' },
  { id: 'ru-a1-09', word: 'есть', meaning: '吃', pos: '动词', gender: '中性',
    exampleRu: 'Мы едим за́втрак.', exampleCn: '我们吃早餐。', level: 'A1' },
  { id: 'ru-a1-10', word: 'идти́', meaning: '走，去', pos: '动词', gender: '中性',
    exampleRu: 'Я иду́ в шко́лу.', exampleCn: '我去上学。', level: 'A1' },
  { id: 'ru-a1-11', word: 'хоро́ший', meaning: '好的', pos: '形容词', gender: '阳性',
    exampleRu: 'Это хоро́ший день.', exampleCn: '这是美好的一天。', level: 'A1' },
  { id: 'ru-a1-12', word: 'большо́й', meaning: '大的', pos: '形容词', gender: '阳性',
    exampleRu: 'Большо́й го́род.', exampleCn: '大城市。', level: 'A1' },
]

/** 俄语 A2 种子：12 个生活/出行高频词 */
const RU_A2_SEEDS: RussianWordSeed[] = [
  { id: 'ru-a2-01', word: 'вокза́л', meaning: '火车站', pos: '名词', gender: '阳性',
    exampleRu: 'По́езд при́был на вокза́л.', exampleCn: '火车到站了。', level: 'A2',
    cases: { nom: 'вокза́л', gen: 'вокза́ла', dat: 'вокза́лу', acc: 'вокза́л', ins: 'вокза́лом', pre: 'вокза́ле' } },
  { id: 'ru-a2-02', word: 'биле́т', meaning: '票', pos: '名词', gender: '阳性',
    exampleRu: 'Я купи́л биле́т.', exampleCn: '我买了票。', level: 'A2',
    cases: { nom: 'биле́т', gen: 'биле́та', dat: 'биле́ту', acc: 'биле́т', ins: 'биле́том', pre: 'биле́те' } },
  { id: 'ru-a2-03', word: 'гости́ница', meaning: '酒店', pos: '名词', gender: '阴性',
    exampleRu: 'Гости́ница недалеко́.', exampleCn: '酒店不远。', level: 'A2',
    cases: { nom: 'гости́ница', gen: 'гости́ницы', dat: 'гости́нице', acc: 'гости́ницу', ins: 'гости́ницей', pre: 'гости́нице' } },
  { id: 'ru-a2-04', word: 'у́лица', meaning: '街道', pos: '名词', gender: '阴性',
    exampleRu: 'Эта у́лица ста́рая.', exampleCn: '这条街很古老。', level: 'A2',
    cases: { nom: 'у́лица', gen: 'у́лицы', dat: 'у́лице', acc: 'у́лицу', ins: 'у́лицей', pre: 'у́лице' } },
  { id: 'ru-a2-05', word: 'магази́н', meaning: '商店', pos: '名词', gender: '阳性',
    exampleRu: 'Магази́н откры́т до ве́чера.', exampleCn: '商店开到晚上。', level: 'A2',
    cases: { nom: 'магази́н', gen: 'магази́на', dat: 'магази́ну', acc: 'магази́н', ins: 'магази́ном', pre: 'магази́не' } },
  { id: 'ru-a2-06', word: 'вре́мя', meaning: '时间', pos: '名词', gender: '中性',
    exampleRu: 'Ско́лько сейча́с вре́мени?', exampleCn: '现在几点了？', level: 'A2',
    cases: { nom: 'вре́мя', gen: 'вре́мени', dat: 'вре́мени', acc: 'вре́мя', ins: 'вре́менем', pre: 'вре́мени' } },
  { id: 'ru-a2-07', word: 'купи́ть', meaning: '买（完成体）', pos: '动词', gender: '中性',
    exampleRu: 'Я хочу́ купи́ть хлеб.', exampleCn: '我想买面包。', level: 'A2' },
  { id: 'ru-a2-08', word: 'говори́ть', meaning: '说，讲', pos: '动词', gender: '中性',
    exampleRu: 'Вы говори́те по-ру́сски?', exampleCn: '您说俄语吗？', level: 'A2' },
  { id: 'ru-a2-09', word: 'понима́ть', meaning: '理解', pos: '动词', gender: '中性',
    exampleRu: 'Я понима́ю вопрос.', exampleCn: '我理解这个问题。', level: 'A2' },
  { id: 'ru-a2-10', word: 'интере́сный', meaning: '有趣的', pos: '形容词', gender: '阳性',
    exampleRu: 'Э́то интере́сная кни́га.', exampleCn: '这是一本有趣的书。', level: 'A2' },
  { id: 'ru-a2-11', word: 'за́втрак', meaning: '早餐', pos: '名词', gender: '阳性',
    exampleRu: 'За́втрак уже́ гото́в.', exampleCn: '早餐已经准备好了。', level: 'A2',
    cases: { nom: 'за́втрак', gen: 'за́втрака', dat: 'за́втраку', acc: 'за́втрак', ins: 'за́втраком', pre: 'за́втраке' } },
  { id: 'ru-a2-12', word: 'рабо́та', meaning: '工作', pos: '名词', gender: '阴性',
    exampleRu: 'Моя́ рабо́та интере́сная.', exampleCn: '我的工作很有意思。', level: 'A2',
    cases: { nom: 'рабо́та', gen: 'рабо́ты', dat: 'рабо́те', acc: 'рабо́ту', ins: 'рабо́той', pre: 'рабо́те' } },
]

/**
 * 把用户契约的俄语词条适配成既有 WordEntry。
 * - word 用 NFD 分解去重音 → 非重音形式，findWord 可命中；wordAccented 保留原词；
 * - examples[0]=exampleRu（S1/S2 展示俄语例句）、examples[1]=exampleCn；
 * - meaningZh=meaning（中文释义）、pos 拼上 gender（俄语性数信息不丢）、cefr=level。
 */
/**
 * [й/и 识别 Bug 修复] 只剥「重音符号」（U+0301 acute 等），必须保留 U+0306 短音符。
 * 原因：й 的 NFD 分解 = и(U+0438) + 短音符(U+0306)，而 U+0306 落在 \u0300-\u036f 区间。
 * 旧实现无条件剥离该区间 → й 被误抹成 и，答案词从源头就错了（S3 永远判「й 写成 и」）。
 * 这里先把短音符保护成占位符，剥完重音再还原，最后统一回 NFC。
 */
const BREVE = '\u0306'
function stripStress(word: string): string {
  return word.normalize('NFD')
    .replace(new RegExp(BREVE, 'g'), '\u0000')       // 保护 й 的短音符
    .replace(/[\u0300-\u036f]/g, '')                  // 只去掉真正的重音
    .replace(/\u0000/g, BREVE)                        // 还原短音符
    .normalize('NFC')                                 // и+ breve 合回预组合 й
}

function toWordEntry(seed: RussianWordSeed, deck: RussianDeckId): WordEntry {
  const plain = stripStress(seed.word)
  return {
    word: plain,
    phonetic: '',
    pos: `${seed.pos} · ${seed.gender}`,
    meaningZh: seed.meaning,
    meaningEn: seed.meaning,
    tags: [deck, 'ru', `level:${seed.level}`],
    cefr: seed.level,
    examples: [seed.exampleRu, seed.exampleCn],
    imageQuery: `a simple illustration of ${seed.meaning}`,
    imageAlt: `Illustration for ${plain}`,
    imageUrl: '',
    collocations: [seed.word, plain],
    pronunciationTip: `俄语重音：${seed.word}`,
    // 用户契约字段（可选扩展，旧词库无此字段）
    language: 'ru',
    wordAccented: seed.word,
    gender: seed.gender,
    level: seed.level,
    // [S2 语法卡] 名词六格原样带出；动词/形容词 seed 无 cases 则 undefined，不写空壳
    ...(seed.cases ? { cases: seed.cases } : {}),
  }
}

export const RU_A1_SEED: WordEntry[] = RU_A1_SEEDS.map((s) => toWordEntry(s, 'ru_a1'))
export const RU_A2_SEED: WordEntry[] = RU_A2_SEEDS.map((s) => toWordEntry(s, 'ru_a2'))

/** 原始契约结构导出，供冒烟逐字核对用户要求的字段 */
export const RUSSIAN_SEEDS_RAW: RussianWordSeed[] = [...RU_A1_SEEDS, ...RU_A2_SEEDS]
