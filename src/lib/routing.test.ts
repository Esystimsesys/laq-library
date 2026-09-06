import { matchRoutes } from 'react-router'
import { describe, expect, it } from 'vitest'
import { models } from '../data'

/**
 * 一覧のリンクは `/model/${encodeURIComponent(id)}` を作り、詳細画面は
 * useParams の値をそのまま id として使う。react-router はマッチの前に
 * パスを 1 回デコードするので、詳細側でもう一度デコードしてはいけない。
 * ここを間違えると、% を含む id で URIError になり画面全体が落ちる。
 *
 * matchPath ではなく matchRoutes を使うこと。デコードするのは matchRoutes 側で、
 * matchPath 単体はエンコードされたままの値を返す。
 */
const routes = [{ path: '/model/:modelId' }]

function paramFor(id: string): string | undefined {
  const matches = matchRoutes(routes, `/model/${encodeURIComponent(id)}`)
  return matches?.[0]?.params.modelId
}

describe('作品ページの URL', () => {
  it('いまの id（コロンを含む）が往復する', () => {
    expect(paramFor('laq-official:005171')).toBe('laq-official:005171')
  })

  it('% やスラッシュ、空白を含む id でも往復する（別ソースを足したとき用）', () => {
    expect(paramFor('other:100%off')).toBe('other:100%off')
    expect(paramFor('other:a/b')).toBe('other:a/b')
    expect(paramFor('other:ねこ 2')).toBe('other:ねこ 2')
  })

  it('取り込み済みの全作品が、URL を通しても同じ id に戻る', () => {
    const broken = models.filter((m) => paramFor(m.id) !== m.id)
    expect(broken.map((m) => m.id)).toEqual([])
  })

  it('受け取った値をもう一度デコードすると壊れる（だからしていない）', () => {
    const param = paramFor('other:100%off')
    expect(param).toBe('other:100%off')
    expect(() => decodeURIComponent(param!)).toThrow(URIError)
  })
})
