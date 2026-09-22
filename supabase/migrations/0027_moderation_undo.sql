-- Private snapshots for reversible Bunker moderation. Kicks and consumed
-- special-condition immunity remain non-reversible.
begin;
create or replace function alive_private.moderate(p_code text,p_target text,p_action text,p_seconds integer,p_reason text) returns void
language plpgsql security definer set search_path='' as $$
declare p public.players; after_p public.players; immunity bigint; begin
 if not alive_private.host(p_code) then raise exception 'Только ведущий'; end if;
 perform 1 from public.rooms where code=p_code for update;
 select * into p from public.players where id=p_target and room_code=p_code for update;
 if not found or p_target=auth.uid()::text then raise exception 'Недопустимая цель'; end if;
 if p_action in ('mute','timeout') then
  select id into immunity from public.round_effects where room_code=p_code and target_player_id=p_target and effect_key='timeout_immune' and is_active order by id limit 1;
  if immunity is not null then
   update public.round_effects set is_active=false where id=immunity;
   perform alive_private.log(p_code,'moderation.immunity',p.name||': иммунитет отменил наказание',p_target); return;
  end if;
 end if;
 if p_action='kick' then
  update public.rooms set nominees=coalesce((select jsonb_agg(x) from jsonb_array_elements(nominees)x where x<>to_jsonb(p_target)),'[]'),
  nominations=coalesce((select jsonb_object_agg(key,value) from jsonb_each(nominations) where key<>p_target and value<>to_jsonb(p_target)),'{}') where code=p_code;
  delete from public.players where id=p_target and room_code=p_code;
 elsif p_action in ('mute','unmute') then update public.players set is_muted=(p_action='mute') where id=p_target;
 elsif p_action in ('timeout','untimeout') then
  if p_seconds<0 or p_seconds>86400 then raise exception 'Некорректная длительность'; end if;
  update public.players set timeout_until=case when p_action='timeout' then now()+make_interval(secs=>p_seconds) else null end where id=p_target;
 elsif p_action in ('eliminate','revive') then update public.players set is_alive=(p_action='revive') where id=p_target;
 else raise exception 'Неизвестное действие'; end if;
 if p_action in ('kick','mute','unmute','timeout','untimeout') then
 insert into public.moderation_log(room_code,actor_id,target_id,action,reason) values(p_code,auth.uid()::text,p_target,case when p_action='unmute' then 'mute' when p_action='untimeout' then 'timeout' else p_action end,p_action||': '||coalesce(p_reason,''));
 end if;
 perform alive_private.log(p_code,'moderation.'||p_action,format('Ведущий: %s — %s. %s',p.name,p_action,coalesce(p_reason,'')),case when p_action='kick' then null else p_target end);
 if p_action<>'kick' then
  select * into after_p from public.players where id=p_target and room_code=p_code;
  perform alive_private.log(p_code,'host.moderation',format('Модерация %s: %s',p.name,p_action),auth.uid()::text,true,
   jsonb_build_object('target_id',p_target,'action',p_action,
    'before',jsonb_build_object('is_alive',p.is_alive,'is_muted',p.is_muted,'timeout_until',p.timeout_until),
    'after',jsonb_build_object('is_alive',after_p.is_alive,'is_muted',after_p.is_muted,'timeout_until',after_p.timeout_until)));
 end if;
end $$;

create or replace function alive_private.undo_any_host_action(p_code text,p_event_id bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e public.game_events; p public.players; expected jsonb; previous jsonb; current_state jsonb; begin
 if not alive_private.host(p_code) then raise exception 'Только ведущий может отменять изменения'; end if;
 select * into e from public.game_events where id=p_event_id and room_code=p_code;
 if not found then raise exception 'Запись не найдена'; end if;
 if e.event_key<>'host.moderation' then return alive_private.undo_host_edit(p_code,p_event_id); end if;
 perform 1 from public.rooms where code=p_code for update;
 if e.id is distinct from (select max(id) from public.game_events where room_code=p_code)
    or e.actor_id is distinct from auth.uid()::text then
  raise exception 'Можно отменить только последнее действие ведущего';
 end if;
 select * into p from public.players where room_code=p_code and id=e.event_params->>'target_id' for update;
 if not found then raise exception 'Игрок уже покинул комнату'; end if;
 expected:=e.event_params->'after';previous:=e.event_params->'before';
 if expected is null or previous is null then raise exception 'Нет снимка для отмены'; end if;
 current_state:=jsonb_build_object('is_alive',p.is_alive,'is_muted',p.is_muted,'timeout_until',p.timeout_until);
 if current_state<>expected then raise exception 'Состояние игрока уже изменилось'; end if;
 update public.players set is_alive=(previous->>'is_alive')::boolean,
 is_muted=(previous->>'is_muted')::boolean,
 timeout_until=(previous->>'timeout_until')::timestamptz
 where room_code=p_code and id=p.id;
 perform alive_private.log(p_code,'host.undo',format('Ведущий обратил вспять модерацию №%s',p_event_id),null,false,
 jsonb_build_object('reverted_event_id',p_event_id,'action',e.event_params->>'action'));
 return jsonb_build_object('reverted_event_id',p_event_id);
end $$;
create or replace function public.alive_undo_host_edit(p_code text,p_event_id bigint) returns jsonb
language sql security invoker set search_path='' as $$ select alive_private.undo_any_host_action(p_code,p_event_id) $$;
revoke all on function alive_private.undo_any_host_action(text,bigint) from public,anon;
grant execute on function alive_private.undo_any_host_action(text,bigint) to authenticated;
notify pgrst,'reload schema';
commit;
