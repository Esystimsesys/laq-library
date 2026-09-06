import { Component, type ErrorInfo, type ReactNode } from 'react'
import styles from './ErrorBoundary.module.css'

type Props = { children: ReactNode }
type State = { error: Error | null }

/**
 * 予期しない例外で真っ白な画面にならないようにする。
 * 記録は localStorage にあるので、読み込み直せばたいてい元に戻る。
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(error, info)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children

    return (
      <div className={styles.box}>
        <h1 className={styles.title}>うまく ひらけませんでした</h1>
        <p className={styles.text}>
          いちど よみこみ なおしてみてください。
          おきにいりと つくったきろく は きえていません。
        </p>
        <button
          type="button"
          className={styles.button}
          onClick={() => window.location.reload()}
        >
          よみこみ なおす
        </button>
        <pre className={styles.detail}>{error.message}</pre>
      </div>
    )
  }
}
