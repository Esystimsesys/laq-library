import type { Model } from '../data/types'

/**
 * 探しかたのゆれを吸収するための正規化。
 *
 * 子どもは「うさぎ」とも「ウサギ」とも打つし、ローマ字入力の途中で
 * 全角英数が混ざることもある。カタカナはひらがなに、英数は半角小文字に寄せ、
 * 区切り記号（中黒・スペース・&）は落として比べる。
 * 長音符は音の一部なので残す（「レーサー」と「レサー」は別物として扱う）。
 */
export function normalize(text: string): string {
  return text
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60))
    .replace(/[・\s&＿_、,。.]/g, '')
}

/** 検索対象の文字列をあらかじめ作っておく（毎回の入力で作り直さない）。 */
export function searchIndexOf(model: Model): string {
  return normalize(
    [model.title, model.description, ...model.categories].join(' '),
  )
}

/** 入力を空白で区切り、正規化した検索語の並びにする。 */
export function queryTerms(query: string): string[] {
  return query.split(/[\s　]+/).map(normalize).filter(Boolean)
}

/**
 * 空白区切りの語をすべて含むものを拾う（AND 検索）。
 * 語が 1 つも無いときは全件を通す。
 */
export function matchesQuery(haystack: string, query: string): boolean {
  const terms = queryTerms(query)
  if (terms.length === 0) return true
  return terms.every((t) => haystack.includes(t))
}

export type Filters = {
  only3d: boolean
  query: string
  levels: string[]
  categories: string[]
  /** 'all' | 'favorite' | 'made' | 'notMade' */
  status: 'all' | 'favorite' | 'made' | 'notMade'
}

export const emptyFilters: Filters = {
  query: '',
  levels: [],
  categories: [],
  status: 'all',
  only3d: false,
}

export function isFiltering(filters: Filters): boolean {
  return (
    filters.only3d ||
    filters.query.trim() !== '' ||
    filters.levels.length > 0 ||
    filters.categories.length > 0 ||
    filters.status !== 'all'
  )
}
