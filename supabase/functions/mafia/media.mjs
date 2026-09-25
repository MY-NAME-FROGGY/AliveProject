import {mediaPolicy} from './engine.mjs';
const enc=new TextEncoder();
function b64(data){return btoa(String.fromCharCode(...data)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');}
export async function signJWT(payload,secret){const header=b64(enc.encode(JSON.stringify({alg:'HS256',typ:'JWT'}))),body=b64(enc.encode(JSON.stringify(payload)));const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);const signature=await crypto.subtle.sign('HMAC',key,enc.encode(header+'.'+body));return header+'.'+body+'.'+b64(new Uint8Array(signature));}
export function makeMedia(env,fetcher=fetch){
 // Dashboard copy/paste can include a trailing newline in an otherwise valid key.
 const url=env('LIVEKIT_URL')?.trim(),key=env('LIVEKIT_API_KEY')?.trim(),secret=env('LIVEKIT_API_SECRET')?.trim();
 const configured=!!url&&!!key&&!!secret;
 // This implementation relies on strict token revocation, a LiveKit Cloud feature.
 const requireConfig=()=>{if(!configured)throw Error('Видеосвязь ещё не подключена. Администратору нужно настроить LiveKit Cloud.');if(!/^wss:\/\/[a-z0-9-]+\.livekit\.cloud\/?$/i.test(url))throw Error('Для защищённых ночных комнат требуется LiveKit Cloud');};
 async function api(method,body,grant){requireConfig();const now=Math.floor(Date.now()/1000);const token=await signJWT({iss:key,sub:'mafia-server',nbf:now-5,exp:now+60,video:grant},secret);const response=await fetcher(url.replace(/^wss:/,'https:').replace(/\/$/,'')+'/twirp/livekit.RoomService/'+method,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(8000)});const result=await response.json();if(!response.ok){if(result.code==='not_found')return null;throw Error('Не удалось согласовать видеосвязь. Повторите подключение.');}return result;}
 async function cameras(s){requireConfig();const result={};const policies=s.players.filter(p=>p.alive||s.phase==='lobby').map(p=>mediaPolicy(s,p.id));const rooms=[...new Set(policies.map(p=>p.videoRoom||p.room))];for(let i=0;i<rooms.length;i+=6)await Promise.all(rooms.slice(i,i+6).map(async room=>{const response=await api('ListParticipants',{room},{room,roomAdmin:true,roomList:true});for(const info of response?.participants||[])result[info.identity]=(info.tracks||[]).some(t=>(t.source==='CAMERA'||t.source===1)&&(t.type==='VIDEO'||t.type===1)&&!t.muted);}));return result;}
 async function camera(s,id){requireConfig();const policy=mediaPolicy(s,id),room=policy.videoRoom||policy.room,response=await api('GetParticipant',{room,identity:id},{room,roomAdmin:true});return !!response&&(response.tracks||[]).some(t=>(t.source==='CAMERA'||t.source===1)&&(t.type==='VIDEO'||t.type===1)&&!t.muted);}
 async function token(s,id){requireConfig();const policy=mediaPolicy(s,id),now=Math.floor(Date.now()/1000);
  const credential=async(room,sources,subscribe)=>({url,room,epoch:policy.epoch,token:await signJWT({iss:key,sub:id,nbf:now,exp:now+60,name:s.players.find(p=>p.id===id).name,video:{roomJoin:true,room,canPublish:sources.length>0,canPublishSources:sources,canSubscribe:subscribe,canPublishData:false,canUpdateOwnMetadata:false}},secret)});
  const main=await credential(policy.room,[...(policy.camera?['camera']:[]),...(policy.audio?['microphone']:[])],policy.subscribe);
  if(policy.videoRoom)main.video=await credential(policy.videoRoom,['camera'],true);
  return main;
 }
 async function disconnectOld(old,next){
  if(!configured)return;
  const removals=[];
  for(const p of old.players){const before=mediaPolicy(old,p.id),present=next.players.some(n=>n.id===p.id),after=present?mediaPolicy(next,p.id):null;
   const mainChanged=!after||before.room!==after.room||before.camera!==after.camera||before.audio!==after.audio||before.subscribe!==after.subscribe;
   if(mainChanged)removals.push({room:before.room,id:p.id});
   if(before.videoRoom&&(!after||before.videoRoom!==after.videoRoom))removals.push({room:before.videoRoom,id:p.id});
  }
  if(!removals.length)return;
  requireConfig();
  // A current cutoff rejects the old token while allowing the freshly issued
  // token (whose nbf is equal to or newer than this moment) to reconnect.
  const cutoff=Math.floor(Date.now()/1000);
  for(let i=0;i<removals.length;i+=6)await Promise.all(removals.slice(i,i+6).map(({room,id})=>api('RemoveParticipant',{room,identity:id,revoke_token_ts:cutoff},{room,roomAdmin:true})));
 }
 // Internal, scheduler-authenticated diagnostics: never return keys or JWTs.
 async function diagnose(){
  requireConfig();const now=Math.floor(Date.now()/1000),base=url.replace(/^wss:/,'https:').replace(/\/$/,'');
  const check=async(path,claims,body)=>{const jwt=await signJWT({iss:key,sub:'mafia-diagnostic',nbf:now-5,exp:now+60,...claims},secret);const response=await fetcher(base+path,{method:body?'POST':'GET',headers:{Authorization:'Bearer '+jwt,'Content-Type':'application/json'},...(body?{body:JSON.stringify(body)}:{}),signal:AbortSignal.timeout(8000)});const message=await response.text();return {status:response.status,date:response.headers.get('date'),reason:response.ok?'accepted':/invalid api key/i.test(message)?'invalid_api_key':/signature/i.test(message)?'invalid_signature':/expired/i.test(message)?'expired':/not.*valid.*yet|not before/i.test(message)?'not_yet_valid':/invalid.*token|token.*invalid/i.test(message)?'invalid_token':'provider_rejected'};};
  return {host:new URL(base).hostname,keySuffix:key.slice(-4),hasSurroundingWhitespace:{url:url!==url.trim(),key:key!==key.trim(),secret:secret!==secret.trim()},api:await check('/twirp/livekit.RoomService/ListRooms',{video:{roomList:true}},{}),join:await check('/rtc/validate',{name:'Diagnostic',video:{roomJoin:true,room:'mafia-diagnostic',canPublish:true,canPublishSources:['camera'],canSubscribe:false,canPublishData:false,canUpdateOwnMetadata:false}})};
 }
 return {configured,cameras,camera,token,disconnectOld,diagnose};
}
