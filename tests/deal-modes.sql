-- Exercise all modes through the same public generate/join calls used by the game.
begin;
select set_config('alive.internal','yes',true);
do $$
declare s record; mode text; rc text; h text; i int; counts jsonb; rows_before int;
        expected_routes boolean; target text; replacement public.character_pool;
begin
 for s in select id,has_presets,combo_enabled from public.scenarios loop
  foreach mode in array array['random_free','random','preset'] loop
   if mode='preset' and not s.has_presets then continue;end if;
   rc:=upper('__DEAL_MODE_'||s.id||mode); h:=md5(rc||'host')::uuid::text;
   perform set_config('request.jwt.claim.sub','',true);
   counts:=case when mode='random_free' then '{"profession":0,"fact1":0,"special_condition":0}' else '{"special_condition":0}' end;
   insert into public.rooms(code,host_id,scenario_id,card_mode,phase,scenario_visible,settings)
    values(rc,h,s.id,mode,'lobby',true,jsonb_build_object('target_survivors',3,'generation',jsonb_build_object('repeats','allow','counts',counts)));
   insert into public.players(room_code,id,name,seat_number) values(rc,h,'Host',1);
   for i in 1..3 loop
    insert into public.players(room_code,id,name,seat_number) values(rc,md5(rc||i)::uuid::text,'Player '||i,i+1);
   end loop;
   perform set_config('request.jwt.claim.sub',h,true);
   perform public.alive_generate(rc);
   expected_routes:=mode='random' and s.combo_enabled and s.id<>'SC08';
   if (select count(*) from alive_private.room_combos where room_code=rc)<>(case when expected_routes then 6 else 0 end)
    then raise exception 'Wrong seeded parts % %',s.id,mode;end if;
   if (public.alive_room_story(rc) is not null) is distinct from expected_routes or
      (jsonb_array_length(public.alive_combo_status(rc))=2) is distinct from expected_routes then raise exception 'Wrong story or host view % %',s.id,mode;end if;
   if mode='random_free' then
    if exists(select 1 from public.player_cards c left join public.character_pool p on p.id=c.pool_id
     where c.room_code=rc and (c.category in('profession','fact1') or p.content_key like 'scenario_route_v2:%' or p.content_key like 'combo_v1:%')) then raise exception 'Wrong plain deck';end if;
    for i in 1..12 loop
     replacement:=alive_private.draw(rc,'hobby',true);
     if replacement.content_key like 'scenario_route_v2:%' or replacement.content_key like 'combo_v1:%' then raise exception 'Plain reroll drew route card';end if;
    end loop;
    if public.alive_scenario_routes(s.id)<>'[]'::jsonb then raise exception 'Plain host was offered a route catalogue';end if;
   end if;
   if mode='preset' and exists(select 1 from alive_private.deal_assignments where room_code=rc and preset_id is null) then raise exception 'Missing preset';end if;
   select count(*) into rows_before from public.player_cards where room_code=rc;
   perform public.alive_generate(rc);
   if rows_before<>(select count(*) from public.player_cards where room_code=rc) then raise exception 'Retry changed cards';end if;
   if s.id='MEDIEVAL_PLAGUE_QUEEN' and (select amount from public.room_resources where room_code=rc and key='water_liters') is distinct from 12 then raise exception 'Starting water %', mode;end if;
   begin
    update public.rooms set card_mode=case when mode='random_free' then 'random' else 'random_free' end where code=rc;
    raise exception 'Mode changed after the deal' using errcode='XX000';
   exception when raise_exception then null;end;
   update public.rooms set phase='game',current_phase='discussion' where code=rc;
   target:=md5(rc||'late')::uuid::text;
   perform set_config('request.jwt.claim.sub',target,true);
   perform public.alive_join(rc,'Late player');
   if not exists(select 1 from public.player_cards where room_code=rc and player_id=target) then raise exception 'No late hand';end if;
   if mode='random_free' and exists(select 1 from public.player_cards where room_code=rc and player_id=target and category='profession') then raise exception 'Late hand ignored plain settings';end if;
   if (public.alive_room_story(rc) is not null) is distinct from expected_routes then raise exception 'Wrong public story';end if;
  end loop;
 end loop;
end $$;
select 'Mode generation, low category counts, fixed characters, visibility, redraws, water, retries and late joins passed' result;
rollback;
