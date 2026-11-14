begin;
select set_config('alive.internal','yes',true);
select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000001',true);
do $$
declare scenario text;n int;iteration int;test_code text:='__COMBO_TEST__';i int;result jsonb;host_uid text;rejected boolean;
begin
 foreach scenario in array array['SC01','SC02','SC03','SC04','SC05','SC06','SC07','SC08','water_world','MEDIEVAL_PLAGUE_QUEEN'] loop
  foreach n in array array[2,4,12] loop
   for iteration in 1..3 loop
    test_code:='__COMBO_'||scenario||'_'||n||'_'||iteration;host_uid:=md5(test_code||'1')::uuid::text;perform set_config('request.jwt.claim.sub','',true);
    insert into public.rooms(code,host_id,phase,scenario_id,card_mode,settings) values(test_code,host_uid,'lobby',scenario,'random',jsonb_build_object('max_players',24,'target_survivors',case when n=2 then 1 else 3 end,'generation','{"counts":{"special_condition":0},"repeats":"unique"}'::jsonb));
    for i in 1..n+1 loop
     insert into public.players(id,room_code,name,is_ready,seat_number) values(md5(test_code||i)::uuid::text,test_code,'Test '||i,true,i);
    end loop;
    perform set_config('request.jwt.claim.sub',host_uid,true);
    perform public.alive_generate(test_code);
    if (select count(*) from alive_private.room_combos where room_code=test_code)<>6 then raise exception 'Missing combo components %',scenario;end if;
    if exists(select 1 from public.player_cards where room_code=test_code and category not in ('goal','special_condition') group by player_id having abs(sum(value))>1) then raise exception 'Unbalanced %',scenario;end if;
    if exists(select 1 from public.player_cards where room_code=test_code group by pool_id having count(*)>1) then raise exception 'Duplicate %',scenario;end if;
    if exists(select 1 from alive_private.room_combos rc where rc.room_code=test_code and not exists(select 1 from public.player_cards c where c.room_code=test_code and c.pool_id=rc.pool_id)) then raise exception 'Undealt combo %',scenario;end if;
    result:=public.alive_combo_status(test_code);
    if jsonb_array_length(result)<>2 then raise exception 'Invalid status';end if;
    perform set_config('request.jwt.claim.sub',md5(test_code||'2')::uuid::text,true);
    if exists(select 1 from jsonb_array_elements(public.alive_combo_status(test_code)) x where x->>'surviving' is not null) then raise exception 'Private status exposed';end if;
    if exists(select 1 from jsonb_path_query(public.alive_combo_status(test_code),'$[*].parts[*].cards[*]') x where x->>'player'<>'Test 2') then raise exception 'Hidden component owner exposed';end if;
    perform set_config('request.jwt.claim.sub',host_uid,true);
    if scenario='SC01' and n=2 and iteration=1 then
     update public.rooms set phase='game',current_phase='awaiting_verdict' where rooms.code=test_code;
     update public.player_cards set text='Changed by host' where id=(select c.id from public.player_cards c join alive_private.room_combos rc on rc.pool_id=c.pool_id and rc.room_code=c.room_code where c.room_code=test_code limit 1);
     rejected:=false;
     begin update public.rooms set current_phase='finished',verdict='victory' where rooms.code=test_code;exception when raise_exception then rejected:=true;end;
     if not rejected then raise exception 'Incomplete route accepted without explanation';end if;
     update public.rooms set settings=settings||jsonb_build_object('combo_override','Alternative plan approved for this test'),current_phase='finished',verdict='victory' where rooms.code=test_code;
    end if;
   end loop;
  end loop;
 end loop;
end $$;
select '90 deals passed: all ten scenarios, sizes 2/4/12, six route components, unique pools, per-player balance, private owners and verdict guard' result;
rollback;
