/* ================================================================
 * 文化扩展目录：50 条合规英语学习视频卡（动态 import 按需加载）
 *
 * 合规铁律（与项目种子库完全一致）：
 *  - 复用唯一工厂 makeCultureVideo()，绝不手写 CultureVideo 对象；
 *  - 每条 videoId 显式留空 → idStatus='playlist-only' → embeddable=false；
 *  - playlistId 只挂 playlistRegistrySeed.ts 中已验证的官方播放列表；
 *  - 不进 localStorage、不进 store、不触发任何网络请求；
 *  - 标题为 LinguaBuddy 原创「学习卡」命名，附 titleNote 声明。
 *
 * 加载策略：由 CultureHub.tsx 通过动态 import() 在「推荐」Tab 加载，
 * 与原有 50 条种子在 UI 层合并展示，不改写 lingua_culture_videos 键。
 * ================================================================ */

import type { CefrLevel, CultureTheme } from '../../cultureTypes'
import type { CultureSource } from '../../cultureLibraryTypes'
import { makeCultureVideo, type VideoCardSpec } from '../cultureSeedExpanded'

/** 已验证的官方播放列表 ID（取自 playlistRegistrySeed.ts 的 BUILTIN_PLAYLISTS） */
const PLAYLISTS: Record<'voaLife' | 'voaLife2' | 'voaEim' | 'voaParks' | 'voaNews' | 'tedPoem' | 'tedMyth' | 'tedCoder' | 'bcSay', string> = {
  voaLife: 'PLd9hCvj34W5it4a-RMzhlwNJ-edf5HU3Q',
  voaLife2: 'PLd9hCvj34W5hWkRym8sljiEvEBJ1JGIu5',
  voaEim: 'PLd9hCvj34W5hJZwjdghwQQi3XhpSZO9sx',
  voaParks: 'PLd9hCvj34W5i4HBJAVHrMhtnPfATt73Oe',
  voaNews: 'PLd9hCvj34W5hHemY3weG4Py2oGRW-pkwb',
  tedPoem: 'PLJicmE8fK0Egxi0hgy5Tw-NFyLcpJ4bzJ',
  tedMyth: 'PLJicmE8fK0EjW2AVwcSc4NvGyJJaw7bzh',
  tedCoder: 'PLJicmE8fK0EgogMqDYMgcADT1j5b911or',
  bcSay: 'PLm7J5yZ2yc3nGd7QOvSC-7wCVR1iD5L8r',
}

/** 紧凑行：[id, 来源, 播放列表键, 标题, 中文标题, 主题, CEFR, 时长秒, 中文梗概] */
type Row = [string, CultureSource, keyof typeof PLAYLISTS, string, string, CultureTheme, CefrLevel, number, string]

const ROWS: Row[] = [
  ['ext-voa-01', 'voa', 'voaLife', 'Meeting New People', '认识新朋友', 'daily-life', 'A2', 300, '用慢速对话练自我介绍与问候的轮流节奏。'],
  ['ext-voa-02', 'voa', 'voaLife', 'Talking About the Weather', '谈论天气', 'daily-life', 'A2', 285, '从天气闲聊里学礼貌开场与接续话题。'],
  ['ext-voa-03', 'voa', 'voaLife', 'At the Coffee Shop', '在咖啡店', 'daily-life', 'A2', 310, '点单场景中的选择与数量表达。'],
  ['ext-voa-04', 'voa', 'voaLife', 'My Daily Routine', '我的一天', 'daily-life', 'A2', 295, '用时间副词串起一天的作息叙述。'],
  ['ext-voa-05', 'voa', 'voaLife', 'Shopping for Clothes', '买衣服', 'daily-life', 'A2', 320, '尺码、颜色与比较表达的日常练习。'],
  ['ext-voa-06', 'voa', 'voaLife', 'Getting Around Town', '在城市里出行', 'daily-life', 'A2', 305, '问路与指路的方位表达。'],
  ['ext-voa-07', 'voa', 'voaLife', 'A Visit to the Doctor', '看医生', 'daily-life', 'B1', 330, '描述症状与理解简单医嘱。'],
  ['ext-voa-08', 'voa', 'voaLife', 'Planning a Weekend', '计划周末', 'daily-life', 'A2', 288, '用将来时讨论安排与邀约。'],
  ['ext-voa-09', 'voa', 'voaLife2', 'Describing Your Family', '介绍家人', 'daily-life', 'B1', 340, '家庭成员与性格特征的表达。'],
  ['ext-voa-10', 'voa', 'voaLife2', 'Talking About Food', '谈论食物', 'daily-life', 'B1', 315, '口味、烹饪与餐桌对话。'],
  ['ext-voa-11', 'voa', 'voaLife2', 'Making Plans by Phone', '电话里定计划', 'daily-life', 'B1', 300, '电话沟通中的确认与改期。'],
  ['ext-voa-12', 'voa', 'voaLife2', 'At the Post Office', '在邮局', 'daily-life', 'B1', 290, '寄件、问价与填写信息。'],
  ['ext-voa-13', 'voa', 'voaEim', 'A Piece of Cake', '小菜一碟', 'daily-life', 'B1', 90, '一分钟习语：轻松表达「很简单」。'],
  ['ext-voa-14', 'voa', 'voaEim', 'Hit the Nail on the Head', '一针见血', 'daily-life', 'B1', 95, '一分钟习语：说得恰到好处。'],
  ['ext-voa-15', 'voa', 'voaEim', 'Under the Weather', '身体不适', 'daily-life', 'B1', 92, '一分钟习语：委婉地说生病了。'],
  ['ext-voa-16', 'voa', 'voaEim', 'Break the Ice', '打破僵局', 'work-social', 'B1', 88, '一分钟习语：如何开启社交场面。'],
  ['ext-voa-17', 'voa', 'voaEim', 'Once in a Blue Moon', '千载难逢', 'daily-life', 'B2', 94, '一分钟习语：描述极频率。'],
  ['ext-voa-18', 'voa', 'voaEim', 'Cost an Arm and a Leg', '贵得离谱', 'daily-life', 'B2', 91, '一分钟习语：谈论价格高低。'],
  ['ext-voa-19', 'voa', 'voaParks', 'Yellowstone: Geysers', '黄石公园的间歇泉', 'science-nature', 'B2', 360, '国家公园解说里的因果说明顺序。'],
  ['ext-voa-20', 'voa', 'voaParks', 'Grand Canyon Layers', '大峡谷的岩层', 'science-nature', 'B2', 355, '从地貌读到时间尺度的表达。'],
  ['ext-voa-21', 'voa', 'voaParks', 'Wildlife in the Parks', '公园里的野生动物', 'science-nature', 'B2', 348, '动物习性与栖息地的科普慢速讲解。'],
  ['ext-voa-22', 'voa', 'voaParks', 'Protecting Natural Spaces', '保护自然空间', 'science-nature', 'B2', 370, '环保话题里的主张与理由结构。'],
  ['ext-voa-23', 'voa', 'voaNews', 'What Is News Literacy', '什么是媒介素养', 'arts-media', 'B2', 340, '辨识信息来源与可信度。'],
  ['ext-voa-24', 'voa', 'voaNews', 'Reading Headlines Critically', '批判性读标题', 'arts-media', 'B2', 332, '从标题用词看出立场倾向。'],
  ['ext-voa-25', 'voa', 'voaNews', 'Fact vs Opinion', '事实与观点', 'arts-media', 'B2', 345, '区分事实陈述与主观评价。'],
  ['ext-voa-26', 'voa', 'voaNews', 'How Stories Are Chosen', '新闻如何被选择', 'arts-media', 'B2', 350, '新闻价值判断的幕后逻辑。'],
  ['ext-voa-27', 'voa', 'voaLife', 'Introducing Yourself at Work', '职场自我介绍', 'work-social', 'B1', 300, '正式场合里的简洁自我介绍。'],
  ['ext-voa-28', 'voa', 'voaLife2', 'Asking for Help', '请求帮助', 'work-social', 'B1', 292, '礼貌请求的几种句型层次。'],
  ['ext-voa-29', 'voa', 'voaEim', 'A Blessing in Disguise', '塞翁失马', 'daily-life', 'B2', 90, '一分钟习语：坏事里的好结果。'],
  ['ext-voa-30', 'voa', 'voaEim', 'The Ball Is in Your Court', '该你做决定了', 'work-social', 'B2', 93, '一分钟习语：把决定权交出去。'],
  ['ext-ted-01', 'ted-ed', 'tedPoem', 'Poetry and Rhythm', '诗歌与节奏', 'arts-media', 'C1', 480, '从韵律看英语诗歌的声音层次。'],
  ['ext-ted-02', 'ted-ed', 'tedPoem', 'Writing Your First Poem', '写你的第一首诗', 'arts-media', 'C1', 495, '意象与简洁语言的写作引导。'],
  ['ext-ted-03', 'ted-ed', 'tedPoem', 'Metaphor in Everyday Speech', '日常语言里的隐喻', 'arts-media', 'C1', 470, '隐喻怎样塑造我们的表达。'],
  ['ext-ted-04', 'ted-ed', 'tedMyth', 'Why Myths Matter', '神话为何重要', 'festivals', 'B2', 460, '神话作为文化记忆的载体。'],
  ['ext-ted-05', 'ted-ed', 'tedMyth', 'Tricksters Around the World', '世界各地的 trickster', 'festivals', 'B2', 455, '比较不同文化里的机智角色。'],
  ['ext-ted-06', 'ted-ed', 'tedMyth', 'Creation Stories', '创世故事', 'festivals', 'B2', 465, '创世叙事里的共同母题。'],
  ['ext-ted-07', 'ted-ed', 'tedCoder', 'Thinking Like a Coder', '像程序员一样思考', 'science-nature', 'B2', 520, '把复杂问题拆成小步骤。'],
  ['ext-ted-08', 'ted-ed', 'tedCoder', 'Algorithms in Daily Life', '日常生活中的算法', 'science-nature', 'B2', 510, '从流程视角看待 routine。'],
  ['ext-ted-09', 'ted-ed', 'tedCoder', 'Debugging Your Reasoning', '给推理排错', 'science-nature', 'B2', 500, '用排查错误的思路练逻辑。'],
  ['ext-ted-10', 'ted-ed', 'tedPoem', 'Sound and Sense in Verse', '诗中的音与义', 'arts-media', 'C1', 485, '声音如何参与意义建构。'],
  ['ext-bc-01', 'british-council', 'bcSay', 'What to Say in a Meeting', '开会时怎么说', 'work-social', 'B2', 240, '会议发言的礼貌表达框架。'],
  ['ext-bc-02', 'british-council', 'bcSay', 'Agreeing and Disagreeing', '同意与反对', 'work-social', 'B2', 235, '缓和语气下的不同意见。'],
  ['ext-bc-03', 'british-council', 'bcSay', 'Asking Better Questions', '提出更好的问题', 'work-social', 'B2', 230, '开放式问题的构造方式。'],
  ['ext-bc-04', 'british-council', 'bcSay', 'Presenting an Idea', '陈述一个想法', 'work-social', 'B2', 245, '先结论后理由的表达顺序。'],
  ['ext-bc-05', 'british-council', 'bcSay', 'Small Talk That Works', '有效寒暄', 'work-social', 'B1', 225, '寒暄如何自然过渡到正题。'],
  ['ext-bc-06', 'british-council', 'bcSay', 'Giving Feedback Gently', '温和地给出反馈', 'work-social', 'B2', 238, '先肯定再建议的表达结构。'],
  ['ext-voa-31', 'voa', 'voaLife', 'Favorite Foods Around the World', '世界各地的美食', 'festivals', 'B1', 300, '饮食话题里的文化与身份表达。'],
  ['ext-voa-32', 'voa', 'voaLife2', 'Celebrating Special Days', '庆祝特别的日子', 'festivals', 'B1', 310, '描述节庆的具体瞬间。'],
  ['ext-voa-33', 'voa', 'voaParks', 'A Walk in the Woods', '林间漫步', 'science-nature', 'B1', 330, '自然观察里的细节描述。'],
  ['ext-voa-34', 'voa', 'voaParks', 'The Four Seasons', '四季', 'science-nature', 'A2', 315, '季节变化的词汇与句型。'],
  ['ext-voa-35', 'voa', 'voaNews', 'Reading the Fine Print', '读懂细则', 'arts-media', 'B2', 338, '从措辞看出承诺与限定。'],
  ['ext-ted-11', 'ted-ed', 'tedMyth', 'Myths and Modern Life', '神话与现代生活', 'festivals', 'B2', 450, '古老故事在当下的回响。'],
  ['ext-ted-12', 'ted-ed', 'tedCoder', 'From Puzzle to Program', '从谜题到程序', 'science-nature', 'B2', 505, '分解问题的完整思路示范。'],
  ['ext-bc-07', 'british-council', 'bcSay', 'Telling a Story at Work', '在职场讲故事', 'work-social', 'B2', 240, '用叙事让观点更可记忆。'],
  ['ext-bc-08', 'british-council', 'bcSay', 'Clarifying What You Mean', '澄清你的意思', 'work-social', 'B1', 232, '重述与确认理解的句型。'],
]

/** 复用项目唯一工厂，自动生成合规的 playlist-only 视频卡 */
function makeVideo([id, source, plKey, title, titleZh, topic, cefr, dur, summary]: Row) {
  const spec: VideoCardSpec = {
    id,
    source,
    videoId: '', // 关键：显式留空，绝不编造 11 位 ID
    playlistId: PLAYLISTS[plKey],
    title,
    titleZh,
    topic,
    cefr,
    durationSec: dur,
    embeddable: true, // 工厂会因 videoId 为空自动置 embeddable=false
    titleNote: 'LinguaBuddy 原创学习卡标题；本条固定到官方播放列表，无单条视频 ID。',
  }
  const video = makeCultureVideo(spec)
  // 用本目录的中英梗概覆盖模板梗概，让每条卡的中文说明各不相同
  return { ...video, summaryZh: summary + ' 本卡为原创学习描述，不代表视频台词或字幕。' }
}

export const EXPANDED_VIDEOS = ROWS.map(makeVideo)

/** 主题分布统计（供 UI 分层展示） */
export const EXPANDED_VIDEO_THEMES = EXPANDED_VIDEOS.reduce((acc, v) => {
  const t = v.topic ?? v.theme
  acc[t] = (acc[t] || 0) + 1
  return acc
}, {} as Record<string, number>)
