import assert from 'node:assert/strict';
import {createGame,joinGame,mediaPolicy,publicView} from '../supabase/functions/mafia/engine.mjs';
import {makeMedia} from '../supabase/functions/mafia/media.mjs';
for(const gameMode of ['auto','hosted'])for(const cameraMode of ['hidden','open']){
 let s=createGame('ABC234','host','Host','media');
 for(let i=1;i<=5;i++)s=joinGame(s,'p'+i,'Player '+i);
 s.settings={...s.settings,gameMode,cameraMode};s.round=1;s.phase='night';s.deadline=Date.now()+30000;s.wakeOrder=['doctor','clan','sheriff'];s.wakeIndex=0;
 s.players.forEach((p,i)=>p.role=[gameMode==='hosted'?null:'citizen','doctor','mafia','sheriff','citizen','citizen'][i]);
 s.night={actions:{},mafiaVotes:{},bonusVotes:{}};
 const civilian=mediaPolicy(s,'p4'),host=mediaPolicy(s,'host'),camera=mediaPolicy(s,'p1').videoRoom;
 const removed=[];const provider=makeMedia(k=>({LIVEKIT_URL:'wss://test.livekit.cloud',LIVEKIT_API_KEY:'key',LIVEKIT_API_SECRET:'secret'}[k]),async(url,options)=>{removed.push(JSON.parse(options.body));return new Response('{}');});
 const revision={...s,epoch:s.epoch+5,deadline:s.deadline+15000};await provider.disconnectOld(s,revision);assert.equal(removed.length,0,'timer-only edit must not revoke anyone');
 for(const [phase,index]of [['night_pause',0],['night',1],['night_pause',1],['night',2],['night_bonus',2]]){
  const next={...s,phase,wakeIndex:index,epoch:s.epoch+1};removed.length=0;await provider.disconnectOld(s,next);
  assert.deepEqual(mediaPolicy(next,'p4'),civilian,'civilian connection remains stable for the entire night');
  assert.ok(!removed.some(x=>x.identity==='p4'),'civilian is not kicked for another role wake');
  if(gameMode==='hosted')assert.deepEqual(mediaPolicy(next,'host'),host,'moderator remains connected through all wakes');
  if(cameraMode==='open')assert.ok(next.players.every(p=>mediaPolicy(next,p.id).videoRoom===camera));
  if(s.phase==='night'&&s.wakeIndex===0&&gameMode==='hosted')assert.ok(removed.some(x=>x.identity==='p1'),'doctor loses moderator audio access on sleep');
  if(phase==='night_pause')assert.deepEqual(publicView(next,'p2').me.actions,[]);
  s=next;
 }
 s.phase='day';s.epoch++;const day=mediaPolicy(s,'p4');
 for(const phase of ['nomination','voting','result']){const next={...s,phase,epoch:s.epoch+1};assert.deepEqual(mediaPolicy(next,'p4'),day);removed.length=0;await provider.disconnectOld(s,next);assert.equal(removed.length,0);s=next;}
 const muted={...s,players:s.players.map(p=>p.id==='p4'?{...p,hostMuted:true}:p)};assert.notEqual(mediaPolicy(muted,'p4').epoch,day.epoch);assert.equal(mediaPolicy(muted,'p4').audio,false);
 console.log('PASS media continuity and privacy: '+gameMode+' / '+cameraMode);
}
