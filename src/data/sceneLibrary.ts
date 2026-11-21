/* ================================================================
 * 预设场景库：40 个原创场景，覆盖生活 / 职场 / 学术 / 旅行四大类。
 *
 * 设计铁律：
 *  - 纯静态数据 + 纯函数，不读写任何 localStorage 键（不碰 31 键契约）；
 *  - level 标签只用于【分类展示】与「挑战模式」小字提示，绝不作为进入对话的门槛；
 *    任何等级的用户点任何场景都直接进对话，零弹窗、零拦截；
 *  - 场景条目是原创教学脚本，不含第三方语料字节。
 * ================================================================ */

import { levelRank } from '../levelTypes'
import type { LevelCefr } from '../levelTypes'

export type SceneCategory = 'life' | 'work' | 'academic' | 'travel'
export type SceneLevel = 'A2' | 'B1' | 'B2' | 'C1'
export type SceneBand = 'all' | 'beginner' | 'intermediate' | 'advanced'

export interface ScenePreset {
  id: string
  /** 中文场景名 */
  title: string
  /** 英文场景名 */
  titleEn: string
  category: SceneCategory
  level: SceneLevel
  /** 简短中文描述，展示在紧凑列表项里 */
  desc: string
  emblem: string
  /** 本场景重点词（3-4 个） */
  targetWords: string[]
  /** AI 伙伴的英文开场白 */
  openingLine: string
}

export const SCENE_CATEGORIES: Array<{ id: SceneCategory; label: string; emblem: string }> = [
  { id: 'life', label: '生活', emblem: '🏠' },
  { id: 'work', label: '职场', emblem: '💼' },
  { id: 'academic', label: '学术', emblem: '🎓' },
  { id: 'travel', label: '旅行', emblem: '✈️' },
]

/** 四个等级 Tab：初级 A2-B1 / 中级 B2 / 高级 C1+ */
export const SCENE_BANDS: Array<{ id: SceneBand; label: string }> = [
  { id: 'all', label: '全部' },
  { id: 'beginner', label: '初级 (A2-B1)' },
  { id: 'intermediate', label: '中级 (B2)' },
  { id: 'advanced', label: '高级 (C1+)' },
]

export const SCENE_LIBRARY: ScenePreset[] = [
  /* ---------- 生活 life（10） ---------- */
  { id: 'life-01', title: '咖啡店点单', titleEn: 'Ordering coffee', category: 'life', level: 'A2',
    desc: '用简单句点一杯咖啡，说清杯型与冷热。', emblem: '☕',
    targetWords: ['coffee', 'medium', 'iced', 'please'],
    openingLine: 'Hi! Welcome. What can I get for you today?' },
  { id: 'life-02', title: '问路去地铁站', titleEn: 'Asking for directions', category: 'life', level: 'A2',
    desc: '问一句路，听懂左转右转，再道谢。', emblem: '🚇',
    targetWords: ['left', 'right', 'station', 'straight'],
    openingLine: 'Excuse me, could you tell me the way to the subway station?' },
  { id: 'life-03', title: '预约看牙', titleEn: 'Booking a dentist', category: 'life', level: 'B1',
    desc: '说症状、约时间、确认地址。', emblem: '🦷',
    targetWords: ['appointment', 'available', 'pain', 'confirm'],
    openingLine: 'Hello, I would like to make an appointment. Do you have anything available this week?' },
  { id: 'life-04', title: '和邻居闲聊', titleEn: 'Chatting with a neighbor', category: 'life', level: 'B1',
    desc: '从天气聊到周末计划，自然接话。', emblem: '🌤️',
    targetWords: ['weekend', 'weather', 'plan', 'neighbor'],
    openingLine: 'Morning! Lovely weather we are having. Any plans for the weekend?' },
  { id: 'life-05', title: '退换货', titleEn: 'Returning an item', category: 'life', level: 'B1',
    desc: '说明问题，提出换货或退款。', emblem: '📦',
    targetWords: ['receipt', 'refund', 'exchange', 'defective'],
    openingLine: 'I bought this last week, but it does not work. Can I return it?' },
  { id: 'life-06', title: '投诉噪音', titleEn: 'Complaining about noise', category: 'life', level: 'B2',
    desc: '礼貌但坚定地反映问题并要求解决。', emblem: '📢',
    targetWords: ['disturb', 'unfortunately', 'resolve', 'considerate'],
    openingLine: 'I hate to complain, but the noise from upstairs has been disturbing us for several nights.' },
  { id: 'life-07', title: '和房东谈房租', titleEn: 'Talking rent with a landlord', category: 'life', level: 'B2',
    desc: '讨论租金、维修责任与续租。', emblem: '🔑',
    targetWords: ['rent', 'maintenance', 'renew', 'deposit'],
    openingLine: 'Thanks for meeting me. I would like to talk about the rent and a few repairs.' },
  { id: 'life-08', title: '家庭聚会', titleEn: 'A family gathering', category: 'life', level: 'B2',
    desc: '聊近况，得体回应敏感问题。', emblem: '🍲',
    targetWords: ['catch up', 'actually', 'sensitive', 'grand'],
    openingLine: 'It is so good to see everyone. So, what have you been up to lately?' },
  { id: 'life-09', title: '婚礼致辞', titleEn: 'A wedding toast', category: 'life', level: 'C1',
    desc: '讲一段得体又有温度的祝酒词。', emblem: '🥂',
    targetWords: ['heartfelt', 'blessing', 'journey', 'cherish'],
    openingLine: 'If I may, I would like to say a few words about the two people sitting in front of us.' },
  { id: 'life-10', title: '向医生描述症状', titleEn: 'Describing symptoms', category: 'life', level: 'C1',
    desc: '精确描述疼痛与病史，理解医嘱。', emblem: '🩺',
    targetWords: ['symptom', 'persistent', 'history', 'prescribe'],
    openingLine: 'Please tell me exactly where it hurts and how long this has been going on.' },

  /* ---------- 职场 work（10） ---------- */
  { id: 'work-01', title: '新同事自我介绍', titleEn: 'Introducing yourself at work', category: 'work', level: 'A2',
    desc: '说名字、职位，打招呼。', emblem: '🤝',
    targetWords: ['name', 'role', 'team', 'nice'],
    openingLine: 'Hi, I am new here. I am on the marketing team.' },
  { id: 'work-02', title: '请示休假', titleEn: 'Requesting leave', category: 'work', level: 'B1',
    desc: '说明原因、确认天数与交接。', emblem: '📅',
    targetWords: ['leave', 'cover', 'approve', 'schedule'],
    openingLine: 'Could I take two days off next week? I will make sure someone covers my work.' },
  { id: 'work-03', title: '站会汇报', titleEn: 'A stand-up update', category: 'work', level: 'B1',
    desc: '用三句话汇报进展与阻碍。', emblem: '🧍',
    targetWords: ['yesterday', 'today', 'blocker', 'done'],
    openingLine: 'Quick update: what did you finish yesterday, and what are you working on today?' },
  { id: 'work-04', title: '把邮件写礼貌', titleEn: 'Polishing an email', category: 'work', level: 'B1',
    desc: '把生硬的要求改得得体。', emblem: '✉️',
    targetWords: ['could', 'would', 'appreciate', 'regarding'],
    openingLine: 'This email sounds a bit direct. How could we soften the tone?' },
  { id: 'work-05', title: '绩效面谈', titleEn: 'A performance review', category: 'work', level: 'B2',
    desc: '陈述成果，回应反馈。', emblem: '📊',
    targetWords: ['achievement', 'feedback', 'improve', 'goal'],
    openingLine: 'Let us go through what you achieved this quarter and where you would like to grow.' },
  { id: 'work-06', title: '跨部门协作', titleEn: 'A cross-team sync', category: 'work', level: 'B2',
    desc: '对齐需求、时限与责任人。', emblem: '🔗',
    targetWords: ['align', 'deadline', 'owner', 'dependency'],
    openingLine: 'We need to align on the scope before the deadline. What is blocking your team?' },
  { id: 'work-07', title: '谈薪酬', titleEn: 'Negotiating salary', category: 'work', level: 'B2',
    desc: '陈述价值，提出合理期望。', emblem: '💰',
    targetWords: ['compensation', 'market rate', 'contribution', 'expectation'],
    openingLine: 'I appreciate the offer. May I share why I believe a higher figure is justified?' },
  { id: 'work-08', title: '危机沟通', titleEn: 'Crisis communication', category: 'work', level: 'C1',
    desc: '在压力下安抚客户并给出方案。', emblem: '🚨',
    targetWords: ['transparent', 'contain', 'reassure', 'remedy'],
    openingLine: 'We are aware of the issue and are taking steps to contain it. Here is what we can confirm.' },
  { id: 'work-09', title: '董事会汇报', titleEn: 'A board presentation', category: 'work', level: 'C1',
    desc: '用数据讲清战略取舍。', emblem: '📈',
    targetWords: ['trade-off', 'metric', 'strategic', 'projection'],
    openingLine: 'The key decision today is where to allocate next quarter’s budget, and the data points to three options.' },
  { id: 'work-10', title: '合同条款谈判', titleEn: 'Negotiating a contract', category: 'work', level: 'C1',
    desc: '就条款据理力争，守住底线。', emblem: '📝',
    targetWords: ['clause', 'liable', 'concession', 'binding'],
    openingLine: 'Before we sign, I would like to revisit the liability clause and propose an amendment.' },

  /* ---------- 学术 academic（10） ---------- */
  { id: 'acad-01', title: '课堂提问', titleEn: 'Asking in class', category: 'academic', level: 'A2',
    desc: '用简单句请求重复或解释。', emblem: '🙋',
    targetWords: ['repeat', 'explain', 'again', 'understand'],
    openingLine: 'Sorry, could you explain that again, please?' },
  { id: 'acad-02', title: '图书馆借书', titleEn: 'Getting help at the library', category: 'academic', level: 'B1',
    desc: '找书、问借期与续借。', emblem: '📚',
    targetWords: ['shelf', 'due', 'renew', 'reserve'],
    openingLine: 'I am looking for this book. Do you know where I can find it?' },
  { id: 'acad-03', title: '课堂小组讨论', titleEn: 'A small-group discussion', category: 'academic', level: 'B1',
    desc: '表达观点，回应同学。', emblem: '🗣️',
    targetWords: ['opinion', 'agree', 'example', 'because'],
    openingLine: 'What do you think about this reading? I would like to hear your take first.' },
  { id: 'acad-04', title: '选课咨询', titleEn: 'Asking about a course', category: 'academic', level: 'B1',
    desc: '问先修要求与课程难度。', emblem: '🗂️',
    targetWords: ['prerequisite', 'workload', 'requirement', 'recommend'],
    openingLine: 'I am considering this course. Are there any prerequisites I should know about?' },
  { id: 'acad-05', title: '论文答辩', titleEn: 'Defending a thesis', category: 'academic', level: 'B2',
    desc: '捍卫研究选择，回应质疑。', emblem: '🎓',
    targetWords: ['methodology', 'justify', 'limitation', 'evidence'],
    openingLine: 'Why did you choose this methodology over the alternatives? Please be specific.' },
  { id: 'acad-06', title: '文献综述', titleEn: 'A literature review', category: 'academic', level: 'B2',
    desc: '说清研究空白与自己的位置。', emblem: '🔍',
    targetWords: ['gap', 'prior', 'framework', 'contribute'],
    openingLine: 'Where does your research fit in relation to the existing literature?' },
  { id: 'acad-07', title: '实验汇报', titleEn: 'Reporting a lab result', category: 'academic', level: 'B2',
    desc: '描述方法、结果与意外。', emblem: '🧪',
    targetWords: ['procedure', 'result', 'anomaly', 'conclusion'],
    openingLine: 'Walk us through your procedure and tell us whether the results matched your hypothesis.' },
  { id: 'acad-08', title: '学术辩论', titleEn: 'An academic debate', category: 'academic', level: 'C1',
    desc: '用证据反驳对立观点。', emblem: '⚖️',
    targetWords: ['counterargument', 'refute', 'undermine', 'grounds'],
    openingLine: 'The opposing view rests on an assumption that recent findings have called into question.' },
  { id: 'acad-09', title: '会议问答', titleEn: 'Q&A at a conference', category: 'academic', level: 'C1',
    desc: '从容应对尖锐提问。', emblem: '🎤',
    targetWords: ['address', 'clarify', 'concede', 'elaborate'],
    openingLine: 'Your sample size seems small. How confident are you in generalising these findings?' },
  { id: 'acad-10', title: '研究计划陈述', titleEn: 'A research proposal', category: 'academic', level: 'C1',
    desc: '讲清问题、方法与意义。', emblem: '🧭',
    targetWords: ['objective', 'significance', 'feasible', 'novelty'],
    openingLine: 'In three minutes, make the case for why this question deserves to be studied.' },

  /* ---------- 旅行 travel（10） ---------- */
  { id: 'travel-01', title: '机场值机', titleEn: 'Checking in at the airport', category: 'travel', level: 'A2',
    desc: '出示证件、托运、选座。', emblem: '🛫',
    targetWords: ['passport', 'luggage', 'window', 'boarding'],
    openingLine: 'Good morning. May I see your passport and put your luggage here, please?' },
  { id: 'travel-02', title: '酒店入住', titleEn: 'Hotel check-in', category: 'travel', level: 'A2',
    desc: '确认预订，询问 Wi-Fi 与早餐。', emblem: '🏨',
    targetWords: ['reservation', 'wifi', 'breakfast', 'key'],
    openingLine: 'Welcome. Do you have a reservation with us tonight?' },
  { id: 'travel-03', title: '餐厅点餐', titleEn: 'Ordering a meal', category: 'travel', level: 'B1',
    desc: '问推荐、说忌口、结账。', emblem: '🍽️',
    targetWords: ['recommend', 'allergic', 'starter', 'bill'],
    openingLine: 'Good evening. Can I recommend today’s special? Do you have any allergies?' },
  { id: 'travel-04', title: '买火车票', titleEn: 'Buying train tickets', category: 'travel', level: 'B1',
    desc: '问班次、时间与价格。', emblem: '🚆',
    targetWords: ['departure', 'platform', 'single', 'return'],
    openingLine: 'I would like a ticket to the city centre. What time is the next train?' },
  { id: 'travel-05', title: '景点问询', titleEn: 'Asking about attractions', category: 'travel', level: 'B1',
    desc: '问开放时间、门票与路线。', emblem: '🗼',
    targetWords: ['open', 'ticket', 'admission', 'guided'],
    openingLine: 'Hello! Could you tell me the opening hours and the admission price?' },
  { id: 'travel-06', title: '航班延误', titleEn: 'A delayed flight', category: 'travel', level: 'B2',
    desc: '要求说明原因并安排改签。', emblem: '⏳',
    targetWords: ['delay', 'rebook', 'compensation', 'update'],
    openingLine: 'My flight has been delayed twice. Could you explain why and arrange an alternative?' },
  { id: 'travel-07', title: '行李丢失', titleEn: 'Lost luggage', category: 'travel', level: 'B2',
    desc: '描述行李、报遗失、追问进度。', emblem: '🧳',
    targetWords: ['describe', 'claim', 'reference', 'trace'],
    openingLine: 'My suitcase did not arrive. Can you describe it and take a lost luggage report?' },
  { id: 'travel-08', title: '租车', titleEn: 'Renting a car', category: 'travel', level: 'B2',
    desc: '问保险、里程与还车点。', emblem: '🚗',
    targetWords: ['insurance', 'mileage', 'drop off', 'deposit'],
    openingLine: 'I would like to rent a car for three days. What does the insurance cover?' },
  { id: 'travel-09', title: '入境问询', titleEn: 'An immigration interview', category: 'travel', level: 'C1',
    desc: '清楚回答出行目的与行程。', emblem: '🛃',
    targetWords: ['purpose', 'itinerary', 'duration', 'accommodation'],
    openingLine: 'What is the purpose of your visit, and where will you be staying?' },
  { id: 'travel-10', title: '旅行纠纷', titleEn: 'Resolving a travel dispute', category: 'travel', level: 'C1',
    desc: '与商家据理力争，寻求解决。', emblem: '🤝',
    targetWords: ['unacceptable', 'documented', 'reimburse', 'escalate'],
    openingLine: 'This is not what was advertised. I have photographs, and I would like a full refund.' },
]

/** 场景属于哪个等级 Tab */
export function sceneBandOf(level: SceneLevel): SceneBand {
  if (level === 'A2' || level === 'B1') return 'beginner'
  if (level === 'B2') return 'intermediate'
  return 'advanced'
}

/** 纯函数：按等级 Tab 过滤场景（all 返回全部）；不修改入参 */
export function filterScenesByBand(scenes: ScenePreset[], band: SceneBand): ScenePreset[] {
  if (band === 'all') return [...scenes]
  return scenes.filter((s) => sceneBandOf(s.level) === band)
}

/**
 * 是否显示「挑战模式」小字：用户生效等级低于场景等级时为真。
 * 注意——只影响提示文案，绝不作为进入对话的门槛（零拦截）。
 */
export function isChallenge(userLevel: LevelCefr, sceneLevel: SceneLevel): boolean {
  return levelRank(sceneLevel) > levelRank(userLevel)
}
