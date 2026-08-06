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
    // Работает и как self-карта («мой голос за двоих»), и как boost чужого голоса, если задана цель.
    await addRoundEffect(ctx, {
      target_player_id: targetId(ctx) || ctx.player.id,
      effect_params: { weight: Number(ctx.params.weight || 2) }
    });
  }, { targetType: 'one', eventType: 'positive' });

  // Бункер целиком делегируется серверному RPC execute_bunker_effect —
  // это уже готовая, проверенная логика (валидация, room_bunker_properties,
  // target_survivors), дублировать её на клиенте через round_effects не нужно.
  async function runBunkerEffect(ctx, targetPropertyId) {
    const { data, error } = await db(ctx).rpc('execute_bunker_effect', {
      p_room_code: roomCode(ctx),
      p_player_id: ctx.player.id,
      p_card_id: Number(ctx.card.id),
      p_effect_key: ctx.effectKey,
      p_target_property_id: targetPropertyId != null ? Number(targetPropertyId) : null,
      p_effect_params: ctx.params || {}
    });
    if (error) throw error;
    return { skipFinalize: true, data };
  }

  E.register('block_bunker_property', ctx => {
    const property = ctx.targets[0];
    const propertyId = property?.property_id ?? property?.id ?? property;
    if (!propertyId) throw new Error('Не выбрано свойство бункера.');
    return runBunkerEffect(ctx, propertyId);
  }, { targetType: 'one', eventType: 'negative' });

  E.register('increase_bunker_capacity', ctx => runBunkerEffect(ctx, null),
    { targetType: 'self', eventType: 'positive' });

  E.register('decrease_bunker_capacity', ctx => runBunkerEffect(ctx, null),
    { targetType: 'self', eventType: 'negative' });

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
    if (await isProtected(ctx, target, selected.category)) {
      throw new Error(`Характеристика «${selected.category}» защищена «Бронью» и не может быть украдена.`);
    }

    const mine = await getOwnTrait(ctx, selected.category);
    if (!mine) throw new Error(`У вас нет характеристики категории «${selected.category}».`);

    const mineSnap = { text: mine.text, value: mine.value, revealed: mine.revealed };
    const stolenSnap = { text: selected.text, value: selected.value, revealed: true };
    try {
      await patchCard(ctx, mine.id, stolenSnap);
      await patchCard(ctx, selected.id, { text: '[Характеристика украдена]', value: 0, revealed: true });
      await db(ctx).from('round_effects').insert({
        room_code: roomCode(ctx), round: 0, effect_key: 'trait_history',
        source_player_id: target, target_player_id: target,
        effect_params: { category: selected.category, text: selected.text, value: selected.value },
        is_active: true
      });
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
    if (await isProtected(ctx, target, selected.category)) {
      throw new Error(`Характеристика «${selected.category}» защищена «Бронью» и не может быть обменяна.`);
    }
    const mine = await getOwnTrait(ctx, selected.category);
    if (!mine) throw new Error(`У вас нет характеристики категории «${selected.category}».`);
    await swapSnapshots(ctx, mine, selected);
    return { changedCategory: selected.category, targetPlayerId: target };
  }, { targetType: 'one', eventType: 'neutral', eventText: (ctx, r) => `${ctx.player.name || 'Игрок'} обменял(а) характеристику «${r?.changedCategory || 'неизвестно'}» с выбранным игроком.` });

  function hiddenCategories(cards) {
    return [...new Set(cards.filter(c => c.category !== 'special_condition' && c.category !== 'goal').map(c => c.category))];
  }

  // Выбор категории вслепую — без показа текста. Именно здесь и работает блеф:
  // цель могла соврать о содержимом, а вор/обменщик узнает правду только после применения.
  async function pickCategoryBlind(ctx, targetPlayerId, title) {
    const cards = await playerCards(ctx, targetPlayerId);
    const categories = hiddenCategories(cards);
    if (!categories.length) throw new Error('У выбранного игрока нет характеристик для этого действия.');
    if (window.AliveEffectsUI?.pickCategory) return window.AliveEffectsUI.pickCategory(categories, title);
    const raw = window.prompt(`${title}\n\n${categories.map((x, i) => `${i + 1}. ${x}`).join('\n')}\n\nВыбор вслепую — содержимого не увидите заранее. Введите номер:`);
    if (raw === null) return null;
    const idx = Number(raw) - 1;
    if (!Number.isInteger(idx) || !categories[idx]) throw new Error('Некорректный выбор категории.');
    return categories[idx];
  }

  // «Ограбление вслепую» — забрать характеристику по категории, не зная содержимого.
  // Украденная карта остаётся скрытой ото всех (в т.ч. от факта кражи), кроме самого вора.
  E.register('steal_trait_blind', async ctx => {
    const target = targetId(ctx);
    const category = await pickCategoryBlind(ctx, target, 'ОГРАБЛЕНИЕ ВСЛЕПУЮ — выберите категорию');
    if (!category) return false;
    if (await isProtected(ctx, target, category)) {
      throw new Error(`Категория «${category}» защищена «Бронью» и не может быть украдена.`);
    }
    const mine = await getOwnTrait(ctx, category);
    if (!mine) throw new Error(`У вас нет характеристики категории «${category}».`);
    const selected = (await playerCards(ctx, target)).find(c => c.category === category);
    if (!selected) throw new Error('У цели больше нет такой характеристики.');

    const mineSnap = { text: mine.text, value: mine.value, revealed: mine.revealed };
    try {
      await patchCard(ctx, mine.id, { text: selected.text, value: selected.value, revealed: mine.revealed });
      await patchCard(ctx, selected.id, { text: '[Характеристика украдена]', value: 0, revealed: false });
      await db(ctx).from('round_effects').insert({
        room_code: roomCode(ctx), round: 0, effect_key: 'trait_history',
        source_player_id: target, target_player_id: target,
        effect_params: { category, text: selected.text, value: selected.value },
        is_active: true
      });
    } catch (error) {
      try { await patchCard(ctx, mine.id, mineSnap); } catch (_) {}
      throw error;
    }
    return { changedCategory: category, targetPlayerId: target };
  }, { targetType: 'one', eventType: 'negative', eventText: (ctx, r) => `${ctx.player.name || 'Игрок'} совершил(а) ограбление вслепую (категория «${r?.changedCategory}») — содержимое не разглашается.` });

  // «Обмен вслепую» — обе стороны меняются категорией не зная, что получат.
  E.register('swap_trait_blind', async ctx => {
    const target = targetId(ctx);
    const category = await pickCategoryBlind(ctx, target, 'ОБМЕН ВСЛЕПУЮ — выберите категорию');
    if (!category) return false;
    if (await isProtected(ctx, target, category)) {
      throw new Error(`Категория «${category}» защищена «Бронью» и не может быть обменяна.`);
    }
    const mine = await getOwnTrait(ctx, category);
    if (!mine) throw new Error(`У вас нет характеристики категории «${category}».`);
    const selected = (await playerCards(ctx, target)).find(c => c.category === category);
    if (!selected) throw new Error('У цели больше нет такой характеристики.');
    // revealed-статус каждой стороны остаётся как был — обмен слепой, но не меняет, кто что публично показывал.
    const mineSnap = { text: mine.text, value: mine.value, revealed: mine.revealed };
    const theirSnap = { text: selected.text, value: selected.value, revealed: selected.revealed };
    try {
      await patchCard(ctx, mine.id, { text: theirSnap.text, value: theirSnap.value, revealed: mineSnap.revealed });
      await patchCard(ctx, selected.id, { text: mineSnap.text, value: mineSnap.value, revealed: theirSnap.revealed });
    } catch (error) {
      try { await patchCard(ctx, mine.id, mineSnap); } catch (_) {}
      throw error;
    }
    return { changedCategory: category, targetPlayerId: target };
  }, { targetType: 'one', eventType: 'neutral', eventText: (ctx, r) => `${ctx.player.name || 'Игрок'} провёл(а) обмен вслепую (категория «${r?.changedCategory}») с выбранным игроком.` });

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

  /* ---- Группа A: новые обработчики (18 карт) ---- */

  async function findCard(ctx, playerId, category) {
    const cards = await playerCards(ctx, playerId);
    return cards.find(c => c.category === category);
  }

  // 1616 «Диктатор» — изгнать игрока вне очереди, минуя голосование.
  E.register('direct_eliminate', async ctx => {
    const target = targetId(ctx);
    const { error } = await db(ctx).from('players').update({ is_alive: false }).eq('id', target).eq('room_code', roomCode(ctx));
    if (error) throw error;
    return { targetPlayerId: target };
  }, { targetType: 'one', eventType: 'negative', eventText: ctx => `${ctx.player.name || 'Игрок'} единолично изгнал(а) игрока вне очереди («Диктатор»).` });

  // 1648 «Донор» — безвозвратно отдать карту фиксированной категории другому игроку.
  E.register('transfer_card', async ctx => {
    const target = targetId(ctx);
    const category = ctx.params.category || 'luggage_big';
    const mine = await findCard(ctx, ctx.player.id, category);
    if (!mine) throw new Error(`У вас нет карты категории «${category}».`);
    const theirs = await findCard(ctx, target, category);
    const snap = { text: mine.text, value: mine.value, revealed: true };
    await db(ctx).from('round_effects').insert({
      room_code: roomCode(ctx), round: 0, effect_key: 'trait_history',
      source_player_id: ctx.player.id, target_player_id: ctx.player.id,
      effect_params: { category, text: mine.text, value: mine.value },
      is_active: true
    });
    await patchCard(ctx, mine.id, { text: '[Передано другому игроку]', value: 0, revealed: true });
    if (theirs) await patchCard(ctx, theirs.id, snap);
    return { targetPlayerId: target, category };
  }, { targetType: 'one', eventType: 'positive', eventText: (ctx, r) => `${ctx.player.name || 'Игрок'} передал(а) карту «${r?.category}» другому игроку.` });

  // 1656 / 1712 «Защита»/«Опекун» — голоса ПРОТИВ цели не засчитываются в этом раунде.
  E.register('protect_target', async ctx => {
    await addRoundEffect(ctx, { target_player_id: targetId(ctx) || ctx.player.id });
  }, { targetType: 'one', eventType: 'positive' });

  // 1644 «Диагноз», 1660 «Инспекция», 1654 «Заставить всех раскрыть карту» — раскрыть карту(ы) цели/всех.
  E.register('force_reveal', async ctx => {
    const category = ctx.params.category || 'health';
    const ids = ctx.targets.map(t => t.id || t);
    if (!ids.length) throw new Error('Не выбрана цель.');
    let count = 0;
    for (const pid of ids) {
      const cards = (await playerCards(ctx, pid)).filter(c => c.category === category);
      for (const c of cards) { await patchCard(ctx, c.id, { revealed: true }); count++; }
    }
    if (!count) throw new Error(`Ни у одной цели нет карты категории «${category}».`);
    return { targetPlayerId: ids[0], category, count };
  }, { targetType: 'one', eventType: 'neutral', eventText: (ctx, r) => `${ctx.player.name || 'Игрок'} заставил(а) раскрыть карту «${r?.category}» (${r?.count} шт.).` });

  // 1661 «Исцеление» — вылечить карту здоровья.
  E.register('cure_health', async ctx => {
    const target = targetId(ctx);
    const card = await findCard(ctx, target, 'health');
    if (!card) throw new Error('У цели нет карты здоровья.');
    await patchCard(ctx, card.id, { text: 'Полностью здоров', value: 0, revealed: card.revealed });
    return { targetPlayerId: target };
  }, { targetType: 'one', eventType: 'positive' });

  // 1664 «Лекарь» — снять фобию.
  E.register('cure_phobia', async ctx => {
    const target = targetId(ctx);
    const card = await findCard(ctx, target, 'phobia');
    if (!card) throw new Error('У цели нет карты фобии.');
    await patchCard(ctx, card.id, { text: 'Нет фобии', value: 0, revealed: card.revealed });
    return { targetPlayerId: target };
  }, { targetType: 'one', eventType: 'positive' });

  // 1672 — отменить своё выставление на голосование.
  E.register('cancel_nomination', async ctx => {
    const nominees = ctx.room.nominees || [];
    const next = nominees.filter(id => id !== ctx.player.id);
    if (next.length === nominees.length) throw new Error('Вы не выставлены на голосование в этом раунде.');
    const { error } = await db(ctx).from('rooms').update({ nominees: next }).eq('code', roomCode(ctx));
    if (error) throw error;
  }, { targetType: 'self', eventType: 'positive' });

  // 1685 — пропустить голосование без объяснений (фиксируем факт использования карты).
  E.register('skip_vote', async ctx => {
    await addRoundEffect(ctx, { target_player_id: ctx.player.id, effect_params: { skip: true } });
  }, { targetType: 'self', eventType: 'neutral' });

  // 1692 «Наставник» — бонус к здоровью на раунд.
  E.register('health_bonus', async ctx => {
    await addRoundEffect(ctx, {
      target_player_id: targetId(ctx),
      effect_params: { amount: Number(ctx.params.amount || 1) }
    });
  }, { targetType: 'one', eventType: 'positive' });

  // 1696 — обменяться картой фиксированной категории с выбранным игроком (обязателен для цели).
  E.register('swap_fixed_category', async ctx => {
    const target = targetId(ctx);
    const category = ctx.params.category || 'profession';
    const mine = await findCard(ctx, ctx.player.id, category);
    const theirs = await findCard(ctx, target, category);
    if (!mine || !theirs) throw new Error(`У одного из игроков нет карты категории «${category}».`);
    await swapSnapshots(ctx, mine, theirs);
    return { targetPlayerId: target, category };
  }, { targetType: 'one', eventType: 'neutral' });

  // 1695 — обменять фиксированную категорию карт между двумя ДРУГИМИ игроками.
  E.register('swap_between_others', async ctx => {
    const [a, b] = ctx.targets.map(t => t.id || t);
    const category = ctx.params.category || 'luggage_big';
    const cardA = await findCard(ctx, a, category);
    const cardB = await findCard(ctx, b, category);
    if (!cardA || !cardB) throw new Error(`У одного из выбранных игроков нет карты категории «${category}».`);
    await swapSnapshots(ctx, cardA, cardB);
    return { category };
  }, { targetType: 'two', eventType: 'neutral' });

  // 1701 «Разоблачение» — показать, за кого голосовал игрок в прошлом раунде.
  E.register('reveal_past_vote', async ctx => {
    const target = targetId(ctx);
    const prevRound = Math.max(1, round(ctx) - 1);
    const { data, error } = await db(ctx).from('votes').select('*')
      .eq('room_code', roomCode(ctx)).eq('round', prevRound).eq('voter_id', target).maybeSingle();
    if (error) throw error;
    const votedFor = data ? (ctx.players.find(p => p.id === data.target_id)?.name || data.target_id) : 'не голосовал(а)';
    if (typeof window !== 'undefined' && window.alert) window.alert(`Игрок проголосовал(а) за: ${votedFor}`);
    return { targetPlayerId: target, votedFor };
  }, { targetType: 'one', eventType: 'neutral', eventText: () => 'Разоблачение: прошлый голос игрока раскрыт использовавшему карту.' });

  // 1709 — увидеть текущий тэлли голосов до оглашения (только себе, событие не публикуется).
  E.register('view_tally', async ctx => {
    const { data: votes, error } = await db(ctx).from('votes').select('*')
      .eq('room_code', roomCode(ctx)).eq('round', round(ctx));
    if (error) throw error;
    const tally = {};
    (votes || []).forEach(v => { tally[v.target_id] = (tally[v.target_id] || 0) + 1; });
    const lines = Object.entries(tally).map(([id, n]) => `${ctx.players.find(p => p.id === id)?.name || id}: ${n}`);
    if (typeof window !== 'undefined' && window.alert) window.alert(lines.length ? lines.join('\n') : 'Голосов пока нет.');
    return { tally };
  }, { targetType: 'self', eventType: 'neutral', eventText: () => 'Использована карта предварительного просмотра голосов.' });

  // 1703 / 1708 / 1713 — продлить фазу (обсуждение или защитная речь).
  E.register('extend_phase', async ctx => {
    const seconds = Number(ctx.params.seconds || 15);
    const room = ctx.room;
    if (!room.phase_ends_at) throw new Error('Таймер фазы сейчас не запущен.');
    const newEnds = new Date(new Date(room.phase_ends_at).getTime() + seconds * 1000).toISOString();
    const { error } = await db(ctx).from('rooms').update({ phase_ends_at: newEnds }).eq('code', roomCode(ctx));
    if (error) throw error;
    return { seconds };
  }, { targetType: 'self', eventType: 'positive', eventText: (ctx, r) => `${ctx.player.name || 'Игрок'} продлил(а) текущую фазу на ${r?.seconds || '?'} сек.` });

  /* ---- Группа B: карты на существующих таблицах (character_pool, notes, round_effects) ---- */

  async function drawFromPool(ctx, category) {
    const { data: used, error: usedErr } = await db(ctx).from('player_cards')
      .select('pool_id').eq('room_code', roomCode(ctx)).eq('category', category);
    if (usedErr) throw usedErr;
    const excluded = new Set((used || []).map(r => r.pool_id).filter(Boolean));

    const { data: pool, error: poolErr } = await db(ctx).from('character_pool').select('*').eq('category', category);
    if (poolErr) throw poolErr;
    if (!pool || !pool.length) throw new Error(`В колоде нет карт категории «${category}».`);

    const fresh = pool.filter(p => !excluded.has(p.id));
    const options = fresh.length ? fresh : pool;
    return options[Math.floor(Math.random() * options.length)];
  }

  function applyDraw(patch, draw) {
    return Object.assign(patch, {
      text: draw.text, value: draw.value, pool_id: draw.id,
      effect_key: draw.effect_key || null, effect_params: draw.effect_params || {},
      target_type: draw.target_type || null, target_kind: draw.target_kind || 'player'
    });
  }

  // 1624 «Смена личности» — обнулить все свои карты, кроме Био, и взять новые из колоды.
  E.register('reset_cards', async ctx => {
    const cards = await playerCards(ctx, ctx.player.id);
    let count = 0;
    for (const c of cards) {
      if (c.category === 'bio' || c.id === ctx.card.id) continue;
      const draw = await drawFromPool(ctx, c.category);
      await patchCard(ctx, c.id, applyDraw({ revealed: false, used: false, used_targets: [] }, draw));
      count++;
    }
    return { count };
  }, { targetType: 'self', eventType: 'neutral', eventText: (ctx, r) => `${ctx.player.name || 'Игрок'} полностью сменил(а) личность (${r?.count || 0} карт(ы) заменено).` });

  // 1653 «Заразить» — заменить карту здоровья цели случайной из колоды.
  E.register('infect_disease', async ctx => {
    const target = targetId(ctx);
    const card = await findCard(ctx, target, 'health');
    if (!card) throw new Error('У цели нет карты здоровья.');
    const draw = await drawFromPool(ctx, 'health');
    await patchCard(ctx, card.id, { text: draw.text, value: draw.value, pool_id: draw.id });
    return { targetPlayerId: target };
  }, { targetType: 'one', eventType: 'negative' });

  // 1690 «Мутация» — заменить карты здоровья и фобии цели случайными из колоды.
  E.register('redraw_health_and_phobia', async ctx => {
    const target = targetId(ctx);
    for (const category of ['health', 'phobia']) {
      const card = await findCard(ctx, target, category);
      if (!card) continue;
      const draw = await drawFromPool(ctx, category);
      await patchCard(ctx, card.id, { text: draw.text, value: draw.value, pool_id: draw.id });
    }
    return { targetPlayerId: target };
  }, { targetType: 'one', eventType: 'negative' });

  // 1626 «Благословение» / 1643 «Дезинформация» — опубликовать факт (истинный/ложный) о цели.
  function factHandler(promptText) {
    return async ctx => {
      const target = targetId(ctx);
      const text = typeof window !== 'undefined' && window.prompt ? window.prompt(promptText) : null;
      if (text === null) return false;
      return { targetPlayerId: target, fact: text.trim() || 'без уточнения' };
    };
  }
  E.register('positive_fact', factHandler('Опишите положительный факт об игроке (будет виден всем):'),
    { targetType: 'one', eventType: 'positive', eventText: (ctx, r) => `О игроке стал известен факт: «${r?.fact}».` });
  E.register('false_fact', factHandler('Опишите ложный факт об игроке (все поверят в этом раунде):'),
    { targetType: 'one', eventType: 'negative', eventText: (ctx, r) => `Распространён слух: «${r?.fact}» (недостоверно).` });

  // 1674 «Обмен заметкой» — поменяться личным текстовым полем заметок (не характеристиками).
  E.register('swap_notes', async ctx => {
    const target = targetId(ctx);
    const { data: mine } = await db(ctx).from('notes').select('text').eq('room_code', roomCode(ctx)).eq('player_id', ctx.player.id).maybeSingle();
    const { data: theirs } = await db(ctx).from('notes').select('text').eq('room_code', roomCode(ctx)).eq('player_id', target).maybeSingle();
    const now = new Date().toISOString();
    const { error: e1 } = await db(ctx).from('notes').upsert(
      { room_code: roomCode(ctx), player_id: ctx.player.id, text: theirs?.text || '', updated_at: now },
      { onConflict: 'room_code,player_id' });
    if (e1) throw e1;
    const { error: e2 } = await db(ctx).from('notes').upsert(
      { room_code: roomCode(ctx), player_id: target, text: mine?.text || '', updated_at: now },
      { onConflict: 'room_code,player_id' });
    if (e2) throw e2;
    return { targetPlayerId: target };
  }, { targetType: 'one', eventType: 'neutral' });

  // 1707 «Один раз может посмотреть закрытую характеристику» — приватный просмотр, без публичного раскрытия.
  E.register('peek_trait', async ctx => {
    const target = targetId(ctx);
    const cards = (await playerCards(ctx, target)).filter(c =>
      c.category !== 'special_condition' && c.category !== 'goal' && c.revealed !== true);
    if (!cards.length) throw new Error('У цели нет скрытых характеристик.');
    const chosen = window.AliveEffectsUI?.pickTrait
      ? await window.AliveEffectsUI.pickTrait(cards, 'ПРОСМОТР — какую скрытую характеристику посмотреть?')
      : cards[0];
    if (!chosen) return false;
    if (typeof window !== 'undefined' && window.alert) window.alert(`${chosen.category}: ${chosen.text}`);
    return { targetPlayerId: target, category: chosen.category };
  }, { targetType: 'one', eventType: 'neutral', eventText: () => 'Использован приватный просмотр скрытой характеристики.' });

  // 1711 «Оживить изгнанного» — вернуть в игру без права голоса в этом раунде.
  E.register('revive_player', async ctx => {
    const target = targetId(ctx);
    const { error } = await db(ctx).from('players').update({ is_alive: true }).eq('id', target).eq('room_code', roomCode(ctx));
    if (error) throw error;
    const { error: e2 } = await db(ctx).from('round_effects').insert({
      room_code: roomCode(ctx), round: round(ctx), effect_key: 'vote_nullified',
      source_player_id: ctx.player.id, target_player_id: target, effect_params: { reason: 'revived' }, is_active: true
    });
    if (e2) throw e2;
    return { targetPlayerId: target };
  }, { targetType: 'one', eventType: 'positive' });

  // 1666 «Локация» — исключить игрока из голосования в этом раунде (обсуждение — вручную ведущим).
  E.register('exclude_from_vote', async ctx => {
    const target = targetId(ctx);
    const { error } = await db(ctx).from('round_effects').insert({
      room_code: roomCode(ctx), round: round(ctx), effect_key: 'vote_nullified',
      source_player_id: ctx.player.id, target_player_id: target, effect_params: { reason: 'isolator' }, is_active: true
    });
    if (error) throw error;
    return { targetPlayerId: target };
  }, { targetType: 'one', eventType: 'negative', eventText: ctx => `${ctx.player.name || 'Игрок'} отправил(а) игрока в изолятор — он не голосует в этом раунде. Исключение из обсуждения — на усмотрение ведущего.` });

  // 1628 «Бронь» — защитить свою характеристику от кражи/обмена до конца игры (round=0 = бессрочно).
  E.register('protect_card', async ctx => {
    const mine = publicTraits(await playerCards(ctx, ctx.player.id));
    const chosen = window.AliveEffectsUI?.pickTrait
      ? await window.AliveEffectsUI.pickTrait(mine, 'БРОНЬ — какую характеристику защитить до конца игры?')
      : mine[0];
    if (!chosen) return false;
    const { error } = await db(ctx).from('round_effects').insert({
      room_code: roomCode(ctx), round: 0, effect_key: 'card_protected',
      source_player_id: ctx.player.id, target_player_id: ctx.player.id,
      effect_params: { category: chosen.category }, is_active: true
    });
    if (error) throw error;
    return { category: chosen.category };
  }, { targetType: 'self', eventType: 'positive', eventText: (ctx, r) => `${ctx.player.name || 'Игрок'} взял(а) карту «Бронь» на характеристику «${r?.category}».` });

  async function isProtected(ctx, playerId, category) {
    const { data, error } = await db(ctx).from('round_effects').select('id, effect_params')
      .eq('room_code', roomCode(ctx)).eq('effect_key', 'card_protected')
      .eq('target_player_id', playerId).eq('is_active', true);
    if (error) throw error;
    return (data || []).some(r => r.effect_params?.category === category);
  }

  // 1652 «Запретить одному игроку использовать его спецусловие в этом раунде».
  E.register('block_special_condition', async ctx => {
    await addRoundEffect(ctx, { target_player_id: targetId(ctx) });
  }, { targetType: 'one', eventType: 'negative' });

  /* ---- Группа C: карты, привязанные к исходу голосования (флаги; сама логика — в resolveVoting) ---- */

  E.register('open_voting', async ctx => { await addRoundEffect(ctx, { target_player_id: ctx.player.id }); },
    { targetType: 'all', eventType: 'neutral' });

  E.register('second_vote_abstain', async ctx => { await addRoundEffect(ctx, { target_player_id: ctx.player.id }); },
    { targetType: 'self', eventType: 'positive' });

  E.register('coin_flip_survival', async ctx => { await addRoundEffect(ctx, { target_player_id: ctx.player.id }); },
    { targetType: 'self', eventType: 'positive' });

  E.register('tie_breaker', async ctx => { await addRoundEffect(ctx, { target_player_id: ctx.player.id }); },
    { targetType: 'self', eventType: 'positive' });

  E.register('spy_vote', async ctx => { await addRoundEffect(ctx, { target_player_id: targetId(ctx) }); },
    { targetType: 'one', eventType: 'neutral', eventText: () => 'Использована карта слежки — результат придёт после подсчёта голосов.' });

  // «Наследство» — постоянная заявка (round=0), реализуется в resolveVoting в момент выбывания цели.
  E.register('heir', async ctx => {
    const target = targetId(ctx);
    await db(ctx).from('round_effects').insert({
      room_code: roomCode(ctx), round: 0, effect_key: 'heir',
      source_player_id: ctx.player.id, target_player_id: target, effect_params: {}, is_active: true
    });
  }, { targetType: 'one', eventType: 'positive', eventText: ctx => `${ctx.player.name || 'Игрок'} заявил(а) права наследства на карты одного из игроков.` });

  // «Второе дыхание» — восстановить последнюю утраченную (украденную/переданную) свою характеристику.
  E.register('restore_lost_trait', async ctx => {
    const { data, error } = await db(ctx).from('round_effects').select('*')
      .eq('room_code', roomCode(ctx)).eq('effect_key', 'trait_history')
      .eq('target_player_id', ctx.player.id).eq('is_active', true)
      .order('id', { ascending: false }).limit(1);
    if (error) throw error;
    if (!data || !data.length) throw new Error('Нет утраченных характеристик для восстановления.');
    const hist = data[0];
    const mine = await getOwnTrait(ctx, hist.effect_params.category);
    if (!mine) throw new Error(`У вас больше нет карты категории «${hist.effect_params.category}».`);
    await patchCard(ctx, mine.id, { text: hist.effect_params.text, value: hist.effect_params.value, revealed: true });
    await db(ctx).from('round_effects').update({ is_active: false }).eq('id', hist.id);
    return { category: hist.effect_params.category };
  }, { targetType: 'self', eventType: 'positive', eventText: (ctx, r) => `${ctx.player.name || 'Игрок'} вернул(а) себе утраченную характеристику «${r?.category}».` });

  /* ---- Простые самостоятельные механики поверх player_cards ---- */

  // Добровольно раскрыть свою скрытую характеристику раньше срока.
  E.register('reveal_own_trait_early', async ctx => {
    const mine = (await playerCards(ctx, ctx.player.id)).filter(c =>
      c.category !== 'special_condition' && c.category !== 'goal' && c.revealed !== true);
    if (!mine.length) throw new Error('У вас нет скрытых характеристик.');
    const chosen = window.AliveEffectsUI?.pickTrait
      ? await window.AliveEffectsUI.pickTrait(mine, 'Какую характеристику раскрыть раньше срока?')
      : mine[0];
    if (!chosen) return false;
    await patchCard(ctx, chosen.id, { revealed: true });
    return { category: chosen.category };
  }, { targetType: 'self', eventType: 'neutral', eventText: (ctx, r) => `${ctx.player.name || 'Игрок'} досрочно раскрыл(а) характеристику «${r?.category}».` });

  // GM-выбор реализуем случайным образом среди своих скрытых карт (кроме спецусловий/целей).
  E.register('reveal_random_hidden', async ctx => {
    const mine = (await playerCards(ctx, ctx.player.id)).filter(c =>
      c.category !== 'special_condition' && c.category !== 'goal' && c.revealed !== true);
    if (!mine.length) throw new Error('У вас нет скрытых характеристик.');
    const chosen = mine[Math.floor(Math.random() * mine.length)];
    await patchCard(ctx, chosen.id, { revealed: true });
    return { category: chosen.category };
  }, { targetType: 'self', eventType: 'neutral', eventText: (ctx, r) => `${ctx.player.name || 'Игрок'} был(а) вынужден(а) раскрыть характеристику «${r?.category}» (выбор случаен).` });

  // Показать уже открытую характеристику ещё раз (приватно, тому, кто просит).
  E.register('show_trait_again', async ctx => {
    const target = targetId(ctx);
    const cards = publicTraits(await playerCards(ctx, target));
    const chosen = window.AliveEffectsUI?.pickTrait
      ? await window.AliveEffectsUI.pickTrait(cards, 'Какую открытую характеристику показать ещё раз?')
      : cards[0];
    if (!chosen) return false;
    if (typeof window !== 'undefined' && window.alert) window.alert(`${chosen.category}: ${chosen.text}`);
    return { targetPlayerId: target };
  }, { targetType: 'one', eventType: 'neutral' });

  // «Молчание»: мут на раунд + голос за двоих.
  E.register('mute_and_double_vote', async ctx => {
    const until = new Date(Date.now() + 30 * 60 * 1000).toISOString(); // до конца раунда/ручного снятия ведущим
    const { error } = await db(ctx).from('players').update({ is_muted: true }).eq('id', ctx.player.id).eq('room_code', roomCode(ctx));
    if (error) throw error;
    await addRoundEffect(ctx, { target_player_id: ctx.player.id, effect_params: { weight: 2 } });
  }, { targetType: 'self', eventType: 'neutral', eventText: ctx => `${ctx.player.name || 'Игрок'} молчит в этом раунде, но его голос считается за двоих. Снять мут вручную по окончании раунда.` });

  /* ---- Чат-флаги: реализация через round_effects, интеграция в чат — на стороне app.js (см. README ниже) ---- */

  E.register('chat_block_neighbors', async ctx => { await addRoundEffect(ctx, { target_player_id: targetId(ctx), effect_params: { scope: 'neighbors' } }); },
    { targetType: 'one', eventType: 'negative' });

  E.register('chat_block_all', async ctx => { await addRoundEffect(ctx, { target_player_id: targetId(ctx), effect_params: { scope: 'all' } }); },
    { targetType: 'one', eventType: 'negative' });

  E.register('chat_block_self_private', async ctx => { await addRoundEffect(ctx, { target_player_id: ctx.player.id, effect_params: { scope: 'private_chat' } }); },
    { targetType: 'self', eventType: 'negative' });

  /* ---- Бункер: «Вклад» и «Диверсия» работают напрямую с room_bunker_properties —
   * это и есть настоящие комнаты/системы бункера, которые игроки получают по ходу игры. ---- */

  async function roomProperties(ctx) {
    const { data, error } = await db(ctx).from('room_bunker_properties')
      .select('*').eq('room_code', roomCode(ctx));
    if (error) throw error;
    return data || [];
  }

  // «Вклад» — досрочно открыть (внести в общий доступ) один ещё не раскрытый бонусный ресурс бункера.
  E.register('reveal_random_bonus_property', async ctx => {
    const props = await roomProperties(ctx);
    const hidden = props.filter(p => p.type === 'bonus' && !p.revealed);
    if (!hidden.length) throw new Error('Все бонусные свойства бункера уже раскрыты — вносить нечего.');
    const pick = hidden[Math.floor(Math.random() * hidden.length)];
    const { error } = await db(ctx).from('room_bunker_properties')
      .update({ revealed: true, available: true }).eq('id', pick.id);
    if (error) throw error;
    return { text: pick.text };
  }, { targetType: 'self', eventType: 'positive', eventText: (ctx, r) => `${ctx.player.name || 'Игрок'} внёс(ла) в общий доступ бункера: «${r?.text}».` });

  // «Диверсия: тайник с едой» — безвозвратно уничтожить один уже доступный бонусный ресурс.
  E.register('destroy_random_bonus_property', async ctx => {
    const props = await roomProperties(ctx);
    const available = props.filter(p => p.type === 'bonus' && p.revealed && p.available !== false);
    if (!available.length) return { text: null };
    const pick = available[Math.floor(Math.random() * available.length)];
    const { error } = await db(ctx).from('room_bunker_properties')
      .update({ available: false }).eq('id', pick.id);
    if (error) throw error;
    return { text: pick.text };
  }, { targetType: 'self', eventType: 'negative', eventText: (ctx, r) => r?.text ? `${ctx.player.name || 'Игрок'} уничтожил(а) в бункере: «${r.text}» — ресурс потерян безвозвратно.` : 'В бункере не нашлось доступного ресурса для уничтожения — эффект пропал впустую.' });

  // «Перестройка» — добавить в комнату случайное bonus-свойство бункера из общего каталога, которого у неё ещё нет.
  E.register('add_random_room', async ctx => {
    const { data: existing, error: exErr } = await db(ctx).from('room_bunker_properties').select('property_id').eq('room_code', roomCode(ctx));
    if (exErr) throw exErr;
    const excluded = new Set((existing || []).map(r => r.property_id));
    const { data: pool, error: poolErr } = await db(ctx).from('bunker_properties').select('id,type,text').eq('type', 'bonus');
    if (poolErr) throw poolErr;
    const options = (pool || []).filter(p => !excluded.has(p.id));
    if (!options.length) throw new Error('В каталоге не осталось новых бонусных свойств бункера.');
    const pick = options[Math.floor(Math.random() * options.length)];
    const { error } = await db(ctx).from('room_bunker_properties').insert({
      room_code: roomCode(ctx), property_id: pick.id, type: pick.type, text: pick.text, available: true, revealed: false, blocked: false
    });
    if (error) throw error;
    return { text: pick.text };
  }, { targetType: 'self', eventType: 'positive', eventText: (ctx, r) => `${ctx.player.name || 'Игрок'} добавил(а) в бункер новую комнату: «${r?.text}».` });

  // Пропустить фазу выставления — флаг, проверяется хелпером AliveEffects.canNominate() (см. effect-compat.js).
  E.register('skip_nomination', async ctx => { await addRoundEffect(ctx, { target_player_id: ctx.player.id }); },
    { targetType: 'self', eventType: 'neutral' });

  // Иммунитет к одной катастрофе — просто флаг для ведущего/будущей автоматизации катастроф.
  E.register('catastrophe_immunity', async ctx => { await addRoundEffect(ctx, { target_player_id: ctx.player.id }); },
    { targetType: 'self', eventType: 'positive' });

  /* ---- Group D: чисто нарративные/социальные карты — не проверяются кодом (честность, договорённости и т.п.),
   * но всё равно проходят через единый движок: тратятся, логируются публично, видны в ленте событий. ---- */
  E.register('narrative_effect', async ctx => {
    const ids = ctx.targets.map(t => t.id || t);
    return { targetPlayerId: ids[0] || null };
  }, { targetType: 'self', eventType: 'neutral', eventText: ctx => `${ctx.player.name || 'Игрок'} использовал(а) спецусловие: «${ctx.card.text}».` });

  window.AliveEffectRegistry = { initialized: true };
})(window);
