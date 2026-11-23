import { assemblyForModel } from '../assemblies/catalog'
import { models, sourceOf } from '../data'
import type { Model } from '../data/types'
import type { UserState } from '../store/types'
import { toModel } from './myModels'
import { queryTerms, searchIndexOf, type Filters } from './search'

/**
 * 検索用の文字列は作品ごとに一度だけ作って使い回す。
 * 1400 件ぶんを一文字打つたびに作り直すと、入力がもたつく。
 * 自分で登録した作品は数が少なく、書き換えも起きるのでその場で作る。
 */
const searchIndex = new Map(models.map((m) => [m.id, indexOf(m)]))

/** カードに出る出典名と正式な呼び方でも引けるようにする（「わらばあ」「ぷりまつ」「こうしき」） */
function indexOf(m: Model): string {
  const { shortLabel, sourceLabel } = sourceOf(m)
  return searchIndexOf(m, [shortLabel, sourceLabel])
}

/*
  冊子の Model 変換は、同じ booklets からは同じ配列を返す。
  毎回作り直すとカードに渡すオブジェクトの参照が変わり、
  ★を 1 つ押しただけで表示中の冊子カードが全部描き直される。
*/
let cachedBooklets: UserState['booklets'] | null = null
let cachedAll: Model[] = models

/**
 * 取り込んだ作品と、自分で登録した冊子の作品をあわせた一覧。
 * 端末で登録した冊子を新しい順に先頭へ置く。
 */
export function allModels(user: UserState): Model[] {
  if (user.booklets.length === 0) return models
  if (user.booklets !== cachedBooklets) {
    cachedBooklets = user.booklets
    cachedAll = [...user.booklets].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map(toModel).concat(models)
  }
  return cachedAll
}

export function filterModels(
  list: Model[],
  filters: Filters,
  user: UserState,
): Model[] {
  const favorites = filters.status === 'favorite' ? new Set(user.favorites) : null
  // 検索語の分解は 1 回だけ。作品ごとの繰り返しを避ける。
  const terms = queryTerms(filters.query)

  const hits = list.filter((m) => {
    if (filters.only3d && !assemblyForModel(m.id)) return false
    if (filters.levels.length > 0) {
      if (!m.level || !filters.levels.includes(m.level)) return false
    }
    if (filters.sources.length > 0 && !filters.sources.includes(m.source)) return false
    if (filters.categories.length > 0) {
      if (!m.categories.some((c) => filters.categories.includes(c))) return false
    }
    switch (filters.status) {
      case 'favorite':
        if (!favorites?.has(m.id)) return false
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
    const haystack = searchIndex.get(m.id) ?? indexOf(m)
    return terms.every((t) => haystack.includes(t))
  })
  return mixSources(hits)
}

/** 混ぜずに先頭へ置くもの。制作者のオリジナルと、自分で登録した作品 */
const PINNED_SOURCES = new Set<Model['source']>(['original', 'my-booklet'])

/**
 * しぼりこんだ結果を、サイトごとに 1 件ずつ順に取り出して混ぜる。
 * 各サイトの中の順番と、サイトどうしの順番（一覧に出てくる順）は変えない。
 *
 * サイトごとにまとめて並べると、件数の多いぷりまつ（1,200 件あまり）が先に続き、
 * ポケモンで絞ったときに ほかのサイトの作品が 1,200 件より後ろに沈む。
 * 全体を先に混ぜてから絞ると、件数の少ないサイトの作品が絞り込みのあとで
 * 後ろへずれるので、絞ったあとに混ぜる。
 */
export function mixSources(list: Model[]): Model[] {
  const pinned: Model[] = []
  const bySource = new Map<Model['source'], Model[]>()
  for (const m of list) {
    if (PINNED_SOURCES.has(m.source)) pinned.push(m)
    else {
      const group = bySource.get(m.source)
      if (group) group.push(m)
      else bySource.set(m.source, [m])
    }
  }
  if (bySource.size < 2) return list
  const groups = [...bySource.values()]
  const out = [...pinned]
  for (let i = 0; out.length < list.length; i++) {
    for (const group of groups) if (i < group.length) out.push(group[i])
  }
  return out
}
