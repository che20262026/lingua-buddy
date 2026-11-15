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
import { Progress } from './pages/Progress'
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
/** [成长系统] 成长页与成就页：两个新视图，原有 23 条映射一条不动 */
import { GrowthHome } from './pages/GrowthHome'
import { AchievementsPage } from './pages/AchievementsPage'
/** [China Learner Track] 资源库首页与单元练习页：不新增底部导航项 */
import { ChinaTrackHome } from './pages/ChinaTrackHome'
import { ChinaUnitPage } from './pages/ChinaUnitPage'

const PAGES: Record<View, ReactNode> = {
  home: <Home />,
  analysis: <Analysis />,
  scenario: <ScenarioDetail />,
  dialogue: <Dialogue />,
  report: <Report />,
  review: <Review />,
  progress: <Progress />,
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
  /** [成长系统] 两个新视图 */
  growth: <GrowthHome />,
  achievements: <AchievementsPage />,
  /** [China Learner Track] 两个新视图 */
  chinaTrack: <ChinaTrackHome />,
  chinaUnit: <ChinaUnitPage />,
}

/**
 * [全局错误边界] 最外层只做一件事：把整棵应用树罩进安全气囊。
 * 原有 31 条视图映射、useApp() 与 Layout 结构一字未动，
 * 只是收进 AppContent，成为 ErrorBoundary 的子节点。
 */
export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  )
}

function AppContent() {
  const { view } = useApp()
  return <Layout>{PAGES[view]}</Layout>
}
