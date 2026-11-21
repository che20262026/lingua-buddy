import { useState, useEffect } from 'react'
import { useApp } from '../store/useAppStore'
import { describeSpeechSupport, speak, speechSupported } from '../lib/speech'
import { isAsrConfigured } from '../services/transcriber'
import type { CEFR, Settings as SettingsType } from '../types'
import type { GuidanceStrength, ReadingViewMode } from '../literaryTypes'
import type { CaptionPreference } from '../cultureTypes'
import { Chip, Icon, Modal, Toggle } from '../components/ui'
/** [设置页重构] 系统设置风格分组列表原子：灰底白卡 + 行式图标/开关/箭头 */
import { SettingsGroup, SettingsInline, SettingsRow } from '../components/SettingsBits'
import { VoiceDiagnostics } from '../components/VoiceDiagnostics'
/** [China Learner Track] 省份配置在设置页与资源库首页共用同一组件 */
import { ProvinceConfig } from '../components/ProvinceConfig'
import {
  IeltsDialogueSpec, IeltsLadder, IeltsLevelHeader, IeltsUpgradeExample,
} from '../components/IeltsBits'
import { getIeltsLevel, IELTS_DIMENSIONS, ieltsLevelByCefr, type IeltsLevelId } from '../data/ieltsLevels'
/** [对话语音层] 音色偏好读写 + 试听句 + 真实音色加载 */
import { applyAutoRead, applyVoiceGlobal } from '../services/voicePreferences'
import { AUDITION_SAMPLE } from '../components/VoicePanel'
import { useSpeech } from '../hooks/useSpeech'
import type { VoiceAccentKey } from '../voiceTypes'
/** [云同步] 账号与云同步卡片；未配置环境变量时自动降级为纯本地提示 */
import { CloudSyncCard } from '../components/CloudSyncCard'
/** [真实 AI] 当前接入模式徽章：GET /.netlify/functions/chat 探测 + 会话内强制 Mock 开关 */
import { AiModeBadge } from '../components/AiModeBadge'
/** [本地联调] 复用同一探测（60s 缓存，零额外网络请求）：后端 .env 就绪时不必再手填 Key */
import { probeAiMode, type AiStatus } from '../services/aiStatus'
import { useAbortableRequest } from '../hooks/useAbortableRequest'

const LEVELS: CEFR[] = ['A1', 'A2', 'B1', 'B2', 'C1']
const LEVEL_DESC: Record<CEFR, string> = {
  A1: '入门 · 短句、常用词', A2: '基础 · 简单日常交流', B1: '进阶 · 能讲清想法',
  B2: '熟练 · 表达更丰富', C1: '自如 · 讨论抽象话题',
}
const ACCENTS: Array<{ value: SettingsType['accent']; label: string }> = [
  { value: 'en-US', label: '美式 English (US)' },
  { value: 'en-GB', label: '英式 English (UK)' },
  { value: 'en-AU', label: '澳式 English (AU)' },
]

/** [对话语音层] 朗读口音偏好：比识别口音多两档，与对话页的音色面板同源 */
const VOICE_ACCENTS: Array<{ value: VoiceAccentKey; label: string }> = [
  { value: 'en-US', label: '美音' },
  { value: 'en-GB', label: '英音' },
  { value: 'en-AU', label: '澳音' },
  { value: 'en-other', label: '其他英语口音' },
  { value: 'system', label: '跟随系统默认' },
]

export function Settings() {
  const app = useApp()
  const { data, update, resetAll, notify, navigate } = app
  const { settings, profile } = data
  /** [对话语音层] 音色偏好与朗读状态（设置页与对话页同源） */
  const voicePrefs = data.voicePreferences
  const speech = useSpeech()
  const [clearStep, setClearStep] = useState(0)
  const activeLevel = getIeltsLevel(settings.ieltsLevel)

  /**
   * [本地联调] 服务端 .env 是否已就绪：复用 AiModeBadge 的探测（60s 内存缓存），
   * 不新增 localStorage 键、不改被 FROZEN 锁定的 aiStatus.ts。
   * mode==='live' 时下方「对话生成引擎」不再要求用户手填 API 地址 / Key。
   */
  const [aiStatus, setAiStatus] = useState<AiStatus | null>(null)
  const { nextSignal, isMounted } = useAbortableRequest()
  useEffect(() => {
    let alive = true
    const signal = nextSignal()
    void probeAiMode(false, signal).then((status) => {
      if (!alive || !isMounted()) return
      setAiStatus(status)
      /**
       * [联调一致性] 服务端 .env 就绪时，把遗留的 custom 直连配置翻回 mock：
       * configureGenerator 只认 apiMode，若不翻回，浏览器仍会用 localStorage 里的
       * 旧 apiKey 直连，界面却显示「ENV READY」——错误就绪信号。
       * 只改 apiMode 的值，保留 apiEndpoint/apiKey/apiModel 原值不毁用户数据；
       * 值未变时返回同一引用，store 的 setData 会 bail，不触发多余重渲染。
       */
      if (status.mode === 'live') {
        update((prev) => prev.settings.apiMode === 'custom'
          ? { ...prev, settings: { ...prev.settings, apiMode: 'mock' } }
          : prev)
      }
    })
    return () => { alive = false }
  }, [nextSignal, isMounted, update])
  const serverEnvReady = aiStatus?.mode === 'live'

  const patchSettings = (patch: Partial<SettingsType>) => {
    update((prev) => ({ ...prev, settings: { ...prev.settings, ...patch } }))
  }
  const patchProfile = (patch: Partial<typeof profile>) => {
    update((prev) => ({ ...prev, profile: { ...prev.profile, ...patch } }))
  }

  /** 选雅思档 → 同步 CEFR、纠错强度、档案难度；一次写入避免状态竞态 */
  const selectIeltsLevel = (id: IeltsLevelId) => {
    const level = getIeltsLevel(id)
    update((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        ieltsLevel: id,
        difficulty: level.cefr,
        correction: level.dialogue.correction,
      },
      profile: { ...prev.profile, cefr: level.cefr },
    }))
    notify(`目标档位设为 IELTS ${level.band} · ${level.name}，难度与纠错已联动 ✨`)
  }

  /** 选 CEFR → 反向匹配最接近的雅思档 */
  const selectCefr = (cefr: CEFR) => {
    const level = ieltsLevelByCefr(cefr)
    update((prev) => ({
      ...prev,
      settings: {
        ...prev.settings,
        difficulty: cefr,
        ieltsLevel: level.id,
        correction: level.dialogue.correction,
      },
      profile: { ...prev.profile, cefr },
    }))
  }

  return (
    <div className="animate-in settings-page -mx-2 px-2 pt-1">
      <div className="px-2 pb-3">
        <h1 className="font-display text-2xl font-black text-ink">设置</h1>
        <p className="mt-1 text-xs leading-relaxed text-muted">把难度、语音和反馈调成最舒服的样子。所有设置都保存在本机。</p>
      </div>

      {/* 我的档案 */}
      <SettingsGroup>
        <SettingsRow emoji="👤" iconTone="blue" title="我的档案" subtitle="昵称会显示在右上角头像里。" />
        <SettingsInline>
          <label className="block text-xs font-bold text-ink">昵称
            <input className="field mt-1.5" value={profile.nickname} maxLength={20}
              onChange={(e) => patchProfile({ nickname: e.target.value })} placeholder="Explorer" />
          </label>
          <label className="mt-4 block text-xs font-bold text-ink">每日 XP 目标
            <span className="mt-2 flex items-center gap-3">
              <input type="range" min={10} max={120} step={5} value={profile.dailyGoal}
                onChange={(e) => patchProfile({ dailyGoal: Number(e.target.value) })} className="flex-1" />
              <Chip tone="brand">{profile.dailyGoal} XP</Chip>
            </span>
          </label>
        </SettingsInline>
      </SettingsGroup>

      {/* 雅思口语目标等级 */}
      <SettingsGroup>
        <SettingsRow icon="trophy" iconTone="sun" title="雅思口语目标等级"
          subtitle="按 IELTS Speaking 官方四项评分维度设计；选档会自动联动 CEFR 难度与纠错强度。"
          value="IELTS" />
        <SettingsInline><IeltsLadder currentId={settings.ieltsLevel} onSelect={selectIeltsLevel} /></SettingsInline>
        <SettingsInline>
          <div className={`rounded-2xl bg-gradient-to-br ${activeLevel.tint} p-4`}>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/80 text-2xl shadow-card">{activeLevel.emblem}</div>
                <div>
                  <p className="font-display text-base font-black text-ink">Band {activeLevel.band} · {activeLevel.name}</p>
                  <p className="text-[11px] font-semibold text-ink/60">{activeLevel.tagline}</p>
                </div>
              </div>
              <IeltsLevelHeader level={activeLevel} />
            </div>
            <p className="mt-3 text-xs leading-relaxed text-ink/75">{activeLevel.summary}</p>
            <div className="mt-3"><IeltsDialogueSpec level={activeLevel} /></div>
          </div>
        </SettingsInline>
        <SettingsInline>
          <p className="mb-2 text-xs font-bold text-ink">四项评分维度的本档目标</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {IELTS_DIMENSIONS.map((d) => (
              <div key={d.key} className="rounded-2xl border border-brand-50 bg-white/70 p-3">
                <p className="text-[11px] font-bold text-brand-600">{d.emblem} {d.zh} <span className="font-normal text-muted">· {d.en}</span></p>
                <p className="mt-1 text-[11px] leading-relaxed text-ink/75">{activeLevel.dimensions[d.key]}</p>
              </div>
            ))}
          </div>
        </SettingsInline>
        <SettingsInline>
          <p className="mb-1.5 text-xs font-bold text-ink">本阶段重点</p>
          <div className="flex flex-wrap gap-1.5">
            {activeLevel.focus.map((f) => <Chip key={f} tone="mint">{f}</Chip>)}
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-muted">达到这一档通常可以：{activeLevel.canDo.join('；')}。</p>
        </SettingsInline>
        <SettingsInline><IeltsUpgradeExample level={activeLevel} /></SettingsInline>
        <SettingsInline>
          <p className="flex items-start gap-1.5 rounded-2xl bg-mint-100/60 p-3 text-[11px] leading-relaxed text-mint-600">
            <Icon name="target" size={14} className="mt-0.5 shrink-0" />{activeLevel.nextTip}
          </p>
        </SettingsInline>
      </SettingsGroup>

      {/* CEFR 难度与纠错 */}
      <SettingsGroup>
        <SettingsRow icon="flag" iconTone="blue" title="CEFR 难度（与雅思档位联动）"
          subtitle="也会同步更新上方目标档；手动微调纠错强度不会被覆盖。" />
        <SettingsInline>
          <div className="grid grid-cols-5 gap-1.5">
            {LEVELS.map((l) => (
              <button key={l} type="button" onClick={() => selectCefr(l)}
                className={`seg-btn rounded-xl px-1 py-2.5 text-xs font-bold transition ${settings.difficulty === l ? 'bg-brand-500 text-white shadow-soft' : 'bg-brand-50 text-brand-600 hover:bg-brand-100'}`}>
                {l}
              </button>
            ))}
          </div>
          <p className="mt-2 text-[11px] text-muted">{LEVEL_DESC[settings.difficulty]}</p>
        </SettingsInline>
        <SettingsInline>
          <p className="text-xs font-bold text-ink">纠错强度</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted">反馈永远温和，只是详细程度不同。</p>
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            {([
              { v: 'gentle', label: '轻轻提点' },
              { v: 'balanced', label: '恰到好处' },
              { v: 'detailed', label: '细致一些' },
            ] as const).map((o) => (
              <button key={o.v} type="button" onClick={() => patchSettings({ correction: o.v })}
                className={`seg-btn rounded-xl px-1 py-2 text-[11px] font-bold transition ${settings.correction === o.v ? 'bg-mint-500 text-white' : 'bg-slate-100 text-muted hover:bg-slate-200'}`}>
                {o.label}
              </button>
            ))}
          </div>
        </SettingsInline>
      </SettingsGroup>

      {/* 语音 */}
      <SettingsGroup>
        <SettingsRow icon="headphones" iconTone="mint" title="语音"
          subtitle={`朗读 ${speechSupported() ? '可用' : '当前浏览器不支持'} · 语音识别 ${describeSpeechSupport().recognition ? '可用' : '不可用，已自动降级为录音转写 / 补写文字 / 文本输入'}`} />
        <SettingsInline>
          <label className="block text-xs font-bold text-ink">对话语速 · {voicePrefs.global.rate.toFixed(2)}x
            <span className="mt-2 flex items-center gap-3">
              <input type="range" min={0.7} max={1.2} step={0.05} value={voicePrefs.global.rate}
                data-testid="settings-voice-rate"
                onChange={(e) => applyVoiceGlobal(app, { rate: Number(e.target.value) })} className="flex-1" />
              <button type="button" onClick={() => speech.audition(AUDITION_SAMPLE)}
                className="btn-ghost !px-3 !py-1.5 !text-xs"><Icon name="speaker" size={14} />试听</button>
            </span>
          </label>
        </SettingsInline>
        <SettingsInline>
          <label className="block text-xs font-bold text-ink">对话默认口音
            <select className="field mt-1.5" value={voicePrefs.global.accent}
              data-testid="settings-voice-accent"
              onChange={(e) => applyVoiceGlobal(app, { accent: e.target.value as VoiceAccentKey })}>
              {VOICE_ACCENTS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
            </select>
            <span className="mt-1 block text-[11px] leading-relaxed text-muted">
              音色数量由设备决定；这里只选口音偏好，具体音色在对话页的「音色」面板里挑。
            </span>
          </label>
        </SettingsInline>
        <SettingsInline>
          <label className="block text-xs font-bold text-ink">识别口音（语音转文字用）
            <select className="field mt-1.5" value={settings.accent} onChange={(e) => patchSettings({ accent: e.target.value as SettingsType['accent'] })}>
              {ACCENTS.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
            </select>
          </label>
        </SettingsInline>
        <SettingsRow icon="text" iconTone="slate" title="显示中文大意" subtitle="对话气泡下方可折叠查看"
          trailing={<Toggle checked={settings.showTranslation} onChange={(v) => patchSettings({ showTranslation: v })} label="显示翻译" />} />
        <SettingsRow icon="play" iconTone="mint" title="自动朗读 AI 回复"
          subtitle="每轮结束后自动播放英文；对话页的扬声器开关与此同步"
          trailing={<Toggle checked={voicePrefs.global.autoRead} onChange={(v) => applyAutoRead(app, v)} label="自动朗读" />} />
      </SettingsGroup>

      {/* 文学研读 */}
      <SettingsGroup>
        <SettingsRow emoji="📖" iconTone="sun" title="文学研读"
          subtitle="只影响「书架 → 阅读 → 研讨」这条新路径，不改变角色对话的任何行为。" />
        <SettingsInline>
          <p className="text-xs font-bold text-ink">阅读视图默认值</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted">进入阅读页时默认使用；阅读页里仍可随时切换原文 / 分级简化 / 双语注释。</p>
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            {([
              { v: 'original', label: '原文' },
              { v: 'simplified', label: '分级简化' },
              { v: 'bilingual', label: '双语注释' },
            ] as Array<{ v: ReadingViewMode; label: string }>).map((o) => (
              <button key={o.v} type="button" onClick={() => patchSettings({ readingView: o.v })}
                className={`seg-btn rounded-xl px-1 py-2 text-[11px] font-bold transition ${settings.readingView === o.v ? 'bg-brand-500 text-white shadow-soft' : 'bg-slate-100 text-muted hover:bg-slate-200'}`}>
                {o.label}
              </button>
            ))}
          </div>
        </SettingsInline>
        <SettingsInline>
          <p className="text-xs font-bold text-ink">研讨引导强度</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted">越强的档位越常追问「原文哪一句支持你的判断」，但永远不给标准答案。</p>
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            {([
              { v: 'light', label: '轻 · 轻轻提点' },
              { v: 'medium', label: '中 · 恰到好处' },
              { v: 'strong', label: '强 · 步步追问' },
            ] as Array<{ v: GuidanceStrength; label: string }>).map((o) => (
              <button key={o.v} type="button" onClick={() => patchSettings({ seminarGuidance: o.v })}
                className={`seg-btn rounded-xl px-1 py-2 text-[11px] font-bold transition ${settings.seminarGuidance === o.v ? 'bg-mint-500 text-white' : 'bg-slate-100 text-muted hover:bg-slate-200'}`}>
                {o.label}
              </button>
            ))}
          </div>
        </SettingsInline>
        <SettingsRow icon="book" iconTone="blue" title="去书架看看"
          onClick={() => window.setTimeout(() => navigate('library'), 0)} />
      </SettingsGroup>

      {/* 文化视角视频 */}
      <SettingsGroup>
        <SettingsRow icon="play" iconTone="coral" title="文化视角视频"
          subtitle="只影响「文化首页 → 观看 → 观后讨论」这条新路径，不改变角色对话或文学研讨的任何行为。" />
        <SettingsInline>
          <p className="text-xs font-bold text-ink">默认字幕偏好</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted">
            只作用于平台官方播放器自带 CC；「中英对照」由应用内短引用卡提供，不下载也不重新渲染字幕全文。
          </p>
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            {([
              { v: 'on', label: '开 · 平台 CC' },
              { v: 'off', label: '关 · 不看字幕' },
              { v: 'bilingual', label: '中英对照' },
            ] as Array<{ v: CaptionPreference; label: string }>).map((o) => (
              <button key={o.v} type="button" onClick={() => patchSettings({ captionPreference: o.v })}
                className={`seg-btn rounded-xl px-1 py-2 text-[11px] font-bold transition ${settings.captionPreference === o.v ? 'bg-brand-500 text-white shadow-soft' : 'bg-slate-100 text-muted hover:bg-slate-200'}`}>
                {o.label}
              </button>
            ))}
          </div>
        </SettingsInline>
        <SettingsRow icon="play" iconTone="mint" title="看完自动进入观后讨论"
          subtitle="点「我已完成观看」后直接跳到讨论页；关闭时由你手动点按钮。"
          trailing={<Toggle checked={settings.autoEnterPostWatch} onChange={(v) => patchSettings({ autoEnterPostWatch: v })} label="看完自动进入观后讨论" />} />
        <SettingsRow icon="play" iconTone="blue" title="去文化首页看看"
          onClick={() => navigate('cultureHub')} />
      </SettingsGroup>

      {/* 词场 */}
      <SettingsGroup>
        <SettingsRow emoji="🔤" iconTone="blue" title="词场 · 主动词库学习"
          subtitle="只影响「词场 → 选库 → 五步学习」这条新路径，不改变对话、文学或文化模块的行为。" />
        <SettingsInline>
          <p className="text-xs font-bold text-ink">每日新词上限</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted">
            硬上限 10-15 个，达到后不再提供「继续学新词」入口；到期复习始终不受限。
          </p>
          <div className="mt-2 grid grid-cols-3 gap-1.5">
            {[10, 12, 15].map((n) => (
              <button key={n} type="button" onClick={() => patchSettings({ wordDailyLimit: n })}
                className={`seg-btn rounded-xl px-1 py-2 text-[11px] font-bold transition ${settings.wordDailyLimit === n ? 'bg-brand-500 text-white shadow-soft' : 'bg-slate-100 text-muted hover:bg-slate-200'}`}>
                每天 {n} 个
              </button>
            ))}
          </div>
        </SettingsInline>
        <SettingsInline>
          <p className="text-xs font-bold text-ink">S3 拼写模式默认值</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted">
            打字模式逐字母比对；手写模式用 Canvas 书写后自评，不做 OCR、完全离线。会话内可临时切换。
          </p>
          <div className="mt-2 grid grid-cols-2 gap-1.5">
            {([
              { v: 'typing', label: '打字拼写' },
              { v: 'handwriting', label: '手写自评' },
            ] as Array<{ v: 'typing' | 'handwriting'; label: string }>).map((o) => (
              <button key={o.v} type="button" onClick={() => patchSettings({ wordSpellingMode: o.v })}
                className={`seg-btn rounded-xl px-1 py-2 text-[11px] font-bold transition ${settings.wordSpellingMode === o.v ? 'bg-mint-500 text-white' : 'bg-slate-100 text-muted hover:bg-slate-200'}`}>
                {o.label}
              </button>
            ))}
          </div>
        </SettingsInline>
        <SettingsRow icon="headphones" iconTone="mint" title="自动发音"
          subtitle="进入每个新词时用浏览器 speechSynthesis 朗读一次，零网络请求。"
          trailing={<Toggle checked={settings.wordAutoSpeak} onChange={(v) => patchSettings({ wordAutoSpeak: v })} label="词场自动发音" />} />
        <SettingsRow icon="text" iconTone="blue" title="显示配图"
          subtitle="关闭后 S2 只显示例句与释义；图片走离线 SVG / emoji 兜底。"
          trailing={<Toggle checked={settings.wordShowImage} onChange={(v) => patchSettings({ wordShowImage: v })} label="词场显示配图" />} />
        <SettingsInline>
          <p className="text-xs font-bold text-ink">S2.5 跟读朗读</p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted">
            跟读的是完整例句；只读「有没有读完整」，不给分数、不做音素评测。演示模式不需要麦克风。
          </p>
        </SettingsInline>
        <SettingsRow icon="play" iconTone="mint" title="自动播放标准音"
          subtitle="进入验证页时自动朗读一遍例句，口音跟随下方选择。"
          trailing={<Toggle checked={settings.wordAutoPlayAudio} onChange={(v) => patchSettings({ wordAutoPlayAudio: v })} label="自动播放标准音" />} />
        <SettingsRow icon="text" iconTone="slate" title="跟读默认展开"
          subtitle="关掉后跟读区域收起，页面上可随时手动展开。"
          trailing={<Toggle checked={settings.wordReadAloudExpanded} onChange={(v) => patchSettings({ wordReadAloudExpanded: v })} label="跟读默认展开" />} />
        <SettingsInline>
          <p className="text-[11px] font-bold text-ink">口音（复用既有朗读设置）</p>
          <div className="mt-1.5 grid grid-cols-3 gap-1.5">
            {([
              { v: 'en-US', label: '美音' },
              { v: 'en-GB', label: '英音' },
              { v: 'en-AU', label: '澳音' },
            ] as Array<{ v: 'en-US' | 'en-GB' | 'en-AU'; label: string }>).map((o) => (
              <button key={o.v} type="button" onClick={() => patchSettings({ accent: o.v })}
                className={`seg-btn rounded-xl px-1 py-2 text-[11px] font-bold transition ${settings.accent === o.v ? 'bg-brand-500 text-white shadow-soft' : 'bg-slate-100 text-muted hover:bg-slate-200'}`}>
                {o.label}
              </button>
            ))}
          </div>
        </SettingsInline>
        <SettingsRow emoji="✨" iconTone="sun" title="去词场看看" onClick={() => navigate('wordLab')} />
      </SettingsGroup>

      {/* 成长系统 */}
      <SettingsGroup>
        <SettingsRow icon="star" iconTone="sun" title="成长系统"
          subtitle="经验值、等级、连续天数与成就都在「成长」页汇总，这里只管显示效果。"
          value="GROWTH" />
        <SettingsRow icon="sparkles" iconTone="mint" title="显示 XP 动画"
          subtitle="获得 XP 时右下角浮出「+N XP」，2 秒后消失，不遮挡输入框。"
          trailing={<Toggle checked={settings.showXpAnimation} onChange={(v) => patchSettings({ showXpAnimation: v })} label="显示 XP 动画" />} />
        <SettingsRow icon="flame" iconTone="sun" title="显示热力图"
          subtitle="成长页展示最近 90 天的活跃热力图；关掉后只保留等级与连续天数。"
          trailing={<Toggle checked={settings.showHeatmap} onChange={(v) => patchSettings({ showHeatmap: v })} label="显示热力图" />} />
        <div className="settings-inline grid grid-cols-2 gap-2">
          <button type="button" onClick={() => navigate('growth')} className="btn-ghost !py-2 !text-xs">去成长页</button>
          <button type="button" onClick={() => navigate('achievements')} className="btn-ghost !py-2 !text-xs">查看成就</button>
        </div>
      </SettingsGroup>

      {/* 本土资源库 */}
      <SettingsGroup>
        <SettingsRow emoji="🧭" iconTone="blue" title="本土资源库"
          subtitle="四个轨道的卡点练习在「学习」页进入；这里只管省份配置。"
          value="去资源库" onClick={() => navigate('chinaTrack')} />
        <SettingsInline><ProvinceConfig /></SettingsInline>
      </SettingsGroup>

      <SettingsGroup>
        <SettingsInline><VoiceDiagnostics /></SettingsInline>
      </SettingsGroup>

      {/* 语音转文字（可选） */}
      <SettingsGroup>
        <SettingsRow icon="mic" iconTone="blue" title="语音转文字（可选）"
          subtitle="默认留空，完全离线。浏览器自带听写失败时，可用录音调用兼容端点补上文字。"
          value={isAsrConfigured(settings) ? '已配置' : '未启用'} />
        <SettingsInline>
          <label className="block text-xs font-bold text-ink">兼容 /audio/transcriptions 地址
            <input className="field mt-1.5" value={settings.asrEndpoint}
              onChange={(e) => patchSettings({ asrEndpoint: e.target.value })}
              placeholder="https://your-endpoint/v1/audio/transcriptions" />
          </label>
          <label className="mt-3 block text-xs font-bold text-ink">API Key（仅存本机浏览器，可留空）
            <input className="field mt-1.5" type="password" value={settings.asrKey} autoComplete="off"
              onChange={(e) => patchSettings({ asrKey: e.target.value })} placeholder="sk-…（本地服务可留空）" />
          </label>
          <label className="mt-3 block text-xs font-bold text-ink">模型名
            <input className="field mt-1.5" value={settings.asrModel}
              onChange={(e) => patchSettings({ asrModel: e.target.value })} placeholder="whisper-1" />
          </label>
          <p className="mt-3 flex items-start gap-1.5 rounded-2xl bg-brand-50/70 p-3 text-[11px] leading-relaxed text-brand-700">
            <Icon name="info" size={14} className="mt-0.5 shrink-0" />
            地址填 base URL、`/v1` 或 `/chat/completions` 都会自动补全到转写路径。只在「录一段并转写」且浏览器听写没拿到文字时才调用；失败会退回手动补写，练习不会中断。
          </p>
        </SettingsInline>
      </SettingsGroup>

      {/* 对话生成引擎 */}
      <SettingsGroup>
        <SettingsRow icon="sparkles" iconTone="coral" title="对话生成引擎"
          subtitle={serverEnvReady
            ? '服务端已从 .env 读取密钥，对话与所有 AI 模块开箱即用，无需在此填写任何地址或密钥。'
            : '默认自动探测 /.netlify/functions/chat；未接入时回退本地 Mock（完全离线、零密钥）。'}
          value={serverEnvReady ? 'ENV READY'
            : settings.apiMode === 'mock' ? 'MOCK' : 'CUSTOM'} />
        <SettingsInline><AiModeBadge /></SettingsInline>
        {serverEnvReady && (
          <SettingsInline>
            <p data-testid="server-env-ready" className="flex items-start gap-1.5 rounded-2xl bg-mint-100/70 p-3 text-[11px] leading-relaxed text-mint-600">
              <Icon name="check" size={14} className="mt-0.5 shrink-0" />
              <span>
                {aiStatus?.detail
                  ? `检测到本地服务端环境变量已配置，AI 对话已就绪（${aiStatus.detail}）。`
                  : '检测到本地服务端环境变量已配置，AI 对话已就绪。'}
                {' '}下方「自定义兼容端点」仅在你想绕开服务端、直接从浏览器直连某个兼容 API 时才需要填写。
              </span>
            </p>
          </SettingsInline>
        )}
        {!serverEnvReady && (
          <>
            <SettingsInline>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" onClick={() => patchSettings({ apiMode: 'mock' })}
                  className={`seg-btn rounded-xl px-3 py-2.5 text-xs font-bold transition ${settings.apiMode === 'mock' ? 'bg-brand-500 text-white' : 'bg-slate-100 text-muted'}`}>本地 Mock（推荐）</button>
                <button type="button" onClick={() => patchSettings({ apiMode: 'custom' })}
                  className={`seg-btn rounded-xl px-3 py-2.5 text-xs font-bold transition ${settings.apiMode === 'custom' ? 'bg-brand-500 text-white' : 'bg-slate-100 text-muted'}`}>自定义兼容端点</button>
              </div>
            </SettingsInline>
            {settings.apiMode === 'custom' && (
              <div className="animate-in">
                <SettingsInline>
                  <label className="block text-xs font-bold text-ink">OpenAI 兼容 /chat/completions 地址
                    <input className="field mt-1.5" value={settings.apiEndpoint}
                      onChange={(e) => patchSettings({ apiEndpoint: e.target.value })} placeholder="https://your-endpoint/v1/chat/completions" />
                  </label>
                </SettingsInline>
                <SettingsInline>
                  <label className="block text-xs font-bold text-ink">API Key（仅存本机浏览器）
                    <input className="field mt-1.5" type="password" value={settings.apiKey} autoComplete="off"
                      onChange={(e) => patchSettings({ apiKey: e.target.value })} placeholder="sk-…" />
                  </label>
                </SettingsInline>
                <SettingsInline>
                  <label className="block text-xs font-bold text-ink">模型名
                    <input className="field mt-1.5" value={settings.apiModel}
                      onChange={(e) => patchSettings({ apiModel: e.target.value })} placeholder="gpt-4o-mini" />
                  </label>
                </SettingsInline>
                <SettingsInline>
                  <p className="flex items-start gap-1.5 rounded-2xl bg-sun-100/60 p-3 text-[11px] leading-relaxed text-[#8a5b08]">
                    <Icon name="info" size={14} className="mt-0.5 shrink-0" />
                    源码中不含任何密钥；这里填写的内容只写进本地 localStorage。远程调用失败时会自动回退 Mock，练习不会中断。也可在代码中调用 setDialogueGenerator() 直接替换 generateDialogue() 服务。
                  </p>
                </SettingsInline>
              </div>
            )}
          </>
        )}
      </SettingsGroup>

      {/* 数据管理：危险操作单独一组 */}
      <SettingsGroup title="数据管理" danger>
        <SettingsRow icon="trash" iconTone="coral" title="数据管理"
          subtitle="所有学习记录都在这台设备的浏览器里。" />
        <SettingsInline>
          <div className="grid grid-cols-2 gap-2 text-[11px] text-muted sm:grid-cols-3">
            {['lingua_profile', 'lingua_texts', 'lingua_scenarios', 'lingua_sessions', 'lingua_mistakes',
              'lingua_review_queue', 'lingua_settings', 'lingua_voice_reports',
              'lingua_library', 'lingua_reading_progress', 'lingua_seminars', 'lingua_literary_notes',
              'lingua_culture_videos', 'lingua_watch_progress', 'lingua_postwatch_sessions',
              'lingua_culture_notes', 'lingua_playlist_registry',
              /** [新增] 词场 6 键 */
              'lingua_word_progress', 'lingua_word_session_draft', 'lingua_word_daily_quota',
              'lingua_word_errors', 'lingua_word_media_cache', 'lingua_deck_selection',
              /** [S2.5 新增] 第 24 个键 */
              'lingua_pronunciation_flags',
              /** [成长系统新增] 第 25-28 个键 */
              'lingua_growth', 'lingua_achievements', 'lingua_xp_ledger', 'lingua_activity_heatmap',
              /** [China Learner Track 新增] 第 29 个键 */
              'lingua_china_track',
              /** [CEFR 等级层新增] 第 30 个键 */
              'lingua_level_preference'].map((k) => (
              <code key={k} className="break-all rounded-lg bg-brand-50/70 px-2 py-1.5 text-[10px] text-brand-600">{k}</code>
            ))}
          </div>
        </SettingsInline>
        <SettingsInline>
          <button type="button" onClick={() => setClearStep(1)}
            className="mt-1 flex min-h-[48px] w-full items-center justify-center gap-2 rounded-2xl border border-coral-100 bg-coral-100/50 px-4 py-3 text-sm font-bold text-coral-600 transition hover:bg-coral-100">
            <Icon name="trash" size={16} />清空所有数据
          </button>
          <p className="mt-2 text-center text-[11px] text-muted">需要两次确认，避免误触。</p>
        </SettingsInline>
      </SettingsGroup>

      <CloudSyncCard />

      <div className="rounded-2xl bg-white/60 p-4 text-center text-[11px] leading-relaxed text-muted">
        LinguaBuddy 语伴英语 · v1.0.0<br />
        原创品牌、原创 UI、原创角色与文案；不依赖任何第三方品牌素材。<br />
        本地 Agent：TextAnalyzer · DialogueDirector · Coach（角色对话）＋ LiteraryCurator · LiteraryAnalyzer · SeminarDirector（文学研读）＋ CultureCurator · CultureAnalyzer · PostWatchDirector（文化视频）
      </div>

      <Modal open={clearStep === 1} title="要清空所有学习数据吗？" danger confirmText="我已了解，继续" cancelText="取消"
        desc="这会删除文本分析、场景、对话记录、错题、复习队列、XP 与成就，且无法恢复。接下来还有一次确认。"
        onClose={() => setClearStep(0)} onConfirm={() => setClearStep(2)} />
      <Modal open={clearStep === 2} title="最后确认：真的清空？" danger confirmText="确认清空" cancelText="保留数据"
        desc="点击确认后，应用会立刻回到全新的首页状态；文学书库会重新播种为内置公版书单。"
        onClose={() => setClearStep(0)} onConfirm={() => { setClearStep(0); resetAll(); notify('数据已清空，崭新的旅程开始啦 🌱') }} />
    </div>
  )
}
