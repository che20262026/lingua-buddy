import type { Character, GrammarPoint, Keyword, Phrase, Scenario } from '../types'

/* ------------------------------------------------------------------ *
 * 内置示例文本（Mock 数据主体）与本地知识库
 * 全部文案、角色、场景均为 LinguaBuddy 原创
 * ------------------------------------------------------------------ */

export const SAMPLE_TEXT =
  "Last weekend, Lily visited a farmers' market with her friend Tom. They bought fresh apples and talked about healthy eating. Lily wanted to cook a simple dinner, but she was not sure which vegetables to choose. Tom suggested carrots and tomatoes, and they agreed to make a salad together."

export const SAMPLE_TEXTS: Array<{ label: string; text: string }> = [
  { label: '市集与晚餐', text: SAMPLE_TEXT },
  {
    label: '城市旅行',
    text: 'Mia took a train to the old city last Saturday. She walked along the river, visited a small museum and tried local coffee. The weather was sunny, so she sat in the park and read a book about photography. Before dinner she wrote a short postcard to her friend.',
  },
  {
    label: '校园项目',
    text: 'Our team started a new project about green cities this week. We read three articles, shared ideas in a meeting and designed a simple app for recycling. The teacher asked us to present our plan on Friday. Everyone agreed that small daily habits can make a real difference.',
  },
]

/** 小型英汉词典：优先收录示例文本词汇，并覆盖常见生活/学习话题 */
export const WORD_BANK: Record<string, { meaning: string; example: string }> = {
  market: { meaning: '市场，市集', example: 'We bought fruit at the farmers\' market.' },
  farmers: { meaning: '农夫的；农贸市场', example: 'Farmers bring fresh food every morning.' },
  fresh: { meaning: '新鲜的', example: 'These apples are really fresh.' },
  apples: { meaning: '苹果（复数）', example: 'Would you like some apples?' },
  apple: { meaning: '苹果', example: 'I eat an apple after lunch.' },
  healthy: { meaning: '健康的', example: 'A healthy lunch gives me energy.' },
  eating: { meaning: '饮食；吃', example: 'Healthy eating is easier than you think.' },
  cook: { meaning: '烹饪，做饭', example: 'I want to cook a simple dinner.' },
  simple: { meaning: '简单的', example: 'Let\'s start with a simple recipe.' },
  dinner: { meaning: '晚餐', example: 'We made dinner together last night.' },
  vegetables: { meaning: '蔬菜（复数）', example: 'Which vegetables do you like?' },
  choose: { meaning: '选择', example: 'It is hard to choose just one.' },
  suggested: { meaning: '建议（过去式）', example: 'Tom suggested carrots and tomatoes.' },
  carrots: { meaning: '胡萝卜', example: 'Carrots add a nice colour to the salad.' },
  tomatoes: { meaning: '西红柿', example: 'The tomatoes look very fresh.' },
  agreed: { meaning: '同意（过去式）', example: 'We agreed to meet at six.' },
  salad: { meaning: '沙拉', example: 'A fresh salad is quick to make.' },
  together: { meaning: '一起', example: 'Let\'s cook together this evening.' },
  weekend: { meaning: '周末', example: 'What did you do last weekend?' },
  visited: { meaning: '参观，拜访（过去式）', example: 'We visited a small museum.' },
  bought: { meaning: '买（过去式）', example: 'She bought a book yesterday.' },
  talked: { meaning: '交谈（过去式）', example: 'We talked about our plans.' },
  wanted: { meaning: '想要（过去式）', example: 'He wanted to try something new.' },
  friend: { meaning: '朋友', example: 'My friend loves cooking.' },
  recipe: { meaning: '食谱', example: 'Do you have a simple recipe?' },
  ingredient: { meaning: '食材，原料', example: 'Fresh ingredients make a big difference.' },
  local: { meaning: '当地的', example: 'I like local food markets.' },
  taste: { meaning: '味道；尝起来', example: 'This soup tastes great.' },
  sweet: { meaning: '甜的', example: 'The apples are sweet and crisp.' },
  crunchy: { meaning: '脆的', example: 'Carrots are crunchy and fresh.' },
  meal: { meaning: '一餐', example: 'That was a lovely meal.' },
  kitchen: { meaning: '厨房', example: 'We chopped vegetables in the kitchen.' },
  share: { meaning: '分享', example: 'Would you like to share your idea?' },
  plan: { meaning: '计划', example: 'What is your plan for tonight?' },
  idea: { meaning: '主意，想法', example: 'That\'s a great idea.' },
  question: { meaning: '问题', example: 'Can I ask you a question?' },
  recommend: { meaning: '推荐', example: 'Which one would you recommend?' },
  train: { meaning: '火车', example: 'The train leaves at nine.' },
  travel: { meaning: '旅行', example: 'I love travelling by train.' },
  city: { meaning: '城市', example: 'The old city is full of stories.' },
  river: { meaning: '河流', example: 'We walked along the river.' },
  museum: { meaning: '博物馆', example: 'The museum was quiet and bright.' },
  coffee: { meaning: '咖啡', example: 'She tried the local coffee.' },
  weather: { meaning: '天气', example: 'The weather was sunny all day.' },
  sunny: { meaning: '晴朗的', example: 'It was a sunny afternoon.' },
  park: { meaning: '公园', example: 'We sat in the park for an hour.' },
  book: { meaning: '书', example: 'I read a book about photography.' },
  photography: { meaning: '摄影', example: 'Photography is her new hobby.' },
  postcard: { meaning: '明信片', example: 'He wrote a short postcard.' },
  team: { meaning: '团队', example: 'Our team meets every Monday.' },
  project: { meaning: '项目', example: 'The project starts this week.' },
  green: { meaning: '绿色的；环保的', example: 'We designed a green city plan.' },
  article: { meaning: '文章', example: 'I read an interesting article.' },
  meeting: { meaning: '会议', example: 'We shared ideas in a meeting.' },
  designed: { meaning: '设计（过去式）', example: 'They designed a simple app.' },
  app: { meaning: '应用程序', example: 'The app helps people recycle.' },
  recycling: { meaning: '回收利用', example: 'Recycling is a daily habit.' },
  teacher: { meaning: '老师', example: 'The teacher asked a question.' },
  present: { meaning: '展示，呈现', example: 'We will present our plan on Friday.' },
  habits: { meaning: '习惯（复数）', example: 'Small habits can change a lot.' },
  difference: { meaning: '改变，差异', example: 'One small step makes a difference.' },
  learn: { meaning: '学习', example: 'I want to learn new words.' },
  practice: { meaning: '练习', example: 'Daily practice really helps.' },
  language: { meaning: '语言', example: 'English is a useful language.' },
  word: { meaning: '单词', example: 'Let\'s use this word in a sentence.' },
  sentence: { meaning: '句子', example: 'Try a longer sentence this time.' },
  conversation: { meaning: '对话', example: 'That was a fun conversation.' },
  opinion: { meaning: '观点', example: 'In my opinion, it works well.' },
  story: { meaning: '故事', example: 'Tell me the story in your own words.' },
  morning: { meaning: '早晨', example: 'I read English every morning.' },
  walk: { meaning: '散步；步行', example: 'Let\'s take a walk after dinner.' },
  water: { meaning: '水', example: 'Can I have some water, please?' },
  lunch: { meaning: '午餐', example: 'We had a light lunch.' },
  breakfast: { meaning: '早餐', example: 'Breakfast is the first meal of the day.' },
  environment: { meaning: '环境', example: 'We should care about the environment.' },
  future: { meaning: '未来', example: 'What will the future look like?' },
  music: { meaning: '音乐', example: 'I listen to music while cooking.' },
  garden: { meaning: '花园', example: 'They grow tomatoes in the garden.' },
  season: { meaning: '季节', example: 'Autumn is my favourite season.' },
  price: { meaning: '价格', example: 'What is the price of these apples?' },
  organic: { meaning: '有机的', example: 'Are these vegetables organic?' },
  decide: { meaning: '决定', example: 'We need to decide what to cook.' },
  enough: { meaning: '足够的', example: 'Do we have enough tomatoes?' },
  maybe: { meaning: '也许', example: 'Maybe we can add some carrots.' },
}

export const PHRASE_RULES: Array<{ re: RegExp; phrase: string; meaning: string; example: string }> = [
  { re: /healthy eating/i, phrase: 'healthy eating', meaning: '健康饮食', example: 'We talked about healthy eating.' },
  { re: /talk(ed)? about/i, phrase: 'talk about', meaning: '谈论某事', example: 'Let\'s talk about the plan.' },
  { re: /want(ed)? to/i, phrase: 'want to do', meaning: '想要做某事', example: 'I want to cook a simple dinner.' },
  { re: /not sure/i, phrase: 'be not sure', meaning: '不太确定', example: 'I\'m not sure which one to choose.' },
  { re: /which .{0,24} to choose/i, phrase: 'which ... to choose', meaning: '该选哪一个', example: 'I\'m not sure which vegetables to choose.' },
  { re: /suggest(ed)? /i, phrase: 'suggest + 名词 / doing', meaning: '提议、推荐', example: 'Can you suggest a good recipe?' },
  { re: /agreed? to/i, phrase: 'agree to do', meaning: '同意做某事', example: 'We agreed to make a salad together.' },
  { re: /make a salad/i, phrase: 'make a salad', meaning: '做一份沙拉', example: 'Let\'s make a salad together.' },
  { re: /last weekend/i, phrase: 'last weekend', meaning: '上周末', example: 'What did you do last weekend?' },
  { re: /a farmers' market/i, phrase: 'a farmers\' market', meaning: '农夫市集', example: 'We met at a farmers\' market.' },
  { re: /took a train|by train/i, phrase: 'take a train', meaning: '乘火车', example: 'She took a train to the city.' },
  { re: /in my opinion/i, phrase: 'in my opinion', meaning: '在我看来', example: 'In my opinion, it is a good idea.' },
  { re: /make a (real )?difference/i, phrase: 'make a difference', meaning: '带来改变', example: 'Small habits make a real difference.' },
  { re: /shared ideas/i, phrase: 'share ideas', meaning: '分享想法', example: 'We shared ideas in the meeting.' },
]

export const FALLBACK_PHRASES: Phrase[] = [
  { phrase: 'Would you like to ...?', meaning: '礼貌地邀请对方', example: 'Would you like to try a different one?' },
  { phrase: 'How about ...?', meaning: '提出建议', example: 'How about adding some tomatoes?' },
  { phrase: 'That sounds great.', meaning: '表达赞同', example: 'That sounds great, let\'s do it.' },
  { phrase: 'Could you tell me more about ...?', meaning: '追问细节', example: 'Could you tell me more about your idea?' },
  { phrase: 'I\'m not sure about ...', meaning: '委婉表达不确定', example: 'I\'m not sure about the price.' },
  { phrase: 'Let\'s ... together.', meaning: '提议一起行动', example: 'Let\'s cook together tonight.' },
]

export const GRAMMAR_RULES: Array<{ re: RegExp; point: string; explanation: string }> = [
  { re: /\b(visited|bought|talked|wanted|suggested|agreed|went|took|wrote|read|sat|made|started|designed|asked|walked|tried)\b/i, point: '一般过去时 Simple Past', explanation: '描述过去发生并已结束的动作，动词用过去式；常搭配 last weekend / yesterday 等时间状语。' },
  { re: /\bwhich [a-z]+ to [a-z]+/i, point: '疑问词 + to do', explanation: '把疑问句压缩成名词性结构，如 "which vegetables to choose"，比从句更简洁自然。' },
  { re: /\bnot sure\b/i, point: 'be not sure + 从句', explanation: '表达不确定，后面可接疑问词引导的从句或 "which ... to do" 结构。' },
  { re: /\bbut\b/i, point: '转折连词 but', explanation: '连接两个意思相反的分句，让表达有层次；注意前面通常加逗号。' },
  { re: /\b(would|could|should|might|can|may)\b/i, point: '情态动词 Modals', explanation: '表示建议、可能性或礼貌程度，后接动词原形，是让语气变柔和的好帮手。' },
  { re: /\bbecause\b|\bso\b/i, point: '原因与结果 because / so', explanation: 'because 引出原因，so 引出结果；一句话里通常只用其中一个。' },
  { re: /\bif\b/i, point: '条件句 If-clause', explanation: 'if 引导条件，主句说明结果，适合表达假设和计划。' },
  { re: /\b(are|is|was|were) [a-z]+ed\b/i, point: '被动语态 Passive Voice', explanation: '强调动作的承受者，结构为 be + 过去分词。' },
]

export const FALLBACK_GRAMMAR: GrammarPoint[] = [
  { point: '一般现在时 Simple Present', explanation: '描述习惯、事实和普遍情况；第三人称单数记得加 -s。' },
  { point: '名词单复数 Plural Nouns', explanation: '可数名词表示多个时加 -s / -es，搭配 some / many / a few 使用。' },
  { point: '基本语序 SVO', explanation: '英语最常见的主语 + 谓语 + 宾语结构，先说"谁做了什么"最稳妥。' },
]

export const TOPIC_RULES: Array<{ re: RegExp; topic: string }> = [
  { re: /market|apple|vegetable|salad|cook|dinner|food|recipe|eat/i, topic: '逛市集与健康晚餐' },
  { re: /train|travel|city|museum|hotel|postcard|ticket|river|trip/i, topic: '城市漫游与旅行见闻' },
  { re: /team|project|teacher|class|student|meeting|app|homework|study/i, topic: '团队项目与校园生活' },
  { re: /climate|environment|green|recycl|energy|planet/i, topic: '环保与可持续生活' },
  { re: /book|story|read|write|article|photography|music|film/i, topic: '阅读与兴趣分享' },
  { re: /work|office|email|company|customer|business/i, topic: '职场沟通与协作' },
]

/** 原创角色池：名字、身份、语气均为本项目自创 */
export const CHARACTER_POOL: Omit<Character, 'id'>[] = [
  {
    name: 'Mia', role: '市集摊主 / Market Stall Owner', personality: '热情、语速轻快，喜欢用短句和提问拉近距离',
    goal: '帮对方挑选新鲜食材，并介绍当季推荐',
    sampleLines: ['Fresh from the garden this morning!', 'Which one would you like to try?', 'That\'s a lovely choice.'],
  },
  {
    name: 'Leo', role: '爱做饭的朋友 / Home Cook', personality: '随和、爱开玩笑，常说 "How about..." 提建议',
    goal: '和朋友一起把简单晚餐定下来',
    sampleLines: ['How about a quick salad?', 'Let\'s keep it simple and tasty.', 'Good call!'],
  },
  {
    name: 'Nora', role: '营养爱好者 / Nutrition Enthusiast', personality: '温和耐心，喜欢解释原因，常给鼓励',
    goal: '聊健康饮食，给出温和可行的小建议',
    sampleLines: ['That\'s a nice start!', 'It helps to add some colour to your plate.', 'Small habits make a difference.'],
  },
  {
    name: 'Kai', role: '生活记录者 / Curious Storyteller', personality: '好奇心强，爱追问细节，语气轻松',
    goal: '请对方复述经历并挖掘有趣的细节',
    sampleLines: ['Oh, tell me more about that!', 'What happened next?', 'That sounds like a great day.'],
  },
  {
    name: 'Ava', role: '学习伙伴 / Conversation Partner', personality: '友善、鼓励式，会放慢节奏配合对方',
    goal: '一起讨论文本内容，交换看法',
    sampleLines: ['What do you think about it?', 'I see it a little differently.', 'Could you say that in another way?'],
  },
  {
    name: 'Ben', role: '本地向导 / Friendly Local', personality: '务实、条理清楚，喜欢给具体信息',
    goal: '提供实用信息并确认对方的需求',
    sampleLines: ['Sure, here\'s what I\'d suggest.', 'Would that work for you?', 'Let me check one thing.'],
  },
]

export const SENTENCE_FRAMES = [
  'I think ... because ...',
  'Could you tell me more about ...?',
  'How about ...?',
  'I\'d like to ...',
  'In my opinion, ...',
  'I\'m not sure which ... to ...',
  'Let\'s ... together.',
]

export const HINT_POOL = [
  'Could you tell me more about that?',
  'I\'d like to try ...',
  'What would you recommend?',
  'That sounds great, but ...',
  'In my opinion, ...',
  'How about ...?',
  'Let\'s ... together.',
  'I\'m not sure which one to choose.',
]

export const PRAISE_POOL = [
  '这句表达很自然，节奏刚刚好 ✨',
  '你把想法说清楚了，很棒的一步！',
  '用词选择有想法，继续保持～',
  '句子结构很稳，读起来很顺。',
  '敢开口就是最厉害的部分，给你鼓掌 👏',
  '这句里的语气很地道，赞！',
]

export const ACHIEVEMENTS: Array<{ id: string; name: string; desc: string; emblem: string }> = [
  { id: 'first_step', name: '破冰旅人', desc: '完成第一次角色对话', emblem: '🚀' },
  { id: 'words_10', name: '词汇收藏家', desc: '累计覆盖 10 个目标词', emblem: '📚' },
  { id: 'streak_3', name: '三日之约', desc: '连续学习 3 天', emblem: '🔥' },
  { id: 'xp_100', name: '百点冒险家', desc: '累计获得 100 XP', emblem: '⭐' },
  { id: 'turns_15', name: '开口勇士', desc: '累计发言 15 轮', emblem: '🎙️' },
  { id: 'mistakes_5', name: '精修工匠', desc: '掌握 5 条错题', emblem: '🛠️' },
]

/** 与示例文本事实严格一致的 4 个专属场景 */
export function buildSampleScenarios(): Scenario[] {
  return [
    {
      id: 's1', title: '在农夫市集挑苹果', emblem: '🍎', tint: 'from-coral-100 to-sun-100',
      goal: '向摊主询问新鲜苹果，说明自己想做一顿简单晚餐，并完成挑选。',
      characters: [
        {
          id: 'c1', name: 'Lily', role: '逛市集的顾客', personality: '友好、有点拿不定主意，喜欢先问再决定',
          goal: '了解苹果是否新鲜，选出想买的那一份',
          sampleLines: ['Are these apples fresh today?', 'I\'d like to cook a simple dinner.'],
        },
        {
          id: 'c2', name: 'Tom', role: '同行的朋友', personality: '随和、爱提建议',
          goal: '陪 Lily 挑选，顺带聊聊健康饮食',
          sampleLines: ['How about these ones?', 'We talked about healthy eating, remember?'],
        },
        {
          id: 'c3', name: 'Mia', role: '市集摊主', personality: '热情、语速轻快，爱用短句提问',
          goal: '介绍当季苹果，帮顾客做决定',
          sampleLines: ['Fresh from the garden this morning!', 'Which ones would you like?'],
        },
      ],
      targetWords: ['fresh', 'apples', 'market', 'healthy', 'choose'],
      targetPhrases: ['talk about', 'a farmers\' market', 'Would you like to ...?'],
      sentenceFrames: ['Are these ... fresh?', 'I\'m looking for ...', 'Could you tell me about ...?'],
      openingLine: 'Good morning! These apples came in fresh today. Are you two looking for something special?',
      suggestedReplies: [
        'Yes, they look fresh! We\'d like some apples, please.',
        'We want to cook a simple dinner. Which apples would you recommend?',
        'I\'m not sure which ones to choose. Could you help us?',
      ],
      rounds: 6,
    },
    {
      id: 's2', title: '该选哪种蔬菜？', emblem: '🥕', tint: 'from-mint-100 to-brand-100',
      goal: '说出自己不确定的地方，听取 Tom 的建议，最后决定买胡萝卜和西红柿。',
      characters: [
        {
          id: 'c1', name: 'Lily', role: '准备晚餐的人', personality: '认真、愿意提问，不确定时会直接说出来',
          goal: '表达"不知道选什么蔬菜"并做出决定',
          sampleLines: ['I\'m not sure which vegetables to choose.', 'That sounds great.'],
        },
        {
          id: 'c2', name: 'Tom', role: '给出建议的朋友', personality: '轻松务实，喜欢用 How about 提点子',
          goal: '建议胡萝卜和西红柿，并说明理由',
          sampleLines: ['How about carrots and tomatoes?', 'They\'re fresh and easy to cook.'],
        },
      ],
      targetWords: ['vegetables', 'carrots', 'tomatoes', 'suggested', 'choose'],
      targetPhrases: ['be not sure', 'which ... to choose', 'How about ...?'],
      sentenceFrames: ['I\'m not sure which ... to ...', 'What would you recommend?', 'Let\'s take ...'],
      openingLine: 'We have the apples. Now, which vegetables should we get for dinner?',
      suggestedReplies: [
        'I\'m not sure which vegetables to choose. Any ideas?',
        'What would you recommend for a simple dinner?',
        'I was thinking about a salad. What do you think?',
      ],
      rounds: 6,
    },
    {
      id: 's3', title: '一起做那份沙拉', emblem: '🥗', tint: 'from-mint-100 to-sun-100',
      goal: '和 Tom 分工做沙拉，聊一聊为什么这算健康饮食，并邀请朋友一起尝。',
      characters: [
        {
          id: 'c1', name: 'Lily', role: '厨房里的主厨', personality: '有条理、乐于分工',
          goal: '安排步骤，用上目标词描述食材',
          sampleLines: ['Let\'s make a salad together.', 'Could you wash the tomatoes?'],
        },
        {
          id: 'c2', name: 'Tom', role: '厨房搭档', personality: '配合度高，爱用短句回应',
          goal: '回应分工，补充健康饮食的看法',
          sampleLines: ['Good call! I\'ll cut the carrots.', 'Fresh vegetables make it healthy.'],
        },
        {
          id: 'c3', name: 'Nora', role: '来串门的朋友', personality: '温和、爱鼓励，喜欢解释原因',
          goal: '询问沙拉的做法并给出一句鼓励',
          sampleLines: ['That looks lovely! What\'s in it?', 'Small habits make a difference.'],
        },
      ],
      targetWords: ['salad', 'fresh', 'healthy', 'together', 'ingredients'],
      targetPhrases: ['make a salad', 'healthy eating', 'Let\'s ... together.'],
      sentenceFrames: ['Let\'s ... together.', 'First, we can ...', 'It\'s healthy because ...'],
      openingLine: 'We agreed to make a salad together. Shall I wash the carrots and tomatoes first?',
      suggestedReplies: [
        'Great idea. I\'ll cut the vegetables while you wash them.',
        'Let\'s make a salad together with the fresh ingredients.',
        'It\'s a simple dinner, but healthy eating starts here!',
      ],
      rounds: 6,
    },
    {
      id: 's4', title: '把周末讲给朋友听', emblem: '🎙️', tint: 'from-brand-100 to-coral-100',
      goal: '用过去时复述上周末的市集之行，包括买了什么、聊了什么、最后一起做了什么。',
      characters: [
        {
          id: 'c1', name: 'Lily', role: '讲故事的人', personality: '叙述清楚，喜欢补充细节',
          goal: '按时间顺序复述整段经历',
          sampleLines: ['Last weekend we visited a farmers\' market.', 'We agreed to make a salad together.'],
        },
        {
          id: 'c2', name: 'Kai', role: '好奇的倾听者', personality: '爱追问细节，语气轻快',
          goal: '提出 2-3 个问题，帮对方把故事讲完整',
          sampleLines: ['Oh, tell me more about that!', 'What happened next?'],
        },
      ],
      targetWords: ['weekend', 'visited', 'bought', 'agreed', 'together'],
      targetPhrases: ['last weekend', 'talk about', 'agree to do'],
      sentenceFrames: ['Last weekend, we ...', 'After that, we ...', 'In the end, we agreed to ...'],
      openingLine: 'I heard you had a lovely weekend! Where did you and Tom go?',
      suggestedReplies: [
        'Last weekend, we visited a farmers\' market with my friend Tom.',
        'We bought fresh apples and talked about healthy eating.',
        'In the end, we agreed to make a salad together.',
      ],
      rounds: 6,
    },
  ]
}

/** 任意文本都能生成的通用场景：不虚构原文事实，只围绕文本主题展开讨论 */
export function buildGenericScenarios(topic: string, words: string[], names: string[]): Scenario[] {
  const w1 = words[0] || 'the text'
  const w2 = words[1] || 'this idea'
  const w3 = words[2] || 'the story'
  const first = names[0] || 'Ava'
  const second = names[1] || 'Leo'
  const character = (id: string, name: string, role: string, personality: string, goal: string, lines: string[]): Character => ({
    id, name, role, personality, goal, sampleLines: lines,
  })
  const reader = (id: string): Character => character(
    id, first, '阅读者 / Reader', '认真、乐于分享自己的理解',
    '用自己的话说出文本内容并回应提问',
    ['I think the main idea is ...', 'Could you tell me more about that?'],
  )
  const partner = (id: string): Character => character(
    id, second, '学习伙伴 / Conversation Partner', '友善、会放慢节奏配合对方',
    '提问、追问并给出温和反馈',
    ['What do you think about it?', 'That\'s a nice way to put it.'],
  )
  const ava = (id: string): Character => character(
    id, 'Ava', '讨论主持人 / Discussion Host', '鼓励式语气，善于总结',
    '引导双方交换看法并收束话题',
    ['Let\'s hear your opinion.', 'So, what shall we take away from this?'],
  )
  const kai = (id: string): Character => character(
    id, 'Kai', '好奇提问者 / Curious Listener', '轻松、爱问细节',
    '围绕文本细节提问，帮对方展开表达',
    ['Oh, tell me more!', 'What happened next?'],
  )
  const target = words.slice(0, 5).length >= 3 ? words.slice(0, 5) : [w1, w2, w3, 'idea', 'plan']
  const phrases = ['talk about', 'I think ... because ...', 'Could you tell me more about ...?']

  return [
    {
      id: 'g1', title: '聊聊这段文本', emblem: '💬', tint: 'from-brand-100 to-brand-50',
      goal: `用 2-3 句话概括「${topic}」这段文本，并说出你印象最深的一点。`,
      characters: [reader('c1'), partner('c2'), ava('c3')],
      targetWords: target, targetPhrases: phrases,
      sentenceFrames: ['The text is mainly about ...', 'I think ... because ...', 'What impressed me most was ...'],
      openingLine: `I just read a short text about ${w1}. What do you think the main idea is?`,
      suggestedReplies: [
        `The text is mainly about ${w1} and ${w2}.`,
        `I think it talks about ${topic}, and I found that interesting.`,
        `Could you tell me what you understood from it first?`,
      ],
      rounds: 6,
    },
    {
      id: 'g2', title: '一问一答小采访', emblem: '🔎', tint: 'from-mint-100 to-brand-50',
      goal: `围绕 ${w1}、${w2} 等关键词互相提问，练习完整回答问题。`,
      characters: [kai('c1'), reader('c2'), partner('c3')],
      targetWords: target, targetPhrases: ['Could you tell me more about ...?', 'In my opinion, ...', 'How about ...?'],
      sentenceFrames: ['Could you tell me more about ...?', 'In my opinion, ...', 'One reason is that ...'],
      openingLine: `The word "${w1}" caught my eye. Could you tell me more about how it appears in the text?`,
      suggestedReplies: [
        `Sure. In the text, ${w1} is connected with ${w2}.`,
        `In my opinion, ${w1} is the key idea here.`,
        `How about we look at ${w3} as well?`,
      ],
      rounds: 6,
    },
    {
      id: 'g3', title: '定一个小计划', emblem: '🧭', tint: 'from-sun-100 to-coral-100',
      goal: `围绕「${topic}」提出一个可执行的小计划，并用到至少 2 个目标词。`,
      characters: [reader('c1'), partner('c2'), ava('c3')],
      targetWords: target, targetPhrases: ['How about ...?', 'Let\'s ... together.', 'Would you like to ...?'],
      sentenceFrames: ['How about ...?', 'We could start by ...', 'Let\'s ... together.'],
      openingLine: `This text gives me an idea. How about we make a small plan related to ${w1}?`,
      suggestedReplies: [
        `Good idea. We could start by learning more about ${w1}.`,
        `How about writing down three words, including ${w2}?`,
        `Let\'s talk about it together and decide the first step.`,
      ],
      rounds: 6,
    },
    {
      id: 'g4', title: '交换观点', emblem: '🌱', tint: 'from-coral-100 to-mint-100',
      goal: `表达对「${topic}」的看法，练习同意、补充与委婉不同意。`,
      characters: [ava('c1'), reader('c2'), kai('c3')],
      targetWords: target, targetPhrases: ['In my opinion, ...', 'That sounds great, but ...', 'I\'m not sure about ...'],
      sentenceFrames: ['In my opinion, ...', 'I agree, and ...', 'That sounds great, but ...'],
      openingLine: `Here's a question for you: is ${w1} important in everyday life? What's your opinion?`,
      suggestedReplies: [
        `In my opinion, ${w1} matters because it connects to ${w2}.`,
        `I agree, and I'd add that ${w3} plays a part too.`,
        `That sounds great, but I'm not sure about one detail.`,
      ],
      rounds: 6,
    },
  ]
}

export function lookupWord(word: string): Keyword {
  const base = word.toLowerCase().replace(/[^a-z'-]/g, '')
  const hit = WORD_BANK[base] || WORD_BANK[base.replace(/s$/, '')] || WORD_BANK[base.replace(/ed$/, '')]
  if (hit) return { word: base, meaning: hit.meaning, example: hit.example }
  return {
    word: base,
    meaning: '文本中的重点词（可在场景中编辑释义）',
    example: `I'd like to use "${base}" in my own sentence.`,
  }
}
