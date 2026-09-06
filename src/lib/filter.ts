import { models } from '../data'
import type { Model } from '../data/types'
import type { UserState } from '../store/types'
import { toModel } from './myModels'
import { queryTerms, searchIndexOf, type Filters } from './search'

/**
 * 検索用の文字列は作品ごとに一度だけ作って使い回す。
 * 1400 件ぶんを一文字打つたびに作り直すと、入力がもたつく。
 * 自分で登録した作品は数が少なく、書き換えも起きるのでその場で作る。
 */
const searchIndex = new Map(models.map((m) => [m.id, searchIndexOf(m)]))

/**
 * 取り込んだ作品と、自分で登録した冊子の作品をあわせた一覧。
 * 自分のものを先に置いて、探しやすくする。
 */
export function allModels(user: UserState): Model[] {
  if (user.booklets.length === 0) return models
  return [...user.booklets.map(toModel), ...models]
}

export function filterModels(
  list: Model[],
  filters: Filters,
  user: UserState,
): Model[] {
  const favorites = new Set(user.favorites)
  // 検索語の分解は 1 回だけ。作品ごとにやり直すと 245 回むだに走る
  const terms = queryTerms(filters.query)

  return list.filter((m) => {
    if (filters.levels.length > 0) {
      if (!m.level || !filters.levels.includes(m.level)) return false
    }
    if (filters.categories.length > 0) {
      if (!m.categories.some((c) => filters.categories.includes(c))) return false
    }
    switch (filters.status) {
      case 'favorite':
        if (!favorites.has(m.id)) return false
        break
      case 'made':
        if (!user.made[m.id]) return false
        break
      case 'notMade':
        if (user.made[m.id]) return false
        break
      case 'all':
        break
    }
    if (terms.length === 0) return true
    const haystack = searchIndex.get(m.id) ?? searchIndexOf(m)
    return terms.every((t) => haystack.includes(t))
  })
}
