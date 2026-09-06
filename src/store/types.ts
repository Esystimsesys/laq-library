/** 端末のなかだけに置く、その人の記録。作品データ本体はここに入れない。 */
export type MadeRecord = {
  /** 作った日（YYYY-MM-DD） */
  madeAt: string
  /** ひとことメモ。空文字なら未記入 */
  note: string
}

export type UserState = {
  version: 1
  /** Model['id'] の配列。あとから足したものが先頭に来る */
  favorites: string[]
  made: Record<string, MadeRecord>
}
