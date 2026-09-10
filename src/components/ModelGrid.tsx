import { useMemo, useState } from 'react'
import type { Model } from '../data/types'
import { useApp } from '../store/useApp'
import ModelCard from './ModelCard'
import styles from './ModelGrid.module.css'

const PAGE = 24

type Props = {
  models: Model[]
  /** 1 件も無いときに出すもの */
  empty: React.ReactNode
  /**
   * これが変わったら「もっと見る」を最初の状態に戻す。
   * 検索やしぼりこみを変えたときだけ戻したいので、一覧そのものではなく
   * 呼ぶ側が渡す。おきにいりの一覧で ★ を外しただけで先頭に戻るのは困る。
   */
  resetKey?: unknown
  /** 前に開いていた件数。0 なら最初の 1 ページぶんから */
  shown?: number
  onShownChange?: (shown: number) => void
  /**
   * false なら「もっと見る」を出さず、はじめから全部ならべる。
   * 自分で ★ を付けた数だけの一覧に「もっと見る」があると、
   * 自分の持ちものが隠れているように見えるため。
   */
  paged?: boolean
  /**
   * false ならカードに ★ を出さない。おきにいりの一覧では全部に付いているので
   * 情報にならず、押しまちがえると一覧から消えてしまうため。
   */
  favoriteButton?: boolean
}

export default function ModelGrid({
  models,
  empty,
  resetKey,
  shown: initialShown = 0,
  onShownChange,
  paged = true,
  favoriteButton = true,
}: Props) {
  const { state, actions } = useApp()
  // ★ が付いているかはカードの数だけ引くので、配列を毎回なめると
  // 件数の 2 乗になる。おきにいりは全部いちどに並べるため、ここが効く。
  const favorites = useMemo(() => new Set(state.favorites), [state.favorites])
  const [shown, setShownState] = useState(() => Math.max(initialShown, PAGE))
  const [seenKey, setSeenKey] = useState(resetKey)

  const setShown = (next: number) => {
    setShownState(next)
    onShownChange?.(next)
  }

  // 描画中に前の値と比べて直す（effect を挟むと一度多く描画されるため）
  if (seenKey !== resetKey) {
    setSeenKey(resetKey)
    setShownState(PAGE)
  }

  if (models.length === 0) return <>{empty}</>

  const visible = paged ? models.slice(0, shown) : models
  const rest = models.length - visible.length

  return (
    <>
      <ul className={styles.grid}>
        {visible.map((model) => (
          <ModelCard
            key={model.id}
            model={model}
            isFavorite={favorites.has(model.id)}
            isMade={Boolean(state.made[model.id])}
            onToggleFavorite={favoriteButton ? actions.toggleFavorite : undefined}
          />
        ))}
      </ul>
      {rest > 0 && (
        <button
          type="button"
          className={styles.more}
          onClick={() => setShown(shown + PAGE)}
        >
          もっと見る（あと {rest}）
        </button>
      )}
    </>
  )
}
