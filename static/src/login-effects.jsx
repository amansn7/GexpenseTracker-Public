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
  // Save grid positions, center all dots for chaotic entrance spread
  var targetPos=pos.slice(),dotDelays=[];
  for(var _d=0;_d<AX*AY;_d++)dotDelays.push(Math.random());
  for(var _d=0;_d<pos.length;_d+=3){pos[_d]=0;pos[_d+2]=0;}
  var spreadActive=false,spreadStart=0;
  var geo=new THREE.BufferGeometry();
  geo.setAttribute("position",new THREE.Float32BufferAttribute(pos,3));
  var colorAttr=new THREE.Float32BufferAttribute(col,3);
  geo.setAttribute("color",colorAttr);
  var mat=new THREE.PointsMaterial({size:8,vertexColors:true,transparent:true,opacity:0.8,sizeAttenuation:true});
  var pts=new THREE.Points(geo,mat);
  scene.add(pts);

  var count=0,frame,targetBg=bgHex(),targetDot=dotRGB(),waveChaos=0,waveChaosStart=0;

  function lerpHex(cur,target,speed){
    var cr=(cur>>16)&0xff,cg=(cur>>8)&0xff,cb=cur&0xff;
    var tr=(target>>16)&0xff,tg=(target>>8)&0xff,tb=target&0xff;
    var nr=cr+(tr-cr)*speed,ng=cg+(tg-cg)*speed,nb=cb+(tb-cb)*speed;
    if(Math.abs(nr-tr)<0.5&&Math.abs(ng-tg)<0.5&&Math.abs(nb-tb)<0.5)return target;
    return (Math.round(nr)<<16)|(Math.round(ng)<<8)|Math.round(nb);
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

    // Chaotic spread: dots burst from center to grid positions
    if(spreadActive){
      var elapsed=Date.now()-spreadStart;
      if(elapsed<2000){
        var pa=geo.attributes.position.array;
        for(var si=0;si<AX*AY;si++){
          var sIdx=si*3,delay=dotDelays[si]*0.35;
          var t=Math.max(0,Math.min(1,(elapsed/2000-delay)/(1-delay)));
          t=1-Math.pow(1-t,4);
          pa[sIdx]=targetPos[sIdx]*t;pa[sIdx+2]=targetPos[sIdx+2]*t;
        }
      }else{spreadActive=false;}
    }
    // Chaotic wave settle: high noise → decays into clean sine wave over 3.5s
    if(waveChaosStart>0){
      var ce=Date.now()-waveChaosStart;
      waveChaos=Math.max(0,1-ce/3500);
    }
    var p=geo.attributes.position.array,i=0;
    for(var ix=0;ix<AX;ix++)for(var iy=0;iy<AY;iy++){
      var idx=i*3;
      var targetY=Math.sin((ix+count)*0.3)*50+Math.sin((iy+count)*0.5)*50;
      if(waveChaos>0){
        var cf=waveChaos;
        var noisy=Math.sin((ix+count)*(0.3+cf*2)+cf*30+ix*iy*0.1)*(50+cf*80)
                 +Math.sin((iy+count)*(0.5+cf*1.5)+cf*20)*(50+cf*60);
        p[idx+1]=targetY+noisy*cf;
      }else{
        p[idx+1]=targetY;
      }
      i++;
    }
    geo.attributes.position.needsUpdate=true;
    renderer.render(scene,camera);
    count+=0.1;
  }

  function onResize(){
    camera.aspect=window.innerWidth/window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth,window.innerHeight);
  }
  window.addEventListener("resize",onResize);

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

  // === Entrance: continuous motion chain (no gaps between phases) ===
  var wrap=document.getElementById("main-content");
  if(!window.matchMedia("(prefers-reduced-motion:reduce)").matches){
    var cx=38-window.innerWidth/2,cy=38-window.innerHeight/2;
    // Phase 1: toggle above viewport (instant)
    tgl.style.transform="translate("+cx+"px,"+(cy-window.innerHeight-60)+"px)";
    void tgl.offsetHeight;
    // Phase 2: bounce drop to center + dots burst + wave chaos begins simultaneously
    spreadActive=true;spreadStart=Date.now();
    waveChaos=1;waveChaosStart=Date.now();
    tgl.style.transition="transform 1000ms cubic-bezier(.34,1.56,.64,1)";
    tgl.style.transform="translate("+cx+"px,"+cy+"px)";
    el.style.transition="opacity 800ms ease";
    el.style.opacity="1";
    // Phase 3: on bounce impact, toggle day/night + immediately redirect to corner
    setTimeout(function(){
      html.setAttribute("data-theme",dark()?"paper":"midnight");
      playToggleSound();
      // No gap — redirect mid-bounce toward bottom-right (continuous motion)
      tgl.style.transition="transform 1000ms cubic-bezier(.34,1.56,.64,1)";
      tgl.style.transform="";
      // Phase 4: login appears while toggle slides to corner
      setTimeout(function(){
        if(wrap){
          wrap.style.transition="opacity 600ms ease,transform 600ms cubic-bezier(.34,1.56,.64,1)";
          wrap.style.opacity="1";
          wrap.style.transform="translateY(0)";
        }
      },400);
      // Cleanup after toggle settles at corner
      setTimeout(function(){
        tgl.style.transition="";
        el.style.transition="";
        if(wrap){wrap.style.transition="";wrap.style.transform="";}
      },1400);
    },500);
  }else{
    el.style.opacity="1";
    if(wrap)wrap.style.opacity="1";
  }
})();
