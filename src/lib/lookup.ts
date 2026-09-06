import { useCallback } from 'react'
import { modelById } from '../data'
import type { Model } from '../data/types'
import { toModel } from './myModels'
import { useApp } from '../store/useApp'

/**
 * id から作品を引く。取り込んだ作品と、自分で登録した冊子の作品の両方を見る。
 * 見つからないものは undefined を返す（取り込み直しで消えた作品が
 * おきにいりに残っていても、画面を落とさず黙って除く）。
 */
export function useLookup(): (id: string) => Model | undefined {
  const { state } = useApp()
  return useCallback(
    (id: string) => {
      const mine = state.booklets.find((b) => b.id === id)
      return mine ? toModel(mine) : modelById.get(id)
    },
    [state.booklets],
  )
}
