/* ================================================================
 * 书架扩展目录：100 本英语文学公版书「元数据卡」
 *
 * 合规铁律（与 videoId 同一原则）：
 *  1. 只收录确实进入公有领域的作品：英语原创作者逝世 > 70 年，或
 *     19 世纪英译本（原作与译本均已过期）。每本书的作者逝世依据见 AUTHOR_PD。
 *  2. sourceUrl 一律指向古登堡「按书名搜索」真实页面，绝不编造具体 ebook ID。
 *     用户点击「到古登堡计划查看」会落到官方搜索结果，由平台自身给出版本。
 *  3. 本目录只提供元数据（书名/中译/作者/年代/CEFR/标签/双语简介），
 *     不含章节正文——正文仍由原有 5 本基线书承载，不破坏 31 键契约与
 *     BookDetail / Reader 的 SM-2 流程。
 *
 * 加载策略：本文件由 Library.tsx 通过动态 import() 按需加载，
 * 不进入 localStorage、不进入 bundle 首屏主 chunk。
 * ================================================================ */

import type { CefrLevel } from '../../literaryTypes'

export interface BookCatalogEntry {
  id: string
  /** 英文原名 */
  title: string
  /** 中文译名 */
  titleCn: string
  author: string
  year: number
  /** 推荐阅读难度 */
  cefrLevel: CefrLevel
  /** 主题标签：经典 / 浪漫 / 科幻 / 悬疑 / 诗歌 / 戏剧 / 散文 / 社科 ... */
  tags: string[]
  /** 中英双语简介 */
  intro: { en: string; zh: string }
  /** 纯色封面（复用项目既有色阶，零新增色值） */
  cover: { from: string; to: string; emblem: string }
  /** 古登堡按书名搜索的真实页面，不编造 ebook ID */
  sourceUrl: string
  /** 公版依据（作者逝世年份 / 译本年代） */
  publicDomainBasis: string
}

/** 公版依据查表：全部为可核对的作者逝世年份，不臆造 */
const AUTHOR_PD: Record<string, string> = {
  'Jane Austen': '作者 1817 年逝世，全球多数法域已进入公有领域',
  'Charles Dickens': '作者 1870 年逝世，作品属公有领域',
  'Emily Brontë': '作者 1848 年逝世，作品属公有领域',
  'Charlotte Brontë': '作者 1855 年逝世，作品属公有领域',
  'Anne Brontë': '作者 1849 年逝世，作品属公有领域',
  'George Eliot': '作者 1880 年逝世，作品属公有领域',
  'Thomas Hardy': '作者 1928 年逝世，作品属公有领域',
  'William Makepeace Thackeray': '作者 1863 年逝世，作品属公有领域',
  'Henry Fielding': '作者 1754 年逝世，作品属公有领域',
  'Oliver Goldsmith': '作者 1774 年逝世，作品属公有领域',
  'Daniel Defoe': '作者 1731 年逝世，作品属公有领域',
  'Jonathan Swift': '作者 1745 年逝世，作品属公有领域',
  'Mark Twain': '作者 1910 年逝世，美国 1929 年前出版，属公有领域',
  'Nathaniel Hawthorne': '作者 1864 年逝世，作品属公有领域',
  'Herman Melville': '作者 1891 年逝世，作品属公有领域',
  'James Fenimore Cooper': '作者 1851 年逝世，作品属公有领域',
  'Harriet Beecher Stowe': '作者 1896 年逝世，作品属公有领域',
  'Arthur Conan Doyle': '作者 1930 年逝世，作品属公有领域',
  'Mary Shelley': '作者 1851 年逝世，作品属公有领域',
  'Bram Stoker': '作者 1912 年逝世，作品属公有领域',
  'Oscar Wilde': '作者 1900 年逝世，作品属公有领域',
  'H. G. Wells': '作者 1946 年逝世，多数作品已过保护期',
  'Jules Verne': '19 世纪英译本，原作与译本均已进入公有领域',
  'Alexandre Dumas': '19 世纪英译本，原作与译本均已进入公有领域',
  'Joseph Conrad': '作者 1924 年逝世，作品属公有领域',
  'Henry James': '作者 1916 年逝世，作品属公有领域',
  'Edith Wharton': '作者 1937 年逝世，作品属公有领域',
  'James Joyce': '作者 1941 年逝世，1929 年前出版作品属公有领域',
  'Samuel Taylor Coleridge': '作者 1834 年逝世，作品属公有领域',
  'William Wordsworth': '作者 1850 年逝世，作品属公有领域',
  'Ralph Waldo Emerson': '作者 1882 年逝世，作品属公有领域',
  'Henry David Thoreau': '作者 1862 年逝世，作品属公有领域',
  'Mary Wollstonecraft': '作者 1797 年逝世，作品属公有领域',
  'John Stuart Mill': '作者 1873 年逝世，作品属公有领域',
  'Percy Bysshe Shelley': '作者 1822 年逝世，作品属公有领域',
  'John Keats': '作者 1821 年逝世，作品属公有领域',
  'Lord Byron': '作者 1824 年逝世，作品属公有领域',
  'Walt Whitman': '作者 1892 年逝世，作品属公有领域',
  'Emily Dickinson': '作者 1886 年逝世，作品属公有领域',
  'Robert Louis Stevenson': '作者 1894 年逝世，作品属公有领域',
  'George MacDonald': '作者 1905 年逝世，作品属公有领域',
  'Lewis Carroll': '作者 1898 年逝世，作品属公有领域',
  'Sir Walter Scott': '作者 1832 年逝世，作品属公有领域',
  'John Bunyan': '作者 1688 年逝世，作品属公有领域',
  'William Shakespeare': '作者 1616 年逝世，作品属公有领域',
}

/** 4 组纯色渐变封面（只用项目既有 brand / mint / sun / coral 色阶） */
const COVER_PALETTE = [
  { from: 'from-brand-400', to: 'to-brand-700', emblem: '📘' },
  { from: 'from-mint-400', to: 'to-mint-600', emblem: '📗' },
  { from: 'from-sun-400', to: 'to-sun-600', emblem: '📙' },
  { from: 'from-coral-400', to: 'to-coral-600', emblem: '📕' },
]

/** 紧凑行：[id, 英文原名, 中文译名, 作者, 年份, CEFR, 标签, 中文简介, 英文简介] */
type Row = [string, string, string, string, number, CefrLevel, string[], string, string]

const ROWS: Row[] = [
  ['sense-sensibility', 'Sense and Sensibility', '理智与情感', 'Jane Austen', 1811, 'B2', ['经典', '浪漫', '家庭'], '达什伍德姐妹一理性一感性，在爱情与现实的拉扯中各自找到归宿。', 'Two sisters balance reason and romance while seeking love and security in restrained Regency society.'],
  ['emma', 'Emma', '爱玛', 'Jane Austen', 1815, 'B2', ['经典', '浪漫', '喜剧'], '一位自信的年轻女士热衷撮合他人，却在误会中认清自己的心。', 'A confident matchmaker misreads every signal until she finally recognizes her own feelings.'],
  ['mansfield-park', 'Mansfield Park', '曼斯菲尔德庄园', 'Jane Austen', 1814, 'B2', ['经典', '家庭', '道德'], '寄人篱下的范妮在虚伪与真诚之间守住自己的判断力。', 'A dependent young woman holds fast to quiet integrity amid a household of polished hypocrisy.'],
  ['persuasion', 'Persuasion', '劝导', 'Jane Austen', 1817, 'B2', ['经典', '浪漫', '成长'], '曾被劝退的恋人八年后重逢，成熟让第二次机会有了不同结果。', 'A renewed acquaintance between former lovers asks whether wisdom can repair an old refusal.'],
  ['northanger-abbey', 'Northanger Abbey', '诺桑觉寺', 'Jane Austen', 1817, 'B2', ['哥特', '讽刺', '喜剧'], '痴迷哥特小说的少女把现实误读成悬疑情节，闹出连串笑话。', 'A girl steeped in Gothic novels mistakes ordinary life for a mystery, with comic consequences.'],
  ['great-expectations', 'Great Expectations', '远大前程', 'Charles Dickens', 1861, 'B2', ['经典', '成长', '社会'], '孤儿匹普意外获得资助，追逐绅士梦时逐渐看清财富与良知的代价。', 'An orphan chases gentility via a mysterious benefactor and learns what true worth costs.'],
  ['oliver-twist', 'Oliver Twist', '雾都孤儿', 'Charles Dickens', 1838, 'B1', ['社会', '冒险', '成长'], '孤儿在伦敦底层挣扎求生，善意与罪恶在同一座城市里交织。', 'A workhouse orphan navigates London crime and kindness before finding a safer home.'],
  ['david-copperfield', 'David Copperfield', '大卫·科波菲尔', 'Charles Dickens', 1850, 'B2', ['成长', '家庭'], '主人公从困苦童年走向写作生涯，回忆里带着温情与自省。', 'A semi-autobiographical journey from hardship to literary success, told with warmth and wit.'],
  ['tale-two-cities', 'A Tale of Two Cities', '双城记', 'Charles Dickens', 1859, 'B2', ['历史', '革命', '牺牲'], '巴黎与伦敦双线并行，个人牺牲被卷入法国大革命的洪流。', 'Two cities and two lives collide in the French Revolution, ending in an act of sacrifice.'],
  ['nicholas-nickleby', 'Nicholas Nickleby', '尼古拉斯·尼克贝', 'Charles Dickens', 1839, 'B2', ['社会', '家庭'], '青年尼克贝保护家人、反抗冷酷的学校教育，走向独立生活。', 'A young man defends his family and rebels against brutal schooling in industrial England.'],
  ['old-curiosity-shop', 'The Old Curiosity Shop', '老古玩店', 'Charles Dickens', 1841, 'B1', ['社会', '家庭'], '祖孙二人流落街头，一段关于贫穷、亲情与逝去的伤感旅程。', 'An old man and his granddaughter wander London after ruin, in a tale of poverty and devotion.'],
  ['bleak-house', 'Bleak House', '荒凉山庄', 'Charles Dickens', 1852, 'C1', ['社会', '悬疑', '法律'], '一桩旷日持久的遗产诉讼牵动众生，冷的雾与热的慈善并行。', 'A decades-long inheritance lawsuit entangles a whole cast in Dickens’s densest social novel.'],
  ['hard-times', 'Hard Times', '艰难时世', 'Charles Dickens', 1854, 'B2', ['社会', '教育'], '功利主义教育压抑想象，工业城镇里的人性如今安放。', 'A pragmatic philosophy of facts collides with imagination in a grim industrial town.'],
  ['wuthering-heights', 'Wuthering Heights', '呼啸山庄', 'Emily Brontë', 1847, 'B2', ['浪漫', '哥特', '复仇'], '荒原上两段炽烈而扭曲的爱恨，跨越两代人反复回响。', 'Passion and revenge sweep across the Yorkshire moors across two generations.'],
  ['jane-eyre', 'Jane Eyre', '简·爱', 'Charlotte Brontë', 1847, 'B2', ['浪漫', '成长'], '孤女家庭教师爱上庄园主，却在秘密揭晓时选择守住自尊。', 'A governess loves her employer but walks away to preserve her dignity when his secret surfaces.'],
  ['shirley', 'Shirley', '雪莉', 'Charlotte Brontë', 1849, 'B2', ['社会', '女性'], '工业动荡中的两位女性，讨论爱情、独立与女性的社会处境。', 'Two women navigate industrial unrest, love, and the narrow options open to their sex.'],
  ['villette', 'Villette', '维莱特', 'Charlotte Brontë', 1853, 'B2', ['成长', '浪漫'], '一位英国女孩在异国寄宿学校任教，在孤独中辨认自己的情感。', 'A lonely English teacher in a Belgian boarding school probes the borders of love and duty.'],
  ['wildfell-hall', 'The Tenant of Wildfell Hall', '怀尔德菲尔府的房客', 'Anne Brontë', 1848, 'B2', ['社会', '女性'], '一位带着秘密的寡妇独立生活，直面酗酒与婚姻控制的伤害。', 'A mysterious widow supports herself while exposing the damage of an abusive marriage.'],
  ['agnes-grey', 'Agnes Grey', '艾格妮丝·格雷', 'Anne Brontë', 1847, 'B1', ['成长', '家庭'], '年轻家庭女教师目睹上流家庭的冷漠，坚守朴素的正直。', 'A gentle governess meets hypocrisy in wealthy households but keeps her quiet integrity.'],
  ['middlemarch', 'Middlemarch', '米德尔马契', 'George Eliot', 1871, 'C1', ['经典', '社会', '婚姻'], '小镇里多组人物的理想与现实相互碰撞，被称为最伟大的英语小说之一。', 'Interlinked lives in a provincial town test ambition, marriage, and reform against reality.'],
  ['mill-floss', 'The Mill on the Floss', '弗洛斯河上的磨坊', 'George Eliot', 1860, 'B2', ['成长', '家庭'], '兄妹在磨坊生活中渐行渐远，最终被河流重新联结。', 'A brother and sister drift apart in a mill town, reunited by the river that shaped them.'],
  ['silas-marner', 'Silas Marner', '织工马南', 'George Eliot', 1861, 'B1', ['乡村', '救赎'], '被冤枉的织工隐居度日，一个孩子的到来重新点亮他的生活。', 'A wronged weaver lives in isolation until a child restores his faith in human warmth.'],
  ['adam-bede', 'Adam Bede', '亚当·比德', 'George Eliot', 1859, 'B2', ['乡村', '道德'], '木匠、女工与传教士之间的情感纠葛，铺展乡村的道德图景。', 'A carpenter, a dairymaid, and a preacher trace a moral tapestry in rural England.'],
  ['tess-durbervilles', 'Tess of the d’Urbervilles', '德伯家的苔丝', 'Thomas Hardy', 1891, 'B2', ['悲剧', '乡村', '女性'], '纯真女子被命运与成见层层逼迫，追问谁该为她的遭遇负责。', 'A young woman is worn down by fate and social judgment in Hardy’s tragic masterpiece.'],
  ['far-madding-crowd', 'Far from the Madding Crowd', '远离尘嚣', 'Thomas Hardy', 1874, 'B2', ['乡村', '浪漫'], '独立女农场主在三位追求者之间选择，命运随之起伏。', 'A self-reliant farmer chooses among three suitors, with comic and tragic reversals.'],
  ['mayor-casterbridge', 'The Mayor of Casterbridge', '卡斯特桥市长', 'Thomas Hardy', 1886, 'B2', ['悲剧', '社会'], '一位因酒后冲动卖掉妻女的商人，多年后被过往追上。', 'A man who once sold his family in a drunken fit faces the consequences years later.'],
  ['jude-obscure', 'Jude the Obscure', '无名的裘德', 'Thomas Hardy', 1895, 'C1', ['悲剧', '社会', '教育'], '石匠渴求学问却屡被阶层阻断，理想在偏见中破碎。', 'A stonemason’s hunger for learning is crushed by class barriers and social hypocrisy.'],
  ['greenwood-tree', 'Under the Greenwood Tree', '绿荫下', 'Thomas Hardy', 1872, 'B1', ['乡村', '浪漫'], '乡村唱诗班与一位新来女教师的温柔爱情，笔调明快。', 'A rural choir and a new schoolmistress find love in one of Hardy’s sunniest books.'],
  ['return-native', 'The Return of the Native', '卡斯特桥的回归', 'Thomas Hardy', 1878, 'B2', ['乡村', '悲剧'], '游子回到荒原故里，激情与误会酿成无可挽回的结局。', 'A returned native’s passions play out against the indifferent Egdon Heath.'],
  ['vanity-fair', 'Vanity Fair', '名利场', 'William Makepeace Thackeray', 1848, 'B2', ['讽刺', '社会'], '精明的贝姬·夏普在名利场中周旋，上流社会的虚荣被层层剥开。', 'An unscrupulous heroine climbs the social ladder as satire strips vanity bare.'],
  ['tom-jones', 'The History of Tom Jones', '汤姆·琼斯', 'Henry Fielding', 1749, 'C1', ['讽刺', '冒险'], '私生子汤姆善良而莽撞，一场寻爱旅程串起英国社会百态。', 'A generous, impulsive foundling crosses England in a comic panorama of human nature.'],
  ['joseph-andrews', 'Joseph Andrews', '约瑟夫·安德鲁斯', 'Henry Fielding', 1742, 'B2', ['讽刺', '喜剧'], '仆人约瑟夫坚守德行，途中遭遇形形色色的荒唐人物。', 'A virtuous servant meets a parade of comic rogues on the road in Fielding’s first novel.'],
  ['amelia', 'Amelia', '阿米莉亚', 'Henry Fielding', 1751, 'B2', ['社会', '家庭'], '一对夫妻在贫困与诱惑中维系婚姻，笔触转向温和的现实。', 'A couple’s marriage survives poverty and temptation in Fielding’s gentler final novel.'],
  ['vicar-wakefield', 'The Vicar of Wakefield', '威克菲尔德的牧师', 'Oliver Goldsmith', 1766, 'B1', ['家庭', '乡村'], '善良牧师一家连遭变故，仍以温情与信念度过难关。', 'A kind parson and his family endure misfortune with patience and good humor.'],
  ['robinson-crusoe', 'Robinson Crusoe', '鲁滨逊漂流记', 'Daniel Defoe', 1719, 'B1', ['冒险', '生存'], '水手漂流荒岛，凭劳动与信仰在孤独中重建生活。', 'A castaway rebuilds a life on a desert island through work, ingenuity, and faith.'],
  ['moll-flanders', 'Moll Flanders', '摩尔·弗兰德斯', 'Daniel Defoe', 1722, 'B2', ['冒险', '社会'], '一位女性在贫困与犯罪中挣扎求生，第一人称叙述直白有力。', 'A woman’s life of crime and survival is told in Defoe’s brisk first-person voice.'],
  ['plague-year', 'A Journal of the Plague Year', '大疫年日记', 'Daniel Defoe', 1722, 'B2', ['历史', '纪实'], '以亲历者口吻记录伦敦大瘟疫，细节逼真如现场报道。', 'A vivid eyewitness-style account of London’s Great Plague, rendered with documentary detail.'],
  ['roxana', 'Roxana', '罗克珊娜', 'Daniel Defoe', 1724, 'B2', ['冒险', '社会'], '女性在财富与名声间冒险经营，反思金钱带来的自由与代价。', 'A woman maneuvers through wealth and notoriety, weighing the price of independence.'],
  ['gulliver-travels', 'Gulliver’s Travels', '格列佛游记', 'Jonathan Swift', 1726, 'B2', ['讽刺', '奇幻'], '航海者游历小人国与大人国，借奇境辛辣讽刺人性与政治。', 'A traveler’s voyages to strange lands become a sharp satire of politics and human pride.'],
  ['modest-proposal', 'A Modest Proposal', '一个温和的建议', 'Jonathan Swift', 1729, 'C1', ['讽刺', '社科'], '以极端冷静的反讽笔法讨论爱尔兰贫困，是讽刺文学的巅峰。', 'Swift’s savage irony on Irish poverty remains the sharpest example of the genre.'],
  ['tom-sawyer', 'The Adventures of Tom Sawyer', '汤姆·索亚历险记', 'Mark Twain', 1876, 'B1', ['冒险', '成长'], '密西西比河畔男孩的恶作剧与冒险，童年活力跃然纸上。', 'A restless boy’s pranks and adventures along the Mississippi brim with youthful energy.'],
  ['huckleberry-finn', 'Adventures of Huckleberry Finn', '哈克贝利·费恩历险记', 'Mark Twain', 1884, 'B1', ['冒险', '社会'], '男孩与逃亡奴隶沿河漂流，直面种族偏见与良知的选择。', 'A boy and a runaway slave raft downriver, confronting prejudice and conscience.'],
  ['prince-pauper', 'The Prince and the Pauper', '王子与贫儿', 'Mark Twain', 1881, 'B1', ['冒险', '历史'], '身份互换的王子与贫儿，借错位经历看见阶层的荒诞。', 'Two boys swap identities and learn how thin the line between ranks can be.'],
  ['connecticut-yankee', 'A Connecticut Yankee in King Arthur’s Court', '康州美国佬在亚瑟王朝', 'Mark Twain', 1889, 'B2', ['科幻', '讽刺'], '现代工程师穿越到中世纪，用技术照亮也灼伤旧世界。', 'A modern engineer lands in Camelot and tech both illuminates and burns the old order.'],
  ['gilded-age', 'The Gilded Age', '镀金时代', 'Mark Twain', 1873, 'B2', ['讽刺', '社会'], '投机与暴富的年代被辛辣描绘，为一个时代留下了名字。', 'Land speculation and get-rich-quick schemes lampooned in the novel that named an era.'],
  ['scarlet-letter', 'The Scarlet Letter', '红字', 'Nathaniel Hawthorne', 1850, 'B2', ['历史', '道德'], '清教小镇里的通奸丑闻，红字成为罪与救赎的复杂象征。', 'A scarlet letter branded on a woman becomes a shifting symbol of sin and redemption.'],
  ['seven-gables', 'The House of the Seven Gables', '七个尖角阁的房子', 'Nathaniel Hawthorne', 1851, 'B2', ['哥特', '神秘'], '古老宅邸里的家族诅咒与秘密，在代际间缓慢揭开。', 'An ancestral curse and hidden guilt unravel slowly inside a creaking New England mansion.'],
  ['blithedale-romance', 'The Blithedale Romance', '福谷传奇', 'Nathaniel Hawthorne', 1852, 'B2', ['社会', '理想'], '知识分子公社实验里，理想主义与人性弱点彼此纠缠。', 'A utopian commune experiment unravels as ideals collide with human frailty.'],
  ['moby-dick', 'Moby-Dick', '白鲸', 'Herman Melville', 1851, 'C1', ['冒险', '象征'], '捕鲸船追逐白色巨鲸，复仇之旅升华为对执念与自然的追问。', 'A whaling voyage after a white whale becomes a dense meditation on obsession and nature.'],
  ['billy-budd', 'Billy Budd', '比利·巴德', 'Herman Melville', 1924, 'B2', ['海军', '悲剧'], '年轻水手被诬陷致死，善与法则的冲突令人久久难平。', 'A handsome sailor is condemned by naval law in a stark parable of innocence and justice.'],
  ['white-jacket', 'White-Jacket', '白外套', 'Herman Melville', 1850, 'B2', ['海军', '社会'], '以水手视角描绘军舰生活，揭露体罚与等级的不公。', 'A sailor’s view of life aboard a warship exposes flogging and naval hierarchy.'],
  ['redburn', 'Redburn', '雷德伯恩', 'Herman Melville', 1849, 'B1', ['航海', '成长'], '少年初次出海，从天真到世故，见识港口与人心。', 'A youthful first voyage turns innocence into experience in the rough world of the sea.'],
  ['last-mohicans', 'The Last of the Mohicans', '最后的莫希干人', 'James Fenimore Cooper', 1826, 'B2', ['冒险', '历史'], '英法战争中的边境厮杀，紧凑的追捕叙事与壮阔荒野图景。', 'Frontier warfare during the French and Indian War drives a tale of pursuit and survival.'],
  ['deerslayer', 'The Deerslayer', '杀鹿人', 'James Fenimore Cooper', 1841, 'B1', ['边疆', '冒险'], '年轻猎手在湖畔经受考验，学会勇气与自持。', 'A young hunter faces trials by a frontier lake and learns courage with restraint.'],
  ['pathfinder', 'The Pathfinder', '探路者', 'James Fenimore Cooper', 1840, 'B1', ['边疆', '浪漫'], '向导在荒野护送心上人，考验忠诚与判断。', 'A frontier guide escorts his beloved through the wilderness, testing loyalty and skill.'],
  ['uncle-tom-cabin', 'Uncle Tom’s Cabin', '汤姆叔叔的小屋', 'Harriet Beecher Stowe', 1852, 'B1', ['社会', '废奴'], '奴隶制的残酷借多个家庭的命运呈现，推动废奴思潮。', 'The human cost of slavery is traced through several families in this abolitionist classic.'],
  ['ministers-wooing', 'The Minister’s Wooing', '牧师的求婚', 'Harriet Beecher Stowe', 1859, 'B2', ['社会', '女性'], '新英格兰小镇里，一位女性的选择与独立意识缓缓生长。', 'A New England heroine weighing love and conscience signals Stowe’s quiet feminism.'],
  ['hound-baskervilles', 'The Hound of the Baskervilles', '巴斯克维尔的猎犬', 'Arthur Conan Doyle', 1902, 'B1', ['悬疑', '侦探'], '福尔摩斯侦破荒原上的猎犬传说，理性照亮迷信的迷雾。', 'Holmes investigates a legendary hound on the moor, replacing superstition with logic.'],
  ['study-scarlet', 'A Study in Scarlet', '血字的研究', 'Arthur Conan Doyle', 1887, 'B1', ['侦探', '悬疑'], '福尔摩斯与华生初次搭档，揭开复仇谜案。', 'Holmes and Watson team up for the first time in a puzzle of love and revenge.'],
  ['sign-four', 'The Sign of the Four', '四签名', 'Arthur Conan Doyle', 1890, 'B1', ['侦探', '冒险'], '一桩夺宝旧案牵出印度殖民背景下的恩怨。', 'A missing treasure and an old colonial wrong drive the second Holmes novel.'],
  ['lost-world', 'The Lost World', '失落的世界', 'Arthur Conan Doyle', 1912, 'B1', ['冒险', '科幻'], '探险队登上与世隔绝的高原，发现恐龙仍存活的秘境。', 'An expedition reaches a plateau where dinosaurs still roam, in a classic adventure.'],
  ['frankenstein', 'Frankenstein', '弗兰肯斯坦', 'Mary Shelley', 1818, 'B2', ['哥特', '科幻'], '科学家赋予造物生命，却被自己的创造反噬，追问责任边界。', 'A scientist gives life to a creature and must face the consequences of his ambition.'],
  ['last-man', 'The Last Man', '最后的人', 'Mary Shelley', 1826, 'B2', ['科幻', '末世'], '瘟疫席卷未来世界，最后幸存者在孤独中回望人类。', 'A plague empties the future world in one of the earliest apocalyptic novels.'],
  ['perkin-warbeck', 'The Fortunes of Perkin Warbeck', '珀金·沃贝克的命运', 'Mary Shelley', 1830, 'B2', ['历史', '小说'], '以王位争夺者为主角的历史小说，书写流亡与身份。', 'A historical novel about a pretender to the English throne, exile and identity.'],
  ['dracula', 'Dracula', '德古拉', 'Bram Stoker', 1897, 'B2', ['哥特', '恐怖'], '吸血鬼伯爵从特兰西瓦尼亚来到伦敦，书信与日记交织成惊悚叙事。', 'Letters and diaries piece together a vampire’s move from Transylvania to Victorian London.'],
  ['dorian-gray', 'The Picture of Dorian Gray', '道林·格雷的画像', 'Oscar Wilde', 1890, 'B2', ['唯美', '哥特'], '青春永驻的画像藏起灵魂的腐坏，唯美主义经典。', 'A portrait ages while its subject stays young, hiding a life of moral decay.'],
  ['earnest-important', 'The Importance of Being Earnest', '不可儿戏', 'Oscar Wilde', 1895, 'B1', ['喜剧', '戏剧'], '双重身份与荒唐误会，机智对白层层反转。', 'Bunburying and mistaken identities drive Wilde’s sparkling comedy of manners.'],
  ['ideal-husband', 'An Ideal Husband', '理想丈夫', 'Oscar Wilde', 1895, 'B2', ['戏剧', '社会'], '一则旧日丑闻威胁政治前程，婚姻与宽恕成为命题。', 'A past scandal threatens public honor, testing marriage and forgiveness.'],
  ['windermere-fan', 'Lady Windermere’s Fan', '温德米尔夫人的扇子', 'Oscar Wilde', 1892, 'B2', ['戏剧', '社会'], '上流社会的流言与误解，在一把扇子里收束。', 'Society gossip and a dropped fan converge in Wilde’s first great stage hit.'],
  ['time-machine', 'The Time Machine', '时间机器', 'H. G. Wells', 1895, 'B1', ['科幻', '未来'], '时间旅行者抵达遥远未来，看见人类分化后的世界。', 'A traveler reaches the far future and finds humanity split into two species.'],
  ['war-worlds', 'The War of the Worlds', '世界大战', 'H. G. Wells', 1898, 'B1', ['科幻', '末世'], '火星人入侵地球，人类文明在异星武器前崩溃。', 'Martians invade Earth and human institutions collapse in Wells’s landmark sci-fi.'],
  ['invisible-man', 'The Invisible Man', '隐形人', 'H. G. Wells', 1897, 'B1', ['科幻', '惊悚'], '科学家获得隐形能力，孤独与疯狂随之蔓延。', 'A scientist turns invisible and discovers that power brings isolation and madness.'],
  ['doctor-moreau', 'The Island of Doctor Moreau', '莫罗博士岛', 'H. G. Wells', 1896, 'B2', ['科幻', '伦理'], '孤岛上的活体实验造出兽人，追问科学与人性的界限。', 'Vivisection creates beast-men on a remote island, raising stark ethical questions.'],
  ['twenty-thousand-leagues', 'Twenty Thousand Leagues Under the Seas', '海底两万里', 'Jules Verne', 1870, 'B1', ['科幻', '冒险'], '尼摩船长带众人乘鹦鹉螺号潜入深海，奇境与秘密并存。', 'Captain Nemo’s Nautilus carries readers twenty thousand leagues beneath the sea.'],
  ['around-world', 'Around the World in Eighty Days', '八十天环游地球', 'Jules Verne', 1873, 'B1', ['冒险', '环球'], '菲利斯·福格为一场赌约环游世界，途中险象环生。', 'Phileas Fogg circles the globe to win a wager, meeting mishaps at every leg.'],
  ['mysterious-island', 'The Mysterious Island', '神秘岛', 'Jules Verne', 1874, 'B1', ['科幻', '生存'], '遇险者流落荒岛，用科学知识重建生活，逐渐揭开岛上秘密。', 'Castaways rebuild civilization on an island using science, uncovering a hidden benefactor.'],
  ['count-monte-cristo', 'The Count of Monte Cristo', '基督山伯爵', 'Alexandre Dumas', 1844, 'B2', ['复仇', '冒险'], '蒙冤青年获宝藏后化名伯爵，精心安排恩怨清算。', 'A wrongly imprisoned man finds treasure and exacts an elaborate revenge as the Count.'],
  ['three-musketeers', 'The Three Musketeers', '三个火枪手', 'Alexandre Dumas', 1844, 'B2', ['冒险', '友情'], '达达尼昂与三位火枪手并肩冒险，忠诚与荣耀并行。', 'D’Artagnan and three musketeers live by the motto “all for one, one for all.”'],
  ['twenty-years-after', 'Twenty Years After', '二十年后', 'Alexandre Dumas', 1845, 'B2', ['冒险', '历史'], '火枪手们在二十年后再度卷入法国政局的动荡。', 'The musketeers reunite two decades later amid the turmoil of the Fronde.'],
  ['iron-mask', 'The Man in the Iron Mask', '铁面人', 'Alexandre Dumas', 1847, 'B2', ['历史', '冒险'], '路易十四时代，孪生兄弟与铁面囚徒的秘密牵动王位。', 'A twin brother and an iron-masked prisoner unsettle the court of Louis XIV.'],
  ['heart-darkness', 'Heart of Darkness', '黑暗的心', 'Joseph Conrad', 1899, 'B2', ['殖民', '心理'], '沿刚果河而上的旅程，深入殖民掠夺与人心幽暗。', 'A voyage up the Congo becomes a descent into colonial greed and the human psyche.'],
  ['lord-jim', 'Lord Jim', '吉姆爷', 'Joseph Conrad', 1900, 'B2', ['航海', '道德'], '一次怯懦的抉择终身纠缠一位海员，寻找救赎之路。', 'A sailor’s moment of cowardice haunts him as he seeks redemption in a distant land.'],
  ['secret-agent', 'The Secret Agent', '保密局', 'Joseph Conrad', 1907, 'B2', ['间谍', '政治'], '伦敦无政府主义者卷入爆炸阴谋，荒诞中透出政治寒意。', 'An anarchist plot in London turns tragicomic in Conrad’s dark political novel.'],
  ['nostromo', 'Nostromo', '诺斯特罗莫', 'Joseph Conrad', 1904, 'C1', ['政治', '冒险'], '南美共和国的银矿与革命，映照理想如何被私欲吞没。', 'A silver mine and a revolution in a fictional South American state expose corrosive ideals.'],
  ['typhoon', 'Typhoon', '台风', 'Joseph Conrad', 1902, 'B2', ['航海', '自然'], '商船穿越台风，船长与乘客在风暴中显出不同本色。', 'A ship crosses a typhoon and the crew’s true mettle emerges in the storm.'],
  ['turn-screw', 'The Turn of the Screw', '螺丝在拧紧', 'Henry James', 1898, 'B2', ['哥特', '心理'], '家庭教师疑心庄园闹鬼，究竟是灵异还是心魔，始终悬而未决。', 'A governess suspects ghosts at a country house; James never resolves the ambiguity.'],
  ['portrait-lady', 'The Portrait of a Lady', '一位女士的画像', 'Henry James', 1881, 'B2', ['心理', '社会'], '独立女性继承财富后，在欧洲婚姻中遭遇自由的代价。', 'A free-spirited heiress finds that wealth cannot protect her in a manipulative marriage.'],
  ['washington-square', 'Washington Square', '华盛顿广场', 'Henry James', 1880, 'B1', ['家庭', '心理'], '父女围绕一段婚事对峙，平淡日常里藏着情感暗流。', 'A father and daughter clash over a suitor in a quiet domestic tragedy.'],
  ['daisy-miller', 'Daisy Miller', '戴西·米勒', 'Henry James', 1878, 'B1', ['社交', '悲剧'], '美国少女在欧洲社交界的率真，被礼教误读成轻浮。', 'An American girl’s innocence is misread as impropriety by European high society.'],
  ['wings-dove', 'The Wings of the Dove', '鸽翼', 'Henry James', 1902, 'C1', ['心理', '悲剧'], '一位病弱女继承人与一对恋人的复杂关系，道德困境细腻层层展开。', 'A dying heiress and an ambitious couple face a subtle moral dilemma in James’s late style.'],
  ['ambassadors', 'The Ambassadors', '使者', 'Henry James', 1903, 'C1', ['心理', '文化'], '清教徒使者赴巴黎，被旧大陆的自由气息改变。', 'A puritan envoy to Paris is unsettled by the city’s ease and beauty.'],
  ['ethan-frome', 'Ethan Frome', '伊坦·弗洛美', 'Edith Wharton', 1911, 'B2', ['悲剧', '乡村'], '新英格兰乡村里，一段无望的情感以雪夜意外收场。', 'A bleak New England love story ends in a snowslide with a devastating twist.'],
  ['house-mirth', 'The House of Mirth', '欢乐之家', 'Edith Wharton', 1905, 'B2', ['社会', '悲剧'], '纽约上流社会的美丽女子，在金钱规则里被逐步消耗。', 'A society beauty is worn down by the unspoken economics of New York’s elite.'],
  ['age-innocence', 'The Age of Innocence', '纯真年代', 'Edith Wharton', 1920, 'B2', ['社会', '浪漫'], '订婚男子与表姐的禁忌情感，在礼教重压下无声收场。', 'A forbidden attraction collapses under the weight of old New York convention.'],
  ['portrait-artist', 'A Portrait of the Artist as a Young Man', '青年艺术家的画像', 'James Joyce', 1916, 'C1', ['成长', '现代'], '爱尔兰少年在宗教、民族与艺术之间寻找自我声音。', 'A young Irishman breaks with religion and nation to forge an artistic identity.'],
  ['dubliners', 'Dubliners', '都柏林人', 'James Joyce', 1914, 'B2', ['短篇', '写实'], '十五个都柏林生活片段，短篇小说的现代里程碑。', 'Fifteen linked stories capture paralysis and epiphany in early twentieth-century Dublin.'],
  ['exiles', 'Exiles', '流亡者', 'James Joyce', 1918, 'B2', ['戏剧', '现代'], '一对流亡伴侣间的信任与自由，戏剧化的情感实验。', 'A couple in exile test trust, freedom, and jealousy in Joyce’s only play.'],
  ['ancient-mariner', 'The Rime of the Ancient Mariner', '古舟子咏', 'Samuel Taylor Coleridge', 1798, 'B2', ['诗歌', '超自然'], '水手射杀信天翁后遭遇诅咒，叙事诗里的罪与救赎。', 'A sailor who kills an albatross endures a supernatural tale of guilt and redemption.'],
  ['kubla-khan', 'Kubla Khan', '忽必烈汗', 'Samuel Taylor Coleridge', 1816, 'B2', ['诗歌', '浪漫'], '梦境般的东西方意象，浪漫主义名篇。', 'A dream-fragment of Xanadu that became a landmark of Romantic imagination.'],
  ['lyrical-ballads', 'Lyrical Ballads', '抒情歌谣集', 'William Wordsworth', 1798, 'B2', ['诗歌', '自然'], '华兹华斯与柯勒律治合著，以平实语言写自然与普通人的诗学革命。', 'Wordsworth and Coleridge’s collaboration launched English Romantic poetry.'],
  ['self-reliance', 'Self-Reliance', '自助论', 'Ralph Waldo Emerson', 1841, 'B2', ['散文', '哲学'], '相信你自己，爱默生超验主义的宣言式随笔。', 'Emerson’s classic essay urges trust in one’s own mind over inherited convention.'],
  ['walden', 'Walden', '瓦尔登湖', 'Henry David Thoreau', 1854, 'B2', ['散文', '自然'], '作者在湖畔独居两年，记录简朴生活与自然的细节。', 'Thoreau’s two years by the pond become a meditation on simple living and nature.'],
  ['civil-disobedience', 'Civil Disobedience', '论公民的不服从', 'Henry David Thoreau', 1849, 'B2', ['散文', '政治'], '以拒绝纳税抗议不义法律，影响后世非暴力抵抗思想。', 'Thoreau argues for refusing unjust laws, shaping later movements of nonviolent protest.'],
  ['american-scholar', 'The American Scholar', '美国学者', 'Ralph Waldo Emerson', 1837, 'B2', ['散文', '教育'], '呼唤美国思想摆脱欧洲传统，建立独立的文化声音。', 'Emerson calls for an independent American intellect free of European imitation.'],
  ['nature-essay', 'Nature', '自然', 'Ralph Waldo Emerson', 1836, 'B1', ['散文', '自然'], '超验主义宣言，主张在自然中直觉地认识真理。', 'Emerson’s first essay proposes direct intuition of truth through the natural world.'],
  ['vindication-woman', 'A Vindication of the Rights of Woman', '女权辩护', 'Mary Wollstonecraft', 1792, 'C1', ['社科', '女性'], '为女性教育权与理性平等辩护的早期女权经典。', 'Wollstonecraft argues that women deserve equal education and rational rights.'],
  ['on-liberty', 'On Liberty', '论自由', 'John Stuart Mill', 1859, 'C1', ['社科', '哲学'], '论证个人自由与社会权力的边界，自由主义名作。', 'Mill defines the limits of state power over the individual in a liberal classic.'],
  ['subjection-women', 'The Subjection of Women', '妇女的屈从地位', 'John Stuart Mill', 1869, 'B2', ['社科', '女性'], '系统论证性别平等的早期经典，影响深远。', 'Mill dismantles the legal and social case for women’s subordination.'],
  ['prometheus-unbound', 'Prometheus Unbound', '解放了的普罗米修斯', 'Percy Bysshe Shelley', 1820, 'C1', ['诗歌', '戏剧'], '诗剧借神话书写反抗暴政与人类解放的理想。', 'Shelley’s lyrical drama reimagines Prometheus as a figure of liberation.'],
  ['ode-west-wind', 'Ode to the West Wind', '西风颂', 'Percy Bysshe Shelley', 1819, 'B2', ['诗歌', '自然'], '以西风为意象，祈愿革命性的新生。', 'Shelley’s sweeping ode to the west wind ends with a cry for renewal.'],
  ['ode-nightingale', 'Ode to a Nightingale', '夜莺颂', 'John Keats', 1819, 'B2', ['诗歌', '浪漫'], '夜莺歌声引发对永恒与死亡的沉思，济慈名篇。', 'A nightingale’s song draws Keats into a meditation on beauty, mortality, and escape.'],
  ['ode-grecian-urn', 'Ode on a Grecian Urn', '希腊古瓮颂', 'John Keats', 1819, 'B2', ['诗歌', '艺术'], '凝视古瓮上的图案，思考艺术如何超越时间。', 'A Greek urn becomes a figure for art’s frozen, timeless beauty.'],
  ['leaves-grass', 'Leaves of Grass', '草叶集', 'Walt Whitman', 1855, 'B2', ['诗歌', '民主'], '自由诗体歌颂自我、身体与民主美国。', 'Whitman’s free verse celebrates the self, the body, and democratic America.'],
  ['dickinson-poems', 'Selected Poems of Emily Dickinson', '艾米莉·狄金森诗选', 'Emily Dickinson', 1890, 'B2', ['诗歌', '短诗'], '短小诗篇以破折号与非常规节奏叩问生死与内心。', 'Dickinson’s compact lyrics probe death, faith, and the inner life in dashes and slant rhyme.'],
  ['treasure-island', 'Treasure Island', '金银岛', 'Robert Louis Stevenson', 1883, 'B1', ['冒险', '海盗'], '少年吉姆卷入寻宝与背叛，海盗形象深入人心。', 'A boy joins a treasure hunt aboard a ship of cutthroats in a pirate classic.'],
  ['strange-case-dr-jekyll', 'Strange Case of Dr Jekyll and Mr Hyde', '化身博士', 'Robert Louis Stevenson', 1886, 'B2', ['哥特', '心理'], '双重人格的恐怖寓言，善恶同体的隐喻历久弥新。', 'A doctor’s split personality becomes an enduring metaphor for hidden moral duality.'],
  ['kidnapped', 'Kidnapped', '诱拐', 'Robert Louis Stevenson', 1886, 'B1', ['冒险', '历史'], '苏格兰少年被绑架后逃亡，卷入高地政治纷争。', 'A kidnapped lad flees across the Scottish Highlands amid political intrigue.'],
  ['princess-phthia', 'The Princess and the Goblin', '公主与妖怪', 'George MacDonald', 1872, 'B1', ['奇幻', '童话'], '小公主遇见山顶仙女与地下妖怪，勇气与纯真的童话。', 'A little princess meets a fairy and goblins in a gentle Victorian fantasy.'],
  ['princess-curie', 'The Princess Curdie', '公主与柯迪', 'George MacDonald', 1883, 'B1', ['奇幻', '童话'], '矿童柯迪与公主联手对抗地底妖怪，延续前作冒险。', 'A miner’s boy and a princess outwit the goblin kingdom in this fantasy sequel.'],
  ['alice-looking-glass', 'Through the Looking-Glass', '爱丽丝镜中奇遇记', 'Lewis Carroll', 1871, 'B1', ['奇幻', '童话'], '爱丽丝穿过镜子，进入棋子与文字游戏的荒诞世界。', 'Alice steps through a mirror into a world of chess pieces and wordplay.'],
  ['hunting-snark', 'The Hunting of the Snark', '猎鲨记', 'Lewis Carroll', 1876, 'B2', ['诗歌', '荒诞'], '一场寻找神秘生物的荒诞远征，逻辑与 nonsense 交织。', 'A crew hunts an elusive Snark in Carroll’s mock-epic of nonsense and logic.'],
  ['ivanhoe', 'Ivanhoe', '艾凡赫', 'Sir Walter Scott', 1819, 'B2', ['历史', '浪漫'], '中世纪英格兰的骑士比武与民族和解，历史小说开创之作。', 'Knights and tournaments in medieval England mark the birth of the historical novel.'],
  ['heart-midlothian', 'The Heart of Midlothian', '米德洛西恩的心', 'Sir Walter Scott', 1818, 'B2', ['历史', '社会'], '苏格兰骚乱中一位女性的坚韧与申诉，刑狱与宽容主题。', 'A woman’s quiet fortitude amid Scottish unrest drives Scott’s novel of law and mercy.'],
  ['pilgrim-progress', 'The Pilgrim’s Progress', '天路历程', 'John Bunyan', 1678, 'B1', ['宗教', '寓言'], '基督徒前往天国的寓言旅程，英语清教徒文学经典。', 'An allegorical pilgrimage to the Celestial City, a cornerstone of Puritan literature.'],
  ['hamlet', 'Hamlet', '哈姆雷特', 'William Shakespeare', 1603, 'B2', ['戏剧', '悲剧'], '王子为父复仇的犹疑与思辨，最著名的英语戏剧。', 'A prince delays revenge through doubt and thought in Shakespeare’s most famous tragedy.'],
  ['macbeth', 'Macbeth', '麦克白', 'William Shakespeare', 1606, 'B1', ['戏剧', '悲剧'], '女巫预言点燃野心，国王夫妇走向血腥与毁灭。', 'A prophecy stokes ambition until a king and queen are destroyed by their own crime.'],
  ['romeo-juliet', 'Romeo and Juliet', '罗密欧与朱丽叶', 'William Shakespeare', 1595, 'B1', ['戏剧', '浪漫'], '世仇之家的年轻恋人，以生命换来和解。', 'Two young lovers from feuding families pay the ultimate price for their union.'],
  ['tempest', 'The Tempest', '暴风雨', 'William Shakespeare', 1611, 'B1', ['戏剧', '奇幻'], '流落荒岛的公爵以魔法安排一切，宽恕与权力主题。', 'A stranded duke orchestrates forgiveness and power through magic on an island.'],
  ['midsummer-dream', 'A Midsummer Night’s Dream', '仲夏夜之梦', 'William Shakespeare', 1595, 'B1', ['戏剧', '喜剧'], '雅典森林里的爱情魔药与误会，精灵与凡人的喜剧。', 'Love potions and fairy mischief tangle four lovers in a comic midsummer night.'],
]

/**
 * 构造一条完整目录卡：自动补全公版依据、古登堡搜索链接与封面。
 * 搜索链接用 URL 编码的真实书名，不编造具体 ebook ID。
 */
function makeEntry([id, title, titleCn, author, year, cefrLevel, tags, introZh, introEn]: Row, i: number): BookCatalogEntry {
  const cover = COVER_PALETTE[i % COVER_PALETTE.length]
  return {
    id, title, titleCn, author, year, cefrLevel, tags,
    intro: { en: introEn, zh: introZh },
    cover,
    sourceUrl: `https://www.gutenberg.org/ebooks/search/?query=${encodeURIComponent(title)}`,
    publicDomainBasis: AUTHOR_PD[author] || '出版年代久远，作品已进入公有领域（请以来源页说明为准）',
  }
}

export const BOOK_CATALOG: BookCatalogEntry[] = ROWS.map(makeEntry)

/** 全部可用筛选标签（按出现频次排序，供 UI 生成筛选 chip） */
export const CATALOG_TAGS: string[] = (() => {
  const counts = new Map<string, number>()
  for (const row of ROWS) for (const tag of row[6]) counts.set(tag, (counts.get(tag) || 0) + 1)
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).map(([t]) => t)
})()

/** CEFR 分布，供筛选器显示每档数量 */
export const CATALOG_CEFR_COUNTS: Record<CefrLevel, number> = (() => {
  const out: Record<CefrLevel, number> = { A1: 0, A2: 0, B1: 0, B2: 0, C1: 0 }
  for (const row of ROWS) out[row[5]] += 1
  return out
})()
