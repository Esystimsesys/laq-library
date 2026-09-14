import type { Guide, GuideStep, JourneyStep, PartNo } from './types'
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
  const sequence = guide.sequence ?? [...instructions.keys()]
  const groups = new Map((guide.reading?.stepGroups ?? []).map(group => [group.keys[0], group]))
  const groupedKeys = new Set((guide.reading?.stepGroups ?? []).flatMap(group => group.keys))
  for (const key of sequence) {
    const group = groups.get(key)
    if (group) {
      const sources = group.keys.map(groupKey => instructions.get(groupKey)?.source).filter((source): source is GuideStep => Boolean(source))
      steps.push({
        key: `group:${group.id}`,
        phase: 'group',
        unit: group.id,
        step: 0,
        title: group.title,
        description: '',
        source: {
          title: group.title,
          visiblePieces: [...new Set(sources.flatMap(source => source.visiblePieces))],
          newPieces: [...new Set(sources.flatMap(source => source.newPieces))],
          presentation: 'overview',
          explodeGroups: group.explodeGroups,
        },
      })
      continue
    }
    if (groupedKeys.has(key)) continue
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
export const partName = (partNo: PartNo) => partNo === 'mini-shaft'
  ? 'ミニシャフト'
  : partNo === 'mini-wheel' ? 'ミニホイール' : `No.${partNo}`
const partOrder = (partNo: PartNo) => typeof partNo === 'number'
  ? partNo
  : partNo === 'mini-shaft' ? 8 : 9
export function inventory(pieces: { partNo: PartNo; color: string }[]) {
  const counts = new Map<string, { partNo: PartNo; color: string; count: number }>()
  for (const p of pieces) {
    const key = `${p.partNo}:${p.color}`, existing = counts.get(key)
    if (existing) existing.count++
    else counts.set(key, { partNo: p.partNo, color: p.color, count: 1 })
  }
  return [...counts.values()].sort((a, b) => partOrder(a.partNo) - partOrder(b.partNo) || a.color.localeCompare(b.color))
}
export const colorWords: Record<string, string> = { lavender: 'むらさき', purple: 'むらさき', black: 'くろ', yellow: 'きいろ', red: 'あか', white: 'しろ', blue: 'あお', skyblue: 'みずいろ', lightblue: 'みずいろ', green: 'みどり', lime: 'きみどり', orange: 'オレンジ', pink: 'ピンク', brown: 'ちゃいろ', gray: 'はいいろ', transparent: 'とうめい', clear: 'とうめい' }

/** New links use stable step IDs. Old numeric links retain their original meaning. */
export function routeIndex(params: URLSearchParams, guide: Guide, steps: JourneyStep[]): number {
  const key = params.get('step')
  if (key !== null) {
    const direct = steps.findIndex(s => s.key === key)
    if (direct >= 0) return direct
    const group = guide.reading?.stepGroups?.find(item => item.keys.includes(key))
    return group ? Math.max(0, steps.findIndex(s => s.key === `group:${group.id}`)) : 0
  }
  const legacy = stepIndex(params.get('at'), guide.legacyAtKeys?.length ?? steps.length)
  if (!guide.legacyAtKeys) return legacy
  const legacyKey = guide.legacyAtKeys[legacy]
  const direct = steps.findIndex(s => s.key === legacyKey)
  if (direct >= 0) return direct
  const group = guide.reading?.stepGroups?.find(item => item.keys.includes(legacyKey))
  return group ? Math.max(0, steps.findIndex(s => s.key === `group:${group.id}`)) : 0
}
