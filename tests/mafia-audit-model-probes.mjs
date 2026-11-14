// Diagnostic probes for the unmodified September release. These assert observed
// defects, not desired behavior. Remove/convert assertions when defects are fixed.
import assert from 'node:assert/strict';
import {createGame,joinGame,startGame,act,advance,publicView,moderate,DEFAULTS} from '../supabase/functions/mafia/engine.mjs';
let s=createGame('ABC234','p0','Owner','media');
for(let i=1;i<6;i++)s=joinGame(s,'p'+i,'Player'+i);
s.settings={...DEFAULTS,counts:{mafia:1,doctor:1,sheriff:1}};
s.players.forEach(p=>p.ready=true);
s=startGame(s,'p0',Object.fromEntries(s.players.map(p=>[p.id,true])),1000,()=>.7);
assert.equal(s.phase,'night');
assert.equal(s.nightStartsAt,6000);assert.equal(publicView(s,'p1').wake.key,'pause');assert.deepEqual(publicView(s,'p1').me.actions,[]);s=advance(s,6000);
console.log('PASS server-owned initial preparation pause.');
s.players.forEach((p,i)=>p.role=['citizen','mafia','doctor','sheriff','citizen','citizen'][i]);
s.wakeOrder=['doctor','clan','sheriff'];s.wakeIndex=1;
s=act(s,'p1','mafia_vote',['p4'],1001);
const view=publicView(s,'p0');
assert.equal(view.hostPanel.fullAccess,false);
assert.equal(view.hostPanel.players.find(p=>p.id==='p1').hasAction,false);
assert.equal(view.players.some(p=>'role' in p),false);
console.log('PASS automatic owner cannot infer night actors.');
s.settings.gameMode='hosted';s.players[0].role=null;s.players[0].moderator=true;
s.wakeIndex=0;s.night={actions:{},mafiaVotes:{},bonusVotes:{}};
s=act(s,'p2','heal',['p4'],1002);
s=moderate(s,'p0','role','p2','citizen',1003);
assert.equal(s.players.find(p=>p.id==='p2').role,'citizen');
assert.equal(s.night.actions.p2,undefined);
console.log('PASS changing role clears incompatible current choices.');
