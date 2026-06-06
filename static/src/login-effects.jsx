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

  var count=0,frame,targetBg=bgHex(),targetDot=dotRGB();

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

    var p=geo.attributes.position.array,i=0;
    for(var ix=0;ix<AX;ix++)for(var iy=0;iy<AY;iy++){
      var idx=i*3;
      p[idx+1]=Math.sin((ix+count)*0.3)*50+Math.sin((iy+count)*0.5)*50;
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
})();
