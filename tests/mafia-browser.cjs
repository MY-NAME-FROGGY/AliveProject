const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
(async()=>{
 const rules=await import('../supabase/functions/mafia/engine.mjs');
 const root=path.resolve(__dirname,'..');const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}try{res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'chrome',headless:true});
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[],calls=[];page.on('pageerror',e=>errors.push(e.message));
 let state=null;
 await page.route('https://cdn.jsdelivr.net/npm/@supabase/**',route=>route.fulfill({contentType:'text/javascript',body:`window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:{access_token:'test-session',user:{id:'p0'}}}})}})};`}));
 await page.route('https://cdn.jsdelivr.net/npm/livekit-client@**',route=>route.fulfill({contentType:'text/javascript',body:'window.LivekitClient={};'}));
 await page.route('**/functions/v1/mafia',async route=>{const body=JSON.parse(route.request().postData());calls.push(body);let result;
  if(body.op==='catalog')result={roles:rules.ROLES,actions:rules.ACTION_LABELS,mediaConfigured:false};
  else if(body.op==='create'){state=rules.createGame('ABC234','p0',body.name,'media');for(let i=1;i<8;i++)state=rules.joinGame(state,'p'+i,['','Олександр','Марія','Ірина','Тарас','Олена','Микола','Софія'][i]);result={game:rules.publicView(state,'p0'),mediaConfigured:false};}
  else if(body.op==='settings'){state=rules.changeLobby(state,'p0','settings',body.settings);result={game:rules.publicView(state,'p0')};}
  else if(body.op==='media'){await route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({error:'Видеосвязь ещё не подключена. Администратору нужно настроить LiveKit Cloud.'})});return;}
  else result={game:rules.publicView(state,'p0'),mediaConfigured:false};
  await route.fulfill({contentType:'application/json',body:JSON.stringify(result)});
 });
 try{
  await page.goto(`http://127.0.0.1:${server.address().port}/mafia/index.html`);await page.waitForSelector('#playerName');
  assert.match(await page.locator('#entry').innerText(),/LiveKit Cloud/);
  await page.screenshot({path:path.join(root,'preview-mafia-home.png'),fullPage:true});
  await page.locator('#playerName').fill('Софія');await page.getByRole('button',{name:'Создать комнату',exact:true}).click();await page.waitForSelector('#videoGrid .player-tile');
  assert.equal(await page.locator('.player-tile').count(),8);assert.equal(await page.locator('[data-role]').count(),22);
  await page.locator('[data-role=doctor]').fill('0');await page.getByRole('button',{name:'Сохранить настройки'}).click();await page.waitForFunction(()=>document.querySelector('[data-role=doctor]').value==='0');assert.ok(calls.some(c=>c.op==='settings'&&c.settings.counts.doctor===0));
  await page.getByRole('button',{name:'Подключить камеру',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#notice').textContent.includes('Видеосвязь ещё не подключена'));
  await page.screenshot({path:path.join(root,'preview-mafia-lobby.png'),fullPage:true});
  state.players.forEach(p=>p.ready=true);state=rules.startGame(state,'p0',Object.fromEntries(state.players.map(p=>[p.id,true])),Date.now(),()=>.3);state.players[0].role='doctor';state.players[1].role='mafia';state.players[2].role='sheriff';
  await page.waitForFunction(()=>document.querySelector('#phaseLabel').textContent.includes('Ночь'),{timeout:10000});
  assert.equal(await page.locator('#nightKind option').count(),1);assert.equal(await page.locator('#nightKind').inputValue(),'heal');assert.equal(await page.locator('#privateInfo').innerText(),'Результаты ваших проверок появятся здесь.');
  assert.ok(!(await page.locator('#videoGrid').innerText()).includes('Шериф'));
  await page.screenshot({path:path.join(root,'preview-mafia-night.png'),fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(root,'preview-mafia-mobile.png'),fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'mobile fits');
  state.phase='voting';state.deadline=Date.now()+60000;state.players[0].silencedRound=state.round;
  await page.waitForFunction(()=>document.querySelector('#actions').textContent.includes('лишены права голоса'));
  assert.equal(await page.locator('#voteTarget').count(),0);assert.deepEqual(errors,[]);
  console.log('Mafia browser checks passed: entry, 22 role settings, media setup guard, private night, no foreign roles, silenced vote, desktop/mobile');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
