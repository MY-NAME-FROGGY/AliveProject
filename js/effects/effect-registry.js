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
    const scopeAll = ctx.params.scope === 'all';
    await addRoundEffect(ctx, {
      target_player_id: scopeAll ? null : (targetId(ctx) || ctx.player.id),
      effect_params: {
        categories: ctx.params.categories || ['luggage_big', 'luggage_small'],
        duration: 'round',
        scope: scopeAll ? 'all' : 'target'
      }
    });
  }, {
    targetType: 'one', eventType: 'negative',
    eventText: ctx => ctx.params.scope === 'all'
      ? `${ctx.player.name || 'Игрок'} заблокировал(а) использование багажа всем игрокам в этом раунде.`
      : `${ctx.player.name || 'Игрок'} заблокировал(а) использование багажа.`
  });

  // «Двойной багаж» — при краже багажа предмет ДОБАВЛЯЕТСЯ к уже имеющемуся у вора
  // (список в одной карте), а не затирает его. Для остальных категорий (профессия,
  // здоровье и т.д.) поведение прежнее — замена, там список смысла не имеет.
  function isLuggageCategory(category) {
    return category === 'luggage_big' || category === 'luggage_small';
  }
  function parseLootList(text) {
    if (!text) return [];
    return String(text).split('\n').map(s => s.replace(/^•\s*/, '').trim()).filter(Boolean);
  }
  function formatLootList(items) {
    return items.map(i => `• ${i}`).join('\n');
  }
  function mergeIntoLoot(existingText, incomingText) {
    const items = parseLootList(existingText);
    const incoming = parseLootList(incomingText);
    return formatLootList([...items, ...incoming]);
  }

  E.register('steal_trait', async ctx => {
    const target = targetId(ctx);
    const selected = await pickTrait(ctx, target, 'ОГРАБЛЕНИЕ — какую открытую характеристику забрать?');
    if (!selected) return false;
    if (await isProtected(ctx, target, selected.category)) {
      throw new Error(`Характеристика «${selected.category}» защищена «Бронью» и не может быть украдена.`);
    }

    const mine = await getOwnTrait(ctx, selected.category);
    if (!mine) throw new Error(`У вас нет характеристики категории «${selected.category}».`);
    const luggage = isLuggageCategory(selected.category);

    const mineSnap = { text: mine.text, value: mine.value, revealed: mine.revealed };
    const stolenSnap = luggage
      ? { text: mergeIntoLoot(mine.text, selected.text), value: mine.value, revealed: true }
      : { text: selected.text, value: selected.value, revealed: true };
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
    const luggage = isLuggageCategory(category);

    const mineSnap = { text: mine.text, value: mine.value, revealed: mine.revealed };
    try {
      await patchCard(ctx, mine.id, luggage
        ? { text: mergeIntoLoot(mine.text, selected.text), value: mine.value, revealed: mine.revealed && selected.revealed }
        : { text: selected.text, value: selected.value, revealed: selected.revealed });
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
  // Статус открытости/закрытости едет ВМЕСТЕ с содержимым (как и в открытом обмене) —
  // если у одного было открыто, а у другого закрыто, после обмена они меняются местами.
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
    await swapSnapshots(ctx, mine, selected);
    return { changedCategory: category, targetPlayerId: target };
  }, { targetType: 'one', eventType: 'neutral', eventText: (ctx, r) => `${ctx.player.name || 'Игрок'} провёл(а) обмен вслепую (категория «${r?.changedCategory}») с выбранным игроком.` });

  // Кража вслепую с ЖЁСТКО заданной категорией (без выбора) — для карт вида
  // «забрать весь малый багаж», где категория прописана в тексте карты, а не выбирается вором.
  E.register('steal_fixed_category_blind', async ctx => {
    const target = targetId(ctx);
    const category = ctx.params.category;
    if (!category) throw new Error('Для этой карты не задана категория в effect_params.category.');
    if (await isProtected(ctx, target, category)) {
      throw new Error(`Категория «${category}» защищена «Бронью» и не может быть украдена.`);
    }
    const mine = await getOwnTrait(ctx, category);
    if (!mine) throw new Error(`У вас нет характеристики категории «${category}».`);
    const selected = (await playerCards(ctx, target)).find(c => c.category === category);
    if (!selected) throw new Error(`У цели нет характеристики категории «${category}».`);
    const luggage = isLuggageCategory(category);

    const mineSnap = { text: mine.text, value: mine.value, revealed: mine.revealed };
    try {
      await patchCard(ctx, mine.id, luggage
        ? { text: mergeIntoLoot(mine.text, selected.text), value: mine.value, revealed: mine.revealed && selected.revealed }
        : { text: selected.text, value: selected.value, revealed: selected.revealed });
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
    return { targetPlayerId: target };
  }, { targetType: 'one', eventType: 'negative', eventText: ctx => `${ctx.player.name || 'Игрок'} вслепую забрал(а) у цели категорию «${ctx.params.category}» — содержимое не разглашается.` });

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

    // Только названия категорий — содержимое не показываем, пока категория не выбрана.
    const categories = [...new Set(cards.map(c => c.category))];
    const chosenCategory = window.AliveEffectsUI?.pickCategory
      ? await window.AliveEffectsUI.pickCategory(categories, 'ПРОСМОТР — выберите категорию (содержимое покажем только этой одной)')
      : categories[0];
    if (!chosenCategory) return false;

    const card = cards.find(c => c.category === chosenCategory);
    const targetName = ctx.players.find(p => p.id === target)?.name || 'игрок';

    // Переносим узнанное в личные заметки исполнителя — не просто разовый alert.
    const { data: existingNote } = await db(ctx).from('notes').select('text')
      .eq('room_code', roomCode(ctx)).eq('player_id', ctx.player.id).maybeSingle();
    const addition = `[Разведка] ${targetName} — ${card.category}: ${card.text}`;
    const newText = existingNote?.text ? `${existingNote.text}\n${addition}` : addition;
    await db(ctx).from('notes').upsert(
      { room_code: roomCode(ctx), player_id: ctx.player.id, text: newText, updated_at: new Date().toISOString() },
      { onConflict: 'room_code,player_id' });

    if (typeof window !== 'undefined' && window.alert) window.alert(`${card.category}: ${card.text}\n\n(записано в ваши личные заметки)`);
    return { targetPlayerId: target, category: card.category };
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
  // 1679 — открытые характеристики и так ВСЕГДА видны всем в панели игрока, поэтому
  // «попросить показать ещё раз» приватным алертом не имело смысла (эффекта не было).
  // Реальная польза — публично привлечь внимание к конкретному факту прямо в разгар
  // обсуждения через ленту событий.
  E.register('show_trait_again', async ctx => {
    const target = targetId(ctx);
    const cards = publicTraits(await playerCards(ctx, target));
    if (!cards.length) throw new Error('У цели нет открытых характеристик.');
    const chosen = window.AliveEffectsUI?.pickTrait
      ? await window.AliveEffectsUI.pickTrait(cards, 'Какую открытую характеристику напомнить всем?')
      : cards[0];
    if (!chosen) return false;
    return { targetPlayerId: target, category: chosen.category, text: chosen.text };
  }, {
    targetType: 'one', eventType: 'neutral',
    eventText: (ctx, r) => `Напоминание: у игрока ${ctx.players.find(p => p.id === r?.targetPlayerId)?.name || '?'} — «${r?.category}»: ${r?.text}.`
  });

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
    const r = round(ctx);
    const hidden = props.filter(p => p.type === 'bonus' && !p.revealed &&
      !(p.blocked && (p.blocked_until_round == null || p.blocked_until_round >= r)));
    if (!hidden.length) throw new Error('Все бонусные свойства бункера уже раскрыты (или заблокированы) — вносить нечего.');
    const pick = hidden[Math.floor(Math.random() * hidden.length)];
    const { error } = await db(ctx).from('room_bunker_properties')
      .update({ revealed: true, available: true }).eq('id', pick.id);
    if (error) throw error;
    return { text: pick.text };
  }, { targetType: 'self', eventType: 'positive', eventText: (ctx, r) => `${ctx.player.name || 'Игрок'} внёс(ла) в общий доступ бункера: «${r?.text}».` });

  // «Диверсия: тайник с едой» — переводит уже доступный бонусный ресурс в статус «заблокировано»
  // (та же семантика blocked/blocked_until_round, что использует RPC-блокировка комнат бункера
  // и Мастер-панель ведущего — единый источник истины вместо отдельного available:false).
  E.register('destroy_random_bonus_property', async ctx => {
    const props = await roomProperties(ctx);
    const r = round(ctx);
    const available = props.filter(p => p.type === 'bonus' && p.revealed && p.available !== false &&
      !(p.blocked && (p.blocked_until_round == null || p.blocked_until_round >= r)));
    if (!available.length) return { text: null };
    const pick = available[Math.floor(Math.random() * available.length)];
    const { error } = await db(ctx).from('room_bunker_properties')
      .update({ blocked: true, blocked_until_round: null }).eq('id', pick.id);
    if (error) throw error;
    return { text: pick.text };
  }, { targetType: 'self', eventType: 'negative', eventText: (ctx, r) => r?.text ? `${ctx.player.name || 'Игрок'} уничтожил(а) в бункере: «${r.text}» — ресурс заблокирован безвозвратно.` : 'В бункере не нашлось доступного ресурса для уничтожения — эффект пропал впустую.' });

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
  // «Двойник» — скопировать эффект, реально использованный другим игроком в этом раунде,
  // и применить его заново от своего имени (не текст карты — настоящий повторный вызов кода).
  E.register('clone_special_condition', async ctx => {
    const sourcePlayer = targetId(ctx);
    if (!sourcePlayer) throw new Error('Не выбран игрок, чей эффект копируем.');

    const { data: logs, error } = await db(ctx).from('effect_log').select('*')
      .eq('room_code', roomCode(ctx)).eq('round', round(ctx)).eq('player_id', sourcePlayer)
      .order('id', { ascending: false });
    if (error) throw error;
    const usable = (logs || []).filter(l => l.effect_key !== 'clone_special_condition');
    if (!usable.length) throw new Error('Этот игрок не использовал спецусловие в этом раунде (или это была карта «Двойник»).');

    let logEntry = usable[0];
    if (usable.length > 1) {
      const lines = usable.map((l, i) => `${i + 1}. ${l.effect_key}`).join('\n');
      const raw = window.prompt(`Какое спецусловие скопировать?\n\n${lines}\n\nВведите номер:`);
      if (raw === null) return false;
      const idx = Number(raw) - 1;
      if (!Number.isInteger(idx) || !usable[idx]) throw new Error('Некорректный выбор.');
      logEntry = usable[idx];
    }

    const copiedKey = logEntry.effect_key;
    const entry = E.get(copiedKey);
    if (!entry) throw new Error(`Эффект «${copiedKey}» больше не зарегистрирован.`);

    const copiedTargetType = E.normalizeTargetType(logEntry.target_type || entry.meta.targetType || 'self');
    let newTargets = [];

    if (copiedTargetType === 'one' || copiedTargetType === 'two') {
      const kind = logEntry.target_kind || 'player';
      let candidates;
      if (kind === 'property') {
        const { data } = await db(ctx).from('room_bunker_properties').select('id,property_id,type,text').eq('room_code', roomCode(ctx));
        candidates = data || [];
      } else {
        candidates = ctx.players.filter(p => p.id !== ctx.player.id && p.id !== ctx.room.host_id && p.is_alive !== false);
      }
      if (!window.AliveEffectsUI?.pick) throw new Error('UI выбора цели недоступен.');
      newTargets = await window.AliveEffectsUI.pick({ text: `«Двойник» копирует эффект: ${copiedKey}` }, candidates, copiedTargetType === 'two' ? 2 : 1);
      if (!newTargets) return false;
    } else if (copiedTargetType === 'all') {
      newTargets = ctx.players.filter(p => p.id !== ctx.player.id && p.id !== ctx.room.host_id && p.is_alive !== false);
    }

    const result = await entry.handler({
      db: ctx.db, room: ctx.room, players: ctx.players, player: ctx.player,
      card: ctx.card, targets: newTargets, targetType: copiedTargetType,
      effectKey: copiedKey, params: logEntry.params || {}
    });
    if (result === false || result?.cancelled) return false;
    if (result?.success === false) throw new Error(result.error || 'Скопированный эффект не выполнен.');

    return { copiedKey };
  }, { targetType: 'one', eventType: 'neutral', eventText: (ctx, r) => `${ctx.player.name || 'Игрок'} скопировал(а) и применил(а) чужое спецусловие «${r?.copiedKey}» этого раунда.` });

  /* ---- Способности авторского сценария SC08 (preset_character_traits) ---- */

  // P01 — узнать факт другого игрока, с выбором «открыто» или «скрыто» в момент применения.
  E.register('reveal_or_peek_fact', async ctx => {
    const target = targetId(ctx);
    const category = ctx.params.category || 'fact1';
    const card = (await playerCards(ctx, target)).find(c => c.category === category);
    if (!card) throw new Error(`У цели нет карты категории «${category}».`);
    const open = window.confirm(`Раскрыть «${category}» цели ПУБЛИЧНО (OK) или посмотреть СКРЫТО только для себя (Отмена)?`);
    if (open) {
      await patchCard(ctx, card.id, { revealed: true });
    } else if (typeof window !== 'undefined' && window.alert) {
      window.alert(`${category}: ${card.text}`);
    }
    return { targetPlayerId: target, open };
  }, { targetType: 'one', eventType: 'neutral', eventText: (ctx, r) => r?.open ? `${ctx.player.name || 'Игрок'} публично раскрыл(а) факт цели.` : `${ctx.player.name || 'Игрок'} скрытно узнал(а) факт цели.` });

  // P03 — украсть багаж (игрок выбирает большой/малый), не глядя на условие «раскрыто ли».
  E.register('steal_luggage_choice', async ctx => {
    const target = targetId(ctx);
    const targetCards = (await playerCards(ctx, target)).filter(c => c.category === 'luggage_big' || c.category === 'luggage_small');
    if (!targetCards.length) throw new Error('У цели нет карт багажа.');
    const categories = [...new Set(targetCards.map(c => c.category))];
    const chosenCategory = window.AliveEffectsUI?.pickCategory
      ? await window.AliveEffectsUI.pickCategory(categories, 'Какой багаж украсть? (содержимое узнаете после выбора)')
      : categories[0];
    if (!chosenCategory) return false;
    const chosen = targetCards.find(c => c.category === chosenCategory);
    if (await isProtected(ctx, target, chosen.category)) {
      throw new Error(`Категория «${chosen.category}» защищена «Бронью» и не может быть украдена.`);
    }
    const mine = await getOwnTrait(ctx, chosen.category);
    if (!mine) throw new Error(`У вас нет карты категории «${chosen.category}».`);
    const mineSnap = { text: mine.text, value: mine.value, revealed: mine.revealed };
    try {
      await patchCard(ctx, mine.id, { text: chosen.text, value: chosen.value, revealed: true });
      await patchCard(ctx, chosen.id, { text: '[Багаж украден]', value: 0, revealed: true });
      await db(ctx).from('round_effects').insert({
        room_code: roomCode(ctx), round: 0, effect_key: 'trait_history',
        source_player_id: target, target_player_id: target,
        effect_params: { category: chosen.category, text: chosen.text, value: chosen.value }, is_active: true
      });
    } catch (error) {
      try { await patchCard(ctx, mine.id, mineSnap); } catch (_) {}
      throw error;
    }
    return { category: chosen.category, targetPlayerId: target };
  }, { targetType: 'one', eventType: 'negative', eventText: (ctx, r) => `${ctx.player.name || 'Игрок'} украл(а) багаж («${r?.category}») у выбранного игрока.` });

  // P04 — поменять местами факт (fact1 или fact2, на выбор) у двух ДРУГИХ игроков.
  E.register('swap_fact_between_others', async ctx => {
    const [a, b] = ctx.targets.map(t => t.id || t);
    const options = ['fact1', 'fact2'];
    const raw = window.prompt(`Какой факт поменять местами?\n1. Факт 1\n2. Факт 2\n\nВведите номер:`);
    const idx = Number(raw) - 1;
    if (!Number.isInteger(idx) || !options[idx]) return false;
    const category = options[idx];
    const cardA = await findCard(ctx, a, category);
    const cardB = await findCard(ctx, b, category);
    if (!cardA || !cardB) throw new Error(`У одного из выбранных игроков нет карты категории «${category}».`);
    await swapSnapshots(ctx, cardA, cardB);
    return { category };
  }, { targetType: 'two', eventType: 'neutral', eventText: (ctx, r) => `${ctx.player.name || 'Игрок'} поменял(а) местами «${r?.category}» у двух других игроков.` });

  // Ресурсы бункера: если у сценария задан resource_schema — учёт принудительно включён,
  // хост не может выключить (см. renderResourceSettings в app.js — там это тоже отражено текстом).
  // Иначе берём то, что хост сам настроил на экране «Настройки игры» (room.settings.resources.items).
  async function resourcesEnabled(ctx) {
    const { data: scenario } = await db(ctx).from('scenarios').select('resource_schema')
      .eq('id', ctx.room.scenario_id).maybeSingle();
    const forcedSchema = scenario?.resource_schema || {};
    if (Object.keys(forcedSchema).length > 0) return { enabled: true, schema: forcedSchema, forced: true };

    const items = ctx.room.settings?.resources?.items || {};
    const manualSchema = {};
    for (const [key, item] of Object.entries(items)) {
      if (item?.enabled) manualSchema[key] = { label: item.label || key, start: Number(item.start || 0), unit: item.unit || 'months' };
    }
    const enabled = Object.keys(manualSchema).length > 0;
    return { enabled, schema: manualSchema, forced: false };
  }

  async function ensureResourceRow(ctx, key, schema) {
    const { data: existing } = await db(ctx).from('room_resources').select('*')
      .eq('room_code', roomCode(ctx)).eq('key', key).maybeSingle();
    if (existing) return existing;
    const def = schema[key] || { label: key, start: 0, unit: 'months' };
    const { data: created, error } = await db(ctx).from('room_resources').insert({
      room_code: roomCode(ctx), key, label: def.label || key, amount: Number(def.start || 0), unit: def.unit || 'months'
    }).select().single();
    if (error) throw error;
    return created;
  }

  // P05 и подобные — реально изменяет числовой ресурс бункера комнаты.
  // Если учёт ресурсов выключен (нет ни схемы сценария, ни ручного тумблера хоста) —
  // мягко откатывается к текстовой пометке, чтобы карта не ломалась в обычных играх.
  E.register('adjust_bunker_resource', async ctx => {
    const key = ctx.params.resource;
    const delta = Number(ctx.params.delta || 0);
    if (!key) throw new Error('Для этой карты не задан ресурс в effect_params.resource.');

    const { enabled, schema } = await resourcesEnabled(ctx);
    if (!enabled) {
      await db(ctx).from('round_effects').insert({
        room_code: roomCode(ctx), round: 0, effect_key: 'host_resource_note',
        source_player_id: ctx.player.id, target_player_id: ctx.room.host_id,
        effect_params: { text: ctx.card.text }, is_active: true
      });
      return { note: true };
    }

    const row = await ensureResourceRow(ctx, key, schema);
    const newAmount = Number(row.amount) + delta;
    const { error } = await db(ctx).from('room_resources').update({ amount: newAmount, updated_at: new Date().toISOString() })
      .eq('id', row.id);
    if (error) throw error;
    return { label: row.label, amount: newAmount, delta };
  }, {
    targetType: 'one', eventType: 'positive',
    eventText: (ctx, r) => r?.note
      ? `${ctx.player.name || 'Игрок'} применил(а): «${ctx.card.text}». Учёт ресурсов выключен — ведущий учитывает вручную.`
      : `${ctx.player.name || 'Игрок'} изменил(а) ресурс «${r?.label}»: ${r?.delta > 0 ? '+' : ''}${r?.delta} (сейчас: ${r?.amount}).`
  });

  // P08 — «изменить биологию» цели: новая случайная карта категории bio из общей колоды.
  E.register('redraw_category', async ctx => {
    const target = targetId(ctx);
    const category = ctx.params.category || 'bio';
    const card = await findCard(ctx, target, category);
    if (!card) throw new Error(`У цели нет карты категории «${category}».`);
    const draw = await drawFromPool(ctx, category);
    await patchCard(ctx, card.id, { text: draw.text, value: draw.value, pool_id: draw.id });
    return { targetPlayerId: target, category };
  }, { targetType: 'one', eventType: 'neutral', eventText: (ctx, r) => `${ctx.player.name || 'Игрок'} изменил(а) характеристику «${r?.category}» у выбранного игрока.` });

  // P09 — узнать Цель другого игрока (peek_trait не годится, т.к. явно исключает category='goal').
  E.register('peek_goal', async ctx => {
    const target = targetId(ctx);
    const card = await findCard(ctx, target, 'goal');
    if (!card) throw new Error('У цели нет карты цели.');
    const targetName = ctx.players.find(p => p.id === target)?.name || 'игрок';

    const { data: existingNote } = await db(ctx).from('notes').select('text')
      .eq('room_code', roomCode(ctx)).eq('player_id', ctx.player.id).maybeSingle();
    const addition = `[Разведка] Цель игрока ${targetName}: ${card.text}`;
    const newText = existingNote?.text ? `${existingNote.text}\n${addition}` : addition;
    await db(ctx).from('notes').upsert(
      { room_code: roomCode(ctx), player_id: ctx.player.id, text: newText, updated_at: new Date().toISOString() },
      { onConflict: 'room_code,player_id' });

    if (typeof window !== 'undefined' && window.alert) window.alert(`Цель игрока: ${card.text}\n\n(записано в ваши личные заметки)`);
    return { targetPlayerId: target };
  }, { targetType: 'one', eventType: 'neutral', eventText: () => 'Использована карта разведки цели другого игрока.' });

  // P10 — голос цели аннулируется, а свой голос считается за двоих (комбо двух уже готовых эффектов).
  E.register('nullify_and_double_vote', async ctx => {
    const target = targetId(ctx);
    await db(ctx).from('round_effects').insert([
      { room_code: roomCode(ctx), round: round(ctx), effect_key: 'vote_nullified', source_player_id: ctx.player.id, target_player_id: target, effect_params: {}, is_active: true },
      { room_code: roomCode(ctx), round: round(ctx), effect_key: 'vote_weight', source_player_id: ctx.player.id, target_player_id: ctx.player.id, effect_params: { weight: 2 }, is_active: true }
    ]);
    return { targetPlayerId: target };
  }, { targetType: 'one', eventType: 'negative', eventText: ctx => `${ctx.player.name || 'Игрок'} аннулировал(а) голос цели и удвоил(а) свой голос на этом голосовании.` });

  /* ---- Реальная очередь хода в фазе открытия — вместо нарратива ---- */

  async function currentRevealOrderIds(ctx, forRound) {
    const base = ctx.players.filter(p => p.id !== ctx.room.host_id && p.is_alive !== false).map(p => p.id);
    const override = ctx.room.reveal_order_override;
    if (override && override.round === forRound && Array.isArray(override.order)) {
      const ordered = override.order.filter(id => base.includes(id));
      const rest = base.filter(id => !override.order.includes(id));
      return [...ordered, ...rest];
    }
    return base;
  }

  async function setRevealOrderOverride(ctx, forRound, order) {
    const { error } = await db(ctx).from('rooms').update({ reveal_order_override: { round: forRound, order } }).eq('code', roomCode(ctx));
    if (error) throw error;
  }

  // Разбивает текущую очередь на «уже отходивших» (их позиции трогать нельзя — иначе
  // room.reveal_index после перестановки укажет не на того игрока и фаза может
  // завершиться раньше, чем последний игрок успеет сходить) и «ещё не отходивших»
  // (только их можно переставлять местами).
  async function splitRevealOrder(ctx, forRound) {
    const full = await currentRevealOrderIds(ctx, forRound);
    const idx = forRound === round(ctx) ? (ctx.room.reveal_index || 0) : 0;
    return { already: full.slice(0, idx), upcoming: full.slice(idx) };
  }

  // 1632 — в СЛЕДУЮЩЕМ раунде открывает характеристику последним.
  E.register('move_to_last_next_round', async ctx => {
    const targetRound = round(ctx) + 1;
    const order = await currentRevealOrderIds(ctx, targetRound); // будущий раунд — reveal_index там ещё 0, весь список «предстоящий»
    const without = order.filter(id => id !== ctx.player.id);
    await setRevealOrderOverride(ctx, targetRound, [...without, ctx.player.id]);
  }, { targetType: 'self', eventType: 'neutral', eventText: ctx => `${ctx.player.name || 'Игрок'} будет открывать характеристику последним(ей) в следующем раунде.` });

  // 1675 — поменяться очередью хода с выбранным игроком (только среди тех, кто ещё не ходил).
  E.register('swap_reveal_order', async ctx => {
    const target = targetId(ctx);
    const r = round(ctx);
    const { already, upcoming } = await splitRevealOrder(ctx, r);
    const i1 = upcoming.indexOf(ctx.player.id);
    const i2 = upcoming.indexOf(target);
    if (i1 === -1) throw new Error('Вы уже походили в этой фазе открытия — менять очередь поздно.');
    if (i2 === -1) throw new Error('Выбранный игрок уже походил в этой фазе открытия — с ним нельзя поменяться очередью.');
    [upcoming[i1], upcoming[i2]] = [upcoming[i2], upcoming[i1]];
    await setRevealOrderOverride(ctx, r, [...already, ...upcoming]);
    return { targetPlayerId: target };
  }, { targetType: 'one', eventType: 'neutral', eventText: ctx => `${ctx.player.name || 'Игрок'} поменялся(ась) очередью хода с выбранным игроком.` });

  // 1706 — передать право хода: выбранный игрок открывает СЛЕДУЮЩИМ (сразу после текущего активного),
  // из числа тех, кто ещё не ходил.
  E.register('pass_turn_to_next', async ctx => {
    const target = targetId(ctx);
    const r = round(ctx);
    const { already, upcoming } = await splitRevealOrder(ctx, r);
    if (!upcoming.includes(target)) throw new Error('Выбранный игрок уже походил в этой фазе открытия — передать ему ход нельзя.');
    const without = upcoming.filter(id => id !== target);
    await setRevealOrderOverride(ctx, r, [...already, target, ...without]);
    return { targetPlayerId: target };
  }, { targetType: 'one', eventType: 'neutral', eventText: ctx => `${ctx.player.name || 'Игрок'} передал(а) право хода — следующим откроет выбранный игрок.` });

  // 1673 — реально поменяться местами за столом (players.seat_number существует и отображается в UI).
  E.register('swap_seats', async ctx => {
    const target = targetId(ctx);
    const me = ctx.players.find(p => p.id === ctx.player.id);
    const other = ctx.players.find(p => p.id === target);
    if (!me || !other) throw new Error('Не удалось найти игроков для обмена местами.');
    const { error: e1 } = await db(ctx).from('players').update({ seat_number: other.seat_number }).eq('id', me.id);
    const { error: e2 } = await db(ctx).from('players').update({ seat_number: me.seat_number }).eq('id', other.id);
    if (e1 || e2) throw (e1 || e2);
    return { targetPlayerId: target };
  }, { targetType: 'one', eventType: 'neutral', eventText: ctx => `${ctx.player.name || 'Игрок'} поменялся(ась) местами за столом с выбранным игроком.` });

  // 1618 «Катастрофа» — усугубляет внешнюю угрозу: реально уменьшает случайный включённый ресурс бункера.
  // Если учёт ресурсов выключен — честно откатывается к текстовой пометке (как adjust_bunker_resource).
  E.register('worsen_random_resource', async ctx => {
    const { enabled, schema } = await resourcesEnabled(ctx);
    if (!enabled || !Object.keys(schema).length) {
      await db(ctx).from('round_effects').insert({
        room_code: roomCode(ctx), round: 0, effect_key: 'host_resource_note',
        source_player_id: ctx.player.id, target_player_id: ctx.room.host_id,
        effect_params: { text: ctx.card.text }, is_active: true
      });
      return { note: true };
    }
    const keys = Object.keys(schema);
    const key = keys[Math.floor(Math.random() * keys.length)];
    const row = await ensureResourceRow(ctx, key, schema);
    const amount = row.unit === 'yesno' ? 0 : Math.max(0, Number(row.amount) - (Number(ctx.params.amount) || 1));
    const { error } = await db(ctx).from('room_resources').update({ amount, updated_at: new Date().toISOString() }).eq('id', row.id);
    if (error) throw error;
    return { label: row.label, amount };
  }, {
    targetType: 'self', eventType: 'negative',
    eventText: (ctx, r) => r?.note
      ? `${ctx.player.name || 'Игрок'} применил(а): «${ctx.card.text}». Учёт ресурсов выключен — ведущий учитывает вручную.`
      : `Катастрофа усугубилась: ресурс «${r?.label}» сократился (сейчас: ${r?.amount}).`
  });

  // 1640 «Голос доверия» — автоматически прощает одно нарушение: постоянный флаг-иммунитет
  // к следующему негативному факту (интеграция с фактами/нарушениями — по вашему усмотрению на стороне хоста).
  E.register('pardon_flag', async ctx => {
    await db(ctx).from('round_effects').insert({
      room_code: roomCode(ctx), round: 0, effect_key: 'pardon_flag',
      source_player_id: ctx.player.id, target_player_id: ctx.player.id, effect_params: {}, is_active: true
    });
  }, { targetType: 'self', eventType: 'positive', eventText: ctx => `${ctx.player.name || 'Игрок'} получил(а) прощение одного будущего нарушения («Голос доверия»).` });

  // 1686 — пропустить оправдательную речь без штрафа: реальный флаг, если фаза защиты его проверяет.
  E.register('skip_defense_penalty', async ctx => {
    await addRoundEffect(ctx, { target_player_id: ctx.player.id });
  }, { targetType: 'self', eventType: 'neutral', eventText: ctx => `${ctx.player.name || 'Игрок'} пропускает оправдательную речь без штрафа в этом раунде.` });

  // 1710 — иммунитет к одному мьюту/таймауту от ведущего: постоянный флаг.
  E.register('timeout_immune', async ctx => {
    await db(ctx).from('round_effects').insert({
      room_code: roomCode(ctx), round: 0, effect_key: 'timeout_immune',
      source_player_id: ctx.player.id, target_player_id: ctx.player.id, effect_params: {}, is_active: true
    });
  }, { targetType: 'self', eventType: 'positive', eventText: ctx => `${ctx.player.name || 'Игрок'} получил(а) один иммунитет к муту/таймауту от ведущего.` });

  // 1629 — сокращение времени следующей оправдательной речи: флаг на следующий раунд.
  E.register('defense_time_adjust', async ctx => {
    const targetRound = round(ctx) + 1;
    await db(ctx).from('round_effects').insert({
      room_code: roomCode(ctx), round: targetRound, effect_key: 'defense_time_adjust',
      source_player_id: ctx.player.id, target_player_id: ctx.player.id,
      effect_params: { seconds: Number(ctx.params.seconds || -15) }, is_active: true
    });
  }, { targetType: 'self', eventType: 'neutral', eventText: ctx => `${ctx.player.name || 'Игрок'} в следующем раунде говорит на ${Math.abs(Number(ctx.params.seconds || 15))} сек меньше в оправдательной речи.` });

  // 1631 — в следующем раунде категорию раскрытия выбирает не игрок, а «ведущий» (эмулируем случайным выбором).
  E.register('forced_reveal_category_next_round', async ctx => {
    const targetRound = round(ctx) + 1;
    const mine = (await playerCards(ctx, ctx.player.id)).filter(c =>
      c.category !== 'special_condition' && c.category !== 'goal' && c.revealed !== true);
    const categories = [...new Set(mine.map(c => c.category))];
    if (!categories.length) throw new Error('У вас не осталось скрытых категорий для этого эффекта.');
    const chosen = categories[Math.floor(Math.random() * categories.length)];
    await db(ctx).from('round_effects').insert({
      room_code: roomCode(ctx), round: targetRound, effect_key: 'forced_reveal_category',
      source_player_id: ctx.player.id, target_player_id: ctx.player.id,
      effect_params: { category: chosen }, is_active: true
    });
    return { category: chosen };
  }, { targetType: 'self', eventType: 'neutral', eventText: (ctx, r) => `${ctx.player.name || 'Игрок'} в следующем раунде обязан(а) открыть категорию «${r?.category}» (выбор случаен, как решение ведущего).` });

  // 1671 — оставить бонусное свойство бункера закрытым дольше обычного: флаг для проверки при раскрытии.
  E.register('delay_bonus_reveal', async ctx => {
    await addRoundEffect(ctx, { target_player_id: ctx.player.id });
  }, { targetType: 'self', eventType: 'neutral', eventText: ctx => `${ctx.player.name || 'Игрок'} запросил(а) задержку раскрытия бонусного свойства бункера.` });

  // 1665 «Ложный след» — суть карты в том, чтобы соврать, НЕ БУДУЧИ уличённым.
  // Публичное объявление «Игрок X использовал «Ложный след»» полностью ломает карту —
  // все сразу понимают, у кого искать обман. Событие в ленте остаётся (факт есть),
  // но без указания, кто именно это сделал.
  E.register('false_trail', async ctx => {
    const target = targetId(ctx);
    return { targetPlayerId: target };
  }, { targetType: 'self', eventType: 'neutral', eventText: () => 'В этом раунде кто-то объявил заведомо ложную информацию о своей характеристике (кто именно — неизвестно).' });

  // 1687 «Поменяться судьбой» — 4 реальных варианта, выбор в момент применения.
  async function swapAllCardsExcept(ctx, playerA, playerB, excludeCardId) {
    const cardsA = await playerCards(ctx, playerA);
    const cardsB = await playerCards(ctx, playerB);
    const byCategory = new Map();
    for (const c of cardsA) { if (c.id === excludeCardId) continue; if (!byCategory.has(c.category)) byCategory.set(c.category, {}); byCategory.get(c.category).a = c; }
    for (const c of cardsB) { if (c.id === excludeCardId) continue; if (!byCategory.has(c.category)) byCategory.set(c.category, {}); byCategory.get(c.category).b = c; }
    const fields = c => ({ text: c.text, value: c.value, revealed: c.revealed, used: c.used, used_targets: c.used_targets, pool_id: c.pool_id, effect_key: c.effect_key, effect_params: c.effect_params, target_type: c.target_type, target_kind: c.target_kind });
    for (const [, pair] of byCategory) {
      if (!pair.a || !pair.b) continue; // категория есть только у одного — пропускаем, менять нечего
      const snapA = fields(pair.a), snapB = fields(pair.b);
      await db(ctx).from('player_cards').update(snapB).eq('id', pair.a.id);
      await db(ctx).from('player_cards').update(snapA).eq('id', pair.b.id);
    }
  }

  E.register('swap_fates', async ctx => {
    const target = targetId(ctx);
    const modes = [
      'Воскрешение: вы уходите в изгнание, цель возвращается в игру',
      'Обмен количеством голосов, поданных против каждого в этом раунде',
      'Обмен статусом «выставлен/не выставлен» на голосование',
      'Полный обмен карточками персонажей'
    ];
    const choice = window.AliveEffectsUI?.pickCategory
      ? await window.AliveEffectsUI.pickCategory(modes, '«Поменяться судьбой» — выберите вариант')
      : modes[Number(window.prompt(`Выберите вариант:\n${modes.map((m, i) => `${i + 1}. ${m}`).join('\n')}\n\nНомер:`)) - 1];
    if (!choice) return false;
    const mode = modes.indexOf(choice);

    if (mode === 0) {
      const targetPlayer = ctx.players.find(p => p.id === target);
      if (!targetPlayer || targetPlayer.is_alive !== false) throw new Error('Этот вариант работает только с уже выбывшим из игры игроком.');
      const { error: e1 } = await db(ctx).from('players').update({ is_alive: true }).eq('id', target);
      const { error: e2 } = await db(ctx).from('players').update({ is_alive: false }).eq('id', ctx.player.id);
      if (e1 || e2) throw (e1 || e2);
      return { mode: 'revive', targetPlayerId: target };
    }

    if (mode === 1) {
      const { data: votes, error } = await db(ctx).from('votes').select('*').eq('room_code', roomCode(ctx)).eq('round', round(ctx));
      if (error) throw error;
      for (const v of (votes || [])) {
        if (v.target_id === ctx.player.id) await db(ctx).from('votes').update({ target_id: target }).eq('id', v.id);
        else if (v.target_id === target) await db(ctx).from('votes').update({ target_id: ctx.player.id }).eq('id', v.id);
      }
      return { mode: 'votes', targetPlayerId: target };
    }

    if (mode === 2) {
      const nominees = ctx.room.nominees || [];
      const iAmNominated = nominees.includes(ctx.player.id);
      const targetNominated = nominees.includes(target);
      if (iAmNominated === targetNominated) throw new Error('У вас одинаковый статус выставления на голосование — менять нечего.');
      const next = nominees.filter(id => id !== ctx.player.id && id !== target);
      next.push(iAmNominated ? target : ctx.player.id);
      const { error } = await db(ctx).from('rooms').update({ nominees: next }).eq('code', roomCode(ctx));
      if (error) throw error;
      return { mode: 'nomination', targetPlayerId: target };
    }

    // mode === 3 — полный обмен картами (кроме самой карты «Поменяться судьбой», которая сейчас в использовании)
    await swapAllCardsExcept(ctx, ctx.player.id, target, ctx.card.id);
    return { mode: 'cards', targetPlayerId: target };
  }, {
    targetType: 'one', eventType: 'neutral',
    eventText: (ctx, r) => {
      const labels = {
        revive: 'ушёл(ла) в изгнание, вернув выбранного игрока в игру',
        votes: 'обменялся(ась) количеством голосов «против» с выбранным игроком',
        nomination: 'обменялся(ась) статусом выставления на голосование',
        cards: 'полностью обменялся(ась) карточками персонажа с выбранным игроком'
      };
      return `${ctx.player.name || 'Игрок'} ${labels[r?.mode] || 'применил(а) «Поменяться судьбой»'} («Поменяться судьбой»).`;
    }
  });

  // 1688 «Обменяться местом с ведущим на один раунд» — ограниченная версия власти ведущего,
  // намеренно БЕЗ мьюта/кика/изменения настроек (это отдельная, более рискованная возможность —
  // для неё нужен отдельный обработчик, если понадобится).
  E.register('swap_with_host', async ctx => {
    // 1) Раскрыть случайное ещё не раскрытое bonus-свойство бункера раньше срока.
    const props = await roomProperties(ctx);
    const hidden = props.filter(p => p.type === 'bonus' && !p.revealed);
    let revealedText = null;
    if (hidden.length) {
      const pick = hidden[Math.floor(Math.random() * hidden.length)];
      const { error } = await db(ctx).from('room_bunker_properties').update({ revealed: true, available: true }).eq('id', pick.id);
      if (error) throw error;
      revealedText = pick.text;
    }

    // 2) Решающий голос при ничьей позже в этом раунде — переиспользуем готовую логику tie_breaker.
    await db(ctx).from('round_effects').insert({
      room_code: roomCode(ctx), round: round(ctx), effect_key: 'tie_breaker',
      source_player_id: ctx.player.id, target_player_id: ctx.player.id, effect_params: {}, is_active: true
    });

    // 3) Один раз принудительно продвинуть текущую фазу — та же функция, что и кнопка ведущего «Далее».
    let advanced = false;
    if (typeof window !== 'undefined' && typeof window.hostAdvancePhase === 'function') {
      await window.hostAdvancePhase();
      advanced = true;
    }

    return { revealedText, advanced };
  }, {
    targetType: 'self', eventType: 'positive',
    eventText: (ctx, r) => `${ctx.player.name || 'Игрок'} на раунд «занял место ведущего»: ${r?.revealedText ? `раскрыл(а) «${r.revealedText}», ` : ''}получил(а) решающий голос при возможной ничьей${r?.advanced ? ', и принудительно продвинул(а) текущую фазу' : ''}.`
  });

  E.register('narrative_effect', async ctx => {
    const ids = ctx.targets.map(t => t.id || t);
    return { targetPlayerId: ids[0] || null };
  }, { targetType: 'self', eventType: 'neutral', eventText: ctx => `${ctx.player.name || 'Игрок'} использовал(а) спецусловие: «${ctx.card.text}».` });

  window.AliveEffectRegistry = { initialized: true };
})(window);
