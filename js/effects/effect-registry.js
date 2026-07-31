/* AliveProject — built-in effects.
 * Only mechanics that are explicitly represented by DB fields are implemented here.
 * Unknown effects fail safely and do not burn the card.
 */
(function (window) {
  'use strict';
  const E = window.AliveEffectEngine;
  if (!E) throw new Error('effect-engine.js must load first');

  const roomCode = ctx => ctx.room.code;
  const round = ctx => ctx.room.current_round || 1;
  const targetId = ctx => (ctx.targets[0] && (ctx.targets[0].id || ctx.targets[0])) || null;

  async function addRoundEffect(ctx, payload) {
    const { data, error } = await ctx.db.from('round_effects').insert({
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

  E.register('vote_immunity', async ctx => {
    await addRoundEffect(ctx, { target_player_id: ctx.player.id, effect_params: { duration: 'round' } });
  }, { targetType: 'self' });

  E.register('vote_nullified', async ctx => {
    await addRoundEffect(ctx, { target_player_id: targetId(ctx) });
  }, { targetType: 'one' });

  E.register('vote_weight', async ctx => {
    await addRoundEffect(ctx, {
      target_player_id: targetId(ctx),
      effect_params: { weight: Number(ctx.card.effect_params?.weight || 2) }
    });
  }, { targetType: 'one' });

  E.register('reduce_capacity', async ctx => {
    const property = ctx.targets[0];
    await addRoundEffect(ctx, {
      target_property_id: property.id || property.property_id || property,
      effect_params: { amount: Number(ctx.card.effect_params?.amount || 1) }
    });
  }, { targetType: 'one' });

  E.register('block_bunker_property', async ctx => {
    const property = ctx.targets[0];
    await addRoundEffect(ctx, {
      target_property_id: property.id || property.property_id || property
    });
  }, { targetType: 'one' });

  window.AliveEffectRegistry = { initialized: true };
})(window);
