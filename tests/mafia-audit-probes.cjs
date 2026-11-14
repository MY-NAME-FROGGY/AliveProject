const fs=require('node:fs'),path=require('node:path'),http=require('node:http'),assert=require('node:assert/strict');
const {chromium}=require('playwright');
function mediaFixture(){
 const events={TrackSubscribed:'subscribed',TrackUnsubscribed:'unsubscribed',LocalTrackPublished:'local',Disconnected:'disconnected',AudioPlaybackStatusChanged:'audio'};
 window.audioRooms=[];window.audioTracks=[];
 const sources={Camera:'camera',Microphone:'microphone'};
 const makeLocalTrack=kind=>{const el=document.createElement(kind==='video'?'video':'audio');if(kind==='video')el.dataset.camera='persistent';return {kind,mediaStreamTrack:{readyState:'live'},muted:false,attach:()=>el,detach:()=>[el],async mute(){this.muted=true;},async unmute(){this.muted=false;},stop(){this.mediaStreamTrack.readyState='ended';}};};
 class Room{
  constructor(){this.handlers={};this.state='disconnected';this.canPlaybackAudio=false;this.starts=0;this.blocked=false;this.remoteParticipants=new Map();const publications=new Map();this.localParticipant={identity:'p0',isMicrophoneEnabled:false,isCameraEnabled:false,getTrackPublication:source=>publications.get(source),publishTrack:async(track,options)=>{const pub={track};publications.set(options.source,pub);if(options.source===sources.Camera)this.localParticipant.isCameraEnabled=true;if(options.source===sources.Microphone)this.localParticipant.isMicrophoneEnabled=true;this.emit(events.LocalTrackPublished,pub);return pub;},setCameraEnabled:async enabled=>{this.localParticipant.isCameraEnabled=enabled;if(!enabled)return;const track=makeLocalTrack('video'),pub={track};publications.set(sources.Camera,pub);this.emit(events.LocalTrackPublished,pub);return pub;},setMicrophoneEnabled:async enabled=>{this.localParticipant.isMicrophoneEnabled=enabled;if(!enabled){await publications.get(sources.Microphone)?.track?.mute?.();return publications.get(sources.Microphone);}let pub=publications.get(sources.Microphone);if(!pub){pub={track:makeLocalTrack('audio')};publications.set(sources.Microphone,pub);}await pub.track.unmute();return pub;}};window.audioRooms.push(this);}
  on(name,fn){(this.handlers[name]||=[]).push(fn);return this;}
  emit(name,...args){for(const fn of this.handlers[name]||[])fn(...args);}
  async connect(url,token){this.state='connected';this.token=token;}
  async disconnect(stop=true){this.state='disconnected';if(stop)for(const pub of this.localParticipant.trackPublications?.values?.()||[])pub.track.stop();this.emit(events.Disconnected);}
  async startAudio(){this.starts++;this.canPlaybackAudio=!this.blocked;this.emit(events.AudioPlaybackStatusChanged);}
 }
 window.LivekitClient={Room,RoomEvent:events,Track:{Source:sources},VideoPresets:{h360:{resolution:{width:640,height:360}}}};
 window.addRemoteAudio=(sid)=>{const el=document.createElement('audio');const track={sid,kind:'audio',volume:1,setVolume(n){this.volume=n;el.volume=n;},attach:()=>el,detach:()=>[el]};window.audioTracks.push(track);window.audioRooms.at(-1).emit(events.TrackSubscribed,track,{}, {identity:'p1'});return track;};
}
(async()=>{
 const rules=await import('../supabase/functions/mafia/engine.mjs'),root=path.resolve(__dirname,'..');
 const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+new URL(req.url,'http://localhost').pathname);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}try{res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.mp3')?'audio/mpeg':'text/html');res.end(fs.readFileSync(file));}catch{res.writeHead(404).end();}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage(),errors=[];let state;let mediaCalls=0;
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://cdn.jsdelivr.net/npm/@supabase/**',route=>route.fulfill({contentType:'text/javascript',body:`window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:{access_token:'test-session',user:{id:'p0'}}}})}})};`}));
 await page.route('https://cdn.jsdelivr.net/npm/livekit-client@**',route=>route.fulfill({contentType:'text/javascript',body:'('+mediaFixture.toString()+')();'}));
 await page.route('**/functions/v1/mafia',async route=>{const body=JSON.parse(route.request().postData());if(body.op==='media'){mediaCalls++;await route.fulfill({status:503,json:{error:'Test provider unavailable'}});return;}if(body.op==='catalog'){await route.fulfill({json:{roles:rules.ROLES,actions:rules.ACTION_LABELS,mediaConfigured:true}});return;}
  if(body.op==='create')state=rules.joinGame(rules.createGame('ABC234','p0','Host','media'),'p1','Guest');
  await route.fulfill({json:{game:rules.publicView(state,'p0'),mediaConfigured:true,...(body.op==='media'?{connection:{url:'wss://test.livekit.cloud',token:'test-only',epoch:state.epoch,...(state.settings.cameraMode==='open'?{video:{url:'wss://test.livekit.cloud',token:'test-video',room:rules.mediaPolicy(state,'p0').videoRoom}}:{})}}:{})}});
 });
 try{
 await page.goto('http://127.0.0.1:'+server.address().port+'/mafia/index.html');await page.waitForSelector('#playerName');await page.locator('#playerName').fill('Audit');await page.locator('.entry-actions>.primary').click();
 await page.locator('#toolbar>button').first().click();await page.waitForTimeout(18000);
 console.log(JSON.stringify({probe:'provider_failure_retries_without_user',mediaCalls,notice:await page.locator('#notice').innerText()}));
 await page.screenshot({path:path.join(root,'reports/audit-2026-11-14/01-provider-retry.png'),fullPage:true});
 assert.equal(mediaCalls,3,'At most three automatic attempts');await page.waitForTimeout(6500);assert.equal(mediaCalls,3,'Retry circuit stays stopped');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});