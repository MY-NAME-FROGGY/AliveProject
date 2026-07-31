/* AliveProject — Stage 3 effect registry.
 * Здесь находятся игровые механики. Неразмеченные карты не тратятся.
 */
(function (window) {
  'use strict';
  const E = window.AliveEffectEngine;
  if (!E) throw new Error('effect-engine.js must load first');

  const roomCode = ctx => ctx.room.code;
  const round = ctx => ctx.room.current_round || 1;
  const targetId = ctx => (ctx.targets[0] && (ctx.targets[0].id || ctx.targets[0])) || null;
  const db = ctx => ctx.db;

  const playerCards = async (ctx, playerId) => {
    const { data, error } = await db(ctx).from('player_cards')
      .select('*').eq('room_code', roomCode(ctx)).eq('player_id', playerId).order('id');
    if (error) throw error;
    return data || [];
  };

  const publicTraits = cards => cards.filter(c =>
    c.category !== 'special_condition' && c.category !== 'goal' && c.revealed === true
  );

  const traitCategories = cards => [...new Set(publicTraits(cards).map(c => c.category))];

  async function addRoundEffect(ctx, payload) {
    const { data, error } = await db(ctx).from('round_effects').insert({
      room_code: roomCode(ctx),
      round: round(ctx),
      effect_key: ctx.effectKey,
      source_player_id: ctx.player.id,
      target_player_id: payload.target_player_id || null,
      target_property_id: payload.target_property_id || null,
      effect_params: payload.effect_params || {},
      is_active: true
    }).select().single();
    if (error) throw error;
    return data;
  }

  async function pickTrait(ctx, targetPlayerId, title) {
    const cards = publicTraits(await playerCards(ctx, targetPlayerId));
    if (!cards.length) throw new Error('У выбранного игрока нет открытых характеристик.');
    if (window.AliveEffectsUI?.pickTrait) {
      return window.AliveEffectsUI.pickTrait(cards, title);
    }
    const categories = traitCategories(cards);
    const raw = window.prompt(`${title}\n\n${categories.map((x,i)=>`${i+1}. ${x}`).join('\n')}\n\nВведите номер:`);
    if (raw === null) return null;
    const idx = Number(raw) - 1;
    if (!Number.isInteger(idx) || !categories[idx]) throw new Error('Некорректный выбор характеристики.');
    return cards.find(c => c.category === categories[idx]);
  }

  async function getOwnTrait(ctx, category) {
    const cards = await playerCards(ctx, ctx.player.id);
    return cards.find(c => c.category === category);
  }

  async function patchCard(ctx, id, patch) {
    const { data, error } = await db(ctx).from('player_cards')
      .update(patch).eq('id', id).select('*').maybeSingle();
    if (error) throw error;
    if (!data) throw new Error('Характеристика больше недоступна.');
    return data;
  }

  async function swapSnapshots(ctx, a, b) {
    const snapA = { text: a.text, value: a.value, revealed: a.revealed };
    const snapB = { text: b.text, value: b.value, revealed: b.revealed };
    try {
      await patchCard(ctx, a.id, snapB);
      await patchCard(ctx, b.id, snapA);
    } catch (error) {
      // Лучшее доступное клиентское восстановление до перехода на RPC.
      try { await patchCard(ctx, a.id, snapA); } catch (_) {}
      throw error;
    }
  }

  E.register('vote_immunity', async ctx => {
    await addRoundEffect(ctx, { target_player_id: ctx.player.id, effect_params: { duration: 'round' } });
  }, { targetType: 'self', eventType: 'positive' });

  E.register('vote_nullified', async ctx => {
    await addRoundEffect(ctx, { target_player_id: targetId(ctx) });
  }, { targetType: 'one', eventType: 'negative' });

  E.register('vote_weight', async ctx => {
    await addRoundEffect(ctx, {
      target_player_id: targetId(ctx),
      effect_params: { weight: Number(ctx.params.weight || 2) }
    });
  }, { targetType: 'one', eventType: 'positive' });

  E.register('reduce_capacity', async ctx => {
    const property = ctx.targets[0];
    await addRoundEffect(ctx, {
      target_property_id: property.id || property.property_id || property,
      effect_params: { amount: Number(ctx.params.amount || 1) }
    });
  }, { targetType: 'one', eventType: 'negative' });

  E.register('block_bunker_property', async ctx => {
    const property = ctx.targets[0];
    await addRoundEffect(ctx, {
      target_property_id: property.id || property.property_id || property
    });
  }, { targetType: 'one', eventType: 'negative' });

  E.register('block_luggage', async ctx => {
    await addRoundEffect(ctx, {
      target_player_id: targetId(ctx),
      effect_params: { categories: ['luggage_big', 'luggage_small'], duration: 'round' }
    });
  }, { targetType: 'one', eventType: 'negative' });

  E.register('steal_trait', async ctx => {
    const target = targetId(ctx);
    const selected = await pickTrait(ctx, target, 'ОГРАБЛЕНИЕ — какую открытую характеристику забрать?');
    if (!selected) return false;

    const mine = await getOwnTrait(ctx, selected.category);
    if (!mine) throw new Error(`У вас нет характеристики категории «${selected.category}».`);

    const mineSnap = { text: mine.text, value: mine.value, revealed: mine.revealed };
    const stolenSnap = { text: selected.text, value: selected.value, revealed: true };
    try {
      await patchCard(ctx, mine.id, stolenSnap);
      await patchCard(ctx, selected.id, { text: '[Характеристика украдена]', value: 0, revealed: true });
    } catch (error) {
      try { await patchCard(ctx, mine.id, mineSnap); } catch (_) {}
      throw error;
    }
    return { changedCategory: selected.category, targetPlayerId: target };
  }, { targetType: 'one', eventType: 'negative', eventText: (ctx, r) => `${ctx.player.name || 'Игрок'} украл(а) у цели характеристику «${r?.changedCategory || 'неизвестно'}».` });

  E.register('swap_trait', async ctx => {
    const target = targetId(ctx);
    const selected = await pickTrait(ctx, target, 'ОБМЕН — какую открытую характеристику обменять?');
    if (!selected) return false;
    const mine = await getOwnTrait(ctx, selected.category);
    if (!mine) throw new Error(`У вас нет характеристики категории «${selected.category}».`);
    await swapSnapshots(ctx, mine, selected);
    return { changedCategory: selected.category, targetPlayerId: target };
  }, { targetType: 'one', eventType: 'neutral', eventText: (ctx, r) => `${ctx.player.name || 'Игрок'} обменял(а) характеристику «${r?.changedCategory || 'неизвестно'}» с выбранным игроком.` });

  E.register('copy_trait', async ctx => {
    const target = targetId(ctx);
    const selected = await pickTrait(ctx, target, 'КОПИРОВАНИЕ — какую открытую характеристику скопировать?');
    if (!selected) return false;
    const mine = await getOwnTrait(ctx, selected.category);
    if (!mine) throw new Error(`У вас нет характеристики категории «${selected.category}».`);
    await patchCard(ctx, mine.id, { text: selected.text, value: selected.value, revealed: true });
    return { changedCategory: selected.category, targetPlayerId: target };
  }, { targetType: 'one', eventType: 'positive', eventText: (ctx, r) => `${ctx.player.name || 'Игрок'} скопировал(а) характеристику «${r?.changedCategory || 'неизвестно'}».` });

  E.register('inherit_trait', async ctx => {
    const target = targetId(ctx);
    const selected = await pickTrait(ctx, target, 'НАСЛЕДСТВО — какую открытую характеристику получить?');
    if (!selected) return false;
    const mine = await getOwnTrait(ctx, selected.category);
    if (!mine) throw new Error(`У вас нет характеристики категории «${selected.category}».`);
    await patchCard(ctx, mine.id, { text: selected.text, value: selected.value, revealed: true });
    return { changedCategory: selected.category, targetPlayerId: target };
  }, { targetType: 'one', eventType: 'positive', eventText: (ctx, r) => `${ctx.player.name || 'Игрок'} получил(а) наследство: «${r?.changedCategory || 'неизвестно'}».` });

  window.AliveEffectRegistry = { initialized: true };
})(window);
