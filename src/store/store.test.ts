import { afterEach, describe, expect, it, vi } from 'vitest'
import { reducer, today } from './reducer'
import { emptyState, hasAnyRecord, parseState, saveState } from './storage'
import type { UserState } from './types'

describe('parseState', () => {
  it('配列をつくった記録として扱わない', () => {
    expect(parseState({ version: 1, made: [{ madeAt: '2026-01-02' }] })).toEqual(emptyState)
    expect(parseState({ version: 1, made: { a: [] } })).toEqual(emptyState)
  })

  it('壊れた入力は空の記録として扱う', () => {
    expect(parseState(null)).toEqual(emptyState)
    expect(parseState('こわれている')).toEqual(emptyState)
    expect(parseState({})).toEqual(emptyState)
    expect(parseState({ version: 99, favorites: ['a'] })).toEqual(emptyState)
  })

  it('文字列でない id や重複を落とす', () => {
    const parsed = parseState({
      version: 1,
      favorites: ['a', 'a', 1, null, 'b'],
      made: {},
    })
    expect(parsed.favorites).toEqual(['a', 'b'])
  })

  it('made の中身の型がおかしくても、形をそろえて受け入れる', () => {
    const parsed = parseState({
      version: 1,
      favorites: [],
      made: {
        ok: { madeAt: '2026-01-02', note: 'メモ' },
        noteMissing: { madeAt: '2026-01-03' },
        broken: 'これは記録ではない',
      },
    })
    expect(parsed.made).toEqual({
      ok: { madeAt: '2026-01-02', note: 'メモ' },
      noteMissing: { madeAt: '2026-01-03', note: '' },
    })
  })
})

describe('hasAnyRecord', () => {
  it('おきにいりも つくった記録も無いときだけ false', () => {
    expect(hasAnyRecord(emptyState)).toBe(false)
    expect(hasAnyRecord({ ...emptyState, favorites: ['a'] })).toBe(true)
    expect(
      hasAnyRecord({ ...emptyState, made: { a: { madeAt: '2026-01-02', note: '' } } }),
    ).toBe(true)
  })
})

describe('saveState', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('保存に失敗したら false を返す（容量超過やプライベートブラウジング）', () => {
    vi.stubGlobal('localStorage', {
      getItem: () => null,
      setItem: () => {
        throw new DOMException('quota', 'QuotaExceededError')
      },
    })
    // 画面に「ほぞんできていません」と出すために、握りつぶさず結果を返すこと
    expect(saveState(emptyState)).toBe(false)
  })

  it('中身が同じときは書き込まない（タブ間で反応し合わないため）', () => {
    const stored = JSON.stringify(emptyState)
    let writes = 0
    vi.stubGlobal('localStorage', {
      getItem: () => stored,
      setItem: () => {
        writes += 1
      },
    })
    expect(saveState(emptyState)).toBe(true)
    expect(writes).toBe(0)
  })
})

describe('today', () => {
  it('端末のタイムゾーンで YYYY-MM-DD を作る', () => {
    expect(today(new Date(2026, 0, 5))).toBe('2026-01-05')
    expect(today(new Date(2026, 11, 31))).toBe('2026-12-31')
  })
})

describe('reducer', () => {
  const base: UserState = {
    version: 1,
    favorites: ['a'],
    made: { a: { madeAt: '2026-01-02', note: 'メモ' } },
  }

  it('おきにいりは付け外しでき、新しいものが先頭に来る', () => {
    const added = reducer(base, { type: 'favorite/toggle', id: 'b' })
    expect(added.favorites).toEqual(['b', 'a'])

    const removed = reducer(added, { type: 'favorite/toggle', id: 'a' })
    expect(removed.favorites).toEqual(['b'])
  })

  it('つくったを付けると今日の日付が入り、外すと記録ごと消える', () => {
    const added = reducer(base, { type: 'made/toggle', id: 'b' })
    expect(added.made.b).toEqual({ madeAt: today(), note: '' })

    const removed = reducer(added, { type: 'made/toggle', id: 'b' })
    expect(removed.made.b).toBeUndefined()
  })

  it('つくった記録が無いものに日付やメモを書いても、記録は生まれない', () => {
    const next = reducer(base, { type: 'made/setNote', id: 'z', note: 'あ' })
    expect(next).toBe(base)
    expect(next.made.z).toBeUndefined()
  })

  it('日付とメモを書き換えられる', () => {
    const dated = reducer(base, {
      type: 'made/setDate',
      id: 'a',
      madeAt: '2026-03-04',
    })
    expect(dated.made.a.madeAt).toBe('2026-03-04')
    expect(dated.made.a.note).toBe('メモ')

    const noted = reducer(dated, { type: 'made/setNote', id: 'a', note: 'あたらしい' })
    expect(noted.made.a.note).toBe('あたらしい')
  })

  it('もとの状態を書き換えない', () => {
    reducer(base, { type: 'favorite/toggle', id: 'b' })
    reducer(base, { type: 'made/toggle', id: 'b' })
    expect(base.favorites).toEqual(['a'])
    expect(Object.keys(base.made)).toEqual(['a'])
  })

  it('リセットで空になる', () => {
    expect(reducer(base, { type: 'data/reset' })).toEqual(emptyState)
  })

  it('別のタブが書いた内容を取り込む', () => {
    // タブAでおきにいり、タブBでつくったを足したとき、あとから保存した側が
    // 相手の記録を消さないよう、書かれた内容をそのまま採用する
    const fromOtherTab: UserState = {
      version: 1,
      favorites: ['a'],
      made: { b: { madeAt: '2026-09-01', note: '' } },
    }
    const next = reducer(base, { type: 'data/external', state: fromOtherTab })
    expect(next).toBe(fromOtherTab)
  })

  it('読み込みは、渡されたものを検証せずそのまま採用する', () => {
    // 中身の検証は parseState の仕事で、reducer はしない。
    // 呼ぶ側（設定画面）が parseState を通してから渡すこと。
    const incoming: UserState = {
      version: 1,
      favorites: ['x'],
      made: { x: { madeAt: '2026-02-03', note: 'よみこんだ' } },
    }
    expect(reducer(base, { type: 'data/import', state: incoming })).toBe(incoming)
  })
})
