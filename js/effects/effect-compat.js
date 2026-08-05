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
      .eq('room_code', r.code).eq('round', r.current_round).eq('is_active', true);
    if (ee) throw ee;

    const immunity = new Set((effects || []).filter(e => e.effect_key === 'vote_immunity').map(e => e.target_player_id));
    const nullified = new Set((effects || []).filter(e => e.effect_key === 'vote_nullified').map(e => e.target_player_id));
    const weights = new Map((effects || []).filter(e => e.effect_key === 'vote_weight').map(e => [e.target_player_id, Number(e.effect_params?.weight || 2)]));

    const tally = {};
    nominees.forEach(n => { tally[n] = 0; });
    (votes || []).forEach(v => {
      if (immunity.has(v.voter_id) || nullified.has(v.voter_id)) return;
      if (tally[v.target_id] === undefined) return;
      tally[v.target_id] += weights.get(v.voter_id) || 1;
    });

    const counts = Object.values(tally);
    const maxVotes = counts.length ? Math.max(...counts) : 0;
    const top = Object.keys(tally).filter(k => tally[k] === maxVotes);
    const event = async (type, text, target = null) => {
      await db.from('game_events').insert({ room_code: r.code, round: r.current_round, type, text, target_id: target, private: false });
    };

    if (!maxVotes || !top.length) {
      await event('neutral', 'Голосование не выявило кандидата на исключение — никто не набрал действительных голосов.');
      await db.from('rooms').update({ current_phase: 'vote_result', phase_ends_at: null, phase_running: false, phase_paused_remaining: null, last_eliminated_id: null }).eq('code', r.code);
      return;
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

    const eliminatedId = top[0];
    const eliminated = c.players.find(p => p.id === eliminatedId);
    await db.from('players').update({ is_alive: false }).eq('id', eliminatedId).eq('room_code', r.code);
    await event('negative', `${eliminated?.name || 'Игрок'} исключён(а) по итогам голосования (${maxVotes} действительных баллов).`, eliminatedId);
    await db.from('rooms').update({ current_phase: 'vote_result', phase_ends_at: null, phase_running: false, phase_paused_remaining: null, last_eliminated_id: eliminatedId }).eq('code', r.code);
  };

  window.AliveEffects = { db, execute, oldVote, oldResolve };
})(window);
