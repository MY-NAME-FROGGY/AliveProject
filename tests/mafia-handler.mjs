// Exercise the actual Edge handler with an in-memory storage/provider boundary.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import * as engine from '../supabase/functions/mafia/engine.mjs';
import {makeMedia} from '../supabase/functions/mafia/media.mjs';
const rooms=new Map(),calls=[],providerCalls=[],auditRows=[];let handler,missing=new Set(),rejectRevocation=false;
const db={auth:{getUser:async token=>token.startsWith('user:')?{data:{user:{id:token.slice(5)}},error:null}:{data:{user:null},error:{message:'invalid'}}},rpc:async(name,args)=>{
 if(name==='mafia_scheduler_auth')return {data:args.p_token==='test-cron-secret'};
 if(name==='mafia_audit'){auditRows.push(structuredClone(args));return {data:auditRows.length,error:null};}
 const {p_op:op,p_code:code,p_lease:lease,p_state:state}=args;calls.push(op);const row=rooms.get(code);
 if(op==='create'){rooms.set(code,{state:structuredClone(state),lease:null});return {data:{state}};}
 if(op==='due')return {data:[...rooms].filter(([,r])=>!['lobby','finished'].includes(r.state.phase)).map(([c])=>c)};
 if(op==='read')return {data:row?{state:structuredClone(row.state)}:null};
 if(op==='claim'){if(!row||row.lease)return {data:null};row.lease=lease;return {data:{state:structuredClone(row.state)}};}
 if(op==='release'){if(row?.lease===lease)row.lease=null;return {data:{}};}
 if(['save','save_tick'].includes(op)){assert.equal(row.lease,lease);row.state=structuredClone(state);row.lease=null;return {data:{state}};}
 throw Error('unexpected storage operation '+op);
}};
const env={SUPABASE_URL:'https://test.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'test-service',LIVEKIT_URL:'wss://test.livekit.cloud',LIVEKIT_API_KEY:'key',LIVEKIT_API_SECRET:'test-secret'};
const provider=async(url,options)=>{const body=JSON.parse(options.body),method=url.split('/').at(-1);providerCalls.push(method);if(url.endsWith('RemoveParticipant')){calls.push('revoke');return Response.json(rejectRevocation?{code:'unavailable'}:{},{status:rejectRevocation?503:200});}
 const grants=JSON.parse(Buffer.from(options.headers.Authorization.split('.')[1],'base64url')).video;
 const players=[...rooms.values()].flatMap(r=>r.state.players.filter(p=>{const policy=engine.mediaPolicy(r.state,p.id);return (policy.videoRoom||policy.room)===body.room;}));
 if(url.endsWith('GetParticipant')){assert.equal(grants.roomAdmin,true);const p=players.find(p=>p.id===body.identity);return p?Response.json({identity:p.id,tracks:[{type:'VIDEO',source:'CAMERA',muted:missing.has(p.id)}]}):Response.json({code:'not_found'},{status:404});}
 assert.equal(grants.roomList,true);
 return Response.json({participants:players.map(p=>({identity:p.id,tracks:[{type:'VIDEO',source:'CAMERA',muted:missing.has(p.id)}]}))});
};
const source=stripTypeScriptTypes(fs.readFileSync(new URL('../supabase/functions/mafia/index.ts',import.meta.url),'utf8')).replace(/^import .+;\r?\n/gm,'');
const bindings={...engine,createClient:()=>db,makeMedia:get=>makeMedia(get,provider),Deno:{env:{get:k=>env[k]},serve:fn=>handler=fn}};
new Function(...Object.keys(bindings),source)(...Object.values(bindings));
async function call(op,user='host',body={}){const response=await handler(new Request('https://edge.test/mafia',{method:'POST',headers:{Authorization:user==='cron'?'Bearer test-cron-secret':user?'Bearer user:'+user:'Bearer invalid'},body:JSON.stringify({op,...body})}));return {status:response.status,...await response.json()};}
assert.equal((await call('catalog',null)).status,401);
assert.equal((await call('scheduler','outsider')).status,401);
const created=await call('create','host',{name:'Host'}),code=created.game.code;
assert.equal(auditRows.at(-1).p_event_key,'room_created');assert.equal(auditRows.at(-1).p_player_name,'Host');
for(let i=1;i<5;i++)assert.equal((await call('join','p'+i,{code,name:'Player '+i})).status,200);
assert.equal(auditRows.filter(r=>r.p_event_key==='player_joined').length,4);
assert.equal((await call('state','outsider',{code})).status,400);
const beforeRead=calls.length;assert.equal((await call('state','host',{code})).status,200);assert.deepEqual(calls.slice(beforeRead),['read']);
assert.equal((await call('state','host',{code,resume:true})).status,200);assert.equal(auditRows.at(-1).p_event_key,'session_restored');assert.ok(rooms.get(code).state.cameraGraceUntil>Date.now());
const listChecksBeforePrematureStart=providerCalls.filter(x=>x==='ListParticipants').length;assert.equal((await call('start','host',{code})).status,400);assert.equal(providerCalls.filter(x=>x==='ListParticipants').length,listChecksBeforePrematureStart,'start fails immediately while players are not ready');
for(const id of ['host','p1','p2','p3','p4'])assert.equal((await call('camera_status',id,{code})).status,200);
const listChecksBeforeReady=providerCalls.filter(x=>x==='ListParticipants').length;
for(const id of ['host','p1','p2','p3','p4'])assert.equal((await call('ready',id,{code,ready:true})).status,200);
assert.equal(providerCalls.filter(x=>x==='ListParticipants').length,listChecksBeforeReady,'fresh camera confirmations make ready instant');
const cached=structuredClone(rooms.get(code).state);cached.players.find(p=>p.id==='p2').cameraVerifiedAt=0;rooms.get(code).state=cached;
missing.add('p2');assert.equal((await call('start','host',{code})).status,400);missing.clear();
rooms.get(code).state.players.find(p=>p.id==='p2').cameraVerifiedAt=Date.now();
rejectRevocation=true;assert.equal((await call('start','host',{code})).status,400);assert.equal(rooms.get(code).state.phase,'lobby');assert.equal(rooms.get(code).lease,null);rejectRevocation=false;
const listChecksBeforeStart=providerCalls.filter(x=>x==='ListParticipants').length,beforeStart=calls.length;const started=await call('start','host',{code});assert.equal(started.status,200);assert.equal(providerCalls.filter(x=>x==='ListParticipants').length,listChecksBeforeStart,'fresh confirmations avoid repeated start check');assert.ok(calls.slice(beforeStart).lastIndexOf('revoke')<calls.slice(beforeStart).indexOf('save'));
assert.ok(started.game.players.every(p=>!Object.hasOwn(p,'role')));
const row=rooms.get(code);row.state.cameraGraceUntil=0;missing.add('p2');await call('scheduler','cron');assert.equal(row.state.cameraPaused,true);const remaining=row.state.remaining;
missing.clear();const recovered=await call('camera_status','p2',{code});assert.equal(recovered.status,200);assert.equal(row.state.cameraPaused,undefined);assert.equal(row.state.paused,false);assert.ok(row.state.deadline>Date.now());assert.equal(auditRows.at(-1).p_event_key,'camera_resume');
row.state.cameraGraceUntil=0;missing.add('p2');await call('scheduler','cron');assert.equal(row.state.cameraPaused,true);const secondRemaining=row.state.remaining;
await call('pause','host',{code});assert.equal(row.state.cameraPaused,undefined);missing.clear();await call('scheduler','cron');assert.equal(row.state.paused,true);assert.equal(row.state.remaining,secondRemaining);assert.ok(secondRemaining<=remaining);
await call('resume','host',{code});assert.equal(row.state.paused,false);assert.equal(row.state.cameraPaused,undefined);
const response=await call('media','p1',{code});assert.equal(response.status,200);const claims=JSON.parse(Buffer.from(response.connection.token.split('.')[1],'base64url'));assert.equal(claims.sub,'p1');assert.equal(claims.video.canPublishData,false);
assert.equal(auditRows.at(-1).p_event_key,'media_connected');const graceAfterMedia=row.state.cameraGraceUntil;assert.ok(graceAfterMedia>Date.now());assert.equal((await call('disconnect','p1',{code,reason:'pagehide'})).status,200);assert.ok(row.state.cameraGraceUntil>=graceAfterMedia);assert.equal(auditRows.at(-1).p_event_key,'player_disconnected');
missing.add('p1');assert.equal((await call('act','p1',{code,kind:'check',targets:['host']})).status,400);
assert.equal((await call('control','p1',{code,command:'next',epoch:row.state.epoch})).status,400);
assert.equal((await call('control','host',{code,command:'next',epoch:row.state.epoch-1})).status,400);
assert.equal((await call('presence','outsider',{code,sound:true})).status,400);
assert.equal((await call('presence','p1',{code,sound:true})).status,200);assert.equal(row.state.players.find(p=>p.id==='p1').soundState.enabled,true);
assert.equal((await call('presence','p1',{code,sound:'yes'})).status,400);
const previous=row.state.epoch;rejectRevocation=true;assert.equal((await call('control','host',{code,command:'next',epoch:previous})).status,400);assert.equal(row.state.epoch,previous);rejectRevocation=false;
assert.equal((await call('control','host',{code,command:'next',epoch:previous})).status,200);assert.equal(row.state.epoch,previous+1);
assert.equal((await call('act','p1',{code,kind:'check',targets:['host'],epoch:previous})).status,400);
const openLobby=await call('create','owner2',{name:'Open host'}),openCode=openLobby.game.code;
for(let i=1;i<5;i++)await call('join','o'+i,{code:openCode,name:'Open '+i});
const openSettings={...openLobby.game.settings,cameraMode:'open'};
assert.equal((await call('settings','o1',{code:openCode,settings:openSettings})).status,400);
rejectRevocation=true;assert.equal((await call('settings','owner2',{code:openCode,settings:openSettings})).status,400);assert.equal(rooms.get(openCode).state.settings.cameraMode,'hidden');rejectRevocation=false;
assert.equal((await call('settings','owner2',{code:openCode,settings:openSettings})).status,200);
for(const id of ['owner2','o1','o2','o3','o4'])assert.equal((await call('ready',id,{code:openCode,ready:true})).status,200);
assert.equal((await call('start','owner2',{code:openCode})).status,200);
assert.equal((await call('settings','owner2',{code:openCode,settings:openSettings})).status,400);
const openMedia=await call('media','o1',{code:openCode});assert.equal(openMedia.status,200);assert.ok(openMedia.connection.video);
const videoClaims=JSON.parse(Buffer.from(openMedia.connection.video.token.split('.')[1],'base64url'));assert.deepEqual(videoClaims.video.canPublishSources,['camera']);assert.equal(videoClaims.sub,'o1');
const testLobby=await call('create','tester',{name:'Solo tester'}),testCode=testLobby.game.code;
for(let i=1;i<5;i++)await call('join','t'+i,{code:testCode,name:'Test '+i});
assert.equal((await call('settings','tester',{code:testCode,settings:{...testLobby.game.settings,strictCameraCheck:false}})).status,200);
const cameraChecksBeforeTest=providerCalls.filter(x=>x==='ListParticipants').length;
for(const id of ['tester','t1','t2','t3','t4'])assert.equal((await call('ready',id,{code:testCode,ready:true})).status,200);
assert.equal((await call('disconnect','t1',{code:testCode,reason:'pagehide'})).status,200);assert.equal(rooms.get(testCode).state.players.find(p=>p.id==='t1').ready,true);
missing=new Set(['tester','t1','t2','t3','t4']);const testStarted=await call('start','tester',{code:testCode});assert.equal(testStarted.status,200);assert.equal(testStarted.game.settings.strictCameraCheck,false);assert.equal(providerCalls.filter(x=>x==='ListParticipants').length,cameraChecksBeforeTest);
const testRow=rooms.get(testCode);testRow.state.cameraGraceUntil=0;await call('scheduler','cron');assert.notEqual(testRow.state.cameraPaused,true);assert.equal((await call('resume','tester',{code:testCode})).status,200);missing.clear();
const hosted=await call('create','host3',{name:'Moderator'}),hostedCode=hosted.game.code;
for(let i=1;i<=5;i++)assert.equal((await call('join','h'+i,{code:hostedCode,name:'Hosted '+i})).status,200);
assert.equal((await call('settings','host3',{code:hostedCode,settings:{...hosted.game.settings,gameMode:'hosted',counts:{mafia:1,doctor:1,sheriff:1}}})).status,200);
for(const id of ['host3','h1','h2','h3','h4','h5'])assert.equal((await call('camera_status',id,{code:hostedCode})).status,200);
assert.equal((await call('ready','host3',{code:hostedCode,ready:true})).status,400);
for(const id of ['h1','h2','h3','h4','h5'])assert.equal((await call('ready',id,{code:hostedCode,ready:true})).status,200);
const hostedStarted=await call('start','host3',{code:hostedCode});assert.equal(hostedStarted.status,200);assert.equal(hostedStarted.game.me.moderator,true);assert.ok(hostedStarted.game.hostPanel.players.every(p=>p.role));
assert.equal((await call('state','h1',{code:hostedCode})).game.hostPanel,null);
const hostedRow=rooms.get(hostedCode),hostedPhase=hostedRow.state.phase,hostedWake=hostedRow.state.wakeIndex;hostedRow.state.deadline=Date.now()-1;
assert.equal((await call('scheduler','cron')).status,200);assert.equal(hostedRow.state.phase,hostedPhase);assert.equal(hostedRow.state.wakeIndex,hostedWake,'scheduler must not advance hosted games');
const hostedTarget=hostedRow.state.players.find(p=>p.id!=='host3');assert.equal((await call('moderate','h1',{code:hostedCode,command:'role',target:hostedTarget.id,role:hostedTarget.role})).status,400);assert.equal((await call('moderate','host3',{code:hostedCode,command:'role',target:hostedTarget.id,role:hostedTarget.role})).status,200);
console.log('Edge handler checks passed: authentication, audit trail, reconnect grace, strict/optional camera modes, hosted moderator rights, manual scheduler, private credentials, revocation barriers and controls.');
