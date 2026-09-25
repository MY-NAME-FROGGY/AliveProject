(function(w){
 'use strict';
 const recorded=w.MafiaSoundRecordings||{};
 const files={turn:recorded.turn||'01-your-turn.mp3',wake:recorded.wake||'02-wake-up.mp3',warning:recorded.warning||'03-ten-seconds.mp3',sleep:recorded.sleep||'04-sleep.mp3',dawn:recorded.wake||'02-wake-up.mp3'};
 const labels={turn:'Твой ход',wake:'Просыпаемся — три раза',warning:'Осталось десять секунд',sleep:'Засыпаем',dawn:'Город просыпается'};
 const stored=Number(localStorage.getItem('mafiaSignalVolume')??40);
 let volume=Number.isFinite(stored)?Math.max(0,Math.min(100,stored)):40,enabled=localStorage.getItem('mafiaSignals')==='on';
 let current=null,lastPhase=null,lastWake=null,lastWarning=null,lastMine=false,generation=0,delayed=null;
 const pool=new Map();
 function status(text){const el=document.getElementById('signalStatus');if(el)el.textContent=text;}
 function stop(){generation++;if(delayed){clearTimeout(delayed);delayed=null;}if(current){current.onended=null;current.pause();current.currentTime=0;current=null;}}
 async function play(kind,test=false,repeat=1,after=null){
  if(!files[kind]||(!test&&!enabled))return;
  stop();const ticket=generation;
  if(!volume){status('Громкость сигналов — 0%. Передвиньте ползунок для проверки.');return;}
  let sound=pool.get(kind);if(!sound){const source=files[kind].startsWith('data:')?files[kind]:'sounds/'+files[kind];sound=new Audio(source);sound.preload='auto';pool.set(kind,sound);}
  current=sound;sound.volume=volume/100;sound.currentTime=0;
  try{await sound.play();if(ticket!==generation){if(current!==sound)sound.pause();return;}let remaining=Math.max(0,repeat-1);sound.onended=()=>{if(ticket!==generation)return;if(remaining){sound.currentTime=0;remaining--;sound.play().catch(()=>{});return;}sound.onended=null;if(after)after();};status(test?'Проверка: '+labels[kind]+' · '+volume+'%':'Сигналы включены · '+volume+'%');}
  catch(e){if(ticket===generation)status(e.name==='NotAllowedError'?'Нажмите «Проверить звук», чтобы разрешить сигналы.':'Не удалось воспроизвести сигнал. Проверьте подключение и повторите.');}
 }
 function sync(){const toggle=document.getElementById('signalsEnabled');if(toggle)toggle.checked=enabled;const output=document.getElementById('signalVolumeValue');if(output)output.textContent=volume+'%';}
 function mount(el,expanded=true){if(!el||el.children.length)return;el.innerHTML=`<details class="panel sound-settings" ${expanded?'open':''}><summary>Звуки игры</summary><label class="signal-toggle"><input id="signalsEnabled" type="checkbox" onchange="MafiaSignals.enable(this.checked)"> Звуковые сигналы</label><label for="signalVolume">Громкость сигналов <output id="signalVolumeValue" for="signalVolume">${volume}%</output></label><input id="signalVolume" type="range" min="0" max="100" step="1" value="${volume}" oninput="MafiaSignals.volume(this.value)"><div class="signal-test"><select id="signalSample" aria-label="Проверочный сигнал">${Object.entries(labels).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select><button type="button" onclick="MafiaSignals.test()">Проверить звук</button></div><p id="signalStatus" class="hint" role="status">Проверьте громкость до начала партии. Кнопка проверки включает сигналы.</p><p class="hint">Отдельно от голосового чата. Каждый живой игрок слышит нейтральный сигнал при смене ночного пробуждения; активная роль получает отдельный сигнал «Ваш ход».</p></details>`;sync();}
 function enable(value){enabled=!!value;localStorage.setItem('mafiaSignals',enabled?'on':'off');if(!enabled)stop();sync();status(enabled?'Сигналы включены. Нажмите «Проверить звук».':'Сигналы выключены.');}
 function setVolume(value){volume=Math.max(0,Math.min(100,Number(value)||0));localStorage.setItem('mafiaSignalVolume',String(volume));if(current)current.volume=volume/100;sync();}
 async function test(){enable(true);await play(document.getElementById('signalSample')?.value||'turn',true);}
 function observe(game,now=Date.now()){
  if(!game){stop();lastPhase=lastWake=lastWarning=null;lastMine=false;return;}
  if(game.paused){stop();return;}
  const phase=[game.code,game.round,game.phase].join(':'),wake=phase+':'+game.epoch;
  let enteredNight=false;if(phase!==lastPhase){const hadPhase=lastPhase!==null;lastPhase=phase;lastWake=null;lastWarning=null;lastMine=false;
   const panel=document.getElementById('soundSettings');if(game.phase!=='lobby'&&panel?.firstElementChild)panel.firstElementChild.open=false;
  if(game.phase==='night'&&(game.wake?.index===0||!game.wake)){enteredNight=true;play('sleep');}
   else if(hadPhase&&(game.phase==='day'||game.phase==='finished'))play('dawn');
   else if(hadPhase&&game.phase==='voting')play('turn');
  }
  if(wake!==lastWake){lastWake=wake;if(game.phase==='night'&&game.wake?.key!=='pause'){if(game.wake?.mine){const wakeThenTurn=()=>play('wake',false,3,()=>play('turn'));if(enteredNight){const expected=wake;delayed=setTimeout(()=>{delayed=null;if(lastWake===expected&&lastMine)wakeThenTurn();},1800);}else wakeThenTurn();}else if(game.me?.alive!==false&&!game.me?.moderator&&!enteredNight)play('sleep');}else if(game.phase==='nomination'&&game.nomination?.currentId===game.me?.id)play('turn');lastMine=!!game.wake?.mine;}
  const deadline=game.wake?.deadline||game.deadline,remaining=deadline-now,warning=wake+':'+deadline;
  const personal=game.phase==='night'&&game.wake?.mine||game.phase==='nomination'&&game.nomination?.currentId===game.me?.id;
  if(personal&&remaining>0&&remaining<=10000&&warning!==lastWarning){lastWarning=warning;play('warning');}
 }
 w.MafiaSignals={mount,enable,volume:setVolume,test,observe,stop};
})(window);
