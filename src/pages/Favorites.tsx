import { useMemo } from 'react'
import { Link } from 'react-router'
import type { Model } from '../data/types'
import { useLookup } from '../lib/lookup'
import { useApp } from '../store/useApp'
import EmptyState from '../components/EmptyState'
import ModelGrid from '../components/ModelGrid'
import PageHeader from '../components/PageHeader'
import page from './Page.module.css'

export default function Favorites() {
  const { state } = useApp()
  const lookup = useLookup()

  // 保存してあるのは id だけなので、作品データに引き当てる。
  // 取り込み直しで消えた作品が混ざっていても落ちないよう、見つからないものは捨てる。
  const list = useMemo(
    () =>
      state.favorites
        .map((id) => lookup(id))
        .filter((m): m is Model => Boolean(m)),
    [state.favorites, lookup],
  )

  return (
    <div className={page.page}>
      <PageHeader title="おきにいり" sub={`${list.length} こ`} />
      <ModelGrid
        models={list}
        empty={
          <EmptyState
            title="まだ おきにいりが ありません"
            hint="きになる さくひんの ★ を おすと、ここに たまっていきます。"
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
