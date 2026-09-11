import { describe, expect, it } from 'vitest'
import { models } from '../data'
import type { Model } from '../data/types'
import { emptyState } from '../store/storage'
import type { UserState } from '../store/types'
import { filterModels } from './filter'
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
