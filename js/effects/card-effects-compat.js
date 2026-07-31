/* AliveProject — integration with the existing app.js */
(function (window) {
  'use strict';

  function getState() { return typeof state !== 'undefined' ? state : window.state; }
  function getDb() { return typeof supabaseClient !== 'undefined' ? supabaseClient : window.supabaseClient; }

  async function context(cardId) {
    const s = getState();
    const db = getDb();
    if (!s || !db) throw new Error('Игра ещё не инициализирована.');
    const card = (s.myCardCache || []).find(c => String(c.id) === String(cardId));
    if (!card) {
      const { data, error } = await db.from('player_cards').select('*').eq('id', cardId).eq('player_id', s.playerId).single();
      if (error) throw error;
      return { db, state: s, card: data, room: s.room, players: s.players || [], player: (s.players || []).find(p => p.id === s.playerId) };
    }
    return { db, state: s, card, room: s.room, players: s.players || [], player: (s.players || []).find(p => p.id === s.playerId) };
  }

  function normalize(type) {
    return ({ one_other: 'one', one_any: 'one', two_other: 'two', host: 'one', none: 'self' })[type] || type || 'self';
  }

  async function execute(cardId) {
    const c = await context(cardId);
    if (!c.player || c.player.is_alive === false) throw new Error('Вы выбыли и не можете использовать спецусловия.');
    if (c.card.used) throw new Error('Эта карта уже использована.');
    if (!c.card.revealed) throw new Error('Сначала откройте спецусловие.');

    const type = normalize(c.card.target_type);
    const kind = c.card.target_kind || 'player';
    let targets = [];

    if (type === 'one' || type === 'two') {
      let candidates;
      if (kind === 'property') {
        if (!c.room.scenario_id) throw new Error('Сценарий бункера не выбран.');
        const { data, error } = await c.db.from('bunker_properties').select('id,type,text').eq('scenario_id', c.room.scenario_id);
        if (error) throw error;
        candidates = (data || []).filter(p => p.type === 'base' || p.type === 'bonus');
      } else {
        candidates = c.players.filter(p => p.id !== c.player.id && p.id !== c.room.host_id && p.is_alive !== false);
      }
      targets = await window.AliveEffectsUI.pick(c.card, candidates, type === 'two' ? 2 : 1);
      if (!targets) return false;
    } else if (type === 'all') {
      targets = c.players.filter(p => p.id !== c.player.id && p.id !== c.room.host_id && p.is_alive !== false);
    }

    if (type === 'self') targets = [];
    if (type === 'self' && c.card.effect_key === 'vote_immunity') targets = [{ id: c.player.id, name: c.player.name }];

    if (!await window.AliveEffectsUI.confirm(c.card, targets)) return false;

    const result = await window.AliveEffectEngine.execute({
      db: c.db, room: c.room, players: c.players, player: c.player, card: c.card, targets
    });

    if (result.success) {
      if (typeof window.loadMyCard === 'function') await window.loadMyCard();
      if (typeof window.updateGameDynamic === 'function') await window.updateGameDynamic();
      if (typeof window.refreshEventsFeed === 'function') await window.refreshEventsFeed();
    }
    return result.success;
  }

  const originalVote = window.actionCastVote;
  window.actionUseSpecialCondition = async function (cardId) {
    try { return await execute(cardId); }
    catch (e) {
      console.error('[AliveEffectEngine]', e);
      alert((e.message || 'Не удалось выполнить спецусловие.') + '\n\nКарта НЕ потрачена.');
      return false;
    }
  };

  window.actionCastVote = async function (targetId) {
    const c = await context('__vote_context__').catch(() => null);
    if (!c) return originalVote(targetId);
    const { data, error } = await c.db.from('round_effects').select('id')
      .eq('room_code', c.room.code).eq('round', c.room.current_round).eq('is_active', true)
      .eq('effect_key', 'vote_immunity').eq('target_player_id', c.player.id);
    if (!error && data?.length) {
      alert('Ваш голос защищён картой «Иммунитет» и не может быть использован в этом раунде.');
      return false;
    }
    return originalVote(targetId);
  };

  const originalResolve = window.resolveVoting;
  window.resolveVoting = async function () {
    const s = getState(), db = getDb();
    if (!s?.room || !db) return originalResolve();
    const r = s.room;
    const { data: votes, error } = await db.from('votes').select('*').eq('room_code', r.code).eq('round', r.current_round);
    if (error) throw error;
    const { data: effects, error: ee } = await db.from('round_effects').select('*')
      .eq('room_code', r.code).eq('round', r.current_round).eq('is_active', true);
    if (ee) throw ee;

    const immunity = new Set((effects || []).filter(e => e.effect_key === 'vote_immunity').map(e => e.target_player_id));
    const nullified = new Set((effects || []).filter(e => e.effect_key === 'vote_nullified').map(e => e.target_player_id));
    const weights = new Map((effects || []).filter(e => e.effect_key === 'vote_weight').map(e => [e.target_player_id, Number(e.effect_params?.weight || 2)]));
    const tally = {};
    (r.nominees || []).forEach(id => { tally[id] = 0; });
    (votes || []).forEach(v => {
      if (immunity.has(v.voter_id) || nullified.has(v.voter_id)) return;
      if (tally[v.target_id] === undefined) return;
      tally[v.target_id] += weights.get(v.voter_id) || 1;
    });

    const counts = Object.values(tally);
    const maxVotes = counts.length ? Math.max(...counts) : 0;
    const top = Object.keys(tally).filter(id => tally[id] === maxVotes);
    const event = async (type, text, target = null) => {
      const { error: e } = await db.from('game_events').insert({ room_code: r.code, round: r.current_round, type, text, target_id: target, private: false });
      if (e) console.error(e);
    };

    if (!maxVotes || !top.length) {
      await event('neutral', 'Голосование не выявило кандидата на исключение — никто не набрал действительных голосов.');
      await db.from('rooms').update({ current_phase: 'vote_result', phase_ends_at: null, phase_running: false, phase_paused_remaining: null, last_eliminated_id: null }).eq('code', r.code);
      return;
    }
    if (top.length > 1) {
      const names = top.map(pid => (s.players.find(p => p.id === pid) || {}).name || '?').join(', ');
      await db.from('votes').delete().eq('room_code', r.code).eq('round', r.current_round);
      await event('neutral', `Ничья при голосовании (${names}) — повторная оправдательная речь и голосование среди них.`);
      const seconds = r.settings?.phase_seconds?.defense || 30;
      const ends = seconds > 0 ? new Date(Date.now() + seconds * 1000).toISOString() : null;
      await db.from('rooms').update({ nominees: top, defense_index: 0, current_phase: 'defense', phase_ends_at: ends, phase_running: seconds > 0, phase_paused_remaining: null }).eq('code', r.code);
      return;
    }
    const eliminatedId = top[0];
    const eliminated = s.players.find(p => p.id === eliminatedId);
    await db.from('players').update({ is_alive: false }).eq('id', eliminatedId).eq('room_code', r.code);
    await event('negative', `${eliminated?.name || 'Игрок'} исключён(а) по итогам голосования (${maxVotes} действительных баллов).`, eliminatedId);
    await db.from('rooms').update({ current_phase: 'vote_result', phase_ends_at: null, phase_running: false, phase_paused_remaining: null, last_eliminated_id: eliminatedId }).eq('code', r.code);
  };

  window.AliveEffects = { execute };
})(window);
