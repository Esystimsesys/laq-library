import { transformPieces } from './transforms.js'
import { attachPiece, relinkConnection, relinkTargets, replacePiece, deletePiece, availableSlots, replacementParts, slotMarker, plateFaceState, flipPlate, attachmentParts, partLabel, pieceConnections } from './pieces.js'
import { jointOrientations, applyJointOrientation, asMm } from './orientations.js'
import { groupedSequence } from '/assemblies/viewer/step-groups.js'
const $=id=>document.getElementById(id), clone=value=>structuredClone(value)
let data, guide, review, photos, undo=[], changes=[], ready=false, dirty=false, photoRotation=0, showResolved=false, busy=false
const message=(text,error=false)=>{$('message').textContent=text;$('message').classList.toggle('error',error)}
const variant=()=>guide.variants[guide.defaultVariant]
const post=payload=>$('viewer').contentWindow.postMessage({channel:'laq-assembly',...payload,...(payload.guide?{guide:{...payload.guide,displayLabels:data.displayLabels??payload.guide.displayLabels}}:{})},location.origin)
const option=(value,text)=>{const o=document.createElement('option');o.value=value;o.textContent=text;return o}
// 色と位置・向きは別々にまとまりへ広げられる。図の強調と添付は、広げた側に合わせる。
const unitIds=()=>{const id=$('piece').value;return variant().units.find(u=>u.pieceIds.includes(id))?.pieceIds??[id]}
const scopedIds=scope=>$(scope).checked?unitIds():[$('piece').value]
const selectedIds=()=>$('scope').checked||$('transform-scope').checked?unitIds():[$('piece').value]
const resetScope=()=>{$('scope').checked=false;$('transform-scope').checked=false}
const label=id=>data.displayLabels?.[id]??guide.displayLabels?.[id]??variant().units.find(u=>u.id===id)?.label??'まとまり'
const groupName=id=>guide.reading?.unitNames?.[id]??variant().units.find(u=>u.id===id)?.label??(id===variant().finished?'できあがり':'からだ')
const specialPart=no=>['mini-shaft','mini-wheel'].includes(no)
const colorNames={yellow:'黄',black:'黒',red:'赤',white:'白',skyblue:'水色',blue:'青',transparent:'透明',clear:'透明',lavender:'薄紫',pink:'ピンク',purple:'紫',orange:'オレンジ',green:'緑',lime:'黄緑',brown:'茶',gray:'灰',lightblue:'水色'}
const partNames={1:'四角',2:'三角',3:'平面（細）',4:'平面（幅広）',5:'120°',6:'90°',7:'3方向'}
const partText=no=>`${partLabel(no)}${partNames[no]?' · '+partNames[no]:''}`
const pieceLabel=id=>{const p=variant().model.pieces.find(p=>p.id===id);if(!p)return '削除済みのパーツ';const u=variant().units.find(u=>u.pieceIds.includes(id));return `${u?label(u.id)+'のパーツ'+(u.pieceIds.indexOf(id)+1):'パーツ'} · ${partText(p.partNo)} · ${colorNames[p.color]??'色未設定'}`}
const authorText={human:'人',ai:'AI'},confidenceText={observed:'写真で確認できる',inferred:'推測を含む',unknown:'わからない'}
const el=(tag,className,text)=>{const e=document.createElement(tag);if(className)e.className=className;if(text!==undefined)e.textContent=text;return e}
const when=value=>new Date(value).toLocaleString('ja-JP',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})
const stepText=key=>key==='complete'?'完成形':[...$('step').options].find(o=>o.value===key)?.textContent??key
function commentContext(){if(!review)return;$('comment-context-label').textContent=`（${stepText($('step').value)} / ${$('photo').value||'写真なし'}）`;$('comment-pieces-label').textContent=`（${selectedIds().map(pieceLabel).join(', ')}）`}
function markDirty(){dirty=true;review.status='draft';review.reviewedAt=null;review.guideSha256=null;$('state').textContent='下書き · 未保存';$('save').disabled=false;reviewBlockers()}
// The same conditions the save endpoint enforces, shown before the reviewer presses the button.
function reviewBlockers(){
  if(!review)return
  const openIssues=review.unresolved.filter(issue=>issue.status==='open').length
  const openComments=(review.comments??[]).filter(comment=>comment.status==='open').length
  const items=[]
  if(openIssues)items.push(`未確認点が ${openIssues} 件のこっています。`)
  if(openComments)items.push(`未対応のレビューコメントが ${openComments} 件あります。`)
  if(!$('reviewer').value.trim())items.push('「確認した人」が空です。')
  if(!$('notes').value.trim())items.push('「確認した範囲・残る制約」が空です。')
  if($('physical').value==='failed')items.push('実物で組み立てられない結果のままでは取り込めません。')
  $('review-blockers').replaceChildren(...(items.length?items.map(text=>el('li','card blocker',text)):[el('li','empty','残っていることはありません。確認済みにして保存できます。')]))
  $('pending').hidden=!(openIssues||openComments)
  $('pending').textContent=`未対応コメント ${openComments} · 未確認点 ${openIssues}`
}
function syncFields(){
  const photo=photos.find(p=>p.id===$('photo').value)
  if(photo){photo.view=$('photo-view').value||'unspecified';photo.evidence=$('photo-notes').value}
  review.reviewer=$('reviewer').value;review.notes=$('notes').value;review.physicalCheck=$('physical').value
}
function populateSteps(){
  const previous=$('step').value, steps=[['complete','完成形']]
  const keys=groupedSequence(guide)
  for(const key of keys){const [phase,id]=key.split(':');if(phase==='group'){steps.push([key,`${steps.length}. ${guide.reading.stepGroups.find(g=>g.id===id).title}`]);continue}const stage=phase==='assembly'?variant().assembly[Number(id)]:null;const group=phase==='unit'?id:stage?.result;steps.push([key,`${steps.length}. ${stage?.title||`${label(group)} ${groupName(group)}`}`])}
  $('step').replaceChildren(...steps.map(([key,text])=>option(key,text)));if(steps.some(([key])=>key===previous))$('step').value=previous;navState()
}
function navState(){for(const id of ['photo','step']){const s=$(id);$(id+'-prev').disabled=s.selectedIndex<=0;$(id+'-next').disabled=s.selectedIndex<0||s.selectedIndex>=s.options.length-1}}
function showStep(){commentContext();navState();if(!ready)return;const [phase,id,index]=$('step').value.split(':');post({command:'show',phase,unit:phase==='unit'||phase==='group'?id:null,step:phase==='unit'?Number(index):Number(id)||0});selectPiece()}
function fillPieces(){const previous=$('piece').value;$('piece').replaceChildren(...variant().model.pieces.map(p=>option(p.id,pieceLabel(p.id))));if(variant().model.pieces.some(p=>p.id===previous))$('piece').value=previous;selectPiece()}
function selectPiece(){
  const p=variant()?.model.pieces.find(p=>p.id===$('piece').value);if(!p)return
  const unit=variant().units.find(u=>u.pieceIds.includes(p.id));$('piece-info').textContent=`${partText(p.partNo)} / まとまり ${unit?label(unit.id):'なし'} / 選択 ${selectedIds().length} パーツ`
  $('color').value=p.color
  const colorEditable=variant().model.pieces.some(piece=>scopedIds('scope').includes(piece.id)&&!specialPart(piece.partNo))
  $('color').disabled=!colorEditable;$('apply-color').disabled=!colorEditable
  connectionList(p.id)
  if(ready)post({command:'select',ids:selectedIds()})
  editorFields(p)
  commentContext()
}
const partOption=no=>option(no,partText(no))
const parsePart=value=>/^\d+$/.test(value)?Number(value):value
function setOptions(id,items){const previous=$(id).value;$(id).replaceChildren(...items);if(items.some(o=>o.value===previous))$(id).value=previous}
const stages=()=>[...variant().units.flatMap(u=>u.steps),...variant().assembly]
const linkText=link=>`${link.slotText} ↔ ${pieceLabel(link.partner)} の ${link.partnerSlotText}`
const links=id=>{try{return pieceConnections(guide,id)}catch{return []}}
// 「辺 3」がどの辺かは番号だけでは伝わらないので、3D に印を出して示す。
// A connection is always a plate edge on one side and a socket on the other, so the
// slot name alone says which end is which; no prefix is needed on the 3D label.
const markerFor=(id,slot,allowUsed=false)=>{try{return{pieceId:id,marker:slotMarker(guide,id,slot,allowUsed)}}catch{return null}}
function showMarkers(markers){if(ready)post({command:'edit-marker',markers:markers.filter(Boolean)})}
let markerSource='attach'
function editMarkers(){
  const id=$('piece').value
  // Both relink slots are free only once the chosen connection is released, so skip the in-use check.
  if(markerSource==='relink'&&$('reattach-own').options.length&&$('reattach-slot').options.length)
    return showMarkers([markerFor(id,Number($('reattach-own').value),true),markerFor($('reattach-target').value,Number($('reattach-slot').value),true)])
  showMarkers($('attach-slot').options.length?[markerFor(id,Number($('attach-slot').value))]:[])
}
function connectionList(id){
  const items=links(id)
  $('connections').replaceChildren(...(items.length?items.map(link=>{
    const item=el('li','card'),show=el('button','','図で示す')
    show.onclick=()=>{showMarkers([markerFor(id,link.slot,true),markerFor(link.partner,link.partnerSlot,true)]);message('接続している辺・差し込み口を図に示しました。')}
    item.append(el('span','',linkText(link)),show)
    return item
  }):[el('li','empty','まだどこにもつながっていません。')]))
}
function editorFields(piece){
  setOptions('attach-slot',availableSlots(guide,piece.id).map(s=>option(s.value,s.label)))
  setOptions('replace-part',replacementParts(guide,piece.id).map(partOption))
  $('replace-piece').disabled=!$('replace-part').options.length
  const used=links(piece.id)
  $('replace-hint').textContent=$('replace-part').options.length
    ?`いま使っている場所（${used.map(link=>link.slotText).join('・')||'なし'}）が残る部品だけ選べます。`
    :'いま使っている辺・差し込み口が残らないため、交換できません。先に接続を外してください。'
  $('delete-hint').textContent=`接続 ${used.length} 件と手順 ${stages().filter(stage=>stage.newPieces.includes(piece.id)).length} 件の参照も取り除きます。「1つ戻す」で戻せます。`
  attachLocation();relinkFields();orientationFields(piece)
  const face=plateFaceState(guide,piece.id)
  $('flip-face').disabled=!face.canFlip;$('flip-viewer-face').disabled=!face.canFlip
  $('face-hint').textContent=face.reason
}
let orientationOptions=[]
function orientationFields(piece){
  const result=jointOrientations(guide,piece.id)
  orientationOptions=result.options
  $('joint-orientation').replaceChildren(...orientationOptions.map((item,i)=>option(item.id,`${item.current?'現在 · ':''}向き ${i+1} · ${item.label}${item.gap>.0005?` · 設計値とのずれ ${asMm(item.gap)}`:''}`)))
  const current=orientationOptions.find(item=>item.current)
  if(current)$('joint-orientation').value=current.id
  $('joint-orientation').disabled=!orientationOptions.length
  $('next-orientation').disabled=!orientationOptions.some(item=>!item.current)
  $('cycle-viewer-orientation').disabled=$('next-orientation').disabled
  const gap=Math.max(0,...orientationOptions.map(item=>item.gap??0))
  $('orientation-status').textContent=result.reason||`候補 ${orientationOptions.length} 通り。`+(gap>.0005?`差し込み位置は設計値から最大 ${asMm(gap)} ずれています。`:'')
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
  setOptions('add-part',hasSlot?attachmentParts(guide,$('piece').value,Number($('attach-slot').value)).map(partOption):[])
  addColorState()
  $('attach-piece').disabled=!hasSlot
  $('attach-slot-caption').textContent=`空いている${slotWord($('piece').value)}`
  // The preview already names the place; only the dead end needs its own line.
  $('attach-hint').textContent=hasSlot?'':'空いている辺・差し込み口がありません。別のパーツを選んでください。'
  $('attach-preview').textContent=hasSlot?`オレンジの印（${$('attach-slot').selectedOptions[0].textContent}）に ${partText(parsePart($('add-part').value))}・${colorNames[$('add-color').value]??'色未設定'} をはめます。`:''
  editMarkers()
}
function addColorState(){const fixed=specialPart($('add-part').value);$('add-color').disabled=fixed;if(fixed)$('add-color').value='black'}
let relinkChoices={targets:[]},relinkChoiceKey=''
function relinkFields(){
  const id=$('piece').value,existing=links(id)
  setOptions('release-link',existing.map(link=>option(link.key,linkText(link))))
  $('release-link').disabled=!existing.length
  relinkChoices=relinkTargets(guide,{pieceId:id,releaseKey:$('release-link').value,carry:$('reattach-carry').checked})
  setOptions('reattach-own',relinkChoices.ownSlots.map(s=>option(s.value,s.label)))
  const choiceKey=JSON.stringify([id,$('release-link').value])
  if(choiceKey!==relinkChoiceKey){
    const release=existing.find(link=>link.key===$('release-link').value)
    if(release&&relinkChoices.ownSlots.some(slot=>slot.value===release.slot))$('reattach-own').value=String(release.slot)
    relinkChoiceKey=choiceKey
  }
  // Anything still attached moves with the piece, so those pieces are not offered as a target.
  setOptions('reattach-target',relinkChoices.targets.map(target=>option(target.id,pieceLabel(target.id))))
  relinkSlots()
}
const slotWord=id=>{const piece=variant().model.pieces.find(p=>p.id===id);return !piece?'場所':piece.partNo<=2?'辺':piece.partNo==='mini-wheel'?'軸穴':'差し込み口'}
function relinkSlots(){
  const target=relinkChoices.targets.find(target=>target.id===$('reattach-target').value)
  setOptions('reattach-slot',(target?.slots??[]).map(s=>option(s.value,s.label)))
  $('reattach-own-caption').textContent=`このパーツの どの${slotWord($('piece').value)}を使うか`
  $('reattach-slot-caption').textContent=`相手の どの${slotWord($('reattach-target').value)}につなぐか`
  relinkPreview();editMarkers()
}
// The preview is a real dry run, so the hint is exactly what the button will do or refuse.
function relinkPreview(){
  const id=$('piece').value,target=$('reattach-target').value
  const ready=target&&$('reattach-slot').options.length&&$('reattach-own').options.length&&($('release-link').options.length?$('release-link').value:true)
  if(!ready){
    const others=links(id).filter(link=>!relinkChoices.released.includes(link.key))
    $('reattach-preview').textContent=!$('release-link').options.length?'まだ接続がありません。「新しいパーツをつなぐ」を使ってください。'
      :!$('reattach-carry').checked?'付け替えられる相手がありません。'
      :others.length?`外しても ${others.map(link=>link.slotText).join('・')} でつながったままです。そちらも外すか、下のチェックを外してください。`
      :'空いている辺・差し込み口を持つ相手がありません。'
    $('reattach-piece').disabled=true
    return null
  }
  const request={pieceId:id,releaseKey:$('release-link').value||undefined,targetId:target,targetSlot:Number($('reattach-slot').value),pieceSlot:Number($('reattach-own').value),carry:$('reattach-carry').checked}
  try{
    const result=relinkConnection(clone(guide),request)
    const kept=links(id).filter(link=>!result.released.includes(link.key))
    $('reattach-preview').textContent=`${$('reattach-own').selectedOptions[0].textContent} → ${pieceLabel(target)} の ${$('reattach-slot').selectedOptions[0].textContent}。`
      +`動くパーツ ${result.moved.length} 個 / 外れる接続 ${result.released.length} 件 / 残る接続 ${kept.length} 件。`
    $('reattach-piece').disabled=false
    return request
  }catch(e){
    $('reattach-preview').textContent=e.message
    $('reattach-piece').disabled=true
    return null
  }
}
// Keep historical comments, and drop only obsolete evidence links in saved data.
function reviewForGuide(target){
  const result=clone(review),ids=new Set(target.variants[target.defaultVariant].model.pieces.map(p=>p.id))
  result.evidence.forEach(e=>{e.pieceIds=e.pieceIds.filter(id=>ids.has(id))})
  return result
}
function photoStyle(){$('source').style.transform=`rotate(${photoRotation}deg)`;$('source').style.maxWidth=`${$('photo-zoom').value}%`;$('source').style.maxHeight=`${Math.max(100,$('source').parentElement.clientHeight-20)*Number($('photo-zoom').value)/100}px`}
function showPhoto(resetView=true){const p=photos.find(p=>p.id===$('photo').value);$('source').hidden=!p;if(p){const src='/photo/'+encodeURIComponent(p.id);if($('source').getAttribute('src')!==src)$('source').src=src;$('photo-view').value=p.view;$('photo-notes').value=p.evidence}if(resetView){photoRotation=0;$('photo-zoom').value='100'}photoStyle();commentContext();navState()}
function viewState(){return {photo:$('photo').value,step:$('step').value,piece:$('piece').value,scope:$('scope').checked,transformScope:$('transform-scope').checked,zoom:$('photo-zoom').value,rotation:photoRotation,scrollLeft:$('source').parentElement.scrollLeft,scrollTop:$('source').parentElement.scrollTop,commentContext:$('comment-context').checked,commentPieces:$('comment-pieces').checked}}
function reviewLists(){
  $('issues').replaceChildren(...review.unresolved.map(issue=>{const label=document.createElement('label'),input=document.createElement('input');input.type='checkbox';input.checked=issue.status==='resolved';input.onchange=()=>{issue.status=input.checked?'resolved':'open';markDirty()};label.append(input,document.createTextNode(issue.description));return label}))
  $('comments').replaceChildren(...(review.comments??[]).filter(c=>showResolved||c.status!=='resolved').map(c=>{
    const li=el('li','card comment '+c.status),meta=el('p','meta')
    meta.append(el('span','badge '+c.author,authorText[c.author]??c.author),el('span','badge '+c.status,c.status==='open'?'未対応':'対応済み'),document.createTextNode(when(c.createdAt)))
    const context=[c.stepKey&&'手順: '+stepText(c.stepKey),c.photoId&&'写真: '+c.photoId,c.pieceIds?.length&&'パーツ: '+c.pieceIds.map(pieceLabel).join(', ')].filter(Boolean).join(' · ')
    li.append(meta,el('p','text',c.text));if(context)li.append(el('p','context',context));if(c.reply)li.append(el('p','reply','AIの対応: '+c.reply))
    const toggle=el('button','',c.status==='open'?'対応済みにする':'未対応に戻す'),remove=el('button','','削除'),bar=el('div','bar')
    if(c.stepKey||c.photoId||c.pieceIds?.length){
      const jump=el('button','','この指摘を表示')
      jump.onclick=()=>{
        if(c.stepKey&&[...$('step').options].some(o=>o.value===c.stepKey))$('step').value=c.stepKey
        if(c.photoId&&photos.some(photo=>photo.id===c.photoId)){$('photo').value=c.photoId;showPhoto()}
        const target=c.pieceIds?.find(id=>variant().model.pieces.some(piece=>piece.id===id))
        if(target){$('piece').value=target;resetScope()}
        showStep();selectPiece()
        message(target?'コメントの手順・写真・パーツを表示しました。':'コメントの手順・写真を表示しました。パーツは残っていません。')
      }
      bar.append(jump)
    }
    toggle.onclick=()=>runExclusive(()=>commentSave(()=>{c.status=c.status==='open'?'resolved':'open'},c.status==='open'?'対応済みにして保存しました（「対応済みも表示」で見られます）。':'未対応に戻して保存しました。'))
    remove.onclick=()=>runExclusive(()=>{if(confirm('このコメントを削除しますか？'))return commentSave(()=>{review.comments=review.comments.filter(x=>x.id!==c.id)},'コメントを削除して保存しました。')})
    bar.append(toggle,remove);li.append(bar);return li}))
  // Resolved comments are hidden by default; the toggle shows how many there are.
  const allComments=review.comments??[],resolvedCount=allComments.filter(c=>c.status==='resolved').length
  if(!$('comments').children.length)$('comments').append(el('li','empty',allComments.length?'未対応のコメントはありません。':'まだコメントはありません。'))
  $('toggle-resolved').hidden=!resolvedCount;$('toggle-resolved').textContent=showResolved?'対応済みを隠す':`対応済みも表示（${resolvedCount}件）`
  reviewBlockers()
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
    $('scope').checked=view.scope;$('transform-scope').checked=view.transformScope;$('photo-zoom').value=view.zoom;photoRotation=view.rotation;$('comment-context').checked=view.commentContext;$('comment-pieces').checked=view.commentPieces
    photoStyle();$('source').parentElement.scrollLeft=view.scrollLeft;$('source').parentElement.scrollTop=view.scrollTop;selectPiece();navState()
  }
  $('export-command').textContent=variant().model.pieces.some(p=>specialPart(p.partNo))?'スペシャルパーツは制作室で利用できます。公開ガイドへの取り込みは未対応です。':`取り込み用に出力: node scripts/author-assembly.mjs export --workspace ${JSON.stringify(data.workspace)} --out <新しい出力先>`
  message(data.validation==='OK'?'データの参照・手順は整合しています。実物との一致は写真と照合してください。':'未完成データ: '+data.validation,data.validation!=='OK')
}
async function request(url,body){const res=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});const value=await res.json();if(!res.ok)throw new Error(value.error);return value}
async function change(next,description){
  await request('/api/validate',{guide:next});syncFields();undo.push({guide:clone(guide),changes:[...changes]});guide=next;changes.push(description);markDirty();$('undo').disabled=false;populateSteps();fillPieces();if(ready)post({command:'replace-guide',guide});message(description+'。接続位置も確認してください。')
}
async function save(markReviewed){message('保存しています…');syncFields();const result=await request('/api/save',{baseVersion:data.version,guide,review:reviewForGuide(guide),photos,changes,markReviewed});accept(result,true);if(!ready)$('viewer').src='/assemblies/viewer/index.html?id=draft&review=1&t='+Date.now()+'#phase=complete';message(markReviewed?'確認記録とガイドを保存しました。':'変更を保存しました。前の状態は history に残しています。')}
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
$('add-part').onchange=()=>{addColorState();attachLocation()}
$('add-color').onchange=attachLocation
$('attach-slot').onchange=()=>{markerSource='attach';attachLocation()}
for(const id of ['release-link','reattach-carry'])$(id).onchange=()=>{markerSource='relink';relinkFields()}
$('reattach-target').onchange=()=>{markerSource='relink';relinkSlots()}
for(const id of ['reattach-own','reattach-slot'])$(id).onchange=()=>{markerSource='relink';relinkPreview();editMarkers()}
handle('attach-piece',async()=>{
  const next=clone(guide),targetId=$('piece').value
  const id=attachPiece(next,{targetId,targetSlot:Number($('attach-slot').value),partNo:parsePart($('add-part').value),color:$('add-color').value,id:'manual-'+crypto.randomUUID()})
  await change(next,`${pieceLabel(targetId)}に ${partLabel(parsePart($('add-part').value))} を追加`)
  $('piece').value=id;resetScope();selectPiece()
  message('パーツをはめました。位置と重なりを確認し、「変更を保存」で保存してください。')
})
handle('replace-piece',()=>{const next=clone(guide),id=$('piece').value,no=parsePart($('replace-part').value);replacePiece(next,id,no);return change(next,`${pieceLabel(id)}を ${partLabel(no)} に交換`)})
handle('reattach-piece',async()=>{
  const request=relinkPreview()
  if(!request)return
  const next=clone(guide),result=relinkConnection(next,request)
  await change(next,`${pieceLabel(request.pieceId)}: 接続を ${pieceLabel(request.targetId)} へ付け替え（いっしょに動いたパーツ ${result.moved.length} 個・外した接続 ${result.released.length} 件）`)
  $('step').value='complete';showStep()
  message(`接続を付け替えました（動いたパーツ ${result.moved.length} 個）。重なりと形を図で確認してください。`)
})
handle('delete-piece',async()=>{
  const id=$('piece').value,used=links(id)
  if(used.length&&!confirm(`${pieceLabel(id)}を削除すると、接続 ${used.length} 件（${used.map(linkText).join(' / ')}）も外れます。削除しますか？`))return
  const next=clone(guide),description=pieceLabel(id)+'を削除';deletePiece(next,id);await change(next,description);reviewLists();message('選択パーツを接続・手順から削除しました。「1つ戻す」で取り消せます。')})
$('piece').onchange=()=>{resetScope();markerSource='attach';selectPiece()};for(const id of ['scope','transform-scope'])$(id).onchange=selectPiece;$('step').onchange=showStep
$('photo').onchange=showPhoto;$('photo-zoom').oninput=photoStyle;$('rotate-photo').onclick=()=>{photoRotation=(photoRotation+90)%360;photoStyle()}
for(const id of ['reviewer','notes','physical','photo-view','photo-notes'])$(id).oninput=()=>{syncFields();markDirty()}
$('physical').onchange=()=>{syncFields();markDirty()}
handle('apply-transform',()=>{const next=clone(guide),ids=scopedIds('transform-scope'),d=['dx','dy','dz'].map(id=>Number($(id).value)),r=['rx','ry','rz'].map(id=>Number($(id).value));transformPieces(next,ids,d,r);return change(next,`${ids.map(pieceLabel).join(', ')}: 移動 ${d.join('/')} mm、回転 ${r.join('/')} 度`)})
handle('apply-color',async()=>{const next=clone(guide),ids=scopedIds('scope').filter(id=>!specialPart(variant().model.pieces.find(p=>p.id===id).partNo)),color=$('color').value,description=`${ids.map(pieceLabel).join(', ')}: 色 ${colorNames[color]}`;for(const p of next.variants[next.defaultVariant].model.pieces)if(ids.includes(p.id))p.color=color;await change(next,description);message(`${ids.map(pieceLabel).join(', ')}を${colorNames[color]}に反映しました。保存ボタンを押すと保存されます。`)})
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
window.addEventListener('message',event=>{if(event.origin!==location.origin||event.source!==$('viewer').contentWindow||event.data?.channel!=='laq-assembly')return;const msg=event.data;if(msg.type==='ready'){ready=true;post({command:'replace-guide',guide});showStep()}if(msg.type==='height'&&Number.isFinite(msg.height)&&msg.height>0&&msg.height<=3000)$('viewer').style.height=`${msg.height}px`;if(msg.type==='updated'){selectPiece()}if(msg.type==='selected'){$('piece').value=msg.id;resetScope();markerSource='attach';selectPiece()}if(msg.type==='error')message(msg.message??'3Dを表示できません。ガイドJSONを検証・修正して再読込してください。',true)})
window.addEventListener('resize',photoStyle)
window.addEventListener('beforeunload',event=>{if(dirty||busy){event.preventDefault();event.returnValue=''}})
try{accept(await(await fetch('/api/workspace')).json());$('viewer').src='/assemblies/viewer/index.html?id=draft&review=1#phase=complete'}catch(e){message(e.message,true)}
