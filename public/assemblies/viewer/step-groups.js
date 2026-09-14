// Presentation-only grouping: physical ownership and the underlying action order stay intact.
const variantOf=guide=>guide.variants[guide.defaultVariant]
const stageMap=variant=>new Map([...variant.units.flatMap(u=>u.steps.map((s,i)=>[`unit:${u.id}:${i}`,s])),...variant.assembly.map((s,i)=>[`assembly:${i}`,s])])
export function groupedSequence(guide){
 const variant=variantOf(guide),stages=stageMap(variant),sequence=guide.sequence??guide.reading?.sequence??[...stages.keys()]
 const starts=new Map(),claimed=new Set(),names=new Set()
 if(guide.reading?.stepGroups!==undefined&&!Array.isArray(guide.reading.stepGroups))throw Error('Step groups must be an array')
 for(const group of guide.reading?.stepGroups??[]){
  if(!group||typeof group.id!=='string'||!/^[a-z0-9-]+$/.test(group.id)||names.has(group.id)||typeof group.title!=='string'||!group.title.trim()||!Array.isArray(group.keys)||group.keys.length<2)throw Error('Invalid step group')
  names.add(group.id)
  const start=sequence.indexOf(group.keys[0])
  if(start<0||group.keys.some((key,i)=>!stages.has(key)||sequence[start+i]!==key||claimed.has(key)))throw Error('Step groups must contain consecutive, non-overlapping steps')
  if(group.explodeGroups!==undefined){
   const added=new Set(group.keys.flatMap(key=>stages.get(key).newPieces)),blocks=group.explodeGroups
   if(!Array.isArray(blocks)||blocks.some(ids=>!Array.isArray(ids)||!ids.length))throw Error('Invalid step group explosion blocks')
   const flat=blocks.flat(),unique=new Set(flat)
   if(flat.length!==unique.size||unique.size!==added.size||flat.some(id=>!added.has(id)))throw Error('Step group explosion blocks must partition new pieces exactly once')
  }
  group.keys.forEach(key=>claimed.add(key));starts.set(group.keys[0],group)
 }
 return sequence.flatMap(key=>starts.has(key)?[`group:${starts.get(key).id}`]:claimed.has(key)?[]:[key])
}
export function combinedStepView(guide,id){
 groupedSequence(guide)
 const group=guide.reading?.stepGroups?.find(g=>g.id===id);if(!group)return null
 const variant=variantOf(guide),stages=stageMap(variant),selected=group.keys.map(key=>stages.get(key))
 const visible=[...new Set(selected.flatMap(s=>s.visiblePieces))],added=[...new Set(selected.flatMap(s=>s.newPieces))],addedSet=new Set(added),visibleSet=new Set(visible)
 const labelMembers=Object.fromEntries(variant.units.map(u=>[u.id,u.pieceIds.filter(id=>visibleSet.has(id))]).filter(([,ids])=>ids.length))
 // Keep the blocks prepared in each source step, including subdivisions within a unit.
 // Assembly steps repeat their input pieces and must not merge those blocks again.
 const explodeGroups=[],claimed=new Set()
 const addBlock=ids=>{const block=ids.filter(pid=>addedSet.has(pid)&&!claimed.has(pid));if(block.length){explodeGroups.push(block);block.forEach(pid=>claimed.add(pid))}}
 group.keys.forEach((key,i)=>{if(key.startsWith('unit:')){for(const ids of selected[i].explodeGroups??[])addBlock(ids);addBlock(selected[i].newPieces)}})
 Object.values(labelMembers).forEach(addBlock)
 return {id:`group:${id}`,label:group.title,quantity:1,pieceIds:visible,labelMembers,steps:[{id:`group-${id}`,title:group.title,presentation:'overview',visiblePieces:visible,newPieces:added,actions:selected.flatMap(s=>s.actions),explodeGroups:group.explodeGroups??explodeGroups}]}
}
// The completed model uses the same breakdown as its preparation steps.
// Attachment steps consume prepared blocks; they do not redefine their interiors.
export function completeExplodeGroups(guide){
 const variant=variantOf(guide),blocks=[],claimed=new Set()
 const add=ids=>{const rest=ids.filter(id=>!claimed.has(id));if(rest.length){blocks.push(rest);rest.forEach(id=>claimed.add(id))}}
 for(const key of groupedSequence(guide)){
  const [phase,id,index]=key.split(':')
  if(phase==='group')combinedStepView(guide,id).steps[0].explodeGroups.forEach(add)
  else if(phase==='unit'){
   const unit=variant.units.find(u=>u.id===id),step=unit.steps[Number(index)]
   if(step.explodeGroups)step.explodeGroups.forEach(add)
   else add(unit.pieceIds)
  }
 }
 variant.units.forEach(unit=>add(unit.pieceIds))
 return blocks
}
