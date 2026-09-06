import { emptyFilters, type Filters } from './search'

/**
 * 「さがす」画面のしぼりこみと見ていた位置を、画面をまたいで持ち越す。
 *
 * React の state に置くと作品を開いた時点で消えてしまい、「きょうりゅう」で
 * 絞って何個か見比べる、という一番ふつうの使い方のたびに探し直しになる。
 * 履歴に載せると「戻る」の意味が変わってしまうので、モジュールスコープの
 * 変数に逃がしている。アプリを閉じて開き直せばまっさらに戻る（意図した挙動）。
 */
type BrowseState = {
  filters: Filters
  /** 「もっと見る」で開いている件数 */
  shown: number
  scrollY: number
}

const initial: BrowseState = {
  filters: emptyFilters,
  shown: 0,
  scrollY: 0,
}

let current: BrowseState = { ...initial }

export function getBrowseState(): BrowseState {
  return current
}

export function setBrowseState(patch: Partial<BrowseState>): void {
  current = { ...current, ...patch }
}

export function resetBrowseState(): void {
  current = { ...initial }
}
