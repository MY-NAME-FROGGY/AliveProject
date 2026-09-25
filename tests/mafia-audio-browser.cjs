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
 await new Promise(r=>server.listen(0,'127.0.0.1',r));const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage(),errors=[];let state;
 page.on('pageerror',e=>errors.push(e.message));
 await page.route('https://cdn.jsdelivr.net/npm/@supabase/**',route=>route.fulfill({contentType:'text/javascript',body:`window.supabase={createClient:()=>({auth:{getSession:async()=>({data:{session:{access_token:'test-session',user:{id:'p0'}}}})}})};`}));
 await page.route('https://cdn.jsdelivr.net/npm/livekit-client@**',route=>route.fulfill({contentType:'text/javascript',body:'('+mediaFixture.toString()+')();'}));
 await page.route('**/functions/v1/mafia',async route=>{const body=JSON.parse(route.request().postData());if(body.op==='catalog'){await route.fulfill({json:{roles:rules.ROLES,actions:rules.ACTION_LABELS,mediaConfigured:true}});return;}
  if(body.op==='create')state=rules.joinGame(rules.createGame('ABC234','p0','Host','media'),'p1','Guest');
  await route.fulfill({json:{game:rules.publicView(state,'p0'),mediaConfigured:true,...(body.op==='media'?{connection:{url:'wss://test.livekit.cloud',token:'test-only',epoch:state.epoch,...(state.settings.cameraMode==='open'?{video:{url:'wss://test.livekit.cloud',token:'test-video',room:rules.mediaPolicy(state,'p0').videoRoom}}:{})}}:{})}});
 });
 try{
  await page.goto(`http://127.0.0.1:${server.address().port}/mafia/index.html`);await page.waitForSelector('#playerName');await page.locator('#playerName').fill('Host');await page.getByRole('button',{name:'Создать комнату',exact:true}).click();
  assert.equal(await page.locator('#audioToggle').isDisabled(),true);assert.match(await page.locator('#audioStatus').innerText(),/подключите камеру/);
  await page.getByRole('button',{name:'Подключить камеру',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('#audioToggle').disabled);await page.waitForFunction(()=>performance.getEntriesByType('resource').some(r=>r.name.includes('/functions/v1/mafia')));
  assert.equal(await page.locator('#audioToggle').innerText(),'Включить звук');await page.locator('#audioToggle').click();await page.waitForFunction(()=>document.querySelector('#audioToggle').textContent==='Выключить звук');assert.match(await page.locator('#audioStatus').innerText(),/Ожидаем микрофоны/);
  await page.reload();await page.waitForFunction(()=>document.querySelector('button')?.textContent!==undefined&&document.querySelector('#audioToggle')?.textContent==='Выключить звук');await page.waitForFunction(()=>audioRooms.length===1&&audioRooms[0].state==='connected');
  assert.equal(await page.getByRole('button',{name:'Камера подключена',exact:true}).count(),1,'camera reconnects after reload');assert.equal(await page.evaluate(()=>audioRooms[0].localParticipant.isCameraEnabled),true);assert.equal(await page.evaluate(()=>audioRooms[0].localParticipant.isMicrophoneEnabled),true);assert.equal(await page.evaluate(()=>audioRooms[0].starts),1,'incoming audio resumes after reload');
  await page.evaluate(()=>window.addRemoteAudio('track-1'));assert.equal(await page.locator('#audioTracks audio').count(),1);const guestVolume=page.getByRole('slider',{name:'Громкость игрока Guest'});await guestVolume.fill('35');assert.equal(await page.evaluate(()=>audioTracks[0].volume),.35);assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('mafiaParticipantVolumes')).p1),35);
  await page.locator('#audioToggle').click();assert.equal(await page.locator('#audioToggle').innerText(),'Включить звук');assert.equal(await page.locator('#audioToggle').getAttribute('aria-pressed'),'false');
  assert.deepEqual(await page.evaluate(()=>({muted:document.querySelector('#audioTracks audio').muted,volume:audioTracks[0].volume,mic:audioRooms[0].localParticipant.isMicrophoneEnabled,starts:audioRooms[0].starts})),{muted:true,volume:0,mic:true,starts:1});
  await page.evaluate(()=>window.addRemoteAudio('track-2'));assert.equal(await page.evaluate(()=>[...document.querySelectorAll('#audioTracks audio')].every(el=>el.muted&&el.volume===0)),true,'new speakers stay muted');
  await page.locator('#audioToggle').click();assert.equal(await page.evaluate(()=>[...document.querySelectorAll('#audioTracks audio')].every(el=>!el.muted&&el.volume===.35)),true);assert.equal(await page.locator('#audioToggle').getAttribute('aria-pressed'),'true');
  await page.evaluate(()=>{audioRooms[0].canPlaybackAudio=false;audioRooms[0].blocked=true;audioRooms[0].emit('audio');});await page.locator('#audioToggle').click();await page.waitForFunction(()=>document.querySelector('#notice').textContent.includes('Браузер заблокировал звук'));assert.equal(await page.locator('#audioToggle').innerText(),'Включить звук');
  await page.evaluate(()=>{audioRooms[0].blocked=false;});await page.locator('#audioToggle').click();await page.locator('#audioToggle').click();await page.getByRole('button',{name:'Выключить микрофон',exact:true}).click();assert.equal(await page.evaluate(()=>localStorage.getItem('mafiaMicWanted')),'off');await page.evaluate(()=>window.phaseCameraTrack=audioRooms[0].localParticipant.getTrackPublication('camera').track);
  state.epoch++;await page.waitForFunction(()=>audioRooms.length===2&&audioRooms[1].state==='connected');assert.equal(await page.evaluate(()=>audioRooms[1].localParticipant.getTrackPublication('camera').track===phaseCameraTrack),true,'phase reconnect reuses the active camera track');await page.evaluate(()=>window.addRemoteAudio('after-reconnect'));assert.equal(await page.evaluate(()=>audioTracks.at(-1).volume),0,'mute persists across media reconnect');assert.equal(await page.evaluate(()=>audioRooms[1].localParticipant.isMicrophoneEnabled),false,'disabled microphone stays disabled across phase reconnect');
  state.phase='night';state.round=1;state.epoch++;state.deadline=Date.now()+60000;state.night={actions:{},mafiaVotes:{},bonusVotes:{}};state.players.forEach(p=>p.role='citizen');
  await page.waitForFunction(()=>document.querySelector('#audioToggle').textContent==='Звук недоступен');assert.equal(await page.locator('#audioToggle').isDisabled(),true);await page.evaluate(()=>Mafia.audio());await page.waitForFunction(()=>document.querySelector('#notice').textContent.includes('недоступен по правилам'));
  state.phase='lobby';state.settings.cameraMode='open';state.epoch++;
  await page.waitForFunction(()=>audioRooms.some(r=>r.token==='test-video'&&r.state==='connected')&&!document.querySelector('#audioToggle').disabled);
  await page.evaluate(()=>{window.keptCamera=document.querySelector('[data-camera=persistent]');window.keptVideoRoom=audioRooms.find(r=>r.token==='test-video');});
  assert.ok(await page.evaluate(()=>!!keptCamera));assert.equal(await page.evaluate(()=>keptVideoRoom.localParticipant.isMicrophoneEnabled),false);
  state.phase='night';state.epoch++;state.wakeOrder=['doctor','clan'];state.wakeIndex=0;state.players[0].role='citizen';state.players[1].role='mafia';
  await page.waitForFunction(()=>document.querySelector('#audioToggle').textContent==='Звук недоступен');
  assert.equal(await page.evaluate(()=>keptCamera===document.querySelector('[data-camera=persistent]')&&keptVideoRoom.state==='connected'),true,'camera stays attached entering night');
  const roomCount=await page.evaluate(()=>audioRooms.length);state.wakeIndex=1;state.epoch++;
  await page.waitForFunction(n=>audioRooms.length>n,roomCount);
  assert.equal(await page.evaluate(()=>audioRooms.filter(r=>r.token==='test-video').length),1,'wake transition does not recreate video room');
  assert.equal(await page.evaluate(()=>keptCamera===document.querySelector('[data-camera=persistent]')&&keptVideoRoom.state==='connected'),true);
  assert.match(await page.locator('#nightNotice').innerText(),/Камеры открыты/);
  assert.deepEqual(errors,[]);console.log('Audio browser checks passed: per-participant volume, connection guard, reload recovery, retained camera/mic/sound choices, incoming/future-track mute, autoplay retry, phase reconnect and private night guard.');
 }finally{await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
