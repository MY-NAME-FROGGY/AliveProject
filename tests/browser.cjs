const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
const root=path.resolve(__dirname,'..');
const fakeDB=()=>{
 const me='00000000-0000-4000-8000-000000000001';
 window.fixture={rooms:[],players:[],player_cards:[],game_events:[],effect_requests:[],notes:[],room_resources:[],room_bunker_properties:[],scenarios:[],bunker_properties:[],calls:[]};
 const client={auth:{getSession:async()=>({data:{session:{user:{id:me}}}})},rpc:async(name,args)=>{fixture.calls.push({name,args});if(name==='alive_moderate'&&['revive','eliminate'].includes(args.p_action))fixture.players.find(p=>p.id===args.p_target).is_alive=args.p_action==='revive';return {data:name==='alive_action'?(args.p_action==='vote_progress'?{count:0,total:6}:[]):{},error:null};},from(table){let filters=[],single=false,insert=false;const q={};for(const method of ['select','order','limit','range','or','is','update','insert','upsert','delete','eq','neq','in','maybeSingle','single'])q[method]=(...args)=>{if(method==='eq')filters.push([args[0],args[1]]);if(method==='maybeSingle'||method==='single')single=true;if(['insert','update','delete','upsert'].includes(method)){insert=true;fixture.calls.push({table,method,args});}return q;};q.then=(resolve,reject)=>{let rows=fixture[table]||[];for(const [k,v]of filters)rows=rows.filter(x=>x[k]===v);return Promise.resolve({data:single?(rows[0]||null):rows,error:null,count:rows.length}).then(resolve,reject);};return q;}};
 window.supabase={createClient:()=>client};
};
(async()=>{
 const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}try{res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':'text/html');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));
 const browser=await chromium.launch({headless:true,...(process.env.ALIVE_BROWSER_PATH?{executablePath:process.env.ALIVE_BROWSER_PATH}:{channel:'chrome'})});
 const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
 await page.emulateMedia({reducedMotion:'reduce'});
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://cdn.jsdelivr.net/**',route=>route.fulfill({contentType:'text/javascript',body:'('+fakeDB.toString()+')()'}));
 try{
  await page.goto(`http://127.0.0.1:${server.address().port}/index.html`);
  await page.waitForFunction(()=>typeof AliveGame!=='undefined'&&document.querySelector('#app input'));
  assert.equal(await page.evaluate(()=>[...document.querySelectorAll('script[src],link[rel=stylesheet]')].filter(el=>new URL(el.src||el.href).origin===location.origin).every(el=>new URL(el.src||el.href).searchParams.has('v'))),true,'all local assets use content versions');
  assert.deepEqual(await page.evaluate(()=>['л','liters','l','months','days','yesno','ведра'].map(resourceUnitLabel)),['л','л','л','мес.','дн.','да/нет','ведра']);
  const resourceEditor=await page.evaluate(()=>{const box=document.createElement('div');box.innerHTML=renderResourceRow('test',{label:'Вода',unit:'л',start:8,enabled:true});return {unit:box.querySelector('select').value,value:box.querySelector('input[type=number]').value};});
  assert.deepEqual(resourceEditor,{unit:'л',value:'8'},'liters survive opening the editor');
  await page.evaluate(()=>{
   stopPolling();state.room={code:'DEMO',host_id:state.playerId,phase:'game',current_phase:'discussion',current_round:2,revision:1,nominees:[],nominations:{},phase_running:false,settings:defaultSettings(),scenario_visible:false};state.currentRoomCode='DEMO';state.view='game';
   state.players=Array.from({length:7},(_,i)=>({id:'00000000-0000-4000-8000-'+String(i+1).padStart(12,'0'),room_code:'DEMO',name:['Ведущий','Александра','Дмитрий','Мария','Иван','Екатерина','Максим'][i],avatar:['🧙','🧑‍🚀','🧑‍⚕️','🧑‍🌾','🧑‍🔬','🧑‍🎨','🧑‍🚒'][i],color:'#e9e3d0',outline_color:'#5b6b48',is_alive:true,is_ready:true,seat_number:i}));
   fixture.rooms=[state.room];fixture.players=state.players;fixture.player_cards=state.players.slice(1).flatMap((p,i)=>['profession','health','hobby'].map((category,j)=>({id:100+i*10+j,player_id:p.id,room_code:'DEMO',category,text:['Врач скорой помощи','Без хронических заболеваний','Ремонт электроники'][j],revealed:true,slot:1,value:1})));
   renderGameTable();
  });
  await page.waitForSelector('#auditLog',{state:'attached'});
  await page.screenshot({path:path.join(root,'preview-host.png'),fullPage:true});
  assert.equal(await page.locator('#gamePlayersList .ptable-card').count(),6);
  assert.equal(await page.locator('.game-main .game-chat-panel').count(),1,'chat uses space beneath the table');
  assert.equal(await page.locator('.game-aside > .workspace-tabs [role=tab]').count(),0,'moderation stays visible beside the table');
  assert.equal(await page.evaluate(()=>{const table=document.querySelector('.game-main>.panel:first-child').getBoundingClientRect(),chat=document.querySelector('.game-chat-panel').getBoundingClientRect();return chat.top-table.bottom<=12&&chat.bottom<=innerHeight+4;}),true,'chat fills the space under the table in the first viewport');
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  assert.equal(await page.locator('#allowLateJoin').isChecked(),true,'late join enabled by default');
  await page.evaluate(()=>{state.players[2].is_alive=false;});
  await page.evaluate(()=>updateGameDynamic());
  await page.locator('#moderationTools').getByRole('button',{name:'Вернуть в игру',exact:true}).click();
  await page.waitForFunction(()=>fixture.calls.some(c=>c.name==='alive_moderate'&&c.args.p_action==='revive'));
  await page.waitForFunction(()=>!document.querySelector('#moderationTools').textContent.includes('Вернуть в игру'));
  await page.evaluate(()=>dbJoinRoom('DEMO','Поздний игрок'));
  assert.equal(await page.evaluate(()=>fixture.calls.some(c=>c.name==='alive_join'&&c.args.p_name==='Поздний игрок')),true,'join uses RPC during ongoing game');
  await page.locator('#gameChatInput').fill('Черновик не должен исчезать');
  await page.evaluate(()=>updateGameDynamic());
  assert.equal(await page.locator('#gameChatInput').inputValue(),'Черновик не должен исчезать');
  await page.evaluate(()=>{state.playerId=state.players[1].id;fixture.player_cards.push({id:990,room_code:'DEMO',player_id:state.playerId,category:'special_condition',text:'Обмен характеристиками',effect_key:'swap_trait',target_type:'one',revealed:false,used:false,slot:1});renderGameTable();});
  await page.waitForSelector('#myCardPanel li');
  await page.evaluate(async()=>{fixture.player_cards.push({id:991,room_code:'DEMO',player_id:state.playerId,category:'goal',text:'Не просто пассажир — Войти в итоговый состав и объяснить свою задачу.',revealed:false,value:0,slot:1});await loadMyCard();});
  assert.equal(await page.locator('#myCardPanel .personal-goal').count(),1);
  assert.equal(await page.locator('#myCardPanel .personal-goal button[onclick*="actionRevealTrait"]').count(),0,'goals never offer a public reveal button');
  assert.match(await page.locator('#myCardPanel .personal-goal').innerText(),/подведении итогов/);
  await page.screenshot({path:path.join(root,'preview-player.png'),fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.evaluate(()=>{window.selection=AliveEffectsUI.pick({text:'Выбор'},[{id:'one',name:'Первый'},{id:'two',name:'Второй'}],2);});
  const modal=page.locator('#aliveEffectModal');await modal.getByText('Первый',{exact:true}).click();
  assert.equal(await modal.locator('[data-confirm]').isDisabled(),true);
  await modal.getByText('Второй',{exact:true}).click();assert.equal(await modal.locator('[data-confirm]').isDisabled(),false);
  await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>window.selection),false);
  assert.equal(await modal.getAttribute('aria-hidden'),'true');
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:path.join(root,'preview-mobile.png'),fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'no mobile horizontal overflow');
  const rules=await page.evaluate(()=>{const r={current_round:1,current_phase:'reveal',settings:{round_reveals:[['health','health','any']]}};return [canRevealCategory([{category:'health',revealed:true,round_revealed:1}],r,'health').ok,canRevealCategory([{category:'health',revealed:true,round_revealed:1},{category:'health',revealed:true,round_revealed:1},{category:'phobia',revealed:true,round_revealed:1}],r,'health').ok,canRevealCategory([],r,'goal').ok];});
  assert.deepEqual(rules,[true,false,false]);
  await page.setViewportSize({width:1440,height:900});
  await page.evaluate(()=>{state.playerId=state.room.host_id;state.room.phase='lobby';state.view='lobby';renderLobby();});
  await page.waitForSelector('#generationSettings');
  assert.equal(await page.locator('[data-count-category="goal"]').inputValue(),'1','personal goal defaults to one');
  await page.screenshot({path:path.join(root,'preview-lobby.png'),fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.evaluate(()=>actionSetOutlineColor('#ff0055'));
  assert.equal(await page.locator('.lobby-player-card').first().evaluate(el=>getComputedStyle(el).borderTopColor),'rgb(255, 0, 85)','host lobby outline updates immediately');
  const adventure=JSON.parse(fs.readFileSync(path.join(root,'content/medieval-plague-queen.json'),'utf8'));
  for (const [id,hasPresets,hasRoutes] of [['water_world',true,true],['SC08',true,false],['MEDIEVAL_PLAGUE_QUEEN',false,true]]) {
   await page.evaluate(({id,hasPresets,hasRoutes})=>{
    state.view='scenarioDetail';
    state.viewingScenario={scenario:{id,title:id,combo_enabled:hasRoutes},base:[],bonus:[]};
    state.viewingPresets=hasPresets?[{label:'Герой'}]:[];
    renderScenarioDetail();
   },{id,hasPresets,hasRoutes});
   const options=page.locator('.deal-options');
   assert.equal(await options.getByRole('button',{name:'Случайная генерация',exact:true}).count(),1);
   assert.equal(await options.getByRole('button',{name:'Прописанные персонажи',exact:true}).count(),Number(hasPresets));
   assert.equal(await options.getByRole('button',{name:'Случайная генерация + связки',exact:true}).count(),Number(hasRoutes));
   await options.getByRole('button',{name:'Случайная генерация',exact:true}).click();
   assert.equal(await page.evaluate(()=>fixture.calls.filter(c=>c.table==='rooms'&&c.method==='update').at(-1).args[0].card_mode),'random_free');
  }
  await page.evaluate(data=>{state.room.scenario_id=data.scenario.id;renderLobby();},adventure);
  await page.waitForFunction(()=>document.body.dataset.theme==='medieval');
  assert.equal(await page.locator('#adventurePoolNote').count(),0,'no catalog commentary under the scenario title');
  await page.evaluate(()=>{const stale=document.createElement('p');stale.id='adventurePoolNote';stale.textContent='Старое описание набора';document.querySelector('#app').append(stale);AliveAdventure.refresh();});
  assert.equal(await page.locator('#adventurePoolNote').count(),0,'stale note is removed on refresh');
  await page.evaluate(data=>{
   state.room.scenario_id=data.scenario.id;state.room.scenario_visible=true;state.room.phase='game';state.room.current_phase='reveal';state.view='game';
   state.room.nominees=[state.players[1].id];state.room.reveal_index=0;state.players[1].outline_color='#22ccff';
   fixture.scenarios=[{id:data.scenario.id,title:data.scenario.title,catastrophe_description:data.scenario.description,character_pool_tag:data.scenario.tag,has_presets:false}];
   fixture.room_bunker_properties=data.artifacts.map((a,i)=>({...a,id:i+1,property_id:i+1,room_code:'DEMO',revealed:i<3,available:true,blocked:false}));
   fixture.bunker_properties=data.artifacts.map((a,i)=>({...a,id:i+1,scenario_id:data.scenario.id}));
   fixture.room_resources=[{room_code:'DEMO',key:'water_liters',label:'Чистая вода отряда',amount:8,unit:'л'}];
   fixture.player_cards=state.players.slice(1).flatMap((p,i)=>['profession','health','hobby'].map((category,j)=>({id:100+i*10+j,player_id:p.id,room_code:'DEMO',category,text:data.characteristics.filter(c=>c.category===category)[i].text,revealed:true,slot:1,value:1})));
   renderGameTable();
  },adventure);
  await page.waitForFunction(()=>document.body.dataset.theme==='medieval');
  await page.waitForSelector('#auditLog',{state:'attached'});
  await page.evaluate(()=>updateGameDynamic());
  assert.equal(await page.locator('.host-strip').evaluate(el=>getComputedStyle(el).borderTopColor),'rgb(255, 0, 85)');
  assert.equal(await page.locator('.ptable-card').first().evaluate(el=>getComputedStyle(el).borderTopColor),'rgb(34, 204, 255)','speaking and nomination preserve personal outline');
  assert.equal(await page.locator('.game-sidebar [role=tab]').getByText('Артефакты',{exact:true}).count(),1);
  await page.waitForFunction(()=>document.body.textContent.includes('8 л'));
  assert.equal(await page.evaluate(()=>document.body.textContent.includes('8 да/нет')),false);
  await page.evaluate(()=>{delete document.body.dataset.theme;window.dispatchEvent(new Event('pageshow'));});
  assert.equal(await page.getAttribute('body','data-theme'),'medieval','theme restored on page return');
  await page.screenshot({path:path.join(root,'preview-medieval-host.png'),fullPage:true});
  await page.evaluate(()=>{state.playerId=state.players[1].id;renderGameTable();});
  await page.waitForSelector('#myCardPanel li');
  await page.evaluate(()=>{
   const original=supabaseClient.rpc;
   supabaseClient.rpc=(name,args)=>name==='alive_room_story'
    ? Promise.resolve({data:'Король развернул письмо.\n\nРаненый гонец один знает обратный путь.\n\nКолокол отзывается на старые чары.'})
    : original(name,args);
   renderScenarioPanelGameContent();
  });
  await page.waitForFunction(()=>document.querySelector('#roomScenarioStory')?.textContent.includes('Раненый гонец'));
  assert.equal(await page.locator('#roomScenarioStory > p').count(),3);
  assert.equal(await page.locator('#scenarioPanelGame > p, #roomScenarioStory :is(aside,h4)').count(),0);
  await page.evaluate(()=>actionSetOutlineColor('#aa66ff'));
  assert.equal(await page.locator('#myCardPanel').evaluate(el=>getComputedStyle(el).borderTopColor),'rgb(170, 102, 255)');
  for (const width of [1440, 950, 390]) {
   await page.setViewportSize({width,height:844});
   await page.evaluate(()=>{
    const panel=document.querySelector('#myCardPanel');
    panel.closest('.game-layout').dataset.mobileView='aside';
    const list=panel.querySelector('ul');
    while(list.children.length<18)list.append(list.firstElementChild.cloneNode(true));
   });
   assert.equal(await page.locator('#myCardPanel').evaluate(panel=>{
    const last=panel.querySelector('li:last-child');
    return panel.offsetWidth>0 && panel.getBoundingClientRect().bottom>=last.getBoundingClientRect().bottom
     && ['Top','Right','Bottom','Left'].every(side=>getComputedStyle(panel)['border'+side+'Color']==='rgb(170, 102, 255)');
   }),true,'the entire hand stays inside its outline at '+width);
  }
  await page.setViewportSize({width:390,height:844});
  await page.screenshot({path:path.join(root,'preview-medieval-mobile.png'),fullPage:true});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'medieval mobile fits');
  await page.evaluate(()=>{state.room.scenario_id=null;renderGameTable();});
  await page.waitForFunction(()=>!document.body.dataset.theme);
  assert.equal(await page.locator('#app > h1').innerText(),'ОСТАТЬСЯ В ЖИВЫХ','ordinary scenario theme restored');
  await page.evaluate(()=>{state.room.current_phase='voting';state.room.nominees=[state.players[2].id];state.players[2].is_alive=true;fixture.round_effects=[{room_code:'DEMO',round:state.room.current_round,target_player_id:state.playerId,is_active:true,effect_key:'vote_nullified'}];});
  await page.evaluate(()=>updateGameDynamic());
  assert.equal(await page.locator('#gamePlayersList').getByRole('button',{name:'Голосовать',exact:true}).count(),0,'resurrected player has no vote buttons this round');
  assert.equal(await page.evaluate(()=>state.voteBlocked),true);
  await page.evaluate(()=>{
   const original=supabaseClient.rpc;
   supabaseClient.rpc=async(name,args)=>{
    if(name==='alive_room_story')return {data:'На карте нарисован камыш.\n\n«Кто проведёт отряд через болото?»\n\n«Кто поможет раненому?»\n\nОтряд вернулся.'};
    if(name==='alive_goal_review')return {data:[{name:'Александра',text:'Сохрани хобби в тайне.',met:true}]};
    return original(name,args);
   };
   state.room.scenario_id='MEDIEVAL_PLAGUE_QUEEN';state.room.scenario_visible=true;
   state.room.current_phase='finished';state.room.verdict='victory';renderGameTable();
  });
  await page.waitForFunction(()=>document.querySelector('#finalStory')?.textContent.includes('камыш'));
  assert.equal(await page.locator('#finalStory > p').count(),4);
  assert.equal(await page.locator('#finalStory aside, #finalStory h4').count(),0);
  assert.equal(await page.locator('#finalStory > p:last-child').innerText(),'Отряд вернулся.');
  assert.match(await page.locator('#finalGoals').innerText(),/Александра · выполнена/);
  await page.evaluate(()=>{state.room.scenario_visible=false;refreshStoryAndGoals(state.room);});
  assert.equal(await page.locator('#finalStory').isVisible(),false);
  await page.evaluate(()=>{
   state.playerId=state.room.host_id; state.room.current_phase='awaiting_verdict';
   const original=supabaseClient.rpc;
   const row={id:91,seat:2,name:'Александра',text:'Согласуйте план.',met:null};
   supabaseClient.rpc=async(name,args)=>{
    if(name==='alive_goal_review')return {data:[row]};
    if(name==='alive_mark_goal'){row.host_met=row.met=args.p_met;row.source='ведущий';return {data:null};}
    if(name==='alive_review_export')return {data:{start:{players:[{},{}]},started_at:'2026-11-18',current:{round:2,phase:'awaiting_verdict',scenario:'Приключение',players:[{seat:2,name:'Александра',remaining:true}]}}};
    return original(name,args);
   };
   renderGameTable();
  });
  await page.locator('#finalGoals').getByRole('button',{name:'Выполнено',exact:true}).click();
  await page.waitForFunction(()=>document.querySelector('#finalGoals strong')?.textContent.includes('выполнена'));
  const downloaded=page.waitForEvent('download');
  await page.getByRole('button',{name:'Скачать обзор партии (.txt)'}).click();
  const report=await downloaded;
  assert.match(report.suggestedFilename(),/bunker-round-2-.*\.txt$/);
  assert.match(fs.readFileSync(await report.path(),'utf8'),/Просьба ведущего[\s\S]+Александра/);
  assert.equal(await page.locator('#moderationTools .moderation-row').count(),6);
  assert.deepEqual(errors,[]);
  console.log('Browser checks passed: host/player/lobby/mobile, drafts, modals, reveal slots, outlines, medieval theme and restoration, resource units and asset versions.');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
