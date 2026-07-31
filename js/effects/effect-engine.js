/* AliveProject — Unified Effect Engine / Stage 3
 * Единственный диспетчер спецусловий. Не подключайте card-effect-engine.js одновременно.
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

    normalizeTargetType(type) {
      const aliases = {
        one_other: 'one',
        one_any: 'one',
        two_other: 'two',
        host: 'one',
        none: 'self'
      };
      return aliases[type] || type || 'self';
    },

    async execute(ctx) {
      const card = ctx.card;
      const key = card?.effect_key;
      if (!key) throw new Error('Для этой карты ещё не задан effect_key. Карта не потрачена.');

      const entry = this.get(key);
      if (!entry) throw new Error(`Эффект «${key}» ещё не зарегистрирован. Карта не потрачена.`);

      const targetType = this.normalizeTargetType(card.target_type || entry.meta.targetType || 'self');
      const targets = Array.isArray(ctx.targets) ? ctx.targets : [];
      validateTargetCount(targetType, targets);

      const result = await entry.handler({
        ...ctx,
        targetType,
        effectKey: key,
        params: card.effect_params || {}
      });

      if (result === false || result?.cancelled) return { success: false, cancelled: true };
      if (result?.success === false) throw new Error(result.error || 'Эффект не выполнен');

      const targetIds = targets.map(t => typeof t === 'string' ? t : t?.id).filter(Boolean);
      const { db } = ctx;

      const { data: marked, error: cardError } = await db
        .from('player_cards')
        .update({ used: true, used_targets: targetIds })
        .eq('id', card.id)
        .eq('player_id', ctx.player.id)
        .eq('used', false)
        .select('id')
        .maybeSingle();
      if (cardError) throw cardError;
      if (!marked) throw new Error('Карта уже была использована или недоступна. Изменения не подтверждены.');

      await insertEvent(ctx, {
        type: entry.meta.eventType || 'neutral',
        text: entry.meta.eventText
          ? entry.meta.eventText(ctx, result)
          : `${ctx.player.name || 'Игрок'} использовал(а) спецусловие: ${card.text}`,
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
