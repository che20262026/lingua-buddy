import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import { AppProvider } from './store/useAppStore'
import { ErrorBoundary } from './components/ErrorBoundary'
import './index.css'

/**
 * [全局错误边界] 根部兜底：连 AppProvider 自身初始化异常也不会白屏；
 * App.tsx 里还有一层主边界，负责罩住全部页面子树。两层都是纯 UI 结构。
 */
ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary>
      <AppProvider>
        <App />
      </AppProvider>
    </ErrorBoundary>
  </React.StrictMode>,
)
