import { memo } from 'react'
import { Link } from 'react-router'
import type { Model } from '../data/types'
import { LEVEL_KANA, sourceOf } from '../data'
import { isMyBooklet } from '../lib/myModels'
import PhotoImage from './PhotoImage'
import RemoteImage from './RemoteImage'
import { CheckIcon, StarIcon } from './icons'
import styles from './ModelCard.module.css'

type Props = {
  model: Model
  isFavorite: boolean
  isMade: boolean
  onToggleFavorite: (id: string) => void
}

/**
 * memo で包む。onToggleFavorite は store 側の useMemo で作られていて参照が
 * 変わらないので、★ を 1 つ押したときに他のカードは描き直されない。
 */
function ModelCard({ model, isFavorite, isMade, onToggleFavorite }: Props) {
  return (
    <li className={styles.item}>
      <Link to={`/model/${encodeURIComponent(model.id)}`} className={styles.card}>
        <div className={styles.thumbWrap}>
          {isMyBooklet(model) ? (
            <PhotoImage
              className={styles.thumb}
              id={model.id}
              alt={`${model.title} のしゃしん`}
            />
          ) : model.thumbnail ? (
            <RemoteImage
              className={styles.thumb}
              src={model.thumbnail}
              alt={`${model.title} のしゃしん`}
            />
          ) : (
            <div className={styles.noThumb} aria-hidden="true" />
          )}
          {/* どこから来た作品かは、開かなくても分かるようにする */}
          <span
            className={`${styles.source} ${isMyBooklet(model) ? styles.sourceMine : ''}`}
          >
            {sourceOf(model).shortLabel}
          </span>
          {model.level && (
            <span className={`${styles.level} ${styles[model.level]}`}>
              {LEVEL_KANA[model.level]}
            </span>
          )}
          {isMade && (
            <span className={styles.madeStamp}>
              <CheckIcon size={18} />
              つくった
            </span>
          )}
        </div>
        <p className={styles.title}>{model.title}</p>
      </Link>

      {/* カードを開かずに、その場でおきにいりを付け外しできるようにする */}
      <button
        type="button"
        className={isFavorite ? `${styles.fav} ${styles.favOn}` : styles.fav}
        aria-pressed={isFavorite}
        aria-label={
          isFavorite
            ? `${model.title} をおきにいりから はずす`
            : `${model.title} をおきにいりに いれる`
        }
        onClick={() => onToggleFavorite(model.id)}
      >
        <StarIcon size={22} filled={isFavorite} />
      </button>
    </li>
  )
}

export default memo(ModelCard)
