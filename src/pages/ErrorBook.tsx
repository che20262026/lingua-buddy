import { useState } from 'react'
import { useApp } from '../store/useAppStore'
import { compareSpelling, maskTargetWord } from '../lib/wordLabFlow'
import { findWord } from '../data/wordDecks'
import { speak } from '../lib/speech'
import { Card, Chip, EmptyState, Icon, SectionTitle } from '../components/ui'
import { formatDate } from '../lib/utils'

/**
 * 易错本：猜错词义 / 拼错的词自动收录。
 * 连续拼对 2 次自动标记「已攻克」；也可手动移除。
 */
export function ErrorBook() {
  const { data, update, navigate, notify } = useApp()
  const [active, setActive] = useState<string | null>(null)
  const [input, setInput] = useState('')
  const [wrong, setWrong] = useState(false)

  const list = [...data.wordErrors].sort((a, b) => Number(a.resolved) - Number(b.resolved) || b.createdAt - a.createdAt)
  const pending = list.filter((e) => !e.resolved).length
  /** 展开重拼时，同词的所有记录都遮蔽词形——避免旁边那条「猜错词义」正好把答案摆出来 */
  const activeEntry = active ? list.find((e) => e.id === active) : undefined
  const hiddenWord = activeEntry?.word ?? null

  const submit = (word: string, id: string) => {
    if (!input.trim()) return
    const result = compareSpelling(word, input)
    if (!result.correct) { setWrong(true); return }
    setWrong(false)
    setInput('')
    setActive(null)
    update((prev) => ({
      ...prev,
      wordErrors: prev.wordErrors.map((e) => {
        if (e.id !== id) return e
        const count = e.resolveCount + 1
        return { ...e, resolveCount: count, resolved: count >= 2 }
      }),
    }))
    notify('拼对了！再连对一次就能销账 ✨')
  }

  return (
    <div className="animate-in space-y-5">
      <button type="button" onClick={() => navigate('wordLab')}
        className="flex items-center gap-1.5 text-xs font-bold text-brand-600 hover:text-brand-800">
        <Icon name="left" size={14} />返回词场首页
      </button>

      <Card>
        <SectionTitle title="易错本" subtitle="猜错词义、拼错字母都会自动收进来；连对两次自动销账。"
          right={<Chip tone={pending ? 'coral' : 'mint'}>{pending ? `${pending} 个待攻克` : '全部攻克'}</Chip>} />
        {list.length === 0 ? (
          <EmptyState emblem="🧩" title="易错本干干净净" desc="学习时拼错或猜错的词会自动出现在这里，不手动添加。" />
        ) : (
          <div className="space-y-2.5">
            {list.map((e) => {
              const entry = findWord(e.word)
              const open = active === e.id
              const masked = hiddenWord === e.word
              return (
                <div key={e.id} className={`rounded-2xl border p-3.5 ${e.resolved ? 'border-mint-100 bg-mint-50/50 opacity-75' : 'border-white/80 bg-white/70'}`}>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <p className="en-text font-display text-base font-black text-ink">{masked ? '••••' : e.word}</p>
                        <Chip tone={e.resolved ? 'mint' : e.type === 'guess' ? 'sun' : 'coral'}>
                          {e.resolved ? '已攻克' : e.type === 'guess' ? '猜错词义' : '拼写易错'}
                        </Chip>
                        {!e.resolved && e.resolveCount > 0 && <Chip tone="brand">连对 {e.resolveCount}/2</Chip>}
                      </div>
                      <p className="mt-1 text-[11px] leading-relaxed text-muted">
                        当时的答案：{masked ? '••••' : e.detail} · {entry ? maskTargetWord(entry.meaningZh, e.word) : '生词'} · {formatDate(e.createdAt)}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button type="button" onClick={() => { try { speak(e.word, data.settings) } catch { /* noop */ } }}
                        aria-label="朗读" className="rounded-lg p-1.5 text-brand-500 hover:bg-brand-50"><Icon name="speaker" size={15} /></button>
                      <button type="button" onClick={() => update((prev) => ({ ...prev, wordErrors: prev.wordErrors.filter((x) => x.id !== e.id) }))}
                        aria-label="移除" className="rounded-lg p-1.5 text-muted hover:bg-coral-50 hover:text-coral-600"><Icon name="close" size={15} /></button>
                    </div>
                  </div>
                  {!e.resolved && (
                    <div className="mt-2.5">
                      {open ? (
                        <div className="rounded-xl bg-white/80 p-2.5">
                          <p className="mb-2 text-[10px] font-bold text-brand-600">书写模式：已隐藏词形，凭释义和发音回忆</p>
                          <input className="field en-text" value={input} autoComplete="off" spellCheck={false}
                            onChange={(ev) => { setInput(ev.target.value); setWrong(false) }}
                            onKeyDown={(ev) => { if (ev.key === 'Enter') submit(e.word, e.id) }}
                            placeholder="重新拼写这个单词（不显示词形）" />
                          {wrong && <p className="mt-1.5 text-[10px] font-bold text-coral-600">还差一点，再听一遍发音提示再试 🌱</p>}
                          <button type="button" onClick={() => submit(e.word, e.id)} className="btn-primary mt-2 w-full !py-2 !text-[11px]">提交拼写</button>
                        </div>
                      ) : (
                        <button type="button" onClick={() => { setActive(e.id); setInput(''); setWrong(false) }}
                          className="btn-ghost w-full !py-2 !text-[11px]">
                          <Icon name="edit" size={13} />重拼这个词
                        </button>
                      )}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )}
      </Card>

      <div className="rounded-2xl bg-white/60 p-4 text-center text-[11px] leading-relaxed text-muted">
        易错本只影响「词场」里的复习顺序，不额外占用每日新词额度。
      </div>
    </div>
  )
}
