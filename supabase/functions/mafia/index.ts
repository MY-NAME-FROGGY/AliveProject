import {createClient} from 'npm:@supabase/supabase-js@2.116.0';
import {createGame,joinGame,startGame,act,advance,publicView,changeLobby,pause,ROLES,ACTION_LABELS} from './engine.mjs';
import {makeMedia} from './media.mjs';
const db=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
const media=makeMedia((name:string)=>Deno.env.get(name));
const cors={'Access-Control-Allow-Origin':'*','Access-Control-Allow-Headers':'authorization,apikey,content-type,x-client-info','Access-Control-Allow-Methods':'POST,OPTIONS','Cache-Control':'no-store'};
const response=(body:unknown,status=200)=>new Response(JSON.stringify(body),{status,headers:{...cors,'Content-Type':'application/json'}});
async function storage(op:string,code:string|null=null,lease:string|null=null,state:unknown=null){const {data,error}=await db.rpc('mafia_storage',{p_op:op,p_code:code,p_lease:lease,p_state:state});if(error)throw Error(error.message);return data;}
const secureRandom=()=>crypto.getRandomValues(new Uint32Array(1))[0]/4294967296;
async function processRoom(code:string,uid:string|null,op:string,body:any={}){
 if(op==='state'&&uid){const row=await storage('read',code);if(!row)throw Error('Комната не найдена');return {game:publicView(row.state,uid),mediaConfigured:media.configured};}
 const lease=crypto.randomUUID(),row=await storage('claim',code,lease);if(!row)throw Error('Комната занята обновлением или не найдена. Повторите через секунду.');
 try{
  const old=row.state;let s=structuredClone(old),cameras:any={};
  if(uid&&!s.players.some((p:any)=>p.id===uid)&&op!=='join')throw Error('Вы не участник комнаты');
  const needCameras=media.configured&&(op==='start'||op==='ready'||op==='act'||op==='resume'||op==='tick');
  if(needCameras)cameras=await media.cameras(s);
  if(op==='join')s=joinGame(s,uid,body.name);
  else if(op==='settings')s=changeLobby(s,uid,'settings',body.settings);
  else if(op==='ready')s=changeLobby(s,uid,'ready',{ready:body.ready},!!cameras[uid!]);
  else if(op==='start'){if(!media.configured)throw Error('Сначала подключите LiveKit Cloud');s=startGame(s,uid,cameras,Date.now(),secureRandom);}
  else if(op==='act'){if(!media.configured||!cameras[uid!])throw Error('Для участия нужна подключённая камера');s=act(s,uid,body.kind,body.targets||[]);}
  else if(op==='pause')s=pause(s,uid,true);
  else if(op==='resume'){if(s.players.some((p:any)=>p.alive&&!cameras[p.id]))throw Error('Дождитесь подключения камер всех живых игроков');s=pause(s,uid,false);}
  else if(op==='leave')s=changeLobby(s,uid,'leave');
  else if(op==='tick'){
   if(!['lobby','finished'].includes(s.phase)){
    const missing=!media.configured||s.players.some((p:any)=>p.alive&&!cameras[p.id]);
    if(missing&&Date.now()>s.cameraGraceUntil&&!s.paused){s.remaining=Math.max(0,s.deadline-Date.now());s.paused=true;s.pauseReason='Ожидаем подключения камер';s.cameraPaused=true;}
    if(!missing&&s.cameraPaused){s.deadline=Date.now()+s.remaining;s.paused=false;delete s.pauseReason;delete s.cameraPaused;}
    s=advance(s,Date.now(),secureRandom);
   }
  }else if(!['state','media'].includes(op))throw Error('Неизвестная команда');
  // Privacy barrier: old media credentials are revoked before a new phase is visible.
  await media.disconnectOld(old,s);
  const connection=op==='media'&&uid?await media.token(s,uid):null;
  await storage(op==='tick'?'save_tick':'save',code,lease,s);
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
   const codes=await storage('due');const results=await Promise.allSettled(codes.map((code:string)=>processRoom(code,null,'tick')));
   return response({processed:results.filter(r=>r.status==='fulfilled').length});
  }
  const {data,error}=await db.auth.getUser(bearer);if(error||!data.user)return response({error:'Сессия истекла. Войдите снова.'},401);
  const uid=data.user.id;
  if(body.op==='catalog')return response({roles:ROLES,actions:ACTION_LABELS,mediaConfigured:media.configured});
  if(body.op==='create'){
   const alphabet='ABCDEFGHJKLMNPQRSTUVWXYZ23456789';let code='';for(let i=0;i<6;i++)code+=alphabet[Math.floor(secureRandom()*alphabet.length)];
   const s=createGame(code,uid,body.name,crypto.randomUUID());await storage('create',code,null,s);return response({game:publicView(s,uid),mediaConfigured:media.configured});
  }
  const code=String(body.code||'').trim().toUpperCase();if(!/^[A-Z2-9]{6}$/.test(code))throw Error('Код «Мафии» состоит из 6 символов');
  return response(await processRoom(code,uid,body.op,body));
 }catch(error){return response({error:error instanceof Error?error.message:'Не удалось выполнить действие'},400);}
});
