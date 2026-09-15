import {mediaPolicy} from './engine.mjs';
const enc=new TextEncoder();
function b64(data){return btoa(String.fromCharCode(...data)).replaceAll('+','-').replaceAll('/','_').replaceAll('=','');}
export async function signJWT(payload,secret){const header=b64(enc.encode(JSON.stringify({alg:'HS256',typ:'JWT'}))),body=b64(enc.encode(JSON.stringify(payload)));const key=await crypto.subtle.importKey('raw',enc.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);const signature=await crypto.subtle.sign('HMAC',key,enc.encode(header+'.'+body));return header+'.'+body+'.'+b64(new Uint8Array(signature));}
export function makeMedia(env,fetcher=fetch){
 const url=env('LIVEKIT_URL'),key=env('LIVEKIT_API_KEY'),secret=env('LIVEKIT_API_SECRET');
 const configured=!!url&&!!key&&!!secret;
 // This implementation relies on strict token revocation, a LiveKit Cloud feature.
 const requireConfig=()=>{if(!configured)throw Error('Видеосвязь ещё не подключена. Администратору нужно настроить LiveKit Cloud.');if(!/^wss:\/\/[a-z0-9-]+\.livekit\.cloud\/?$/i.test(url))throw Error('Для защищённых ночных комнат требуется LiveKit Cloud');};
 async function api(method,body,grant){requireConfig();const now=Math.floor(Date.now()/1000);const token=await signJWT({iss:key,sub:'mafia-server',nbf:now-5,exp:now+60,video:grant},secret);const response=await fetcher(url.replace(/^wss:/,'https:').replace(/\/$/,'')+'/twirp/livekit.RoomService/'+method,{method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},body:JSON.stringify(body),signal:AbortSignal.timeout(8000)});const result=await response.json();if(!response.ok){if(result.code==='not_found')return null;throw Error('Не удалось согласовать видеосвязь. Повторите подключение.');}return result;}
 async function cameras(s){requireConfig();const result={};const policies=s.players.filter(p=>p.alive||s.phase==='lobby').map(p=>mediaPolicy(s,p.id));const rooms=[...new Set(policies.map(p=>p.room))];for(let i=0;i<rooms.length;i+=6)await Promise.all(rooms.slice(i,i+6).map(async room=>{const response=await api('ListParticipants',{room},{room,roomAdmin:true,roomList:true});for(const info of response?.participants||[])result[info.identity]=(info.tracks||[]).some(t=>(t.source==='CAMERA'||t.source===1)&&(t.type==='VIDEO'||t.type===1)&&!t.muted);}));return result;}
 async function token(s,id){requireConfig();const policy=mediaPolicy(s,id),now=Math.floor(Date.now()/1000);return {url,room:policy.room,epoch:s.epoch,token:await signJWT({iss:key,sub:id,nbf:now-1,exp:now+60,name:s.players.find(p=>p.id===id).name,video:{roomJoin:true,room:policy.room,canPublish:true,canPublishSources:policy.audio?['camera','microphone']:['camera'],canSubscribe:policy.subscribe,canPublishData:false,canUpdateOwnMetadata:false}},secret)};}
 async function disconnectOld(old,next){
  const departed=old.players.filter(p=>!next.players.some(n=>n.id===p.id));
  if(old.epoch===next.epoch&&!departed.length)return;
  if(!configured&&old.epoch===next.epoch)return;
  requireConfig();
  // Revoke even for disconnected users. A future cutoff includes refreshed tokens
  // and avoids Cloud's default one-minute grace period on cached credentials.
  const cutoff=Math.floor(Date.now()/1000)+15;
  const revoke=old.epoch===next.epoch?departed:old.players;
  for(let i=0;i<revoke.length;i+=6)await Promise.all(revoke.slice(i,i+6).map(p=>{const policy=mediaPolicy(old,p.id);return api('RemoveParticipant',{room:policy.room,identity:p.id,revoke_token_ts:cutoff},{room:policy.room,roomAdmin:true});}));
 }
 return {configured,cameras,token,disconnectOld};
}
