import laqOfficial from './sources/laq-official.json'
import type { Model, SourceFile } from './types'

// ソースを足すときはここに import と配列への追加を書く
const SOURCE_FILES: SourceFile[] = [laqOfficial as SourceFile]

export const models: Model[] = SOURCE_FILES.flatMap((f) => f.models)

export const modelById: ReadonlyMap<string, Model> = new Map(
  models.map((m) => [m.id, m]),
)

export const sources = SOURCE_FILES.map(
  ({ source, sourceLabel, rightsHolder, sourceUrl, fetchedAt, models: list }) => ({
    source,
    sourceLabel,
    rightsHolder,
    sourceUrl,
    fetchedAt,
    count: list.length,
  }),
)

/**
 * チップに出すカテゴリ。ソースが決めた並び順を尊重しつつ、
 * 実際に 1 件も付いていないカテゴリは出さない。
 */
export const categories: string[] = (() => {
  const used = new Set(models.flatMap((m) => m.categories))
  const ordered: string[] = []
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
