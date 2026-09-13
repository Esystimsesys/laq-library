import { transformPieces } from './transforms.js'
import { attachPiece, reattachPiece, replacePiece, deletePiece, availableSlots, replacementParts, slotMarker, plateFaceState, flipPlate } from './pieces.js'
import { jointOrientations, applyJointOrientation } from './orientations.js'
const $=id=>document.getElementById(id), clone=value=>structuredClone(value)
let data, guide, review, photos, undo=[], changes=[], ready=false, dirty=false, photoRotation=0, showResolved=false, busy=false
const message=(text,error=false)=>{$('message').textContent=text;$('message').classList.toggle('error',error)}
const variant=()=>guide.variants[guide.defaultVariant]
const post=payload=>$('viewer').contentWindow.postMessage({channel:'laq-assembly',...payload,...(payload.guide?{guide:{...payload.guide,displayLabels:data.displayLabels??payload.guide.displayLabels}}:{})},location.origin)
const option=(value,text)=>{const o=document.createElement('option');o.value=value;o.textContent=text;return o}
const selectedIds=()=>{const id=$('piece').value;return $('scope').value==='unit'?(variant().units.find(u=>u.pieceIds.includes(id))?.pieceIds??[id]):[id]}
const label=id=>data.displayLabels?.[id]??guide.displayLabels?.[id]??variant().units.find(u=>u.id===id)?.label??'まとまり'
const groupName=id=>guide.reading?.unitNames?.[id]??variant().units.find(u=>u.id===id)?.label??(id===variant().finished?'できあがり':'からだ')
const colorNames={yellow:'黄',black:'黒',red:'赤',white:'白',skyblue:'水色',blue:'青',transparent:'透明',clear:'透明',lavender:'薄紫',pink:'ピンク',purple:'紫',orange:'オレンジ',green:'緑',lime:'黄緑',brown:'茶',gray:'灰',lightblue:'水色'}
const pieceLabel=id=>{const p=variant().model.pieces.find(p=>p.id===id);if(!p)return '削除済みのパーツ';const u=variant().units.find(u=>u.pieceIds.includes(id));return `${u?label(u.id)+'のパーツ'+(u.pieceIds.indexOf(id)+1):'パーツ'} · No.${p.partNo} · ${colorNames[p.color]??'色未設定'}`}
const authorText={human:'人',ai:'AI'},confidenceText={observed:'写真で確認できる',inferred:'推測を含む',unknown:'わからない'}
const el=(tag,className,text)=>{const e=document.createElement(tag);if(className)e.className=className;if(text!==undefined)e.textContent=text;return e}
const when=value=>new Date(value).toLocaleString('ja-JP',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})
const stepText=key=>key==='complete'?'完成形':[...$('step').options].find(o=>o.value===key)?.textContent??key
function commentContext(){if(!review)return;$('comment-context-label').textContent=`（${stepText($('step').value)} / ${$('photo').value||'写真なし'}）`;$('comment-pieces-label').textContent=`（${selectedIds().map(pieceLabel).join(', ')}）`}
function markDirty(){dirty=true;review.status='draft';review.reviewedAt=null;review.guideSha256=null;$('state').textContent='下書き · 未保存';$('save').disabled=false}
function syncFields(){
  const photo=photos.find(p=>p.id===$('photo').value)
  if(photo){photo.view=$('photo-view').value||'unspecified';photo.evidence=$('photo-notes').value}
  review.reviewer=$('reviewer').value;review.notes=$('notes').value;review.physicalCheck=$('physical').value
}
function populateSteps(){
  const previous=$('step').value, steps=[['complete','完成形']]
  const keys=guide.sequence??[...variant().units.flatMap(u=>u.steps.map((_,i)=>`unit:${u.id}:${i}`)),...variant().assembly.map((_,i)=>`assembly:${i}`)]
  for(const key of keys){const [phase,id]=key.split(':');const group=phase==='unit'?id:variant().assembly[Number(id)]?.result;steps.push([key,`${steps.length}. ${label(group)} ${groupName(group)}`])}
  $('step').replaceChildren(...steps.map(([key,text])=>option(key,text)));if(steps.some(([key])=>key===previous))$('step').value=previous;navState()
}
function navState(){for(const id of ['photo','step']){const s=$(id);$(id+'-prev').disabled=s.selectedIndex<=0;$(id+'-next').disabled=s.selectedIndex<0||s.selectedIndex>=s.options.length-1}}
function showStep(){commentContext();navState();if(!ready)return;const [phase,id,index]=$('step').value.split(':');post({command:'show',phase,unit:phase==='unit'?id:null,step:phase==='unit'?Number(index):Number(id)||0});selectPiece()}
function fillPieces(){const previous=$('piece').value;$('piece').replaceChildren(...variant().model.pieces.map(p=>option(p.id,pieceLabel(p.id))));if(variant().model.pieces.some(p=>p.id===previous))$('piece').value=previous;selectPiece()}
function selectPiece(){
  const p=variant()?.model.pieces.find(p=>p.id===$('piece').value);if(!p)return
  const unit=variant().units.find(u=>u.pieceIds.includes(p.id));$('piece-info').textContent=`No.${p.partNo} / まとまり ${unit?label(unit.id):'なし'} / 選択 ${selectedIds().length} パーツ`
  $('color').value=p.color
  const connections=variant().model.connections.filter(c=>c.joint===p.id||c.ports.some(port=>port.piece===p.id))
  $('connections').textContent='接続: '+(connections.map(c=>`${pieceLabel(c.joint)} → ${c.ports.map(port=>`${pieceLabel(port.piece)} (辺${port.socket+1}・差し込み口${port.port+1})`).join(', ')}`).join(' / ')||'なし')
  if(ready)post({command:'select',ids:selectedIds()})
  editorFields(p)
  commentContext()
}
const partNames={1:'四角',2:'三角',3:'平面（細）',4:'平面（幅広）',5:'120°',6:'90°',7:'3方向'}
const partOption=no=>option(no,`No.${no} · ${partNames[no]}`)
function setOptions(id,items){const previous=$(id).value;$(id).replaceChildren(...items);if(items.some(o=>o.value===previous))$(id).value=previous}
function editorFields(piece){
  setOptions('attach-slot',availableSlots(guide,piece.id).map(s=>option(s.value,s.label)))
  setOptions('add-part',(piece.partNo<=2?[3,4,5,6,7]:[1,2]).map(partOption))
  setOptions('replace-part',replacementParts(guide,piece.id).map(partOption))
  $('replace-piece').disabled=!$('replace-part').options.length
  setOptions('reattach-target',variant().model.pieces.filter(p=>p.id!==piece.id&&(p.partNo<=2)!==(piece.partNo<=2)).map(p=>option(p.id,pieceLabel(p.id))))
  attachLocation();reattachFields();orientationFields(piece)
  const face=plateFaceState(guide,piece.id)
  $('flip-face').disabled=!face.canFlip;$('flip-viewer-face').disabled=!face.canFlip
  $('face-hint').textContent=face.reason
}
let orientationOptions=[]
function orientationFields(piece){
  const result=jointOrientations(guide,piece.id)
  orientationOptions=result.options
  $('joint-orientation').replaceChildren(...orientationOptions.map((item,i)=>option(item.id,`${item.current?'現在 · ':''}向き ${i+1} · ${item.label}`)))
  const current=orientationOptions.find(item=>item.current)
  if(current)$('joint-orientation').value=current.id
  $('joint-orientation').disabled=!orientationOptions.length
  $('next-orientation').disabled=!orientationOptions.some(item=>!item.current)
  $('cycle-viewer-orientation').disabled=$('next-orientation').disabled
  $('orientation-status').textContent=result.reason||`接続が合う向きが ${orientationOptions.length} 通りあります。`
  orientationChoice()
}
function orientationChoice(){
  const item=orientationOptions.find(item=>item.id===$('joint-orientation').value)
  $('apply-orientation').disabled=!item||item.current
  $('orientation-mapping').textContent=item?item.ports.map(port=>`${pieceLabel(port.piece)}の辺 ${port.socket+1} → 差し込み口 ${port.port+1}`).join('\n'):''
}
async function changeOrientation(id){
  const next=clone(guide),pieceId=$('piece').value,item=orientationOptions.find(item=>item.id===id)
  if(!item||item.current)return
  applyJointOrientation(next,pieceId,id)
  await change(next,`${pieceLabel(pieceId)}: 接続を保って向きを変更（${item.label}）`)
  message('接続先の板を動かさず、向きと差し込み口を切り替えました。「1つ戻す」で取り消せます。')
}
function attachLocation(){
  const hasSlot=$('attach-slot').options.length>0
  $('attach-piece').disabled=!hasSlot
  $('attach-hint').textContent=hasSlot?'図のオレンジの印がはめる場所です。追加後に形と重なりを確認してください。':'空いている辺・差し込み口がありません。別のパーツを選んでください。'
  if(ready)post({command:'edit-marker',pieceId:$('piece').value,marker:hasSlot?slotMarker(guide,$('piece').value,Number($('attach-slot').value)):null})
}
function reattachFields(){
  const target=$('reattach-target').value
  // The selected piece's old links will be removed before snapping.
  const next=clone(guide),model=next.variants[next.defaultVariant].model,id=$('piece').value
  model.connections=model.connections.filter(c=>c.joint!==id).map(c=>({...c,ports:c.ports.filter(p=>p.piece!==id)})).filter(c=>c.ports.length)
  setOptions('reattach-slot',(target?availableSlots(next,target):[]).map(s=>option(s.value,s.label)))
  $('reattach-piece').disabled=!$('reattach-slot').options.length
}
// Keep historical comments, and drop only obsolete evidence links in saved data.
function reviewForGuide(target){
  const result=clone(review),ids=new Set(target.variants[target.defaultVariant].model.pieces.map(p=>p.id))
  result.evidence.forEach(e=>{e.pieceIds=e.pieceIds.filter(id=>ids.has(id))})
  return result
}
function photoStyle(){$('source').style.transform=`rotate(${photoRotation}deg)`;$('source').style.maxWidth=`${$('photo-zoom').value}%`;$('source').style.maxHeight=`${Math.max(100,$('source').parentElement.clientHeight-20)*Number($('photo-zoom').value)/100}px`}
function showPhoto(resetView=true){const p=photos.find(p=>p.id===$('photo').value);$('source').hidden=!p;if(p){const src='/photo/'+encodeURIComponent(p.id);if($('source').getAttribute('src')!==src)$('source').src=src;$('photo-view').value=p.view;$('photo-notes').value=p.evidence}if(resetView){photoRotation=0;$('photo-zoom').value='100'}photoStyle();commentContext();navState()}
function viewState(){return {photo:$('photo').value,step:$('step').value,piece:$('piece').value,scope:$('scope').value,zoom:$('photo-zoom').value,rotation:photoRotation,scrollLeft:$('source').parentElement.scrollLeft,scrollTop:$('source').parentElement.scrollTop,commentContext:$('comment-context').checked,commentPieces:$('comment-pieces').checked}}
function reviewLists(){
  $('issues').replaceChildren(...review.unresolved.map(issue=>{const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.checked=issue.status==='resolved';input.onchange=()=>{issue.status=input.checked?'resolved':'open';markDirty()};label.append(input,document.createTextNode(issue.description));return label}))
  $('comments').replaceChildren(...(review.comments??[]).filter(c=>showResolved||c.status!=='resolved').map(c=>{
    const li=el('li','card comment '+c.status),meta=el('p','meta')
    meta.append(el('span','badge '+c.author,authorText[c.author]??c.author),el('span','badge '+c.status,c.status==='open'?'未対応':'対応済み'),document.createTextNode(when(c.createdAt)))
    const context=[c.stepKey&&'手順: '+stepText(c.stepKey),c.photoId&&'写真: '+c.photoId,c.pieceIds?.length&&'パーツ: '+c.pieceIds.map(pieceLabel).join(', ')].filter(Boolean).join(' · ')
    li.append(meta,el('p','text',c.text));if(context)li.append(el('p','context',context));if(c.reply)li.append(el('p','reply','AIの対応: '+c.reply))
    const toggle=el('button','',c.status==='open'?'対応済みにする':'未対応に戻す'),remove=el('button','','削除'),bar=el('div','bar')
    toggle.onclick=()=>runExclusive(()=>commentSave(()=>{c.status=c.status==='open'?'resolved':'open'},c.status==='open'?'対応済みにして保存しました（「対応済みも表示」で見られます）。':'未対応に戻して保存しました。'))
    remove.onclick=()=>runExclusive(()=>{if(confirm('このコメントを削除しますか？'))return commentSave(()=>{review.comments=review.comments.filter(x=>x.id!==c.id)},'コメントを削除して保存しました。')})
    bar.append(toggle,remove);li.append(bar);return li}))
  // Resolved comments are hidden by default; the toggle shows how many there are.
  const allComments=review.comments??[],resolvedCount=allComments.filter(c=>c.status==='resolved').length
  if(!$('comments').children.length)$('comments').append(el('li','empty',allComments.length?'未対応のコメントはありません。':'まだコメントはありません。'))
  $('toggle-resolved').hidden=!resolvedCount;$('toggle-resolved').textContent=showResolved?'対応済みを隠す':`対応済みも表示（${resolvedCount}件）`
  $('evidence').replaceChildren(...review.evidence.map(e=>{
    const li=el('li','card'),meta=el('p','meta')
    meta.append(el('span','badge '+(e.author??''),e.author?authorText[e.author]+'が記入':'記入者不明'),document.createTextNode(`${e.photoId} · ${confidenceText[e.confidence]??e.confidence}`))
    li.append(meta);if(e.observation)li.append(el('p','text','見えたこと: '+e.observation));if(e.interpretation)li.append(el('p','text','解釈: '+e.interpretation));if(e.pieceIds.length)li.append(el('p','context','パーツ: '+e.pieceIds.map(pieceLabel).join(', ')))
    const b=el('button','','削除');b.onclick=()=>{review.evidence=review.evidence.filter(item=>item.id!==e.id);markDirty();reviewLists()};li.append(b);return li}))
}
function accept(result,preserveView=false){
  const view=preserveView?viewState():null
  data=result;guide=clone(data.guide);review=clone(data.review);photos=clone(data.manifest.photos);undo=[];changes=[];dirty=false
  $('title').textContent=data.manifest.title+' · 写真と3Dの確認・修正';$('state').textContent=review.status==='reviewed'?'確認済み':'下書き';$('article').href=data.manifest.article
  $('photo').replaceChildren(...photos.map(p=>option(p.id,p.id+' · '+p.view)))
  if(view&&photos.some(p=>p.id===view.photo))$('photo').value=view.photo
  $('reviewer').value=review.reviewer;$('notes').value=review.notes;$('physical').value=review.physicalCheck
  $('undo').disabled=true;$('save').disabled=true;showPhoto(!view);populateSteps();reviewLists();fillPieces()
  if(view){
    if([...$('step').options].some(o=>o.value===view.step))$('step').value=view.step
    if([...$('piece').options].some(o=>o.value===view.piece))$('piece').value=view.piece
    $('scope').value=view.scope;$('photo-zoom').value=view.zoom;photoRotation=view.rotation;$('comment-context').checked=view.commentContext;$('comment-pieces').checked=view.commentPieces
    photoStyle();$('source').parentElement.scrollLeft=view.scrollLeft;$('source').parentElement.scrollTop=view.scrollTop;selectPiece();navState()
  }
  $('export-command').textContent=`取り込み用に出力: node scripts/author-assembly.mjs export --workspace ${JSON.stringify(data.workspace)} --out <新しい出力先>`
  message(data.validation==='OK'?'データの参照・手順は整合しています。実物との一致は写真と照合してください。':'未完成データ: '+data.validation,data.validation!=='OK')
}
async function request(url,body){const res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const value=await res.json();if(!res.ok)throw new Error(value.error);return value}
async function change(next,description){
  await request('/api/validate',{guide:next});syncFields();undo.push({guide:clone(guide),changes:[...changes]});guide=next;changes.push(description);markDirty();$('undo').disabled=false;populateSteps();fillPieces();if(ready)post({command:'replace-guide',guide});message(description+'。接続位置も確認してください。')
}
async function save(markReviewed){message('保存しています…');syncFields();const result=await request('/api/save',{baseVersion:data.version,guide,review:reviewForGuide(guide),photos,changes,markReviewed});accept(result,true);if(!ready)$('viewer').src='/assemblies/viewer/index.html?id=draft&review=1&t='+Date.now()+'#phase=complete';message(markReviewed?'確認記録とガイドを保存しました。取り込み用に出力できます。':'変更を保存しました。前の状態は history に残しています。')}
// Saving and validation replace local state when they finish. Keep edits and
// other requests out of that interval; inert preserves each control's own disabled state.
async function runExclusive(callback){
  if(busy)return
  busy=true
  const hosts=[document.querySelector('header'),document.querySelector('main')]
  for(const host of hosts){host.inert=true;host.setAttribute('aria-busy','true')}
  try{await callback()}catch(e){message(e.message,true)}
  finally{for(const host of hosts){host.inert=false;host.removeAttribute('aria-busy')}busy=false}
}
function handle(id,callback){$(id).onclick=()=>runExclusive(callback)}
// Comment actions save at once, so a comment is never left only in the page.
async function saveReviewOnly(){
  message('コメントを保存しています…')
  syncFields();const pendingEvidence=clone(review.evidence);const result=await request('/api/save',{baseVersion:data.version,guide:data.guide,review:reviewForGuide(data.guide),photos,changes:[],markReviewed:false})
  data=result;review=clone(data.review);if(changes.length)review.evidence=pendingEvidence;photos=clone(data.manifest.photos);dirty=changes.length>0
  $('state').textContent=dirty?'下書き · 未保存':review.status==='reviewed'?'確認済み':'下書き';$('save').disabled=!dirty;reviewLists()
}
async function commentSave(mutate,done){const before=clone(review.comments??[]);mutate();try{await saveReviewOnly();message(done);$('comment-status').textContent=done}catch(e){review.comments=before;reviewLists();message(e.message,true);$('comment-status').textContent=e.message}}
$('color').replaceChildren(...['lavender','skyblue','pink','red','blue','yellow','green','lime','orange','purple','white','black','brown','gray','lightblue','transparent','clear'].map(color=>option(color,colorNames[color])))
$('add-color').replaceChildren(...[...$('color').options].map(o=>option(o.value,o.textContent)))
for(const id of ['flip-face','flip-viewer-face'])handle(id,async()=>{
  const next=clone(guide),pieceId=$('piece').value
  flipPlate(next,pieceId)
  await change(next,`${pieceLabel(pieceId)}の表裏を反転`)
  message('板の位置と接続を保って表裏を入れ替えました。「1つ戻す」で取り消せます。')
})
$('joint-orientation').onchange=orientationChoice
handle('apply-orientation',()=>changeOrientation($('joint-orientation').value))
for(const id of ['next-orientation','cycle-viewer-orientation'])handle(id,()=>{const index=orientationOptions.findIndex(item=>item.current);return changeOrientation(orientationOptions[(index+1)%orientationOptions.length]?.id)})
$('attach-slot').onchange=attachLocation;$('reattach-target').onchange=reattachFields
handle('attach-piece',async()=>{
  const next=clone(guide),targetId=$('piece').value
  const id=attachPiece(next,{targetId,targetSlot:Number($('attach-slot').value),partNo:Number($('add-part').value),color:$('add-color').value,id:'manual-'+crypto.randomUUID()})
  await change(next,`${pieceLabel(targetId)}に No.${$('add-part').value} を追加`)
  $('piece').value=id;$('scope').value='piece';selectPiece()
  message('パーツをはめました。位置と重なりを確認し、「変更を保存」で保存してください。')
})
handle('replace-piece',()=>{const next=clone(guide),id=$('piece').value,no=Number($('replace-part').value);replacePiece(next,id,no);return change(next,`${pieceLabel(id)}を No.${no} に交換`)})
handle('reattach-piece',async()=>{const next=clone(guide),id=$('piece').value;reattachPiece(next,{pieceId:id,targetId:$('reattach-target').value,targetSlot:Number($('reattach-slot').value)});await change(next,`${pieceLabel(id)}をつなぎ直し`);$('step').value='complete';showStep()})
handle('delete-piece',async()=>{const next=clone(guide),id=$('piece').value,description=pieceLabel(id)+'を削除';deletePiece(next,id);await change(next,description);reviewLists();message('選択パーツを接続・手順から削除しました。「1つ戻す」で取り消せます。')})
$('piece').onchange=()=>{$('scope').value='piece';selectPiece()};$('scope').onchange=selectPiece;$('step').onchange=showStep
$('photo').onchange=showPhoto;$('photo-zoom').oninput=photoStyle;$('rotate-photo').onclick=()=>{photoRotation=(photoRotation+90)%360;photoStyle()}
for(const id of ['reviewer','notes','physical','photo-view','photo-notes'])$(id).oninput=()=>{syncFields();markDirty()}
handle('apply-transform',()=>{const next=clone(guide),ids=selectedIds(),d=['dx','dy','dz'].map(id=>Number($(id).value)),r=['rx','ry','rz'].map(id=>Number($(id).value));transformPieces(next,ids,d,r);return change(next,`${ids.map(pieceLabel).join(', ')}: 移動 ${d.join('/')} mm、回転 ${r.join('/')} 度`)})
handle('apply-color',async()=>{const next=clone(guide),ids=selectedIds(),color=$('color').value,description=`${ids.map(pieceLabel).join(', ')}: 色 ${colorNames[color]}`;for(const p of next.variants[next.defaultVariant].model.pieces)if(ids.includes(p.id))p.color=color;await change(next,description);message(`${ids.map(pieceLabel).join(', ')}を${colorNames[color]}に反映しました。保存ボタンを押すと保存されます。`)})
handle('undo',()=>{const item=undo.pop();if(!item)return;guide=item.guide;changes=item.changes;markDirty();populateSteps();fillPieces();post({command:'replace-guide',guide});$('undo').disabled=!undo.length;message('直前の3D編集を戻しました。')})
handle('save',()=>save(false));handle('review',()=>save(true))
$('toggle-resolved').onclick=()=>{showResolved=!showResolved;reviewLists()}
// 前へ・次へ: move the photo or step selection by one and reuse its change handler.
for(const id of ['photo','step'])for(const [suffix,delta] of [['prev',-1],['next',1]])$(`${id}-${suffix}`).onclick=()=>{const s=$(id),i=s.selectedIndex+delta;if(i<0||i>=s.options.length)return;s.selectedIndex=i;s.dispatchEvent(new Event('change'))}
handle('reload',async()=>{
  if(dirty&&!confirm('未保存の変更を破棄し、ディスクの内容を読み直しますか？'))return
  const response=await fetch('/api/workspace'),result=await response.json()
  if(!response.ok)throw new Error(result.error??'ディスクの内容を読み直せませんでした。')
  accept(result)
  // Replacing the iframe src with its current URL can be a no-op. In that case
  // ready stayed false and later step changes never reached the 3D viewer.
  // A ready viewer already has a safe guide-replacement API, so update it in place.
  if(ready){post({command:'replace-guide',guide});showStep()}
  else $('viewer').src='/assemblies/viewer/index.html?id=draft&review=1&t='+Date.now()+'#phase=complete'
})
handle('add-issue',()=>{if(!$('new-issue').value.trim())throw new Error('未確認点を入力してください。');review.unresolved.push({id:crypto.randomUUID(),description:$('new-issue').value.trim(),status:'open'});$('new-issue').value='';markDirty();reviewLists()})
handle('add-evidence',()=>{if(!$('photo').value)throw new Error('先に写真を用意してください。');if(!$('observation').value.trim()&&!$('interpretation').value.trim())throw new Error('観測または解釈を入力してください。');review.evidence.push({id:crypto.randomUUID(),author:'human',photoId:$('photo').value,pieceIds:selectedIds(),observation:$('observation').value,interpretation:$('interpretation').value,confidence:$('confidence').value});$('observation').value='';$('interpretation').value='';markDirty();reviewLists();message('根拠を追加しました。「変更を保存」で書き込みます。')})
handle('add-comment',async()=>{const text=$('comment-text').value.trim();if(!text)throw new Error('コメントを入力してください。')
  const comment={id:crypto.randomUUID(),author:'human',createdAt:new Date().toISOString(),text,status:'open'}
  if($('comment-context').checked){comment.stepKey=$('step').value;if($('photo').value)comment.photoId=$('photo').value}
  if($('comment-pieces').checked)comment.pieceIds=selectedIds()
  await commentSave(()=>{review.comments=[...(review.comments??[]),comment]},'コメントを保存しました。AIに「コメントを見て」と伝えると対応します。')
  if((data.review.comments??[]).some(c=>c.id===comment.id))$('comment-text').value=''})
handle('refresh-json',()=>{$('json').value=JSON.stringify(guide,null,2)})
handle('apply-json',()=>change(JSON.parse($('json').value),'JSONでガイドを修正'))
handle('download',()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(guide,null,2)+'\n'],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='guide.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)})
window.addEventListener('message',event=>{if(event.origin!==location.origin||event.source!==$('viewer').contentWindow||event.data?.channel!=='laq-assembly')return;const msg=event.data;if(msg.type==='ready'){ready=true;post({command:'replace-guide',guide});showStep()}if(msg.type==='height'&&Number.isFinite(msg.height)&&msg.height>0&&msg.height<=3000)$('viewer').style.height=`${msg.height}px`;if(msg.type==='updated'){selectPiece()}if(msg.type==='selected'){$('piece').value=msg.id;$('scope').value='piece';selectPiece()}if(msg.type==='error')message(msg.message??'3Dを表示できません。ガイドJSONを検証・修正して再読込してください。',true)})
window.addEventListener('resize',photoStyle)
window.addEventListener('beforeunload',event=>{if(dirty||busy){event.preventDefault();event.returnValue=''}})
try{accept(await(await fetch('/api/workspace')).json());$('viewer').src='/assemblies/viewer/index.html?id=draft&review=1#phase=complete'}catch(e){message(e.message,true)}
