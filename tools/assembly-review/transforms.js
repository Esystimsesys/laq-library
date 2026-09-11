// Model coordinates are edge-length units (1 = 17 mm). Rotate a whole selection about its center.
export function transformPieces(guide, ids, translationMm, rotationDeg) {
  if (![...translationMm,...rotationDeg].every(Number.isFinite)) throw new Error('移動量・角度には数値を入力してください。')
  const pieces = guide.variants[guide.defaultVariant].model.pieces.filter(p=>ids.includes(p.id))
  if(!pieces.length)throw new Error('パーツを選んでください。')
  const mean = points=>[0,1,2].map(i=>points.reduce((sum,p)=>sum+p[i],0)/points.length)
  const center = mean(pieces.map(p=>p.pose.center??mean(p.pose.vertices)))
  const rotate = vector => {
    let [x,y,z]=vector
    for(let i=0;i<3;i++){
      const c=Math.cos(rotationDeg[i]*Math.PI/180),s=Math.sin(rotationDeg[i]*Math.PI/180)
      if(i===0)[y,z]=[y*c-z*s,y*s+z*c]
      if(i===1)[x,z]=[x*c+z*s,-x*s+z*c]
      if(i===2)[x,y]=[x*c-y*s,x*s+y*c]
    }
    return [x,y,z]
  }
  const move=point=>rotate(point.map((v,i)=>v-center[i])).map((v,i)=>v+center[i]+translationMm[i]/17)
  for(const p of pieces){
    if(p.pose.center)p.pose.center=move(p.pose.center)
    if(p.pose.vertices)p.pose.vertices=p.pose.vertices.map(move)
    for(const key of ['normal','axis'])if(p.pose[key])p.pose[key]=rotate(p.pose[key])
  }
  return guide
}
