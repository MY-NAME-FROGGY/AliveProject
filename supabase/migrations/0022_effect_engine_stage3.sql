-- AliveProject — Stage 3
-- 1) нормализует legacy target_type
-- 2) переносит effect metadata из pool в уже созданные player_cards
-- 3) не пытается угадывать новые механики
begin;

update public.character_pool
set target_type = case target_type
  when 'one_other' then 'one'
  when 'one_any' then 'one'
  when 'two_other' then 'two'
  when 'none' then 'self'
  else target_type
end
where target_type in ('one_other','one_any','two_other','none');

update public.player_cards pc
set
  effect_key = cp.effect_key,
  effect_params = coalesce(cp.effect_params, '{}'::jsonb),
  target_kind = coalesce(cp.target_kind, 'player')
from public.character_pool cp
where pc.pool_id = cp.id
  and pc.category = 'special_condition'
  and cp.effect_key is not null;

update public.player_cards pc
set
  effect_key = pct.effect_key,
  effect_params = coalesce(pct.effect_params, '{}'::jsonb),
  target_kind = coalesce(pct.target_kind, 'player')
from public.preset_character_traits pct
where pc.pool_id is null
  and pc.category = 'special_condition'
  and pc.text = pct.text
  and pct.effect_key is not null;

create index if not exists idx_player_cards_effect_key
  on public.player_cards(room_code, player_id, category, effect_key);

create index if not exists idx_character_pool_effect_key
  on public.character_pool(category, effect_key)
  where effect_key is not null;

commit;
