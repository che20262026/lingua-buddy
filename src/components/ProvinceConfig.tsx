/**
 * 省份配置组件（China Learner Track · 轨道 C）
 *
 * 默认关闭；广东 / 北京 / 上海选择后自动启用，仍可手动关闭。
 * 省份只写本机 localStorage，不上传、不追踪、不用于任何分数预测。
 */

import { useApp } from '../store/useAppStore'
import { PROVINCE_DISCLAIMER, PROVINCE_OPTIONS, provinceOption, provinceSummary } from '../data/chinaTrack/provinces'
import { setExamEnabled, setProvince } from '../services/chinaTrack'
import { Card, Chip, Icon, SectionTitle, Toggle } from './ui'

export function ProvinceConfig() {
  const app = useApp()
  const state = app.data.chinaTrack
  const current = provinceOption(state.province)

  return (
    <Card testId="province-config">
      <SectionTitle title="省份配置 · 听说机考感知卡"
        subtitle="默认关闭。仅用于启用 / 禁用轨道 C 的题型感知卡，不假定全国政策统一。"
        right={<Chip tone={state.listeningExamEnabled ? 'sun' : 'mint'}>
          {state.listeningExamEnabled ? '已启用' : '默认关闭'}
        </Chip>} />

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {PROVINCE_OPTIONS.map((p) => {
          const selected = state.province === p.id
          return (
            <button key={p.id} type="button" onClick={() => setProvince(app, p.id)}
              data-testid={`province-${p.id}`}
              className={`rounded-xl px-2.5 py-2 text-[11px] font-bold transition ${selected
                ? 'bg-brand-500 text-white shadow-soft'
                : 'bg-slate-100 text-muted hover:bg-brand-50 hover:text-brand-600'}`}>
              {p.label}
            </button>
          )
        })}
      </div>

      <p className="mt-3 rounded-2xl bg-brand-50/70 px-3 py-2.5 text-[11px] leading-relaxed text-brand-700">
        {current.note}
      </p>

      <div className="mt-3 flex items-center justify-between gap-3">
        <div className="min-w-0 pr-2">
          <p className="text-[11px] font-bold text-ink">启用听说机考题型感知卡</p>
          <p className="mt-0.5 text-[10px] leading-relaxed text-muted">
            只展示「考试会要求我做什么」的题型说明与原创模拟指令，不打分、不预测成绩。
          </p>
        </div>
        <Toggle checked={state.listeningExamEnabled}
          onChange={(v) => setExamEnabled(app, v)} label="启用听说机考感知卡" />
      </div>

      <p data-testid="province-summary" className="mt-3 text-[11px] font-semibold text-ink">
        当前状态：{provinceSummary(state)}
      </p>
      <p className="mt-2 flex items-start gap-1.5 rounded-2xl bg-slate-50 px-3 py-2.5 text-[10px] leading-relaxed text-muted">
        <Icon name="info" size={13} className="mt-0.5 shrink-0" />{PROVINCE_DISCLAIMER}
      </p>
    </Card>
  )
}
