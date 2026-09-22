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
export const WAKE_ORDER=['robber','veteran','doctor','bodyguard','judge','mistress','informer','godfather','clan','don','maniac','ripper','arsonist','sheriff','detective','journalist','priest','tracker','mason'];
export const DEFAULTS={daySeconds:180,voteSeconds:45,nightSeconds:30,bonusSeconds:20,resultSeconds:10,soloLastAlive:true,cameraMode:'hidden',gameMode:'auto',counts:{mafia:2,sheriff:1,doctor:1},maxPlayers:24};
const fail=s=>{throw Error(s);};
const isModerator=(s,p)=>s.settings.gameMode==='hosted'&&p.id===s.host;
const contestants=s=>s.players.filter(p=>!isModerator(s,p));
const alive=s=>s.players.filter(p=>p.alive&&!isModerator(s,p));
const renumberSeats=s=>{const ordered=[...s.players].sort((a,b)=>(a.seat??999)-(b.seat??999));let seat=1;for(const p of ordered){if(isModerator(s,p))p.seat=0;else p.seat=seat++;}s.players=ordered;return s;};
const black=p=>ROLES[p.role]?.[1]==='mafia';
const nightGroup=p=>black(p)||p.role==='sleepwalker';
const member=(s,id)=>s.players.find(p=>p.id===id)||fail('Вы не участник комнаты');
const wakePlan=s=>WAKE_ORDER.filter(role=>role==='clan'?contestants(s).some(nightGroup):contestants(s).some(p=>p.role===role));
const event=(s,text,audience=null)=>{s.events.push({id:++s.eventSeq,round:s.round,text,audience});s.events=s.events.slice(-1000);};
const inbox=(p,text,round)=>{p.inbox.push({round,text});p.inbox=p.inbox.slice(-100);};
const clone=s=>structuredClone(s);
export function createGame(code,id,name,mediaId,now=Date.now()){
 if(!name?.trim()||name.trim().length>20)fail('Имя: от 1 до 20 символов');
 return {code,mediaId,host:id,phase:'lobby',round:0,epoch:0,deadline:null,paused:false,settings:clone(DEFAULTS),players:[{id,name:name.trim(),seat:1,alive:true,ready:false,role:null,inbox:[],memory:{}}],events:[],eventSeq:0,night:{},votes:{},createdAt:now};
}
export function validateSettings(settings,players=null){
 const out={...DEFAULTS,...settings,counts:{...settings.counts}};
 if(!['auto','hosted'].includes(out.gameMode))fail('Неверный режим игры');
 for(const [key,min,max] of [['daySeconds',30,900],['voteSeconds',15,180],['nightSeconds',15,180],['bonusSeconds',10,60],['resultSeconds',5,30],['maxPlayers',5,24]])if(!Number.isInteger(out[key])||out[key]<min||out[key]>max)fail('Неверная настройка: '+key);
 for(const [role,n] of Object.entries(out.counts)){if(!Object.hasOwn(ROLES,role)||!Number.isInteger(n)||n<0||n>(['citizen','mafia','mason'].includes(role)?24:1))fail('Неверное количество роли: '+role);}
 if(players!==null){const sum=Object.values(out.counts).reduce((a,b)=>a+b,0);const nblack=Object.entries(out.counts).filter(([r])=>ROLES[r][1]==='mafia').reduce((n,[,c])=>n+c,0);
  if(players<5||sum>players||nblack<1||nblack>=players/2)fail('Нужно минимум 5 игроков, минимум один мафиози и меньше половины чёрных ролей');
  if(out.counts.mason&&(players<=16||out.counts.mason<2))fail('Масоны: минимум двое и больше 16 участников');
 }
 if(!['hidden','open'].includes(out.cameraMode))fail('Неверный режим камер');out.soloLastAlive=out.soloLastAlive!==false;return out;
}
export function joinGame(original,id,name){const s=clone(original);if(s.players.some(p=>p.id===id))return renumberSeats(s);if(s.phase!=='lobby')fail('В «Мафию» новые игроки входят до раздачи ролей');if(s.players.length>=s.settings.maxPlayers+(s.settings.gameMode==='hosted'?1:0))fail('Комната заполнена');if(!name?.trim()||name.trim().length>20)fail('Имя: от 1 до 20 символов');s.players.push({id,name:name.trim(),seat:Math.max(0,...s.players.map(p=>p.seat??0))+1,alive:true,ready:false,role:null,inbox:[],memory:{}});if(!s.host)s.host=id;renumberSeats(s);event(s,name.trim()+' присоединился(ась)');return s;}
function phase(s,next,now){s.phase=next;s.epoch++;s.phaseStarted=now;s.cameraGraceUntil=now+20000;s.deadline=next==='finished'||next==='lobby'?null:now+s.settings[{night:'nightSeconds',night_bonus:'bonusSeconds',day:'daySeconds',voting:'voteSeconds',result:'resultSeconds'}[next]]*1000;}
export function startGame(original,id,cameras,now=Date.now(),random=Math.random){const s=renumberSeats(clone(original));if(s.host!==id||s.phase!=='lobby')fail('Начать может создатель комнаты в лобби');const playing=contestants(s);validateSettings(s.settings,playing.length);if(playing.some(p=>!p.ready)||s.players.some(p=>!cameras[p.id]))fail('Все игроки должны быть готовы, а каждый участник — подключить камеру');
 const deck=Object.entries(s.settings.counts).flatMap(([r,n])=>Array(n).fill(r));while(deck.length<playing.length)deck.push('citizen');
 for(let i=deck.length-1;i>0;i--){const j=Math.floor(random()*(i+1));[deck[i],deck[j]]=[deck[j],deck[i]];}
 playing.forEach((p,i)=>{p.role=deck[i];p.alive=true;p.memory={};p.inbox=[];});if(s.settings.gameMode==='hosted'){const host=member(s,s.host);host.role=null;host.alive=true;host.ready=true;host.memory={};host.inbox=[];}s.round=1;s.night={actions:{},mafiaVotes:{},bonusVotes:{}};
 s.wakeOrder=wakePlan(s);s.wakeIndex=0;
 phase(s,'night',now);event(s,'Город засыпает. Первая ночь.');
 for(const p of s.players.filter(p=>p.role==='mason'))inbox(p,'Масоны: '+s.players.filter(x=>x.role==='mason'&&x.id!==p.id).map(x=>'№'+x.seat+' '+x.name).join(', '),s.round);
 return s;
}
export function choicesFor(s,id){const p=member(s,id);if(!p.alive||s.paused)return [];
 if(isModerator(s,p))return [];
 if(s.phase==='night_bonus')return s.pending?.bonusAllowed&&black(p)?['bonus_vote']:[];
 if(s.phase!=='night')return [];
 if(s.wakeOrder){const waking=s.wakeOrder[s.wakeIndex];if(waking==='clan')return nightGroup(p)?['mafia_vote']:[];if(waking!==p.role)return [];return (ACTIONS[p.role]||[]).filter(k=>k!=='alert'||!p.memory.alertUsed);}
 return [...(nightGroup(p)?['mafia_vote']:[]),...(ACTIONS[p.role]||[]).filter(k=>k!=='alert'||!p.memory.alertUsed)];
}
export function act(original,id,kind,targets=[],now=Date.now()){
 const s=clone(original),p=member(s,id);if(isModerator(s,p)||!p.alive||s.paused||now>=s.deadline)fail('Действие сейчас недоступно');
 if(kind==='vote'){
  if(s.phase!=='voting'||p.silencedRound===s.round)fail('Голосование недоступно');
  if(Object.hasOwn(s.votes,id))fail('Голос уже принят');
  if(targets.length>1)fail('Нужна одна цель или воздержание');
  if(targets.length){const t=member(s,targets[0]);if(!t.alive||t.id===id||t.alibiRound===s.round)fail('Недопустимая цель');}
  s.votes[id]=targets[0]||null;delete s.undo;return s;
 }
 if(!choicesFor(s,id).includes(kind))fail('Эта способность вам недоступна');
 const n=['alert','ignite'].includes(kind)?0:kind==='compare'?2:1;
 if(targets.length!==n||new Set(targets).size!==n)fail('Неверное количество целей');
 for(const tid of targets){const t=member(s,tid);if(kind==='autopsy'?t.alive||t.deathCause!=='night':!t.alive)fail('Недопустимая цель');
  if(tid===id&&!['heal','pardon'].includes(kind))fail('Нельзя выбирать себя');
  if(['heal','alibi','silence','block'].includes(kind)&&p.memory.lastRound===s.round-1&&p.memory.lastTarget===tid)fail('Нельзя выбирать одну цель две ночи подряд');
 }
 if(kind==='ignite'&&!(p.memory.marked||[]).length)fail('Пока нет помеченных целей');
 if(kind==='mafia_vote'||kind==='bonus_vote'){s.night[kind==='mafia_vote'?'mafiaVotes':'bonusVotes'][id]=targets[0];delete s.undo;return s;}
 s.night.actions[id]={kind,targets};delete s.undo;return s;
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
 if(mafia.length>=ps.length-mafia.length){finish(s,'mafia',s.players.filter(p=>['mafia','mafia_ally'].includes(ROLES[p.role]?.[1])).map(p=>p.id),'Мафия получила численное преимущество и победила.',now);return true;}
 if(!mafia.length&&!ps.some(p=>['maniac','ripper','arsonist'].includes(p.role))){finish(s,'town',s.players.filter(p=>ROLES[p.role]?.[1]==='town').map(p=>p.id),'Мирный город победил.',now);return true;}return false;
}
function eligibleFor(s,p,kind){return s.players.filter(t=>!isModerator(s,t)&&(kind==='autopsy'?!t.alive&&t.deathCause==='night':t.alive)&&(t.id!==p.id||['heal','pardon'].includes(kind))&&(!['heal','alibi','silence','block'].includes(kind)||p.memory.lastRound!==s.round-1||p.memory.lastTarget!==t.id)).map(t=>t.id);}
function autoFillWake(s,random){
 if(!s.wakeOrder)return s;
 for(const p of alive(s)){
  const kind=choicesFor(s,p.id).find(k=>!['alert','ignite'].includes(k));if(!kind)continue;
  const clan=kind==='mafia_vote'||kind==='bonus_vote',field=kind==='mafia_vote'?'mafiaVotes':'bonusVotes';
  if(clan?s.night[field][p.id]:s.night.actions[p.id])continue;
  const candidates=eligibleFor(s,p,kind),n=kind==='compare'?2:1;if(candidates.length<n)continue;const targets=[];
  for(let i=0;i<n;i++)targets.push(candidates.splice(Math.floor(random()*candidates.length),1)[0]);
  s=act(s,p.id,kind,targets,s.deadline-1);s.night.automatic||=[];s.night.automatic.push({id:p.id,kind});
 }
 return s;
}
export function advance(original,now=Date.now(),random=Math.random){let s=clone(original);if(s.paused||!s.deadline||now<s.deadline)return s;
 delete s.undo;
 if(s.phase==='night'){s=autoFillWake(s,random);if(s.wakeOrder&&s.wakeIndex<s.wakeOrder.length-1){s.wakeIndex++;phase(s,'night',now);return s;}s.pending=resolveNight(s,random);recordNight(s);phase(s,'night_bonus',now);return s;}
 if(s.phase==='night_bonus'){
  s=autoFillWake(s,random);
  const result=s.pending;
  for(const [id,target] of Object.entries(s.night.bonusVotes||{})){const p=member(s,id);const automatic=(s.night.automatic||[]).some(a=>a.id===id&&a.kind==='bonus_vote');event(s,p.name+' выбрал(а) дополнительную жертву клана: '+member(s,target).name+(automatic?' (случайная цель по таймеру)':'')+'.',black(p)?s.players.filter(black).map(t=>t.id):[id]);}
  if(result.bonusAllowed){const shot=mafiaShot(s,s.night.bonusVotes,new Set([...result.blocked,...result.dead]));if(shot){const t=shot.target;
   event(s,'Дополнительный выбор клана: '+member(s,t).name+'.',s.players.filter(black).map(p=>p.id));
   if(result.alert.includes(t)){if(!result.healed.includes(shot.actor)&&!result.alert.includes(shot.actor))result.dead.push(shot.actor);}
   else if(!result.healed.includes(t)){const guard=(result.guards[t]||[]).find(id=>!result.dead.includes(id));if(guard){if(!result.healed.includes(guard))result.dead.push(guard);}else result.dead.push(t);}
  }}
  for(const id of new Set(result.dead)){const p=member(s,id);p.alive=false;p.deathCause='night';p.deathRound=s.round;}
  for(const m of result.messages){inbox(member(s,m.id),m.text,s.round);event(s,m.text,[m.id]);}
  const lost=[...new Set(result.dead)].map(id=>member(s,id).name);event(s,lost.length?'Ночью погибли: '+lost.join(', ')+'.':'Ночь прошла без погибших.');
  for(const p of alive(s)){if(p.alibiRound===s.round)event(s,p.name+': на сегодня есть алиби.');if(p.silencedRound===s.round)event(s,p.name+': сегодня не участвует в обсуждении и голосовании.');}
  delete s.pending;if(!checkWin(s,now)){phase(s,'day',now);s.votes={};}return s;
 }
 if(s.phase==='day'){phase(s,'voting',now);s.votes={};event(s,'Началось дневное голосование.');return s;}
 if(s.phase==='voting'){
  const counts={};for(const [id,target] of Object.entries(s.votes)){const p=member(s,id),t=target?s.players.find(x=>x.id===target):null;if(p.alive&&p.silencedRound!==s.round&&t?.alive&&t.alibiRound!==s.round)counts[target]=(counts[target]||0)+1;}
  const ranked=Object.entries(counts).sort((a,b)=>b[1]-a[1]);s.lastTally=Object.entries(counts).map(([id,count])=>({id,count}));
  if(ranked.length)event(s,'Голоса: '+ranked.map(([id,n])=>member(s,id).name+' — '+n).join('; ')+'.');
  if(!ranked.length||ranked[1]?.[1]===ranked[0][1])event(s,'Нет единственного лидера голосования. Никто не изгнан.');
  else{const p=member(s,ranked[0][0]);if(p.pardonRound===s.round)event(s,'Судья оправдал(а) '+p.name+'. Игрок остаётся.');else{p.alive=false;p.deathCause='day';p.deathRound=s.round;event(s,p.name+' изгнан(а) голосованием.');if(p.role==='jester'){finish(s,'jester',[p.id],'Город изгнал Шута. Шут победил, партия завершена.',now);return s;}}}
  if(!checkWin(s,now))phase(s,'result',now);return s;
 }
 if(s.phase==='result'){s.round++;s.wakeOrder||=WAKE_ORDER.filter(role=>role==='clan'?s.players.some(nightGroup):s.settings.counts[role]>0);s.wakeIndex=0;s.night={actions:{},mafiaVotes:{},bonusVotes:{}};delete s.lastTally;phase(s,'night',now);event(s,'Город засыпает. Ночь '+s.round+'.');}return s;
}
function recordNight(s){
 const clan=s.players.filter(black).map(p=>p.id);
 const suffix=(id,kind)=>(s.night.automatic||[]).some(a=>a.id===id&&a.kind===kind)?' (случайная цель по таймеру)':'';
 for(const p of s.players){const action=s.night.actions[p.id];if(action){const targets=action.targets.map(id=>member(s,id).name).join(', ');event(s,p.name+' выбрал(а): '+ACTION_LABELS[action.kind]+(targets?' → '+targets:'')+suffix(p.id,action.kind)+'.',black(p)?clan:[p.id]);}
  if(s.night.mafiaVotes[p.id])event(s,p.name+' выбрал(а) жертву клана: '+member(s,s.night.mafiaVotes[p.id]).name+suffix(p.id,'mafia_vote')+'.',black(p)?clan:[p.id]);}
}
export function presence(original,id,enabled,now=Date.now()){const s=clone(original),p=member(s,id);if(typeof enabled!=='boolean')fail('Неверный статус звука');p.soundState={enabled,at:now};return s;}
export function control(original,id,command,expectedEpoch,seconds,now=Date.now(),random=Math.random){
 if(original.host!==id||['lobby','finished'].includes(original.phase))fail('Управление доступно создателю во время партии');
 if(expectedEpoch!==original.epoch)fail('Фаза уже изменилась. Повторите действие.');
 let s=clone(original);const paused=s.paused;const before={deadline:s.deadline,paused:s.paused,remaining:s.remaining,pauseReason:s.pauseReason};s.paused=false;delete s.cameraPaused;
 if(command==='timer'){if(!Number.isInteger(seconds)||seconds<5||seconds>900)fail('Время: от 5 до 900 секунд');s.deadline=now+seconds*1000;}
 else{
  if(!['next','dawn','voting','next_round'].includes(command))fail('Неизвестное управление');
  if(command==='dawn'&&!['night','night_bonus'].includes(s.phase))fail('Сейчас не ночь');
  if(command==='voting'&&s.phase!=='day')fail('Голосование запускается из обсуждения');
  const round=s.round;let steps=0;
  do{s.deadline=now;s=advance(s,now,random);steps++;if(s.phase==='finished')break;}
  while(steps<WAKE_ORDER.length+6&&((command==='dawn'&&['night','night_bonus'].includes(s.phase))||(command==='next_round'&&s.round===round)));
 }
 const leader=s.settings.gameMode==='hosted'?'Ведущий':'Создатель';
 if(paused&&s.phase!=='finished'){s.paused=true;s.remaining=Math.max(0,s.deadline-now);s.pauseReason=leader+' поставил партию на паузу';}
 else{delete s.pauseReason;s.paused=false;}
 const labels={next:'перешёл к следующему этапу',dawn:'завершил ночь',voting:'запустил голосование',next_round:'перешёл к следующему раунду',timer:'установил таймер: '+seconds+' сек.'};
 event(s,leader+' '+labels[command]+'.');
 if(command==='timer')s.undo={eventId:s.eventSeq,kind:'timer',round:s.round,phase:s.phase,before};else delete s.undo;
 return s;
}
export function changeLobby(original,id,command,data={},camera=false){const s=clone(original),p=member(s,id);if(s.phase!=='lobby')fail('Настройки состава доступны в лобби');
 if(command==='ready'){if(isModerator(s,p))fail('Ведущий не занимает место игрока');if(data.ready&&!camera)fail('Для готовности подключите камеру');p.ready=!!data.ready;}
 else if(command==='settings'){if(s.host!==id)fail('Только создатель комнаты');const previous=s.settings.cameraMode||'hidden',previousMode=s.settings.gameMode||'auto';s.settings=validateSettings(data);if(previous!==s.settings.cameraMode||previousMode!==s.settings.gameMode){s.epoch++;s.cameraGeneration=(s.cameraGeneration||0)+1;s.players.forEach(p=>delete p.cameraVerifiedAt);}if(s.settings.maxPlayers<contestants(s).length)fail('Лимит не может быть меньше текущего числа игроков');s.players.forEach(p=>p.ready=false);}
 else if(command==='leave'){s.players=s.players.filter(p=>p.id!==id);if(s.host===id)s.host=s.players[0]?.id||null;}
 return renumberSeats(s);
}
export function pause(original,id,paused,now=Date.now()){const s=clone(original);if(s.host!==id||['lobby','finished'].includes(s.phase))fail('Пауза недоступна');const leader=s.settings.gameMode==='hosted'?'Ведущий':'Создатель';delete s.cameraPaused;if(s.paused===paused){if(paused)s.pauseReason=leader+' поставил партию на паузу';return s;}if(paused){s.remaining=Math.max(0,s.deadline-now);s.paused=true;s.pauseReason=leader+' поставил партию на паузу';}else{s.deadline=now+s.remaining;s.paused=false;delete s.pauseReason;}return s;}
export function liveSettings(original,id,seconds){const s=clone(original);if(s.settings.gameMode!=='hosted'||s.host!==id||['lobby','finished'].includes(s.phase))fail('Настройки доступны ведущему во время партии');
 const before={};for(const key of ['daySeconds','voteSeconds','nightSeconds','bonusSeconds']){const value=seconds?.[key],bounds={daySeconds:[30,900],voteSeconds:[15,180],nightSeconds:[15,180],bonusSeconds:[10,60]}[key];if(!Number.isInteger(value)||value<bounds[0]||value>bounds[1])fail('Неверная длительность: '+key);before[key]=s.settings[key];s.settings[key]=value;}
 event(s,'Ведущий обновил(а) длительности следующих этапов.');s.undo={eventId:s.eventSeq,kind:'settings',round:s.round,phase:s.phase,before};return s;
}
export function announce(original,id,text,target=null){const s=clone(original);if(s.settings.gameMode!=='hosted'||s.host!==id||['lobby','finished'].includes(s.phase))fail('Объявление доступно ведущему во время партии');if(typeof text!=='string'||!text.trim()||text.length>300)fail('Объявление: от 1 до 300 символов');if(target){const p=member(s,target);if(isModerator(s,p))fail('Выберите игрока');}
 event(s,'Ведущий: '+text.trim(),target?[id,target]:null);delete s.undo;return s;
}
export function moderate(original,id,command,target,role,now=Date.now()){
 const s=clone(original);if(s.settings.gameMode!=='hosted'||s.host!==id||['lobby','finished'].includes(s.phase))fail('Команда доступна ведущему во время партии');
 const p=member(s,target);if(isModerator(s,p))fail('Нельзя применить команду к ведущему');
 const before={player:{role:p.role,alive:p.alive,deathCause:p.deathCause,deathRound:p.deathRound,memory:clone(p.memory),inbox:clone(p.inbox),hostMuted:p.hostMuted},night:clone(s.night),votes:clone(s.votes),wakeOrder:clone(s.wakeOrder),wakeIndex:s.wakeIndex};
 if(command==='eliminate'){if(!p.alive)fail('Игрок уже выбыл');p.alive=false;p.deathCause='host';p.deathRound=s.round;event(s,'Ведущий исключил(а) '+p.name+'.');}
 else if(command==='revive'){if(p.alive)fail('Игрок уже в игре');p.alive=true;delete p.deathCause;delete p.deathRound;event(s,'Ведущий вернул(а) '+p.name+' в игру.');}
 else if(command==='role'){if(!Object.hasOwn(ROLES,role))fail('Неизвестная роль');const current=s.wakeOrder?.[s.wakeIndex],index=s.wakeIndex||0;p.role=role;p.memory={};p.inbox=[];s.wakeOrder=wakePlan(s);s.wakeIndex=Math.max(0,s.wakeOrder.indexOf(current));if(!s.wakeOrder.includes(current))s.wakeIndex=Math.min(index,Math.max(0,s.wakeOrder.length-1));event(s,'Ведущий исправил роль игрока '+p.name+'.',[s.host]);}
 else if(command==='mute'||command==='unmute'){if(!!p.hostMuted===(command==='mute'))fail('Статус микрофона уже установлен');p.hostMuted=command==='mute';event(s,'Ведущий '+(p.hostMuted?'запретил(а)':'разрешил(а)')+' голос игроку '+p.name+'.');}
 else if(command==='clear_action'){if(!s.night.actions?.[target]&&!s.night.mafiaVotes?.[target]&&!s.night.bonusVotes?.[target])fail('У игрока нет текущего ночного выбора');delete s.night.actions[target];delete s.night.mafiaVotes[target];delete s.night.bonusVotes[target];event(s,'Ведущий сбросил(а) ночной выбор игрока '+p.name+'.',[s.host,target]);}
 else if(command==='clear_vote'){if(s.phase!=='voting'||!Object.hasOwn(s.votes,target))fail('У игрока нет голоса в текущем голосовании');delete s.votes[target];event(s,'Ведущий сбросил(а) дневной голос игрока '+p.name+'.',[s.host,target]);}
 else fail('Неизвестная команда ведущего');
 s.epoch++;s.cameraGraceUntil=now+20000;
 if(['eliminate','role'].includes(command)&&checkWin(s,now)){delete s.undo;return s;}
 s.undo={eventId:s.eventSeq,kind:'moderate',command,target,round:s.round,phase:s.phase,before};
 return s;
}
export function undoHost(original,id,eventId,now=Date.now()){
 const s=clone(original),u=s.undo;
 if(s.settings.gameMode!=='hosted'&&u?.kind==='moderate')fail('Команда доступна только ведущему');
 if(s.host!==id||!u||s.phase==='finished'||u.eventId!==eventId||s.eventSeq!==eventId||s.round!==u.round||s.phase!==u.phase)fail('Это действие уже нельзя отменить: состояние партии изменилось');
 if(u.kind==='timer'){s.deadline=u.before.deadline;s.paused=u.before.paused;s.remaining=u.before.remaining;s.pauseReason=u.before.pauseReason;}
 else if(u.kind==='settings'){Object.assign(s.settings,u.before);}
 else if(u.kind==='moderate'){
  const p=member(s,u.target);for(const key of ['role','alive','deathCause','deathRound','memory','inbox','hostMuted']){if(u.before.player[key]===undefined)delete p[key];else p[key]=clone(u.before.player[key]);}
  s.night=u.before.night;s.votes=u.before.votes;s.wakeOrder=u.before.wakeOrder;s.wakeIndex=u.before.wakeIndex;
 }else fail('Неизвестное действие отмены');
 delete s.undo;s.epoch++;s.cameraGraceUntil=now+20000;event(s,'Ведущий обратил(а) вспять действие №'+eventId+'.');return s;
}
export function mediaPolicy(s,id){const p=member(s,id);let group='table',audio=true,subscribe=true;
 if(!p.alive&&s.phase!=='finished'){group='observer-'+p.id;audio=false;subscribe=false;}
 else if(s.settings.gameMode==='hosted'&&(s.phase==='night'||s.phase==='night_bonus')){group='hosted-night';if(isModerator(s,p)){audio=true;subscribe=true;}else{audio=choicesFor(s,id).length>0;subscribe=false;}}
 else if(s.phase==='night'||s.phase==='night_bonus'){const clanWindow=!s.wakeOrder||s.phase==='night_bonus'||s.wakeOrder[s.wakeIndex]==='clan';const together=nightGroup(p)&&clanWindow;group=together?'night-team':'private-'+p.id;audio=together;subscribe=together;}
 else if(p.silencedRound===s.round&&s.phase!=='finished')audio=false;
 if(p.hostMuted&&s.phase!=='finished')audio=false;
 const videoRoom=s.settings.cameraMode==='open'?s.mediaId+'-cameras-'+(s.cameraGeneration||0):null;return {room:s.mediaId+'-'+s.epoch+'-'+group,identity:id,camera:!videoRoom,videoRoom,audio,subscribe,epoch:s.epoch};
}
export function publicView(s,id){const p=member(s,id),night=s.phase==='night'||s.phase==='night_bonus';
 const moderator=isModerator(s,p),policy=mediaPolicy(s,id),peers=p.alive&&night&&policy.subscribe?(moderator?alive(s).map(t=>t.id):s.players.filter(t=>t.alive&&nightGroup(t)).map(t=>t.id)):[];
 const available=choicesFor(s,id),waking=s.phase==='night_bonus'?'bonus':s.wakeOrder?.[s.wakeIndex];
 const eligible=Object.fromEntries(available.map(kind=>[kind,eligibleFor(s,p,kind)]));
 // Explicit allowlist: never serialize raw players, night state, visits, or pending results.
 return {code:s.code,host:s.host,phase:night?'night':s.phase,round:s.round,deadline:night&&!s.wakeOrder?(s.phase==='night'?s.deadline+s.settings.bonusSeconds*1000:s.deadline):s.deadline,paused:s.paused,pauseReason:s.pauseReason||null,epoch:s.epoch,settings:s.settings,winner:s.winner||null,
  wake:night&&s.wakeOrder?{key:waking,label:waking==='bonus'?'Завершение ночи':waking==='clan'?'Мафия':ROLES[waking]?.[0],index:s.phase==='night_bonus'?s.wakeOrder.length:s.wakeIndex,total:s.wakeOrder.length+1,mine:available.length>0,deadline:s.deadline,order:[...s.wakeOrder,'bonus'].map(k=>({key:k,label:k==='clan'?'Мафия':k==='bonus'?'Завершение ночи':ROLES[k][0]}))}:null,
  players:s.players.map(t=>({id:t.id,name:t.name,seat:t.seat,alive:t.alive,ready:t.ready,moderator:isModerator(s,t),alibi:!night&&t.alibiRound===s.round,silenced:!night&&t.silencedRound===s.round,hostMuted:!!t.hostMuted,sound:(!night||moderator||t.id===id||peers.includes(t.id))&&t.soundState&&Date.now()-t.soundState.at<45000?t.soundState.enabled:null,...(s.phase==='finished'||moderator?{role:t.role}:{})})),
  me:{id,role:p.role,inbox:p.inbox,alive:p.alive,moderator,actions:choicesFor(s,id),submitted:night?(s.night.actions?.[id]||null):null,mafiaVote:night&&nightGroup(p)?s.night.mafiaVotes?.[id]||null:null,bonusVote:s.phase==='night_bonus'&&nightGroup(p)?s.night.bonusVotes?.[id]||null:null,voted:Object.hasOwn(s.votes,id),marked:p.role==='arsonist'?p.memory.marked||[]:[],nightPeers:peers},
  eligibleTargets:eligible,
  events:s.events.filter(e=>moderator||e.audience==null||e.audience.includes(id)).map(e=>({id:e.id,round:e.round,text:e.text,private:e.audience!=null})),
  hostPanel:moderator?{undo:s.undo?{eventId:s.undo.eventId,kind:s.undo.kind}:null,players:contestants(s).map(t=>{const action=s.night.actions?.[t.id];return {id:t.id,role:t.role,alive:t.alive,hostMuted:!!t.hostMuted,action:action?{kind:action.kind,targets:action.targets}:null,mafiaVote:s.night.mafiaVotes?.[t.id]||null,bonusVote:s.night.bonusVotes?.[t.id]||null,vote:Object.hasOwn(s.votes,t.id)?s.votes[t.id]:undefined};})}:null,
  lastTally:s.phase==='result'||s.phase==='finished'?s.lastTally||[]:[],media:policy};
}
