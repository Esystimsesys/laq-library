import { useId, type ReactNode } from 'react'
import styles from './FilterPanel.module.css'

/**
 * しぼりこみの外枠。「さがす」と「マイライブラリ」で同じ見た目にする。
 * 中には FilterGroup を並べ、最後に FilterResult を置く。
 */
export function FilterPanel({ children }: { children: ReactNode }) {
  return <div className={styles.panel}>{children}</div>
}

type GroupProps = {
  /** 見出しに出すことば */
  legend: string
  /** 見出しのあとに小さく添える案内（「よこに うごかせるよ →」など） */
  hint?: ReactNode
  /** 読み上げのグループ名を見出しと変えたいときだけ渡す */
  name?: string
  children: ReactNode
}

/**
 * 見出しつきの しぼりこみの 1 まとまり。
 *
 * fieldset ではなく div + role="group" にしている。
 * 読み上げでの伝わり方は同じだが、legend は行の高さの決まり方が
 * ブラウザごとに違い、iPad の Safari で 2 つめ以降の見出しだけが
 * 24px 下がる（＝グループの間だけ広く見える）ことがあった。
 */
export function FilterGroup({ legend, hint, name, children }: GroupProps) {
  const labelId = useId()
  return (
    <div
      className={styles.group}
      role="group"
      {...(name ? { 'aria-label': name } : { 'aria-labelledby': labelId })}
    >
      <p className={styles.legend} id={labelId}>
        {legend}
        {hint && <span className={styles.hint}>{hint}</span>}
      </p>
      {children}
    </div>
  )
}

type ResultProps = {
  /** しぼりこんだ結果の件数 */
  hitCount: number
  /** しぼりこむ前の件数。しぼりこんでいるときだけ「x / 全体」で出す */
  totalCount: number
  filtering: boolean
  onReset: () => void
}

/** 件数と、しぼりこみを まとめて やめるボタン */
export function FilterResult({ hitCount, totalCount, filtering, onReset }: ResultProps) {
  return (
    <div className={styles.resultRow}>
      {/* しぼりこんでいないときに「1472 / 1472」と出しても同じ数のくり返しになる */}
      <p className={styles.count}>
        <strong>{hitCount}</strong>
        {filtering && ` / ${totalCount}`} こ
      </p>
      {filtering && (
        <button type="button" className={styles.reset} onClick={onReset}>
          しぼりこみを ぜんぶ やめる
        </button>
      )}
    </div>
  )
}
