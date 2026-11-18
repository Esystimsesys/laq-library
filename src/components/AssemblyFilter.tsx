import styles from './FilterBar.module.css'

type Props = {
  value: boolean
  onChange: (value: boolean) => void
  /** どこの作品か。3D と同じく「どの つくりかたを見るか」なので同じ列に並べる */
  sources: string[]
  sourceOptions: { value: string; label: string }[]
  onSourcesChange: (next: string[]) => void
}

/**
 * つくりかた（3D）と、どこの作品か の列。
 * 別の列にすると、スマホで開いたときに 1 まいめの作品が画面の下へ押し出される。
 */
export default function AssemblyFilter({ value, onChange, sources, sourceOptions, onSourcesChange }: Props) {
  return <div className={styles.group} role="group" aria-label="つくりかたで しぼる">
    <p className={styles.legend}>つくりかた・どこの さくひん<span className={styles.hint}>よこに うごかせるよ →</span></p>
    <div className={styles.chips}>
      <button type="button" aria-pressed={value} className={`${styles.chip} ${value ? styles.on : ''}`} onClick={() => onChange(!value)}>
        3Dで つくれる
      </button>
      <span className={styles.chipDivider} aria-hidden="true" />
      {sourceOptions.map(option => {
        const on = sources.includes(option.value)
        return <button
          key={option.value}
          type="button"
          aria-pressed={on}
          className={`${styles.chip} ${on ? styles.on : ''}`}
          onClick={() => onSourcesChange(on ? sources.filter(s => s !== option.value) : [...sources, option.value])}
        >
          {option.label}
        </button>
      })}
    </div>
  </div>
}
