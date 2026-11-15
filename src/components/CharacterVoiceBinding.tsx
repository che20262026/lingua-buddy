/**
 * CharacterVoiceBinding —— 角色音色绑定
 *
 * 规则：
 *   - 多角色场景默认一人一个音色（可用音色 ≥ 角色数时）；
 *   - 音色不足时按顺序复用，并在角色卡上明确标注「与其他角色共用音色」；
 *   - 用户手动指定的绑定优先，且跳级 / 留级不影响绑定；
 *   - 绑定持久化到 `lingua_voice_preferences` 的 perCharacter。
 */

import { useState } from 'react'
import { useApp } from '../store/useAppStore'
import { Avatar, Chip, Icon } from './ui'
import { accentLabel, characterVoiceKey, type VoiceInfo } from '../voiceTypes'
import { applyCharacterVoice, voicesForAccent } from '../services/voicePreferences'

export interface CharacterVoiceBindingProps {
  sceneId: string
  characterId: string
  characterName: string
  /** 该角色的标题 / 身份 */
  role?: string
  /** 当前设备可用音色 */
  voices: VoiceInfo[]
  /** 当前偏好（用于取口音筛选与全局音色） */
  accent: string
  globalVoiceURI: string
}

export function CharacterVoiceBinding({
  sceneId, characterId, characterName, role, voices, accent, globalVoiceURI,
}: CharacterVoiceBindingProps) {
  const app = useApp()
  const [open, setOpen] = useState(false)
  const perCharacter = app.data.voicePreferences.perCharacter
  const key = characterVoiceKey(sceneId, characterId)
  const binding = perCharacter[key]

  const candidates = voicesForAccent(voices, accent as never)
  const current = binding?.voiceURI
    ? voices.find((v) => v.voiceURI === binding.voiceURI)
    : voices.find((v) => v.voiceURI === globalVoiceURI)

  // 是否与其他角色共用同一音色
  const prefix = `${sceneId}:`
  const shared = (() => {
    if (!binding?.voiceURI) return false
    const same = Object.entries(perCharacter)
      .filter(([k]) => k.startsWith(prefix))
      .filter(([, v]) => v.voiceURI === binding.voiceURI)
    return same.length > 1
  })()

  return (
    <div data-testid={`character-voice-${characterId}`} className="rounded-2xl border border-brand-100 bg-white/80 p-2.5">
      <div className="flex items-center gap-2">
        <Avatar name={characterName} size={26} tone="coral" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[11px] font-bold text-ink">{characterName}{role ? ` · ${role}` : ''}</p>
          <p className="mt-0.5 truncate text-[10px] text-muted">
            {current ? `${current.name} · ${accentLabel(current.lang)}` : '跟随全局音色'}
          </p>
        </div>
        {shared && (
          <Chip tone="sun" className="!px-1.5 !py-0.5 !text-[9px]">与其他角色共用音色</Chip>
        )}
        <button type="button" onClick={() => setOpen((v) => !v)}
          aria-label={`为 ${characterName} 选择音色`}
          data-testid={`character-voice-toggle-${characterId}`}
          className="shrink-0 rounded-lg px-2 py-1 text-[10px] font-bold text-brand-600 hover:bg-brand-100">
          {open ? '收起' : '选音色'}
        </button>
      </div>

      {open && (
        <div className="mt-2 space-y-1 border-t border-brand-50 pt-2">
          <button type="button"
            onClick={() => { applyCharacterVoice(app, sceneId, characterId, ''); setOpen(false) }}
            data-testid={`character-voice-clear-${characterId}`}
            className={`block w-full rounded-xl px-2 py-1.5 text-left text-[10px] ${
              !binding?.voiceURI ? 'bg-brand-50 font-bold text-brand-700' : 'bg-white/70 text-muted hover:bg-brand-50'}`}>
            跟随全局音色
          </button>
          {candidates.map((v) => {
            const active = binding?.voiceURI === v.voiceURI
            return (
              <button key={v.voiceURI} type="button"
                onClick={() => { applyCharacterVoice(app, sceneId, characterId, v.voiceURI); setOpen(false) }}
                data-testid={`character-voice-option-${characterId}-${v.voiceURI}`}
                className={`flex w-full items-center gap-1.5 rounded-xl px-2 py-1.5 text-left text-[10px] ${
                  active ? 'bg-brand-50 font-bold text-brand-700' : 'bg-white/70 text-muted hover:bg-brand-50'}`}>
                <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${active ? 'bg-brand-500' : 'bg-slate-200'}`} />
                <span className="min-w-0 flex-1 truncate">{v.name}</span>
                <span className="shrink-0 opacity-70">{accentLabel(v.lang)}</span>
              </button>
            )
          })}
          {candidates.length === 0 && (
            <p className="px-2 py-1.5 text-[10px] text-muted">
              当前设备没有可用音色，角色会沿用浏览器默认音色。
            </p>
          )}
        </div>
      )}
    </div>
  )
}

/** 角色列表（多角色场景的音色分配总览） */
export function CharacterVoiceList(props: {
  sceneId: string
  characters: Array<{ id: string; name: string; role?: string }>
  voices: VoiceInfo[]
  accent: string
  globalVoiceURI: string
}) {
  const { sceneId, characters, voices, accent, globalVoiceURI } = props
  if (!characters.length) return null
  return (
    <section className="space-y-1.5">
      <p className="flex items-center gap-1.5 text-[11px] font-bold text-ink">
        <Icon name="headphones" size={13} />角色音色
      </p>
      {characters.map((c) => (
        <CharacterVoiceBinding
          key={c.id}
          sceneId={sceneId}
          characterId={c.id}
          characterName={c.name}
          role={c.role}
          voices={voices}
          accent={accent}
          globalVoiceURI={globalVoiceURI}
        />
      ))}
    </section>
  )
}
