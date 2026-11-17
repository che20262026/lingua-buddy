/**
 * [AI 发音评测] 中国学习者易错词库
 * ------------------------------------------------------------------
 * 定位：**不是**第 10 个词库。
 *   它不注册进 DECK_IDS / DECK_META，不进入五步闭环的词表调度，
 *   只是发音评测面板里的一个「优先练习清单」——同样的 WordEntry 生态，
 *   但独立于 DECK_IDS 之外，因此旧存档、旧断言、五步闭环全部零改动。
 *
 * 选词依据（都是中国学习者真实的高频发音障碍，不是随机凑数）：
 *   - /θ/ /ð/：舌尖音。中文没有对应音素，最常见的替换是 /s/ /z/ /d/ /t/
 *   - /v/ ↔ /w/：上齿咬下唇 vs 双唇圆唇，母语里没有 v/w 对立
 *   - /l/ ↔ /r/：英语 r 是卷舌，母语没有
 *   - 词尾辅音丛：-ed /-s 后的读音规则复杂，容易吞音
 *   - 多音节词的重音位置：常按拼写猜重音
 *   - 连读与弱读：thanked you / nice to meet you 这类固定搭配
 *
 * 内容为教学事实性整理（常见发音难点），释义为自写中文表述。
 */

/** 错误类型：用于 UI 分组与标签配色 */
export type ChallengerCategory =
  | 'th'      // 舌尖音 /θ/ /ð/
  | 'vw'      // /v/ 与 /w/ 混淆
  | 'lr'      // /l/ 与 /r/ 混淆
  | 'ending'  // 词尾辅音（-ed / -s）
  | 'stress'  // 重音位置
  | 'phrase'  // 连读与固定搭配

export interface PronunciationChallenger {
  /** 目标词或短语（评测时原样送给 AI） */
  word: string
  /** 国际音标（教学参考） */
  phonetic: string
  /** 中文释义，≤20 字 */
  meaningZh: string
  category: ChallengerCategory
  /** 中国学习者最常犯的具体错误 */
  commonError: string
  /** 一句话纠正提示，可直接展示给用户 */
  tip: string
}

/** 分类的中文标签（UI 直接用，不另写映射表） */
export const CHALLENGER_CATEGORY_LABEL: Record<ChallengerCategory, string> = {
  th: '舌尖音',
  vw: 'v / w 混淆',
  lr: 'l / r 混淆',
  ending: '词尾辅音',
  stress: '重音位置',
  phrase: '连读搭配',
}

/**
 * 18 条易错词：16 个单词 + 2 个固定搭配。
 * 顺序即推荐练习顺序（舌尖音 → v/w → l/r → 词尾 → 重音 → 连读）。
 */
export const PRONUNCIATION_CHALLENGERS: readonly PronunciationChallenger[] = [
  {
    word: 'think', phonetic: '/θɪŋk/', meaningZh: '想，思考', category: 'th',
    commonError: '把 /θ/ 读成 /s/ 或 /t/，听起来像 "sink"',
    tip: '舌尖轻触上齿送气，不要碰上齿龈；对比 sink 与 think 只差一个舌头位置。',
  },
  {
    word: 'three', phonetic: '/θriː/', meaningZh: '三', category: 'th',
    commonError: '把 /θ/ 读成 /f/，听起来像 "free"',
    tip: '/θ/ 是咬舌送气，不是上齿咬唇；先咬住舌尖再送气。',
  },
  {
    word: 'mouth', phonetic: '/maʊθ/', meaningZh: '嘴', category: 'th',
    commonError: '结尾的 /θ/ 被吞掉，听起来像 "mow"',
    tip: '双元音 /aʊ/ 收尾时别忘留出舌尖，把 /θ/ 完整送出来。',
  },
  {
    word: 'worth', phonetic: '/wɜːθ/', meaningZh: '价值，值得', category: 'th',
    commonError: '结尾 /θ/ 弱化成 /t/，重音也容易放错',
    tip: '重音在第一个音节 /wɜː/，结尾舌尖再轻触上齿完成 /θ/。',
  },
  {
    word: 'very', phonetic: '/ˈveri/', meaningZh: '非常', category: 'vw',
    commonError: '把 /v/ 读成 /w/，听起来像 "wary"',
    tip: '/v/ 上齿咬下唇要出声，/w/ 双唇圆唇不出声；把手放下巴就能感觉到差别。',
  },
  {
    word: 'vest', phonetic: '/vest/', meaningZh: '背心', category: 'vw',
    commonError: '与 west 混淆，/v/ 与 /w/ 互换',
    tip: '先咬下唇发 /v/，再自然过渡到 /e/；不要用嘴唇噘圆。',
  },
  {
    word: 'video', phonetic: '/ˈvɪdiəʊ/', meaningZh: '视频', category: 'vw',
    commonError: '/v/ 读成 /w/，且重音落在最后一个音节',
    tip: '重音在第一音节 /ˈvɪ/，/v/ 记得咬下唇。',
  },
  {
    word: 'water', phonetic: '/ˈwɔːtə(r)/', meaningZh: '水', category: 'vw',
    commonError: '双唇 /w/ 发得太轻，听起来像 "other"',
    tip: '/w/ 要先噘圆双唇再滑向 /ɔː/，嘴唇形状变化越明显越好。',
  },
  {
    word: 'world', phonetic: '/wɜːld/', meaningZh: '世界', category: 'lr',
    commonError: '/w/ 与 /r/ 混杂，听起来像 "word" 或 "orld"',
    tip: '先噘唇起头 /w/，再卷舌接 /ɜː/，两个口型要切换干净。',
  },
  {
    word: 'work', phonetic: '/wɜːk/', meaningZh: '工作', category: 'lr',
    commonError: '词尾卷舌 /r/ 过度，或与 "walk" 混淆',
    tip: '起头噘圆双唇，中段卷舌不碰任何地方，词尾 /k/ 干脆收住。',
  },
  {
    word: 'light', phonetic: '/laɪt/', meaningZh: '光，轻的', category: 'lr',
    commonError: '/l/ 读成卷舌 /r/，听起来像 "right"',
    tip: '舌尖顶上齿龈保持不动，不卷舌；/l/ 是「舌尖抵住」，/r/ 是「舌尖后缩」。',
  },
  {
    word: 'right', phonetic: '/raɪt/', meaningZh: '正确的，右侧', category: 'lr',
    commonError: '/r/ 读成 /l/，与 light 混淆',
    tip: '先卷舌再放开，不要用舌尖顶住上齿龈；卷起来的是 right。',
  },
  {
    word: 'comfortable', phonetic: '/ˈkʌmftəbl/', meaningZh: '舒适的', category: 'stress',
    commonError: '按拼写猜重音，读成 com-FORT-a-ble',
    tip: '重音在第一个音节 /ˈkʌm/，后面的 -fortable 全部弱读。',
  },
  {
    word: 'vegetable', phonetic: '/ˈvedʒtəbl/', meaningZh: '蔬菜', category: 'stress',
    commonError: '重音落在最后一个音节，且中间音节拖长',
    tip: '重音在第一音节 /ˈvedʒ/，四个音节读快一点，别逐字拼。',
  },
  {
    word: 'asked', phonetic: '/æskt/', meaningZh: '问，要求', category: 'ending',
    commonError: '词尾 -ed 读成 /ɪd/，听起来像 "ask id"',
    tip: '清辅音 /k/ 后的 -ed 读 /t/：/æskt/，一个音节干脆读完。',
  },
  {
    word: 'books', phonetic: '/bʊks/', meaningZh: '书（复数）', category: 'ending',
    commonError: '复数 -s 读成 /z/ 或干脆吞掉',
    tip: '清辅音 /k/ 后的复数 -s 读清辅音 /s/：/bʊks/，别加喉音。',
  },
  {
    word: 'thank you', phonetic: '/ˈθæŋk juː/', meaningZh: '谢谢你', category: 'phrase',
    commonError: '把 /θ/ 读成 /t/，且 thank 与 you 之间没有连读',
    tip: 'thank 的 /θ/ 要咬舌送气，you 弱读成 /ə/，两个词自然连在一起。',
  },
  {
    word: 'nice to meet you', phonetic: '/naɪs tə miːt juː/', meaningZh: '很高兴认识你', category: 'phrase',
    commonError: '逐字读导致三处重音，听起来像在报数',
    tip: '重音只落在 meet 上：nice to MEET you，to 和 you 都要弱读。',
  },
]

/** 按词查易错条目（大小写与首尾空格不敏感） */
export function challengerFor(word: string): PronunciationChallenger | undefined {
  const key = word.toLowerCase().trim()
  if (!key) return undefined
  return PRONUNCIATION_CHALLENGERS.find((c) => c.word.toLowerCase() === key)
}

/** 该词是否属于易错词库（用于在词卡上打「易错」标记、优先推送评测） */
export function isChallenger(word: string): boolean {
  return challengerFor(word) !== undefined
}

/** 按分类分组，供「易错词库」标签页渲染 */
export function groupChallengersByCategory(
  list: readonly PronunciationChallenger[] = PRONUNCIATION_CHALLENGERS,
): Array<{ category: ChallengerCategory; label: string; items: PronunciationChallenger[] }> {
  const groups = new Map<ChallengerCategory, PronunciationChallenger[]>()
  for (const c of list) {
    const bucket = groups.get(c.category)
    if (bucket) bucket.push(c)
    else groups.set(c.category, [c])
  }
  return [...groups.entries()].map(([category, items]) => ({
    category,
    label: CHALLENGER_CATEGORY_LABEL[category],
    items,
  }))
}
