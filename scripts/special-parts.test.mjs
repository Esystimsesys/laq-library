import { readFileSync } from 'node:fs'
import vm from 'node:vm'
import { describe, it, expect } from 'vitest'

const context=vm.createContext({console:{warn(){}}})
context.window=context
for(const file of ['vendor/three.min.js','viewer/special-parts.js'])
  vm.runInContext(readFileSync(new URL(`../public/assemblies/${file}`,import.meta.url),'utf8'),context)
const T=context.THREE,parts=context.LaQSpecialParts,profile=parts.profile
const material=new T.MeshStandardMaterial()
const shaftPose={center:[0,0,0],axis:[1,0,0],directions:{0:[0,1,0],1:[0,-1,0]},axleDirection:[0,0,1]}
const create=(partNo,pose)=>{const mesh=parts.create(T,{partNo,pose},material);mesh.updateMatrixWorld(true);return mesh}
const ray=(mesh,origin,direction)=>new T.Raycaster(new T.Vector3(...origin),new T.Vector3(...direction)).intersectObject(mesh,true)

describe('mini Hamacron image-derived meshes',()=>{
  it('keeps only the axle bore open and fills the sectors between raised spokes on both faces',()=>{
    const wheel=create('mini-wheel',{center:[0,0,0],axis:[0,0,1]})
    for(const sign of [-1,1])for(const x of [0,.07,-.07])
      expect(ray(wheel,[x,0,sign],[0,0,-sign])).toHaveLength(0)
    expect(ray(wheel,[0,0,0],[1,0,0])[0].distance).toBeCloseTo(profile.wheelBoreRadius,3)
    for(const sign of [-1,1])for(const r of [.15,.23,.30])for(let i=0;i<36;i++){
      const a=i*Math.PI/18
      expect(ray(wheel,[r*Math.cos(a),r*Math.sin(a),sign],[0,0,-sign]).length).toBeGreaterThan(0)
    }
    for(let i=0;i<3;i++){
      const a=i*Math.PI*2/3
      expect(ray(wheel,[.23*Math.cos(a),.23*Math.sin(a),1],[0,0,-1]).length).toBeGreaterThan(0)
      const between=a+Math.PI/3
      for(const sign of [-1,1]){
        const raised=ray(wheel,[.23*Math.cos(a),.23*Math.sin(a),sign],[0,0,-sign])[0]
        const recessed=ray(wheel,[.23*Math.cos(between),.23*Math.sin(between),sign],[0,0,-sign])[0]
        expect(recessed.object.name).toBe('solid-wheel-web')
        // The user photo shows a pronounced rib below the surrounding rim.
        expect((raised.point.z-recessed.point.z)*sign*profile.edgeMm).toBeGreaterThan(1)
        const rim=ray(wheel,[.33*Math.cos(a),.33*Math.sin(a),sign],[0,0,-sign])[0]
        expect(raised.point.z*sign).toBeLessThan(rim.point.z*sign)
      }
    }
  })

  it('leaves both plate insertion pockets open and retains the 17 mm connector direction',()=>{
    const shaft=create('mini-shaft',shaftPose)
    for(const sign of [-1,1]){
      // Rays run down each empty fork pocket until the solid central web.
      const pocket=ray(shaft,[0,sign,0],[0,-sign,0])[0]
      expect(pocket.point.y).toBeCloseTo(sign*3.5/34,5)
      // Outer fork skin is present above and below the bed.
      for(const face of [-1,1])expect(ray(shaft,[0,sign*.25,face],[0,0,-face]).length).toBeGreaterThan(0)
    }
    const box=new T.Box3().setFromObject(shaft)
    expect(box.max.x-box.min.x).toBeCloseTo(1,2)
    expect(box.max.y-box.min.y).toBeCloseTo(profile.shaftWidth,4)
    expect(box.max.z).toBeCloseTo(profile.axleEnd,5)
  })

  it('puts the wheel on the directed axle with clearance and retaining lips beyond its far face',()=>{
    const shaft=create('mini-shaft',shaftPose)
    const wheel=create('mini-wheel',{center:[0,0,profile.wheelCenterOffset],axis:[0,0,1]})
    const box=new T.Box3().setFromObject(wheel)
    expect(box.max.z).toBeCloseTo(.46,5)
    expect(box.min.z).toBeCloseTo(.18,5)
    expect(profile.wheelBoreRadius).toBeGreaterThan(profile.axleRadius)
    // An axial ray in the clearance annulus first hits the retaining lip.
    const lip=ray(shaft,[.105,0,1],[0,0,-1])[0]
    expect(lip.point.z).toBeGreaterThan(box.max.z)
    // A radial ray through the split stays empty across the separated pin halves.
    expect(ray(shaft,[0,-1,.40],[0,1,0])).toHaveLength(0)
    expect(ray(shaft,[.04,-1,.40],[0,1,0]).length).toBeGreaterThan(0)
  })

  it('adds a third open fork opposite the axle, including for older two-direction poses',()=>{
    for(const pose of [shaftPose,{...shaftPose,directions:{...shaftPose.directions,2:[0,0,-1]}}]){
      const shaft=create('mini-shaft',pose)
      expect(shaft.userData.physicalPorts).toBe(3)
      shaft.userData.plateDirections[2].forEach((value,i)=>expect(value).toBeCloseTo([0,0,-1][i],6))
      const opening=ray(shaft,[0,0,-1],[0,0,1])[0]
      expect(opening.point.z).toBeCloseTo(-profile.shaftThickness/2,5)
      for(const side of [-1,1]){
        const face=ray(shaft,[0,side,-.25],[0,-side,0])[0]
        expect(face.object.name).toBe('third-plate-fork')
        expect(face.point.y*side).toBeGreaterThan(.07)
        expect(face.point.y*side).toBeLessThan(profile.shaftThickness/2)
        expect(face.face.normal.y*side).toBeGreaterThan(.9)
      }
      expect(new T.Box3().setFromObject(shaft).min.z).toBeCloseTo(-profile.shaftWidth/2,4)
      expect(shaft.userData.wheelCenter[2]).toBe(profile.wheelCenterOffset)
    }
  })

  it('has an open circular blind recess at both shaft ends with real walls and a closed floor',()=>{
    const shaft=create('mini-shaft',shaftPose),end=.498;
    for(const side of [-1,1]){
      // The first axial surface is the recessed floor, including off-centre
      // samples that would hit a leftover fork skin if the cavity were blocked.
      for(const [y,z] of [[0,0],[.025,0],[0,.04]]){
        const hit=ray(shaft,[side,y,z],[-side,0,0])[0]
        expect(hit.point.x).toBeCloseTo(side*(end-profile.shaftEndRecessDepth),5)
      }
      const rim=ray(shaft,[side,.075,0],[-side,0,0])[0]
      expect(rim.point.x).toBeCloseTo(side*end,5)
      const wall=ray(shaft,[side*(end-.025),0,0],[0,1,0])[0]
      expect(wall.distance).toBeCloseTo(profile.shaftEndRecessRadius,5)
      expect(wall.point.x).toBeCloseTo(side*(end-.025),5)
    }
  })

  it('rotates and translates the axle, forks, and through bore together',()=>{
    const shaft=create('mini-shaft',{center:[2,3,4],axis:[0,1,0],directions:{0:[0,0,1],1:[0,0,-1]},axleDirection:[-1,0,0]})
    const center=new T.Vector3(...shaft.userData.wheelCenter)
    expect(center.x).toBeCloseTo(2-profile.wheelCenterOffset,6)
    expect(center.y).toBe(3);expect(center.z).toBe(4)
    const wheel=create('mini-wheel',{center:center.toArray(),axis:[-1,0,0]})
    expect(ray(wheel,[3,3,4],[-1,0,0])).toHaveLength(0)
    expect(ray(shaft,[1,3.04,4],[1,0,0])[0].point.x).toBeCloseTo(2-profile.axleEnd,5)
    // With the axle pointing -X, the third plate pocket points +X.
    const pocket=ray(shaft,[3,3,4],[-1,0,0])[0]
    expect(pocket.point.x).toBeCloseTo(2+profile.shaftThickness/2,5)
  })

  it('rejects missing and inconsistent shaft directions rather than silently misplacing an axle',()=>{
    expect(()=>create('mini-shaft',{...shaftPose,axleDirection:undefined})).toThrow(/axleDirection/)
    expect(()=>create('mini-shaft',{...shaftPose,axleDirection:[1,0,0]})).toThrow(/perpendicular/)
    expect(()=>create('mini-shaft',{...shaftPose,directions:{0:[0,1,0],1:[0,1,0]}})).toThrow(/opposing/)
    expect(()=>create('mini-shaft',{...shaftPose,directions:{...shaftPose.directions,2:[0,0,1]}})).toThrow(/third plate direction/)
  })
})
