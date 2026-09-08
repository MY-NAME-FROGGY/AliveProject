/* Choices are collected locally; every effect is validated and committed on the server. */
(function(w){
 'use strict';
 const busy=new Set();
 const choose=new Set(['steal_trait','steal_trait_blind','swap_trait','swap_trait_blind','copy_trait','inherit_trait','peek_trait','protect_card','show_trait_again','reveal_own_trait_early','transfer_card','swap_between_others','swap_fact_between_others','steal_luggage_choice']);
 const own=new Set(['protect_card','reveal_own_trait_early','transfer_card']);
 const open=new Set(['steal_trait','swap_trait','copy_trait','inherit_trait','show_trait_again']);
 async function execute(id){
  if(busy.has(String(id)))return false;busy.add(String(id));
  try {
   await AliveGame.refresh();
   const card=(await dbFetchMyCard(state.currentRoomCode,state.playerId)).find(c=>String(c.id)===String(id));
   if(!card||card.used)throw Error('Карта недоступна или уже использована');
   let clone=null;
   if(card.effect_key==='clone_special_condition'){
    const source=await w.AliveEffectsUI.pick(card,state.players.filter(p=>p.id!==state.playerId&&p.id!==state.room.host_id&&p.is_alive),1);if(!source)return false;
    const options=await AliveGame.action('clone_options',{target:source[0].id,card_id:Number(id)});
    const chosen=await w.AliveEffectsUI.pick(card,options.map(e=>({...e,name:EFFECT_KEY_DESCRIPTIONS[e.effect_key]||e.effect_key})),1);if(!chosen)return false;
    clone={clone_log_id:chosen[0].id,clone_source:source[0].id};Object.assign(card,chosen[0]);
   }
   const ui=w.AliveEffectsUI,k=card.effect_key,raw=card.target_type||'self',type=w.AliveEffectEngine.normalizeTargetType(raw);
   const choices={targets:[],...(clone||{})};let targets=[];
   if(raw==='host')targets=[state.players.find(p=>p.id===state.room.host_id)];
   else if(card.target_kind==='property'){
    const props=(await dbFetchRoomBunkerProperties(state.currentRoomCode)).filter(p=>p.available&&!p.blocked&&(p.revealed||p.type==='base'));
    targets=await ui.pick(card,props,1);if(!targets)return false;choices.property_id=targets[0].id;
   }else if(type==='one'||type==='two'){
    const candidates=state.players.filter(p=>p.id!==state.room.host_id&&(p.id!==state.playerId||['one_any','two_any'].includes(raw))&&(k==='revive_player'?p.is_alive===false:k==='swap_fates'||p.is_alive!==false));
    targets=await ui.pick(card,candidates,type==='two'?2:1);if(!targets)return false;
   }else if(type==='all')targets=state.players.filter(p=>p.id!==state.playerId&&p.id!==state.room.host_id&&p.is_alive);
   choices.targets=targets.map(p=>p.id);
   if(choose.has(k)){
    let options=await AliveGame.action('card_options',{target:own.has(k)?state.playerId:choices.targets[0]});
    options=options.filter(c=>!['goal','special_condition'].includes(c.category));
    if(open.has(k))options=options.filter(c=>c.revealed);
    if(['peek_trait','reveal_own_trait_early'].includes(k))options=options.filter(c=>!c.revealed);
    if(k==='swap_fact_between_others')options=options.filter(c=>['fact1','fact2'].includes(c.category));
    if(k==='steal_luggage_choice')options=options.filter(c=>['luggage_big','luggage_small'].includes(c.category));
    if(card.effect_params?.category)options=options.filter(c=>c.category===card.effect_params.category);
    const blind=!own.has(k)&&!open.has(k);
    const selected=await ui.pickTrait(options.map(c=>({...c,text:blind?'Скрытая карта · №'+(c.slot||1):c.text})),blind?'Выберите карту вслепую':'Выберите характеристику');
    if(!selected)return false;choices.trait_id=selected.id;choices.category=selected.category;
   }
   if(k==='reveal_or_peek_fact'){const mode=await ui.pickCategory(['Только мне','Показать всем'],'Как показать факт?');if(!mode)return false;choices.mode=mode==='Только мне'?'private':'public';}
   if(k==='swap_fates'){const modes=['Вернуть изгнанного вместо себя','Обмен голосами против','Обмен выставлением','Обмен всеми картами'];const mode=await ui.pickCategory(modes,'Выберите вариант');if(!mode)return false;choices.mode=modes.indexOf(mode);}
   if(['positive_fact','false_fact'].includes(k)){choices.text=prompt('Текст факта для участников:');if(!choices.text?.trim())return false;}
   if(!await ui.confirm(card,targets.filter(Boolean)))return false;
   const result=await AliveGame.rpc('alive_effect',{p_code:state.currentRoomCode,p_card:Number(id),p_choices:choices});
   if(result.message)AliveGame.notice(result.message);await AliveGame.refresh();await loadMyCard();await refreshEventsFeed();return result.success===true;
  }catch(e){AliveGame.notice(e.message||'Не удалось применить спецусловие',true);return false;}
  finally{busy.delete(String(id));}
 }
 w.actionUseSpecialCondition=w.toggleTargetPicker=execute;
 w.AliveEffectEngine.execute=ctx=>AliveGame.rpc('alive_effect',{p_code:ctx.room.code,p_card:Number(ctx.card.id),p_choices:{targets:(ctx.targets||[]).map(t=>t.id||t)}});
 w.AliveEffects={execute,isChatBlocked:async()=>false,isPrivateChatBlocked:async()=>false,canNominate:async()=>true};
})(window);
