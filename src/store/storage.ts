import type { BookletEntry, UserState } from './types'

const KEY = 'laq-library:v1'

export const emptyState: UserState = {
  version: 1,
  favorites: [],
  made: {},
  booklets: [],
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 保存してあるものを読む。壊れた JSON や、想定外の形が入っていても
 * アプリが起動しなくならないように、値ごとに確かめてから受け入れる。
 */
export function parseState(raw: unknown): UserState {
  if (!isRecord(raw) || raw.version !== 1) return emptyState

  const favorites = Array.isArray(raw.favorites)
    ? [...new Set(raw.favorites.filter((v): v is string => typeof v === 'string'))]
    : []

  const made: UserState['made'] = {}
  if (isRecord(raw.made)) {
    for (const [id, value] of Object.entries(raw.made)) {
      if (!isRecord(value)) continue
      made[id] = {
        madeAt: typeof value.madeAt === 'string' ? value.madeAt : '',
      }
    }
  }

  const booklets = Array.isArray(raw.booklets)
    ? raw.booklets.filter(isRecord).map(toBookletEntry)
    : []

  return { version: 1, favorites, made, booklets }
}

const LEVELS = ['beginner', 'intermediate', 'advanced'] as const

function toBookletEntry(raw: Record<string, unknown>): BookletEntry {
  const level = LEVELS.find((l) => l === raw.level) ?? null
  return {
    id: typeof raw.id === 'string' ? raw.id : `my-booklet:${crypto.randomUUID()}`,
    title: typeof raw.title === 'string' ? raw.title : '',
    booklet: typeof raw.booklet === 'string' ? raw.booklet : '',
    page: typeof raw.page === 'string' ? raw.page : '',
    level,
    categories: Array.isArray(raw.categories)
      ? raw.categories.filter((c): c is string => typeof c === 'string')
      : [],
    note: typeof raw.note === 'string' ? raw.note : '',
    hasPhoto: raw.hasPhoto === true,
    createdAt: typeof raw.createdAt === 'string' ? raw.createdAt : '',
  }
}

/** 記録が 1 件でも入っているか。空のファイルで今の記録を消さないための判定。 */
export function hasAnyRecord(state: UserState): boolean {
  return (
    state.favorites.length > 0 ||
    Object.keys(state.made).length > 0 ||
    state.booklets.length > 0
  )
}

export function loadState(): UserState {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return emptyState
    return parseState(JSON.parse(raw))
  } catch {
    return emptyState
  }
}

/** localStorage のキー。storage イベントの判別にも使う。 */
export const STORAGE_KEY = KEY

/**
 * 保存できたら true。容量超過やプライベートブラウジングでは false を返す。
 * 黙って握りつぶすと、画面では記録が増えたのに読み込み直すと消えていて、
 * 子どもには「アプリが嘘をついた」ようにしか見えないため、呼ぶ側に伝える。
 *
 * 中身が変わっていないときは書かない。別のタブの変更を取り込んだ直後に
 * 同じ内容を書き戻して、タブ間で無駄に反応し合うのを防ぐ。
 */
export function saveState(state: UserState): boolean {
  try {
    const next = JSON.stringify(state)
    if (localStorage.getItem(KEY) === next) return true
    localStorage.setItem(KEY, next)
    return true
  } catch {
    return false
  }
}

export function clearState(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // 何もしない
  }
}
