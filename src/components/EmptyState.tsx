import styles from './EmptyState.module.css'

type Props = {
  title: string
  hint?: string
  action?: React.ReactNode
}

/** 「1 件も無い」ときに、行き止まりに見えないようにする案内。 */
export default function EmptyState({ title, hint, action }: Props) {
  return (
    <div className={styles.box}>
      {/* LaQ のパーツを 3 つ並べただけの飾り */}
      <svg
        className={styles.parts}
        viewBox="0 0 120 44"
        aria-hidden="true"
        focusable="false"
      >
        <rect x="4" y="8" width="28" height="28" rx="5" fill="var(--blue)" stroke="var(--ink)" strokeWidth="2.5" />
        <path d="M60 6 76 34 44 34Z" fill="var(--yellow)" stroke="var(--ink)" strokeWidth="2.5" strokeLinejoin="round" />
        <rect x="88" y="8" width="28" height="28" rx="5" fill="var(--red)" stroke="var(--ink)" strokeWidth="2.5" />
      </svg>
      <p className={styles.title}>{title}</p>
      {hint && <p className={styles.hint}>{hint}</p>}
      {action && <div className={styles.action}>{action}</div>}
    </div>
  )
}
