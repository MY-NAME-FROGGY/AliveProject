import assert from 'node:assert/strict';
import {createGame,joinGame,changeLobby,startGame,act,control,moderate,undoHost,liveSettings,announce,publicView,mediaPolicy,advance,DEFAULTS} from '../supabase/functions/mafia/engine.mjs';

let s=createGame('MASTER','host','Ведущий','media',0);
for(let i=1;i<=5;i++)s=joinGame(s,'p'+i,'Игрок '+i);
s=changeLobby(s,'host','settings',{...DEFAULTS,gameMode:'hosted',counts:{mafia:1,doctor:1,sheriff:1}});
for(const p of s.players.filter(p=>p.id!=='host'))s=changeLobby(s,p.id,'ready',{ready:true},true);
s=startGame(s,'host',Object.fromEntries(s.players.map(p=>[p.id,true])),1,()=>.7);
const citizen=s.players.find(p=>p.role==='citizen'),doctor=s.players.find(p=>p.role==='doctor');

assert.throws(()=>moderate(s,citizen.id,'mute',doctor.id),/владельцу|ведущему/);
s=moderate(s,'host','mute',citizen.id,null,2);
assert.equal(mediaPolicy(s,citizen.id).audio,false);
assert.equal(publicView(s,citizen.id).hostPanel,null);
assert.equal(publicView(s,'host').hostPanel.players.find(p=>p.id===citizen.id).hostMuted,true);
let undoId=s.undo.eventId;
assert.throws(()=>undoHost(s,citizen.id,undoId),/ведущему|отменить/);
s=undoHost(s,'host',undoId,3);
assert.equal(s.players.find(p=>p.id===citizen.id).hostMuted,undefined);
assert.equal(s.undo,undefined);
assert.match(s.events.at(-1).text,/вспять/);

s=moderate(s,'host','role',citizen.id,'jester',4);
undoId=s.undo.eventId;
assert.equal(publicView(s,citizen.id).events.some(e=>e.text.includes('исправил роль')),false);
s=undoHost(s,'host',undoId,5);
assert.equal(s.players.find(p=>p.id===citizen.id).role,'citizen');

s=control(s,'host','timer',s.epoch,45,6);
undoId=s.undo.eventId;
const previous=s.undo.before.deadline;
s=undoHost(s,'host',undoId,7);
assert.equal(s.deadline,previous);

s=liveSettings(s,'host',{daySeconds:240,voteSeconds:60,nightSeconds:40,bonusSeconds:25});
undoId=s.undo.eventId;
assert.equal(s.settings.daySeconds,240);
s=undoHost(s,'host',undoId,8);
assert.equal(s.settings.daySeconds,DEFAULTS.daySeconds);
assert.throws(()=>liveSettings(s,citizen.id,{daySeconds:240,voteSeconds:60,nightSeconds:40,bonusSeconds:25}),/владельцу|ведущему/);

s=announce(s,'host','Личное сообщение',citizen.id);
assert.equal(publicView(s,citizen.id).events.at(-1).text,'Ведущий: Личное сообщение');
assert.equal(publicView(s,doctor.id).events.some(e=>e.text.includes('Личное сообщение')),false);

s.wakeOrder=['doctor'];s.wakeIndex=0;s.deadline=100000;
s=act(s,doctor.id,'heal',[citizen.id],9);
s=moderate(s,'host','clear_action',doctor.id,null,10);
assert.equal(s.night.actions[doctor.id],undefined);
undoId=s.undo.eventId;
s=undoHost(s,'host',undoId,11);
assert.equal(s.night.actions[doctor.id].kind,'heal');
s=moderate(s,'host','clear_action',doctor.id,null,12);
undoId=s.undo.eventId;
s=act(s,doctor.id,'heal',[citizen.id],13);
assert.throws(()=>undoHost(s,'host',undoId,14),/нельзя отменить/);

s=control(s,'host','timer',s.epoch,5,15);
undoId=s.undo.eventId;
s=advance(s,21000,()=>0);
assert.throws(()=>undoHost(s,'host',undoId,21001),/нельзя отменить/);
console.log('Mafia master controls, privacy and conditional undo passed.');
