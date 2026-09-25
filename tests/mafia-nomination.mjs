import assert from 'node:assert/strict';
import {createGame,joinGame,startGame,act,advance,publicView,control,changeLobby,DEFAULTS,mediaPolicy} from '../supabase/functions/mafia/engine.mjs';

function game({hosted=false,open=false}={}){
 let s=createGame('NOM123','host','Ведущий','media',0);
 for(let i=1;i<6;i++)s=joinGame(s,'p'+i,'Игрок '+i);
 s=changeLobby(s,'host','settings',{...DEFAULTS,gameMode:hosted?'hosted':'auto',cameraMode:open?'open':'hidden',counts:{mafia:1,sheriff:1,doctor:1}});
 for(const p of s.players.filter(p=>!(hosted&&p.id==='host')))s=changeLobby(s,p.id,'ready',{ready:true},true);
 s=startGame(s,'host',Object.fromEntries(s.players.map(p=>[p.id,true])),1,()=>.4);
 s.phase='day';s.deadline=10;s.paused=false;return s;
}

let s=advance(game(),11);
assert.equal(s.phase,'nomination');
assert.equal(s.nominationOrder.length,6);
const first=s.nominationOrder[0],target=s.nominationOrder[1];
let view=publicView(s,first);
assert.equal(view.nomination.currentId,first);
assert.ok(view.nomination.eligible.includes(target));
assert.throws(()=>act(s,target,'nominate',[first],12),/не ваше/);
s=act(s,first,'nominate',[target],12);
assert.equal(s.nominees[0],target);
assert.equal(s.phase,'nomination');
const second=s.nominationOrder[s.nominationIndex];
s=act(s,second,'skip_nomination',[],13);
assert.equal(s.nominations[second],null);
while(s.phase==='nomination')s=advance(s,s.deadline+1,()=>0);
assert.equal(s.phase,'voting');
view=publicView(s,target);
assert.deepEqual(view.nomination.nominees,[target]);
assert.throws(()=>act(s,target,'vote',[target],s.deadline-1),/Недопустимая/);
const voter=s.players.find(p=>p.alive&&p.id!==target);
s=act(s,voter.id,'vote',[target],s.deadline-1);
assert.equal(s.votes[voter.id],target);

let none=advance(game(),11);
while(none.phase==='nomination')none=advance(none,none.deadline+1,()=>0);
assert.equal(none.phase,'result');
assert.ok(none.events.some(e=>e.text.includes('Никого не выдвинули')));

for(const hosted of [false,true])for(const open of [false,true]){
 const mode=game({hosted,open});
 assert.equal(mode.settings.gameMode,hosted?'hosted':'auto');
 assert.equal(mode.settings.cameraMode,open?'open':'hidden');
 mode.phase='night';mode.wakeIndex=mode.wakeOrder.indexOf('doctor');
 const actor=mode.players.find(p=>p.role==='doctor');
 const policy=mediaPolicy(mode,actor.id);
 if(hosted){assert.equal(policy.subscribe,true);assert.equal(policy.room,mediaPolicy(mode,'host').room);}
 if(open)assert.ok(policy.videoRoom);else assert.equal(policy.videoRoom,null);
}

let manual=game({hosted:true});
manual=control(manual,'host','nomination',manual.epoch,null,12);
assert.equal(manual.phase,'nomination');
manual=control(manual,'host','voting',manual.epoch,null,13);
assert.ok(['voting','result'].includes(manual.phase));

console.log('Nomination phase passed: timed personal turns, nominate/skip, candidate-only voting, no-candidate skip, host controls and all four mode combinations.');
