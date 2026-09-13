import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { describe, it, expect } from 'vitest'

const context=vm.createContext({console:{warn(){}}})
context.window=context
vm.runInContext(readFileSync(new URL('../public/assemblies/vendor/three.min.js',import.meta.url),'utf8'),context)
vm.runInContext(readFileSync(new URL('../public/assemblies/viewer/realistic-parts.js',import.meta.url),'utf8'),context)
const T=context.THREE,parts=context.LaQRealisticParts

function connectedSquares(){
  const axis=new T.Vector3(1,0,0),dirs=[new T.Vector3(0,-Math.sqrt(3)/2,.5),new T.Vector3(0,Math.sqrt(3)/2,.5)]
  const inset=parts.obtuseJointInset(),by=new Map(),material=new T.MeshStandardMaterial(),plates=[]
  dirs.forEach((dir,i)=>{
    const at=(x,r)=>axis.clone().multiplyScalar(x).addScaledVector(dir,r).toArray()
    const piece={id:`plate-${i}`,partNo:1,pose:{vertices:[at(-.5,inset),at(.5,inset),at(.5,inset+1),at(-.5,inset+1)],normal:new T.Vector3().crossVectors(axis,dir).toArray()}}
    by.set(piece.id,piece);plates.push(parts.plate(T,piece,material))
  })
  const connection={ports:dirs.map((_,i)=>({port:i,piece:`plate-${i}`,socket:0}))}
  const joint=parts.joint(T,{id:'joint',partNo:5,pose:{center:[0,0,0],axis:[1,0,0]}},connection,by,material)
  for(const mesh of [joint,...plates])mesh.updateMatrixWorld(true)
  return {joint,plates,dirs,inset,axis}
}
const ray=(mesh,point,normal)=>new T.Raycaster(point.clone().add(normal),normal.clone().negate()).intersectObject(mesh,true)[0]

describe('No.5 joined to two No.1 plates',()=>{
  it('has the measured 4 mm inner edge and a perpendicular 3.5 mm mating edge',()=>{
    const {joint}=connectedSquares(),vertices=[]
    joint.traverse(mesh=>{
      if(!mesh.isMesh)return
      const positions=mesh.geometry.attributes.position
      for(let i=0;i<positions.count;i++){
        const p=new T.Vector3().fromBufferAttribute(positions,i).applyMatrix4(mesh.matrixWorld)
        if(Math.abs(p.x-.5)<1e-7)vertices.push(p)
      }
    })
    const top=Math.max(...vertices.map(p=>p.z)),bottom=Math.min(...vertices.map(p=>p.z))
    const width=z=>{const ys=vertices.filter(p=>Math.abs(p.z-z)<1e-7).map(p=>p.y);return (Math.max(...ys)-Math.min(...ys))*17}
    expect(width(top)).toBeCloseTo(4,5)
    expect(width(bottom)).toBeCloseTo(7.5,5)
    expect(Math.hypot((width(bottom)-width(top))/2,(top-bottom)*17)).toBeCloseTo(3.5,5)
  })

  it('keeps both fork surfaces flush with both plate surfaces along the entire socket',()=>{
    const {joint,plates,dirs,inset,axis}=connectedSquares()
    for(let i=0;i<2;i++)for(const sign of [-1,1]){
      const normal=new T.Vector3().crossVectors(axis,dirs[i]).multiplyScalar(sign)
      for(const r of [.03,.10,.18]){
        const point=dirs[i].clone().multiplyScalar(inset+r)
        const fork=ray(joint,point,normal),plate=ray(plates[i],point.clone().addScaledVector(axis,.48),normal)
        expect(fork).toBeDefined();expect(plate).toBeDefined()
        expect(fork.distance).toBeCloseTo(plate.distance,6)
        expect((1-fork.distance)*17).toBeCloseTo(1.75,5)
      }
      // The shoulder ends exactly at the plate's edge, not beyond/before it.
      const point=dirs[i].clone().multiplyScalar(inset).addScaledVector(axis,.4).addScaledVector(normal,1.75/17)
      let nearest=Infinity
      joint.traverse(mesh=>{if(mesh.isMesh){const p=mesh.geometry.attributes.position;for(let j=0;j<p.count;j++){
        const v=new T.Vector3().fromBufferAttribute(p,j).applyMatrix4(mesh.matrixWorld)
        if(Math.abs(v.x)>.27)nearest=Math.min(nearest,Math.hypot(v.y-point.y,v.z-point.z))
      }}})
      expect(nearest).toBeLessThan(1e-7)
    }
  })

  it('fills each rounded socket without a large overlap or an exposed gap',()=>{
    const {joint,plates,dirs,inset,axis}=connectedSquares()
    for(let i=0;i<2;i++)for(const sign of [-1,1]){
      const normal=new T.Vector3().crossVectors(axis,dirs[i]).multiplyScalar(sign)
      for(const x of [-.21,-.14,0,.14,.21]){
        const forkFace=[],plateFace=[]
        for(let r=.001;r<.24;r+=.001){
          const p=axis.clone().multiplyScalar(x).addScaledVector(dirs[i],inset+r)
          const a=ray(joint,p,normal),b=ray(plates[i],p,normal)
          if(a&&a.distance<1-1.75/17+.001)forkFace.push(r)
          if(b&&b.distance<1-1.75/17+.001)plateFace.push(r)
        }
        // Inspect the colour seam itself. Farther inward, No.1's reverse
        // surface deliberately drops into its recessed frame.
        expect(forkFace.length).toBeGreaterThan(0);expect(plateFace.length).toBeGreaterThan(0)
        const seam=Math.max(...forkFace),plateStart=Math.min(...plateFace)
        expect(plateStart-seam).toBeGreaterThan(-.004)
        expect(plateStart-seam).toBeLessThan(.008)
      }
    }
  })
})

it('keeps a manually oriented joint in place after its last plate is removed',()=>{
  const piece={id:'joint',partNo:6,pose:{center:[0,0,0],axis:[1,0,0],directions:{0:[0,0,1],1:[0,-1,0]}}}
  const plate={id:'plate',partNo:1,pose:{vertices:[[-.5,0,.1],[.5,0,.1],[.5,0,1.1],[-.5,0,1.1]],normal:[0,-1,0]}}
  const by=new Map([['plate',plate]]),material=new T.MeshStandardMaterial()
  const bounds=connection=>{
    const group=parts.joint(T,piece,connection,by,material);group.updateMatrixWorld(true)
    const box=new T.Box3().setFromObject(group)
    return [...box.min.toArray(),...box.max.toArray()]
  }
  const connected=bounds({ports:[{port:0,piece:'plate',socket:0}]}),detached=bounds(null)
  connected.forEach((value,i)=>expect(detached[i]).toBeCloseTo(value,6))
})

it.each([1,2])('swaps the visible front and rear relief of No.%i while preserving its socket outline',partNo=>{
  const vertices=partNo===1?[[-.5,-.5,0],[.5,-.5,0],[.5,.5,0],[-.5,.5,0]]:[[-.5,-Math.sqrt(3)/6,0],[.5,-Math.sqrt(3)/6,0],[0,Math.sqrt(3)/3,0]]
  const material=new T.MeshStandardMaterial(),piece={partNo,pose:{vertices,normal:[0,0,1]}}
  const before=parts.plate(T,piece,material),after=parts.plate(T,{...piece,pose:{...piece.pose,normal:[0,0,-1]}},material)
  before.updateMatrixWorld(true);after.updateMatrixWorld(true)
  const sample=partNo===1?new T.Vector3(.25,.25,0):new T.Vector3(0,Math.sqrt(3)/3*.71,0)
  const positive=new T.Vector3(0,0,1),negative=new T.Vector3(0,0,-1)
  const front=ray(before,sample,positive),rear=ray(before,sample,negative)
  expect(front).toBeDefined();expect(rear).toBeDefined()
  expect(Math.abs(front.distance-rear.distance)).toBeGreaterThan(.01)
  expect(ray(after,sample,positive).distance).toBeCloseTo(rear.distance,6)
  expect(ray(after,sample,negative).distance).toBeCloseTo(front.distance,6)
  const a=new T.Box3().setFromObject(before),b=new T.Box3().setFromObject(after)
  for(const axis of ['x','y']){expect(a.min[axis]).toBeCloseTo(b.min[axis],6);expect(a.max[axis]).toBeCloseTo(b.max[axis],6)}
})
