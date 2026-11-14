-- Integration probes use real policies/functions; every fixture is rolled back.
begin;
select set_config('alive.internal','yes',true);
select set_config('request.jwt.claim.sub','',true);
do $$declare test_code text;mode text;host_uid text;i int;begin
 foreach mode in array array['default','off','preset'] loop
  test_code:='__GOALS_'||upper(mode);
  host_uid:=md5(mode||'_goal_host')::uuid::text;
  perform set_config('request.jwt.claim.sub','',true);
  insert into public.rooms(code,host_id,phase,scenario_id,card_mode,settings)
  values(test_code,host_uid,'lobby',case when mode='preset' then 'SC08' else 'SC01' end,case when mode='preset' then 'preset' else 'random' end,
   jsonb_build_object('target_survivors',1,'generation',jsonb_build_object('repeats','unique','counts',case when mode='off' then '{"goal":0,"special_condition":0}'::jsonb else '{"special_condition":0}'::jsonb end)));
  for i in 0..2 loop
   insert into public.players(id,room_code,name,is_ready,seat_number) values(case when i=0 then host_uid else md5(mode||i)::uuid::text end,test_code,'Goal Test '||i,true,i+1);
  end loop;
  perform set_config('request.jwt.claim.sub',host_uid,true);
  perform public.alive_generate(test_code);
  if mode='off' then
   if exists(select 1 from public.player_cards c where c.room_code=test_code and c.category='goal') then raise exception 'Explicit goal opt-out ignored';end if;
  elsif mode='preset' then
   if (select count(*) from public.player_cards c where c.room_code=test_code and c.category='goal')<>2 then raise exception 'Missing preset goals';end if;
   if exists(select 1 from public.player_cards c join alive_private.deal_assignments d on d.room_code=c.room_code and d.player_id=c.player_id join public.preset_character_traits t on t.preset_id::text=d.preset_id and t.category='goal' where c.room_code=test_code and c.category='goal' and c.text<>t.text) then raise exception 'Preset goal replaced';end if;
  else
   update public.rooms set phase='game',current_phase='discussion' where rooms.code=test_code;
   perform set_config('request.jwt.claim.sub',md5('late_goal')::uuid::text,true);
   perform public.alive_join(test_code,'Late player');
   if (select count(*) from public.player_cards c where c.room_code=test_code and c.category='goal')<>3 then raise exception 'Late player missing goal';end if;
   perform public.alive_join(test_code,'Late player');
   if (select count(*) from public.player_cards c where c.room_code=test_code and c.category='goal')<>3 then raise exception 'Retry duplicated goals';end if;
  end if;
 end loop;
 perform set_config('request.jwt.claim.sub',md5('default_goal_host')::uuid::text,true);
 update public.rooms set phase='game',current_phase='awaiting_verdict',final_reveal_unlocked=true where rooms.code='__GOALS_DEFAULT';
end $$;
set local role authenticated;
select set_config('request.jwt.claim.sub',md5('default1')::uuid::text,true);
do $$declare rejected boolean:=false;card bigint;begin
 if (select count(*) from public.player_cards where room_code='__GOALS_DEFAULT' and category='goal')<>1 then raise exception 'Another player goal exposed';end if;
 select id into card from public.player_cards where room_code='__GOALS_DEFAULT' and category='goal';
 begin
  perform public.alive_action('__GOALS_DEFAULT','reveal',jsonb_build_object('card_id',card));
 exception when raise_exception then rejected:=true;end;
 if not rejected then raise exception 'Goal can be publicly revealed';end if;
 if exists(select 1 from public.player_cards where id=card and revealed) then raise exception 'Goal reveal persisted';end if;
end $$;
select set_config('request.jwt.claim.sub',md5('goal_outsider')::uuid::text,true);
do $$begin
 if exists(select 1 from public.player_cards where room_code='__GOALS_DEFAULT') then raise exception 'Outsider can read game cards';end if;
end $$;
select set_config('request.jwt.claim.sub',md5('default_goal_host')::uuid::text,true);
do $$begin
 if (select count(*) from public.player_cards where room_code='__GOALS_DEFAULT' and category='goal')<>3 then raise exception 'Host cannot review goals';end if;
end $$;
reset role;
select 'Goals integration passed: default, explicit opt-out, preset preservation, late join, retry, player/host/outsider privacy and no public reveal' result;
rollback;
