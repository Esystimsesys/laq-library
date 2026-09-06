import { describe, expect, it } from 'vitest'
import source from './sources/laq-official.json'
import { categories, models, modelById } from './index'
import type { SourceFile } from './types'

const file = source as SourceFile

describe('取り込んだ作品データ', () => {
  it('公式ギャラリーの件数ぶんある', () => {
    // 公式が作品を足したら、取り込み直して この数を更新する
    expect(file.models.length).toBe(245)
    expect(models.length).toBe(file.models.length)
  })

  it('id が重複していない', () => {
    expect(modelById.size).toBe(models.length)
  })

  it('表示に要るものが全部そろっている', () => {
    for (const m of models) {
      expect(m.title, m.id).not.toBe('')
      // 出典表記は画面に固定で書かず、データから出す
      expect(m.rightsHolder, m.id).not.toBe('')
      expect(m.sourceLinkLabel, m.id).not.toBe('')
      expect(m.thumbnail, m.id).toBeTruthy()
      expect(m.sourceUrl, m.id).toMatch(/^https:\/\/www\.laq\.co\.jp\//)
      expect(m.categories.length, m.id).toBeGreaterThan(0)
    }
  })

  it('つくり方の図が 1 枚もない作品はない', () => {
    const missing = models.filter((m) => m.stepImages.length === 0)
    expect(missing.map((m) => m.title)).toEqual([])
  })

  it('画像と PDF は公式サイトの URL を指している（複製していない）', () => {
    for (const m of models) {
      for (const url of [m.thumbnail, m.mainImage, m.pdfUrl, ...m.stepImages]) {
        if (url) expect(url, m.id).toMatch(/^https:\/\/www\.laq\.co\.jp\//)
      }
    }
  })

  it('レベルは 3 種類のいずれか', () => {
    for (const m of models) {
      expect(['beginner', 'intermediate', 'advanced'], m.id).toContain(m.level)
    }
  })

  it('カテゴリは並び順の定義に載っているものだけ', () => {
    for (const m of models) {
      for (const c of m.categories) {
        expect(file.categoryOrder, m.id).toContain(c)
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
})
