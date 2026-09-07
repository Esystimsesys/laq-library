import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import type { Model } from '../data/types'
import { useLookup } from '../lib/lookup'
import { useApp } from '../store/useApp'
import EmptyState from '../components/EmptyState'
import ModelGrid from '../components/ModelGrid'
import PageHeader from '../components/PageHeader'
import StatusChips, { type StatusOption } from '../components/StatusChips'
import page from './Page.module.css'

type Status = 'all' | 'notMade' | 'made'

/** 言い方は「さがす」の しぼりこみ とそろえる */
const STATUSES: StatusOption<Status>[] = [
  { value: 'all', label: 'ぜんぶ' },
  { value: 'notMade', label: 'つくってない' },
  { value: 'made', label: 'つくった' },
]

export default function Favorites() {
  const { state } = useApp()
  const lookup = useLookup()
  const [status, setStatus] = useState<Status>('all')

  // 保存してあるのは id だけなので、作品データに引き当てる。
  // 取り込み直しで消えた作品が混ざっていても落ちないよう、見つからないものは捨てる。
  const list = useMemo(
    () =>
      state.favorites
        .map((id) => lookup(id))
        .filter((m): m is Model => Boolean(m)),
    [state.favorites, lookup],
  )

  // ★を付けたものが増えると「つぎ なに つくる？」が探しにくくなるので、
  // まだ つくっていないものだけを見られるようにする。
  const shown = useMemo(() => {
    if (status === 'all') return list
    const made = (m: Model) => Boolean(state.made[m.id])
    return list.filter((m) => (status === 'made' ? made(m) : !made(m)))
  }, [list, status, state.made])

  return (
    <div className={page.page}>
      <PageHeader title="おきにいり" sub={`${shown.length} こ`} />

      {list.length > 0 && (
        <StatusChips
          label="つくったかどうかで しぼる"
          options={STATUSES}
          value={status}
          onChange={setStatus}
        />
      )}

      <ModelGrid
        models={shown}
        // 自分で選んだぶんだけなので、区切らずに全部見せる
        paged={false}
        empty={
          list.length === 0 ? (
            <EmptyState
              title="まだ おきにいりが ありません"
              hint="きになる さくひんの ★ を おすと、ここに たまっていきます。"
              action={
                <Link to="/" className={page.linkButton}>
                  さくひんを さがす
                </Link>
              }
            />
          ) : (
            <EmptyState
              title={
                status === 'notMade'
                  ? 'おきにいりは ぜんぶ つくったね！'
                  : 'つくった きろくは まだ ありません'
              }
              hint={
                status === 'notMade'
                  ? 'あたらしい さくひんを さがしてみよう。'
                  : 'つくれたら、さくひんの ページで「つくった！」を おしてね。'
              }
              action={
                <button
                  type="button"
                  className={page.linkButton}
                  onClick={() => setStatus('all')}
                >
                  おきにいりを ぜんぶ みる
                </button>
              }
            />
          )
        }
      />
    </div>
  )
}
