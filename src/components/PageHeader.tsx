import styles from './PageHeader.module.css'

type Props = {
  title: string
  sub?: string
}

/** 各タブの上に出る見出し。ページの名前をいつも同じ場所に出す。 */
export default function PageHeader({ title, sub }: Props) {
  return (
    <header className={styles.header}>
      <h1 className={styles.title}>{title}</h1>
      {sub && <p className={styles.sub}>{sub}</p>}
    </header>
  )
}
