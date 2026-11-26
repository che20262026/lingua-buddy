/**
 * [查询 Query] 独立模块主页
 * ------------------------------------------------------------------
 * 三 Tab：音视频 AI 翻译 / 拍照文字识别 / 离线词典。
 * 全局语言联动：读 data.settings.wordLanguage（en 默认 / ru）。
 *  - 翻译源语言与 system prompt 按语种切换；
 *  - OCR 识别语言按语种切换；
 *  - 词典 TTS 用 en-US / ru-RU。
 * 纯 state 机：从首页 navigate('query') 进入，返回用 navigate('home')。不占底栏。
 */
import { useState } from 'react'
import { useApp } from '../store/useAppStore'
import { Icon } from '../components/ui'
import { LanguageSwitcher } from '../components/LanguageSwitcher'
import { MediaTranslator } from '../components/query/MediaTranslator'
import { OCRTranslator } from '../components/query/OCRTranslator'
import { OfflineDict } from '../components/query/OfflineDict'

type QueryTab = 'media' | 'ocr' | 'dict'

const TABS: Array<{ id: QueryTab; label: string; icon: 'translate' | 'camera' | 'dictionary' }> = [
  { id: 'media', label: '音视频翻译', icon: 'translate' },
  { id: 'ocr', label: '拍照解析', icon: 'camera' },
  { id: 'dict', label: '离线词典', icon: 'dictionary' },
]

export function Query() {
  const { data, navigate, notify } = useApp()
  const [tab, setTab] = useState<QueryTab>('media')
  const lang = data.settings.wordLanguage ?? 'en'

  return (
    <div data-testid="query-page" className="min-h-screen bg-[#f7f8fb] px-4 pb-32 pt-5 sm:px-6">
      <div className="mx-auto max-w-[640px]">
        {/* 顶部：返回 + 标题 + 语言徽标 */}
        <div className="mb-4 flex items-center gap-3">
          <button type="button" data-testid="query-back" onClick={() => navigate('home')}
            aria-label="返回首页"
            className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-2xl bg-white text-brand-600 shadow-sm transition hover:bg-brand-50">
            <Icon name="left" size={18} />
          </button>
          <div className="min-w-0 flex-1">
            <h1 className="text-lg font-black text-ink">查询工具</h1>
            <p className="text-[11px] text-muted">听懂 · 看懂 · 查懂，一站式语言助手</p>
          </div>
          {/* 右上角语言切换：与设置页共用同一状态控件，点击即切并立即联动三个 Tab */}
          <LanguageSwitcher
            buttonTestId="query-lang-badge"
            sheetTestId="query-lang-sheet"
            optionTestIdPrefix="query-lang"
          />
        </div>

        {/* 下划线高亮 Tab */}
        <div data-testid="query-tabs" role="tablist" className="mb-4 flex gap-1 border-b border-brand-100">
          {TABS.map((t) => {
            const active = tab === t.id
            return (
              <button key={t.id} type="button" role="tab" aria-selected={active}
                data-testid={`query-tab-${t.id}`}
                onClick={() => setTab(t.id)}
                className={`flex min-h-[48px] flex-1 items-center justify-center gap-1.5 border-b-2 px-2 text-[13px] font-bold transition ${
                  active ? 'border-brand-500 text-brand-600' : 'border-transparent text-muted hover:text-brand-500'
                }`}>
                <Icon name={t.icon} size={16} />{t.label}
              </button>
            )
          })}
        </div>

        <div className="rounded-3xl bg-white/80 p-4 shadow-card">
          {tab === 'media' && <MediaTranslator lang={lang} settings={data.settings} />}
          {tab === 'ocr' && <OCRTranslator lang={lang} />}
          {tab === 'dict' && <OfflineDict lang={lang} settings={data.settings} notify={notify} />}
        </div>
      </div>
    </div>
  )
}
