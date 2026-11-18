import { describe, expect, it } from 'vitest'
import { SITES, toModels } from './fetch-blogs.mjs'

const site = (id) => SITES.find((s) => s.id === id)
const post = (slug, title, content = '') => ({
  id: slug,
  slug,
  link: `https://example.com/${slug}/`,
  title: { rendered: title },
  content: { rendered: content },
  featured_media: 0,
})

describe('個人ブログの記事から作品を取り出す', () => {
  it('ラキューポケモン.com は図鑑番号と英語名を落とす', () => {
    const { models } = toModels(
      site('laq-pokemon'),
      [
        post('a', '0006G リザードン キョダイマックス Charizard G-Max', '【かえんポケモン】 ［簡単］'),
        post('b', '0083 カモネギ Farfetch’d'),
        post('c', '0029 ニドラン♀ Nidoran♀'),
        post('d', '0130i ギャラドス(色違い) Gyarados'),
      ],
      {},
    )
    expect(models.map((m) => m.title)).toEqual([
      'リザードン キョダイマックス',
      'カモネギ',
      'ニドラン♀',
      'ギャラドス(色違い)',
    ])
    expect(models[0].level).toBe('beginner')
    expect(models[1].level).toBeNull()
    expect(models[0].description).toContain('かえんポケモン')
  })

  it('わらばあ は作り方の記事だけを拾い、かぎかっこ・よみがなを外す', () => {
    const { models, skipped } = toModels(
      site('warabar'),
      [
        post('t-rex', 'LaQ(ラキュー)で恐竜「ティーレックス」の作り方'),
        post('train', 'LaQ(ラキュー)新幹線(しんかんせん)の作り方'),
        post('jasmine', 'LaQ(ラキュー)アラジンのジャスミン作り方'),
        post('eevee', 'LaQ(ラキュー)でイーブイの作り方【人気のポケモン】'),
        post('kindle', 'LaQ(ラキュー)作り方の本を無料で読む方法'),
        post('matome', '【まとめ】LaQ(ラキュー)でポケモンの作り方を紹介'),
      ],
      {},
    )
    expect(models.map((m) => [m.title, m.categories[0]])).toEqual([
      ['ティーレックス', 'きょうりゅう'],
      ['新幹線', 'のりもの'],
      ['アラジンのジャスミン', 'キャラクター・くうそう'],
      ['イーブイ', 'ポケモン'],
    ])
    expect(models[1].description).toContain('しんかんせん')
    expect(skipped).toHaveLength(2)
  })

  it('365日の知育 は見出しの種類と難易度を読む', () => {
    const { models } = toModels(
      site('chiiku365'),
      [post('beetle', '【LaQ昆虫】カブトムシの作り方（普通・立体モデル）', '<p>立体カブトムシの完成写真です。</p>')],
      {},
    )
    expect(models[0]).toMatchObject({
      id: 'chiiku365:beetle',
      title: 'カブトムシ',
      level: 'intermediate',
      categories: ['むし'],
      stepImages: [],
    })
  })
})
