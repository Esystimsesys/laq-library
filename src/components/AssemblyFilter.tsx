import styles from './FilterBar.module.css'

export default function AssemblyFilter({ value, onChange }: { value: boolean; onChange: (value: boolean) => void }) {
  return <div className={styles.group} role="group" aria-label="つくりかたで しぼる">
    <p className={styles.legend}>つくりかた</p>
    <div className={styles.chips}>
      <button type="button" aria-pressed={value} className={`${styles.chip} ${value ? styles.on : ''}`} onClick={() => onChange(!value)}>
        3Dで つくれる
      </button>
    </div>
  </div>
}
