/**
 * [查询 Query · 板块三] 离线词典与短语书
 * ------------------------------------------------------------------
 * - 内置两包（英语核心 / 俄语基础）：默认就能查（bundle 内置，零网络）；
 * - 【下载】把整包写进独立 IndexedDB 库，刷新后「已下载」持久化，真正离线可用；
 * - 搜索走 dictionaryDb.searchEntries 内存索引（精确→前缀→包含），支持词形 / 释义 / 转写；
 * - 朗读用 speak(text, settings, lang)：全局语言为 ru 时用 ru-RU，缺语音包给 toast 提示。
 */
import { useEffect, useMemo, useState } from 'react'
import { QUERY_DICT_PACKS, type QueryDictPack } from '../../data/queryDictionaries'
import {
  downloadPack, listDownloadedPacks, searchEntries, toStoredPack,
  type StoredDictPack,
} from '../../lib/dictionaryDb'
import { speak, hasVoiceForLang } from '../../lib/speech'
import { Chip, Icon } from '../ui'
import type { Settings } from '../../types'

export function OfflineDict({ lang, settings, notify }: {
  lang: 'en' | 'ru'
  settings: Settings
  notify: (message: string) => void
}) {
  const [downloaded, setDownloaded] = useState<string[]>([])
  const [activePack, setActivePack] = useState<string>(lang === 'ru' ? 'ru_basic' : 'en_core')
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<ReturnType<typeof searchEntries>>([])

  useEffect(() => {
    let alive = true
    void listDownloadedPacks().then((packs) => {
      if (!alive) return
      setDownloaded(packs.map((p) => p.id))
    })
    return () => { alive = false }
  }, [])

  // 全局语言切换时，自动切到对应语言的词典
  useEffect(() => {
    setActivePack(lang === 'ru' ? 'ru_basic' : 'en_core')
    setQuery(''); setHits([])
  }, [lang])

  const pack = useMemo(() => QUERY_DICT_PACKS.find((p) => p.id === activePack) ?? QUERY_DICT_PACKS[0], [activePack])

  const doSearch = (value: string) => {
    setQuery(value)
    setHits(searchEntries(pack.entries, value, 20))
  }

  const doDownload = async (p: QueryDictPack) => {
    // 乐观更新：先写库，成功才标已下载
    const ok = await downloadPack(p)
    if (!ok) { notify('下载失败：当前浏览器不支持离线存储，内置词条仍可直接查询。'); return }
    setDownloaded((prev) => prev.includes(p.id) ? prev : [...prev, p.id])
    notify(`《${p.name}》已保存到本机，离线可查。`)
  }

  const readAloud = (word: string) => {
    const targetLang = lang === 'ru' ? 'ru-RU' : 'en-US'
    if (targetLang === 'ru-RU' && !hasVoiceForLang('ru-RU')) {
      notify('当前设备未安装俄语语音包，无法朗读俄语单词。')
      return
    }
    speak(word, settings, targetLang)
  }

  return (
    <section data-testid="query-dict" className="space-y-3">
      <div>
        <h2 className="text-sm font-bold text-ink">离线词典与短语书</h2>
        <p className="mt-0.5 text-[11px] text-muted">内置词条零网络可查；下载后持久化到本机 IndexedDB</p>
      </div>

      {/* 词典包下载列表 */}
      <div className="space-y-2">
        {QUERY_DICT_PACKS.map((p) => {
          const done = downloaded.includes(p.id)
          const active = activePack === p.id
          return (
            <div key={p.id} data-testid={`query-dict-pack-${p.id}`}
              className={`flex items-center gap-3 rounded-2xl border p-3 ${active ? 'border-brand-300 bg-brand-50/50' : 'border-brand-50 bg-white'}`}>
              <span className="text-xl" aria-hidden="true">{p.emblem}</span>
              <button type="button" onClick={() => { setActivePack(p.id); setQuery(''); setHits([]) }}
                className="min-w-0 flex-1 text-left">
                <p className="truncate text-[13px] font-bold text-ink">{p.name}</p>
                <p className="truncate text-[10px] text-muted">{p.subtitle} · {p.count} 词</p>
              </button>
              {done ? (
                <span data-testid={`query-dict-done-${p.id}`} className="inline-flex min-h-[44px] items-center gap-1 rounded-2xl bg-mint-100 px-3 text-[11px] font-bold text-mint-600">
                  <Icon name="check" size={14} />已下载
                </span>
              ) : (
                <button type="button" data-testid={`query-dict-download-${p.id}`} onClick={() => void doDownload(p)}
                  className="inline-flex min-h-[44px] items-center gap-1 rounded-2xl border border-brand-100 bg-white px-3 text-[11px] font-bold text-brand-600 transition hover:bg-brand-50">
                  <Icon name="download" size={14} />下载
                </button>
              )}
            </div>
          )
        })}
      </div>

      {/* 浏览器式搜索：输入框 + 结果列表 */}
      <div className="rounded-2xl border border-brand-50 bg-white p-3">
        <div className="flex items-center gap-2 rounded-xl bg-brand-50/50 px-3">
          <Icon name="search" size={17} className="text-brand-500" />
          <input
            data-testid="query-dict-search"
            value={query}
            onChange={(e) => doSearch(e.target.value)}
            placeholder={pack.lang === 'ru' ? '输入俄语单词 / 中文释义 / 转写…' : '输入英文单词 / 中文释义…'}
            className="min-h-[46px] w-full bg-transparent text-sm text-ink outline-none placeholder:text-muted/60"
          />
          {query && (
            <button type="button" aria-label="清空搜索" onClick={() => doSearch('')} className="text-muted">
              <Icon name="close" size={16} />
            </button>
          )}
        </div>

        {query.trim() === '' ? (
          <p className="py-4 text-center text-[11px] text-muted">输入关键词，实时检索本地词库</p>
        ) : hits.length === 0 ? (
          <p data-testid="query-dict-empty" className="py-4 text-center text-[11px] text-muted">没有找到匹配词条，试试别的拼写或中文线索</p>
        ) : (
          <ul data-testid="query-dict-results" className="mt-2 divide-y divide-brand-50">
            {hits.map((hit, i) => (
              <li key={`${hit.matched}-${i}`} data-testid="query-dict-hit" className="flex items-start gap-2 py-2.5">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-baseline gap-2">
                    <span className="text-sm font-bold text-ink">{hit.w}</span>
                    {hit.phonetic && <span className="text-[11px] text-muted">{hit.phonetic}</span>}
                    <Chip tone="brand" className="!px-1.5 !py-0 !text-[9px]">{hit.pos}</Chip>
                  </div>
                  <p className="mt-0.5 text-[12px] text-brand-600">{hit.meaning}</p>
                  {hit.example && (
                    <p className="mt-1 text-[11px] italic leading-relaxed text-muted">{hit.example} — {hit.exampleCn}</p>
                  )}
                </div>
                <button type="button" data-testid="query-dict-speak" aria-label={`朗读 ${hit.w}`} onClick={() => readAloud(hit.w)}
                  className="inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600 transition hover:bg-brand-100">
                  <Icon name="speaker" size={17} />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
      <p className="text-[10px] leading-relaxed text-muted">
        {downloaded.includes(pack.id)
          ? '该词包已保存到本机，断网也能查。'
          : '当前使用 bundle 内置的轻量词条；点「下载」可持久化到本机。'}
        {' '}朗读遵循全局语言设置（{lang === 'ru' ? 'ru-RU' : 'en-US'}）。
      </p>
    </section>
  )
}
