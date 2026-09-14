/* Mini Hamacron display meshes, approximated from the official photographs at
 * https://www.laq.co.jp/about_laq/ (popup35, popup30, popup37, popup49 @3x).
 * These are image estimates, not measured CAD. One assembly unit is 17 mm.
 * The fork cross-section follows the existing No.3 display mesh; the user
 * confirmed three plate ports in a T, with the third opposite the axle. */
(function () {
  'use strict';
  const profile=Object.freeze({
    edgeMm:17, plateInset:.1, wheelCenterOffset:.32, axleRadius:.09,
    wheelBoreRadius:.10, wheelRadius:.5, wheelWidth:.28,
    wheelSpokeHalfDepth:.09, wheelWebHalfDepth:.012,
    shaftLength:1, shaftWidth:11.7/17, shaftThickness:3.5/17,
    shaftEndRecessRadius:.047, shaftEndRecessDepth:.065,
    axleStart:.10, axleEnd:.52, pinSplitStart:.30, pinSplitWidth:.024,
    evidence:'official-photographs-image-approximation', measured:false
  });
  const vector=(T,value,label)=>{
    if(!Array.isArray(value)||value.length!==3||!value.every(Number.isFinite))throw new Error(`Invalid special-part ${label}`);
    return new T.Vector3(...value);
  };
  const direction=(T,value,label)=>{
    const v=vector(T,value,label);
    if(v.lengthSq()<1e-12)throw new Error(`Invalid special-part ${label}`);
    return v.normalize();
  };
  function materialLike(T,source,color,roughness){
    const material=source?source.clone():new T.MeshStandardMaterial();
    material.color.setHex(color);material.roughness=roughness;material.metalness=0;
    return material;
  }
  function polygon(T,points){
    const shape=new T.Shape();points.forEach((p,i)=>i?shape.lineTo(...p):shape.moveTo(...p));shape.closePath();return shape;
  }
  function extrude(T,shape,depth,z,material){
    const geometry=new T.ExtrudeGeometry(shape,{depth,steps:1,curveSegments:32,bevelEnabled:false});
    geometry.translate(0,0,z);return new T.Mesh(geometry,material);
  }
  function ring(T,inner,outer,depth,z,material){
    const points=[[inner,z],[outer,z],[outer,z+depth],[inner,z+depth],[inner,z]].map(p=>new T.Vector2(...p));
    const geometry=new T.LatheGeometry(points,96);
    // Close the angular seam exactly, including axial rays along that seam.
    const positions=geometry.attributes.position;
    for(let i=0;i<points.length;i++)positions.setXYZ(96*points.length+i,positions.getX(i),positions.getY(i),positions.getZ(i));
    geometry.rotateX(Math.PI/2);
    return new T.Mesh(geometry,material);
  }
  function cylinder(T,radius,depth,z,material){
    const mesh=new T.Mesh(new T.CylinderGeometry(radius,radius,depth,48),material);
    mesh.rotation.x=Math.PI/2;mesh.position.z=z+depth/2;return mesh;
  }
  function splitPin(T,radius,depth,z,material){
    const group=new T.Group(),angle=Math.acos(profile.pinSplitWidth/2/radius);
    for(const side of [-1,1]){
      const points=[];
      for(let i=0;i<=32;i++){
        const a=-angle+2*angle*i/32;points.push([side*radius*Math.cos(a),radius*Math.sin(a)]);
      }
      const half=extrude(T,polygon(T,points),depth,z,material);half.name='split-pin-half';group.add(half);
    }
    return group;
  }
  function forkOutline(T){
    const half=.498,waist=3.5/34,tip=11.7/34,r=3/17,s=new T.Shape();
    // Only the projecting lobe is a fork. The hub is one solid body, so no
    // hidden skin faces can obstruct its end recesses.
    s.moveTo(-half+.012,waist);s.lineTo(half-.012,waist);s.lineTo(r+.075,waist);
    s.bezierCurveTo(r+.020,waist,r,waist+.015,r,tip-r);s.absarc(0,tip-r,r,0,Math.PI,false);
    s.bezierCurveTo(-r,waist+.015,-r-.020,waist,-r-.075,waist);
    s.lineTo(-half+.012,waist);s.closePath();
    return s;
  }
  function shaftBody(T,material){
    const h=.498,half=profile.shaftThickness/2,corner=.012,shape=new T.Shape();
    shape.moveTo(-h+corner,-half);shape.lineTo(h-corner,-half);shape.quadraticCurveTo(h,-half,h,-half+corner);
    shape.lineTo(h,half-corner);shape.quadraticCurveTo(h,half,h-corner,half);
    shape.lineTo(-h+corner,half);shape.quadraticCurveTo(-h,half,-h,half-corner);
    shape.lineTo(-h,-half+corner);shape.quadraticCurveTo(-h,-half,-h+corner,-half);shape.closePath();
    const mesh=extrude(T,shape,half*2,-half,material),old=mesh.geometry,p=old.attributes.position,positions=[];
    // Replace the actual end faces instead of placing a dark disc on them.
    for(let i=0;i<p.count;i+=3){
      if([1,-1].some(side=>[0,1,2].every(j=>Math.abs(p.getX(i+j)-side*h)<1e-7)))continue;
      for(let j=0;j<3;j++)positions.push(p.getX(i+j),p.getY(i+j),p.getZ(i+j));
    }
    const triangle=(a,b,c)=>positions.push(...a,...b,...c),radius=profile.shaftEndRecessRadius,depth=profile.shaftEndRecessDepth;
    for(const side of [-1,1])for(let i=0;i<64;i++){
      const a=i*Math.PI/32,b=(i+1)*Math.PI/32;
      const point=(angle,r,x)=>[side*x,r*Math.cos(angle),r*Math.sin(angle)];
      const outside=angle=>Math.min((half-corner)/Math.max(1e-12,Math.abs(Math.cos(angle))),half/Math.max(1e-12,Math.abs(Math.sin(angle))));
      const innerA=point(a,radius,h),innerB=point(b,radius,h),outerA=point(a,outside(a),h),outerB=point(b,outside(b),h);
      const backA=point(a,radius,h-depth),backB=point(b,radius,h-depth),floor=[side*(h-depth),0,0];
      const add=(u,v,w)=>side>0?triangle(u,v,w):triangle(u,w,v);
      add(innerA,outerA,outerB);add(innerA,outerB,innerB);
      add(innerA,innerB,backB);add(innerA,backB,backA);add(floor,backA,backB);
    }
    const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.computeVertexNormals();
    old.dispose();mesh.geometry=geometry;mesh.name='shaft-body-with-blind-end-recesses';return mesh;
  }
  function shaft(T,piece,source){
    const p=piece.pose||{},x=direction(T,p.axis,'axis'),z=direction(T,p.axleDirection,'axleDirection');
    const d0=direction(T,p.directions?.[0],'directions.0'),d1=direction(T,p.directions?.[1],'directions.1');
    // Older saved poses contain only the two opposing plate directions.
    const d2=p.directions?.[2]===undefined?z.clone().negate():direction(T,p.directions[2],'directions.2');
    if(Math.abs(x.dot(z))>1e-5||Math.abs(d0.dot(x))>1e-5||Math.abs(d0.dot(z))>1e-5||d0.dot(d1)>-1+1e-5)
      throw new Error('Mini shaft requires perpendicular axis/axle and opposing plate directions');
    if(d2.dot(z)>-1+1e-5)throw new Error('Mini shaft third plate direction must oppose axleDirection');
    const y=new T.Vector3().crossVectors(z,x).normalize(),group=new T.Group();
    group.position.copy(vector(T,p.center,'center'));group.quaternion.setFromRotationMatrix(new T.Matrix4().makeBasis(x,y,z));
    const material=materialLike(T,source,0x242426,.36),half=profile.shaftThickness/2;
    // Paired skins leave a real insertion pocket at each of the three ports.
    for(const portSide of [-1,1])for(const faceSide of [-1,1]){
      const skin=extrude(T,forkOutline(T),1,0,material),pos=skin.geometry.attributes.position;
      for(let i=0;i<pos.count;i++){
        const t=Math.max(0,Math.min(1,(pos.getY(i)*17-1.75)/(5.85-1.75)));
        const inner=(.65+.20*Math.exp(-(((t-.48)/.24)**2)))/17,outer=half-.25*t/17;
        pos.setY(i,portSide*pos.getY(i));pos.setZ(i,faceSide*(inner+(outer-inner)*pos.getZ(i)));
      }
      // Reflections change winding. Correct it so the visible skin stays outward.
      if(portSide*faceSide<0){for(const key of ['position','uv']){
        const a=skin.geometry.attributes[key];if(!a)continue;
        for(let i=0;i<a.count;i+=3)for(let k=0;k<a.itemSize;k++){
          const j=(i+1)*a.itemSize+k,l=(i+2)*a.itemSize+k,temp=a.array[j];a.array[j]=a.array[l];a.array[l]=temp;
        }
      }}
      skin.geometry.computeVertexNormals();skin.name='plate-fork';group.add(skin);
      if(portSide===1){
        const back=new T.Mesh(skin.geometry.clone(),material);
        // +Y fork rotated around the shared X edge: +Y becomes -Z, and
        // its two skin faces become +/-Y. This is the third plate port.
        back.geometry.rotateX(-Math.PI/2);back.name='third-plate-fork';group.add(back);
      }
    }
    group.add(shaftBody(T,material));
    // The collar stands above the plate face; the retaining lips sit beyond
    // the wheel's far face at .32 + .28/2 = .46.
    const collar=cylinder(T,.143,.085,.10,material);collar.name='axle-collar';group.add(collar);
    group.add(cylinder(T,profile.axleRadius,.115,.185,material));
    group.add(splitPin(T,profile.axleRadius,.18,.30,material));
    group.add(splitPin(T,.111,.025,.48,material));
    group.add(splitPin(T,.103,.015,.505,material));
    group.userData.shapeKind='mini-shaft-three-way-forks-split-axle';
    group.userData.axleDirection=z.toArray();group.userData.physicalPorts=3;
    group.userData.plateDirections=[d0.toArray(),d1.toArray(),d2.toArray()];
    group.userData.wheelCenter=group.position.clone().addScaledVector(z,profile.wheelCenterOffset).toArray();
    group.userData.profile=profile;return group;
  }
  function tire(T,material){
    // Closed cross-section around the rim. Depressed channels are geometry,
    // including the curved shoulder, so tread catches light from every angle.
    const section=[[.332,-.11],[.343,-.134],[.397,-.14],[.445,-.129],[.479,-.105],
      [.494,-.07],[.5,-.025],[.5,.025],[.494,.07],[.479,.105],[.445,.129],[.397,.14],[.343,.134],[.332,.11]],positions=[];
    const count=192,at=(i,j)=>{
      const angle=i/count*Math.PI*2,[radius,z]=section[j%section.length];
      const channel=Math.max(0,(Math.cos(angle*18+z*7)-.90)/.10);
      const depth=radius>.39?.009*channel:0,r=radius-depth;
      return [r*Math.cos(angle),r*Math.sin(angle),z];
    };
    for(let i=0;i<count;i++)for(let j=0;j<section.length;j++){
      const a=at(i,j),b=at(i+1,j),c=at(i+1,j+1),d=at(i,j+1);
      positions.push(...a,...b,...c,...a,...c,...d);
    }
    const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(positions,3));geometry.computeVertexNormals();
    const mesh=new T.Mesh(geometry,material);mesh.name='grooved-tire';return mesh;
  }
  function wheel(T,piece,source){
    const p=piece.pose||{},axis=direction(T,p.axis,'axis'),group=new T.Group();
    group.position.copy(vector(T,p.center,'center'));group.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),axis);
    const black=materialLike(T,source,0x202022,.77),white=materialLike(T,source,0xe7e5df,.36);
    group.add(tire(T,black));
    const rim=ring(T,.307,.35,.22,-.11,white);rim.name='white-rim';group.add(rim);
    const hub=ring(T,profile.wheelBoreRadius,.147,.26,-.13,white);hub.name='open-axle-hub';group.add(hub);
    // User-confirmed: the sectors between spokes are solid, recessed white
    // faces. Only the central axle bore passes through the wheel.
    const web=ring(T,.14,.32,profile.wheelWebHalfDepth*2,-profile.wheelWebHalfDepth,white);web.name='solid-wheel-web';group.add(web);
    // User photo (2026-09-14): broad ribs rise nearly to the rim, above
    // the closed recessed sectors. Heights remain image estimates.
    for(let i=0;i<3;i++){
      const spoke=extrude(T,polygon(T,[[.134,-.04],[.32,-.085],[.32,.085],[.134,.04]]),profile.wheelSpokeHalfDepth*2,-profile.wheelSpokeHalfDepth,white);
      spoke.rotation.z=i*Math.PI*2/3;spoke.name='white-spoke';group.add(spoke);
    }
    group.userData.shapeKind='mini-wheel-solid-web-three-spoke-through-bore';group.userData.profile=profile;return group;
  }
  function create(T,piece,material){
    if(piece.partNo==='mini-shaft')return shaft(T,piece,material);
    if(piece.partNo==='mini-wheel')return wheel(T,piece,material);
    return null;
  }
  window.LaQSpecialParts={create,profile};
})();
