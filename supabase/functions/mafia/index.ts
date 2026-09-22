import {createClient} from 'npm:@supabase/supabase-js@2.116.0';
import {createGame,joinGame,startGame,act,advance,publicView,changeLobby,pause,control,moderate,undoHost,liveSettings,announce,presence,ROLES,ACTION_LABELS} from './engine.mjs';
import {makeMedia} from './media.mjs';
const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
const media=makeMedia((name:string)=>Deno.env.get(name));
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS','Cache-Control':'no-store'};
const response=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});
async function storage(op:string,code:string|null=null,lease:string|null=null,state:unknown=null){const {data,error}=await db.rpc('mafia_storage',{p_op:op,p_code:code,p_lease:lease,p_state:state});if(error)throw Error(error.message);return data;}
const secureRandom=()=>crypto.getRandomValues(new Uint32Array(1))[0]/4294967296;
const CAMERA_READY_TTL=120000;
const RECONNECT_GRACE=30000;
const cameraFresh=(p:any,now=Date.now())=>Number.isFinite(p.cameraVerifiedAt)&&now-p.cameraVerifiedAt>=0&&now-p.cameraVerifiedAt<=CAMERA_READY_TTL;
const participant=(old:any,s:any,id:string|null)=>s?.players?.find((p:any)=>p.id===id)||old?.players?.find((p:any)=>p.id===id)||null;
const namedTargets=(old:any,s:any,ids:any[]=[])=>ids.map(id=>{const p=participant(old,s,String(id));return {id:String(id),seat:p?.seat??null,name:p?.name??'Игрок'};});
function auditEntries(old:any,s:any,uid:string|null,op:string,body:any){const actor=participant(old,s,uid),entries:any[]=[];const add=(event_key:string,summary:string,details:any={})=>entries.push({event_key,summary,details});
 if(op==='create')add('room_created','Комната создана');
 else if(op==='join')add(old?.players?.some((p:any)=>p.id===uid)?'player_rejoined':'player_joined',old?.players?.some((p:any)=>p.id===uid)?'Игрок повторно вошёл в комнату':'Игрок вошёл в комнату');
 else if(op==='state'&&body.resume)add('session_restored','Игрок восстановил комнату после обновления страницы');
 else if(op==='media')add('media_connected','Камера и медиасвязь подключаются к текущей фазе',{epoch:s.epoch});
 else if(op==='disconnect')add('player_disconnected',body.reason==='pagehide'?'Игрок обновил или закрыл страницу':'Игрок вышел из игрового экрана',{reason:String(body.reason||'unknown')});
 else if(op==='ready')add(body.ready?'player_ready':'player_unready',body.ready?'Игрок подтвердил готовность':'Игрок снял готовность');
 else if(op==='settings')add('settings_changed','Владелец изменил настройки партии',{gameMode:s.settings.gameMode,cameraMode:s.settings.cameraMode,maxPlayers:s.settings.maxPlayers,counts:s.settings.counts});
 else if(op==='start')add('game_started','Партия началась',{players:s.players.filter((p:any)=>!p.moderator).length});
 else if(op==='act')add(body.kind==='vote'?'day_vote':'role_action',body.kind==='vote'?'Игрок отправил дневной голос':'Игрок отправил действие роли: '+(ACTION_LABELS[body.kind]||body.kind),{action:body.kind,targets:namedTargets(old,s,body.targets||[]),epoch:body.epoch});
 else if(op==='pause')add('game_paused','Владелец поставил игру на паузу');
 else if(op==='resume')add('game_resumed','Владелец продолжил игру');
 else if(op==='control')add('host_control','Владелец выполнил ручную команду: '+String(body.command),{command:body.command,seconds:body.seconds??null});
 else if(op==='moderate'){const target=participant(old,s,body.target);add('host_moderation','Ведущий выполнил модерацию игрока: '+String(body.command),{command:body.command,target:target?{id:target.id,seat:target.seat,name:target.name}:body.target,role:body.role??null});}
 else if(op==='undo')add('host_undo','Ведущий обратил вспять действие',{eventId:body.eventId});
 else if(op==='live_settings')add('host_settings','Ведущий изменил длительности этапов',{seconds:body.seconds});
 else if(op==='announce')add('host_announcement','Ведущий отправил объявление',{target:body.target||null});
 else if(op==='leave')add('player_left','Игрок покинул лобби');
 else if(op==='tick'){if(!old.cameraPaused&&s.cameraPaused)add('camera_pause','Игра автоматически приостановлена: потеряна камера');if(old.cameraPaused&&!s.cameraPaused)add('camera_resume','Камеры восстановлены, таймер автоматически продолжен');if(old.phase!==s.phase||old.epoch!==s.epoch||old.wakeIndex!==s.wakeIndex)add('phase_advanced','Автоматический переход игрового этапа',{from:{phase:old.phase,round:old.round,wakeIndex:old.wakeIndex??null},to:{phase:s.phase,round:s.round,wakeIndex:s.wakeIndex??null},automaticActions:s.night?.automatic||[]});}
 return entries.map(entry=>({p_room_code:s?.code||old?.code||null,p_player_id:uid,p_player_name:actor?.name||null,p_seat:actor?.seat??null,p_event_key:entry.event_key,p_summary:entry.summary,p_phase:s?.phase||old?.phase||null,p_round:s?.round??old?.round??null,p_details:entry.details}));
}
async function writeAudit(old:any,s:any,uid:string|null,op:string,body:any){for(const entry of auditEntries(old,s,uid,op,body)){const {error}=await db.rpc('mafia_audit',entry);if(error)console.error('Mafia audit failed',entry.p_event_key,error.message);}}
async function processRoom(code:string,uid:string|null,op:string,body:any={}){
 if(op==='state'&&uid&&!body.resume){const row=await storage('read',code);if(!row)throw Error('Комната не найдена');return {game:publicView(row.state,uid),mediaConfigured:media.configured};}
 const lease=crypto.randomUUID(),row=await storage('claim',code,lease);if(!row)throw Error('Комната занята обновлением или не найдена. Повторите через секунду.');
 try{
  const old=row.state;let s=structuredClone(old),cameras:any={},now=Date.now();
  if(uid&&!s.players.some((p:any)=>p.id===uid)&&op!=='join')throw Error('Вы не участник комнаты');
  const player=uid?s.players.find((p:any)=>p.id===uid):null;
  const roster=s.players.filter((p:any)=>!(s.settings.gameMode==='hosted'&&p.id===s.host));
  const rosterReady=roster.length>=5&&roster.every((p:any)=>p.ready);
  const readyAllowed=!(s.settings.gameMode==='hosted'&&uid===s.host);
  const cachedReady=op==='ready'&&readyAllowed&&body.ready&&cameraFresh(player,now);
  const cachedStart=op==='start'&&rosterReady&&s.players.every((p:any)=>cameraFresh(p,now));
  const needCameras=media.configured&&(op==='act'||op==='resume'||op==='tick'||(op==='ready'&&readyAllowed&&body.ready&&!cachedReady)||(op==='start'&&rosterReady&&!cachedStart));
  if(cachedReady)cameras[uid!]=true;
  if(cachedStart)for(const p of s.players)cameras[p.id]=true;
  if(needCameras){cameras=await media.cameras(s);for(const p of s.players)if(cameras[p.id])p.cameraVerifiedAt=now;}
   if(op==='join')s=joinGame(s,uid,body.name);
   else if(op==='state'&&body.resume){s.cameraGraceUntil=Math.max(Number(s.cameraGraceUntil)||0,now+RECONNECT_GRACE);player.lastConnectedAt=now;}
   else if(op==='presence')s=presence(s,uid,body.sound);
   else if(op==='camera_status'){const active=media.configured&&await media.camera(s,uid!);if(active)player.cameraVerifiedAt=now;else delete player.cameraVerifiedAt;}
  else if(op==='control')s=control(s,uid,body.command,body.epoch,body.seconds,Date.now(),secureRandom);
  else if(op==='moderate')s=moderate(s,uid,body.command,body.target,body.role,Date.now());
  else if(op==='undo')s=undoHost(s,uid,body.eventId,Date.now());
  else if(op==='live_settings')s=liveSettings(s,uid,body.seconds);
  else if(op==='announce')s=announce(s,uid,body.text,body.target);
  else if(op==='settings')s=changeLobby(s,uid,'settings',body.settings);
  else if(op==='ready')s=changeLobby(s,uid,'ready',{ready:body.ready},body.ready?!!cameras[uid!]:true);
  else if(op==='start'){if(!media.configured)throw Error('Сначала подключите LiveKit Cloud');s=startGame(s,uid,cameras,Date.now(),secureRandom);}
  else if(op==='act'){if(body.epoch!==undefined&&body.epoch!==s.epoch)throw Error('Пробуждение уже изменилось. Обновите выбор.');if(!media.configured||!cameras[uid!])throw Error('Для участия нужна подключённая камера');s=act(s,uid,body.kind,body.targets||[]);}
  else if(op==='pause')s=pause(s,uid,true);
  else if(op==='resume'){if(s.players.some((p:any)=>p.alive&&!cameras[p.id]))throw Error('Дождитесь подключения камер всех живых игроков');s=pause(s,uid,false);}
   else if(op==='leave')s=changeLobby(s,uid,'leave');
   else if(op==='media'){s.cameraGraceUntil=Math.max(Number(s.cameraGraceUntil)||0,now+RECONNECT_GRACE);player.lastConnectedAt=now;}
   else if(op==='disconnect'){s.cameraGraceUntil=Math.max(Number(s.cameraGraceUntil)||0,now+RECONNECT_GRACE);player.lastDisconnectedAt=now;if(s.phase==='lobby')player.ready=false;}
   else if(op==='tick'){
    if(!['lobby','finished'].includes(s.phase)){
     const missing=!media.configured||s.players.some((p:any)=>p.alive&&!cameras[p.id]);
     if(missing&&Date.now()>s.cameraGraceUntil&&!s.paused){s.remaining=Math.max(5000,s.deadline-Date.now());s.paused=true;s.pauseReason='Ожидаем подключения камер';s.cameraPaused=true;}
    if(!missing&&s.cameraPaused){s.deadline=Date.now()+s.remaining;s.paused=false;delete s.pauseReason;delete s.cameraPaused;}
    if(s.settings.gameMode!=='hosted')s=advance(s,Date.now(),secureRandom);
   }
  }else if(!['state','media'].includes(op))throw Error('Неизвестная команда');
  // Privacy barrier: old media credentials are revoked before a new phase is visible.
  await media.disconnectOld(old,s);
   const connection=op==='media'&&uid?await media.token(s,uid):null;
   await storage(op==='tick'?'save_tick':'save',code,lease,s);
   await writeAudit(old,s,uid,op,body);
  if(!uid)return {ok:true};
  if(op==='leave')return {ok:true};
  const view=publicView(s,uid);
  return {game:view,mediaConfigured:media.configured,...(connection?{connection}:{})};
 }catch(error){await storage('release',code,lease);throw error;}
}
Deno.serve(async(req:Request)=>{
 if(req.method==='OPTIONS')return new Response(null,{headers:cors});
 if(req.method!=='POST')return response({error:'POST required'},405);
 try{
  const raw=await req.text();if(raw.length>16000)return response({error:'Слишком большой запрос'},413);const body=JSON.parse(raw||'{}'),bearer=req.headers.get('Authorization')?.replace(/^Bearer /i,'')||'';
  // Cron authenticates with a random Vault token, verified through service-only SQL.
  if(body.op==='scheduler'){
   const {data,error}=await db.rpc('mafia_scheduler_auth',{p_token:bearer});if(error||data!==true)return response({error:'Unauthorized'},401);
   if(body.diagnostics===true)return response({diagnostics:await media.diagnose()});
   const codes=await storage('due');const results=await Promise.allSettled(codes.map((code:string)=>processRoom(code,null,'tick')));
   return response({processed:results.filter(r=>r.status==='fulfilled').length});
  }
  const {data,error}=await db.auth.getUser(bearer);if(error||!data.user)return response({error:'Сессия истекла. Войдите снова.'},401);
  const uid=data.user.id;
  if(body.op==='catalog')return response({roles:ROLES,actions:ACTION_LABELS,mediaConfigured:media.configured});
  if(body.op==='create'){
   const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';let code='';for(let i=0;i<6;i++)code+=alphabet[Math.floor(secureRandom()*alphabet.length)];
   const s=createGame(code,uid,body.name,crypto.randomUUID());await storage('create',code,null,s);await writeAudit(null,s,uid,'create',body);return response({game:publicView(s,uid),mediaConfigured:media.configured});
  }
  const code=String(body.code||'').trim().toUpperCase();if(!/^[A-Z2-9]{6}$/.test(code))throw Error('Код «Мафии» состоит из 6 символов');
  return response(await processRoom(code,uid,body.op,body));
 }catch(error){return response({error:error instanceof Error?error.message:'Не удалось выполнить действие'},400);}
});
