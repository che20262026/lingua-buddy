import type { ReactNode } from 'react'
import { ErrorBoundary } from './components/ErrorBoundary'
import { Layout } from './components/Layout'
import { useApp } from './store/useAppStore'
import type { View } from './types'
import { Home } from './pages/Home'
import { Analysis } from './pages/Analysis'
import { ScenarioDetail } from './pages/ScenarioDetail'
import { Dialogue } from './pages/Dialogue'
import { Report } from './pages/Report'
import { Review } from './pages/Review'
/** [任务B] 成长 + 进度合并页（progress / growth / achievements 三路径共用） */
import { GrowthHub } from './pages/GrowthHub'
import { Settings } from './pages/Settings'
/** [新增] 文学长廊五个页面，原有 8 个页面一个不动 */
import { Library } from './pages/Library'
import { BookDetail } from './pages/BookDetail'
import { Reader } from './pages/Reader'
import { Seminar } from './pages/Seminar'
import { ReadingProgress } from './pages/ReadingProgress'
/** [修改点] 文化长街四个页面，原有 13 个页面一个不动 */
import { CultureHub } from './pages/CultureHub'
import { WatchPage } from './pages/WatchPage'
import { PostWatch } from './pages/PostWatch'
import { CultureReview } from './pages/CultureReview'
/** [新增] 词场（Word Lab）四个页面 */
import { WordLabHome } from './pages/WordLabHome'
import { DeckPicker } from './pages/DeckPicker'
import { WordSession } from './pages/WordSession'
import { ErrorBook } from './pages/ErrorBook'
/** [China Learner Track] 资源库首页与单元练习页：不新增底部导航项 */
import { ChinaTrackHome } from './pages/ChinaTrackHome'
import { ChinaUnitPage } from './pages/ChinaUnitPage'
/** [新增] 大肥鱼自由对话：独立闲聊沙盒视图 */
import { FreeTalk } from './pages/FreeTalk'
/** [新增] 查询 Query：音视频翻译 / OCR 解析 / 离线词典，从首页入口进入 */
import { Query } from './pages/Query'

const PAGES: Record<View, ReactNode> = {
  home: <Home />,
  analysis: <Analysis />,
  scenario: <ScenarioDetail />,
  dialogue: <Dialogue />,
  report: <Report />,
  review: <Review />,
  /** [任务B] 成长 + 进度合并页：progress / growth / achievements 三个旧路径都渲染同一合并页 */
  progress: <GrowthHub />,
  settings: <Settings />,
  /** [修改点] 追加 5 条文学映射 + 4 条文化映射 + 4 条词场映射 */
  library: <Library />,
  bookDetail: <BookDetail />,
  reader: <Reader />,
  seminar: <Seminar />,
  readingProgress: <ReadingProgress />,
  cultureHub: <CultureHub />,
  watch: <WatchPage />,
  postWatch: <PostWatch />,
  cultureReview: <CultureReview />,
  /** [新增] 词场四个视图（WordReview 并入既有复习页的「词场」tab） */
  wordLab: <WordLabHome />,
  deckPicker: <DeckPicker />,
  wordSession: <WordSession />,
  errorBook: <ErrorBook />,
  /** [任务B] 成长/进度/成就 三个旧视图全部指向合并页，默认 Tab 由 GrowthHub 内 view 判定 */
  growth: <GrowthHub />,
  achievements: <GrowthHub />,
  /** [China Learner Track] 两个新视图 */
  chinaTrack: <ChinaTrackHome />,
  chinaUnit: <ChinaUnitPage />,
  /** [新增] 大肥鱼自由对话：独立闲聊沙盒 */
  freeTalk: <FreeTalk />,
  /** [新增] 查询 Query：三 Tab 工具页，不占底部导航 */
  query: <Query />,
}

/**
 * [全局错误边界 · 双层] 最外层终结白屏，内层保住离线功能。
 *
 * 外层（screen）：任何未捕获异常都不会让应用变成一片空白，
 *   而是落下那张气鼓鼓的小脸 + 「重新加载」。
 * 内层（inline）：罩在「当前页面内容」外面，只兜当前模块。
 *   某个模块崩了，其它模块照常可用——词场 / 复习 / 阅读这些离线功能
 *   不会被一次崩溃拖下水。配合 resetKey={view}：切换视图时自动清空
 *   错误状态，于是「对话崩了 → 点词场」能立刻回到正常。
 *
 * 原有 25 条视图映射、useApp() 与 Layout 结构一字未动。
 */
export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  )
}

function AppContent() {
  const { view, navigate } = useApp()
  return (
    <Layout>
      <ErrorBoundary
        variant="inline"
        resetKey={view}
        onExit={() => navigate('home')}
        exitLabel="返回首页"
      >
        {PAGES[view]}
      </ErrorBoundary>
    </Layout>
  )
}
