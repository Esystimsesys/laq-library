import { transformPieces } from './transforms.js'
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
  $('connections').textContent='接続: '+(connections.map(c=>`${pieceLabel(c.joint)} → ${c.ports.map(port=>`${pieceLabel(port.piece)} (辺${port.socket})`).join(', ')}`).join(' / ')||'なし')
  if(ready)post({command:'select',ids:selectedIds()})
  commentContext()
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
async function save(markReviewed){message('保存しています…');syncFields();const result=await request('/api/save',{baseVersion:data.version,guide,review,photos,changes,markReviewed});accept(result,true);if(!ready)$('viewer').src='/assemblies/viewer/index.html?id=draft&review=1&t='+Date.now()+'#phase=complete';message(markReviewed?'確認記録とガイドを保存しました。取り込み用に出力できます。':'変更を保存しました。前の状態は history に残しています。')}
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
  syncFields();const result=await request('/api/save',{baseVersion:data.version,guide:data.guide,review,photos,changes:[],markReviewed:false})
  data=result;review=clone(data.review);photos=clone(data.manifest.photos);dirty=changes.length>0
  $('state').textContent=dirty?'下書き · 未保存':review.status==='reviewed'?'確認済み':'下書き';$('save').disabled=!dirty;reviewLists()
}
async function commentSave(mutate,done){const before=clone(review.comments??[]);mutate();try{await saveReviewOnly();message(done);$('comment-status').textContent=done}catch(e){review.comments=before;reviewLists();message(e.message,true);$('comment-status').textContent=e.message}}
$('color').replaceChildren(...['lavender','skyblue','pink','red','blue','yellow','green','lime','orange','purple','white','black','brown','gray','lightblue','transparent','clear'].map(color=>option(color,colorNames[color])))
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
handle('reload',async()=>{if(dirty&&!confirm('未保存の変更を破棄し、ディスクの内容を読み直しますか？'))return;accept(await (await fetch('/api/workspace')).json());ready=false;$('viewer').src='/assemblies/viewer/index.html?id=draft&review=1#phase=complete'})
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
