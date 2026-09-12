/* Photo-informed display meshes. Coordinates stay in the assembly's normalized
 * world space; these are not measured tooling/CAD or an interference model.
 * Evidence and intentionally estimated dimensions: REALISTIC-PARTS.md. */
(function () {
  'use strict';
  const THICKNESS = .086, SKIN = .026, SLOT = .034;
  const vec = (T, p) => new T.Vector3(...p);
  function mesh(T, shape, depth, z, material) {
    const g = new T.ExtrudeGeometry(shape, {depth, steps:1, curveSegments:10,
      bevelEnabled:true, bevelSegments:1, bevelSize:.003, bevelThickness:.002});
    g.translate(0, 0, z);
    return new T.Mesh(g, material);
  }
  function circle(T, x, y, r) {
    const hole = new T.Path(); hole.absarc(x, y, r, 0, Math.PI * 2, true); return hole;
  }
  function polygon(T, points) {
    const s = new T.Shape(); points.forEach((p,i) => i ? s.lineTo(...p) : s.moveTo(...p)); s.closePath(); return s;
  }
  function socketShape(T, points) {
    // Rounded corners and concave socket shoulders are on the outer skins.
    // A thin central bed remains underneath each socket, as in the official photos.
    const s = new T.Shape(), n = points.length, turn = .035;
    const signed = points.reduce((a,p,i) => a+p[0]*points[(i+1)%n][1]-p[1]*points[(i+1)%n][0],0);
    const at = (a,b,t,inset=0) => {
      const dx=b[0]-a[0],dy=b[1]-a[1],l=Math.hypot(dx,dy), side=signed>0?1:-1;
      return [a[0]+dx*t-side*dy/l*inset,a[1]+dy*t+side*dx/l*inset];
    };
    s.moveTo(...at(points[0],points[1],turn));
    points.forEach((a,i) => {
      const b=points[(i+1)%n], c=points[(i+2)%n];
      s.lineTo(...at(a,b,.23));
      s.bezierCurveTo(...at(a,b,.34),...at(a,b,.31,.225),...at(a,b,.50,.225));
      s.bezierCurveTo(...at(a,b,.69,.225),...at(a,b,.66),...at(a,b,.77));
      s.lineTo(...at(a,b,1-turn));
      s.quadraticCurveTo(...b,...at(b,c,turn));
    });
    s.closePath(); return s;
  }
  // Common edge 17 mm and overall thickness 3.5 mm are user-specified. Relief is estimated. No.2's
  // equal edge length is user-confirmed; assembly anchors stay fixed.
  const PLATE_PROFILE = Object.freeze({edgeMm:17, thicknessMm:3.5,
    bedMm:.61, rimMm:1.0, evidence:'user-parts-2026-09-11',
    equalEdgesUserConfirmed:true, thicknessUserConfirmed:true, smallRecessThroughHoleConfirmed:false});
  function roundedPolygon(T, points, turn=.06) {
    const s=new T.Shape(), at=(a,b,t)=>[a[0]+(b[0]-a[0])*t,a[1]+(b[1]-a[1])*t];
    s.moveTo(...at(points[0],points[1],turn));
    points.forEach((a,i)=>{const b=points[(i+1)%points.length],c=points[(i+2)%points.length];
      s.lineTo(...at(a,b,1-turn));s.quadraticCurveTo(...b,...at(b,c,turn));});
    s.closePath();return s;
  }
  function dish(T, x, y, radius, low, high, material) {
    // A blind, curved mould recess: real surface triangles, not a dark decal.
    const positions=[],rings=5,segments=32;
    const point=(r,i)=>{const t=r/rings,angle=i/segments*Math.PI*2;return [x+radius*t*Math.cos(angle),y+radius*t*Math.sin(angle),low+(high-low)*t*t];};
    for(let r=0;r<rings;r++)for(let i=0;i<segments;i++){
      const a=point(r,i),b=point(r+1,i),c=point(r+1,i+1),d=point(r,i+1);
      positions.push(...a,...b,...c,...a,...c,...d);
    }
    const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(positions,3));geo.computeVertexNormals();
    return new T.Mesh(geo,material);
  }
  function plate(T, piece, material) {
    const group=new T.Group(), vs=piece.pose.vertices.map(p=>vec(T,p));
    const center=vs.reduce((a,b)=>a.add(b),new T.Vector3()).multiplyScalar(1/vs.length);
    const n=vec(T,piece.pose.normal).normalize(), u=vs[1].clone().sub(vs[0]).normalize();
    const v=new T.Vector3().crossVectors(n,u).normalize();
    const local=new T.Group();local.position.copy(center);local.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(u,v,n));group.add(local);
    const points=vs.map(p=>{const d=p.clone().sub(center);return[d.dot(u),d.dot(v)];});
    const t=PLATE_PROFILE.thicknessMm/PLATE_PROFILE.edgeMm-.004, bedT=PLATE_PROFILE.bedMm/PLATE_PROFILE.edgeMm;
    const holes=[];
    if(piece.partNo===2)points.forEach((p,i)=>{const q=points[(i+1)%points.length];holes.push([(p[0]+q[0])*.225,(p[1]+q[1])*.225,.029]);});
    const bed=roundedPolygon(T,points,.025);holes.forEach(h=>bed.holes.push(circle(T,...h)));
    local.add(mesh(T,bed,bedT,-bedT/2,material));
    // Reverse photo does not establish through-holes at the socket-bed marks.
    // Keep a thin floor until depth/backlighting is measured.
    holes.forEach(([x,y,r])=>{const floor=new T.Mesh(new T.CylinderGeometry(r,r,.010,24),material);floor.rotation.x=Math.PI/2;floor.position.set(x,y,-bedT/2+.005);local.add(floor);});
    const front=socketShape(T,points),back=socketShape(T,points);
    if(piece.partNo===1){
      front.holes.push(circle(T,0,0,.074));
      // Photo 5: a continuous rear frame surrounding a deep, X-shaped recess.
      const inner=socketShape(T,points.map(p=>p.map(x=>x*.85)));
      back.holes.push(new T.Path(inner.getPoints(14)));
    }else{
      // Photo 8: three blind wells inside the vertex pads on the reverse face.
      // They are separate from the small circular recesses in the three socket beds.
      points.forEach(p=>{
        const r=Math.hypot(...p),dx=p[0]/r,dy=p[1]/r,cx=p[0]*.71,cy=p[1]*.71;
        const well=new T.Path();well.absellipse(cx,cy,.051,.071,0,Math.PI*2,true,Math.atan2(dy,dx)-Math.PI/2);
        back.holes.push(well);
      });
    }
    local.add(mesh(T,front,t/2-bedT/2,bedT/2,material));
    local.add(mesh(T,back,t/2-bedT/2,-t/2,material));
    if(piece.partNo===1){
      // A shallow front dimple, and a low boss inside the hollow reverse face.
      const fill=new T.Mesh(new T.CylinderGeometry(.074,.074,t/2-.026,32),material);
      fill.rotation.x=Math.PI/2;fill.position.z=(t/2-.026)/2;local.add(fill);
      local.add(dish(T,0,0,.074,t/2-.026,t/2,material));
      const boss=new T.Mesh(new T.SphereGeometry(.074,24,12),material);
      boss.scale.z=.36;boss.position.z=-bedT/2+.002;local.add(boss);
    }else{
      points.forEach(p=>{
        const wellFloor=new T.Mesh(new T.SphereGeometry(.054,20,12),material);
        wellFloor.scale.z=.22;wellFloor.position.set(p[0]*.71,p[1]*.71,-bedT/2+.005);local.add(wellFloor);
      });
    }
    // Thin central tongue with two rounded ribs on each side. The socket bed
    // stays at the original plane: increasing pad thickness must not move ports.
    for(const side of [-1,1])points.forEach((a,i)=>{
      const b=points[(i+1)%points.length],dx=b[0]-a[0],dy=b[1]-a[1],len=Math.hypot(dx,dy);
      const mid=new T.Vector2((a[0]+b[0])/2,(a[1]+b[1])/2),inside=mid.clone().negate().normalize();
      for(const inset of [.040,.083]){
        const ridge=new T.Mesh(new T.CylinderGeometry(.009,.009,.38*len,10),material);
        ridge.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),new T.Vector3(dx/len,dy/len,0));
        ridge.position.set(mid.x+inside.x*inset,mid.y+inside.y*inset,side*(bedT/2+.004));local.add(ridge);
      }
    });
    group.userData.shapeKind=piece.partNo===1?'square-asymmetric-rear-frame':'triangle-asymmetric-vertex-wells';
    group.userData.displayThickness=PLATE_PROFILE.thicknessMm/PLATE_PROFILE.edgeMm;
    group.userData.profile=PLATE_PROFILE;group.userData.frontNormal=n.toArray();
    return group;
  }
  const JOINT_PROFILES={
    3:{lengthMm:17,totalWidthMm:11.7,waistMm:3.5,bodyMm:3.5,lobeWidthMm:6},
    4:{lengthMm:17,totalWidthMm:13.6,waistMm:5.9,bodyMm:3.5,lobeWidthMm:6},
    5:{lengthMm:17,bodyMm:3.5,hubNarrowMm:4,hubNarrowUserConfirmed:true,shapeEvidence:'user-connected-photos-2026-09-12'},
    6:{lengthMm:17,reachMm:6,bodyMm:3.5,lobeWidthMm:6,hubSquareMm:3.5},
    7:{lengthMm:17,reachMm:6,bodyMm:3.5,lobeWidthMm:6,hubSquareMm:3.5,shapeEvidence:"prior-hypothesis"}
  };
  function wing(T, inset, profile) {
    if(profile){
      const mm=PLATE_PROFILE.edgeMm,half=(profile.lengthMm/mm-.004)/2;
      const waist=(profile.waistMm||profile.bodyMm)/2/mm,tip=(profile.totalWidthMm?profile.totalWidthMm/2:profile.reachMm)/mm,r=profile.lobeWidthMm/2/mm;
      const s=new T.Shape();s.moveTo(-half,0);s.lineTo(half,0);s.lineTo(half,waist-.012);
      s.quadraticCurveTo(half,waist,half-.012,waist);s.lineTo(r+.075,waist);
      s.bezierCurveTo(r+.020,waist,r,waist+.015,r,tip-r);
      s.absarc(0,tip-r,r,0,Math.PI,false);
      s.bezierCurveTo(-r,waist+.015,-r-.020,waist,-r-.075,waist);
      s.lineTo(-half+.012,waist);s.quadraticCurveTo(-half,waist,-half,waist-.012);s.closePath();return s;
    }
    // No.7 remains a prior photo hypothesis until its own end-face photos arrive.
    const s=new T.Shape();s.moveTo(-.42,0);s.lineTo(.42,0);s.lineTo(.42,inset-.018);
    s.quadraticCurveTo(.42,inset,.401,inset);s.lineTo(.255,inset);
    s.bezierCurveTo(.205,inset,.212,inset+.052,.18,inset+.11);
    s.bezierCurveTo(.125,inset+.214,-.125,inset+.214,-.18,inset+.11);
    s.bezierCurveTo(-.212,inset+.052,-.205,inset,-.255,inset);
    s.lineTo(-.401,inset);s.quadraticCurveTo(-.42,inset,-.42,inset-.018);s.closePath();return s;
  }
  function forkSkin(T,shape,side,profile,material){
    const g=new T.ExtrudeGeometry(shape,{depth:1,steps:1,curveSegments:16,bevelEnabled:false}),pos=g.attributes.position;
    const mm=PLATE_PROFILE.edgeMm,land=(profile.waistMm||profile.bodyMm)/2,tip=profile.totalWidthMm?profile.totalWidthMm/2:profile.reachMm;
    for(let i=0;i<pos.count;i++){
      const y=Math.abs(pos.getY(i))*mm,t=Math.max(0,Math.min(1,(y-land)/(tip-land)));
      // Rounded internal pocket and a narrower entrance, visible in photos 3–6.
      const inner=(.65+.20*Math.exp(-(((t-.48)/.24)**2)))/mm;
      const outer=(profile.bodyMm/2-.25*t)/mm;
      const z=pos.getZ(i);pos.setZ(i,side>0?inner+(outer-inner)*z:-outer+(outer-inner)*z);
    }
    g.computeVertexNormals();return new T.Mesh(g,material);
  }
  const squareJointGeometryCache=new Map();
  function squareJoint(T, axis, dirs, center, profile, material) {
    // One exterior surface for the hub and all forks. Separate, overlapping
    // extrusions used to leave full-length seams on the same physical part.
    // Sweep the union's cross-section along the 17 mm axis; socket pockets
    // remain open and the square end retains its blind circular recess.
    const mm=PLATE_PROFILE.edgeMm,half=profile.bodyMm/2/mm,length=profile.lengthMm/mm;
    const radial=dirs[0].dir,normal=new T.Vector3().crossVectors(axis,radial).normalize();
    const active=new Set(dirs.map(d=>((Math.round(Math.atan2(d.dir.dot(normal),d.dir.dot(radial))/(Math.PI/2))%4)+4)%4));
    const group=new T.Group();group.position.copy(center);group.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(axis,radial,normal));
    const cacheKey=[profile.lengthMm,profile.bodyMm,profile.reachMm,profile.lobeWidthMm,[...active].sort().join('')].join(':');
    if(squareJointGeometryCache.has(cacheKey)){
      group.add(new T.Mesh(squareJointGeometryCache.get(cacheKey).clone(),material));return group;
    }
    const outline=wing(T,0,profile).getPoints(16);
    const stations=[...new Set([-length/2,length/2,...outline.map(p=>p.x)].map(x=>Math.round(x*1e8)/1e8))].sort((a,b)=>a-b);
    const extent=x=>{
      let y=half;
      for(let i=0;i<outline.length-1;i++){
        const a=outline[i],b=outline[i+1];
        if(Math.abs(a.x-b.x)<1e-10)continue;
        const t=(x-a.x)/(b.x-a.x);
        if(t>=-1e-6&&t<=1+1e-6)y=Math.max(y,a.y+t*(b.y-a.y));
      }
      return y;
    };
    const positions=[],triangle=(a,b,c)=>{
      const ab=new T.Vector3().subVectors(b,a),ac=new T.Vector3().subVectors(c,a);
      if(ab.cross(ac).lengthSq()>1e-20)positions.push(...a.toArray(),...b.toArray(),...c.toArray());
    };
    const crossSection=x=>{
      const points=[],reach=extent(x),steps=8;
      for(let side=0;side<4;side++){
        const angle=side*Math.PI/2,cos=Math.cos(angle),sin=Math.sin(angle);
        const add=(r,z)=>points.push(new T.Vector3(x,r*cos-z*sin,r*sin+z*cos));
        const profileAt=i=>{
          const r=half+(active.has(side)?reach-half:0)*i/steps;
          const t=Math.max(0,(r*mm-profile.bodyMm/2)/(profile.reachMm-profile.bodyMm/2));
          return {r,outer:(profile.bodyMm/2-.25*t)/mm,inner:(.65+.20*Math.exp(-(((t-.48)/.24)**2)))/mm};
        };
        // Counterclockwise outline: negative fork, its pocket, positive fork.
        for(let i=0;i<=steps;i++){const p=profileAt(i);add(p.r,-p.outer);}
        for(let i=steps;i>=0;i--){const p=profileAt(i);add(p.r,-p.inner);}
        for(let i=0;i<=steps;i++){const p=profileAt(i);add(p.r,p.inner);}
        for(let i=steps;i>=0;i--){const p=profileAt(i);add(p.r,p.outer);}
      }
      return points;
    };
    const sections=stations.map(crossSection);
    for(let i=0;i<sections.length-1;i++)for(let j=0;j<sections[i].length;j++){
      const k=(j+1)%sections[i].length,a=sections[i][j],b=sections[i+1][j],c=sections[i+1][k],d=sections[i][k];
      triangle(a,c,b);triangle(a,d,c);
    }
    const radius=.70/mm,depth=1.3/mm;
    const end=polygon(T,[[-half,-half],[half,-half],[half,half],[-half,half]]);
    end.holes.push(circle(T,0,0,radius));
    const cap=new T.ShapeGeometry(end,16).toNonIndexed(),cp=cap.attributes.position;
    for(const side of [-1,1]){
      for(let i=0;i<cp.count;i+=3){
        const pts=[0,1,2].map(j=>new T.Vector3(side*length/2,cp.getX(i+j),cp.getY(i+j)));
        triangle(pts[0],pts[side>0?1:2],pts[side>0?2:1]);
      }
      for(let i=0;i<32;i++){
        const a=i/32*Math.PI*2,b=(i+1)/32*Math.PI*2;
        const at=(angle,inset)=>new T.Vector3(side*(length/2-inset),radius*Math.cos(angle),radius*Math.sin(angle));
        const p=at(a,0),q=at(b,0),r=at(a,depth),s=at(b,depth),floor=new T.Vector3(side*(length/2-depth),0,0);
        if(side>0){triangle(p,q,r);triangle(q,s,r);triangle(floor,r,s);}
        else{triangle(p,r,q);triangle(q,r,s);triangle(floor,s,r);}
      }
    }
    cap.dispose();
    const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.computeVertexNormals();
    squareJointGeometryCache.set(cacheKey,geometry.clone());
    group.add(new T.Mesh(geometry,material));return group;
  }
  function obtuseJointInset(profile=JOINT_PROFILES[5]) {
    // The short (inner) edge is user-measured at 4 mm. The plate end is
    // perpendicular to its centre plane: innerWidth = 2*inset*sin(60)-t*cos(60).
    return (profile.hubNarrowMm+profile.bodyMm*.5)/(2*Math.sin(Math.PI/3))/PLATE_PROFILE.edgeMm;
  }
  const obtuseJointGeometryCache=new Map();
  function obtuseJoint(T,axis,dirs,center,profile,material){
    // Connected photos: both outer faces continue into the plate faces without
    // a shoulder. Derive the hub from the mating planes, and use the plate's
    // own socket curve for the fork silhouette; independent tapers do not fit.
    const mm=PLATE_PROFILE.edgeMm,half=profile.bodyMm/2/mm,length=profile.lengthMm/mm,inset=obtuseJointInset(profile);
    const b=dirs[0].dir.clone().add(dirs[1].dir).normalize(),side=new T.Vector3().crossVectors(b,axis).normalize();
    const group=new T.Group();group.position.copy(center);group.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(axis,side,b));
    const directions=dirs.map(d=>new T.Vector2(d.dir.dot(side),d.dir.dot(b))).sort((a,b)=>b.x-a.x);
    const key=JSON.stringify([profile,directions.map(d=>d.toArray())]);
    if(obtuseJointGeometryCache.has(key)){
      group.add(new T.Mesh(obtuseJointGeometryCache.get(key).clone(),material));return group;
    }
    // Same notch as socketShape(), in edge-length coordinates. Only the thin
    // socket bed enters the fork pocket; the two plate skins meet its exterior.
    const socket=new T.CurvePath();
    socket.add(new T.CubicBezierCurve(new T.Vector2(-.27,0),new T.Vector2(-.16,0),new T.Vector2(-.19,.225),new T.Vector2(0,.225)));
    socket.add(new T.CubicBezierCurve(new T.Vector2(0,.225),new T.Vector2(.19,.225),new T.Vector2(.16,0),new T.Vector2(.27,0)));
    const outline=socket.getPoints(16),stations=[-length/2,...outline.map(p=>p.x),length/2];
    const extent=x=>{
      for(let i=0;i<outline.length-1;i++){
        const a=outline[i],b=outline[i+1];if(x<a.x||x>b.x)continue;
        return a.y+(x-a.x)/(b.x-a.x)*(b.y-a.y);
      }
      return 0;
    };
    const section=x=>{
      const points=[],reach=extent(x),steps=8;
      for(const dir of directions){
        const normal=new T.Vector2(-dir.y,dir.x);
        const at=(i,face)=>{
          const r=reach*i/steps,u=r/.225;
          const inner=(.65+.20*Math.exp(-(((u-.48)/.24)**2)))/mm;
          const z=(face<2?-1:1)*(face===0||face===3?half:inner);
          const p=dir.clone().multiplyScalar(inset+r).addScaledVector(normal,z);
          return new T.Vector3(x,p.x,p.y);
        };
        for(let i=0;i<=steps;i++)points.push(at(i,0));
        for(let i=steps;i>=0;i--)points.push(at(i,1));
        for(let i=0;i<=steps;i++)points.push(at(i,2));
        for(let i=steps;i>=0;i--)points.push(at(i,3));
      }
      return points;
    };
    const positions=[],triangle=(a,b,c)=>{
      if(new T.Vector3().subVectors(b,a).cross(new T.Vector3().subVectors(c,a)).lengthSq()>1e-20)
        positions.push(...a.toArray(),...b.toArray(),...c.toArray());
    };
    const sections=stations.map(section);
    for(let i=0;i<sections.length-1;i++)for(let j=0;j<sections[i].length;j++){
      const k=(j+1)%sections[i].length,a=sections[i][j],b=sections[i+1][j],c=sections[i+1][k],d=sections[i][k];
      triangle(a,c,b);triangle(a,d,c);
    }
    const radius=.70/mm,depth=1.3/mm,recessY=inset*directions[0].y;
    const end=polygon(T,section(length/2).filter((p,i,ps)=>i===0||p.distanceToSquared(ps[i-1])>1e-16).map(p=>[p.y,p.z]));
    end.holes.push(circle(T,0,recessY,radius));
    const cap=new T.ShapeGeometry(end,16).toNonIndexed(),cp=cap.attributes.position;
    for(const sign of [-1,1]){
      for(let i=0;i<cp.count;i+=3){
        const pts=[0,1,2].map(j=>new T.Vector3(sign*length/2,cp.getX(i+j),cp.getY(i+j)));
        triangle(pts[0],pts[sign>0?1:2],pts[sign>0?2:1]);
      }
      for(let i=0;i<32;i++){
        const a=i/32*Math.PI*2,b=(i+1)/32*Math.PI*2;
        const at=(angle,inset)=>new T.Vector3(sign*(length/2-inset),radius*Math.cos(angle),recessY+radius*Math.sin(angle));
        const p=at(a,0),q=at(b,0),r=at(a,depth),s=at(b,depth),floor=new T.Vector3(sign*(length/2-depth),0,recessY);
        if(sign>0){triangle(p,q,r);triangle(q,s,r);triangle(floor,r,s);}
        else{triangle(p,r,q);triangle(q,r,s);triangle(floor,s,r);}
      }
    }
    cap.dispose();
    const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.computeVertexNormals();
    obtuseJointGeometryCache.set(key,geometry.clone());group.add(new T.Mesh(geometry,material));return group;
  }
  function joint(T, piece, connection, pieces, material, fullConnection) {
    const group=new T.Group(), ports=(fullConnection?.ports?.length?fullConnection:connection)?.ports||[];
    const records=ports.map(port=>{
      const base=pieces.get(port.piece);if(!base?.pose?.vertices)return null;
      const vs=base.pose.vertices.map(p=>vec(T,p)),a=vs[port.socket],b=vs[(port.socket+1)%vs.length];
      const mid=a.clone().add(b).multiplyScalar(.5), ctr=vs.reduce((x,p)=>x.add(p),new T.Vector3()).multiplyScalar(1/vs.length);
      return {port:port.port,mid,dir:ctr.sub(mid).normalize(),axis:b.clone().sub(a).normalize(),normal:vec(T,base.pose.normal).normalize()};
    }).filter(Boolean);
    const axis=piece.pose?.axis?vec(T,piece.pose.axis).normalize():(records[0]?.axis||new T.Vector3(1,0,0));
    const center=piece.pose?.center?vec(T,piece.pose.center):(records[0]?.mid.clone()||new T.Vector3());
    const defaultInset=piece.partNo===4?.195:piece.partNo===5?obtuseJointInset():.10;
    const dirs=records.map(r=>{
      const stored=piece.pose?.directions?.[r.port],direction=stored?vec(T,stored):r.dir.clone();
      direction.addScaledVector(axis,-direction.dot(axis)).normalize();
      return {id:r.port,dir:direction,inset:Math.max(.075,Math.min(.23,r.mid.clone().sub(center).dot(r.dir)||defaultInset))};
    });
    if(!dirs.length) {const seed=Math.abs(axis.y)<.9?new T.Vector3(0,1,0):new T.Vector3(1,0,0);dirs.push({id:0,dir:seed.addScaledVector(axis,-seed.dot(axis)).normalize(),inset:defaultInset});}
    // An assembly stage may expose only one or two connected ports. Missing
    // ports still belong to the physical moulding, especially No.7's third fin.
    if(piece.partNo===7) {
      const existing=id=>dirs.find(d=>d.id===id);
      if(!existing(0)&&existing(1))dirs.push({id:0,dir:existing(1).dir.clone().negate(),inset:defaultInset});
      if(!existing(1)&&existing(0))dirs.push({id:1,dir:existing(0).dir.clone().negate(),inset:defaultInset});
      if(!existing(0)) {const d=new T.Vector3().crossVectors(axis,dirs[0].dir).normalize();dirs.push({id:0,dir:d,inset:defaultInset},{id:1,dir:d.clone().negate(),inset:defaultInset});}
      if(!existing(2))dirs.push({id:2,dir:new T.Vector3().crossVectors(axis,existing(0).dir).normalize(),inset:defaultInset});
    } else if(dirs.length===1) {
      const angle=(piece.partNo===6?90:piece.partNo===5?120:180)*Math.PI/180;
      dirs.push({id:1,dir:dirs[0].dir.clone().applyAxisAngle(axis,angle),inset:defaultInset});
    }
    const profile=JOINT_PROFILES[piece.partNo];
    if(profile&&piece.partNo===5)group.add(obtuseJoint(T,axis,dirs,center,profile,material));
    if(profile&&piece.partNo>=6)group.add(squareJoint(T,axis,dirs,center,profile,material));
    if(profile&&piece.partNo<5) {
      // Flat joints are one moulding. Build each outer skin across both ports,
      // so the renderer cannot outline an artificial join down the middle.
      const d=dirs[0],normal=new T.Vector3().crossVectors(axis,d.dir).normalize();
      const flat=new T.Group();flat.position.copy(center);flat.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(axis,d.dir,normal));
      const upper=wing(T,d.inset,profile).getPoints(16).slice(1);
      const outline=upper.map(p=>[p.x,p.y]).concat(upper.slice(1,-1).reverse().map(p=>[p.x,-p.y]));
      const shape=polygon(T,outline),mm=PLATE_PROFILE.edgeMm;
      flat.add(forkSkin(T,shape,1,profile,material),forkSkin(T,shape,-1,profile,material));
      const h=profile.lengthMm/mm/2-.003,reach=profile.waistMm/2/mm,slot=1.3/mm;
      flat.add(mesh(T,polygon(T,[[-h,-reach],[h,-reach],[h,reach],[-h,reach]]),slot,-slot/2,material));
      group.add(flat);
    } else if(!profile) for(const d of dirs) {
      const normal=new T.Vector3().crossVectors(axis,d.dir).normalize();
      const arm=new T.Group();arm.position.copy(center);arm.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(axis,d.dir,normal));
      const shape=wing(T,d.inset,profile);
      if(profile)arm.add(forkSkin(T,shape,1,profile,material),forkSkin(T,shape,-1,profile,material));
      else arm.add(mesh(T,shape,SKIN,SLOT/2,material),mesh(T,shape,SKIN,-SLOT/2-SKIN,material));
      // The web stops before the lobe, leaving a real open slot between skins.
      if(!profile||piece.partNo<5){
        const h=profile?.lengthMm?profile.lengthMm/PLATE_PROFILE.edgeMm/2-.003:.417;
        const reach=profile?profile.waistMm/2/PLATE_PROFILE.edgeMm:Math.max(.018,d.inset-.022),slot=profile?1.3/PLATE_PROFILE.edgeMm:SLOT;
        const webShape=polygon(T,[[-h,0],[h,0],[h,reach],[-h,reach]]);arm.add(mesh(T,webShape,slot,-slot/2,material));
      }
      arm.userData.port=d.id;arm.userData.socketInset=d.inset;group.add(arm);
    }
    group.userData.shapeKind=piece.partNo===7?'three-way-t':piece.partNo===6?'right-angle':piece.partNo===5?'obtuse-angle':piece.partNo===4?'flat-wide':'flat-narrow';
    group.userData.physicalPorts=dirs.length;
    group.userData.displayThickness=profile?profile.bodyMm/PLATE_PROFILE.edgeMm:THICKNESS;
    if(profile)group.userData.photoProfile=profile;
    return group;
  }
  window.LaQRealisticParts={plate,joint,plateProfile:PLATE_PROFILE,jointProfiles:JOINT_PROFILES,obtuseJointInset};
})();
