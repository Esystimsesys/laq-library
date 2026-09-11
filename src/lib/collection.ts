import type { Model } from '../data/types'
import type { UserState } from '../store/types'

/** ★ and completed records share one collection; do not mutate either stored record. */
export function collectionModels(user: UserState, lookup: (id: string) => Model | undefined): Model[] {
  const madeIds = Object.keys(user.made).sort((a, b) => user.made[b].madeAt.localeCompare(user.made[a].madeAt) || a.localeCompare(b))
  return [...new Set([...user.favorites, ...madeIds])].map(lookup).filter((m): m is Model => Boolean(m))
}
