begin;
select set_config('alive.internal','yes',true);
select set_config('request.jwt.claim.sub','90000000-0000-4000-8000-000000000001',true);
do $$
declare scenario text;n int;iteration int;test_code text:='__COMBO_TEST__';i int;result jsonb;host_uid text;rejected boolean;bag bigint;alt bigint;flag bigint;capacity int;water numeric;
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
    if scenario='SC08' then
     if exists(select 1 from alive_private.room_combos where room_code=test_code) then raise exception 'Author scenario received routes';end if;
     if public.alive_combo_status(test_code)<>'[]'::jsonb or public.alive_scenario_routes(scenario)<>'[]'::jsonb then raise exception 'Author scenario exposes route UI';end if;
     if exists(select 1 from public.player_cards c join public.character_pool p on p.id=c.pool_id where c.room_code=test_code and (p.content_key like 'scenario_route_v2:%' or p.content_key like 'combo_v1:%')) then raise exception 'Author scenario received injected cards';end if;
     update public.rooms set phase='game',current_phase='awaiting_verdict' where rooms.code=test_code;
     update public.rooms set current_phase='finished',verdict='victory' where rooms.code=test_code;
     continue;
    end if;
    if (select count(*) from alive_private.room_combos where room_code=test_code)<>6 then raise exception 'Missing combo components %',scenario;end if;
    if exists(select 1 from public.player_cards where room_code=test_code and category not in ('goal','special_condition') group by player_id having abs(sum(value))>1) then raise exception 'Unbalanced %',scenario;end if;
    if exists(select 1 from public.player_cards where room_code=test_code group by pool_id having count(*)>1) then raise exception 'Duplicate %',scenario;end if;
    if exists(select 1 from alive_private.room_combos rc where rc.room_code=test_code and not exists(select 1 from public.player_cards c where c.room_code=test_code and c.pool_id=rc.pool_id)) then raise exception 'Undealt combo %',scenario;end if;
    capacity:=case when n=2 then 1 else 3 end;
    if (select count(distinct c.player_id) from public.player_cards c join alive_private.room_combos rc on rc.room_code=c.room_code and rc.pool_id=c.pool_id where c.room_code=test_code)>capacity then raise exception 'No final survivor group can retain both routes %',scenario;end if;
    if scenario='MEDIEVAL_PLAGUE_QUEEN' then
     select amount into water from public.room_resources where room_code=test_code and key='water_liters';
     if water is null or water<greatest(8,4*capacity) then raise exception 'Insufficient initial expedition water';end if;
     update public.room_resources set amount=water-1 where room_code=test_code and key='water_liters';
     perform public.alive_generate(test_code);
     if (select amount from public.room_resources where room_code=test_code and key='water_liters')<>water-1 then raise exception 'Repeated deal reset manual water';end if;
    end if;
    if (select count(*) from alive_private.scenario_routes where scenario_id=scenario)<>6 then raise exception 'Wrong route catalogue size';end if;
    if exists(select 1 from alive_private.room_combos rc join alive_private.scenario_routes d on d.key=rc.route where rc.room_code=test_code and d.scenario_id<>scenario) then raise exception 'Foreign scenario route';end if;
    if exists(select 1 from public.player_cards c join alive_private.combo_catalog k on k.pool_id=c.pool_id where c.room_code=test_code and k.scenario_id is not null and k.scenario_id<>scenario) then raise exception 'Foreign component';end if;
    result:=public.alive_combo_status(test_code);
    if exists(select 1 from jsonb_array_elements(result) x where (x->>'surviving')::int<>3 or x->>'outcome' is null or x->>'limitations' is null) then raise exception 'Completed route assessment failed';end if;
    if scenario='SC01' and n=2 and iteration=2 then
     update public.rooms set phase='game',current_phase='awaiting_verdict' where rooms.code=test_code;
     update public.rooms set current_phase='finished',verdict='victory' where rooms.code=test_code;
     if not exists(select 1 from public.rooms where rooms.code=test_code and verdict='victory') then raise exception 'Complete routes cannot win';end if;
    end if;
    if jsonb_array_length(result)<>2 then raise exception 'Invalid status';end if;
    perform set_config('request.jwt.claim.sub',md5(test_code||'2')::uuid::text,true);
    if exists(select 1 from jsonb_array_elements(public.alive_combo_status(test_code)) x where x->>'surviving' is not null) then raise exception 'Private status exposed';end if;
    if exists(select 1 from jsonb_path_query(public.alive_combo_status(test_code),'$[*].parts[*].cards[*]') x where x->>'player'<>'Test 2') then raise exception 'Hidden component owner exposed';end if;
    perform set_config('request.jwt.claim.sub',host_uid,true);
    if n=12 and iteration=3 then
     update public.players p set is_alive=false where p.room_code=test_code and p.id<>host_uid and not exists(select 1 from public.player_cards c join alive_private.room_combos rc on rc.room_code=c.room_code and rc.pool_id=c.pool_id where c.room_code=test_code and c.player_id=p.id);
     if exists(select 1 from jsonb_array_elements(public.alive_combo_status(test_code)) x where (x->>'surviving')::int<>3) then raise exception 'Viable final subset lost a route';end if;
     update public.rooms set phase='game',current_phase='awaiting_verdict' where rooms.code=test_code;
     update public.rooms set current_phase='finished',verdict='victory' where rooms.code=test_code;
    end if;
    if scenario='SC01' and n=2 and iteration=1 then
     update public.rooms set current_round=1 where rooms.code=test_code;
     insert into public.round_effects(room_code,round,effect_key,is_active,effect_params) values(test_code,1,'block_luggage',true,'{"scope":"all"}') returning id into flag;
     if not exists(select 1 from jsonb_array_elements(public.alive_combo_status(test_code)) x where (x->>'surviving')::int<3) then raise exception 'Blocked luggage still usable';end if;
     update public.round_effects set is_active=false where id=flag;
     select c.id,k.pool_id into bag,alt from alive_private.room_combos rc join public.player_cards c on c.pool_id=rc.pool_id and c.room_code=rc.room_code join alive_private.combo_catalog k on k.route=rc.route and k.part=rc.part and k.pool_id<>rc.pool_id where rc.room_code=test_code and rc.part=2 limit 1;
     update public.player_cards c set pool_id=p.id,text=p.text,value=p.value from public.character_pool p where c.id=bag and p.id=alt;
     if exists(select 1 from jsonb_array_elements(public.alive_combo_status(test_code)) x where (x->>'surviving')::int<>3) then raise exception 'Equivalent route component not recognized';end if;
    end if;
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
select '90 deals passed: nine route scenarios + author exclusion, sizes 2/4/12, viable survivor capacity, six components, balance, privacy, medieval water and verdict guard' result;
rollback;
