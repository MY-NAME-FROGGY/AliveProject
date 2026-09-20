const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),path=require('node:path');
const plays=[],saved=new Map(),elements={signalSample:{value:'turn'},signalStatus:{textContent:''},signalsEnabled:{checked:false},signalVolumeValue:{textContent:''}};
class Audio{constructor(url){this.url=url;this.currentTime=0;this.volume=1;}play(){plays.push({url:this.url,volume:this.volume});return Promise.resolve();}pause(){this.paused=true;}}
const context={Audio,window:{},localStorage:{getItem:k=>saved.get(k)??null,setItem:(k,v)=>saved.set(k,v)},document:{getElementById:k=>elements[k]}};
vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../mafia/signals.js'),'utf8'),context);
const signals=context.window.MafiaSignals;
(async()=>{
 signals.volume(23);await signals.test();assert.equal(plays.at(-1).volume,.23);assert.equal(saved.get('mafiaSignalVolume'),'23');assert.equal(saved.get('mafiaSignals'),'on');
 const game={code:'ABC',round:1,phase:'lobby',epoch:0,me:{id:'p0'}};signals.observe(game,0);
 game.phase='night';game.epoch=1;game.wake={index:0,mine:false,deadline:30000};signals.observe(game,1);assert.ok(plays.at(-1).url.endsWith('03-city-sleeps.wav'));
 let count=plays.length;signals.observe(game,100);assert.equal(plays.length,count,'poll does not repeat phase cue');
 game.epoch=2;game.wake={index:1,mine:true,deadline:60000};signals.observe(game,31000);assert.ok(plays.at(-1).url.endsWith('01-your-turn.wav'));signals.observe(game,55000);assert.ok(plays.at(-1).url.endsWith('02-five-seconds.wav'));count=plays.length;signals.observe(game,55500);signals.observe(game,60000);assert.equal(plays.length,count,'warning fires once, never at expired deadline');
 game.paused=true;game.epoch++;signals.observe(game,50000);assert.equal(plays.length,count,'pause produces no cue');game.paused=false;
 game.wake.mine=false;signals.observe(game,60500);assert.ok(plays.at(-1).url.endsWith('03-city-sleeps.wav'),'end of personal wake asks player to close eyes');
 count=plays.length;game.epoch++;game.wake={index:2,mine:false,deadline:90000};signals.observe(game,61000);assert.equal(plays.length,count+1,'inactive living player hears every wake transition');assert.ok(plays.at(-1).url.endsWith('03-city-sleeps.wav'));
 count=plays.length;game.me.alive=false;game.epoch++;game.wake={index:3,mine:false,deadline:120000};signals.observe(game,91000);assert.equal(plays.length,count,'observer does not receive sleep reminders');game.me.alive=true;
 game.phase='day';game.epoch++;signals.observe(game,61000);assert.ok(plays.at(-1).url.endsWith('04-dawn.wav'));
 signals.volume(0);count=plays.length;await signals.test();assert.equal(plays.length,count);assert.match(elements.signalStatus.textContent,/0%/);
 signals.volume(70);signals.enable(false);game.phase='voting';game.epoch++;signals.observe(game,62000);assert.equal(plays.length,count,'disabled signals stay silent');
 for(const name of ['01-your-turn.wav','02-five-seconds.wav','03-city-sleeps.wav','04-dawn.wav']){const data=fs.readFileSync(path.join(__dirname,'../mafia/sounds',name));assert.equal(data.toString('ascii',0,4),'RIFF');assert.equal(data.toString('ascii',8,12),'WAVE');assert.ok(data.length>44100);}
 console.log('Signals passed: preview before game, saved volume, independent playback, wake/night/dawn/warning, deduplication, pause, mute, WAV assets.');
})().catch(e=>{console.error(e);process.exitCode=1;});
