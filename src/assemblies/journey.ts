import type { Guide, JourneyStep } from './types'
export const groupLabel = (guide: Guide, id: string) => guide.displayLabels?.[id] ?? id
export const groupName = (guide: Guide, id: string) => {
  const variant = guide.variants[guide.defaultVariant]
  return guide.reading?.unitNames?.[id]
    ?? variant.units.find(unit => unit.id === id)?.label
    ?? (id === variant.finished ? 'できあがり' : 'からだ')
}
export function journey(guide: Guide): JourneyStep[] {
  const variant = guide.variants[guide.defaultVariant]
  const steps: JourneyStep[] = [
    { key: 'welcome', phase: 'welcome', step: 0, title: 'これを つくろう！', description: '図を 見ながら、じゅんばんに つくっていこう。' },
  ]
  const instructions = new Map<string, JourneyStep>()
  for (const unit of variant.units) unit.steps.forEach((source, index) => {
    const key = `unit:${unit.id}:${index}`
    instructions.set(key, { key, phase: 'unit', unit: unit.id, step: index, source,
      title: groupName(guide, unit.id), description: '' })
  })
  variant.assembly.forEach((source, index) => {
    const key = `assembly:${index}`
    instructions.set(key, { key, phase: 'assembly', step: index, source,
      title: groupName(guide, source.result ?? ''), description: '' })
  })
  for (const key of guide.sequence ?? instructions.keys()) {
    const instruction = instructions.get(key)
    if (!instruction) throw new Error(`Unknown instruction: ${key}`)
    steps.push(instruction)
  }
  steps.push({ key: 'done', phase: 'done', step: 0, title: 'できあがり！', description: 'くるっと まわして、できた かたちを 見くらべよう。' })
  return steps
}
export function stepIndex(raw: string | null, length: number): number {
  if (!raw || !/^\d+$/.test(raw)) return 0
  const value = Number(raw)
  return Number.isSafeInteger(value) && value < length ? value : 0
}
export function inventory(pieces: { partNo: number; color: string }[]) {
  const counts = new Map<string, { partNo: number; color: string; count: number }>()
  for (const p of pieces) {
    const key = `${p.partNo}:${p.color}`, existing = counts.get(key)
    if (existing) existing.count++
    else counts.set(key, { partNo: p.partNo, color: p.color, count: 1 })
  }
  return [...counts.values()].sort((a, b) => a.partNo - b.partNo || a.color.localeCompare(b.color))
}
export const colorWords: Record<string, string> = { lavender: 'むらさき', black: 'くろ', yellow: 'きいろ', red: 'あか', white: 'しろ', blue: 'あお', skyblue: 'みずいろ', transparent: 'とうめい', clear: 'とうめい' }

/** New links use stable step IDs. Old numeric links retain their original meaning. */
export function routeIndex(params: URLSearchParams, guide: Guide, steps: JourneyStep[]): number {
  const key = params.get('step')
  if (key !== null) return Math.max(0, steps.findIndex(s => s.key === key))
  const legacy = stepIndex(params.get('at'), guide.legacyAtKeys?.length ?? steps.length)
  return guide.legacyAtKeys ? Math.max(0, steps.findIndex(s => s.key === guide.legacyAtKeys![legacy])) : legacy
}
