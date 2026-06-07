(function(){
  var el=document.getElementById("bg"),html=document.documentElement,tgl=document.getElementById("tgl");
  var mc=document.getElementById("tgl-mc"),bodyEl=document.getElementById("tgl-body"),rays=document.getElementById("tgl-rays");
  var SEP=150,AX=40,AY=60;

  function dark(){return html.getAttribute("data-theme")==="midnight";}
  function bgHex(){return dark()?0x14120e:0xf6f3ec;}
  function dotRGB(){return dark()?[200,200,200]:[0,0,0];}

  var scene=new THREE.Scene(),fog=new THREE.Fog(bgHex(),2000,10000);
  scene.fog=fog;
  var camera=new THREE.PerspectiveCamera(60,window.innerWidth/window.innerHeight,1,10000);
  camera.position.set(0,355,1220);
  var renderer=new THREE.WebGLRenderer({antialias:true});
  renderer.setPixelRatio(Math.min(window.devicePixelRatio,2));
  renderer.setSize(window.innerWidth,window.innerHeight);
  renderer.setClearColor(fog.color,1);
  el.appendChild(renderer.domElement);

  var pos=[],col=[],dc=dotRGB();
  for(var ix=0;ix<AX;ix++)for(var iy=0;iy<AY;iy++){
    pos.push(ix*SEP-(AX*SEP)/2,0,iy*SEP-(AY*SEP)/2);
    col.push(dc[0],dc[1],dc[2]);
  }
  var geo=new THREE.BufferGeometry();
  geo.setAttribute("position",new THREE.Float32BufferAttribute(pos,3));
  var colorAttr=new THREE.Float32BufferAttribute(col,3);
  geo.setAttribute("color",colorAttr);
  var mat=new THREE.PointsMaterial({size:8,vertexColors:true,transparent:true,opacity:0.8,sizeAttenuation:true});
  var pts=new THREE.Points(geo,mat);
  scene.add(pts);

  // Pre-compute per-dot grid positions and chaos parameters
  var numDots=AX*AY;
  var dotIx=[],dotIy=[],dotDist=[];
  var chaosOff=[],chaosSpd=[],chaosPh=[];
  var cxi=(AX-1)/2,cyi=(AY-1)/2;
  for(var ix=0;ix<AX;ix++)for(var iy=0;iy<AY;iy++){
    var idx=ix*AY+iy;
    dotIx[idx]=ix;dotIy[idx]=iy;
    dotDist[idx]=Math.sqrt((ix-cxi)*(ix-cxi)+(iy-cyi)*(iy-cyi))*SEP;
    chaosOff[idx]=(Math.random()*200+80)*(Math.random()>0.3?1:-1);
    chaosSpd[idx]=Math.random()*4+1.5;
    chaosPh[idx]=Math.random()*Math.PI*2;
  }

  var count=0,frame,targetBg=bgHex(),targetDot=dotRGB();
  var chaosActive=false,chaosStart=0;
  var physX=0,physY=0,physVX=0,physVY=0,physActive=false,physTgtX=0,physTgtY=0;
  var wrap=document.getElementById("main-content");

  function lerpHex(cur,target,speed){
    var cr=(cur>>16)&0xff,cg=(cur>>8)&0xff,cb=cur&0xff;
    var tr=(target>>16)&0xff,tg=(target>>8)&0xff,tb=target&0xff;
    var nr=cr+(tr-cr)*speed,ng=cg+(tg-cg)*speed,nb=cb+(tb-cb)*speed;
    if(Math.abs(nr-tr)<0.5&&Math.abs(ng-tg)<0.5&&Math.abs(nb-tb)<0.5)return target;
    return (Math.round(nr)<<16)|(Math.round(ng)<<8)|Math.round(nb);
  }

  function playToggleSound(){
    try{
      var c=new (window.AudioContext||window.webkitAudioContext)(),o=c.createOscillator(),g=c.createGain();
      o.connect(g);g.connect(c.destination);
      o.frequency.setValueAtTime(dark()?400:600,c.currentTime);
      o.frequency.exponentialRampToValueAtTime(dark()?600:400,c.currentTime+0.1);
      o.type="sine";g.gain.setValueAtTime(0.08,c.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001,c.currentTime+0.12);
      o.start(c.currentTime);o.stop(c.currentTime+0.12);
    }catch(e){}
  }

  function animate(){
    frame=requestAnimationFrame(animate);

    var curHex=fog.color.getHex();
    if(curHex!==targetBg){
      var nh=lerpHex(curHex,targetBg,0.06);
      fog.color.setHex(nh);
      renderer.setClearColor(nh,1);
    }
    var tdc=targetDot,ca=colorAttr.array,need=false;
    for(var j=0;j<ca.length;j+=3){
      var dr=tdc[0]-ca[j],dg=tdc[1]-ca[j+1],db=tdc[2]-ca[j+2];
      if(Math.abs(dr)>0.5||Math.abs(dg)>0.5||Math.abs(db)>0.5){
        ca[j]+=dr*0.06;ca[j+1]+=dg*0.06;ca[j+2]+=db*0.06;
        need=true;
      }else if(ca[j]!==tdc[0]||ca[j+1]!==tdc[1]||ca[j+2]!==tdc[2]){
        ca[j]=tdc[0];ca[j+1]=tdc[1];ca[j+2]=tdc[2];
        need=true;
      }
    }
    if(need)colorAttr.needsUpdate=true;

    var p=geo.attributes.position.array;
    if(chaosActive){
      var elapsed=(Date.now()-chaosStart)/1000;
      for(var i=0;i<numDots;i++){
        var delay=dotDist[i]/3500;
        var tsa=elapsed-delay;
        if(tsa>0){
          var decay=Math.max(0,1-tsa/2.5);
          var ramp=Math.min(1,tsa/0.8);
          var baseY=Math.sin((dotIx[i]+count)*0.3)*50+Math.sin((dotIy[i]+count)*0.5)*50;
          var chaosOsc=chaosOff[i]*Math.sin(tsa*chaosSpd[i]+chaosPh[i]);
          p[i*3+1]=baseY*ramp+chaosOsc*decay;
        }else{
          p[i*3+1]=0;
        }
      }
    }else{
      var ii=0;
      for(var ix=0;ix<AX;ix++)for(var iy=0;iy<AY;iy++){
        p[ii*3+1]=Math.sin((ix+count)*0.3)*50+Math.sin((iy+count)*0.5)*50;
        ii++;
      }
    }
    geo.attributes.position.needsUpdate=true;

    if(physActive){
      physVY+=0.15;
      physVX+=0.02;
      physVX*=0.97;
      physVY*=0.97;
      physX+=physVX;
      physY+=physVY;

      if(physX>physTgtX){physX=physTgtX;physVX*=-0.25;physVY*=0.95;}
      if(physY>physTgtY){physY=physTgtY;physVY*=-0.25;physVX*=0.95;}
      if(physX<38){physX=38;physVX*=-0.2;}
      if(physY<38){physY=38;physVY*=-0.2;}

      var spd=Math.sqrt(physVX*physVX+physVY*physVY);
      if(spd<2&&Math.abs(physX-physTgtX)<20&&Math.abs(physY-physTgtY)<20){
        physActive=false;
        tgl.style.transition="transform 200ms ease-out";
        tgl.style.transform="";
      }else{
        tgl.style.transition="none";
        tgl.style.transform="translate("+(physX-(window.innerWidth-38))+"px,"+(physY-(window.innerHeight-38))+"px)";
      }
    }

    renderer.render(scene,camera);
    count+=0.1;
  }

  function onResize(){
    camera.aspect=window.innerWidth/window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth,window.innerHeight);
    if(physActive){
      physTgtX=window.innerWidth-38;
      physTgtY=window.innerHeight-38;
    }
  }
  window.addEventListener("resize",onResize);

  function updateTheme(){
    var d=dark();
    targetBg=bgHex();
    targetDot=dotRGB();
    mc.style.setProperty("cx",d?"17":"33");
    mc.style.setProperty("cy",d?"8":"0");
    bodyEl.style.setProperty("r",d?"9":"5");
    rays.style.opacity=d?"0":"1";
    rays.style.transform=d?"scale(0) rotate(-30deg)":"scale(1) rotate(0deg)";
  }

  tgl.onclick=function(){var n=dark()?"paper":"midnight";html.setAttribute("data-theme",n);localStorage.setItem("mf_theme",n);playToggleSound();};
  var obs=new MutationObserver(updateTheme);
  obs.observe(html,{attributes:true,attributeFilter:["data-theme"]});
  updateTheme();
  animate();

  // === Entrance: raindrop drop → center → quick bounces right → settle → reveal ===
  if(!window.matchMedia("(prefers-reduced-motion:reduce)").matches){
    var cx=38-window.innerWidth/2,cy=38-window.innerHeight/2;

    // Phase 1: toggle above viewport (invisible, no dots visible)
    tgl.style.transition="none";
    tgl.style.transform="translate("+cx+"px,"+(cy-window.innerHeight-60)+"px)";
    void tgl.offsetHeight;

    // Phase 2: toggle drops to center, canvas stays hidden
    tgl.style.transition="transform 500ms cubic-bezier(.42,0,1,1)";
    tgl.style.transform="translate("+cx+"px,"+cy+"px)";

    // Phase 3: impact! Canvas reveals, chaos explodes, toggle bounces from center toward right
    setTimeout(function(){
      el.style.transition="opacity 200ms cubic-bezier(.16,1,.3,1)";
      el.style.opacity="1";

      chaosActive=true;
      chaosStart=Date.now();

      html.setAttribute("data-theme",dark()?"paper":"midnight");
      playToggleSound();

      physX=window.innerWidth/2;
      physY=window.innerHeight/2;
      physVX=30+Math.random()*8;
      physVY=3+Math.random()*2;
      physTgtX=window.innerWidth-38;
      physTgtY=window.innerHeight-38;
      tgl.style.transition="none";
      physActive=true;

      // Phase 4: reveal login card as toggle bounces on the right half
      setTimeout(function(){
        if(wrap){
          wrap.style.transition="opacity 700ms cubic-bezier(.25,1,.5,1)";
          wrap.style.opacity="1";
          setTimeout(function(){wrap.style.transition="";},800);
        }
      },500);

      setTimeout(function(){
        if(physActive){
          physActive=false;
          tgl.style.transition="transform 500ms cubic-bezier(.34,1.56,.64,1)";
          tgl.style.transform="";
        }
      },900);

      setTimeout(function(){
        tgl.style.transition="";
        el.style.transition="";
      },2500);
    },470);
  }else{
    el.style.opacity="1";
    if(wrap){wrap.style.opacity="1";}
  }
})();
