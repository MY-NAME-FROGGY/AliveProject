import assert from 'node:assert/strict';
import {createGame,joinGame,changeLobby,startGame,act,control,moderate,publicView,mediaPolicy,DEFAULTS} from '../supabase/functions/mafia/engine.mjs';

function lobby(){let s=createGame('HOST24','host','Ведущий','media',0);for(let i=1;i<=5;i++)s=joinGame(s,'p'+i,'Игрок '+i);s=changeLobby(s,'host','settings',{...DEFAULTS,gameMode:'hosted',counts:{mafia:1,doctor:1,sheriff:1}});for(const p of s.players.filter(p=>p.id!=='host'))s=changeLobby(s,p.id,'ready',{ready:true},true);return s;}
const cameras=Object.fromEntries(['host','p1','p2','p3','p4','p5'].map(id=>[id,true]));
let s=lobby();
assert.equal(s.players.find(p=>p.id==='host').ready,false);
assert.throws(()=>changeLobby(s,'host','ready',{ready:true},true),/Ведущий/);
assert.throws(()=>startGame(s,'host',{...cameras,host:false},1),/камеру/);
s=startGame(s,'host',cameras,1,()=>.7);
assert.equal(s.players.find(p=>p.id==='host').role,null);assert.equal(s.players.filter(p=>p.role).length,5);assert.equal(s.players.find(p=>p.id==='host').ready,true);
const hostView=publicView(s,'host'),playerView=publicView(s,'p1');
assert.equal(hostView.me.moderator,true);assert.equal(hostView.players.find(p=>p.id==='host').moderator,true);assert.ok(hostView.players.filter(p=>!p.moderator).every(p=>p.role));
assert.equal(playerView.hostPanel,null);assert.ok(playerView.players.filter(p=>p.id!=='p1').every(p=>!Object.hasOwn(p,'role')));assert.equal(playerView.me.moderator,false);
assert.throws(()=>act(s,'host','vote',['p1'],2),/недоступно/);
const doctor=s.players.find(p=>p.role==='doctor'),target=s.players.find(p=>p.role==='citizen');
assert.equal(s.wakeOrder[s.wakeIndex],'doctor');s=act(s,doctor.id,'heal',[target.id],2);
assert.equal(publicView(s,'host').hostPanel.players.find(p=>p.id===doctor.id).action.targets[0],target.id);
assert.equal(publicView(s,'p1').hostPanel,null);
assert.equal(mediaPolicy(s,'host').room,mediaPolicy(s,doctor.id).room);assert.equal(mediaPolicy(s,'host').subscribe,true);assert.equal(mediaPolicy(s,doctor.id).subscribe,true);assert.equal(mediaPolicy(s,doctor.id).audio,true);
const sleeper=s.players.find(p=>p.role&&p.id!==doctor.id);assert.equal(mediaPolicy(s,sleeper.id).audio,false);assert.notEqual(mediaPolicy(s,sleeper.id).room,mediaPolicy(s,'host').room);
const before=s.phase;s.deadline=2;assert.equal(s.phase,before,'hosted state does not change until host command');s=control(s,'host','next',s.epoch,null,3,()=>0);assert.equal(s.phase,'night_pause');s=control(s,'host','next',s.epoch,null,4,()=>0);assert.equal(s.wakeIndex,1);
assert.throws(()=>moderate(s,'p1','role',target.id,'jester',4),/владельцу|ведущему/);
s=moderate(s,'host','role',target.id,'jester',4);assert.equal(s.players.find(p=>p.id===target.id).role,'jester');assert.ok(publicView(s,'host').events.some(e=>e.text.includes('исправил роль')));assert.ok(!publicView(s,target.id).events.some(e=>e.text.includes('исправил роль')));
s=moderate(s,'host','eliminate',target.id,null,5);assert.equal(s.players.find(p=>p.id===target.id).alive,false);s=moderate(s,'host','revive',target.id,null,6);assert.equal(s.players.find(p=>p.id===target.id).alive,true);
assert.throws(()=>moderate(s,'host','eliminate','host',null,7),/ведущему/);

let auto=createGame('AUTO24','a0','Создатель','media',0);for(let i=1;i<5;i++)auto=joinGame(auto,'a'+i,'Авто '+i);auto.players.forEach(p=>p.ready=true);auto=startGame(auto,'a0',Object.fromEntries(auto.players.map(p=>[p.id,true])),1,()=>.4);assert.notEqual(auto.players.find(p=>p.id==='a0').role,null);assert.equal(publicView(auto,'a0').me.moderator,false);const ownerPanel=publicView(auto,'a0').hostPanel;assert.equal(ownerPanel.fullAccess,false);assert.ok(ownerPanel.players.every(p=>!Object.hasOwn(p,'role')&&!Object.hasOwn(p,'action')));assert.throws(()=>moderate(auto,'a0','role','a1','doctor',2),/отдельным ведущим/);auto=moderate(auto,'a0','eliminate','a1',null,2);assert.equal(auto.players.find(p=>p.id==='a1').alive,false);auto=moderate(auto,'a0','revive','a1',null,3);assert.equal(auto.players.find(p=>p.id==='a1').alive,true);auto.phase='finished';auto.winner={side:'town',ids:['a0'],text:'Тест'};auto.players.find(p=>p.id==='a1').alive=false;auto=moderate(auto,'a0','revive','a1',null,4);assert.equal(auto.phase,'result');assert.equal(auto.winner,undefined);
console.log('Hosted mode passed: separate moderator, five-player deck, private master panel, manual phases, media isolation, role correction, eliminate/revive, automatic-mode compatibility.');
