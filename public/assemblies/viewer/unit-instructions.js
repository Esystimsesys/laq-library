/* Data-driven display: standard ports and non-standard placements stay distinct. */
(function(){
'use strict';const raw=document.getElementById('data').textContent;if(!raw.trim().startsWith('{')){document.body.textContent='生成済みの metamon.html または tairetu.html を開いてください。';return;}
const data=JSON.parse(raw),T=THREE,$=id=>document.getElementById(id),V=a=>new T.Vector3(...a);
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const colors={yellow:0xf1ce22,black:0x262b32,red:0xd74b48,white:0xf6f2dc,skyblue:0x6ec3df,blue:0x6ec3df,transparent:0xc3d7d7,clear:0xc3d7d7,lavender:0xc89ad0,pink:0xed9bbb,purple:0x975abb,orange:0xf39432,green:0x469956,lime:0xc2df30,brown:0x885a42,gray:0x999999,lightblue:0x6ec3df};
const colorNames={yellow:'黄',black:'黒',red:'赤',white:'白',skyblue:'水色',blue:'水色',transparent:'透明',clear:'透明',lavender:'薄紫',pink:'ピンク',purple:'紫',orange:'オレンジ',green:'緑',lime:'黄緑',brown:'茶',gray:'灰',lightblue:'水色'};
let mode=data.defaultVariant,phase='catalog',selectedUnit=null,variant,members,sequence=[],labelMembers={},step=0,action=0,explode=0,zoom=1,yaw=-.3,pitch=.35,drag,model,by,current,actions=[],detailPoints,preview=null;
let previewColor=null;
let detailsOpen=false,detailStageKey='';
const root=new T.Group();root.rotation.x=-Math.PI/2;const scene=new T.Scene();scene.add(root);
const camera=new T.PerspectiveCamera(32,1,.01,200),renderer=setupRenderer('stage',scene),groups=new Map();let bounds=new T.Box3();
const detailScene=new T.Scene(),detailRoot=new T.Group();detailScene.add(detailRoot);const detailCamera=new T.PerspectiveCamera(33,1,.01,100),detailRenderer=setupRenderer('detail-stage',detailScene);let detailBounds=new T.Box3(),detailYaw=.4,detailPitch=.4,detailDrag;
const svg=overlay('stage'),detailSvg=overlay('detail-stage');
function setupRenderer(id,s){const r=new T.WebGLRenderer({alpha:true,antialias:true});r.setPixelRatio(Math.min(devicePixelRatio,2));$(id).prepend(r.domElement);s.add(new T.HemisphereLight(0xffffff,0x98aaa0,1.8));const l=new T.DirectionalLight(0xffffff,2.2);l.position.set(-3,5,7);s.add(l);return r;}
function overlay(id){const e=document.createElementNS('http://www.w3.org/2000/svg','svg');e.classList.add('overlay');$(id).append(e);return e;}
function dispose(group){while(group.children.length){const c=group.children[0];group.remove(c);c.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});}}
function center(p){return p.pose.center?V(p.pose.center):p.pose.vertices.map(V).reduce((a,v)=>a.add(v),new T.Vector3()).multiplyScalar(1/p.pose.vertices.length);}
function part(p,added=false){const transparent=['transparent','clear'].includes(p.color),xray=$('xray').checked&&p.partNo<3;const m=new T.MeshStandardMaterial({color:colors[p.color]||0xb6c8aa,roughness:.46,transparent:transparent||xray,opacity:transparent?.4:xray?.24:1,depthWrite:!transparent&&!xray,emissive:added?0x8b6810:0,emissiveIntensity:added?.09:0});const c=model.connections.find(c=>c.joint===p.id);const g=p.partNo<3?LaQRealisticParts.plate(T,p,m):LaQRealisticParts.joint(T,p,c,by,m,c);g.userData.pieceId=p.id;addPartEdges(g,m);return g;}
// Subtle, depth-tested creases distinguish adjacent parts of the same colour.
// Attach to each mesh so transforms, exploded views and disposal stay shared.
function addPartEdges(group,material){
 const meshes=[];group.traverse(o=>{if(o.isMesh)meshes.push(o);});
 const color=material.color.clone(),dark=color.r*.2126+color.g*.7152+color.b*.0722<.08;
 if(dark)color.setHex(0x87949b);else color.multiplyScalar(.42);
 material.polygonOffset=true;material.polygonOffsetFactor=1;material.polygonOffsetUnits=1;
 for(const mesh of meshes){
  const geometry=new T.EdgesGeometry(mesh.geometry,40);
  const edges=new T.LineSegments(geometry,new T.LineBasicMaterial({color,transparent:true,
   opacity:material.opacity<1?material.opacity*.35:.58,depthTest:true,depthWrite:false}));
  edges.userData.partEdges=true;edges.raycast=()=>{};mesh.add(edges);
 }
}
function socket(a){const p=by.get(a.piece),vs=p.pose.vertices.map(V),one=vs[a.socket],two=vs[(a.socket+1)%vs.length],mid=one.clone().add(two).multiplyScalar(.5);return {a:one,b:two,mid,axis:two.clone().sub(one).normalize(),inward:center(p).sub(mid).normalize(),normal:V(p.pose.normal)};}
function fit(cam,box,host,y,p,z=1){const r=host.getBoundingClientRect();if(!r.width||!r.height)return;cam.aspect=r.width/r.height;const target=box.getCenter(new T.Vector3()),toward=new T.Vector3(Math.sin(y)*Math.cos(p),Math.sin(p),Math.cos(y)*Math.cos(p)),right=new T.Vector3(Math.cos(y),0,-Math.sin(y)),up=new T.Vector3().crossVectors(toward,right),vf=T.MathUtils.degToRad(cam.fov)/2,hf=Math.atan(Math.tan(vf)*cam.aspect);const labelled=host===$('stage')&&['unit','assembly'].includes(phase)&&preview===null,sideRoom=labelled?Math.max(.4,(r.width-Math.max(72,144-.2*r.width))/r.width):1;let d=0;for(const x of[box.min.x,box.max.x])for(const y of[box.min.y,box.max.y])for(const z of[box.min.z,box.max.z]){const v=new T.Vector3(x,y,z).sub(target);d=Math.max(d,v.dot(toward)+1.2*Math.abs(v.dot(right))/(Math.tan(hf)*sideRoom),v.dot(toward)+1.2*Math.abs(v.dot(up))/Math.tan(vf));}cam.position.copy(toward.multiplyScalar(Math.max(d,.2)/z).add(target));cam.lookAt(target);cam.updateProjectionMatrix();cam.updateMatrixWorld();}
function render(){const r=$('stage').getBoundingClientRect();renderer.setSize(r.width,r.height,false);fit(camera,bounds,$('stage'),yaw,pitch,zoom);renderer.render(scene,camera);drawGuide();drawUnitLabels();renderDetail();}
function project(v,cam,host){const p=v.clone().project(cam),r=host.getBoundingClientRect();return{x:(p.x+1)*r.width/2,y:(1-p.y)*r.height/2};}
const defs=id=>`<defs><marker id="${id}" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="8" markerHeight="8" orient="auto"><path d="M0 0L10 5L0 10Z" fill="#bf5217"/></marker></defs>`;
const line=(a,b,dash=false,arrow='')=>`<line x1="${a.x}" y1="${a.y}" x2="${b.x}" y2="${b.y}" stroke="#bf5217" stroke-width="3" ${dash?'stroke-dasharray="6 5"':''} ${arrow?`marker-end="url(#${arrow})"`:''}/>`;
const mark=(p,t)=>`<circle cx="${p.x}" cy="${p.y}" r="6" fill="white" stroke="#bf5217" stroke-width="3"/><text x="${p.x+10}" y="${p.y-9}" fill="#8e3a10" font-size="12" font-weight="bold" stroke="white" stroke-width="4" paint-order="stroke">${t}</text>`;
function prepareSvg(s,host){const r=host.getBoundingClientRect();s.setAttribute('viewBox',`0 0 ${r.width} ${r.height}`);s.innerHTML='';}
function point(ids){const ps=ids.map(id=>by.get(id)).filter(Boolean);return ps.map(center).reduce((s,v)=>s.add(v),new T.Vector3()).multiplyScalar(1/Math.max(1,ps.length));}
function mainPoint(ids){const ps=ids.filter(id=>groups.has(id));return ps.map(id=>groups.get(id).localToWorld(center(by.get(id)))).reduce((s,v)=>s.add(v),new T.Vector3()).multiplyScalar(1/Math.max(1,ps.length));}
function drawGuide(){
 prepareSvg(svg,$('stage'));
 if(preview!==null||!actions.length||!['unit','assembly'].includes(phase))return;
 // An overview needs no connection marks until its parts are separated.
 if(phase==='unit'&&current.presentation==='overview'&&explode===0)return;
 root.updateMatrixWorld(true);svg.innerHTML=defs('main-arrow');
 const added=new Set(current.newPieces||[]);
 actions.forEach((a,index)=>{
  let start,end;
  if(a.kind==='port'){
   const s=socket(a),plate=groups.get(a.piece),joint=groups.get(a.joint);if(!plate||!joint)return;
   // Both ends refer to the SAME socket point in assembled coordinates.
   // Applying each part's display transform keeps arrows attached while rotating/separating.
   const onPlate=plate.localToWorld(s.mid.clone()),onJoint=joint.localToWorld(s.mid.clone());
   const plateMoves=added.has(a.piece)&&!added.has(a.joint);
   start=plateMoves?onPlate:onJoint;end=plateMoves?onJoint:onPlate;
  }else{
   if(!a.moving?.some(id=>groups.has(id))||!a.support?.some(id=>groups.has(id)))return;
   start=mainPoint(a.moving);end=mainPoint(a.support);
  }
  const p=project(end,camera,$('stage')),q=project(start,camera,$('stage'));
  if(Math.hypot(p.x-q.x,p.y-q.y)<12){q.x=p.x+(index%2?18:-18);q.y=p.y-32;}
  const cx=(p.x+q.x)/2,cy=Math.min(p.y,q.y)-24;
  const d=`M ${q.x} ${q.y} Q ${cx} ${cy} ${p.x} ${p.y}`;
  svg.innerHTML+=`<g class="connection-arrow" data-connection="${index}"><path d="${d}" fill="none" stroke="white" stroke-width="6" stroke-opacity=".85"/><path class="connection-path" d="${d}" fill="none" stroke="#bf5217" stroke-width="3" stroke-dasharray="6 4" marker-end="url(#main-arrow)"/></g>`;
 });
}
function buildDetail(){dispose(detailRoot);detailPoints=null;const a=actions[action];
 if(preview!==null){const p=model.pieces.find(p=>p.partNo===preview&&(!previewColor||p.color===previewColor)),c=model.connections.find(c=>c.joint===p.id),s=c?socket(c.ports[0]):socket({piece:p.id,socket:0}),n=s.normal.clone();if(preview===7){const third=c?.ports.find(p=>p.port===2);if(third&&socket(third).inward.dot(n)<0)n.negate();}const matrix=new T.Matrix4().makeBasis(s.axis,s.inward,n).invert(),g=part(p);g.applyMatrix4(matrix);detailRoot.add(g);$('guide-title').textContent=`No.${preview} の形`;$('guide-description').textContent='ゆびで なぞって、かたちを 見てね。';$('guide-key').textContent='写真から近似した表示形状です。';}
 else if(a){$('guide-title').textContent=`つなぐところ　${action+1} / ${actions.length}`;$('guide-description').textContent='オレンジの やじるしの ところを つなごう。';
  if(a.kind==='port'){const s=socket(a),matrix=new T.Matrix4().makeBasis(s.axis,s.inward,s.normal).invert(),j=part(by.get(a.joint)),p=part(by.get(a.piece)),offset=s.inward.clone().multiplyScalar(.7);p.position.add(offset);j.applyMatrix4(matrix);p.applyMatrix4(matrix);detailRoot.add(j,p);detailPoints={start:s.mid.clone().add(offset).applyMatrix4(matrix),end:s.mid.clone().applyMatrix4(matrix)};$('guide-key').textContent='てんせんで ばしょを 見くらべて、やじるしの むきに あわせよう。';}
  else{const ids=[...new Set([...a.support,...a.moving])],offset=V(a.offset||[0,0,.9]);for(const id of ids){const g=part(by.get(id));if(a.moving.includes(id))g.position.add(offset);detailRoot.add(g);}detailRoot.rotation.x=-Math.PI/2;detailPoints={start:point(a.moving).add(offset),end:point(a.moving),world:true};$('guide-key').textContent=a.kind==='link'?'透明の部品を使って隊列をつなぐ配置です。':'載せる・挟む位置の対応です。離す方向と矢印は説明用で、実際の挿入経路は未検証です。';}
 }
 if(!detailPoints?.world)detailRoot.rotation.set(0,0,0);detailRoot.updateMatrixWorld(true);detailBounds.setFromObject(detailRoot);$('guide-prev').disabled=preview!==null||action===0;$('guide-next').disabled=preview!==null||action===actions.length-1;renderDetail();}
function renderDetail(){prepareSvg(detailSvg,$('detail-stage'));if($('guide').hidden)return;const r=$('detail-stage').getBoundingClientRect();detailRenderer.setSize(r.width,r.height,false);fit(detailCamera,detailBounds,$('detail-stage'),detailYaw,detailPitch);detailRenderer.render(detailScene,detailCamera);if(detailPoints){const f=v=>project(detailPoints.world?detailRoot.localToWorld(v.clone()):v,detailCamera,$('detail-stage')),a=f(detailPoints.start),b=f(detailPoints.end),dx=b.x-a.x,dy=b.y-a.y,len=Math.max(1,Math.hypot(dx,dy)),shift={x:-dy/len*22,y:dx/len*22};detailSvg.innerHTML=defs('detail-arrow')+line(a,b,true)+line({x:a.x+shift.x,y:a.y+shift.y},{x:b.x+shift.x,y:b.y+shift.y},false,'detail-arrow')+mark(a,actions[action]?.kind==='port'?'あわせる へん':'離した位置')+mark(b,actions[action]?.kind==='port'?'つなぐ ばしょ':actions[action]?.kind==='rest'?'載せる位置':'挟む位置');}}
function chooseAction(i){if(i<0||i>=actions.length)return;action=i;preview=null;$('return-guide').hidden=true;detailYaw=.4;detailPitch=.4;[...$('actions').children].forEach((b,k)=>b.setAttribute('aria-pressed',k===i));render();}

const displayLabel=id=>data.displayLabels?.[id]||id;
function unitName(id){return variant.units.find(u=>u.id===id)?.label||(id===variant.finished?'できあがり':'ここまで組んだ塊');}
// Keep ID badges in the outer side gutters, away from parts and connection arrows.
function drawUnitLabels(){
 if(preview!==null||!['unit','assembly'].includes(phase))return;
 const host=$('stage'),r=host.getBoundingClientRect(),occupied=[];root.updateMatrixWorld(true);
 const labels=Object.entries(labelMembers).map(([id,ids])=>{
  const shown=ids.filter(p=>groups.has(p));if(!shown.length)return null;
  const box=new T.Box3();for(const pid of shown)box.union(new T.Box3().setFromObject(groups.get(pid)));
  const projected=[];for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])projected.push(project(new T.Vector3(x,y,z),camera,host));
  return{id,target:project(mainPoint(shown),camera,host),left:Math.min(...projected.map(p=>p.x)),right:Math.max(...projected.map(p=>p.x))};
 }).filter(Boolean).sort((a,b)=>a.target.x-b.target.x);
 labels.forEach((label,index)=>{
  const left=labels.length===1?label.target.x<=r.width/2:index<labels.length/2;
  const x=left?31:r.width-31;
  let y=Math.max(24,Math.min(r.height-45,label.target.y));
  const candidates=[y];for(let delta=34;delta<r.height;delta+=34)candidates.push(y-delta,y+delta);
  y=candidates.find(value=>value>=24&&value<=r.height-45&&!occupied.some(p=>Math.abs(p.x-x)<60&&Math.abs(p.y-value)<32))??y;
  occupied.push({x,y});
  const anchor={x:left?label.left:label.right,y:label.target.y},edge=x+(left?25:-25);
  svg.innerHTML+=`<g class="unit-label" data-unit="${esc(label.id)}"><line x1="${anchor.x}" y1="${anchor.y}" x2="${edge}" y2="${y}" stroke="#2c6554" stroke-opacity=".65" stroke-dasharray="3 3"/><rect x="${x-25}" y="${y-13}" width="50" height="26" rx="5"/><text x="${x}" y="${y}">${esc(displayLabel(label.id))}</text></g>`;
 });
}
function indexVariant(){variant=data.variants[mode];model=variant.model;by=new Map(model.pieces.map(p=>[p.id,p]));members={};for(const u of variant.units)members[u.id]=u.pieceIds;for(const s of variant.assembly)members[s.result]=s.visiblePieces;}
function saveRoute(){const params=new URLSearchParams({mode,phase,step:String(step)});if(selectedUnit)params.set('unit',selectedUnit);history.replaceState(null,'','#'+params);}
function go(nextPhase,unit=null,nextStep=0,focus=true){phase=nextPhase;selectedUnit=unit;step=nextStep;zoom=1;explode=phase==='assembly'?.65:0;$('explode').value=String(explode*100);build();saveRoute();if(focus)$('workspace').scrollIntoView({block:'start',behavior:'instant'});}
function switchVariant(id,focus=false){mode=id;indexVariant();yaw=id==='train'?-.3:.3;pitch=.35;go('catalog',null,0,false);if(focus)$('catalog').scrollIntoView({block:'start',behavior:'instant'});}
function openUnit(unit){if(unit.recipe){switchVariant(unit.recipe.variant,true);return;}go('unit',unit.id);}
const returnRoutes=[];
function openReference(id){returnRoutes.push({mode,phase,selectedUnit,step,result:current.result});const unit=variant.units.find(u=>u.id===id);if(unit){openUnit(unit);return;}const i=variant.assembly.findIndex(s=>s.result===id);if(i>=0)go('assembly',null,i);}
function button(text,fn){const b=document.createElement('button');b.textContent=text;b.onclick=fn;return b;}
const thumbs=new Map();let thumbRenderer;
function thumbnail(unit){const key=mode+':'+unit.id;if(thumbs.has(key))return thumbs.get(key);
 if(!thumbRenderer){thumbRenderer=new T.WebGLRenderer({alpha:true,antialias:true,preserveDrawingBuffer:true});thumbRenderer.setSize(400,260);}
 const ss=new T.Scene(),rr=new T.Group(),cc=new T.PerspectiveCamera(32,400/260,.01,200);rr.rotation.x=-Math.PI/2;ss.add(rr);ss.add(new T.HemisphereLight(0xffffff,0x98aaa0,1.8));const l=new T.DirectionalLight(0xffffff,2.2);l.position.set(-3,5,7);ss.add(l);
 for(const id of unit.pieceIds){const p=by.get(id),g=part(p);if(unit.id.startsWith('part:')){rr.rotation.x=0;const c=model.connections.find(c=>c.joint===p.id),s=c?socket(c.ports[0]):socket({piece:p.id,socket:0}),n=s.normal.clone();if(p.partNo===7){const third=c?.ports.find(p=>p.port===2);if(third&&socket(third).inward.dot(n)<0)n.negate();}g.applyMatrix4(new T.Matrix4().makeBasis(s.axis,s.inward,n).invert());}rr.add(g);}ss.updateMatrixWorld(true);const box=new T.Box3().setFromObject(rr),host={getBoundingClientRect:()=>({width:400,height:260})};fit(cc,box,host,.35,.4);thumbRenderer.render(ss,cc);const url=thumbRenderer.domElement.toDataURL('image/png');dispose(rr);thumbs.set(key,url);return url;
}
function syncDetails(){$('guide').hidden=preview===null;$('show-connections').hidden=true;}
function build(){$('back-assembly').hidden=!returnRoutes.length;if(returnRoutes.length)$('back-assembly').textContent=`↩ ${returnRoutes[returnRoutes.length-1].result} の合体手順に戻る`;indexVariant();selectedUnit=variant.unitAliases?.[selectedUnit]||selectedUnit;const unit=variant.units.find(u=>u.id===selectedUnit);
 if(phase==='unit'&&(!unit||unit.recipe)){phase='catalog';selectedUnit=null;}
 sequence=phase==='unit'?unit.steps:phase==='assembly'?variant.assembly:[{title:`${variant.finished} ${data.displayName}の${mode==='train'?'完成した隊列':'完成形'}`,description:'完成形を回して確認できます。「塊を作る」で各IDの作り方、「塊をつなぐ」で合体手順を開けます。',visiblePieces:model.pieces.map(p=>p.id),newPieces:[],actions:[]}];
 step=Math.max(0,Math.min(step,sequence.length-1));current=sequence[step];const key=[mode,phase,selectedUnit,step].join(':');if(key!==detailStageKey){detailStageKey=key;detailsOpen=false;}actions=current.actions||[];if(phase==='unit'&&current.presentation==='join'){const addedIds=new Set(current.newPieces);actions=actions.filter(a=>a.kind!=='port'||addedIds.has(a.joint)!==addedIds.has(a.piece));}action=0;preview=null;$('return-guide').hidden=true;dispose(root);groups.clear();const visible=new Set(current.visiblePieces),added=new Set(current.newPieces);
 labelMembers=phase==='assembly'?Object.fromEntries(current.inputs.map(id=>[id,members[id]])):phase==='unit'?{[unit.id]:unit.pieceIds}:{[variant.finished]:model.pieces.map(p=>p.id)};
 const separationMembers=phase==='assembly'?labelMembers:phase==='unit'?Object.fromEntries([...visible].map(id=>[id,[id]])):Object.fromEntries(variant.units.map(u=>[u.id,u.pieceIds]));
 // Scale each displacement by its distance from the centre. Equal-length radial
 // offsets leave neighbours on the same ray stuck together (e.g. A1 sides).
 const offsets=new Map(),overall=point([...visible]);let n=0;for(const ids of Object.values(separationMembers)){const v=point(ids).sub(overall);if(phase!=='unit'&&v.length()<.08)v.set(n%2?1:-1,0,.7);if(phase==='unit')v.multiplyScalar(explode*2.5);else v.normalize().multiplyScalar(explode*1.55);for(const pid of ids)offsets.set(pid,v);n++;}
 for(const p of model.pieces.filter(p=>visible.has(p.id))){const g=part(p,added.has(p.id));if(offsets.has(p.id))g.position.add(offsets.get(p.id));root.add(g);groups.set(p.id,g);}scene.updateMatrixWorld(true);bounds.setFromObject(root);
 $('breadcrumb').textContent=phase==='unit'?`1　塊を作る ／ ${unit.id} ${unit.label}`:phase==='assembly'?`2　塊をつなぐ ／ ${step+1}・${sequence.length}`:'できあがりを確認';
 $('step-title').textContent=phase==='unit'?`${unit.id}${sequence.length>1?'－'+(step+1):''}　${current.title}`:current.title;
 $('description').textContent=current.description||(phase==='unit'?`${unit.id} を図の形に組み立てます。`:'');
 if(phase==='unit'&&unit.quantity>1)$('description').textContent+=` 同じ塊を${unit.quantity}組用意します。`;
 $('summary').textContent=current.presentation==='overview'?`${unit.id}：${visible.size}個をまとめて組む`:`表示 ${visible.size} / ${phase==='unit'?unit.pieceIds.length:model.pieces.length} 個 · 今回の接続・配置 ${actions.length} か所`;
 $('selected').textContent='パーツを おすと、ばんごうと いろが わかるよ。';$('notice').textContent=data.notice;
 $('formula').replaceChildren();if(phase==='assembly'){current.inputs.forEach((id,i)=>{if(i){const op=document.createElement('span');op.className='operator';op.textContent='+';$('formula').append(op);}const b=button('',()=>openReference(id));b.innerHTML=`<span class="id-badge">${esc(id)}</span>${esc(unitName(id))}`;b.dataset.reference=id;$('formula').append(b);});const out=document.createElement('span');out.className='result';out.innerHTML=`→ <span class="id-badge">${esc(current.result)}</span>`;$('formula').append(out);const help=document.createElement('p');help.className='subtitle';help.textContent='入力のIDを押すと、その塊の作り方へ戻れます。できた塊は右のIDで次の手順に登場します。';$('formula').append(help);}
 [...$('tabs').children].forEach(b=>b.setAttribute('aria-pressed',b.dataset.mode===mode));$('catalog-tab').setAttribute('aria-current',phase==='catalog'||phase==='unit');$('assembly-tab').setAttribute('aria-current',phase==='assembly');$('complete').setAttribute('aria-current',phase==='complete');
 $('catalog').hidden=phase!=='catalog';$('catalog-title').textContent=`${variant.label}：用意する塊`;$('catalog-description').textContent=variant.description||`${variant.units.length}種類の塊をそれぞれ作ります。${variant.quantity>1?`ヘイは5体必要なので、各塊も5組ずつ用意します。`:''}できあがった形とIDを一覧で確かめてから合体します。`;
 $('steps').replaceChildren();if(phase==='catalog'||phase==='complete'){const label=document.createElement('p');label.className='step-group';label.textContent='合体の流れ（IDを選ぶと開きます）';$('steps').append(label);variant.assembly.forEach((s,i)=>{const b=button(`${s.inputs.join(' + ')} → ${s.result}`,()=>go('assembly',null,i));$('steps').append(b);});}else sequence.forEach((s,i)=>{const b=button('',()=>{step=i;zoom=1;build();saveRoute();});b.setAttribute('aria-current',i===step);b.innerHTML=phase==='assembly'?`<b>${esc(s.inputs.join(' + '))} → ${esc(s.result)}</b><small>${esc(s.title)}</small>`:`${esc(unit.id)}${sequence.length>1?'－'+(i+1):''}　${esc(s.title)}`;$('steps').append(b);});
 $('prev').disabled=step===0;$('next').disabled=step===sequence.length-1;$('prev').hidden=$('next').hidden=phase==='catalog'||phase==='complete'||sequence.length===1;$('finish-unit').hidden=!(step===sequence.length-1&&(phase==='unit'||phase==='assembly'));
 $('finish-unit').textContent=phase==='assembly'?(mode==='leader'||mode==='soldier'?'できた塊を隊列につなぐ':'完成形を見る'):variant.units.indexOf(unit)<variant.units.length-1?`次は ${variant.units[variant.units.indexOf(unit)+1].id} を作る →`:'塊がそろったら、合体へ →';
 syncDetails();actionButtons();if(actions.length)chooseAction(0);
 const source=data.photos.find(p=>p.id===current.photo)||data.photos[0];if(source){$('source-photo').src=source.file;$('source-title').textContent=source.title;}$('source-caption').textContent='照合用の元写真です。塊の形と合体手順は復元モデルの接続に基づきます。';
 const inventoryPieces=phase==='unit'?unit.pieceIds.map(id=>by.get(id)):model.pieces;$('inventory-title').textContent=`${phase==='unit'?unit.id+' '+unit.label:variant.label}：1組に ${inventoryPieces.length} 個。${(unit?.quantity||variant.quantity||1)>1?'同じものを5組用意します。':''}`;
 const counts=new Map();for(const p of inventoryPieces){const k=p.partNo+':'+p.color;counts.set(k,(counts.get(k)||0)+1);}$('inventory').replaceChildren();for(const [key,count]of [...counts].sort((a,b)=>parseInt(a[0])-parseInt(b[0]))){const [no,col]=key.split(':'),tr=document.createElement('tr');tr.innerHTML=`<td>No.${no}</td><td><span class="swatch" style="background:#${(colors[col]||0xaaaaaa).toString(16).padStart(6,'0')}"></span>${colorNames[col]||col}</td><td>${count}</td><td><button class="part-button">3Dで確認</button></td>`;tr.querySelector('button').onclick=()=>{preview=Number(no);$('guide').hidden=false;$('actions').replaceChildren();$('return-guide').hidden=false;buildDetail();render();$('guide').scrollIntoView({behavior:'instant',block:'center'});};$('inventory').append(tr);}
 render();window.__renderComplete=true;
}
function actionButtons(){$('actions').replaceChildren();actions.forEach((_a,i)=>{const b=button(`${i+1}`,()=>chooseAction(i));b.setAttribute('aria-label',`つなぐところ ${i+1}`);$('actions').append(b);});}
for(const [id,v]of Object.entries(data.variants)){const b=button(v.label,()=>switchVariant(id));b.dataset.mode=id;$('tabs').append(b);}
$('catalog-tab').onclick=()=>{go('catalog',null,0,false);$('catalog').scrollIntoView({block:'start',behavior:'instant'});};$('assembly-tab').onclick=()=>go('assembly');$('begin').onclick=()=>openUnit(variant.units[0]);$('complete').onclick=()=>go('complete');
$('prev').onclick=()=>{if(step>0){step--;zoom=1;build();saveRoute();}};$('next').onclick=()=>{if(step<sequence.length-1){step++;zoom=1;build();saveRoute();}};
$('finish-unit').onclick=()=>{if(phase==='assembly'){if(mode==='leader'||mode==='soldier'){switchVariant('train');go('assembly');}else go('complete');return;}const i=variant.units.findIndex(u=>u.id===selectedUnit);if(i<variant.units.length-1)openUnit(variant.units[i+1]);else go('assembly');};
$('back-assembly').onclick=()=>{const route=returnRoutes.pop();if(!route)return;mode=route.mode;go(route.phase,route.selectedUnit,route.step);};
$('fit').onclick=()=>{zoom=1;render();};$('explode').oninput=()=>{explode=Number($('explode').value)/100;build();};$('xray').onchange=build;$('guide-prev').onclick=()=>chooseAction(action-1);$('guide-next').onclick=()=>chooseAction(action+1);$('return-guide').onclick=()=>{preview=null;$('return-guide').hidden=true;actionButtons();syncDetails();if(actions.length)chooseAction(action);else render();};
 $('show-connections').onclick=()=>{detailsOpen=!detailsOpen;preview=null;$('return-guide').hidden=true;syncDetails();actionButtons();if(detailsOpen)chooseAction(action);else render();};
 for(const [label,y,p]of[['ななめ',.3,.35],['まえ',0,.1],['よこ',Math.PI/2,.15],['うえ',.4,1.3],['した',.4,-1.3]]){const b=document.createElement('button');b.textContent=label;b.onclick=()=>{yaw=y;pitch=p;zoom=1;render();};$('presets').append(b);}
 const ray=new T.Raycaster();$('stage').onpointerdown=e=>{drag={x:e.clientX,y:e.clientY,sx:e.clientX,sy:e.clientY};$('stage').setPointerCapture(e.pointerId);};$('stage').onpointermove=e=>{if(!drag)return;yaw-=(e.clientX-drag.x)*.008;pitch=Math.max(-1.5,Math.min(1.5,pitch+(e.clientY-drag.y)*.008));drag.x=e.clientX;drag.y=e.clientY;render();};$('stage').onpointerup=e=>{if(drag&&Math.hypot(e.clientX-drag.sx,e.clientY-drag.sy)<5){const b=$('stage').getBoundingClientRect();ray.setFromCamera(new T.Vector2((e.clientX-b.left)/b.width*2-1,1-(e.clientY-b.top)/b.height*2),camera);let hit=ray.intersectObject(root,true).find(h=>h.object.isMesh)?.object;while(hit&&!hit.userData.pieceId)hit=hit.parent;if(hit){const p=by.get(hit.userData.pieceId);$('selected').textContent=`No.${p.partNo}・${colorNames[p.color]||p.color}`;window.dispatchEvent(new CustomEvent('laq-piece-selected',{detail:{id:p.id}}));}}drag=null;};$('stage').onpointercancel=()=>drag=null;$('stage').onwheel=e=>{e.preventDefault();zoom=Math.max(.65,Math.min(3,zoom*Math.exp(-e.deltaY*.001)));render();};
 $('detail-stage').onpointerdown=e=>{detailDrag={x:e.clientX,y:e.clientY};$('detail-stage').setPointerCapture(e.pointerId);};$('detail-stage').onpointermove=e=>{if(!detailDrag)return;detailYaw-=(e.clientX-detailDrag.x)*.009;detailPitch=Math.max(-1.4,Math.min(1.4,detailPitch+(e.clientY-detailDrag.y)*.009));detailDrag={x:e.clientX,y:e.clientY};renderDetail();};$('detail-stage').onpointerup=$('detail-stage').onpointercancel=()=>detailDrag=null;
 for(const p of data.photos){const b=document.createElement('button'),img=document.createElement('img');img.src=p.file;img.alt=p.title;b.append(img,document.createTextNode(p.title));b.onclick=()=>{$('large-photo').src=p.file;$('photo-dialog').showModal();};$('photos').append(b);}$('close-photo').onclick=()=>$('photo-dialog').close();for(const text of data.limits){const li=document.createElement('li');li.textContent=text;$('limits').append(li);}

 $('article').href=data.article;$('source-photo').onclick=()=>{$('large-photo').src=$('source-photo').src;$('photo-dialog').showModal();};
 function readRoute(){const q=new URLSearchParams(location.hash.slice(1));mode=q.get('mode') in data.variants?q.get('mode'):data.defaultVariant;phase=['catalog','unit','assembly','complete'].includes(q.get('phase'))?q.get('phase'):'catalog';selectedUnit=q.get('unit');step=Number(q.get('step'))||0;explode=phase==='assembly'?.65:0;$('explode').value=explode*100;build();}
 new ResizeObserver(()=>{if(bounds.isEmpty())return;render();}).observe($('stage'));new ResizeObserver(renderDetail).observe($('detail-stage'));readRoute();window.addEventListener('hashchange',readRoute);

 window.__unitGuide=()=>{const projected=[],pieceScreens=[];for(const [id,g] of groups){const points=[];g.traverse(o=>{if(o.isMesh){const a=o.geometry.attributes.position;for(let i=0;i<a.count;i++){const p=new T.Vector3().fromBufferAttribute(a,i).applyMatrix4(o.matrixWorld).project(camera);projected.push(p);points.push(p);}}});pieceScreens.push({id,offset:g.position.toArray(),bounds:points.reduce((b,p)=>({left:Math.min(b.left,p.x),right:Math.max(b.right,p.x),top:Math.max(b.top,p.y),bottom:Math.min(b.bottom,p.y)}),{left:Infinity,right:-Infinity,top:-Infinity,bottom:Infinity})});}return{pieceScreens,mode,phase,unit:selectedUnit,step,result:current.result||variant.finished,inputs:current.inputs||[],renderedIds:[...groups.keys()],labels:Object.keys(labelMembers),visible:groups.size,total:model.pieces.length,actions:actions.length,action,preview,previewColor,explode,screenBounds:projected.reduce((b,p)=>({left:Math.min(b.left,p.x),right:Math.max(b.right,p.x),top:Math.max(b.top,p.y),bottom:Math.min(b.bottom,p.y)}),{left:Infinity,right:-Infinity,top:-Infinity,bottom:Infinity}),inFrame:projected.every(p=>Math.abs(p.x)<=1&&Math.abs(p.y)<=1),detailsOpen,presentation:current.presentation||null,selectedAction:actions[action]};};
 // Small same-origin API; the React journey owns all chapter/step navigation.
 window.LaQLibraryViewer={
  replaceGuide(next){
   const previous=JSON.parse(JSON.stringify(data));
   try{for(const key of Object.keys(data))delete data[key];Object.assign(data,next,{photos:[],limits:[]});mode=data.defaultVariant;thumbs.clear();build();}
   catch(error){for(const key of Object.keys(data))delete data[key];Object.assign(data,previous);mode=data.defaultVariant;build();throw error;}
  },
  selectPieces(ids){
   for(const [id,g]of groups)g.traverse(o=>{if(o.isMesh&&o.material.emissive){o.material.emissive.setHex(ids.includes(id)?0x0066cc:0);o.material.emissiveIntensity=ids.includes(id)?.45:0;}});render();
  },
  show(request){
   document.body.dataset.view=request.phase==='parts'?'part':'model';
   previewColor=request.partColor||null;$('xray').checked=false;yaw=.3;pitch=.35;detailYaw=.4;detailPitch=.4;
   if(request.phase==='parts'){
    go('complete',null,0,false);preview=request.partNo||1;
    $('guide').hidden=false;$('actions').replaceChildren();$('return-guide').hidden=true;
    buildDetail();render();
   }else{go(['unit','assembly'].includes(request.phase)?request.phase:'complete',request.unit||null,request.step||0,false);}
  },
  images(){
   const images={};
   for(const unit of variant.units)images[unit.id]=thumbnail(unit);
   for(const p of model.pieces){const id='part:'+p.partNo+':'+p.color;if(!images[id])images[id]=thumbnail({id,pieceIds:[p.id]});}
   for(const s of variant.assembly)images[s.result]=thumbnail({id:s.result,pieceIds:s.visiblePieces});
   return images;
  }
 };
 const zoomButton=(id,factor)=>{const b=button(id,()=>{zoom=Math.max(.65,Math.min(3,zoom*factor));render();});$('presets').append(b);};
 zoomButton('＋ 大きく',1.2);zoomButton('− 小さく',1/1.2);
 $('stage').tabIndex=0;$('stage').setAttribute('aria-label','3Dの図。矢印キーで回転、プラスとマイナスで拡大縮小');
 $('stage').onkeydown=e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','+','-'].includes(e.key))return;e.preventDefault();if(e.key==='ArrowLeft')yaw+=.15;if(e.key==='ArrowRight')yaw-=.15;if(e.key==='ArrowUp')pitch=Math.min(1.5,pitch+.15);if(e.key==='ArrowDown')pitch=Math.max(-1.5,pitch-.15);if(e.key==='+')zoom=Math.min(3,zoom*1.2);if(e.key==='-')zoom=Math.max(.65,zoom/1.2);render();};

 $('detail-stage').tabIndex=0;$('detail-stage').setAttribute('aria-label','大きい図。矢印キーで回転できます');
 $('detail-stage').onkeydown=e=>{if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key))return;e.preventDefault();if(e.key==='ArrowLeft')detailYaw+=.15;if(e.key==='ArrowRight')detailYaw-=.15;if(e.key==='ArrowUp')detailPitch=Math.min(1.4,detailPitch+.15);if(e.key==='ArrowDown')detailPitch=Math.max(-1.4,detailPitch-.15);renderDetail();};

})();
