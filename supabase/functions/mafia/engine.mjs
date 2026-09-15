// Pure authoritative game rules. Only publicView() may be returned to a player.
export const ROLES = {
 citizen: ['Мирний мешканець','town','red','Дневное обсуждение и голосование.'],
 sheriff: ['Комісар (Шериф)','town','red','Ночью узнаёт красную или чёрную сторону цели.'],
 doctor: ['Лікар','town','red','Спасает от выстрелов. Нельзя лечить одну цель две ночи подряд.'],
 detective: ['Детектив','town','red','За ночь выбирает проверку стороны или выстрел.'],
 judge: ['Суддя','town','red','Тайно защищает от следующего дневного изгнания.'],
 sleepwalker: ['Лунатик','town','red','Видит ночную группу, изображая мафию. Его голос не определяет выстрел. Не раскрывайте группу и свою роль.'],
 mistress: ['Коханка','mafia_ally','red','Даёт публичное алиби на следующий день. Играет за мафию. Нельзя себя и одну цель подряд.'],
 journalist: ['Журналіст','town','red','Сравнивает стороны двух игроков, не узнавая их роли.'],
 bodyguard: ['Охоронець','town','red','Принимает выстрел вместо выбранного другого игрока.'],
 mason: ['Масонське братство','town','red','С первой ночи знает других масонов. Только для состава больше 16 игроков.'],
 veteran: ['Ветеран','town','red','Одна тревога за игру: защищается от выстрелов и стреляет в посетителей.'],
 priest: ['Священник','town','red','Узнаёт роль погибшего ночью, но не изгнанного днём.'],
 tracker: ['Слідопит','town','red','Узнаёт номер одного посетителя выбранного игрока этой ночью.'],
 mafia: ['Мафія','mafia','black','Вместе с кланом выбирает одну жертву ночью.'],
 don: ['Дон Мафії','mafia','black','Решающий голос клана. Отдельно проверяет, является ли цель шерифом или детективом.'],
 godfather: ['Хрещений батько','mafia','black','Лишает цели речи и голоса на следующий день. Нельзя себя и одну цель подряд.'],
 robber: ['Грабіжник','mafia','black','Блокирует способности цели этой ночью. Нельзя себя и одну цель подряд.'],
 informer: ['Інформатор','mafia','black','Проверки выбранного игрока этой ночью показывают чёрную сторону.'],
 maniac: ['Маніяк','solo','red','Стреляет ночью. Побеждает, если жив после гибели последней мафии.'],
 ripper: ['Скажений Збоченець (Потрошитель)','solo','red','Выстрел убивает любую роль, кроме обычного мирного жителя. Побеждает один на один с обычным мирным.'],
 jester: ['Шут','solo','red','Побеждает, если действительно изгнан дневным голосованием.'],
 arsonist: ['Підпалювач','solo','red','Помечает цель или поджигает всех ранее помеченных. Побеждает один на один с мирным.']
};
export const ACTIONS = {
 sheriff:['check'], doctor:['heal'], detective:['check','shoot'], judge:['pardon'],
 mistress:['alibi'], journalist:['compare'], bodyguard:['guard'], veteran:['alert'],
 priest:['autopsy'], tracker:['track'], don:['find_sheriff'], godfather:['silence'],
 robber:['block'], informer:['frame'], maniac:['shoot'], ripper:['shoot'], arsonist:['mark','ignite']
};
export const ACTION_LABELS={mafia_vote:'Выбрать жертву мафии',bonus_vote:'Дополнительный выстрел',check:'Проверить сторону',heal:'Лечить',shoot:'Выстрелить',pardon:'Защитить от изгнания',alibi:'Дать алиби',compare:'Сравнить стороны',guard:'Защитить собой',alert:'Объявить тревогу',autopsy:'Узнать роль погибшего',track:'Проследить за посетителями',find_sheriff:'Найти шерифа или детектива',silence:'Лишить речи и голоса',block:'Заблокировать способность',frame:'Подставить',mark:'Пометить',ignite:'Поджечь'};
export const DEFAULTS={daySeconds:180,voteSeconds:45,nightSeconds:60,bonusSeconds:20,resultSeconds:10,soloLastAlive:true,counts:{mafia:2,sheriff:1,doctor:1},maxPlayers:24};
const fail=s=>{throw Error(s);};
const alive=s=>s.players.filter(p=>p.alive);
const black=p=>ROLES[p.role]?.[1]==='mafia';
const nightGroup=p=>black(p)||p.role==='sleepwalker';
const member=(s,id)=>s.players.find(p=>p.id===id)||fail('Вы не участник комнаты');
const event=(s,text)=>{s.events.push({id:++s.eventSeq,round:s.round,text});s.events=s.events.slice(-150);};
const inbox=(p,text,round)=>{p.inbox.push({round,text});p.inbox=p.inbox.slice(-100);};
const clone=s=>structuredClone(s);
export function createGame(code,id,name,mediaId,now=Date.now()){
 if(!name?.trim()||name.trim().length>20)fail('Имя: от 1 до 20 символов');
 return {code,mediaId,host:id,phase:'lobby',round:0,epoch:0,deadline:null,paused:false,settings:clone(DEFAULTS),players:[{id,name:name.trim(),seat:1,alive:true,ready:false,role:null,inbox:[],memory:{}}],events:[],eventSeq:0,night:{},votes:{},createdAt:now};
}
export function validateSettings(settings,players=null){
 const out={...DEFAULTS,...settings,counts:{...settings.counts}};
 for(const [key,min,max] of [['daySeconds',30,900],['voteSeconds',15,180],['nightSeconds',30,180],['bonusSeconds',10,60],['resultSeconds',5,30],['maxPlayers',5,24]])if(!Number.isInteger(out[key])||out[key]<min||out[key]>max)fail('Неверная настройка: '+key);
 for(const [role,n] of Object.entries(out.counts)){if(!Object.hasOwn(ROLES,role)||!Number.isInteger(n)||n<0||n>(['citizen','mafia','mason'].includes(role)?24:1))fail('Неверное количество роли: '+role);}
 if(players!==null){const sum=Object.values(out.counts).reduce((a,b)=>a+b,0);const nblack=Object.entries(out.counts).filter(([r])=>ROLES[r][1]==='mafia').reduce((n,[,c])=>n+c,0);
  if(players<5||sum>players||nblack<1||nblack>=players/2)fail('Нужно минимум 5 игроков, минимум один мафиози и меньше половины чёрных ролей');
  if(out.counts.mason&&(players<=16||out.counts.mason<2))fail('Масоны: минимум двое и больше 16 участников');
 }
 out.soloLastAlive=out.soloLastAlive!==false;return out;
}
export function joinGame(original,id,name){const s=clone(original);if(s.players.some(p=>p.id===id))return s;if(s.phase!=='lobby')fail('В «Мафию» новые игроки входят до раздачи ролей');if(s.players.length>=s.settings.maxPlayers)fail('Комната заполнена');if(!name?.trim()||name.trim().length>20)fail('Имя: от 1 до 20 символов');s.players.push({id,name:name.trim(),seat:Math.max(0,...s.players.map(p=>p.seat))+1,alive:true,ready:false,role:null,inbox:[],memory:{}});if(!s.host)s.host=id;event(s,name.trim()+' присоединился(ась)');return s;}
function phase(s,next,now){s.phase=next;s.epoch++;s.phaseStarted=now;s.cameraGraceUntil=now+20000;s.deadline=next==='finished'||next==='lobby'?null:now+s.settings[{night:'nightSeconds',night_bonus:'bonusSeconds',day:'daySeconds',voting:'voteSeconds',result:'resultSeconds'}[next]]*1000;}
export function startGame(original,id,cameras,now=Date.now(),random=Math.random){const s=clone(original);if(s.host!==id||s.phase!=='lobby')fail('Начать может создатель комнаты в лобби');validateSettings(s.settings,s.players.length);if(s.players.some(p=>!p.ready||!cameras[p.id]))fail('Все игроки должны быть готовы и подключить камеру');
 const deck=Object.entries(s.settings.counts).flatMap(([r,n])=>Array(n).fill(r));while(deck.length<s.players.length)deck.push('citizen');
 for(let i=deck.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[deck[i],deck[j]]=[deck[j],deck[i]];}
 s.players.forEach((p,i)=>{p.role=deck[i];p.alive=true;p.memory={};p.inbox=[];});s.round=1;s.night={actions:{},mafiaVotes:{},bonusVotes:{}};phase(s,'night',now);event(s,'Город засыпает. Первая ночь.');
 for(const p of s.players.filter(p=>p.role==='mason'))inbox(p,'Масоны: '+s.players.filter(x=>x.role==='mason'&&x.id!==p.id).map(x=>'№'+x.seat+' '+x.name).join(', '),s.round);
 return s;
}
export function choicesFor(s,id){const p=member(s,id);if(!p.alive||s.paused)return [];
 if(s.phase==='night_bonus')return s.pending?.bonusAllowed&&black(p)?['bonus_vote']:[];
 if(s.phase!=='night')return [];
 return [...(nightGroup(p)?['mafia_vote']:[]),...(ACTIONS[p.role]||[]).filter(k=>k!=='alert'||!p.memory.alertUsed)];
}
export function act(original,id,kind,targets=[],now=Date.now()){
 const s=clone(original),p=member(s,id);if(!p.alive||s.paused||now>=s.deadline)fail('Действие сейчас недоступно');
 if(kind==='vote'){
  if(s.phase!=='voting'||p.silencedRound===s.round)fail('Голосование недоступно');
  if(Object.hasOwn(s.votes,id))fail('Голос уже принят');
  if(targets.length>1)fail('Нужна одна цель или воздержание');
  if(targets.length){const t=member(s,targets[0]);if(!t.alive||t.id===id||t.alibiRound===s.round)fail('Недопустимая цель');}
  s.votes[id]=targets[0]||null;return s;
 }
 if(!choicesFor(s,id).includes(kind))fail('Эта способность вам недоступна');
 const n=['alert','ignite'].includes(kind)?0:kind==='compare'?2:1;
 if(targets.length!==n||new Set(targets).size!==n)fail('Неверное количество целей');
 for(const tid of targets){const t=member(s,tid);if(kind==='autopsy'?t.alive||t.deathCause!=='night':!t.alive)fail('Недопустимая цель');
  if(tid===id&&!['heal','pardon'].includes(kind))fail('Нельзя выбирать себя');
  if(['heal','alibi','silence','block'].includes(kind)&&p.memory.lastRound===s.round-1&&p.memory.lastTarget===tid)fail('Нельзя выбирать одну цель две ночи подряд');
 }
 if(kind==='ignite'&&!(p.memory.marked||[]).length)fail('Пока нет помеченных целей');
 if(kind==='mafia_vote'||kind==='bonus_vote'){s.night[kind==='mafia_vote'?'mafiaVotes':'bonusVotes'][id]=targets[0];return s;}
 s.night.actions[id]={kind,targets};return s;
}
function mafiaShot(s,ballots,blocked=new Set()){
 const voters=alive(s).filter(p=>black(p)&&!blocked.has(p.id));const valid=voters.filter(p=>ballots[p.id]&&s.players.some(t=>t.id===ballots[p.id]&&t.alive));
 const don=valid.find(p=>p.role==='don');if(don)return {actor:don.id,target:ballots[don.id]};
 const counts={};for(const p of valid)counts[ballots[p.id]]=(counts[ballots[p.id]]||0)+1;
 const ranked=Object.entries(counts).sort((a,b)=>b[1]-a[1]);if(!ranked.length||ranked[1]?.[1]===ranked[0][1])return null;
 return {actor:valid.find(p=>ballots[p.id]===ranked[0][0]).id,target:ranked[0][0]};
}
function resolveNight(s,random=Math.random){
 const actions=s.night.actions,blocked=new Set(),framed=new Set(),healed=new Set(),alert=new Set(),guards=new Map(),visits=[],shots=[],dead=new Set();
 const addVisit=(actor,target)=>visits.push({actor,target});
 // Robber acts first. A block suppresses both the individual action and clan vote.
 for(const p of alive(s).filter(p=>p.role==='robber')){const a=actions[p.id];if(a?.kind==='block'){blocked.add(a.targets[0]);addVisit(p.id,a.targets[0]);}}
 const valid=alive(s).filter(p=>!blocked.has(p.id)&&actions[p.id]);
 for(const p of valid){const a=actions[p.id],t=a.targets[0];if(a.kind==='alert'){alert.add(p.id);p.memory.alertUsed=true;}if(!['alert','ignite','autopsy','block'].includes(a.kind))for(const target of a.targets)addVisit(p.id,target);
  if(['heal','alibi','silence','block'].includes(a.kind)){p.memory.lastTarget=t;p.memory.lastRound=s.round;}
  if(a.kind==='heal')healed.add(t);
  if(a.kind==='guard'){if(!guards.has(t))guards.set(t,[]);guards.get(t).push(p.id);}
  if(a.kind==='frame')framed.add(t);
  if(a.kind==='pardon')member(s,t).pardonRound=s.round;
  if(a.kind==='alibi')member(s,t).alibiRound=s.round;
  if(a.kind==='silence')member(s,t).silencedRound=s.round;
  if(a.kind==='mark')p.memory.marked=[...new Set([...(p.memory.marked||[]),t])];
  if(a.kind==='ignite'){for(const tid of p.memory.marked||[])if(member(s,tid).alive)dead.add(tid);p.memory.marked=[];}
  if(a.kind==='shoot'&&(p.role!=='ripper'||member(s,t).role!=='citizen'))shots.push({actor:p.id,target:t});
 }
 const mafia=mafiaShot(s,s.night.mafiaVotes,blocked);if(mafia){shots.push(mafia);addVisit(mafia.actor,mafia.target);}
 for(const v of visits)if(alert.has(v.target)&&v.actor!==v.target)shots.push({actor:v.target,target:v.actor,retaliation:true});
 function shoot(target){if(alert.has(target)||healed.has(target))return;const guard=(guards.get(target)||[]).find(id=>!dead.has(id));if(guard){if(!healed.has(guard)&&!alert.has(guard))dead.add(guard);}else dead.add(target);}
 for(const shot of shots)shoot(shot.target);
 const color=t=>framed.has(t.id)?'black':ROLES[t.role][2];
 const messages=[];
 for(const p of valid){const a=actions[p.id],t=a.targets[0]?member(s,a.targets[0]):null;let text;
  if(a.kind==='check')text='Проверка №'+t.seat+': '+(color(t)==='black'?'чёрная сторона':'красная сторона');
  if(a.kind==='find_sheriff')text='Проверка №'+t.seat+': '+(['sheriff','detective'].includes(t.role)?'шериф или детектив':'не шериф и не детектив');
  if(a.kind==='compare')text='№'+a.targets.map(id=>member(s,id).seat).join(' и №')+': '+(color(member(s,a.targets[0]))===color(member(s,a.targets[1]))?'одинаковые стороны':'разные стороны');
  if(a.kind==='autopsy')text='Роль погибшего №'+t.seat+': '+ROLES[t.role][0];
  if(a.kind==='track'){const others=[...new Set(visits.filter(v=>v.target===t.id&&v.actor!==p.id).map(v=>v.actor))];text='У №'+t.seat+': '+(others.length?'замечен посетитель №'+member(s,others[Math.floor(random()*others.length)]).seat:'посетителей не замечено');}
  if(text)messages.push({id:p.id,text});
 }
 // Do not publish deaths or investigative results until the fixed night ends.
 return {dead:[...dead],messages,blocked:[...blocked],healed:[...healed],alert:[...alert],guards:Object.fromEntries(guards),bonusAllowed:!!mafia&&member(s,mafia.target).role==='sleepwalker'&&dead.has(mafia.target),mafia,visits};
}
function finish(s,winner,ids,text,now){s.winner={side:winner,ids,text};phase(s,'finished',now);event(s,text);}
function checkWin(s,now){const ps=alive(s),mafia=ps.filter(black),maniac=ps.find(p=>p.role==='maniac');
 if(!ps.length){finish(s,'draw',[],'В живых никого не осталось. Ничья.',now);return true;}
 if(!mafia.length&&maniac){finish(s,'maniac',[maniac.id],'Маньяк пережил всю мафию и победил.',now);return true;}
 for(const p of ps.filter(p=>['ripper','arsonist'].includes(p.role))){if((ps.length===1&&s.settings.soloLastAlive)||(ps.length===2&&ps.some(t=>t.id!==p.id&&(p.role==='ripper'?t.role==='citizen':ROLES[t.role][1]==='town')))){finish(s,p.role,[p.id],ROLES[p.role][0]+' победил(а).',now);return true;}}
 if(mafia.length>=ps.length-mafia.length){finish(s,'mafia',s.players.filter(p=>['mafia','mafia_ally'].includes(ROLES[p.role][1])).map(p=>p.id),'Мафия получила численное преимущество и победила.',now);return true;}
 if(!mafia.length&&!ps.some(p=>['maniac','ripper','arsonist'].includes(p.role))){finish(s,'town',s.players.filter(p=>ROLES[p.role][1]==='town').map(p=>p.id),'Мирный город победил.',now);return true;}return false;
}
export function advance(original,now=Date.now(),random=Math.random){const s=clone(original);if(s.paused||!s.deadline||now<s.deadline)return s;
 if(s.phase==='night'){s.pending=resolveNight(s,random);phase(s,'night_bonus',now);return s;}
 if(s.phase==='night_bonus'){
  const result=s.pending;
  if(result.bonusAllowed){const shot=mafiaShot(s,s.night.bonusVotes,new Set([...result.blocked,...result.dead]));if(shot){const t=shot.target;
   if(result.alert.includes(t)){if(!result.healed.includes(shot.actor)&&!result.alert.includes(shot.actor))result.dead.push(shot.actor);}
   else if(!result.healed.includes(t)){const guard=(result.guards[t]||[]).find(id=>!result.dead.includes(id));if(guard){if(!result.healed.includes(guard))result.dead.push(guard);}else result.dead.push(t);}
  }}
  for(const id of new Set(result.dead)){const p=member(s,id);p.alive=false;p.deathCause='night';p.deathRound=s.round;}
  for(const m of result.messages)inbox(member(s,m.id),m.text,s.round);
  const lost=[...new Set(result.dead)].map(id=>member(s,id).name);event(s,lost.length?'Ночью погибли: '+lost.join(', ')+'.':'Ночь прошла без погибших.');
  for(const p of alive(s)){if(p.alibiRound===s.round)event(s,p.name+': на сегодня есть алиби.');if(p.silencedRound===s.round)event(s,p.name+': сегодня не участвует в обсуждении и голосовании.');}
  delete s.pending;if(!checkWin(s,now)){phase(s,'day',now);s.votes={};}return s;
 }
 if(s.phase==='day'){phase(s,'voting',now);s.votes={};event(s,'Началось дневное голосование.');return s;}
 if(s.phase==='voting'){
  const counts={};for(const [id,target] of Object.entries(s.votes)){const p=member(s,id),t=target?s.players.find(x=>x.id===target):null;if(p.alive&&p.silencedRound!==s.round&&t?.alive&&t.alibiRound!==s.round)counts[target]=(counts[target]||0)+1;}
  const ranked=Object.entries(counts).sort((a,b)=>b[1]-a[1]);s.lastTally=Object.entries(counts).map(([id,count])=>({id,count}));
  if(!ranked.length||ranked[1]?.[1]===ranked[0][1])event(s,'Нет единственного лидера голосования. Никто не изгнан.');
  else{const p=member(s,ranked[0][0]);if(p.pardonRound===s.round)event(s,'Судья оправдал(а) '+p.name+'. Игрок остаётся.');else{p.alive=false;p.deathCause='day';p.deathRound=s.round;event(s,p.name+' изгнан(а) голосованием.');if(p.role==='jester'){finish(s,'jester',[p.id],'Город изгнал Шута. Шут победил, партия завершена.',now);return s;}}}
  if(!checkWin(s,now))phase(s,'result',now);return s;
 }
 if(s.phase==='result'){s.round++;s.night={actions:{},mafiaVotes:{},bonusVotes:{}};delete s.lastTally;phase(s,'night',now);event(s,'Город засыпает. Ночь '+s.round+'.');}return s;
}
export function changeLobby(original,id,command,data={},camera=false){const s=clone(original),p=member(s,id);if(s.phase!=='lobby')fail('Настройки состава доступны в лобби');
 if(command==='ready'){if(data.ready&&!camera)fail('Для готовности подключите камеру');p.ready=!!data.ready;}
 else if(command==='settings'){if(s.host!==id)fail('Только создатель комнаты');s.settings=validateSettings(data);if(s.settings.maxPlayers<s.players.length)fail('Лимит не может быть меньше текущего числа игроков');s.players.forEach(p=>p.ready=false);}
 else if(command==='leave'){s.players=s.players.filter(p=>p.id!==id);if(s.host===id)s.host=s.players[0]?.id||null;}
 return s;
}
export function pause(original,id,paused,now=Date.now()){const s=clone(original);if(s.host!==id||['lobby','finished'].includes(s.phase))fail('Пауза недоступна');delete s.cameraPaused;if(s.paused===paused){if(paused)s.pauseReason='Создатель поставил партию на паузу';return s;}if(paused){s.remaining=Math.max(0,s.deadline-now);s.paused=true;s.pauseReason='Создатель поставил партию на паузу';}else{s.deadline=now+s.remaining;s.paused=false;delete s.pauseReason;}return s;}
export function mediaPolicy(s,id){const p=member(s,id);let group='table',audio=true,subscribe=true;
 if(!p.alive&&s.phase!=='finished'){group='observer-'+p.id;audio=false;subscribe=false;}
 else if(s.phase==='night'||s.phase==='night_bonus'){group=nightGroup(p)?'night-team':'private-'+p.id;audio=nightGroup(p);subscribe=nightGroup(p);}
 else if(p.silencedRound===s.round&&s.phase!=='finished')audio=false;
 return {room:s.mediaId+'-'+s.epoch+'-'+group,identity:id,camera:true,audio,subscribe,epoch:s.epoch};
}
export function publicView(s,id){const p=member(s,id),night=s.phase==='night'||s.phase==='night_bonus';
 const peers=p.alive&&night&&nightGroup(p)?s.players.filter(t=>t.alive&&nightGroup(t)).map(t=>t.id):[];
 // Explicit allowlist: never serialize raw players, night state, visits, or pending results.
 return {code:s.code,host:s.host,phase:night?'night':s.phase,round:s.round,deadline:night?(s.phase==='night'?s.deadline+s.settings.bonusSeconds*1000:s.deadline):s.deadline,paused:s.paused,pauseReason:s.pauseReason||null,epoch:s.epoch,settings:s.settings,winner:s.winner||null,
  players:s.players.map(t=>({id:t.id,name:t.name,seat:t.seat,alive:t.alive,ready:t.ready,alibi:!night&&t.alibiRound===s.round,silenced:!night&&t.silencedRound===s.round,...(s.phase==='finished'?{role:t.role}:{})})),
  me:{id,role:p.role,inbox:p.inbox,alive:p.alive,actions:choicesFor(s,id),submitted:night?(s.night.actions?.[id]||null):null,mafiaVote:night&&nightGroup(p)?s.night.mafiaVotes?.[id]||null:null,voted:Object.hasOwn(s.votes,id),marked:p.role==='arsonist'?p.memory.marked||[]:[],nightPeers:peers},
  events:s.events,lastTally:s.phase==='result'||s.phase==='finished'?s.lastTally||[]:[],media:mediaPolicy(s,id)};
}
