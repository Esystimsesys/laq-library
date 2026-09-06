/** 端末のなかだけに置く、その人の記録。作品データ本体はここに入れない。 */
export type MadeRecord = {
  /** 作った日（YYYY-MM-DD） */
  madeAt: string
  /** ひとことメモ。空文字なら未記入 */
  note: string
}

/**
 * 手元の LaQ の冊子から自分で登録した作品。
 * 冊子は商品に付いてくる著作物なので、つくり方の図は取り込まない。
 * 「どの冊子の何ページに何があるか」を引けるようにするための索引。
 */
export type BookletEntry = {
  /** 'my-booklet:<乱数>' */
  id: string
  title: string
  /** 冊子の名前（例: ベーシック401、ダイナソーワールド） */
  booklet: string
  /** ページ番号。分からなければ空文字 */
  page: string
  level: 'beginner' | 'intermediate' | 'advanced' | null
  categories: string[]
  note: string
  /** 写真を IndexedDB に持っているか */
  hasPhoto: boolean
  createdAt: string
}

export type UserState = {
  version: 1
  /** Model['id'] の配列。あとから足したものが先頭に来る */
  favorites: string[]
  made: Record<string, MadeRecord>
  /** 自分で登録した作品。あとから足したものが先頭 */
  booklets: BookletEntry[]
}
