import { expect, it } from 'vitest'
import { models } from '../data'
import { collectionModels } from './collection'
import type { UserState } from '../store/types'

it('お気に入りと作った作品を重複なく統合し、元の記録や消えた作品を扱える', () => {
  const [a,b,c] = models
  const state: UserState = {version:1, favorites:[a.id,'missing'], made:{[a.id]:{madeAt:'2026-01-01'},[b.id]:{madeAt:'2026-02-01'},[c.id]:{madeAt:'2026-03-01'},missing:{madeAt:'2026-04-01'}}, booklets:[]}
  const before=structuredClone(state)
  expect(collectionModels(state,id=>models.find(m=>m.id===id)).map(m=>m.id)).toEqual([a.id,c.id,b.id])
  expect(state).toEqual(before)
  delete state.made[b.id]
  expect(collectionModels(state,id=>models.find(m=>m.id===id)).map(m=>m.id)).toEqual([a.id,c.id])
})
