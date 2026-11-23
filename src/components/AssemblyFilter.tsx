import { FilterGroup } from './FilterPanel'
import ToggleChip from './ToggleChip'
import chips from './Chips.module.css'

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
  return <FilterGroup legend="つくりかた・どこの さくひん" hint="よこに うごかせるよ →" name="つくりかたで しぼる">
    <div className={chips.chips}>
      <ToggleChip pressed={value} onToggle={() => onChange(!value)}>3Dで つくれる</ToggleChip>
      <span className={chips.divider} aria-hidden="true" />
      {sourceOptions.map(option => {
        const on = sources.includes(option.value)
        return <ToggleChip
          key={option.value}
          pressed={on}
          onToggle={() => onSourcesChange(on ? sources.filter(s => s !== option.value) : [...sources, option.value])}
        >
          {option.label}
        </ToggleChip>
      })}
    </div>
  </FilterGroup>
}
