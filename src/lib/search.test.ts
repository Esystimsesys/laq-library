import { describe, expect, it } from 'vitest'
import { isFiltering, normalize, emptyFilters } from './search'

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
