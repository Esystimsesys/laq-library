import { createServer } from 'node:http'
import { readFileSync, writeFileSync, renameSync, mkdirSync, existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { readWorkspace, validateManifest, validateReview, safeWorkspaceFile, guideDigest, validateAuthorGuide } from './author-assembly.mjs'
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const json = value => JSON.stringify(value, null, 2) + '\n'
const mime = { '.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.json':'application/json', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.png':'image/png', '.webp':'image/webp', '.avif':'image/avif', '.gif':'image/gif' }
function snapshot(workspace) {
  const data = readWorkspace({ workspace })
  const manifestBytes = readFileSync(safeWorkspaceFile(workspace, 'manifest.json'))
  const reviewBytes = readFileSync(safeWorkspaceFile(workspace, 'review.json'))
  const version = guideDigest(Buffer.concat([Buffer.from(data.guideBytes), manifestBytes, reviewBytes]))
  let validation = 'OK'
  try { validateAuthorGuide(data.guide); validateReview(data.review, data.manifest, data.guide) } catch (e) { validation = e.message }
  return { ...data, version, validation }
}
function save(workspace, body) {
  const before = snapshot(workspace)
  if (body.baseVersion !== before.version) throw Object.assign(new Error('AIまたは別の画面が更新しました。再読込して変更を確認してください。'), { status:409 })
  const guide = body.guide, review = structuredClone(body.review), manifest = structuredClone(before.manifest)
  validateAuthorGuide(guide)
  for (const photo of manifest.photos) {
    const metadata = body.photos?.find(p => p.id === photo.id)
    if (metadata) { photo.view = metadata.view; photo.evidence = metadata.evidence }
  }
  validateManifest(manifest, workspace)
  const guideBytes = json(guide)
  review.status = body.markReviewed === true ? 'reviewed' : 'draft'
  review.reviewedAt = body.markReviewed === true ? new Date().toISOString() : null
  review.guideSha256 = body.markReviewed === true ? guideDigest(guideBytes) : null
  validateReview(review, manifest, guide, { forExport:body.markReviewed === true, guideSha256:guideDigest(guideBytes) })
  if (!Array.isArray(body.changes) || !body.changes.every(change => typeof change === 'string')) throw new Error('Invalid change log')
  // Snapshot before every save; original photos are never rewritten. Recoverable even if the process stops during rename.
  const stamp = new Date().toISOString().replace(/[:.]/g,'-') + '-' + Math.random().toString(36).slice(2,7)
  const backup = path.join(workspace, 'history', stamp)
  mkdirSync(backup, { recursive:true })
  for (const file of ['guide.json','review.json','manifest.json']) writeFileSync(path.join(backup,file), readFileSync(safeWorkspaceFile(workspace,file)))
  const historyPath = path.join(workspace,'changes.json')
  const history = existsSync(historyPath) ? JSON.parse(readFileSync(safeWorkspaceFile(workspace,'changes.json'),'utf8')) : []
  history.push({ at:new Date().toISOString(), before:before.guideSha256, after:guideDigest(guideBytes), reviewStatus:review.status, changes:body.changes, backup:`history/${stamp}` })
  for (const [file, bytes] of Object.entries({ 'guide.json':guideBytes, 'manifest.json':json(manifest), 'review.json':json(review), 'changes.json':json(history) })) {
    const temp = path.join(workspace, `.${file}.${stamp}.tmp`)
    writeFileSync(temp, bytes, { flag:'wx' }); renameSync(temp, path.join(workspace,file))
  }
  return snapshot(workspace)
}
export function createReviewServer({ workspace }) {
  workspace = snapshot(workspace).workspace
  return createServer(async (req,res) => {
    const send = (status, value, type='application/json') => { res.writeHead(status, { 'Content-Type':type+'; charset=utf-8', 'Cache-Control':'no-store', 'X-Content-Type-Options':'nosniff', 'Referrer-Policy':'no-referrer', 'Content-Security-Policy':"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-src 'self'; frame-ancestors 'self'; object-src 'none'; base-uri 'none'" }); res.end(type==='application/json'?json(value):value) }
    try {
      const authority = `127.0.0.1:${req.socket.localPort}`
      if (req.headers.host !== authority || (req.headers.origin && req.headers.origin !== `http://${authority}`)) return send(403,{error:'Same-origin loopback access only'})
      const url = new URL(req.url, `http://${authority}`)
      if (req.method === 'POST' && ['/api/save','/api/validate'].includes(url.pathname)) {
        if (req.headers.origin !== `http://${authority}` || req.headers['content-type']?.split(';')[0] !== 'application/json') return send(403,{error:'Same-origin JSON required'})
        let size=0; const chunks=[]
        for await (const chunk of req) { size+=chunk.length; if(size>8*1024*1024) throw new Error('Request too large'); chunks.push(chunk) }
        const body=JSON.parse(Buffer.concat(chunks).toString())
        if(url.pathname==='/api/validate'){validateAuthorGuide(body.guide);return send(200,{valid:true})}
        return send(200,save(workspace,body))
      }
      if (req.method !== 'GET') return send(405,{error:'Method not allowed'})
      if (url.pathname === '/api/workspace') return send(200,snapshot(workspace))
      if (url.pathname === '/assemblies/draft/guide.json') {
        const {guide} = snapshot(workspace); validateAuthorGuide(guide)
        return send(200,{...guide,photos:[],limits:[]})
      }
      let file
      if (url.pathname.startsWith('/photo/')) {
        const photo = snapshot(workspace).manifest.photos.find(p=>p.id===decodeURIComponent(url.pathname.slice(7)))
        if (!photo) return send(404,{error:'Photo not found'})
        file = safeWorkspaceFile(workspace,photo.path)
      } else {
        const assets = new Map([
          ['/','tools/assembly-review/index.html'], ['/review.js','tools/assembly-review/review.js'], ['/review.css','tools/assembly-review/review.css'], ['/transforms.js','tools/assembly-review/transforms.js'],
          ...['index.html','boot.js','unit-instructions.js','realistic-parts.js','unit-instructions.css','library.css'].map(name=>[`/assemblies/viewer/${name}`,`public/assemblies/viewer/${name}`]),
          ['/assemblies/vendor/three.min.js','public/assemblies/vendor/three.min.js'],
        ])
        if (!assets.has(url.pathname)) return send(404,{error:'Not found'})
        file = path.join(root,assets.get(url.pathname))
      }
      send(200,readFileSync(file),mime[path.extname(file)]??'application/octet-stream')
    } catch(e) { send(e.status??400,{error:e.message}) }
  })
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  try {
    const {values}=parseArgs({options:{workspace:{type:'string'},port:{type:'string',default:'5180'}}})
    const port=Number(values.port)
    if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Port must be 1024–65535')
    createReviewServer({workspace:values.workspace}).listen(port,'127.0.0.1',()=>console.log(`写真と3Dの確認・修正: http://127.0.0.1:${port}/`)).on('error',e=>{console.error(e.message);process.exitCode=1})
  }catch(e){console.error(e.message);process.exitCode=1}
}
