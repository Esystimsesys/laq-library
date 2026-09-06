/**
 * つくり方ひとつ分。
 *
 * 今は公式ギャラリーだけを取り込んでいるが、あとから別のサイトを足せるように
 * ソースを跨いだ形にそろえてある。追加するときは
 *   1. SourceId に union を足す
 *   2. その取り込みスクリプトで src/data/sources/<id>.json を作る
 *   3. src/data/index.ts の import に 1 行足す
 * だけで済み、画面側にはソースごとの分岐を書かない。
 * （レベルが無いソースがあり得るので、level は最初から null を許している）
 */
export type SourceId = 'laq-official' | 'purimatu'

export type Level = 'beginner' | 'intermediate' | 'advanced'

export type Model = {
  /** '<source>:<そのソースでの id>'。取り込み直しても変わらない */
  id: string
  source: SourceId
  /** 出典ページ。詳細画面から必ずここへリンクする */
  sourceUrl: string
  title: string
  description: string
  level: Level | null
  categories: string[]
  /** 画像と PDF は複製せず、出典サイトの URL をそのまま参照する */
  thumbnail: string | null
  mainImage: string | null
  stepImages: string[]
  pdfUrl: string | null
}

/**
 * ソースごとに 1 度だけ持つ情報。作品 1 件ずつに同じ文字列を持たせると、
 * 1000 件を超えたときに同梱するデータが目に見えて重くなる。
 */
export type SourceInfo = {
  source: SourceId
  sourceLabel: string
  /** 画像・図・PDF の権利者。詳細画面の出典表記に出す */
  rightsHolder: string
  /** 出典ページへ飛ぶボタンの文言 */
  sourceLinkLabel: string
  /** そのソースのトップページ */
  sourceUrl: string
}

export type SourceFile = SourceInfo & {
  fetchedAt: string
  /** そのソースが決めたカテゴリの並び順（画面のチップの順番） */
  categoryOrder: string[]
  models: Model[]
}
