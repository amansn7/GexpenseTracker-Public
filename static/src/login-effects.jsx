(function(){
  var html=document.documentElement,tgl=document.getElementById("tgl");
  var mc=document.getElementById("tgl-mc"),bodyEl=document.getElementById("tgl-body"),rays=document.getElementById("tgl-rays");

  function dark(){return html.getAttribute("data-theme")==="midnight";}

  function updateTheme(){
    var d=dark();
    mc.style.setProperty("cx",d?"17":"33");
    mc.style.setProperty("cy",d?"8":"0");
    bodyEl.style.setProperty("r",d?"9":"5");
    rays.style.opacity=d?"0":"1";
    rays.style.transform=d?"scale(0) rotate(-30deg)":"scale(1) rotate(0deg)";
  }

  tgl.onclick=function(){
    var n=dark()?"paper":"midnight";
    html.setAttribute("data-theme",n);
    localStorage.setItem("mf_theme",n);
  };
  var obs=new MutationObserver(updateTheme);
  obs.observe(html,{attributes:true,attributeFilter:["data-theme"]});
  updateTheme();
})();
