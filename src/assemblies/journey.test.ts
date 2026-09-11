import { describe, expect, it, vi, afterEach } from 'vitest'
import guideData from '../../public/assemblies/metamon/guide.json'
import { assemblies } from './catalog'
import { inventory, journey, stepIndex, routeIndex } from './journey'
import { clearAssemblyProgress, loadProgress, saveProgress, progressKey } from './progress'
import type { Guide } from './types'
const guide = guideData as Guide
const route = journey(guide)
afterEach(() => vi.unstubAllGlobals())
describe('assembly journey', () => {
  it('prepares, builds every grouped step, merges in order and reaches the complete model', () => {
    expect(route.map(s => s.phase).slice(0, 2)).toEqual(['welcome', 'unit'])
    expect(route.filter(s => s.phase === 'unit')).toHaveLength(9)
    expect(route.filter(s => s.phase === 'assembly')).toHaveLength(8)
    expect(route.at(-1)?.phase).toBe('done')
    expect(new Set(route.map(s => s.key)).size).toBe(route.length)
    expect(route.filter(s => s.unit === 'A2')).toHaveLength(1)
    expect(route.find(s => s.unit === 'A2')?.source?.visiblePieces).toHaveLength(11)
    expect(route.slice(1, 6).map(s => s.key)).toEqual(['unit:A1:0','unit:A2:0','assembly:0','unit:B1:0','assembly:1'])
    expect(route.filter(s => s.unit === 'C1')).toHaveLength(1)
    expect(route.find(s => s.unit === 'C1')?.source?.visiblePieces).toHaveLength(8)
    expect(route.find(s => s.unit === 'C1')?.source?.presentation).toBe('overview')
  })
  it('renders display references without renaming stable route IDs', () => {
    const step=route.find(s=>s.key==='assembly:0')!
    expect(step.description).toContain('B1 の しかくを、A1')
    expect(step.description).toContain('C1 だよ')
    expect(step.description).not.toContain('{{')
  })
  it('counts parts without merging different colours or duplicating pieces', () => {
    const counts = inventory(guide.variants[guide.defaultVariant].model.pieces)
    expect(counts.reduce((n, p) => n + p.count, 0)).toBe(53)
    expect(counts.some(p => p.color === 'black')).toBe(true)
  })
  it('rejects invalid deep links', () => {
    for (const value of ['-1', 'NaN', 'Infinity', '3.5', '9999', '1e1']) expect(stepIndex(value, route.length)).toBe(0)
    expect(stepIndex('12', route.length)).toBe(12)
  })
  it('keeps old numeric links on the original logical step and supports stable links', () => {
    expect(route[routeIndex(new URLSearchParams('at=19'), guide, route)].key).toBe('assembly:6')
    expect(route[routeIndex(new URLSearchParams('at=6'), guide, route)].key).toBe('unit:C1:0')
    expect(route[routeIndex(new URLSearchParams('step=assembly:0'), guide, route)].key).toBe('assembly:0')
    expect(routeIndex(new URLSearchParams('step=missing'), guide, route)).toBe(0)
    expect(routeIndex(new URLSearchParams('step=parts'), guide, route)).toBe(0)
    expect(routeIndex(new URLSearchParams('at=1'), guide, route)).toBe(0)
  })
  it('retains only valid saved progress, handles unavailable storage and deletes only guide progress', () => {
    const data = new Map<string, string>()
    vi.stubGlobal('localStorage', { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => data.set(k, v), removeItem: (k: string) => data.delete(k), key: (i: number) => [...data.keys()][i], get length() { return data.size } })
    const entry = assemblies[0], keys = route.map(s => s.key)
    expect(saveProgress(entry, { at: 4, checked: ['unit:A1:0', 'bad'] }, keys)).toBe(true)
    expect(loadProgress(entry, keys)).toEqual({ at: 4, checked: ['unit:A1:0'] })
    // Removing the preparation screen must not advance an existing resume point.
    data.set(progressKey(entry), JSON.stringify({ at: 11, checked: ['unit:C1:0', 'parts'] }))
    expect(keys[loadProgress(entry, keys).at]).toBe('unit:C1:0')
    expect(loadProgress(entry, keys).checked).toEqual(['unit:C1:0'])
    data.set(progressKey(entry), JSON.stringify({ at: keys.length, checked: [] }))
    expect(keys[loadProgress(entry, keys).at]).toBe('done')
    data.set(progressKey(entry), JSON.stringify({ at: 1, checked: [] }))
    expect(loadProgress(entry, keys).at).toBe(0)
    data.set('laq-library:v1', 'existing')
    clearAssemblyProgress()
    expect(data.get('laq-library:v1')).toBe('existing')
    expect(loadProgress(entry, keys).at).toBe(0)
    vi.stubGlobal('localStorage', { getItem() { throw Error() }, setItem() { throw Error() } })
    expect(loadProgress(entry, keys).at).toBe(0)
    expect(saveProgress(entry, { at: 1, checked: [] }, keys)).toBe(false)
  })
})
