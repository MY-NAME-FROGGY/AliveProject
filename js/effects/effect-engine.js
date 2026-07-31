/* AliveProject — Effect Engine
 * Safe, transactional-by-order client dispatcher.
 * It never marks a card used until its handler succeeds.
 */
(function (window) {
  'use strict';

  const Engine = {
    handlers: new Map(),

    register(key, handler, meta = {}) {
      if (!key || typeof handler !== 'function') throw new Error('Invalid effect registration');
      this.handlers.set(key, { handler, meta });
    },

    has(key) { return this.handlers.has(key); },
    get(key) { return this.handlers.get(key) || null; },
    list() { return [...this.handlers.keys()]; },

    async execute(ctx) {
      const key = ctx.card?.effect_key;
      if (!key) throw new Error('Для этой карты ещё не задан effect_key. Карта не потрачена.');
      const entry = this.get(key);
      if (!entry) throw new Error(`Эффект «${key}» ещё не зарегистрирован. Карта не потрачена.`);

      const targetType = ctx.card.target_type || entry.meta.targetType || 'self';
      const targets = Array.isArray(ctx.targets) ? ctx.targets : [];
      validateTargetCount(targetType, targets);

      const result = await entry.handler({ ...ctx, targetType, effectKey: key });
      if (result === false || result?.cancelled) return { success: false, cancelled: true };
      if (result?.success === false) throw new Error(result.error || 'Эффект не выполнен');

      const targetIds = targets.map(t => typeof t === 'string' ? t : t.id).filter(Boolean);
      const { db, card } = ctx;
      const { error: cardError } = await db
        .from('player_cards')
        .update({ used: true, used_targets: targetIds })
        .eq('id', card.id)
        .eq('used', false);
      if (cardError) throw cardError;

      await insertEvent(ctx, {
        type: 'neutral',
        text: `${ctx.player.name || 'Игрок'} использовал(а) спецусловие: ${card.text}`,
        targetId: targetIds[0] || null
      });

      return { success: true, effectKey: key, targetIds, result };
    }
  };

  function validateTargetCount(type, targets) {
    const n = targets.length;
    if (type === 'self' && n !== 0 && n !== 1) throw new Error('Это действие не требует выбора другой цели.');
    if (type === 'one' && n !== 1) throw new Error('Нужно выбрать ровно одного игрока.');
    if (type === 'two' && n !== 2) throw new Error('Нужно выбрать ровно двух игроков.');
  }

  async function insertEvent(ctx, { type, text, targetId = null }) {
    const { error } = await ctx.db.from('game_events').insert({
      room_code: ctx.room.code,
      round: ctx.room.current_round || 1,
      type,
      text,
      target_id: targetId,
      private: false
    });
    if (error) console.error('[EffectEngine] game_events:', error);
  }

  window.AliveEffectEngine = Engine;
})(window);
