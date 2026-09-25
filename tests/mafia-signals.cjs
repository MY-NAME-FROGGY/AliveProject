const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const plays=[],audios=[],saved=new Map(),elements={signalSample:{value:'turn'},signalStatus:{textContent:''},signalsEnabled:{checked:false},signalVolumeValue:{textContent:''}};
class Audio{constructor(url){this.url=url;this.currentTime=0;this.volume=1;audios.push(this);}play(){plays.push({url:this.url,volume:this.volume});return Promise.resolve();}pause(){this.paused=true;}}
const context={Audio,window:{},localStorage:{getItem:k=>saved.get(k)??null,setItem:(k,v)=>saved.set(k,v)},document:{getElementById:k=>elements[k]}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../mafia/signals.js'),'utf8'),context);
const signals=context.window.MafiaSignals;
(async()=>{
 signals.volume(23);await signals.test();assert.equal(plays.at(-1).volume,.23);assert.equal(saved.get('mafiaSignalVolume'),'23');assert.equal(saved.get('mafiaSignals'),'on');
 const game={code:'ABC',round:1,phase:'lobby',epoch:0,me:{id:'p0'}};signals.observe(game,0);
 game.phase='night';game.epoch=1;game.wake={key:'doctor',index:0,mine:false,deadline:30000};signals.observe(game,1);assert.ok(plays.at(-1).url.endsWith('04-sleep.mp3'));
 let count=plays.length;signals.observe(game,100);assert.equal(plays.length,count,'poll does not repeat phase cue');
 game.epoch=2;game.wake={key:'sheriff',index:1,mine:true,deadline:60000};signals.observe(game,31000);await new Promise(r=>setTimeout(r,0));assert.ok(plays.at(-1).url.endsWith('02-wake-up.mp3'));const wakeSound=audios.filter(a=>a.url.endsWith('02-wake-up.mp3')).at(-1),beforeRepeat=plays.length;assert.equal(typeof wakeSound.onended,'function');wakeSound.onended();wakeSound.onended();assert.equal(plays.length,beforeRepeat+2,'role wake repeats three times total');wakeSound.onended();await new Promise(r=>setTimeout(r,0));assert.ok(plays.at(-1).url.endsWith('01-your-turn.mp3'),'active night role hears your-turn after the three wake calls');signals.observe(game,50001);assert.ok(plays.at(-1).url.endsWith('03-ten-seconds.mp3'));count=plays.length;signals.observe(game,55500);signals.observe(game,60000);assert.equal(plays.length,count,'warning fires once, never at expired deadline');
 game.paused=true;game.epoch++;signals.observe(game,50000);assert.equal(plays.length,count,'pause produces no cue');game.paused=false;
 game.wake.mine=false;signals.observe(game,60500);assert.ok(plays.at(-1).url.endsWith('04-sleep.mp3'),'end of personal wake asks player to sleep');
 count=plays.length;game.epoch++;game.wake={key:'pause',index:2,mine:false,deadline:63000};signals.observe(game,61000);assert.equal(plays.length,count,'transition pause is intentionally silent');
 game.epoch++;game.wake={key:'mafia',index:2,mine:false,deadline:90000};signals.observe(game,64000);assert.equal(plays.length,count+1,'inactive living player hears the next sleep reminder');assert.ok(plays.at(-1).url.endsWith('04-sleep.mp3'));
 count=plays.length;game.me.alive=false;game.epoch++;game.wake={key:'doctor',index:3,mine:false,deadline:120000};signals.observe(game,91000);assert.equal(plays.length,count,'observer does not receive sleep reminders');game.me.alive=true;
 game.phase='day';game.epoch++;signals.observe(game,61000);assert.ok(plays.at(-1).url.endsWith('02-wake-up.mp3'));
 game.phase='nomination';game.epoch++;delete game.wake;game.deadline=80000;game.nomination={currentId:'p0'};signals.observe(game,62000);assert.ok(plays.at(-1).url.endsWith('01-your-turn.mp3'),'personal nomination announces the speaker');signals.observe(game,70001);assert.ok(plays.at(-1).url.endsWith('03-ten-seconds.mp3'),'personal nomination warns before timeout');
 signals.volume(0);count=plays.length;await signals.test();assert.equal(plays.length,count);assert.match(elements.signalStatus.textContent,/0%/);
 signals.volume(70);signals.enable(false);game.phase='voting';game.epoch++;signals.observe(game,62000);assert.equal(plays.length,count,'disabled signals stay silent');
 const embedded={window:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../mafia/sound-recordings.js'),'utf8'),embedded);const names={turn:'01-your-turn.mp3',wake:'02-wake-up.mp3',warning:'03-ten-seconds.mp3',sleep:'04-sleep.mp3'};
 for(const [key,name] of Object.entries(names)){const data=fs.readFileSync(path.join(__dirname,'../mafia/sounds',name));assert.ok(data.length>50000);assert.notEqual(data.toString('ascii',0,4),'RIFF');assert.ok(embedded.window.MafiaSoundRecordings[key].startsWith('data:audio/mpeg;base64,'));assert.deepEqual(Buffer.from(embedded.window.MafiaSoundRecordings[key].split(',')[1],'base64'),data);}
 const html=fs.readFileSync(path.join(__dirname,'../mafia/index.html'),'utf8');assert.ok(html.indexOf('sound-recordings.js')<html.indexOf('signals.js'),'embedded recordings load before the signal controller');
 console.log('Signals passed: supplied MP3 voices and byte-identical embedded delivery, three-part role wake plus your-turn cue, ten-second warning, silent transition pause, preview, saved volume, deduplication and mute.');
})().catch(e=>{console.error(e);process.exitCode=1;});
