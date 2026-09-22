-- Revert only the latest host edit with a matching before/after snapshot.
-- Already revealed information remains in the append-only journal.
begin;
create or replace function alive_private.undo_host_edit(p_code text,p_event_id bigint) returns jsonb
language plpgsql security definer set search_path='' as $$
declare e public.game_events; tbl text; op text; before_row jsonb; after_row jsonb;
        current_row jsonb; row_id bigint; columns_sql text; restored jsonb;
begin
 if not alive_private.host(p_code) then raise exception 'Только ведущий может отменять изменения'; end if;
 perform 1 from public.rooms where code=p_code for update;
 select * into e from public.game_events where id=p_event_id and room_code=p_code for update;
 if not found or e.id is distinct from (select max(id) from public.game_events where room_code=p_code)
    or e.actor_id is distinct from auth.uid()::text
    or e.event_key not in ('host.card','host.bunker') then
  raise exception 'Можно отменить только последнее редактирование ведущего';
 end if;
 tbl:=case when e.event_key='host.card' then 'player_cards' else e.event_params->>'table' end;
 if tbl not in ('player_cards','room_resources','room_bunker_properties') then raise exception 'Этот тип изменения нельзя отменить'; end if;
 op:=e.event_params->>'operation';before_row:=e.event_params->'before';after_row:=e.event_params->'after';
 if op not in ('INSERT','UPDATE','DELETE') then raise exception 'Неизвестная операция'; end if;
 if op<>'DELETE' and (after_row->>'room_code') is distinct from p_code then raise exception 'Комната события не совпадает'; end if;
 if op<>'INSERT' and (before_row->>'room_code') is distinct from p_code then raise exception 'Комната события не совпадает'; end if;
 row_id:=coalesce((after_row->>'id')::bigint,(before_row->>'id')::bigint);
 if row_id is null then raise exception 'В событии нет номера записи'; end if;
 execute format('select to_jsonb(t) from public.%I t where id=$1 and room_code=$2 for update',tbl)
 into current_row using row_id,p_code;
 if coalesce(current_row,'null'::jsonb)<>coalesce(after_row,'null'::jsonb) then
  raise exception 'Запись уже изменилась, отмена недоступна';
 end if;
 if op='INSERT' then
  execute format('delete from public.%I where id=$1 and room_code=$2',tbl) using row_id,p_code;
 elsif op='DELETE' then
  execute format('insert into public.%I overriding system value select * from jsonb_populate_record(null::public.%I,$1)',tbl,tbl)
  using before_row;
 else
  select string_agg(format('%I',column_name),',' order by ordinal_position) into columns_sql
  from information_schema.columns where table_schema='public' and table_name=tbl and column_name not in ('id','room_code');
  execute format('update public.%I set (%s)=(select %s from jsonb_populate_record(null::public.%I,$1)) where id=$2 and room_code=$3',tbl,columns_sql,columns_sql,tbl)
  using before_row,row_id,p_code;
 end if;
 perform alive_private.log(p_code,'host.undo',format('Ведущий обратил вспять редактирование №%s',p_event_id),null,false,
  jsonb_build_object('reverted_event_id',p_event_id,'table',tbl,'operation',op));
 return jsonb_build_object('reverted_event_id',p_event_id);
end $$;
create or replace function public.alive_undo_host_edit(p_code text,p_event_id bigint) returns jsonb
language sql security invoker set search_path='' as $$ select alive_private.undo_host_edit(p_code,p_event_id) $$;
revoke all on function alive_private.undo_host_edit(text,bigint),public.alive_undo_host_edit(text,bigint) from public,anon;
grant execute on function alive_private.undo_host_edit(text,bigint),public.alive_undo_host_edit(text,bigint) to authenticated;
notify pgrst,'reload schema';
commit;
