import { useId, useState } from 'react'
import { categories as ALL_CATEGORIES, LEVEL_KANA } from '../data'
import type { Level } from '../data/types'
import { emptyFilters, isFiltering, type Filters } from '../lib/search'
import StatusChips, { type StatusOption } from './StatusChips'
import { CloseIcon, SearchIcon } from './icons'
import styles from './FilterBar.module.css'

const LEVELS: Level[] = ['beginner', 'intermediate', 'advanced']

const STATUSES: StatusOption<Filters['status']>[] = [
  { value: 'all', label: 'ぜんぶ' },
  { value: 'favorite', label: 'おきにいり' },
  { value: 'made', label: 'つくった' },
  { value: 'notMade', label: 'まだ' },
]

type Props = {
  filters: Filters
  onChange: (next: Filters) => void
  /** しぼりこんだ結果の件数 */
  hitCount: number
}

function toggle(list: string[], value: string): string[] {
  return list.includes(value)
    ? list.filter((v) => v !== value)
    : [...list, value]
}

export default function FilterBar({ filters, onChange, hitCount }: Props) {
  const [openCategories, setOpenCategories] = useState(false)
  const searchId = useId()
  const categoriesId = useId()
  const levelLabelId = useId()
  const categoryLabelId = useId()
  const recordLabelId = useId()

  return (
    <div className={styles.bar}>
      <div className={styles.searchRow}>
        <label className={styles.search} htmlFor={searchId}>
          <span className={styles.searchIcon}>
            <SearchIcon size={22} />
          </span>
          {/* プレースホルダは読み上げの名前にならないので、見えない名前を置く */}
          <span className="visually-hidden">なにを つくるか さがす</span>
          <input
            id={searchId}
            className={styles.input}
            type="search"
            inputMode="search"
            enterKeyHint="search"
            placeholder="なにを つくる？（きょうりゅう、くるま…）"
            value={filters.query}
            onChange={(e) => onChange({ ...filters, query: e.target.value })}
          />
          {filters.query !== '' && (
            <button
              type="button"
              className={styles.clear}
              aria-label="けんさくの ことばを けす"
              onClick={() => onChange({ ...filters, query: '' })}
            >
              <CloseIcon size={18} />
            </button>
          )}
        </label>
      </div>

      {/*
        しぼりこみのまとまりは fieldset ではなく div + role="group" にしている。
        読み上げでの伝わり方は同じだが、legend は行の高さの決まり方が
        ブラウザごとに違い、iPad の Safari で 2 つめ以降の見出しだけが
        24px 下がる（＝グループの間だけ広く見える）ことがあった。
      */}
      <div className={styles.group} role="group" aria-labelledby={levelLabelId}>
        <p className={styles.legend} id={levelLabelId}>むずかしさ</p>
        <div className={styles.chips}>
          {LEVELS.map((level) => (
            <button
              key={level}
              type="button"
              aria-pressed={filters.levels.includes(level)}
              className={`${styles.chip} ${styles[level]} ${
                filters.levels.includes(level) ? styles.on : ''
              }`}
              onClick={() =>
                onChange({ ...filters, levels: toggle(filters.levels, level) })
              }
            >
              {LEVEL_KANA[level]}
            </button>
          ))}
        </div>
      </div>

      <div className={styles.group} role="group" aria-labelledby={categoryLabelId}>
        <p className={styles.legend} id={categoryLabelId}>
          なかま{!openCategories && <span className={styles.hint}>よこに うごかせるよ →</span>}
        </p>
        {/* 展開ボタンが画面外に隠れると見つけられないので、スクロールする列の外に置く */}
        <div className={`${styles.categoryRow} ${openCategories ? styles.categoryRowOpen : ''}`}>
          <div
            id={categoriesId}
            className={
              openCategories ? `${styles.chips} ${styles.chipsOpen}` : styles.chips
            }
          >
            {ALL_CATEGORIES.map((category) => (
              <button
                key={category}
                type="button"
                aria-pressed={filters.categories.includes(category)}
                className={`${styles.chip} ${
                  filters.categories.includes(category) ? styles.on : ''
                }`}
                onClick={() =>
                  onChange({
                    ...filters,
                    categories: toggle(filters.categories, category),
                  })
                }
              >
                {category}
              </button>
            ))}
          </div>
          <button
            type="button"
            className={styles.moreChip}
            aria-controls={categoriesId}
            aria-expanded={openCategories}
            onClick={() => setOpenCategories((v) => !v)}
          >
            {openCategories ? '1れつに する' : 'ぜんぶ見る'}
          </button>
        </div>
      </div>

      <div className={styles.group} role="group" aria-labelledby={recordLabelId}>
        <p className={styles.legend} id={recordLabelId}>じぶんの きろく</p>
        {/* ここだけは 1 つしか選べないので、押しボタンではなくラジオとして伝える */}
        <StatusChips
          label="じぶんの きろく"
          options={STATUSES}
          value={filters.status}
          onChange={(status) => onChange({ ...filters, status })}
        />
      </div>

      <div className={styles.resultRow}>
        <p className={styles.count}>
          <strong>{hitCount}</strong> こ
        </p>
        {isFiltering(filters) && (
          <button
            type="button"
            className={styles.reset}
            onClick={() => onChange(emptyFilters)}
          >
            しぼりこみを ぜんぶ やめる
          </button>
        )}
      </div>
    </div>
  )
}
