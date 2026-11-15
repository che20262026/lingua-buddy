export const uid = (prefix = 'id'): string =>
  `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`

export const clamp = (n: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, n))

export const cn = (...parts: Array<string | false | null | undefined>): string =>
  parts.filter(Boolean).join(' ')

export const formatDate = (ts: number): string => {
  const d = new Date(ts)
  return `${d.getMonth() + 1}月${d.getDate()}日 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`

/** 从任意文本中提取英文单词（小写、去重、去停用词） */
const STOP = new Set([
  'the', 'a', 'an', 'and', 'or', 'but', 'if', 'so', 'of', 'to', 'in', 'on', 'at', 'for', 'with',
  'was', 'were', 'is', 'are', 'am', 'be', 'been', 'being', 'it', 'its', 'this', 'that', 'these',
  'those', 'they', 'them', 'their', 'he', 'she', 'his', 'her', 'we', 'our', 'you', 'your', 'i',
  'my', 'me', 'as', 'by', 'from', 'had', 'has', 'have', 'did', 'do', 'does', 'not', 'no',
  'about', 'into', 'than', 'then', 'there', 'here', 'when', 'while', 'because', 'very', 'just',
  'also', 'would', 'could', 'should', 'will', 'can', 'may', 'might', 'said', 'says', 'one', 'two',
  'after', 'before', 'up', 'out', 'over', 'under', 'all', 'some', 'more', 'most', 'other', 'such',
])

export function tokenize(text: string): string[] {
  return (text.toLowerCase().match(/[a-z][a-z'-]*/g) || []).filter((w) => w.length > 1)
}

export function contentWords(text: string): string[] {
  const counts = new Map<string, number>()
  for (const w of tokenize(text)) {
    if (STOP.has(w)) continue
    counts.set(w, (counts.get(w) || 0) + 1)
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([w]) => w)
}

export function splitSentences(text: string): string[] {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

/** 提取可能出现的人名（首字母大写的连续词，排除句首常见词） */
export function extractNames(text: string): string[] {
  const sentences = splitSentences(text)
  const found: string[] = []
  const common = new Set(['The', 'A', 'An', 'Last', 'This', 'That', 'They', 'It', 'He', 'She', 'We', 'I', 'In', 'On', 'At', 'When', 'After', 'Before', 'But', 'And', 'So', 'One', 'Every', 'Many', 'Some', 'First', 'Then', 'Today', 'Yesterday'])
  for (const s of sentences) {
    const words = s.split(/\s+/)
    words.forEach((raw, i) => {
      const w = raw.replace(/[^A-Za-z'-]/g, '')
      if (i > 0 && /^[A-Z][a-z]{1,14}$/.test(w) && !common.has(w) && !found.includes(w)) found.push(w)
    })
  }
  return found.slice(0, 4)
}

export function containsTarget(text: string, target: string): boolean {
  const base = target.toLowerCase().replace(/[^a-z\s'-]/g, '').trim()
  if (!base) return false
  return text.toLowerCase().includes(base)
}
