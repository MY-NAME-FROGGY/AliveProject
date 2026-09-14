/* Scenario presentation never changes card text, chat messages, or audit records. */
(function(w){
  'use strict';
  const scenarioId='MEDIEVAL_PLAGUE_QUEEN';
  const labels=new Map([
    ['Бункер','Артефакты'],['Бункер / логи','Артефакты / хроника'],['Стол','Совет короля'],
    ['Мои карты','Мой герой'],['Моя карточка','Мой герой'],['Сценарий','Приключение'],
    ['Панель ведущего','Советник короля'],['ПАНЕЛЬ ВЕДУЩЕГО','Советник короля'],
    ['Стартовые свойства бункера','Снаряжение похода'],['Ресурсы бункера','Запасы похода'],
    ['Свойства бункера','Артефакты приключения'],['Открыть доп. свойство','Найти артефакт'],
    ['Нужно выживших','Мест в походном отряде'],['Изгнать','Оставить в замке'],
    ['Модерация и состав','Модерация и состав отряда'],
    ['Выбыл(а)','Остаётся в замке']
  ]);
  function active(){
    if(state.view==='scenarioDetail')return state.viewingScenario?.scenario?.id===scenarioId;
    return !!state.room && state.room.scenario_id===scenarioId && !['catalog','home','create','join'].includes(state.view);
  }
  function refresh(){
    const themed=active();
    if(themed)document.body.dataset.theme='medieval';else delete document.body.dataset.theme;
    const app=document.getElementById('app');if(!app)return;
    // Semantic labels only: never walk arbitrary user-supplied text nodes.
    for(const el of app.querySelectorAll('h2,h3,h4,summary,button,label,.badge-muted')){
      if(el.children.length)continue;
      const original=el.dataset.adventureOriginal||el.textContent.trim();
      const alternative=labels.get(original);
      if(alternative){el.dataset.adventureOriginal=original;const next=themed?alternative:original;if(el.textContent!==next)el.textContent=next;}
    }
    const title=app.querySelector(':scope > h1');
    if(title){const next=themed?'ПОСЛЕДНИЙ <span>ПОХОД</span>':'ОСТАТЬСЯ <span>В ЖИВЫХ</span>';if(title.innerHTML!==next)title.innerHTML=next;}
    for(const el of app.querySelectorAll('[data-player-id]')){
      const p=state.players.find(p=>p.id===el.dataset.playerId);if(p){const color=playerOutline(p);if(el.style.getPropertyValue('--player-outline')!==color)el.style.setProperty('--player-outline',color);}
    }
    const own=app.querySelector('#myCardPanel');
    if(own){const color=playerOutline(state.players.find(p=>p.id===state.playerId));if(own.style.getPropertyValue('--player-outline')!==color)own.style.setProperty('--player-outline',color);}
    let note=app.querySelector('#adventurePoolNote');
    const anchor=state.view==='lobby'?app.querySelector('#scenarioSummary'):state.view==='scenarioDetail'?app.querySelector('.panel'):null;
    if(themed && anchor && !note){note=document.createElement('p');note.id='adventurePoolNote';note.className='muted-note';note.textContent='Набор «Чумная Королева»: 400 случайных характеристик, по 40 в 10 категориях. В каждой — 20 × +1 и 20 × −1. Без готовых персонажей и новых целей; спецусловия — из общей колоды.';anchor.after(note);}
    if(note&&!themed)note.remove();
  }
  let queued=false;
  function schedule(){if(queued)return;queued=true;requestAnimationFrame(()=>{queued=false;refresh();});}
  new MutationObserver(schedule).observe(document.getElementById('app'),{childList:true,subtree:true});
  w.AliveAdventure={refresh,active};
  for(const name of ['renderLobby','renderGameTable','renderScenarioDetail','updateLobbyDynamic','updateGameDynamic']){
    const original=w[name];if(typeof original!=='function')continue;
    w[name]=function(...args){const result=original.apply(this,args);refresh();if(result&&typeof result.then==='function')return result.then(value=>{refresh();return value;});return result;};
  }
})(window);
