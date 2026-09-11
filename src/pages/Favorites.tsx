import { useMemo } from 'react'
import { Link, useSearchParams } from 'react-router'
import { assemblyForModel } from '../assemblies/catalog'
import { collectionModels } from '../lib/collection'
import { useLookup } from '../lib/lookup'
import { useApp } from '../store/useApp'
import AssemblyFilter from '../components/AssemblyFilter'
import EmptyState from '../components/EmptyState'
import ModelGrid from '../components/ModelGrid'
import PageHeader from '../components/PageHeader'
import StatusChips, { type StatusOption } from '../components/StatusChips'
import page from './Page.module.css'

type Status = 'all' | 'notMade' | 'made'
const STATUSES: StatusOption<Status>[] = [
  { value: 'all', label: 'ぜんぶ' },
  { value: 'notMade', label: 'つくってない' },
  { value: 'made', label: 'つくった' },
]

export default function Favorites() {
  const { state } = useApp()
  const lookup = useLookup()
  const [params, setParams] = useSearchParams()
  const status: Status = params.get('status') === 'made' ? 'made' : params.get('status') === 'notMade' ? 'notMade' : 'all'
  const only3d = params.get('3d') === '1'
  const update = (key: string, value: string | null) => {
    const next = new URLSearchParams(params)
    if (value === null) next.delete(key); else next.set(key, value)
    setParams(next, { replace: true })
  }
  const list = useMemo(() => collectionModels(state, lookup), [state, lookup])
  const madeCount = list.filter(m => Boolean(state.made[m.id])).length
  const shown = list.filter(m => (!only3d || assemblyForModel(m.id)) && (status === 'all' || (status === 'made' ? Boolean(state.made[m.id]) : !state.made[m.id])))

  return <div className={page.page}>
    <PageHeader title="マイライブラリ" sub={`つくった ${madeCount} こ`} />
    <p className={page.note}>おきにいりと つくった さくひんが、ここに ならぶよ。</p>
    {list.length > 0 && <>
      <StatusChips label="つくったかどうかで しぼる" options={STATUSES} value={status} onChange={value => update('status', value === 'all' ? null : value)} />
      <AssemblyFilter value={only3d} onChange={value => update('3d', value ? '1' : null)} />
      <p className={page.note}>{shown.length} / {list.length} こ</p>
    </>}
    <ModelGrid models={shown} favoriteButton={false} paged={false} empty={list.length === 0 ?
      <EmptyState title="まだ さくひんが ありません" hint="きになる さくひんに ★ をつけたり、「つくった！」を きろくすると、ここに たまります。" action={<Link to="/" className={page.linkButton}>さくひんを さがす</Link>} /> :
      <EmptyState
        title={only3d ? '3Dで つくれる さくひんは ありません' : status === 'notMade' ? 'ここにある さくひんは ぜんぶ つくったね！' : 'つくった きろくは まだ ありません'}
        hint={only3d ? 'しぼりこみを やめると、ほかの さくひんも みられるよ。' : status === 'notMade' ? 'あたらしい さくひんを さがしてみよう。' : 'つくれたら、さくひんの ページで「つくった！」を おしてね。'}
        action={<button type="button" className={page.linkButton} onClick={() => setParams({}, { replace: true })}>マイライブラリを ぜんぶ みる</button>}
      />
    } />
  </div>
}
