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
 assert.equal(await page.locator('.game-main').isVisible(),false);assert.equal(await page.locator('#hostMasterPanel').isVisible(),true);
 await page.locator('#bunkerPreferences summary').click();await page.locator('#bunkerDensity').selectOption('compact');await page.locator('#bunkerLarge').check();assert.equal(await page.locator('body').getAttribute('data-density'),'compact');
 await page.screenshot({path:path.join(root,'preview-host-workspace.png'),fullPage:true});
 await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:path.join(root,'preview-host-workspace-mobile.png'),fullPage:true});
 assert.deepEqual(errors,[]);console.log('Host workspace passed: owner controls, separate route, preferences and mobile fit.');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
