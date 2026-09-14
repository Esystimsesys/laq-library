import laqOfficial from './sources/laq-official.json'
import original from './sources/original.json'
import purimatu from './sources/purimatu.json'
import type { Model, SourceFile, SourceId, SourceInfo } from './types'

// ソースを足すときはここに import と配列への追加を書く
const SOURCE_FILES: SourceFile[] = [
  laqOfficial as SourceFile,
  purimatu as SourceFile,
  original as SourceFile,
]

const sourceModels = SOURCE_FILES.flatMap((f) => f.models)

/** 「さがす」では、制作者から登録されたオリジナル作品を先頭に置く。 */
export const models: Model[] = [
  ...sourceModels.filter((model) => model.source === 'original'),
  ...sourceModels.filter((model) => model.source !== 'original'),
]

export const modelById: ReadonlyMap<string, Model> = new Map(
  models.map((m) => [m.id, m]),
)

export const sources = SOURCE_FILES.map(
  ({ models: list, ...info }) => ({ ...info, count: list.length }),
)

/** 自分で登録した作品ぶん。取り込みではないので、出典も権利者も自分になる。 */
export const MY_BOOKLET_SOURCE: SourceInfo = {
  source: 'my-booklet',
  sourceLabel: 'じぶんで とうろく',
  shortLabel: 'じぶんの',
  rightsHolder: '手元の LaQ の冊子',
  sourceLinkLabel: '',
  sourceUrl: '',
}

const sourceInfoById = new Map<SourceId, SourceInfo>(
  SOURCE_FILES.map(
    ({ source, sourceLabel, shortLabel, rightsHolder, sourceLinkLabel, sourceUrl }) => [
      source,
      { source, sourceLabel, shortLabel, rightsHolder, sourceLinkLabel, sourceUrl },
    ],
  ),
)
sourceInfoById.set(MY_BOOKLET_SOURCE.source, MY_BOOKLET_SOURCE)

/** その作品がどこから来たか。出典表記とリンクの文言はここから取る。 */
export function sourceOf(model: Model): SourceInfo {
  const info = sourceInfoById.get(model.source)
  if (!info) throw new Error(`知らないソースです: ${model.source}`)
  return info
}

/** 外部URLはそのまま、public内の作品画像は配信先のベースパス付きで返す。 */
export function modelImageUrl(url: string): string {
  return /^https?:\/\//.test(url)
    ? url
    : `${import.meta.env.BASE_URL}${url.replace(/^\/+/, '')}`
}

/**
 * チップの先頭に固定するカテゴリ。
 * ソースの並び順どおりだと、あとから足したソースのカテゴリが最後に回り、
 * 横スクロールの奥に隠れてしまう。いちばんよく押すものはここに書く。
 */
const PINNED_CATEGORIES = ['ポケモン']

/**
 * チップに出すカテゴリ。先頭の固定ぶんのあとは、ソースが決めた並び順を
 * 尊重しつつ、実際に 1 件も付いていないカテゴリは出さない。
 */
export const categories: string[] = (() => {
  const used = new Set(models.flatMap((m) => m.categories))
  const ordered: string[] = []
  for (const c of PINNED_CATEGORIES) if (used.has(c)) ordered.push(c)
  for (const file of SOURCE_FILES) {
    for (const c of file.categoryOrder) {
      if (used.has(c) && !ordered.includes(c)) ordered.push(c)
    }
  }
  // 並び順の指定から漏れたカテゴリも落とさない
  for (const c of used) if (!ordered.includes(c)) ordered.push(c)
  return ordered
})()

export const LEVEL_LABELS = {
  beginner: '初級',
  intermediate: '中級',
  advanced: '上級',
} as const

/** 子ども向けの言い換え。一覧のフィルタはこちらを使う。 */
export const LEVEL_KANA = {
  beginner: 'かんたん',
  intermediate: 'ふつう',
  advanced: 'むずかしい',
} as const
