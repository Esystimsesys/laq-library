import type { ReactNode } from 'react'
import chips from './Chips.module.css'

type Props = {
  pressed: boolean
  onToggle: () => void
  /** えらんだときの色を変えるなど、見た目を足すとき */
  className?: string
  children: ReactNode
}

/** いくつでも選べる しぼりこみのチップ。押すたびに 入る／はずれる が切りかわる */
export default function ToggleChip({ pressed, onToggle, className, children }: Props) {
  return (
    <button
      type="button"
      aria-pressed={pressed}
      className={[chips.chip, pressed && chips.on, className].filter(Boolean).join(' ')}
      onClick={onToggle}
    >
      {children}
    </button>
  )
}
