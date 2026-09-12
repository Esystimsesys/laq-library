// Model coordinates are edge-length units (1 = 17 mm). Rotate a whole selection about its center.
export function transformPieces(guide, ids, translationMm, rotationDeg) {
  if (![...translationMm,...rotationDeg].every(Number.isFinite)) throw new Error('移動量・角度には数値を入力してください。')
  const model = guide.variants[guide.defaultVariant].model, selected = new Set(ids)
  const byId = new Map(model.pieces.map(p=>[p.id,p]))
  const mean = points=>[0,1,2].map(i=>points.reduce((sum,p)=>sum+p[i],0)/points.length)
  const normalize = vector => {const length=Math.hypot(...vector);return length?vector.map(value=>value/length):vector}
  // The renderer normally infers each joint's fork directions from the plates
  // connected to it. Capture those directions before an edit so rotating one
  // plate cannot visually rotate an unselected joint on the next redraw.
  for(const connection of model.connections){
    const joint=byId.get(connection.joint)
    if(!joint||joint.pose.directions||(!selected.has(joint.id)&&!connection.ports.some(port=>selected.has(port.piece))))continue
    const axis=normalize(joint.pose.axis),directions={}
    for(const port of connection.ports){
      const plate=byId.get(port.piece),vertices=plate?.pose?.vertices
      if(!vertices?.length)continue
      const a=vertices[port.socket],b=vertices[(port.socket+1)%vertices.length],mid=a.map((value,i)=>(value+b[i])/2),center=mean(vertices)
      const inward=center.map((value,i)=>value-mid[i]),dot=inward.reduce((sum,value,i)=>sum+value*axis[i],0)
      directions[port.port]=normalize(inward.map((value,i)=>value-dot*axis[i]))
    }
    if(Object.keys(directions).length)joint.pose.directions=directions
  }
  const pieces = model.pieces.filter(p=>selected.has(p.id))
  if(!pieces.length)throw new Error('パーツを選んでください。')
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
    if(p.pose.directions)for(const key of Object.keys(p.pose.directions))p.pose.directions[key]=rotate(p.pose.directions[key])
  }
  return guide
}
