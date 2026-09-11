import { transformPieces } from './transforms.js'
const $=id=>document.getElementById(id), clone=value=>structuredClone(value)
let data, guide, review, photos, undo=[], changes=[], ready=false, dirty=false, photoRotation=0
const message=(text,error=false)=>{$('message').textContent=text;$('message').classList.toggle('error',error)}
const variant=()=>guide.variants[guide.defaultVariant]
const post=payload=>$('viewer').contentWindow.postMessage({channel:'laq-assembly',...payload},location.origin)
const option=(value,text)=>{const o=document.createElement('option');o.value=value;o.textContent=text;return o}
const selectedIds=()=>{const id=$('piece').value;return $('scope').value==='unit'?(variant().units.find(u=>u.pieceIds.includes(id))?.pieceIds??[id]):[id]}
const label=id=>guide.displayLabels?.[id]??id
function markDirty(){dirty=true;review.status='draft';review.reviewedAt=null;review.guideSha256=null;$('state').textContent='下書き · 未保存'}
function syncFields(){
  const photo=photos.find(p=>p.id===$('photo').value)
  if(photo){photo.view=$('photo-view').value||'unspecified';photo.evidence=$('photo-notes').value}
  review.reviewer=$('reviewer').value;review.notes=$('notes').value;review.physicalCheck=$('physical').value
}
function populateSteps(){
  const previous=$('step').value, steps=[['complete','完成形']]
  const keys=guide.sequence??[...variant().units.flatMap(u=>u.steps.map((_,i)=>`unit:${u.id}:${i}`)),...variant().assembly.map((_,i)=>`assembly:${i}`)]
  for(const key of keys){const [phase,id,index]=key.split(':');const s=phase==='unit'?variant().units.find(u=>u.id===id)?.steps[Number(index)]:variant().assembly[Number(id)];steps.push([key,`${steps.length}. ${guide.reading?.steps?.[key]?.title??s?.title??key}`])}
  $('step').replaceChildren(...steps.map(([key,text])=>option(key,text)));if(steps.some(([key])=>key===previous))$('step').value=previous
}
function showStep(){if(!ready)return;const [phase,id,index]=$('step').value.split(':');post({command:'show',phase,unit:phase==='unit'?id:null,step:phase==='unit'?Number(index):Number(id)||0});selectPiece()}
function fillPieces(){const previous=$('piece').value;$('piece').replaceChildren(...variant().model.pieces.map(p=>option(p.id,`${p.id} · No.${p.partNo} · ${p.color}`)));if(variant().model.pieces.some(p=>p.id===previous))$('piece').value=previous;selectPiece()}
function selectPiece(){
  const p=variant()?.model.pieces.find(p=>p.id===$('piece').value);if(!p)return
  const unit=variant().units.find(u=>u.pieceIds.includes(p.id));$('piece-info').textContent=`No.${p.partNo} / まとまり ${unit?label(unit.id):'なし'} / 選択 ${selectedIds().length} パーツ`
  $('color').value=p.color
  const connections=variant().model.connections.filter(c=>c.joint===p.id||c.ports.some(port=>port.piece===p.id))
  $('connections').textContent='接続: '+(connections.map(c=>`${c.joint} → ${c.ports.map(port=>`${port.piece} (辺${port.socket})`).join(', ')}`).join(' / ')||'なし')
  if(ready)post({command:'select',ids:selectedIds()})
}
function photoStyle(){$('source').style.transform=`rotate(${photoRotation}deg)`;$('source').style.maxWidth=`${$('photo-zoom').value}%`;$('source').style.maxHeight=`${Math.max(100,$('source').parentElement.clientHeight-20)*Number($('photo-zoom').value)/100}px`}
function showPhoto(){const p=photos.find(p=>p.id===$('photo').value);$('source').hidden=!p;if(p){$('source').src='/photo/'+encodeURIComponent(p.id);$('photo-view').value=p.view;$('photo-notes').value=p.evidence}photoRotation=0;$('photo-zoom').value='100';photoStyle()}
function reviewLists(){
  $('issues').replaceChildren(...review.unresolved.map(issue=>{const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.checked=issue.status==='resolved';input.onchange=()=>{issue.status=input.checked?'resolved':'open';markDirty()};label.append(input,document.createTextNode(issue.description));return label}))
  $('evidence').replaceChildren(...review.evidence.map(e=>{const li=document.createElement('li');li.textContent=`${e.photoId} → ${e.pieceIds.join(', ')} · ${e.confidence}: ${e.observation} / ${e.interpretation}`;const b=document.createElement('button');b.textContent='削除';b.onclick=()=>{review.evidence=review.evidence.filter(item=>item.id!==e.id);markDirty();reviewLists()};li.append(b);return li}))
}
function accept(result){
  data=result;guide=clone(data.guide);review=clone(data.review);photos=clone(data.manifest.photos);undo=[];changes=[];dirty=false
  $('title').textContent=data.manifest.title+' · 写真と3Dの確認・修正';$('state').textContent=review.status==='reviewed'?'確認済み':'下書き';$('article').href=data.manifest.article
  $('photo').replaceChildren(...photos.map(p=>option(p.id,p.id+' · '+p.view)))
  $('reviewer').value=review.reviewer;$('notes').value=review.notes;$('physical').value=review.physicalCheck
  $('undo').disabled=true;showPhoto();reviewLists();populateSteps();fillPieces()
  $('export-command').textContent=`取り込み用に出力: node scripts/author-assembly.mjs export --workspace ${JSON.stringify(data.workspace)} --out <新しい出力先>`
  message(data.validation==='OK'?'データの参照・手順は整合しています。実物との一致は写真と照合してください。':'未完成データ: '+data.validation,data.validation!=='OK')
}
async function request(url,body){const res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const value=await res.json();if(!res.ok)throw new Error(value.error);return value}
async function change(next,description){
  await request('/api/validate',{guide:next});syncFields();undo.push({guide:clone(guide),changes:[...changes]});guide=next;changes.push(description);markDirty();$('undo').disabled=false;populateSteps();fillPieces();if(ready)post({command:'replace-guide',guide});message(description+'。接続位置も確認してください。')
}
async function save(markReviewed){syncFields();const result=await request('/api/save',{baseVersion:data.version,guide,review,photos,changes,markReviewed});accept(result);if(!ready)$('viewer').src='/assemblies/viewer/index.html?id=draft&review=1&t='+Date.now()+'#phase=complete';message(markReviewed?'確認記録とガイドを保存しました。取り込み用に出力できます。':'下書きを保存しました。前の状態は history に残しています。')}
function handle(id,callback){$(id).onclick=async()=>{try{await callback()}catch(e){message(e.message,true)}}}
$('color').replaceChildren(...['lavender','skyblue','pink','red','blue','yellow','green','lime','orange','purple','white','black','brown','gray','lightblue','transparent','clear'].map(color=>option(color,color)))
$('piece').onchange=$('scope').onchange=selectPiece;$('step').onchange=showStep
$('photo').onchange=showPhoto;$('photo-zoom').oninput=photoStyle;$('rotate-photo').onclick=()=>{photoRotation=(photoRotation+90)%360;photoStyle()}
for(const id of ['reviewer','notes','physical','photo-view','photo-notes'])$(id).oninput=()=>{syncFields();markDirty()}
handle('apply-transform',()=>{const next=clone(guide),ids=selectedIds(),d=['dx','dy','dz'].map(id=>Number($(id).value)),r=['rx','ry','rz'].map(id=>Number($(id).value));transformPieces(next,ids,d,r);return change(next,`${ids.join(', ')}: 移動 ${d.join('/')} mm、回転 ${r.join('/')} 度`)})
handle('apply-color',()=>{const next=clone(guide),ids=selectedIds(),color=$('color').value;for(const p of next.variants[next.defaultVariant].model.pieces)if(ids.includes(p.id))p.color=color;return change(next,`${ids.join(', ')}: 色 ${color}`)})
handle('undo',()=>{const item=undo.pop();if(!item)return;guide=item.guide;changes=item.changes;markDirty();populateSteps();fillPieces();post({command:'replace-guide',guide});$('undo').disabled=!undo.length;message('直前の3D編集を戻しました。')})
handle('save',()=>save(false));handle('review',()=>save(true))
handle('reload',async()=>{if(dirty&&!confirm('未保存の変更を破棄し、ディスクの内容を読み直しますか？'))return;accept(await (await fetch('/api/workspace')).json());ready=false;$('viewer').src='/assemblies/viewer/index.html?id=draft&review=1#phase=complete'})
handle('add-issue',()=>{if(!$('new-issue').value.trim())throw new Error('未確認点を入力してください。');review.unresolved.push({id:crypto.randomUUID(),description:$('new-issue').value.trim(),status:'open'});$('new-issue').value='';markDirty();reviewLists()})
handle('add-evidence',()=>{if(!$('photo').value)throw new Error('先に写真を用意してください。');if(!$('observation').value.trim()&&!$('interpretation').value.trim())throw new Error('観測または解釈を入力してください。');review.evidence.push({id:crypto.randomUUID(),photoId:$('photo').value,pieceIds:selectedIds(),observation:$('observation').value,interpretation:$('interpretation').value,confidence:$('confidence').value});markDirty();reviewLists()})
handle('refresh-json',()=>{$('json').value=JSON.stringify(guide,null,2)})
handle('apply-json',()=>change(JSON.parse($('json').value),'JSONでガイドを修正'))
handle('download',()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(guide,null,2)+'\n'],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='guide.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)})
window.addEventListener('message',event=>{if(event.origin!==location.origin||event.source!==$('viewer').contentWindow||event.data?.channel!=='laq-assembly')return;const msg=event.data;if(msg.type==='ready'){ready=true;post({command:'replace-guide',guide});showStep()}if(msg.type==='updated'){selectPiece()}if(msg.type==='selected'){$('piece').value=msg.id;selectPiece()}if(msg.type==='error')message(msg.message??'3Dを表示できません。ガイドJSONを検証・修正して再読込してください。',true)})
window.addEventListener('resize',photoStyle)
window.addEventListener('beforeunload',event=>{if(dirty){event.preventDefault();event.returnValue=''}})
try{accept(await(await fetch('/api/workspace')).json());$('viewer').src='/assemblies/viewer/index.html?id=draft&review=1#phase=complete'}catch(e){message(e.message,true)}
