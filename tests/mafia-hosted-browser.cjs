const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const rules=await import('../supabase/functions/mafia/engine.mjs'),root=path.resolve(__dirname,'..');
 const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}try{res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.mp3')?'audio/mpeg':'text/html');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];let state;
 page.on('pageerror',e=>errors.push(e.message));await page.addInitScript(()=>localStorage.setItem('mafiaSignals','off'));
 await page.route('https://cdn.jsdelivr.net/npm/@supabase/**',route=>route.fulfill({contentType:'text/javascript',body:`window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:{access_token:'test-session',user:{id:'host'}}}})}})};`}));
 await page.route('https://cdn.jsdelivr.net/npm/livekit-client@**',route=>route.fulfill({contentType:'text/javascript',body:'window.LivekitClient={};'}));
 await page.route('**/functions/v1/mafia',async route=>{const body=JSON.parse(route.request().postData()),reply=()=>route.fulfill({json:{game:rules.publicView(state,'host'),mediaConfigured:false}});
  if(body.op==='catalog')return route.fulfill({json:{roles:rules.ROLES,actions:rules.ACTION_LABELS,mediaConfigured:false}});
  if(body.op==='create'){state=rules.createGame('LEAD24','host','Анна · ведущая','media');for(let i=1;i<=5;i++)state=rules.joinGame(state,'p'+i,['','Борис','Вера','Глеб','Диана','Егор'][i]);return reply();}
  if(body.op==='settings'){state=rules.changeLobby(state,'host','settings',body.settings);return reply();}
  if(body.op==='start'){state.players.filter(p=>p.id!=='host').forEach(p=>p.ready=true);state=rules.startGame(state,'host',Object.fromEntries(state.players.map(p=>[p.id,true])),Date.now(),()=>.71);return reply();}
  if(body.op==='control'){state=rules.control(state,'host',body.command,body.epoch,body.seconds,Date.now(),()=>.2);return reply();}
  if(body.op==='moderate'){state=rules.moderate(state,'host',body.command,body.target,body.role,Date.now());return reply();}
  return reply();
 });
 try{
  await page.goto(`http://127.0.0.1:${server.address().port}/mafia/index.html`);await page.locator('#playerName').fill('Анна · ведущая');await page.getByRole('button',{name:'Создать комнату',exact:true}).click();
  await page.locator('#settings>details>summary').click();await page.locator('#setting-gameMode').selectOption('hosted');await page.getByRole('button',{name:'Сохранить настройки'}).click();
  await page.waitForFunction(()=>document.querySelector('#roomLabel').textContent.includes('ВЕДУЩИЙ'));
  assert.equal(await page.locator('#readyButton').count(),0);assert.equal(await page.locator('.player-tile.moderator').count(),1);assert.match(await page.locator('.player-tile.moderator').innerText(),/ВЕДУЩИЙ/);
  await page.getByRole('button',{name:'Начать партию',exact:true}).click();await page.waitForSelector('.host-master .master-player');
  assert.equal(await page.locator('.host-master .master-player').count(),5);assert.match(await page.locator('#myRole').innerText(),/Ведущий/);assert.match(await page.locator('#actions').innerText(),/мастер-панели/);
  assert.ok(await page.locator('.host-master').getAttribute('open')!==null);assert.equal(await page.locator('.host-master select').count(),5);
  const doctor=state.players.find(p=>p.role==='doctor'),target=state.players.find(p=>p.role==='citizen');state=rules.act(state,doctor.id,'heal',[target.id],Date.now());await page.waitForFunction(name=>document.querySelector('.host-master').textContent.includes('Лечить → '+name),target.name);
  await page.screenshot({path:path.join(root,'preview-mafia-hosted.png'),fullPage:true});
  page.once('dialog',d=>d.accept());await page.getByRole('button',{name:'Следующий этап',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#wakeNotice strong').textContent.includes('Тихая пауза'));
   const correctedId=state.players.find(p=>p.role==='mafia').id,card=page.locator(`.master-player select[onchange*="${correctedId}"]`).locator('..');
   page.once('dialog',d=>d.accept());await card.locator('select').selectOption('jester');await page.waitForFunction(id=>document.querySelector(`.master-player select[onchange*="${id}"]`).value==='jester',correctedId);
   page.once('dialog',d=>d.accept());await card.getByRole('button',{name:'Исключить'}).click();await page.waitForFunction(id=>document.querySelector(`.master-player select[onchange*="${id}"]`).closest('article').classList.contains('out'),correctedId);
   page.once('dialog',d=>d.accept());await card.getByRole('button',{name:'Вернуть'}).click();await page.waitForFunction(id=>!document.querySelector(`.master-player select[onchange*="${id}"]`).closest('article').classList.contains('out'),correctedId);
  assert.match(await page.locator('#events').innerText(),/исправил роль/);
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(root,'preview-mafia-hosted-mobile.png'),fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.deepEqual(errors,[]);console.log('Hosted browser passed: lobby mode, moderator badge, no ready button, private decisions, manual phase, role correction, eliminate/revive, desktop/mobile layout.');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
