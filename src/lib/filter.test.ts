import { describe, expect, it } from 'vitest'
import { models } from '../data'
import type { Model } from '../data/types'
import { emptyState } from '../store/storage'
import type { UserState } from '../store/types'
import { allModels, filterModels, mixSources } from './filter'
import { emptyFilters } from './search'

const sample: Model[] = [
  {
    id: 'test:1',
    source: 'laq-official',
    sourceUrl: 'https://example.com/1',
    title: 'ティラノサウルス',
    description: 'おおきな きょうりゅう',
    level: 'advanced',
    categories: ['きょうりゅう'],
    thumbnail: null,
    mainImage: null,
    stepImages: [],
    pdfUrl: null,
  },
  {
    id: 'test:2',
    source: 'laq-official',
    sourceUrl: 'https://example.com/2',
    title: 'パトカー',
    description: '',
    level: 'beginner',
    categories: ['のりもの'],
    thumbnail: null,
    mainImage: null,
    stepImages: [],
    pdfUrl: null,
  },
  {
    id: 'test:3',
    source: 'laq-official',
    sourceUrl: 'https://example.com/3',
    title: 'ねこ',
    description: '',
    level: null,
    categories: ['どうぶつ'],
    thumbnail: null,
    mainImage: null,
    stepImages: [],
    pdfUrl: null,
  },
]

const ids = (list: Model[]) => list.map((m) => m.id)

const user: UserState = {
  version: 1,
  favorites: ['test:2'],
  made: { 'test:1': { madeAt: '2026-01-02' } },
  booklets: [],
}

describe('filterModels', () => {
  it('端末で登録した冊子を公開オリジナルより先頭に置く', () => {
    const withBooklet: UserState = {
      ...emptyState,
      booklets: [{
        id: 'my-booklet:test', title: '手元の作品', booklet: '', page: '', level: null,
        categories: ['むし'], note: '', photoCount: 0, createdAt: '2026-09-15T00:00:00.000Z',
      }],
    }
    expect(allModels(withBooklet).slice(0, 3).map((model) => model.id)).toEqual([
      'my-booklet:test',
      'original:giant-hornet',
      'original:hebi',
    ])
  })

  it('新しい登録を先に出し、元の記録や取り込み順を変更しない', () => {
    const booklet = { id: 'my-booklet:old', title: '前の作品', booklet: '', page: '', level: null,
      categories: [], note: '', photoCount: 0, createdAt: '2026-09-01T00:00:00.000Z' }
    const state: UserState = { ...emptyState, booklets: [booklet,
      { ...booklet, id: 'my-booklet:new', createdAt: '2026-10-01T00:00:00.000Z' }] }
    const before = structuredClone(state)
    const all = allModels(state)
    expect(ids(all).slice(0, 2)).toEqual(['my-booklet:new', 'my-booklet:old'])
    expect(all.slice(2)).toEqual(models)
    expect(allModels(state)).toBe(all)
    expect(state).toEqual(before)
    expect(allModels(emptyState)).toBe(models)
  })

  it('なにも指定しなければ全部返す', () => {
    expect(ids(filterModels(sample, emptyFilters, emptyState))).toEqual([
      'test:1',
      'test:2',
      'test:3',
    ])
  })

  it('ことばで絞る（説明文も見る）', () => {
    const hits = filterModels(
      sample,
      { ...emptyFilters, query: 'きょうりゅう' },
      emptyState,
    )
    expect(ids(hits)).toEqual(['test:1'])
  })

  it.each([
    ['てぃらの', ['test:1']],
    ['ティラノ', ['test:1']],
    ['ティラノ きょうりゅう', ['test:1']],
    ['ティラノ くるま', []],
    ['ティラノ　きょうりゅう', ['test:1']],
    ['', ['test:1', 'test:2', 'test:3']],
    ['   ', ['test:1', 'test:2', 'test:3']],
  ])('検索の表記ゆれ・AND・空入力: %j', (query, expected) => {
    expect(ids(filterModels(sample, { ...emptyFilters, query }, emptyState))).toEqual(expected)
  })

  it('むずかしさで絞る。レベルの無いものは対象外になる', () => {
    const hits = filterModels(
      sample,
      { ...emptyFilters, levels: ['beginner'] },
      emptyState,
    )
    expect(ids(hits)).toEqual(['test:2'])
  })

  it('カテゴリは選んだもののどれかに当たれば残す（OR）', () => {
    const hits = filterModels(
      sample,
      { ...emptyFilters, categories: ['のりもの', 'どうぶつ'] },
      emptyState,
    )
    expect(ids(hits)).toEqual(['test:2', 'test:3'])
  })

  it('おきにいり・つくった・つくってない で絞る', () => {
    expect(
      ids(filterModels(sample, { ...emptyFilters, status: 'favorite' }, user)),
    ).toEqual(['test:2'])
    expect(
      ids(filterModels(sample, { ...emptyFilters, status: 'made' }, user)),
    ).toEqual(['test:1'])
    expect(
      ids(filterModels(sample, { ...emptyFilters, status: 'notMade' }, user)),
    ).toEqual(['test:2', 'test:3'])
  })

  it('複数の条件はすべて満たすものだけ残す（AND）', () => {
    const hits = filterModels(
      sample,
      { ...emptyFilters, levels: ['beginner'], status: 'favorite' },
      user,
    )
    expect(ids(hits)).toEqual(['test:2'])
  })

  it('実データでも、かな違いの検索が当たる', () => {
    const hits = filterModels(models, { ...emptyFilters, query: 'うさぎ' }, emptyState)
    // 「うさぎ」「ウサギ」「うさぎ1」など表記がばらついているので複数ヒットする
    expect(hits.length).toBeGreaterThan(1)
    expect(hits.some((m) => m.title === 'ウサギ')).toBe(true)
  })
})

it('3D対応は登録データで判定し、検索・完成記録の条件とも組み合わせる', () => {
  const metamon = models.find(m => m.id === 'purimatu:metamon')!
  const filters = { ...emptyFilters, only3d: true }
  expect(ids(filterModels([metamon,...sample], filters, emptyState))).toEqual([metamon.id])
  expect(filterModels([metamon,...sample], {...filters, query:'ねこ'}, emptyState)).toEqual([])
  expect(filterModels([metamon,...sample], {...filters, status:'made'}, emptyState)).toEqual([])
  expect(ids(filterModels([metamon,...sample], {...filters, status:'made'}, {...emptyState, made:{[metamon.id]:{madeAt:'2026-01-01'}}}))).toEqual([metamon.id])
})

it('どこの作品かで しぼり、複数えらぶと どれかに当たるものを出す', () => {
  const metamon = models.find(m => m.id === 'purimatu:metamon')!
  const list = [metamon, ...sample]
  expect(ids(filterModels(list, { ...emptyFilters, sources: ['purimatu'] }, emptyState))).toEqual([metamon.id])
  expect(filterModels(list, { ...emptyFilters, sources: ['purimatu', 'laq-official'] }, emptyState)).toHaveLength(list.length)
  expect(filterModels(list, { ...emptyFilters, sources: ['purimatu'], query: 'ねこ' }, emptyState)).toEqual([])
})

it('出どころの名前でも検索で引ける', () => {
  const byQuery = (query: string) => filterModels(models, { ...emptyFilters, query }, emptyState)
  const warabar = models.filter(m => m.source === 'warabar')
  // カードの出典名でも、正式な呼び方でも、カタカナでも引ける
  expect(ids(byQuery('わらばあ'))).toEqual(ids(warabar))
  expect(ids(byQuery('ワラバア'))).toEqual(ids(warabar))
  expect(byQuery('ぷりまつ').every(m => m.source === 'purimatu')).toBe(true)
  expect(byQuery('こうしき').every(m => m.source === 'laq-official')).toBe(true)
  // 作品名と組み合わせて絞れる
  expect(byQuery('わらばあ イーブイ').map(m => m.id)).toEqual(['warabar:laq-eevee'])
})

describe('サイトを混ぜて並べる', () => {
  const item = (source: Model['source'], n: number): Model => ({ ...sample[0], id: `${source}:${n}`, source })

  it('先頭の固定ぶんのあとは、サイトごとに 1 件ずつ交互に並べ、少ないサイトは出し切る', () => {
    const list = [item('original', 1), item('purimatu', 1), item('purimatu', 2), item('purimatu', 3), item('warabar', 1)]
    expect(mixSources(list).map((m) => m.id)).toEqual(['original:1', 'purimatu:1', 'warabar:1', 'purimatu:2', 'purimatu:3'])
  })

  it('ポケモンで絞ると、最初の 24 件に ポケモンのある全部のサイトが入る', () => {
    const firstPage = filterModels(models, { ...emptyFilters, categories: ['ポケモン'] }, emptyState).slice(0, 24)
    expect(new Set(firstPage.map((m) => m.source))).toEqual(new Set(['purimatu', 'laq-pokemon', 'warabar', 'chiiku365']))
  })
})
