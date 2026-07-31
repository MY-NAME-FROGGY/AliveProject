/* AliveProject — Card Effect Engine
 * Этап 2: реальные card_effect взаимодействия.
 * Подключается ПОСЛЕ app.js.
 */
(function () {
  'use strict';

  const api = {
    get state() { return window.state || (typeof state !== 'undefined' ? state : null); },
    get supabase() { return window.supabaseClient || (typeof supabaseClient !== 'undefined' ? supabaseClient : null); }
  };

  const registry = Object.create(null);

  function register(key, handler) {
    registry[key] = handler;
  }

  function escapeHtmlSafe(value) {
    if (typeof window.escapeHtml === 'function') return window.escapeHtml(String(value ?? ''));
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
      '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
    }[ch]));
  }

  async function insertEvent(text, targetId = null, type = 'neutral') {
    const s = api.state;
    if (typeof window.dbInsertEvent === 'function' && s?.currentRoomCode && s?.room) {
      await window.dbInsertEvent(s.currentRoomCode, s.room.current_round, type, text, targetId, false);
    }
  }

  async function getCard(cardId) {
    const s = api.state;
    const local = (s?.myCardCache || []).find(c => String(c.id) === String(cardId));
    if (local) return local;
    const { data, error } = await api.supabase
      .from('player_cards').select('*').eq('id', cardId).maybeSingle();
    if (error) throw error;
    return data;
  }

  async function getPlayerCard(playerId, category = null) {
    const s = api.state;
    let q = api.supabase.from('player_cards').select('*')
      .eq('room_code', s.currentRoomCode).eq('player_id', playerId);
    if (category) q = q.eq('category', category);
    const { data, error } = await q.order('id');
    if (error) throw error;
    return data || [];
  }

  async function getTargets(card) {
    const s = api.state;
    const targetType = card.target_type || 'self';
    const alive = (s.players || []).filter(p =>
      p.id !== s.playerId && p.id !== s.room.host_id && p.is_alive !== false
    );

    if (targetType === 'self') return [];
    if (targetType === 'all') return alive.map(p => p.id);

    if (typeof window.collectSpecialTargets === 'function') {
      return window.collectSpecialTargets(card.id, targetType);
    }

    const picker = document.getElementById('targetPicker_' + card.id);
    const values = picker
      ? Array.from(picker.querySelectorAll('input:checked')).map(x => x.value)
      : [];
    const need = targetType === 'two' ? 2 : 1;
    if (values.length !== need) throw new Error(`Нужно выбрать ровно ${need} цель${need === 1 ? 'ь' : 'и'}.`);
    return values;
  }

  function playerName(id) {
    const s = api.state;
    return (s.players || []).find(p => p.id === id)?.name || 'Игрок';
  }

  async function markUsed(card, targets) {
    const { error } = await api.supabase.from('player_cards')
      .update({ used: true, used_targets: targets || [] })
      .eq('id', card.id).eq('player_id', api.state.playerId).eq('used', false);
    if (error) throw error;
  }

  async function revealGuard(card) {
    if (!card) throw new Error('Спецусловие не найдено.');
    if (card.used) throw new Error('Это спецусловие уже использовано.');
    if (!card.revealed) throw new Error('Сначала откройте спецусловие.');
    if (api.state.players.find(p => p.id === api.state.playerId)?.is_alive === false) {
      throw new Error('Вы выбыли из игры.');
    }
  }

  async function chooseCategory(playerId, promptText, candidates) {
    if (!candidates.length) throw new Error('У цели нет подходящих характеристик.');
    const labels = candidates.map((c, i) =>
      `${i + 1}. ${c.category}: ${c.text}`
    ).join('\n');
    const raw = window.prompt(`${promptText}\n\n${labels}\n\nВведите номер:`);
    if (raw === null) return null;
    const idx = Number(raw) - 1;
    if (!Number.isInteger(idx) || idx < 0 || idx >= candidates.length) {
      throw new Error('Выбрана некорректная характеристика.');
    }
    return candidates[idx];
  }

  async function updateCard(id, patch) {
    const { data, error } = await api.supabase.from('player_cards')
      .update(patch).eq('id', id).select('*').maybeSingle();
    if (error) throw error;
    return data;
  }

  function publicTraitCandidates(cards) {
    return cards.filter(c =>
      c.category !== 'special_condition' &&
      c.category !== 'goal' &&
      c.revealed === true
    );
  }

  register('steal_trait', async ({ card, targets }) => {
    const targetId = targets[0];
    const targetCards = publicTraitCandidates(await getPlayerCard(targetId));
    const stolen = await chooseCategory(
      targetId,
      `Ограбление: выберите открытую характеристику ${playerName(targetId)} для кражи.`,
      targetCards
    );
    if (!stolen) return false;

    const mine = (await getPlayerCard(api.state.playerId))
      .find(c => c.category === stolen.category);
    if (!mine) throw new Error(`У вас нет характеристики категории «${stolen.category}».`);

    await updateCard(mine.id, {
      text: stolen.text,
      value: stolen.value,
      revealed: true
    });
    await updateCard(stolen.id, {
      text: '[Характеристика украдена]',
      value: 0,
      revealed: true
    });

    await insertEvent(
      `${playerName(api.state.playerId)} украл(а) у ${playerName(targetId)} характеристику «${stolen.category}».`,
      targetId,
      'negative'
    );
    return true;
  });

  register('swap_trait', async ({ card, targets }) => {
    const targetId = targets[0];
    const targetCards = publicTraitCandidates(await getPlayerCard(targetId));
    const selected = await chooseCategory(
      targetId,
      `Обмен: выберите характеристику ${playerName(targetId)}, которую хотите обменять.`,
      targetCards
    );
    if (!selected) return false;

    const mine = (await getPlayerCard(api.state.playerId))
      .find(c => c.category === selected.category);
    if (!mine) throw new Error(`У вас нет категории «${selected.category}».`);

    const mineSnapshot = {
      text: mine.text, value: mine.value, revealed: mine.revealed
    };
    const targetSnapshot = {
      text: selected.text, value: selected.value, revealed: selected.revealed
    };

    await updateCard(mine.id, targetSnapshot);
    await updateCard(selected.id, mineSnapshot);

    await insertEvent(
      `${playerName(api.state.playerId)} обменял(а) характеристику «${selected.category}» с ${playerName(targetId)}.`,
      targetId,
      'neutral'
    );
    return true;
  });

  register('copy_trait', async ({ card, targets }) => {
    const targetId = targets[0];
    const targetCards = publicTraitCandidates(await getPlayerCard(targetId));
    const selected = await chooseCategory(
      targetId,
      `Копирование: выберите открытую характеристику ${playerName(targetId)}.`,
      targetCards
    );
    if (!selected) return false;

    const mine = (await getPlayerCard(api.state.playerId))
      .find(c => c.category === selected.category);
    if (!mine) throw new Error(`У вас нет категории «${selected.category}».`);

    await updateCard(mine.id, {
      text: selected.text,
      value: selected.value,
      revealed: true
    });

    await insertEvent(
      `${playerName(api.state.playerId)} скопировал(а) характеристику «${selected.category}» у ${playerName(targetId)}.`,
      targetId,
      'positive'
    );
    return true;
  });

  register('inherit_trait', async ({ card, targets }) => {
    const targetId = targets[0];
    const targetCards = publicTraitCandidates(await getPlayerCard(targetId));
    const selected = await chooseCategory(
      targetId,
      `Наследство: выберите открытую характеристику ${playerName(targetId)}.`,
      targetCards
    );
    if (!selected) return false;

    const mine = (await getPlayerCard(api.state.playerId))
      .find(c => c.category === selected.category);
    if (!mine) throw new Error(`У вас нет категории «${selected.category}».`);

    await updateCard(mine.id, {
      text: selected.text,
      value: selected.value,
      revealed: true
    });

    await insertEvent(
      `${playerName(api.state.playerId)} получил(а) наследство: «${selected.category}».`,
      targetId,
      'positive'
    );
    return true;
  });

  register('block_luggage', async ({ card, targets }) => {
    const targetId = targets[0];
    const room = api.state.room;
    const round = room.current_round;

    const { error } = await api.supabase.from('round_effects').insert({
      room_code: api.state.currentRoomCode,
      round,
      effect_key: 'block_luggage',
      source_player_id: api.state.playerId,
      target_player_id: targetId,
      effect_params: { categories: ['luggage_big', 'luggage_small'] },
      is_active: true
    });
    if (error) throw error;

    await insertEvent(
      `${playerName(api.state.playerId)} заблокировал(а) багаж игрока ${playerName(targetId)} на этот раунд.`,
      targetId,
      'negative'
    );
    return true;
  });

  async function execute(cardId) {
    const card = await getCard(cardId);
    await revealGuard(card);

    const key = card.effect_key;
    const handler = registry[key];
    if (!handler) {
      throw new Error(`Для спецусловия ещё не зарегистрирован эффект «${key || 'не указан'}». Карта не потрачена.`);
    }

    const targets = await getTargets(card);
    const result = await handler({
      card,
      targets,
      params: card.effect_params || {}
    });

    if (result === false) return false;

    await markUsed(card, targets);
    return true;
  }

  window.AliveCardEffects = {
    register,
    execute,
    registry,
    getTargets
  };
})();
