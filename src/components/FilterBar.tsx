import AssemblyFilter from './AssemblyFilter'
import { useId, useState } from 'react'
import { categories as ALL_CATEGORIES, LEVEL_KANA } from '../data'
import type { Level } from '../data/types'
import { emptyFilters, isFiltering, type Filters } from '../lib/search'
import StatusChips, { type StatusOption } from './StatusChips'
import { CloseIcon, SearchIcon } from './icons'
import { FilterGroup, FilterPanel, FilterResult } from './FilterPanel'
import ToggleChip from './ToggleChip'
import chips from './Chips.module.css'
import styles from './FilterBar.module.css'

const LEVELS: Level[] = ['beginner', 'intermediate', 'advanced']

/** 言い方は「おきにいり」の しぼりこみ とそろえる */
const STATUSES: StatusOption<Filters['status']>[] = [
  { value: 'all', label: 'ぜんぶ' },
  { value: 'favorite', label: 'おきにいり' },
  { value: 'made', label: 'つくった' },
  { value: 'notMade', label: 'つくってない' },
]

type Props = {
  filters: Filters
  onChange: (next: Filters) => void
  /** しぼりこんだ結果の件数 */
  hitCount: number
  /** しぼりこむ前の全体の件数。しぼりこんでいるときだけ「x / 全体」で出す */
  totalCount: number
  /** どこの作品かの選択肢。自分で登録した作品が端末にあるときは そのぶんも入る */
  sourceOptions: { value: string; label: string }[]
}

function toggle(list: string[], value: string): string[] {
  return list.includes(value)
    ? list.filter((v) => v !== value)
    : [...list, value]
}

export default function FilterBar({ filters, onChange, hitCount, totalCount, sourceOptions }: Props) {
  const [openCategories, setOpenCategories] = useState(false)
  const searchId = useId()
  const categoriesId = useId()

  return (
    <FilterPanel>
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
            placeholder="なにを つくる？"
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

      <AssemblyFilter
        value={filters.only3d}
        onChange={only3d => onChange({ ...filters, only3d })}
        sources={filters.sources}
        sourceOptions={sourceOptions}
        onSourcesChange={sources => onChange({ ...filters, sources })}
      />

      <FilterGroup legend="むずかしさ">
        <div className={chips.chips}>
          {LEVELS.map((level) => (
            <ToggleChip
              key={level}
              pressed={filters.levels.includes(level)}
              className={styles[level]}
              onToggle={() =>
                onChange({ ...filters, levels: toggle(filters.levels, level) })
              }
            >
              {LEVEL_KANA[level]}
            </ToggleChip>
          ))}
        </div>
      </FilterGroup>

      <FilterGroup legend="なかま" hint={!openCategories && 'よこに うごかせるよ →'}>
        {/* 展開ボタンが画面外に隠れると見つけられないので、スクロールする列の外に置く */}
        <div className={`${styles.categoryRow} ${openCategories ? styles.categoryRowOpen : ''}`}>
          <div
            id={categoriesId}
            className={`${chips.chips} ${styles.categoryChips} ${openCategories ? chips.wrap : ''}`}
          >
            {ALL_CATEGORIES.map((category) => (
              <ToggleChip
                key={category}
                pressed={filters.categories.includes(category)}
                onToggle={() =>
                  onChange({
                    ...filters,
                    categories: toggle(filters.categories, category),
                  })
                }
              >
                {category}
              </ToggleChip>
            ))}
          </div>
          <button
            type="button"
            className={chips.moreChip}
            aria-controls={categoriesId}
            aria-expanded={openCategories}
            onClick={() => setOpenCategories((v) => !v)}
          >
            {openCategories ? '1れつに する' : 'ぜんぶ見る'}
          </button>
        </div>
      </FilterGroup>

      <FilterGroup legend="じぶんの きろく">
        {/* ここだけは 1 つしか選べないので、押しボタンではなくラジオとして伝える */}
        <StatusChips
          label="じぶんの きろく"
          options={STATUSES}
          value={filters.status}
          onChange={(status) => onChange({ ...filters, status })}
          wrap
        />
      </FilterGroup>

      <FilterResult
        hitCount={hitCount}
        totalCount={totalCount}
        filtering={isFiltering(filters)}
        onReset={() => onChange(emptyFilters)}
      />
    </FilterPanel>
  )
}
