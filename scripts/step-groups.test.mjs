import {describe,it,expect} from 'vitest'
import {groupedSequence,combinedStepView,completeExplodeGroups} from '../public/assemblies/viewer/step-groups.js'
function fixture(){
 const step=(id,visiblePieces,newPieces)=>({id,title:id,visiblePieces,newPieces,actions:[{id}]})
 return {defaultVariant:'v',sequence:['unit:A:0','unit:A:1','unit:B:0','assembly:0','unit:C:0','assembly:1'],variants:{v:{model:{pieces:['a','b','c','d'].map(id=>({id}))},units:[{id:'A',pieceIds:['a','b'],steps:[step('a1',['a'],['a']),step('a2',['a','b'],['b'])]},{id:'B',pieceIds:['c'],steps:[step('b',['c'],['c'])]},{id:'C',pieceIds:['d'],steps:[step('c',['d'],['d'])]}],assembly:[step('ab',['a','b','c'],['c']),step('abc',['a','b','c','d'],['d'])]}},reading:{stepGroups:[{id:'first',title:'まとめて作る',keys:['unit:A:0','unit:A:1','unit:B:0','assembly:0']}]}}
}
describe('presentation step groups',()=>{
 it('combines consecutive steps without modifying physical units, source actions or the source sequence',()=>{
  const guide=fixture(),before=structuredClone(guide),view=combinedStepView(guide,'first')
  expect(groupedSequence(guide)).toEqual(['group:first','unit:C:0','assembly:1'])
  expect(view.labelMembers).toEqual({A:['a','b'],B:['c']})
  expect(view.steps[0].visiblePieces).toEqual(['a','b','c'])
  expect(view.steps[0].actions).toEqual([{id:'a1'},{id:'a2'},{id:'b'},{id:'ab'}])
  expect(view.steps[0].explodeGroups).toEqual([['a'],['b'],['c']])
  expect(guide).toEqual(before)
 })
 it('rejects nonconsecutive, overlapping and duplicate group references',()=>{
  for(const change of [g=>g.reading.stepGroups[0].keys=['unit:A:0','unit:B:0'],g=>g.reading.stepGroups.push({id:'overlap',title:'重複',keys:['unit:B:0','assembly:0']}),g=>g.reading.stepGroups.push({...g.reading.stepGroups[0]})]){const g=fixture();change(g);expect(()=>groupedSequence(g)).toThrow()}
 })
 it('preserves ungrouped guides',()=>{const g=fixture();delete g.reading.stepGroups;expect(groupedSequence(g)).toEqual(g.sequence);expect(combinedStepView(g,'missing')).toBeNull()})
 it('can join pieces across units into one rigid block without losing or duplicating pieces',()=>{
  const g=fixture();g.reading.stepGroups[0].explodeGroups=[['a'],['b','c']]
  expect(combinedStepView(g,'first').steps[0].explodeGroups).toEqual([['a'],['b','c']])
  expect(combinedStepView(g,'first').labelMembers).toEqual({A:['a','b'],B:['c']})
  for(const blocks of [[['a'],['b']],[['a','b'],['b','c']],[['a'],['b','unknown']]]){g.reading.stepGroups[0].explodeGroups=blocks;expect(()=>groupedSequence(g)).toThrow()}
 })
 it('preserves preparation blocks in the completed model instead of regrouping attachment inputs',()=>{
  const g=fixture();g.reading.stepGroups[0].explodeGroups=[['a'],['b','c']]
  g.variants.v.units[2].steps[0].explodeGroups=[['d']]
  const before=structuredClone(g)
  expect(completeExplodeGroups(g)).toEqual([['a'],['b','c'],['d']])
  expect(g).toEqual(before)
 })
})
