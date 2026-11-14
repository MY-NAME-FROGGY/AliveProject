(function(w){
 'use strict';
 const $=id=>document.getElementById(id),esc=s=>escapeHtml(String(s??''));
 const standalone=/\/host\.html$/.test(location.pathname),prefs=(()=>{try{return JSON.parse(localStorage.getItem('bunkerPreferences')||'{}');}catch{return {};}})();
 let comboCode='',combos=[],comboAt=0,comboPromise=null,scheduled=false,lastGuide='',guideNode=null,routeContext='';
 const routesEnabled=()=>isHost()&&state.room.scenario_id!=='SC08'&&state.room.card_mode!=='preset';
 const contextKey=()=>[state.currentRoomCode,state.room?.scenario_id,state.room?.card_mode,state.playerId,state.room?.host_id].join(':');
 const isHost=()=>!!state.room&&state.room.host_id===state.playerId;
 function preferences(){document.body.dataset.density=prefs.density||'comfortable';document.body.classList.toggle('quiet-motion',!!prefs.quiet);document.documentElement.style.setProperty('--read-scale',prefs.large?'1.12':'1');}
 function controls(){if($('bunkerPreferences'))return;const el=document.createElement('details');el.id='bunkerPreferences';el.className='experience-preferences';el.innerHTML=`<summary>Вид и удобство</summary><label>Плотность <select id="bunkerDensity"><option value="comfortable">Удобная</option><option value="compact">Компактная</option></select></label><label><input id="bunkerLarge" type="checkbox"> Увеличить текст</label><label><input id="bunkerQuiet" type="checkbox"> Меньше анимации</label><p>Оформление сохраняется на этом устройстве. Цвет карточки меняется в лобби.</p>`;document.body.append(el);$('bunkerDensity').value=prefs.density||'comfortable';$('bunkerLarge').checked=!!prefs.large;$('bunkerQuiet').checked=!!prefs.quiet;el.addEventListener('change',()=>{prefs.density=$('bunkerDensity').value;prefs.large=$('bunkerLarge').checked;prefs.quiet=$('bunkerQuiet').checked;localStorage.setItem('bunkerPreferences',JSON.stringify(prefs));preferences();});}
 function guide(){if(!state.room||!['game','lobby'].includes(state.view))return;const me=state.players.find(p=>p.id===state.playerId),r=state.room;let title='',text='';
  if(state.view==='lobby'){title='До начала партии';text=isHost()?'Выберите сценарий, состав колоды и число мест. После готовности игроков начните партию.':'Выберите внешний вид, проверьте настройки и подтвердите готовность.';}
  else if(isHost()){title='Вы управляете партией';text='Таймер и переход этапа — сверху. Карты, ресурсы, связки и исправления — в рабочем месте ведущего.';}
  else if(me?.is_alive===false){title='Вы наблюдаете';text='Ваши карты сохранены. Голосование и раскрытие недоступны; ведущий может вернуть вас в игру.';}
  else {const active=getRevealOrder(r,state.players)?.[r.reveal_index||0];const map={reveal:[active?.id===state.playerId?'Ваш ход':'Ожидайте своей очереди',active?.id===state.playerId?'Откройте разрешённые характеристики в разделе «Мои карты».':'Сейчас раскрывает карты '+(active?.name||'другой игрок')+'.'],discussion:['Обсудите состав группы','Ищите сочетания навыков, инструментов и знаний. Сильная карта без остальных компонентов может не решить задачу.'],nomination:['Выдвижение кандидатов','Выберите другого игрока кнопкой на его карточке. Сохранённое выдвижение отмечается в интерфейсе.'],voting:['Пора голосовать','Посмотрите кандидатов и подтвердите свой выбор. Таймер показывает оставшееся время.'],defense:['Время защиты','Слушайте выступающего и объясните пользу своего набора, когда наступит ваша очередь.'],awaiting_verdict:['Состав выбран','Ведущий проверяет, какие задачи группа может решить оставшимися характеристиками и ресурсами.'],finished:['Партия завершена','Откройте хронику и обсудите решения группы.']};[title,text]=map[r.current_phase]||['Следите за этапом','Подсказки и доступные действия появятся здесь.'];}
  if(!guideNode||!guideNode.isConnected){guideNode=document.createElement('section');guideNode.id='bunkerTaskGuide';guideNode.setAttribute('role','status');const target=document.querySelector('.game-layout,.lobby-grid');if(target)target.before(guideNode);else return;lastGuide='';}
  const html=`<strong>${esc(title)}</strong><span>${esc(text)}</span>${isHost()?`<a class="btn btn-primary btn-sm" href="${standalone?'index.html':'host.html'}">${standalone?'Вернуться за стол':'Рабочее место ведущего'}</a>`:''}`;if(html!==lastGuide){guideNode.innerHTML=html;lastGuide=html;}
 }
 async function refreshCombos(force=false){
  if(!routesEnabled()||!['game','lobby'].includes(state.view)){combos=[];comboCode='';routeContext='';comboAt=0;$('victoryRoutes')?.remove();return;}
  if(comboPromise)return comboPromise;
  const context=contextKey(),code=state.currentRoomCode;
  if(!force&&routeContext===context&&Date.now()-comboAt<10000)return;
  comboPromise=(async()=>{try{
   const {data,error}=await supabaseClient.rpc('alive_combo_status',{p_code:code});
   if(error)throw error;
   if(!routesEnabled()||context!==contextKey())return;
   combos=Array.isArray(data)?data:[];comboCode=code;routeContext=context;comboAt=Date.now();renderCombos();
  }catch(error){console.warn('Victory routes',error.message);}finally{comboPromise=null;}})();
  return comboPromise;
 }
 function renderCombos(){
  if(!routesEnabled()||routeContext!==contextKey()){$('victoryRoutes')?.remove();return;}
  if(comboCode!==state.currentRoomCode)return;
  let el=$('victoryRoutes');
  if(!el){const target=$('hostMasterPanel');if(!target)return;el=document.createElement('section');el.id='victoryRoutes';el.className='panel';target.append(el);}
  const content=combos.length?combos.map(route=>`<article class="victory-route"><div class="route-heading"><strong>${esc(route.title)}</strong><span class="route-score ${route.surviving===route.required?'ready':'incomplete'}">${route.surviving}/${route.required} карт</span></div><details data-route="${esc(route.route)}"><summary>Карты</summary><ul>${route.parts.map(part=>`<li>${part.cards.length?part.cards.map(c=>`<b>${esc(c.player)}</b>: ${esc(c.text)}${c.alive?'':' · выбыл'}${c.usable===false?' · недоступна':''}`).join('<br>'):'Карта отсутствует'}</li>`).join('')}</ul></details></article>`).join(''):'<p class="muted-note">Связки появятся после раздачи.</p>';
  const html=`<h3>Связки · ведущий</h3>${content}<button class="btn btn-ghost btn-sm" onclick="AliveExperience.refreshCombos(true)">Обновить</button>`;
  if(el._routeMarkup!==html){const open=new Set([...el.querySelectorAll('details[open]')].map(x=>x.dataset.route));el.innerHTML=html;el._routeMarkup=html;for(const d of el.querySelectorAll('details'))d.open=open.has(d.dataset.route);}
 }
 function refresh(){controls();preferences();guide();if(standalone){document.body.classList.add('host-control-page');document.body.classList.toggle('host-authorized',isHost());let denied=$('hostAccessMessage');if(state.room&&!isHost()&&!denied){denied=document.createElement('section');denied.id='hostAccessMessage';denied.className='panel';denied.textContent='Это рабочее место доступно ведущему вашей комнаты. Войдите под аккаунтом ведущего или вернитесь за игровой стол.';$('app').prepend(denied);}if(isHost())denied?.remove();}const layout=document.querySelector('.game-layout');if(layout){const top=layout.getBoundingClientRect().top+window.scrollY;document.documentElement.style.setProperty('--workspace-top',top+'px');}renderCombos();refreshCombos();}
 function schedule(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;refresh();});}
 new MutationObserver(schedule).observe($('app'),{childList:true,subtree:true});
 setInterval(()=>{if(document.visibilityState==='visible')refreshCombos();},10000);
 const announce=w.actionAnnounceVerdict;let announcing=false;
 w.actionAnnounceVerdict=async()=>{if(announcing)return;announcing=true;try{await refreshCombos(true);const missing=(routesEnabled()?combos:[]).filter(x=>x.surviving!==null&&x.surviving<x.required);if(isHost()&&state.room?.verdict==='victory'&&missing.length){const reason=prompt('Не собраны связки: '+missing.map(x=>x.title).join('; ')+'. Опишите альтернативный план выживания (от 20 символов):');if(reason===null)return;if(reason.trim().length<20){alert('Опишите альтернативный план подробнее — от 20 символов.');return;}await dbUpdateRoom(state.currentRoomCode,{settings:{...state.room.settings,combo_override:reason.trim()}});await dbInsertEvent(state.currentRoomCode,state.room.current_round,'neutral','Альтернативный план выживания: '+reason.trim(),null,false);}else if(isHost()&&state.room?.verdict==='victory'&&routesEnabled()&&combos.length&&!confirm('Связки собраны. Проверьте запасы, время и ограничения обоих планов. Объявить общую победу?'))return;await announce();}catch(error){alert(error.message||'Не удалось сохранить вердикт');}finally{announcing=false;}};
 w.addEventListener('resize',schedule);w.AliveExperience={refreshCombos};preferences();schedule();
})(window);
