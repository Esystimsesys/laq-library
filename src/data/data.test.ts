import { describe, expect, it } from 'vitest'
import source from './sources/laq-official.json'
import purimatuSource from './sources/purimatu.json'
import { categories, models, modelById, sourceOf, sources } from './index'
import type { SourceFile } from './types'

const file = source as SourceFile
const purimatu = purimatuSource as SourceFile

describe('取り込んだ作品データ', () => {
  it('公式ギャラリーの件数ぶんある', () => {
    // 公式が作品を足したら、取り込み直して この数を更新する
    expect(file.models.length).toBe(245)
  })

  it('id が重複していない', () => {
    expect(modelById.size).toBe(models.length)
  })

  it('表示に要るものが全部そろっている', () => {
    for (const m of models) {
      expect(m.title, m.id).not.toBe('')
      expect(m.thumbnail, m.id).toBeTruthy()
      expect(m.categories.length, m.id).toBeGreaterThan(0)
    }
  })

  it('出典表記は画面に固定で書かず、ソース情報から引ける', () => {
    for (const s of sources) {
      expect(s.rightsHolder, s.source).not.toBe('')
      expect(s.sourceLinkLabel, s.source).not.toBe('')
    }
    for (const m of models) expect(() => sourceOf(m)).not.toThrow()
  })

  it('公式ソースは、つくり方の図が 1 枚もない作品はない', () => {
    const missing = file.models.filter((m) => m.stepImages.length === 0)
    expect(missing.map((m) => m.title)).toEqual([])
  })

  it('画像と PDF は、その作品の出典サイトの URL を指している（複製していない）', () => {
    // これは方針の歯止め。オフライン対応のためにローカルへ落としたくなっても、
    // ここが落ちることで「複製しない」という決めごとを思い出せる。
    for (const m of models) {
      const host = new URL(m.sourceUrl).host
      for (const url of [m.thumbnail, m.mainImage, m.pdfUrl, ...m.stepImages]) {
        if (url) expect(new URL(url).host, `${m.id} ${url}`).toBe(host)
      }
    }
  })

  it('レベルは 3 種類か、書いていなければ null', () => {
    for (const m of models) {
      expect(['beginner', 'intermediate', 'advanced', null], m.id).toContain(m.level)
    }
    // 公式ギャラリーは全件にレベルがある
    for (const m of file.models) expect(m.level, m.id).not.toBeNull()
  })

  it('ぷりまつラボも取り込めている', () => {
    expect(purimatu.models.length).toBeGreaterThan(1000)
    expect(models.length).toBe(file.models.length + purimatu.models.length)
    // 手順の写真は持たず、本家の記事へ送る方針
    expect(purimatu.models.every((m) => m.stepImages.length === 0)).toBe(true)
  })

  it('カテゴリは、そのソースの並び順の定義に載っているものだけ', () => {
    const orders = { [file.source]: file.categoryOrder, [purimatu.source]: purimatu.categoryOrder }
    for (const m of models) {
      for (const c of m.categories) {
        expect(orders[m.source], m.id).toContain(c)
      }
    }
  })

  it('画面に出すカテゴリは、1 件以上ついているものだけ', () => {
    const used = new Set(models.flatMap((m) => m.categories))
    expect(categories.every((c) => used.has(c))).toBe(true)
    expect(categories.length).toBe(used.size)
  })

  it('分類できずに「その他」へ落ちた作品はない', () => {
    const other = models.filter((m) => m.categories.includes('その他'))
    expect(other.map((m) => m.title)).toEqual([])
  })

  it('id はソースをまたいで衝突しない', () => {
    const bySource = new Set(models.map((m) => m.id.split(':')[0]))
    expect([...bySource].sort()).toEqual(['laq-official', 'purimatu'])
  })
})
