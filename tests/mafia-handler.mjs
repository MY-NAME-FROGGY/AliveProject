// Exercise the actual Edge handler with an in-memory storage/provider boundary.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import * as engine from '../supabase/functions/mafia/engine.mjs';
import {makeMedia} from '../supabase/functions/mafia/media.mjs';
const rooms=new Map(),calls=[];let handler,missing=new Set(),rejectRevocation=false;
const db={auth:{getUser:async token=>token.startsWith('user:')?{data:{user:{id:token.slice(5)}},error:null}:{data:{user:null},error:{message:'invalid'}}},rpc:async(name,args)=>{
 if(name==='mafia_scheduler_auth')return {data:args.p_token==='test-cron-secret'};
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
const provider=async(url,options)=>{const body=JSON.parse(options.body);if(url.endsWith('RemoveParticipant')){calls.push('revoke');return Response.json(rejectRevocation?{code:'unavailable'}:{},{status:rejectRevocation?503:200});}
 const grants=JSON.parse(Buffer.from(options.headers.Authorization.split('.')[1],'base64url')).video;assert.equal(grants.roomList,true);
 const players=[...rooms.values()].flatMap(r=>r.state.players.filter(p=>engine.mediaPolicy(r.state,p.id).room===body.room));
 return Response.json({participants:players.map(p=>({identity:p.id,tracks:[{type:'VIDEO',source:'CAMERA',muted:missing.has(p.id)}]}))});
};
const source=stripTypeScriptTypes(fs.readFileSync(new URL('../supabase/functions/mafia/index.ts',import.meta.url),'utf8')).replace(/^import .+;\r?\n/gm,'');
const bindings={...engine,createClient:()=>db,makeMedia:get=>makeMedia(get,provider),Deno:{env:{get:k=>env[k]},serve:fn=>handler=fn}};
new Function(...Object.keys(bindings),source)(...Object.values(bindings));
async function call(op,user='host',body={}){const response=await handler(new Request('https://edge.test/mafia',{method:'POST',headers:{Authorization:user==='cron'?'Bearer test-cron-secret':user?'Bearer user:'+user:'Bearer invalid'},body:JSON.stringify({op,...body})}));return {status:response.status,...await response.json()};}
assert.equal((await call('catalog',null)).status,401);
assert.equal((await call('scheduler','outsider')).status,401);
const created=await call('create','host',{name:'Host'}),code=created.game.code;
for(let i=1;i<5;i++)assert.equal((await call('join','p'+i,{code,name:'Player '+i})).status,200);
assert.equal((await call('state','outsider',{code})).status,400);
const beforeRead=calls.length;assert.equal((await call('state','host',{code})).status,200);assert.deepEqual(calls.slice(beforeRead),['read']);
for(const id of ['host','p1','p2','p3','p4'])assert.equal((await call('ready',id,{code,ready:true})).status,200);
missing.add('p2');assert.equal((await call('start','host',{code})).status,400);missing.clear();
rejectRevocation=true;assert.equal((await call('start','host',{code})).status,400);assert.equal(rooms.get(code).state.phase,'lobby');assert.equal(rooms.get(code).lease,null);rejectRevocation=false;
const beforeStart=calls.length;const started=await call('start','host',{code});assert.equal(started.status,200);assert.ok(calls.slice(beforeStart).lastIndexOf('revoke')<calls.slice(beforeStart).indexOf('save'));
assert.ok(started.game.players.every(p=>!Object.hasOwn(p,'role')));
const row=rooms.get(code);row.state.cameraGraceUntil=0;missing.add('p2');await call('scheduler','cron');assert.equal(row.state.cameraPaused,true);const remaining=row.state.remaining;
await call('pause','host',{code});assert.equal(row.state.cameraPaused,undefined);missing.clear();await call('scheduler','cron');assert.equal(row.state.paused,true);assert.equal(row.state.remaining,remaining);
await call('resume','host',{code});assert.equal(row.state.paused,false);assert.equal(row.state.cameraPaused,undefined);
const response=await call('media','p1',{code});assert.equal(response.status,200);const claims=JSON.parse(Buffer.from(response.connection.token.split('.')[1],'base64url'));assert.equal(claims.sub,'p1');assert.equal(claims.video.canPublishData,false);
missing.add('p1');assert.equal((await call('act','p1',{code,kind:'check',targets:['host']})).status,400);
console.log('Edge handler checks passed: authentication, private reads without leases, camera enforcement, phase revocation barrier, scheduler and manual pause, personal media tokens.');
