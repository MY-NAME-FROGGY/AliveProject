(function(w){
 'use strict';
 const files={turn:'01-your-turn.wav',warning:'02-five-seconds.wav',night:'03-city-sleeps.wav',dawn:'04-dawn.wav'};
 const labels={turn:'Ваш ход',warning:'Осталось пять секунд',night:'Город засыпает',dawn:'Рассвет'};
 const stored=Number(localStorage.getItem('mafiaSignalVolume')??40);
 let volume=Number.isFinite(stored)?Math.max(0,Math.min(100,stored)):40,enabled=localStorage.getItem('mafiaSignals')==='on';
 let current=null,lastPhase=null,lastWake=null,lastWarning=null,lastMine=false,generation=0,delayed=null;
 const pool=new Map();
 function status(text){const el=document.getElementById('signalStatus');if(el)el.textContent=text;}
 function stop(){generation++;if(delayed){clearTimeout(delayed);delayed=null;}if(current){current.pause();current.currentTime=0;current=null;}}
 async function play(kind,test=false){
  if(!files[kind]||(!test&&!enabled))return;
  stop();const ticket=generation;
  if(!volume){status('Громкость сигналов — 0%. Передвиньте ползунок для проверки.');return;}
  let sound=pool.get(kind);if(!sound){sound=new Audio('sounds/'+files[kind]);sound.preload='auto';pool.set(kind,sound);}
  current=sound;sound.volume=volume/100;sound.currentTime=0;
  try{await sound.play();if(ticket!==generation){if(current!==sound)sound.pause();return;}status(test?'Проверка: '+labels[kind]+' · '+volume+'%':'Сигналы включены · '+volume+'%');}
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
   if(game.phase==='night'&&(game.wake?.index===0||!game.wake)){enteredNight=true;play('night');}
   else if(hadPhase&&(game.phase==='day'||game.phase==='finished'))play('dawn');
   else if(hadPhase&&game.phase==='voting')play('turn');
  }
  if(wake!==lastWake){lastWake=wake;if(game.phase==='night'){if(game.wake?.mine){if(enteredNight){const expected=wake;delayed=setTimeout(()=>{delayed=null;if(lastWake===expected&&lastMine)play('turn');},1800);}else play('turn');}else if(game.me?.alive!==false&&!game.me?.moderator&&!enteredNight)play('night');}lastMine=!!game.wake?.mine;}
  const deadline=game.wake?.deadline||game.deadline,remaining=deadline-now,warning=wake+':'+deadline;
  if(game.phase==='night'&&game.wake?.mine&&remaining>0&&remaining<=5000&&warning!==lastWarning){lastWarning=warning;play('warning');}
 }
 w.MafiaSignals={mount,enable,volume:setVolume,test,observe,stop};
})(window);
