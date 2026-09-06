import { emptyState } from './storage'
import type { BookletEntry, UserState } from './types'

/** きょうの日付を YYYY-MM-DD で返す（端末のタイムゾーンで数える）。 */
export function today(now: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`
}

export type Action =
  | { type: 'favorite/toggle'; id: string }
  | { type: 'made/toggle'; id: string }
  | { type: 'made/setDate'; id: string; madeAt: string }
  | { type: 'made/setNote'; id: string; note: string }
  | { type: 'booklet/add'; entry: BookletEntry }
  | { type: 'booklet/update'; entry: BookletEntry }
  | { type: 'booklet/delete'; id: string }
  | { type: 'data/import'; state: UserState }
  /** 別のタブが保存した内容を取り込む。import と違い、こちらは保存し直さない */
  | { type: 'data/external'; state: UserState }
  | { type: 'data/reset' }

export function reducer(state: UserState, action: Action): UserState {
  switch (action.type) {
    case 'favorite/toggle': {
      const on = state.favorites.includes(action.id)
      return {
        ...state,
        // 新しく付けたものを先頭に置いて、おきにいり画面で上に出す
        favorites: on
          ? state.favorites.filter((id) => id !== action.id)
          : [action.id, ...state.favorites],
      }
    }
    case 'made/toggle': {
      const made = { ...state.made }
      if (made[action.id]) delete made[action.id]
      else made[action.id] = { madeAt: today(), note: '' }
      return { ...state, made }
    }
    case 'made/setDate': {
      const current = state.made[action.id]
      if (!current) return state
      return {
        ...state,
        made: { ...state.made, [action.id]: { ...current, madeAt: action.madeAt } },
      }
    }
    case 'made/setNote': {
      const current = state.made[action.id]
      if (!current) return state
      return {
        ...state,
        made: { ...state.made, [action.id]: { ...current, note: action.note } },
      }
    }
    case 'booklet/add':
      return { ...state, booklets: [action.entry, ...state.booklets] }
    case 'booklet/update':
      return {
        ...state,
        booklets: state.booklets.map((b) =>
          b.id === action.entry.id ? action.entry : b,
        ),
      }
    case 'booklet/delete':
      return {
        ...state,
        booklets: state.booklets.filter((b) => b.id !== action.id),
        // 記録もいっしょに片づける。作品が無いのに記録だけ残ると、
        // おきにいり・つくった の件数が実物と合わなくなる
        favorites: state.favorites.filter((id) => id !== action.id),
        made: Object.fromEntries(
          Object.entries(state.made).filter(([id]) => id !== action.id),
        ),
      }
    case 'data/import':
    case 'data/external':
      return action.state
    case 'data/reset':
      return emptyState
    default:
      return state
  }
}
