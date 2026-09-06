import { describe, expect, it } from 'vitest'
import { isFiltering, matchesQuery, normalize, emptyFilters } from './search'

describe('normalize', () => {
  it('カタカナをひらがなに寄せる', () => {
    expect(normalize('ウサギ')).toBe('うさぎ')
    expect(normalize('ティラノサウルス')).toBe('てぃらのさうるす')
  })

  it('全角英数と大文字を半角小文字に寄せる', () => {
    expect(normalize('ＬａＱ')).toBe('laq')
    expect(normalize('F1')).toBe('f1')
  })

  it('区切り記号を落とす', () => {
    expect(normalize('ソフト・クリーム')).toBe('そふとくりーむ')
    expect(normalize('パトカー & バイク')).toBe('ぱとかーばいく')
    expect(normalize('一富士、二鷹、三茄子')).toBe('一富士二鷹三茄子')
  })

  it('長音は音の一部なので残す', () => {
    expect(normalize('レーサー')).toBe('れーさー')
  })
})

describe('matchesQuery', () => {
  const haystack = normalize('ティラノサウルス きょうりゅう 上級')

  it('かなの書きかたが違っても当たる', () => {
    expect(matchesQuery(haystack, 'てぃらの')).toBe(true)
    expect(matchesQuery(haystack, 'ティラノ')).toBe(true)
  })

  it('空白で区切った語をすべて含むものだけ当たる（AND）', () => {
    expect(matchesQuery(haystack, 'ティラノ きょうりゅう')).toBe(true)
    expect(matchesQuery(haystack, 'ティラノ くるま')).toBe(false)
  })

  it('全角の空白でも区切れる', () => {
    expect(matchesQuery(haystack, 'ティラノ　きょうりゅう')).toBe(true)
  })

  it('空の入力はすべて通す', () => {
    expect(matchesQuery(haystack, '')).toBe(true)
    expect(matchesQuery(haystack, '   ')).toBe(true)
  })
})

describe('isFiltering', () => {
  it('なにも指定していなければ false', () => {
    expect(isFiltering(emptyFilters)).toBe(false)
    expect(isFiltering({ ...emptyFilters, query: '  ' })).toBe(false)
  })

  it('どれかひとつでも指定されていれば true', () => {
    expect(isFiltering({ ...emptyFilters, query: 'ねこ' })).toBe(true)
    expect(isFiltering({ ...emptyFilters, levels: ['beginner'] })).toBe(true)
    expect(isFiltering({ ...emptyFilters, categories: ['どうぶつ'] })).toBe(true)
    expect(isFiltering({ ...emptyFilters, status: 'made' })).toBe(true)
  })
})
