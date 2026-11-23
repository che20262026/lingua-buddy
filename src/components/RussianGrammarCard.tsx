import type { WordEntry, RussianCases } from '../wordLabTypes'
import { Chip, Icon } from './ui'

/**
 * [多语言·俄语] S2 验证阶段的语法信息卡：性别 Badge + 名词六格变格折叠面板。
 *
 * 设计约束：
 * - 只在 entry.language === 'ru' 且有 gender / cases 时渲染，英语词零影响。
 * - 性别配色沿用项目既有色板：阴性 coral（偏粉）、阳性 brand（蓝）、中性 slate（灰），
 *   不引入 Tailwind 之外的自定义颜色。
 * - 变格面板用原生 <details>：DOM 保留（冒烟可读全文）、零 JS、可访问性好；
 *   默认折叠，保证移动端首屏紧凑、不挤掉「还不熟 / 我认识」与跟读按钮。
 * - 纯展示组件：不碰五步状态机的 commit / advance / submitSpelling 任何路径。
 */

const CASE_ROWS: { key: keyof RussianCases; no: string; labelCn: string; labelRu: string }[] = [
  { key: 'nom', no: '1', labelCn: '主格', labelRu: 'именительный' },
  { key: 'gen', no: '2', labelCn: '属格', labelRu: 'родительный' },
  { key: 'dat', no: '3', labelCn: '与格', labelRu: 'дательный' },
  { key: 'acc', no: '4', labelCn: '宾格', labelRu: 'винительный' },
  { key: 'ins', no: '5', labelCn: '工具格', labelRu: 'творительный' },
  { key: 'pre', no: '6', labelCn: '前置格', labelRu: 'предложный' },
]

const GENDER_TONE: Record<NonNullable<WordEntry['gender']>, 'coral' | 'brand' | 'slate'> = {
  阴性: 'coral',
  阳性: 'brand',
  中性: 'slate',
}

export function RussianGrammarCard({ entry }: { entry: WordEntry }) {
  if (entry.language !== 'ru' || !entry.gender || !entry.cases) return null

  const cases = entry.cases
  const genderTone = GENDER_TONE[entry.gender]

  return (
    <div data-testid="ru-grammar-card" className="mt-3 rounded-2xl border border-brand-50 bg-brand-50/40 p-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[10px] font-black tracking-widest text-brand-600">语法信息 · Грамматика</p>
        <div className="flex items-center gap-1.5">
          <Chip tone={genderTone} className="!px-2.5 !py-1 !text-[11px]">
            {entry.gender}{entry.pos.includes('名词') ? '名词' : ''}
          </Chip>
          {entry.wordAccented && (
            <span className="en-text text-xs font-bold text-ink">{entry.wordAccented}</span>
          )}
        </div>
      </div>

      <details data-testid="ru-declensions" className="group mt-2.5">
        <summary className="flex min-h-[44px] items-center justify-between gap-2 rounded-xl bg-white/80 px-3 py-2 text-[11px] font-bold text-ink transition hover:bg-white">
          <span>名词变格 (Declensions) <span className="font-normal text-muted">· 点击展开 1–6 格</span></span>
          <Icon name="down" size={14} className="shrink-0 text-brand-500 transition-transform group-open:rotate-180" />
        </summary>
        {/* 2 列紧凑网格：每格一行「序号·中文格名 + 带重音俄语写法」 */}
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          {CASE_ROWS.map((row) => (
            <div key={row.key} data-testid={`ru-case-${row.key}`}
              className="flex items-baseline justify-between gap-1.5 rounded-xl bg-white/80 px-2.5 py-2">
              <span className="shrink-0 text-[10px] font-bold text-muted">
                {row.no}·{row.labelCn}
              </span>
              <span className="en-text text-xs font-bold text-ink">{cases[row.key]}</span>
            </div>
          ))}
        </div>
        <p className="mt-2 text-[10px] leading-relaxed text-muted">
          俄语名词按性、数、格变化；此处列出单数六格，带重音符号便于朗读。
        </p>
      </details>
    </div>
  )
}
