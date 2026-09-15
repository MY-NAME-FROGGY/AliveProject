(function(w){
 const original=w.renderHome;
 if(typeof original!=='function')return;
 w.renderHome=function(...args){const value=original.apply(this,args);const heading=document.querySelector('#app > h1');if(heading&&!document.getElementById('mafiaLink')){const link=document.createElement('a');link.id='mafiaLink';link.className='btn btn-ghost';link.href='mafia/index.html';link.textContent='Мафия · голос и видео';link.style.cssText='display:block;text-align:center;margin:0 0 18px';heading.after(link);}return value;};
})(window);
