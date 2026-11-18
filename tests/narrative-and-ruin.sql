-- All fixtures and simulated verdicts disappear at rollback.
begin;
select set_config('alive.internal','yes',true);
do $$
declare
 rc text:='__NARRATIVE_RUIN_QA__'; h text:=md5('narrative host')::uuid::text;
 a text:=md5('narrative a')::uuid::text; b text:=md5('narrative b')::uuid::text;
 scene record; first_route int; second_route int; i int; story text; other text;
 g bigint; pos bigint; neg bigint; n int:=0; result jsonb;
begin
 insert into public.rooms(code,host_id,phase,scenario_id,card_mode,scenario_visible,settings)
 values(rc,h,'lobby','SC07','random',true,'{"target_survivors":2}');
 insert into public.players(id,name,room_code,seat_number) values(h,'Host',rc,1),(a,'A',rc,2),(b,'B',rc,3);
 perform set_config('request.jwt.claim.sub',h,true);
 perform public.alive_generate(rc);
 for scene in select * from alive_private.story_endings where opening is not null loop
  update public.rooms set scenario_id=scene.scenario_id where code=rc;
  for first_route in 1..5 loop
   for second_route in first_route+1..6 loop
    delete from alive_private.room_combos where room_code=rc;
    insert into alive_private.room_combos(room_code,route,title,part,pool_id)
    select distinct on(route,part) rc,route,title,part,pool_id from alive_private.combo_catalog
     where route in (scene.scenario_id||'_route_'||first_route,scene.scenario_id||'_route_'||second_route) order by route,part,pool_id;
    perform set_config('request.jwt.claim.sub',a,true);
    story:=public.alive_room_story(rc);
    perform set_config('request.jwt.claim.sub',b,true);
    other:=public.alive_room_story(rc);
    if story is null or story is distinct from other or strpos(story,'{места}')>0 or strpos(story,'Туманная подсказка')>0 then raise exception 'Public story mismatch %',scene.scenario_id;end if;
    for i in 1..6 loop
     if (strpos(story,scene.skill_clues[i])>0) is distinct from (i in(first_route,second_route)) then raise exception 'Wrong plot fragment % %',scene.scenario_id,i;end if;
    end loop;
    perform set_config('request.jwt.claim.sub',h,true);
    n:=n+1;
   end loop;
  end loop;
 end loop;
 if n<>135 then raise exception 'Expected 135 stories, got %',n;end if;
 delete from alive_private.room_combos where room_code=rc;
 update public.rooms set scenario_id='SC07',phase='game',current_phase='awaiting_verdict' where code=rc;
 update public.player_cards set value=0,pool_id=null where room_code=rc;
 update public.player_cards set effect_params='{"goal_kind":"survive"}' where room_code=rc and category='goal';
 update public.player_cards c set text=p.text,value=p.value,pool_id=p.id from public.character_pool p
 where c.room_code=rc and c.player_id=a and c.category='phobia' and p.content_key='bunker_range:0:phobia:0' returning c.id into neg;
 update public.player_cards set value=2 where room_code=rc and player_id=a and category='hobby' returning id into pos;
 if exists(select 1 from public.player_cards where room_code=rc and effect_params->>'goal_kind' in ('ruin_bluff','ruin_vote')) then raise exception 'Retired goal was dealt';end if;
 if jsonb_array_length(public.alive_host_risks(rc))<>1 then raise exception 'Missing uncovered phobia';end if;
 perform set_config('request.jwt.claim.sub',b,true);
 if public.alive_host_risks(rc)<>'[]' then raise exception 'Exposed private risks';end if;
 perform set_config('request.jwt.claim.sub',h,true);
 begin
  update public.rooms set current_phase='finished',verdict='victory' where code=rc;
  raise exception 'Missing guard' using errcode='XX000';
 exception when raise_exception then null;
 end;
 update public.player_cards c set text=p.text,value=p.value,pool_id=p.id from public.character_pool p
 where c.room_code=rc and c.player_id=b and c.category='profession' and p.content_key='bunker_range:0:profession:3';
 if public.alive_host_risks(rc)<>'[]' then raise exception 'Psychologist did not protect';end if;
 update public.player_cards set pool_id=null where room_code=rc and category in ('profession','phobia');
 if public.alive_host_risks(rc)<>'[]' then raise exception 'Cure did not clear risk';end if;
 update public.rooms set scenario_id='SC01' where code=rc;
 update public.player_cards c set text=p.text,value=p.value,pool_id=p.id from public.character_pool p
 where c.room_code=rc and c.player_id=b and c.category='health' and p.content_key='bunker_range:0:health:0';
 if jsonb_array_length(public.alive_host_risks(rc))<>1 then raise exception 'Missing metal risk';end if;
 update public.player_cards c set text=p.text,value=p.value,pool_id=p.id from public.character_pool p
 where c.room_code=rc and c.player_id=a and c.category='luggage_small' and p.content_key='bunker_range:0:luggage_small:2';
 if public.alive_host_risks(rc)<>'[]' then raise exception 'Equipment did not protect';end if;
 update public.rooms set current_phase='finished',verdict='victory' where code=rc;
end $$;
select '135 story pairs, both recipients and trait risks passed' result;
rollback;
