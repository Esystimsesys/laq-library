import { createContext } from 'react'
import type { BookletEntry, UserState } from './types'

export type Actions = {
  toggleFavorite: (modelId: string) => void
  /** 作成済みにする（すでに作成済みなら取り消す） */
  toggleMade: (modelId: string) => void
  setMadeAt: (modelId: string, madeAt: string) => void
  addBooklet: (entry: BookletEntry) => void
  updateBooklet: (entry: BookletEntry) => void
  deleteBooklet: (id: string) => void
  /** 写真も置き換える。処理中に重ねて呼ばれた場合は null。 */
  importState: (state: UserState, photos: Record<string, string>) => Promise<string[] | null>
  resetAll: () => Promise<boolean | null>
}

export type ContextValue = {
  state: UserState
  /** 端末に保存できていない（容量超過・プライベートブラウジングなど） */
  saveFailed: boolean
  /** 写真と記録の復元・全削除が進行中。画面をまたいで操作を止める。 */
  dataBusy: boolean
  actions: Actions
}

export const AppContext = createContext<ContextValue | null>(null)
