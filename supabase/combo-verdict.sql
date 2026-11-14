create function alive_private.combo_verdict_guard() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.current_phase='finished' and old.current_phase is distinct from 'finished'
 and new.verdict='victory' and new.card_mode<>'preset' then
  if exists(select 1 from alive_private.room_combos rc where rc.room_code=new.code
   and not exists(select 1 from public.player_cards c join public.players p on p.id=c.player_id
    join public.character_pool pool on pool.id=c.pool_id
    where c.room_code=new.code and c.pool_id=rc.pool_id and c.text=pool.text and p.is_alive))
   and char_length(trim(coalesce(new.settings->>'combo_override','')))<20 then
   raise exception 'Группа потеряла компонент связки. Объясните альтернативный план выживания (минимум 20 символов)';
  end if;
 end if;
 return new;
end $$;
revoke all on function alive_private.combo_verdict_guard() from public,anon,authenticated;
create trigger alive_combo_verdict before update on public.rooms for each row execute function alive_private.combo_verdict_guard();
