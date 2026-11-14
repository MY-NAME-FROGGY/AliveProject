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
 await page.goto(`http://127.0.0.1:${server.address().port}/host.html`);await page.waitForFunction(()=>typeof AliveGame!=='undefined'&&document.querySelector('#app input'));
  await page.evaluate(()=>{
   stopPolling();state.room={code:'DEMO',host_id:state.playerId,phase:'game',current_phase:'discussion',current_round:2,revision:1,nominees:[],nominations:{},phase_running:false,settings:defaultSettings(),scenario_visible:false};state.currentRoomCode='DEMO';state.view='game';
   state.players=Array.from({length:7},(_,i)=>({id:'00000000-0000-4000-8000-'+String(i+1).padStart(12,'0'),room_code:'DEMO',name:['Ведущий','Александра','Дмитрий','Мария','Иван','Екатерина','Максим'][i],avatar:['🧙','🧑‍🚀','🧑‍⚕️','🧑‍🌾','🧑‍🔬','🧑‍🎨','🧑‍🚒'][i],color:'#e9e3d0',outline_color:'#5b6b48',is_alive:true,is_ready:true,seat_number:i}));
   fixture.rooms=[state.room];fixture.players=state.players;fixture.player_cards=state.players.slice(1).flatMap((p,i)=>['profession','health','hobby'].map((category,j)=>({id:100+i*10+j,player_id:p.id,room_code:'DEMO',category,text:['Врач скорой помощи','Без хронических заболеваний','Ремонт электроники'][j],revealed:true,slot:1,value:1})));
   renderGameTable();
  });

 await page.waitForSelector('body.host-authorized');await page.waitForSelector('#auditLog',{state:'attached'});
 const recipes=JSON.parse(fs.readFileSync(path.join(root,'content/scenario-routes.json'),'utf8')).SC01;
 await page.evaluate(rows=>{state.room.scenario_id='SC01';window.routeRows=rows.map((r,i)=>({key:'SC01_route_'+(i+1),title:r[0],threat:r[1],outcome:r[2],limitations:r[3]}));window.selectedRoutes=[routeRows[0],routeRows[3]].map(r=>({...r,required:3,surviving:3,parts:[1,2,3].map(part=>({part,cards:[{player:'Player',text:'Own visible component '+part,alive:true,usable:true}]}))}));const original=supabaseClient.rpc;supabaseClient.rpc=async(name,args)=>name==='alive_combo_status'?{data:selectedRoutes}:name==='alive_scenario_routes'?{data:routeRows}:original(name,args);},recipes);
 await page.evaluate(()=>AliveExperience.refreshCombos(true));await page.evaluate(()=>AliveExperience.refreshCombos(true));
 assert.equal(await page.locator('#victoryRoutes .route-score.ready').count(),2);assert.equal(await page.locator('#victoryRoutes details article').count(),6);
 const finals=()=>page.evaluate(()=>fixture.calls.filter(x=>x.table==='rooms'&&x.method==='update'&&x.args[0]?.current_phase==='finished').length);
 const before=await finals();await page.waitForTimeout(1700);assert.equal(await finals(),before,'complete routes never automatically finish the game');
 await page.screenshot({path:path.join(root,'preview-scenario-routes.png'),fullPage:true});
 await page.evaluate(()=>{selectedRoutes[0].surviving=2;selectedRoutes[0].parts[1].cards[0].usable=false;return AliveExperience.refreshCombos(true);});assert.equal(await page.locator('#victoryRoutes .route-score.incomplete').count(),1);
 assert.deepEqual(errors,[]);console.log('Scenario routes browser passed: six catalogue routes, two selected plans, explicit results/limits, blocked component and no automatic victory.');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
