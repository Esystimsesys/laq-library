import { useMemo } from 'react'
import { Link } from 'react-router'
import { models } from '../data'
import type { Model } from '../data/types'
import { useLookup } from '../lib/lookup'
import { useApp } from '../store/useApp'
import EmptyState from '../components/EmptyState'
import ModelGrid from '../components/ModelGrid'
import PageHeader from '../components/PageHeader'
import styles from './Made.module.css'
import page from './Page.module.css'

export default function Made() {
  const { state } = useApp()
  const lookup = useLookup()

  // 作った日の新しい順。同じ日なら名前順にして、並びが毎回変わらないようにする
  const list = useMemo(() => {
    return Object.entries(state.made)
      .map(([id, record]) => ({ model: lookup(id), record }))
      .filter((x): x is { model: Model; record: (typeof x)['record'] } =>
        Boolean(x.model),
      )
      .sort((a, b) => {
        if (a.record.madeAt !== b.record.madeAt) {
          return a.record.madeAt < b.record.madeAt ? 1 : -1
        }
        return a.model.title.localeCompare(b.model.title, 'ja')
      })
      .map((x) => x.model)
  }, [state.made, lookup])

  const total = models.length + state.booklets.length
  const percent = Math.round((list.length / total) * 100)

  return (
    <div className={page.page}>
      <PageHeader title="つくった" sub={`${list.length} こ`} />

      {list.length > 0 && (
        <div className={styles.meter}>
          <div className={styles.meterBar}>
            <div
              className={styles.meterFill}
              style={{ width: `${Math.max(percent, 2)}%` }}
            />
          </div>
          <p className={styles.meterText}>
            ぜんぶで {total} この うち <strong>{list.length}</strong> こ
            （{percent}%）
          </p>
        </div>
      )}

      <ModelGrid
        models={list}
        empty={
          <EmptyState
            title="まだ きろくが ありません"
            hint="つくれたら、さくひんの ページで「つくった！」を おしてね。"
            action={
              <Link to="/" className={page.linkButton}>
                さくひんを さがす
              </Link>
            }
          />
        }
      />
    </div>
  )
}
