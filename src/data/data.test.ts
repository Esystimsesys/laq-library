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
      expect(m.categories.length, m.id).toBeGreaterThan(0)
    }
    // 完成写真は「無ければカードを絵なしで出す」方針（本家の記事へは飛べる）。
    // 全件あるべきなのは、詳細ページから必ず取れる公式ギャラリーのほうだけ。
    for (const m of file.models) expect(m.thumbnail, m.id).toBeTruthy()
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

  it('ぷりまつラボの写真は、作品ごとにちがう', () => {
    // 完成写真は記事のアイキャッチから取る。本文の画像を拾いにいくと、
    // 書き手のアイコン（吹き出し）や「つくるパーツ」の写真が先に来て、
    // 同じ URL が何十件もの作品に付いてしまう。その取り違えをここで止める。
    const count = new Map<string, number>()
    for (const m of purimatu.models) {
      if (m.thumbnail) count.set(m.thumbnail, (count.get(m.thumbnail) ?? 0) + 1)
    }
    const shared = [...count].filter(([, n]) => n >= 5)
    expect(shared).toEqual([])
  })

  it('ぷりまつラボの完成写真は、ほとんどの作品にある', () => {
    // 写真の無い作品も落とさず出すが、多ければ取り込みが壊れている。
    // しきい値は取り込みスクリプトの見張りと同じ 2 割にそろえてある
    // （scripts/fetch-purimatu.mjs の report を参照）。
    const withoutPhoto = purimatu.models.filter((m) => !m.thumbnail)
    expect(withoutPhoto.length).toBeLessThan(purimatu.models.length * 0.2)
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

  it('なかまのチップは ポケモンが先頭', () => {
    // いちばん件数が多く、いちばんよく押す。ソースの並び順にまかせると
    // あとから足したソースぶんが最後に回り、横スクロールの奥に隠れる
    expect(categories[0]).toBe('ポケモン')
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
