import chips from './Chips.module.css'

export type StatusOption<T extends string> = {
  value: T
  label: string
  /** あてはまる作品の数。名前とまぎれないよう、チップの中に小さな丸で添える */
  count?: number
}

type Props<T extends string> = {
  /** 読み上げに出るグループの名前 */
  label: string
  options: StatusOption<T>[]
  value: T
  onChange: (next: T) => void
  /**
   * 1 行に収まらないとき、横スクロールではなく折り返す。
   * スクロールできることに気づけないまま、右端の選択肢を
   * 見落とす列（「さがす」の きろく、マイライブラリの なかま など）で使う。
   */
  wrap?: boolean
}

/**
 * 1 つだけ選ぶチップの列。
 *
 * 押しボタンではなくラジオとして伝える（押した1つだけが選ばれている、という
 * 関係が読み上げに出る）。矢印キーの送り先まで含めてここ 1 か所に置く。
 * 「さがす」と「おきにいり」で別々に書くと、片方だけ矢印が効かなくなる。
 */
export default function StatusChips<T extends string>({
  label,
  options,
  value,
  onChange,
  wrap = false,
}: Props<T>) {
  return (
    <div
      className={wrap ? `${chips.chips} ${chips.wrap}` : chips.chips}
      role="radiogroup"
      aria-label={label}
    >
      {options.map((option, index) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          tabIndex={value === option.value ? 0 : -1}
          className={value === option.value ? `${chips.chip} ${chips.on}` : option.count === 0 ? `${chips.chip} ${chips.none}` : chips.chip}
          onClick={() => onChange(option.value)}
          onKeyDown={(event) => {
            const direction =
              event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 :
              event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 0
            if (!direction) return
            event.preventDefault()
            const next = (index + direction + options.length) % options.length
            onChange(options[next].value)
            event.currentTarget.parentElement
              ?.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus()
          }}
        >
          {option.label}
          {option.count !== undefined && (
            <span className={chips.count}>
              {' '}{option.count}<span className="visually-hidden">こ</span>
            </span>
          )}
        </button>
      ))}
    </div>
  )
}
