/* AliveProject — compatibility layer.
 * Loaded AFTER app.js. Existing game code keeps working; this layer replaces only
 * special-condition execution and makes the existing vote resolver effect-aware.
 */
(function (window) {
  'use strict';

  const URL = 'https://dhuqvintfsmbigmvdvak.supabase.co';
  const KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRodXF2aW50ZnNtYmlnbXZkdmFrIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODMwODAxODQsImV4cCI6MjA5ODY1NjE4NH0.badg8idLoAL-Y4sxR7zj9NTHdyKrBdh_Cv90fimAD-4';
  const db = window.supabase.createClient(URL, KEY);

  const id = () => localStorage.getItem('playerId');
  const roomCode = () => localStorage.getItem('currentRoomCode');

  async function context() {
    const code = roomCode();
    const me = id();
    if (!code || !me) throw new Error('Комната или игрок не определены.');
    const [{ data: room, error: re }, { data: players, error: pe }] = await Promise.all([
      db.from('rooms').select('*').eq('code', code).single(),
      db.from('players').select('*').eq('room_code', code).order('created_at')
    ]);
    if (re) throw re;
    if (pe) throw pe;
    const player = (players || []).find(p => p.id === me);
    if (!player) throw new Error('Игрок не найден в комнате.');
    return { db, room, players: players || [], player };
  }

  async function card(cardId) {
    const c = await context();
    const { data, error } = await db.from('player_cards').select('*').eq('id', cardId).eq('player_id', c.player.id).single();
    if (error) throw error;
    return { ...c, card: data };
  }

  function targetKind(c) {
    return c.card.target_kind || (c.card.action_type === 'bunker_effect' ? 'property' : 'player');
  }

  async function loadProperties(c) {
    const { data, error } = await db.from('room_bunker_properties')
      .select('id,property_id,type,text,available,revealed,blocked,blocked_until_round')
      .eq('room_code', c.room.code);
    if (error) throw error;
    const round = c.room.current_round || 1;
    return (data || []).filter(p =>
      (p.type === 'base' || p.type === 'bonus') &&
      p.available !== false &&
      !(p.blocked && (p.blocked_until_round == null || p.blocked_until_round >= round))
    );
  }

  async function execute(cardId) {
    const c = await card(cardId);
    if (c.card.used) throw new Error('Эта карта уже использована.');
    if (c.player.is_alive === false) throw new Error('Вы выбыли и не можете использовать спецусловия.');

    const type = c.card.target_type || 'self';
    const kind = targetKind(c);
    let targets = [];

    if (type === 'one' || type === 'two') {
      const candidates = kind === 'property'
        ? await loadProperties(c)
        : c.players.filter(p => p.id !== c.player.id && p.id !== c.room.host_id && p.is_alive !== false);
      targets = await window.AliveEffectsUI.pick(c.card, candidates, type === 'two' ? 2 : 1);
      if (!targets) return false;
    } else if (type === 'all') {
      targets = c.players.filter(p => p.id !== c.player.id && p.id !== c.room.host_id && p.is_alive !== false);
    }

    if (type === 'self') targets = [];
    if (type === 'self' && c.card.effect_key === 'vote_immunity') targets = [{ id: c.player.id, name: c.player.name }];

    if (!await window.AliveEffectsUI.confirm(c.card, targets)) return false;
    const result = await window.AliveEffectEngine.execute({ ...c, targets });
    if (result.success) {
      if (typeof window.loadMyCard === 'function') window.loadMyCard();
      if (typeof window.updateGameDynamic === 'function') window.updateGameDynamic();
      if (typeof window.refreshEventsFeed === 'function') window.refreshEventsFeed();
    }
    return result.success;
  }

  window.actionUseSpecialCondition = async function (cardId) {
    try {
      return await execute(cardId);
    } catch (e) {
      console.error('[Alive effects]', e);
      alert((e.message || 'Не удалось выполнить спецусловие.') + '\nКарта не потрачена.');
      return false;
    }
  };

  // Make the existing voting action reject an immune voter only through UI/DB state.
  const oldVote = window.actionCastVote;
  window.actionCastVote = async function (targetId) {
    const c = await context();
    const { data: effects, error } = await db.from('round_effects').select('*')
      .eq('room_code', c.room.code).eq('round', c.room.current_round).eq('is_active', true)
      .eq('effect_key', 'vote_immunity').eq('target_player_id', c.player.id);
    if (error) { console.error(error); }
    if (effects && effects.length) {
      alert('Ваш голос защищён картой «Иммунитет» и не может быть использован в этом раунде.');
      return;
    }
    return oldVote(targetId);
  };

  // Resolve voting with weight/nullification effects, then reproduce the original state transition.
  const oldResolve = window.resolveVoting;
  window.resolveVoting = async function () {
    const c = await context();
    const r = c.room;
    const nominees = r.nominees || [];
    const { data: votes, error } = await db.from('votes').select('*').eq('room_code', r.code).eq('round', r.current_round);
    if (error) throw error;

    const { data: effects, error: ee } = await db.from('round_effects').select('*')
      .eq('room_code', r.code).eq('is_active', true)
      .or(`round.eq.${r.current_round},round.eq.0`);
    if (ee) throw ee;

    const thisRound = e => e.round === r.current_round;
    const permanent = e => e.round === 0;

    const immunity = new Set(effects.filter(e => thisRound(e) && e.effect_key === 'vote_immunity').map(e => e.target_player_id));
    const nullified = new Set(effects.filter(e => thisRound(e) && e.effect_key === 'vote_nullified').map(e => e.target_player_id));
    const weights = new Map(effects.filter(e => thisRound(e) && e.effect_key === 'vote_weight').map(e => [e.target_player_id, Number(e.effect_params?.weight || 2)]));
    const protect = new Set(effects.filter(e => thisRound(e) && e.effect_key === 'protect_target').map(e => e.target_player_id));

    const event = async (type, text, target = null, isPrivate = false) => {
      await db.from('game_events').insert({ room_code: r.code, round: r.current_round, type, text, target_id: target, private: isPrivate });
    };

    // «Открытое голосование» — публикуем, кто за кого проголосовал.
    if (effects.some(e => thisRound(e) && e.effect_key === 'open_voting')) {
      for (const v of (votes || [])) {
        const voter = c.players.find(p => p.id === v.voter_id)?.name || '?';
        const target = c.players.find(p => p.id === v.target_id)?.name || '?';
        await event('neutral', `Открытое голосование: ${voter} → ${target}.`);
      }
    }

    // «Слежка» — приватно раскрываем выбранному игроку, за кого проголосовала его цель.
    for (const e of effects.filter(x => thisRound(x) && x.effect_key === 'spy_vote')) {
      const targetVote = (votes || []).find(v => v.voter_id === e.target_player_id);
      const votedFor = targetVote ? (c.players.find(p => p.id === targetVote.target_id)?.name || '?') : 'не голосовал(а)';
      const watched = c.players.find(p => p.id === e.target_player_id)?.name || '?';
      await event('neutral', `Слежка: ${watched} проголосовал(а) за ${votedFor}.`, e.source_player_id, true);
    }

    const tally = {};
    nominees.forEach(n => { tally[n] = 0; });
    (votes || []).forEach(v => {
      if (immunity.has(v.voter_id) || nullified.has(v.voter_id)) return;
      if (protect.has(v.target_id)) return;
      if (tally[v.target_id] === undefined) return;
      tally[v.target_id] += weights.get(v.voter_id) || 1;
    });

    // «Второй голос» — воздержавшиеся с этим эффектом досыпают голос лидеру.
    const abstainers = effects.filter(e => thisRound(e) && e.effect_key === 'second_vote_abstain')
      .filter(e => !(votes || []).some(v => v.voter_id === e.source_player_id));
    if (abstainers.length) {
      const leadNow = Math.max(0, ...Object.values(tally));
      const leaders = Object.keys(tally).filter(k => tally[k] === leadNow && leadNow > 0);
      if (leaders.length === 1) {
        tally[leaders[0]] += abstainers.length;
        await event('neutral', `«Второй голос»: ${abstainers.length} воздержавшихся присоединили голос к лидеру голосования.`);
      }
    }

    const counts = Object.values(tally);
    const maxVotes = counts.length ? Math.max(...counts) : 0;
    let top = Object.keys(tally).filter(k => tally[k] === maxVotes);

    if (!maxVotes || !top.length) {
      await event('neutral', 'Голосование не выявило кандидата на исключение — никто не набрал действительных голосов.');
      await db.from('rooms').update({ current_phase: 'vote_result', phase_ends_at: null, phase_running: false, phase_paused_remaining: null, last_eliminated_id: null }).eq('code', r.code);
      return;
    }

    if (top.length > 1) {
      // «Компромисс» — держатель эффекта лично решает исход равенства голосов.
      const tieBreaker = effects.find(e => thisRound(e) && e.effect_key === 'tie_breaker');
      if (tieBreaker) {
        const holder = c.players.find(p => p.id === tieBreaker.source_player_id)?.name || 'игрок с «Компромиссом»';
        const names = top.map(pid => c.players.find(p => p.id === pid)?.name || pid);
        const choice = window.prompt(`«Компромисс»: ${holder} решает исход равенства голосов.\n\nКандидаты:\n${names.map((n, i) => `${i + 1}. ${n}`).join('\n')}\n\nВведите номер того, кто выбывает:`);
        const idx = Number(choice) - 1;
        if (Number.isInteger(idx) && top[idx]) {
          top = [top[idx]];
          await event('neutral', `«Компромисс»: ${holder} лично решил(а) исход равенства голосов.`);
        }
      }
    }

    if (top.length > 1) {
      const names = top.map(pid => (c.players.find(p => p.id === pid) || {}).name || '?').join(', ');
      await db.from('votes').delete().eq('room_code', r.code).eq('round', r.current_round);
      await event('neutral', `Ничья при голосовании (${names}) — повторная оправдательная речь и голосование среди них.`);
      const seconds = r.settings?.phase_seconds?.defense || 30;
      const ends = seconds > 0 ? new Date(Date.now() + seconds * 1000).toISOString() : null;
      await db.from('rooms').update({ nominees: top, defense_index: 0, current_phase: 'defense', phase_ends_at: ends, phase_running: seconds > 0, phase_paused_remaining: null }).eq('code', r.code);
      return;
    }

    let eliminatedId = top[0];
    const eliminated = c.players.find(p => p.id === eliminatedId);

    // «Второй шанс» — монетка перед исключением.
    const secondChance = effects.find(e => thisRound(e) && e.effect_key === 'coin_flip_survival' && e.target_player_id === eliminatedId);
    if (secondChance) {
      const heads = Math.random() < 0.5;
      await event('neutral', `«Второй шанс»: ${eliminated?.name || 'Игрок'} бросает монету... выпал(а) ${heads ? 'орёл — остаётся в игре!' : 'решка — исключение подтверждено.'}`);
      if (heads) {
        await db.from('rooms').update({ current_phase: 'vote_result', phase_ends_at: null, phase_running: false, phase_paused_remaining: null, last_eliminated_id: null }).eq('code', r.code);
        return;
      }
    }

    await db.from('players').update({ is_alive: false }).eq('id', eliminatedId).eq('room_code', r.code);
    await event('negative', `${eliminated?.name || 'Игрок'} исключён(а) по итогам голосования (${maxVotes} действительных баллов).`, eliminatedId);

    // «Наследство» — постоянные (round=0) заявки на карты выбывшего игрока.
    const heirs = effects.filter(e => permanent(e) && e.effect_key === 'heir' && e.target_player_id === eliminatedId);
    if (heirs.length) {
      const { data: lostCards } = await db.from('player_cards').select('*')
        .eq('room_code', r.code).eq('player_id', eliminatedId).eq('revealed', true)
        .neq('category', 'special_condition').neq('category', 'goal');
      for (const h of heirs) {
        const { data: heirCards } = await db.from('player_cards').select('*')
          .eq('room_code', r.code).eq('player_id', h.source_player_id);
        for (const lost of (lostCards || [])) {
          const mine = (heirCards || []).find(x => x.category === lost.category);
          if (!mine) continue;
          await db.from('player_cards').update({ text: lost.text, value: lost.value, revealed: true }).eq('id', mine.id);
        }
        const heirName = c.players.find(p => p.id === h.source_player_id)?.name || 'Игрок';
        await event('positive', `«Наследство»: ${heirName} получил(а) открытые характеристики ${eliminated?.name || 'выбывшего'}.`, h.source_player_id);
      }
    }

    await db.from('rooms').update({ current_phase: 'vote_result', phase_ends_at: null, phase_running: false, phase_paused_remaining: null, last_eliminated_id: eliminatedId }).eq('code', r.code);
  };

  // ---- Хелперы для интеграции с местами кода, которых нет в этом файле ----
  // Вызывайте их из функции отправки чат-сообщений и из функции выставления на голосование.

  async function activeFlags(effectKey, playerId) {
    const code = roomCode();
    const room = (await db.from('rooms').select('current_round').eq('code', code).single()).data;
    const { data, error } = await db.from('round_effects').select('*')
      .eq('room_code', code).eq('round', room?.current_round || 1).eq('is_active', true)
      .eq('effect_key', effectKey).eq('target_player_id', playerId);
    if (error) { console.error(error); return []; }
    return data || [];
  }

  // true, если игроку нельзя говорить/писать в общий чат в этом раунде.
  async function isChatBlocked(playerId, neighborOf = null) {
    const all = await activeFlags('chat_block_all', playerId);
    if (all.length) return true;
    if (neighborOf) {
      const nb = await activeFlags('chat_block_neighbors', playerId);
      if (nb.length) return true; // упрощение: блокирует общение в раунде целиком, соседство не различаем без карты мест
    }
    return false;
  }

  // true, если игроку нельзя пользоваться личным чатом в этом раунде.
  async function isPrivateChatBlocked(playerId) {
    return (await activeFlags('chat_block_self_private', playerId)).length > 0;
  }

  // true, если игрок в этом раунде не может никого выставить на голосование.
  async function canNominate(playerId) {
    return (await activeFlags('skip_nomination', playerId)).length === 0;
  }

  window.AliveEffects = { db, execute, oldVote, oldResolve, isChatBlocked, isPrivateChatBlocked, canNominate };
})(window);
