import { describe, expect, it } from 'vitest'
import { filterModels } from './filter'
import { isMyBooklet, toModel } from './myModels'
import { emptyFilters } from './search'
import { emptyState } from '../store/storage'
import type { BookletEntry } from '../store/types'

const entry: BookletEntry = {
  id: 'my-booklet:1',
  title: 'きょうりゅうロボ',
  booklet: 'ベーシック401',
  page: '12',
  level: 'intermediate',
  categories: ['きょうりゅう'],
  note: 'あしが むずかしい',
  hasPhoto: true,
  createdAt: '2026-09-07T00:00:00.000Z',
}

describe('toModel', () => {
  it('取り込んだ作品と同じ形にそろえる', () => {
    const model = toModel(entry)
    expect(model.id).toBe(entry.id)
    expect(model.title).toBe('きょうりゅうロボ')
    expect(model.level).toBe('intermediate')
    expect(model.categories).toEqual(['きょうりゅう'])
    expect(isMyBooklet(model)).toBe(true)
  })

  it('冊子名・ページ・メモも検索に当たるようにする', () => {
    const model = toModel(entry)
    const user = { ...emptyState, booklets: [entry] }
    for (const query of ['ベーシック', '12ページ', 'あしが', 'きょうりゅうロボ']) {
      const hits = filterModels([model], { ...emptyFilters, query }, user)
      expect(hits.map((m) => m.id), query).toEqual([entry.id])
    }
  })

  it('写真は URL ではなく端末の中にあるので、画像の URL は持たない', () => {
    const model = toModel(entry)
    expect(model.thumbnail).toBeNull()
    expect(model.mainImage).toBeNull()
    expect(model.stepImages).toEqual([])
  })
})
