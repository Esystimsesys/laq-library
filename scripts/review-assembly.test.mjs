import { afterEach, expect, it } from 'vitest'
import { mkdtempSync, readFileSync, writeFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { once } from 'node:events'
import { get as httpGet } from 'node:http'
import { initWorkspace, validateWorkspace } from './author-assembly.mjs'
import { createReviewServer } from './review-assembly.mjs'
import { transformPieces } from '../tools/assembly-review/transforms.js'
const cleanup=[]
afterEach(async()=>{for(const fn of cleanup.splice(0).reverse())await fn()})
async function setup(){
 const dir=mkdtempSync(path.join(tmpdir(),'laq-review-'));cleanup.push(()=>rmSync(dir,{recursive:true,force:true}))
 const photo=path.join(dir,'photo.jpg');writeFileSync(photo,'original photo')
 const workspace=path.join(dir,'work');initWorkspace({workspace,slug:'sample',modelId:'purimatu:sample',title:'Sample',article:'https://example.com/',photos:[photo],fromGuide:'public/assemblies/metamon/guide.json'})
 const server=createReviewServer({workspace});server.listen(0,'127.0.0.1');await once(server,'listening');cleanup.push(()=>new Promise(resolve=>{server.closeAllConnections();server.close(resolve)}))
 const origin=`http://127.0.0.1:${server.address().port}`
 const get=()=>fetch(origin+'/api/workspace').then(r=>r.json())
 const post=(body,headers={})=>fetch(origin+'/api/save',{method:'POST',headers:{origin,'Content-Type':'application/json',...headers},body:JSON.stringify(body)})
 const data=await get();const body={baseVersion:data.version,guide:data.guide,review:data.review,photos:data.manifest.photos,changes:['test correction']}
 return {workspace,origin,get,post,body,data}
}
it('saves a correction, backs up the previous guide and rejects stale concurrent saves',async()=>{
 const {workspace,post,body,get}=await setup(),before=readFileSync(path.join(workspace,'guide.json'),'utf8')
 const p=body.guide.variants[body.guide.defaultVariant].model.pieces[0];p.color='red'
 expect((await post(body)).status).toBe(200)
 expect((await get()).guide.variants[body.guide.defaultVariant].model.pieces[0].color).toBe('red')
 const history=readdirSync(path.join(workspace,'history'));expect(history).toHaveLength(1)
 expect(readFileSync(path.join(workspace,'history',history[0],'guide.json'),'utf8')).toBe(before)
 expect((await post(body)).status).toBe(409)
 expect(readFileSync(path.join(workspace,'photos/photo-1.jpg'),'utf8')).toBe('original photo')
})
it('rejects invalid geometry and cross-origin saves without changing files',async()=>{
 const {workspace,origin,post,body}=await setup(),before=readFileSync(path.join(workspace,'guide.json'),'utf8')
 expect((await post(body,{origin:'https://other.example'})).status).toBe(403)
 body.guide.variants[body.guide.defaultVariant].model.pieces[0].partNo=99
 expect((await post(body)).status).toBe(400)
 expect(readFileSync(path.join(workspace,'guide.json'),'utf8')).toBe(before)
 expect((await fetch(origin+'/photo/not-a-photo')).status).toBe(404)
 expect((await fetch(origin+'/manifest.json')).status).toBe(404)
 expect(await new Promise((resolve,reject)=>httpGet(origin+'/api/workspace',{headers:{host:'attacker.example'}},res=>{res.resume();resolve(res.statusCode)}).on('error',reject))).toBe(403)
})
it('records explicit human review, permits export and invalidates review on the next edit',async()=>{
 const {workspace,post,body,get}=await setup()
 expect((await post({...body,markReviewed:true})).status).toBe(400)
 body.review.reviewer='test reviewer';body.review.notes='写真確認のテスト。実物は未確認。';body.review.unresolved.forEach(i=>i.status='resolved')
 expect((await post({...body,markReviewed:true})).status).toBe(200)
 expect(validateWorkspace({workspace,forExport:true}).review.physicalCheck).toBe('not-performed')
 const current=await get()
 expect((await post({...body,baseVersion:current.version})).status).toBe(200)
 expect(()=>validateWorkspace({workspace,forExport:true})).toThrow(/human reviewed/)
})
it('moves a group in millimetres while preserving its distances and rotates normals',()=>{
 const guide=JSON.parse(readFileSync('public/assemblies/metamon/guide.json','utf8')),v=guide.variants[guide.defaultVariant],ids=v.units[0].pieceIds
 const before=structuredClone(v.model.pieces),vector=before.find(p=>ids.includes(p.id)&&p.pose.normal)
 transformPieces(guide,ids,[17,0,0],[0,0,0])
 for(const p of v.model.pieces){const original=before.find(o=>o.id===p.id);if(!ids.includes(p.id)){expect(p).toEqual(original);continue}const key=p.pose.center?'center':'vertices',point=key==='center'?p.pose.center:p.pose.vertices[0],old=key==='center'?original.pose.center:original.pose.vertices[0];expect(point[0]).toBeCloseTo(old[0]+1);expect(point[1]).toBeCloseTo(old[1])}
 transformPieces(guide,ids,[0,0,0],[90,0,0])
 const normal=v.model.pieces.find(p=>p.id===vector.id).pose.normal
 expect(normal[0]).toBeCloseTo(vector.pose.normal[0]);expect(normal[1]).toBeCloseTo(-vector.pose.normal[2]);expect(normal[2]).toBeCloseTo(vector.pose.normal[1])
})
