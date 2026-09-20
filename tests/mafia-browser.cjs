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
 await page.addInitScript(()=>{if(!navigator.mediaDevices)Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{}});Object.defineProperty(navigator.mediaDevices,'getUserMedia',{configurable:true,value:async()=>new MediaStream()});});
 await page.route('**/functions/v1/mafia',async route=>{const body=JSON.parse(route.request().postData());calls.push(body);let result;
  if(body.op==='catalog')result={roles:rules.ROLES,actions:rules.ACTION_LABELS,mediaConfigured:false};
  else if(body.op==='create'){state=rules.createGame('ABC234','p0',body.name,'media');for(let i=1;i<8;i++)state=rules.joinGame(state,'p'+i,['','Олександр','Марія','Ірина','Тарас','Олена','Микола','Софія'][i]);result={game:rules.publicView(state,'p0'),mediaConfigured:false};}
  else if(body.op==='settings'){state=rules.changeLobby(state,'p0','settings',body.settings);result={game:rules.publicView(state,'p0')};}
  else if(body.op==='act'){state=rules.act(state,'p0',body.kind,body.targets);result={game:rules.publicView(state,'p0')};}
  else if(body.op==='control'){state=rules.control(state,'p0',body.command,body.epoch,body.seconds);result={game:rules.publicView(state,'p0')};}
  else if(body.op==='media'){await route.fulfill({status:400,contentType:'application/json',body:JSON.stringify({error:'Видеосвязь ещё не подключена. Администратору нужно настроить LiveKit Cloud.'})});return;}
  else result={game:rules.publicView(state,'p0'),mediaConfigured:false};
  await route.fulfill({contentType:'application/json',body:JSON.stringify(result)});
 });
 try{
  await page.goto(`http://127.0.0.1:${server.address().port}/mafia/index.html?room=ZXCV12`);await page.waitForSelector('#playerName');assert.equal(await page.locator('.quick-guide article').count(),3);assert.equal(await page.locator('#roomCode').inputValue(),'ZXCV12');await page.locator('.device-check summary').click();await page.getByRole('button',{name:'Начать проверку'}).click();await page.waitForFunction(()=>document.querySelector('#preflightStatus').textContent.includes('Камера:'));
  assert.match(await page.locator('#entry').innerText(),/Видеосвязь пока недоступна/);
  await page.locator('#soundSettings summary').click();await page.locator('#signalVolume').fill('27');assert.equal(await page.locator('#signalVolumeValue').innerText(),'27%');await page.getByRole('button',{name:'Проверить звук',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#signalStatus').textContent.includes('Проверка:'));assert.equal(await page.locator('#signalsEnabled').isChecked(),true);
  await page.reload();await page.waitForSelector('#playerName');await page.locator('#soundSettings summary').click();assert.equal(await page.locator('#signalVolume').inputValue(),'27');assert.equal(await page.locator('#signalsEnabled').isChecked(),true);
  await page.locator('#signalsEnabled').uncheck();

  await page.screenshot({path:path.join(root,'preview-mafia-home.png'),fullPage:true});
  await page.locator('#playerName').fill('Софія');await page.getByRole('button',{name:'Создать комнату',exact:true}).click();await page.waitForSelector('#videoGrid .player-tile');
  assert.equal(await page.locator('.player-tile').count(),8);await page.locator('#settings>details>summary').click();await page.locator('#settings .advanced-settings>summary').click();assert.equal(await page.locator('[data-role]').count(),22);
  await page.locator('[data-role=doctor]').fill('0');await page.getByRole('button',{name:'Сохранить настройки'}).click();await page.waitForFunction(()=>document.querySelector('[data-role=doctor]').value==='0');assert.ok(calls.some(c=>c.op==='settings'&&c.settings.counts.doctor===0));
  await page.locator('#settings>details>summary').click();
  await page.locator('#setting-cameraMode').selectOption('open');await page.getByRole('button',{name:'Сохранить настройки'}).click();await page.waitForFunction(()=>document.querySelector('#roomLabel').textContent.includes('ВСЕГДА ВИДНЫ'));assert.equal(state.settings.cameraMode,'open');await page.screenshot({path:path.join(root,'preview-mafia-camera-settings.png'),fullPage:true});
  await page.locator('#settings>details>summary').click();await page.locator('#setting-cameraMode').selectOption('hidden');await page.getByRole('button',{name:'Сохранить настройки'}).click();await page.waitForFunction(()=>document.querySelector('#roomLabel').textContent.includes('СКРЫТЫ НОЧЬЮ'));
  await page.getByRole('button',{name:'Подключить камеру',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#notice').textContent.includes('Видеосвязь ещё не подключена'));
  await page.screenshot({path:path.join(root,'preview-mafia-lobby.png'),fullPage:true});
  state.players.forEach(p=>p.ready=true);state=rules.startGame(state,'p0',Object.fromEntries(state.players.map(p=>[p.id,true])),Date.now(),()=>.3);state.players[0].role='doctor';state.players[1].role='mafia';state.players[2].role='sheriff';state.wakeOrder=['doctor','clan','sheriff'];
  await page.waitForFunction(()=>document.querySelector('#phaseLabel').textContent.includes('Ночь'),{timeout:10000});
  await page.waitForFunction(()=>document.querySelector('#transitionCue strong').textContent==='Город засыпает');await page.waitForTimeout(350);await page.screenshot({path:path.join(root,'preview-mafia-transition-sleep.png')});await page.waitForFunction(()=>document.querySelector('#transitionCue strong').textContent==='Просыпайтесь',{timeout:6000});await page.waitForTimeout(350);await page.screenshot({path:path.join(root,'preview-mafia-transition-wake.png')});
  assert.match(await page.locator('#wakeNotice').innerText(),/Ваш ход/);
  assert.equal(await page.locator('#nightKind option').count(),1);assert.equal(await page.locator('#nightKind').inputValue(),'heal');assert.equal(await page.locator('#privateInfo').innerText(),'Результаты ваших проверок появятся здесь.');
  assert.ok(!(await page.locator('#videoGrid').innerText()).includes('Шериф'));
  assert.equal(await page.locator('.device-badges .device').count(),24);assert.equal(await page.locator('.player-tile').nth(1).locator('.device.unknown').count(),3);
  assert.equal(await page.locator('#confirmAction').isDisabled(),true);await page.locator('[data-target="p1"]').click();await page.locator('#confirmAction').click();await page.waitForFunction(()=>document.querySelector('#submittedInfo').textContent.includes('Олександр'));
  assert.equal(state.night.actions.p0.targets[0],'p1');
  await page.locator('#wakeNotice summary').click();await page.waitForResponse(r=>r.url().includes('/functions/v1/mafia')&&r.request().postData()?.includes('"state"'));assert.equal(await page.locator('#wakeNotice details').getAttribute('open'),'');
  await page.evaluate(()=>document.querySelector('#notice').hidden=true);
  await page.screenshot({path:path.join(root,'preview-mafia-night.png'),fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(root,'preview-mafia-mobile.png'),fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'mobile fits');
  await page.setViewportSize({width:1440,height:900});await page.locator('#manualSeconds').fill('75');page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Задать время',exact:true}).click();await page.waitForResponse(r=>r.request().postData()?.includes('"control"'));assert.ok(calls.some(c=>c.op==='control'&&c.command==='timer'&&c.seconds===75&&c.epoch===state.epoch));
   page.once('dialog',dialog=>dialog.accept());await page.getByRole('button',{name:'Следующий этап',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#wakeNotice strong').textContent==='Не ваш ход — глаза закрыты');await page.waitForFunction(()=>document.querySelector('#transitionCue strong').textContent==='Ваша роль засыпает');assert.equal(state.wakeIndex,1);assert.equal(await page.locator('#nightKind').count(),0);assert.equal(await page.locator('#sleepGuardClock').count(),1);assert.equal(await page.locator('body').getAttribute('class'),'night-sleeping');
  state.phase='voting';state.deadline=Date.now()+60000;state.players[0].silencedRound=state.round;
  await page.waitForFunction(()=>document.querySelector('#actions').textContent.includes('лишены права голоса'));
  await page.waitForFunction(()=>document.querySelector('#transitionCue strong').textContent==='Город просыпается');
  assert.equal(await page.locator('#voteTarget').count(),0);assert.deepEqual(errors,[]);
  state.events.push({id:990,round:1,text:'SECRET MAFIA VOTER',audience:['p1']},{id:991,round:2,text:'Публичный итог второго раунда',audience:null});state.phase='finished';state.winner={side:'mafia',ids:['p1'],text:'Мафия победила.'};state.epoch++;
  await page.waitForSelector('#finalScreen .winner-list article');assert.ok(!(await page.locator('#events').innerText()).includes('SECRET'));assert.match(await page.locator('#finalScreen').innerText(),/Олександр/);assert.equal(await page.locator('#mafiaLayout').isVisible(),false);
  await page.locator('#finalScreen summary').click();await page.waitForResponse(r=>r.url().includes('/functions/v1/mafia')&&r.request().postData()?.includes('"state"'));assert.equal(await page.locator('#finalScreen details').getAttribute('open'),'');
  await page.screenshot({path:path.join(root,'preview-mafia-final.png'),fullPage:true});await page.setViewportSize({width:390,height:844});await page.screenshot({path:path.join(root,'preview-mafia-final-mobile.png'),fullPage:true});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.getByRole('button',{name:'Посмотреть хронику'}).click();assert.equal(await page.locator('#mafiaLayout').isVisible(),true);await page.locator('#chronicleRound').selectOption('2');assert.equal(await page.locator('#events .event').count(),1);
  state.winner={side:'town',ids:['p0','p2','p3'],text:'Мирный город победил.'};await page.waitForFunction(()=>document.querySelector('#finalScreen h2').textContent.includes('Поздравляем'));assert.equal(await page.locator('#finalScreen .winner-list article').count(),3);
  state.winner={side:'maniac',ids:['p0'],text:'Маньяк победил.'};await page.waitForFunction(()=>document.querySelector('#finalScreen .winner-list').children.length===1);assert.match(await page.locator('#finalScreen').innerText(),/Маньяк победил/);assert.deepEqual(errors,[]);
  console.log('Mafia browser checks passed: active role selection, 3 device indicators, private round chronicle, wake order, manual timer/next stage, winner screens for mafia/town/solo, preserved panels and desktop/mobile layout.');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
