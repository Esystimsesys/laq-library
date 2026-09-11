import type { AssemblyEntry } from './types'
const PREFIX = 'laq-library:assembly:'
export type Progress = { at: number; checked: string[] }
export const progressKey = (entry: AssemblyEntry) => `${PREFIX}${entry.id}:v${entry.revision}`
export function loadProgress(entry: AssemblyEntry, keys: string[]): Progress {
  try {
    const saved = JSON.parse(localStorage.getItem(progressKey(entry)) ?? 'null')
    if (!saved) return { at: 0, checked: [] }
    // Older saves included a separate parts screen immediately after welcome.
    const oldKeys = ['welcome', 'parts', ...keys.slice(1)]
    const key = typeof saved.stepKey === 'string' ? saved.stepKey
      : Number.isInteger(saved.at) && saved.at >= 0 ? oldKeys[saved.at] : undefined
    const at = key === 'parts' ? 0 : keys.indexOf(key)
    if (at < 0) return { at: 0, checked: [] }
    return { at, checked: Array.isArray(saved.checked) ? saved.checked.filter((key: unknown) => typeof key === 'string' && keys.includes(key)) : [] }
  } catch { return { at: 0, checked: [] } }
}
export function saveProgress(entry: AssemblyEntry, progress: Progress, keys: string[]): boolean {
  try { localStorage.setItem(progressKey(entry), JSON.stringify({ ...progress, stepKey: keys[progress.at] })); return true } catch { return false }
}
export function clearAssemblyProgress() {
  for (let i = localStorage.length - 1; i >= 0; i--) {
    const key = localStorage.key(i)
    if (key?.startsWith(PREFIX)) localStorage.removeItem(key)
  }
}
