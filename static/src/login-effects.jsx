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
  renderer.setPixelRatio(window.devicePixelRatio);
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

  var _atCtx=null,_atBuf=null,_atLast=0;
  function tick(){
    var now=performance.now();
    if(now-_atLast<80)return;
    _atLast=now;
    try{
      if(!_atCtx)_atCtx=new(window.AudioContext||window.webkitAudioContext)();
      if(_atCtx.state==="suspended")_atCtx.resume();
      var ac=_atCtx;
      if(!_atBuf||_atBuf.sampleRate!==ac.sampleRate){
        var rate=ac.sampleRate,len=Math.floor(rate*0.006),buf=ac.createBuffer(1,len,rate),ch=buf.getChannelData(0);
        for(var i=0;i<len;i++){var t=i/len;ch[i]=(Math.sin(2*Math.PI*3400*t)*0.6+(Math.random()*2-1)*0.4)*Math.pow(1-t,3);}
        _atBuf=buf;
      }
      var src=ac.createBufferSource(),gain=ac.createGain();
      src.buffer=_atBuf;gain.gain.value=0.08;
      src.connect(gain);gain.connect(ac.destination);
      src.start();
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

  tgl.onclick=function(){var n=dark()?"paper":"midnight";html.setAttribute("data-theme",n);localStorage.setItem("mf_theme",n);tick();};
  var obs=new MutationObserver(updateTheme);
  obs.observe(html,{attributes:true,attributeFilter:["data-theme"]});
  updateTheme();
  animate();
})();
