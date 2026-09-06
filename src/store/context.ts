import { createContext } from 'react'
import type { UserState } from './types'

export type Actions = {
  toggleFavorite: (modelId: string) => void
  /** 作成済みにする（すでに作成済みなら取り消す） */
  toggleMade: (modelId: string) => void
  setMadeAt: (modelId: string, madeAt: string) => void
  setMadeNote: (modelId: string, note: string) => void
  importState: (state: UserState) => void
  resetAll: () => void
}

export type ContextValue = {
  state: UserState
  /** 端末に保存できていない（容量超過・プライベートブラウジングなど） */
  saveFailed: boolean
  actions: Actions
}

export const AppContext = createContext<ContextValue | null>(null)
