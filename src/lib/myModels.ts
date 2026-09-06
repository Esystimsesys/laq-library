import { MY_BOOKLET_SOURCE } from '../data'
import type { Model } from '../data/types'
import type { BookletEntry } from '../store/types'

/**
 * 自分で登録した冊子の作品を、取り込んだ作品と同じ形にそろえる。
 * こうしておくと、一覧・検索・おきにいり・つくった の仕組みを
 * そのまま使えて、画面側に「自分の作品かどうか」の分岐が散らばらない。
 */
export function toModel(entry: BookletEntry): Model {
  return {
    id: entry.id,
    source: MY_BOOKLET_SOURCE.source,
    sourceUrl: '',
    title: entry.title,
    // 冊子名とページも検索に引っかかってほしいので、説明文に混ぜる
    description: [entry.booklet, entry.page && `${entry.page}ページ`, entry.note]
      .filter(Boolean)
      .join(' '),
    level: entry.level,
    categories: entry.categories,
    // 写真は IndexedDB にあるので URL は持たない（画面側が id で引く）
    thumbnail: null,
    mainImage: null,
    stepImages: [],
    pdfUrl: null,
  }
}

export function isMyBooklet(model: Model): boolean {
  return model.source === MY_BOOKLET_SOURCE.source
}
