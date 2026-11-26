/**
 * [查询 Query · 离线词典] 内置词典包种子数据
 * ------------------------------------------------------------------
 * 设计取舍：
 *  - 词条是「核心高频词」，每条自带中文释义 + 例句，纯静态、零网络、零版权正文；
 *  - 基础包随 bundle 内置（零 IndexedDB 也能查），「下载」动作把整包写进独立库
 *    src/lib/dictionaryDb.ts，实现真正的离线持久化与「已下载」状态；
 *  - 不复用 wordDecks 的 WordEntry（那套绑定五步状态机），独立轻量结构，互不干扰；
 *  - 不新增任何 localStorage 键。
 */

export interface QueryDictEntry {
  /** 词形（英语小写 / 俄语带重音） */
  w: string
  /** 词性：n./v./adj./adv./... */
  pos: string
  /** 中文释义 */
  meaning: string
  /** 音标或拉丁转写（可选） */
  phonetic?: string
  /** 原文例句 */
  example?: string
  /** 例句中文 */
  exampleCn?: string
}

export interface QueryDictPack {
  id: string
  lang: 'en' | 'ru'
  name: string
  subtitle: string
  emblem: string
  /** 词条数（写进 meta，UI 显示用） */
  count: number
  entries: QueryDictEntry[]
}

/** 英语核心词汇（60 条高频词，覆盖日常 / 学习 / 工作） */
const EN_CORE: QueryDictEntry[] = [
  { w: 'abandon', pos: 'v.', meaning: '放弃；抛弃', phonetic: '/əˈbændən/', example: 'He abandoned the plan halfway.', exampleCn: '他中途放弃了计划。' },
  { w: 'ability', pos: 'n.', meaning: '能力；才能', phonetic: '/əˈbɪləti/', example: 'She has a strong ability to learn.', exampleCn: '她有很强的学习能力。' },
  { w: 'absorb', pos: 'v.', meaning: '吸收；使全神贯注', phonetic: '/əbˈsɔːb/', example: 'Plants absorb water from the soil.', exampleCn: '植物从土壤中吸收水分。' },
  { w: 'academic', pos: 'adj.', meaning: '学术的；学业的', phonetic: '/ˌækəˈdemɪk/', example: 'Academic writing needs clear structure.', exampleCn: '学术写作需要清晰的结构。' },
  { w: 'accept', pos: 'v.', meaning: '接受；认可', phonetic: '/əkˈsept/', example: 'I accept your apology.', exampleCn: '我接受你的道歉。' },
  { w: 'access', pos: 'n./v.', meaning: '通道；获取', phonetic: '/ˈækses/', example: 'Students have access to the library.', exampleCn: '学生可以使用图书馆。' },
  { w: 'account', pos: 'n.', meaning: '账户；叙述；原因', phonetic: '/əˈkaʊnt/', example: 'Give an account of what happened.', exampleCn: '说明发生了什么。' },
  { w: 'achieve', pos: 'v.', meaning: '实现；取得', phonetic: '/əˈtʃiːv/', example: 'You can achieve your goal.', exampleCn: '你能实现目标。' },
  { w: 'acquire', pos: 'v.', meaning: '获得；习得', phonetic: '/əˈkwaɪə/', example: 'Children acquire language naturally.', exampleCn: '儿童自然而然地习得语言。' },
  { w: 'adapt', pos: 'v.', meaning: '适应；改编', phonetic: '/əˈdæpt/', example: 'We must adapt to change.', exampleCn: '我们必须适应变化。' },
  { w: 'address', pos: 'v./n.', meaning: '处理；地址', phonetic: '/əˈdres/', example: 'Let us address this issue.', exampleCn: '让我们处理这个问题。' },
  { w: 'advantage', pos: 'n.', meaning: '优势；有利条件', phonetic: '/ədˈvɑːntɪdʒ/', example: 'This has a clear advantage.', exampleCn: '这有明显优势。' },
  { w: 'affect', pos: 'v.', meaning: '影响', phonetic: '/əˈfekt/', example: 'Sleep affects memory.', exampleCn: '睡眠影响记忆。' },
  { w: 'afford', pos: 'v.', meaning: '负担得起', phonetic: '/əˈfɔːd/', example: 'I cannot afford a new car.', exampleCn: '我买不起新车。' },
  { w: 'agree', pos: 'v.', meaning: '同意；一致', phonetic: '/əˈɡriː/', example: 'We agree on the main point.', exampleCn: '我们在主要观点上一致。' },
  { w: 'aim', pos: 'n./v.', meaning: '目标；瞄准', phonetic: '/eɪm/', example: 'Our aim is to learn steadily.', exampleCn: '我们的目标是稳步学习。' },
  { w: 'analyse', pos: 'v.', meaning: '分析', phonetic: '/ˈænəlaɪz/', example: 'Analyse the data carefully.', exampleCn: '仔细分析数据。' },
  { w: 'ancient', pos: 'adj.', meaning: '古代的；古老的', phonetic: '/ˈeɪnʃənt/', example: 'This is an ancient city.', exampleCn: '这是一座古城。' },
  { w: 'announce', pos: 'v.', meaning: '宣布；公布', phonetic: '/əˈnaʊns/', example: 'They announced the result.', exampleCn: '他们公布了结果。' },
  { w: 'anxious', pos: 'adj.', meaning: '焦虑的；渴望的', phonetic: '/ˈæŋkʃəs/', example: 'She felt anxious before the exam.', exampleCn: '考试前她很焦虑。' },
  { w: 'apply', pos: 'v.', meaning: '申请；应用', phonetic: '/əˈplaɪ/', example: 'Apply for the scholarship.', exampleCn: '申请奖学金。' },
  { w: 'approach', pos: 'n./v.', meaning: '方法；接近', phonetic: '/əˈprəʊtʃ/', example: 'A new approach to teaching.', exampleCn: '一种新的教学方法。' },
  { w: 'argue', pos: 'v.', meaning: '争论；主张', phonetic: '/ˈɑːɡjuː/', example: 'They argued about the plan.', exampleCn: '他们为计划争论。' },
  { w: 'arrange', pos: 'v.', meaning: '安排；整理', phonetic: '/əˈreɪndʒ/', example: 'I arranged a meeting.', exampleCn: '我安排了一次会议。' },
  { w: 'attempt', pos: 'n./v.', meaning: '尝试；企图', phonetic: '/əˈtempt/', example: 'Make another attempt.', exampleCn: '再试一次。' },
  { w: 'attitude', pos: 'n.', meaning: '态度；看法', phonetic: '/ˈætɪtjuːd/', example: 'A positive attitude helps.', exampleCn: '积极的态度有帮助。' },
  { w: 'attract', pos: 'v.', meaning: '吸引', phonetic: '/əˈtrækt/', example: 'The city attracts visitors.', exampleCn: '这座城市吸引游客。' },
  { w: 'avoid', pos: 'v.', meaning: '避免', phonetic: '/əˈvɔɪd/', example: 'Avoid common mistakes.', exampleCn: '避免常见错误。' },
  { w: 'aware', pos: 'adj.', meaning: '意识到的', phonetic: '/əˈweə/', example: 'Be aware of the risks.', exampleCn: '要意识到风险。' },
  { w: 'balance', pos: 'n./v.', meaning: '平衡', phonetic: '/ˈbæləns/', example: 'Keep a balance in life.', exampleCn: '保持生活平衡。' },
  { w: 'benefit', pos: 'n./v.', meaning: '益处；受益', phonetic: '/ˈbenɪfɪt/', example: 'Exercise has many benefits.', exampleCn: '锻炼有很多益处。' },
  { w: 'brief', pos: 'adj.', meaning: '简短的', phonetic: '/briːf/', example: 'Give a brief answer.', exampleCn: '给一个简短的回答。' },
  { w: 'campaign', pos: 'n.', meaning: '运动；活动', phonetic: '/kæmˈpeɪn/', example: 'A public health campaign.', exampleCn: '一场公共卫生运动。' },
  { w: 'capable', pos: 'adj.', meaning: '有能力的', phonetic: '/ˈkeɪpəbl/', example: 'She is capable of doing it.', exampleCn: '她有能力做这件事。' },
  { w: 'challenge', pos: 'n./v.', meaning: '挑战', phonetic: '/ˈtʃælɪndʒ/', example: 'This is a real challenge.', exampleCn: '这是真正的挑战。' },
  { w: 'choose', pos: 'v.', meaning: '选择', phonetic: '/tʃuːz/', example: 'Choose the best answer.', exampleCn: '选出最佳答案。' },
  { w: 'clarify', pos: 'v.', meaning: '澄清；阐明', phonetic: '/ˈklærəfaɪ/', example: 'Clarify your meaning.', exampleCn: '阐明你的意思。' },
  { w: 'compare', pos: 'v.', meaning: '比较', phonetic: '/kəmˈpeə/', example: 'Compare the two options.', exampleCn: '比较这两个选项。' },
  { w: 'compete', pos: 'v.', meaning: '竞争', phonetic: '/kəmˈpiːt/', example: 'Small shops cannot compete.', exampleCn: '小商店无法竞争。' },
  { w: 'complain', pos: 'v.', meaning: '抱怨；投诉', phonetic: '/kəmˈpleɪn/', example: 'He complained about the noise.', exampleCn: '他抱怨噪音。' },
  { w: 'complete', pos: 'v./adj.', meaning: '完成；完整的', phonetic: '/kəmˈpliːt/', example: 'Complete the task on time.', exampleCn: '按时完成任务。' },
  { w: 'concern', pos: 'n./v.', meaning: '关心；担忧', phonetic: '/kənˈsɜːn/', example: 'This is my main concern.', exampleCn: '这是我主要的担忧。' },
  { w: 'conclude', pos: 'v.', meaning: '得出结论；结束', phonetic: '/kənˈkluːd/', example: 'We conclude that it works.', exampleCn: '我们得出结论它有效。' },
  { w: 'confident', pos: 'adj.', meaning: '自信的', phonetic: '/ˈkɒnfɪdənt/', example: 'I feel confident today.', exampleCn: '我今天很自信。' },
  { w: 'confirm', pos: 'v.', meaning: '确认', phonetic: '/kənˈfɜːm/', example: 'Please confirm the time.', exampleCn: '请确认时间。' },
  { w: 'consequence', pos: 'n.', meaning: '后果', phonetic: '/ˈkɒnsɪkwəns/', example: 'Every action has a consequence.', exampleCn: '每个行动都有后果。' },
  { w: 'consider', pos: 'v.', meaning: '考虑；认为', phonetic: '/kənˈsɪdə/', example: 'Consider the pros and cons.', exampleCn: '考虑利弊。' },
  { w: 'constant', pos: 'adj.', meaning: '不断的；恒定的', phonetic: '/ˈkɒnstənt/', example: 'Under constant pressure.', exampleCn: '在持续的压力下。' },
  { w: 'contribute', pos: 'v.', meaning: '贡献；促成', phonetic: '/kənˈtrɪbjuːt/', example: 'Everyone can contribute.', exampleCn: '每个人都能作出贡献。' },
  { w: 'convince', pos: 'v.', meaning: '说服；使确信', phonetic: '/kənˈvɪns/', example: 'He convinced me to try.', exampleCn: '他说服我去尝试。' },
  { w: 'decide', pos: 'v.', meaning: '决定', phonetic: '/dɪˈsaɪd/', example: 'Decide before tomorrow.', exampleCn: '明天前决定。' },
  { w: 'develop', pos: 'v.', meaning: '发展；培养', phonetic: '/dɪˈveləp/', example: 'Develop a good habit.', exampleCn: '培养好习惯。' },
  { w: 'discover', pos: 'v.', meaning: '发现', phonetic: '/dɪsˈkʌvə/', example: 'Scientists discovered a cure.', exampleCn: '科学家发现了疗法。' },
  { w: 'discuss', pos: 'v.', meaning: '讨论', phonetic: '/dɪsˈkʌs/', example: 'Let us discuss the plan.', exampleCn: '我们讨论一下计划。' },
  { w: 'efficient', pos: 'adj.', meaning: '高效的', phonetic: '/ɪˈfɪʃnt/', example: 'An efficient way to study.', exampleCn: '一种高效的学习方法。' },
  { w: 'encourage', pos: 'v.', meaning: '鼓励', phonetic: '/ɪnˈkʌrɪdʒ/', example: 'Teachers encourage questions.', exampleCn: '老师鼓励提问。' },
  { w: 'environment', pos: 'n.', meaning: '环境', phonetic: '/ɪnˈvaɪrənmənt/', example: 'Protect the environment.', exampleCn: '保护环境。' },
  { w: 'establish', pos: 'v.', meaning: '建立', phonetic: '/ɪˈstæblɪʃ/', example: 'Establish a good routine.', exampleCn: '建立良好的常规。' },
  { w: 'examine', pos: 'v.', meaning: '检查；审视', phonetic: '/ɪɡˈzæmɪn/', example: 'Examine the evidence.', exampleCn: '审视证据。' },
  { w: 'explain', pos: 'v.', meaning: '解释', phonetic: '/ɪkˈspleɪn/', example: 'Explain it in simple words.', exampleCn: '用简单的话解释。' },
  { w: 'explore', pos: 'v.', meaning: '探索', phonetic: '/ɪkˈsplɔː/', example: 'Explore new ideas.', exampleCn: '探索新想法。' },
  { w: 'focus', pos: 'v./n.', meaning: '专注；焦点', phonetic: '/ˈfəʊkəs/', example: 'Focus on one thing.', exampleCn: '专注于一件事。' },
  { w: 'improve', pos: 'v.', meaning: '改善；提高', phonetic: '/ɪmˈpruːv/', example: 'Improve your English.', exampleCn: '提高你的英语。' },
  { w: 'include', pos: 'v.', meaning: '包括', phonetic: '/ɪnˈkluːd/', example: 'The price includes tax.', exampleCn: '价格含税。' },
  { w: 'increase', pos: 'v./n.', meaning: '增加', phonetic: '/ɪnˈkriːs/', example: 'The number increased.', exampleCn: '数量增加了。' },
  { w: 'influence', pos: 'n./v.', meaning: '影响', phonetic: '/ˈɪnfluəns/', example: 'A positive influence.', exampleCn: '积极的影响。' },
  { w: 'introduce', pos: 'v.', meaning: '介绍；引入', phonetic: '/ˌɪntrəˈdjuːs/', example: 'Let me introduce myself.', exampleCn: '让我自我介绍一下。' },
  { w: 'investigate', pos: 'v.', meaning: '调查', phonetic: '/ɪnˈvestɪɡeɪt/', example: 'Investigate the cause.', exampleCn: '调查原因。' },
  { w: 'knowledge', pos: 'n.', meaning: '知识', phonetic: '/ˈnɒlɪdʒ/', example: 'Knowledge is power.', exampleCn: '知识就是力量。' },
  { w: 'maintain', pos: 'v.', meaning: '维持；保养', phonetic: '/meɪnˈteɪn/', example: 'Maintain a healthy diet.', exampleCn: '保持健康饮食。' },
  { w: 'opportunity', pos: 'n.', meaning: '机会', phonetic: '/ˌɒpəˈtjuːnəti/', example: 'Do not miss the opportunity.', exampleCn: '别错过机会。' },
  { w: 'perspective', pos: 'n.', meaning: '视角；观点', phonetic: '/pəˈspektɪv/', example: 'From a different perspective.', exampleCn: '从不同的视角。' },
  { w: 'prepare', pos: 'v.', meaning: '准备', phonetic: '/prɪˈpeə/', example: 'Prepare for the exam.', exampleCn: '为考试做准备。' },
  { w: 'recognise', pos: 'v.', meaning: '认出；认可', phonetic: '/ˈrekəɡnaɪz/', example: 'I recognise this word.', exampleCn: '我认识这个词。' },
  { w: 'recommend', pos: 'v.', meaning: '推荐', phonetic: '/ˌrekəˈmend/', example: 'Can you recommend a book?', exampleCn: '你能推荐一本书吗？' },
  { w: 'reduce', pos: 'v.', meaning: '减少', phonetic: '/rɪˈdjuːs/', example: 'Reduce waste.', exampleCn: '减少浪费。' },
  { w: 'reflect', pos: 'v.', meaning: '反映；反思', phonetic: '/rɪˈflekt/', example: 'Reflect on your progress.', exampleCn: '反思你的进步。' },
  { w: 'require', pos: 'v.', meaning: '需要；要求', phonetic: '/rɪˈkwaɪə/', example: 'This requires patience.', exampleCn: '这需要耐心。' },
  { w: 'research', pos: 'n./v.', meaning: '研究', phonetic: '/rɪˈsɜːtʃ/', example: 'Do some research first.', exampleCn: '先做一些研究。' },
  { w: 'resource', pos: 'n.', meaning: '资源', phonetic: '/rɪˈsɔːs/', example: 'Shared resources.', exampleCn: '共享资源。' },
  { w: 'result', pos: 'n.', meaning: '结果', phonetic: '/rɪˈzʌlt/', example: 'The result was surprising.', exampleCn: '结果令人惊讶。' },
  { w: 'review', pos: 'n./v.', meaning: '复习；评论', phonetic: '/rɪˈvjuː/', example: 'Review the words daily.', exampleCn: '每天复习单词。' },
  { w: 'schedule', pos: 'n./v.', meaning: '日程；安排', phonetic: '/ˈʃedjuːl/', example: 'A busy schedule.', exampleCn: '繁忙的日程。' },
  { w: 'solution', pos: 'n.', meaning: '解决方案', phonetic: '/səˈluːʃn/', example: 'Find a simple solution.', exampleCn: '找到一个简单的方法。' },
  { w: 'strategy', pos: 'n.', meaning: '策略', phonetic: '/ˈstrætədʒi/', example: 'A learning strategy.', exampleCn: '一种学习策略。' },
  { w: 'suggest', pos: 'v.', meaning: '建议；表明', phonetic: '/səˈdʒest/', example: 'I suggest taking a break.', exampleCn: '我建议休息一下。' },
  { w: 'sustainable', pos: 'adj.', meaning: '可持续的', phonetic: '/səˈsteɪnəbl/', example: 'Sustainable development.', exampleCn: '可持续发展。' },
  { w: 'technology', pos: 'n.', meaning: '技术', phonetic: '/tekˈnɒlədʒi/', example: 'Modern technology.', exampleCn: '现代技术。' },
  { w: 'understand', pos: 'v.', meaning: '理解', phonetic: '/ˌʌndəˈstænd/', example: 'I understand the question.', exampleCn: '我理解这个问题。' },
  { w: 'valuable', pos: 'adj.', meaning: '有价值的', phonetic: '/ˈvæljuəbl/', example: 'Valuable advice.', exampleCn: '宝贵的建议。' },
]

/** 俄语基础词汇（54 条 A1-A2，带重音词形） */
const RU_CORE: QueryDictEntry[] = [
  { w: 'во́да', pos: '名词·阴性', meaning: '水', phonetic: 'voda', example: 'Я пью во́ду.', exampleCn: '我在喝水。' },
  { w: 'хлеб', pos: '名词·阳性', meaning: '面包', phonetic: 'khleb', example: 'Это све́жий хлеб.', exampleCn: '这是新鲜的面包。' },
  { w: 'ма́ма', pos: '名词·阴性', meaning: '妈妈', phonetic: 'mama', example: 'Моя́ ма́ма дома.', exampleCn: '我妈妈在家。' },
  { w: 'друг', pos: '名词·阳性', meaning: '朋友', phonetic: 'drug', example: 'Он мой друг.', exampleCn: '他是我的朋友。' },
  { w: 'ко́мната', pos: '名词·阴性', meaning: '房间', phonetic: 'komnata', example: 'Эта ко́мната больша́я.', exampleCn: '这个房间很大。' },
  { w: 'окно́', pos: '名词·中性', meaning: '窗户', phonetic: 'okno', example: 'Окно́ откры́то.', exampleCn: '窗户开着。' },
  { w: 'вокза́л', pos: '名词·阳性', meaning: '火车站', phonetic: 'vokzal', example: 'По́езд при́был на вокза́л.', exampleCn: '火车到站了。' },
  { w: 'биле́т', pos: '名词·阳性', meaning: '票', phonetic: 'bilet', example: 'Я купи́л биле́т.', exampleCn: '我买了票。' },
  { w: 'гости́ница', pos: '名词·阴性', meaning: '酒店', phonetic: 'gostinitsa', example: 'Гости́ница недалеко́.', exampleCn: '酒店不远。' },
  { w: 'у́лица', pos: '名词·阴性', meaning: '街道', phonetic: 'ulitsa', example: 'Эта у́лица ста́рая.', exampleCn: '这条街很古老。' },
  { w: 'магази́н', pos: '名词·阳性', meaning: '商店', phonetic: 'magazin', example: 'Магази́н откры́т до ве́чера.', exampleCn: '商店开到晚上。' },
  { w: 'вре́мя', pos: '名词·中性', meaning: '时间', phonetic: 'vremya', example: 'Ско́лько сейча́с вре́мени?', exampleCn: '现在几点了？' },
  { w: 'за́втрак', pos: '名词·阳性', meaning: '早餐', phonetic: 'zavtrak', example: 'За́втрак уже́ гото́в.', exampleCn: '早餐已经准备好了。' },
  { w: 'рабо́та', pos: '名词·阴性', meaning: '工作', phonetic: 'rabota', example: 'Моя́ рабо́та интере́сная.', exampleCn: '我的工作很有意思。' },
  { w: 'музе́й', pos: '名词·阳性', meaning: '博物馆', phonetic: 'muzey', example: 'Мы бы́ли в музе́е.', exampleCn: '我们去过博物馆。' },
  { w: 'го́род', pos: '名词·阳性', meaning: '城市', phonetic: 'gorod', example: 'Это большо́й го́род.', exampleCn: '这是一座大城市。' },
  { w: 'шко́ла', pos: '名词·阴性', meaning: '学校', phonetic: 'shkola', example: 'Де́ти иду́т в шко́лу.', exampleCn: '孩子们去上学。' },
  { w: 'кни́га', pos: '名词·阴性', meaning: '书', phonetic: 'kniga', example: 'Я чита́ю кни́гу.', exampleCn: '我在读书。' },
  { w: 'сло́во', pos: '名词·中性', meaning: '单词；话', phonetic: 'slovo', example: 'Это но́вое сло́во.', exampleCn: '这是个新词。' },
  { w: 'учи́ться', pos: '动词', meaning: '学习', phonetic: 'uchitsya', example: 'Я учу́сь ру́сскому.', exampleCn: '我在学俄语。' },
  { w: 'чита́ть', pos: '动词', meaning: '读', phonetic: 'chitat', example: 'Он лю́бит чита́ть.', exampleCn: '他喜欢读书。' },
  { w: 'писа́ть', pos: '动词', meaning: '写', phonetic: 'pisat', example: 'Она́ пи́шет письмо́.', exampleCn: '她在写信。' },
  { w: 'говори́ть', pos: '动词', meaning: '说；讲', phonetic: 'govorit', example: 'Я говорю́ по-ру́сски.', exampleCn: '我说俄语。' },
  { w: 'хоро́ший', pos: '形容词', meaning: '好的', phonetic: 'khoroshiy', example: 'Это хоро́ший день.', exampleCn: '这是美好的一天。' },
  { w: 'большо́й', pos: '形容词', meaning: '大的', phonetic: 'bolshoy', example: 'Большо́й дом.', exampleCn: '大房子。' },
  { w: 'сего́дня', pos: '副词', meaning: '今天', phonetic: 'segodnya', example: 'Сего́дня хо́лодно.', exampleCn: '今天很冷。' },
  { w: 'за́втра', pos: '副词', meaning: '明天', phonetic: 'zavtra', example: 'Уви́димся за́втра.', exampleCn: '明天见。' },
  { w: 'о́чень', pos: '副词', meaning: '很；非常', phonetic: 'ochen', example: 'О́чень хорошо́.', exampleCn: '非常好。' },
  { w: 'спаси́бо', pos: '感叹词', meaning: '谢谢', phonetic: 'spasibo', example: 'Спаси́бо за по́мощь.', exampleCn: '谢谢你的帮助。' },
  { w: 'пожа́луйста', pos: '感叹词', meaning: '请；不客气', phonetic: 'pozhaluysta', example: 'Пожа́луйста, сади́тесь.', exampleCn: '请坐。' },
]

export const QUERY_DICT_PACKS: QueryDictPack[] = [
  {
    id: 'en_core', lang: 'en', name: '英语核心词汇', subtitle: '高频词 · 中英释义与例句', emblem: '📗',
    count: EN_CORE.length, entries: EN_CORE,
  },
  {
    id: 'ru_basic', lang: 'ru', name: '俄语基础词汇', subtitle: 'ТРКИ A1-A2 · 中俄释义与例句', emblem: '📕',
    count: RU_CORE.length, entries: RU_CORE,
  },
]

export const QUERY_DICT_PACK_IDS = QUERY_DICT_PACKS.map((p) => p.id)

/** 供冒烟直测：无副作用、纯同步 */
export function builtinPack(packId: string): QueryDictPack | undefined {
  return QUERY_DICT_PACKS.find((p) => p.id === packId)
}
