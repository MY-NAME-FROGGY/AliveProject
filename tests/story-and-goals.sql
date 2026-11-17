begin;
select set_config('alive.internal','yes',true);
do $$declare
 code_ text:='__STORY_GOALS_QA__'; host_ text:=md5('story.host')::uuid::text; a text:=md5('story.a')::uuid::text; b text:=md5('story.b')::uuid::text;
 hint text; expected text; goal bigint; probe record; actual boolean;
begin
 perform set_config('request.jwt.claim.sub','',true);
 insert into public.rooms(code,host_id,phase,scenario_id,card_mode,settings) values(code_,host_,'lobby','MEDIEVAL_PLAGUE_QUEEN','random','{"target_survivors":2}');
 insert into public.players(id,room_code,name,seat_number) values(host_,code_,'Host',1),(a,code_,'Alice',2),(b,code_,'Bob',3);
 perform set_config('request.jwt.claim.sub',host_,true);
 perform public.alive_generate(code_);
 select replace(e.opening,'{места}','2')||E'\n\n'||string_agg(e.skill_clues[i],E'\n\n' order by i)||E'\n\n'||e.closing into expected from alive_private.story_endings e cross join generate_series(1,6) i
 where e.scenario_id='MEDIEVAL_PLAGUE_QUEEN' and exists(select 1 from alive_private.room_combos c where c.room_code=code_ and c.route=e.scenario_id||'_route_'||i) group by e.opening,e.closing;
 hint:=public.alive_room_story(code_);
 if hint is null or hint is distinct from expected then raise exception 'Story does not match selected routes'; end if;
 perform set_config('request.jwt.claim.sub',a,true);
 if public.alive_room_story(code_) is not null then raise exception 'Hidden story exposed'; end if;
 perform set_config('request.jwt.claim.sub',host_,true);
 update public.rooms set phase='game',scenario_visible=true,current_phase='awaiting_verdict' where code=code_;
 perform set_config('request.jwt.claim.sub',a,true);
 if public.alive_room_story(code_) is distinct from hint or public.alive_goal_results(code_)<>'[]' then raise exception 'Player preview incorrect';end if;
 perform set_config('request.jwt.claim.sub',host_,true);
 update public.rooms set current_phase='finished',verdict='victory' where code=code_;
 if public.alive_room_story(code_) is distinct from hint||E'\n\n'||(select victory from alive_private.story_endings where scenario_id='MEDIEVAL_PLAGUE_QUEEN') then raise exception 'Incorrect victory ending'; end if;
 update public.rooms set verdict='defeat' where code=code_;
 if public.alive_room_story(code_) is distinct from hint||E'\n\n'||(select defeat from alive_private.story_endings where scenario_id='MEDIEVAL_PLAGUE_QUEEN') then raise exception 'Incorrect defeat ending'; end if;
 select id into strict goal from public.player_cards where room_code=code_ and player_id=a and category='goal';
 for probe in select * from (values
 ('secret',true),('pair',true),('trust',false),('protect',true),('survive',true),('escort',true),('together',true),('legacy',false),('lead',false),('listen',false),('equals',true),('contrast',true)
 ) as probes(kind,wanted) loop
  update public.player_cards set revealed=(player_id=a and category='hobby' or player_id=b and category='health') where room_code=code_ and category in ('health','hobby');
  update public.player_cards set effect_params=jsonb_build_object('goal_kind',probe.kind,'a','hobby','b',case when probe.kind='trust' then 'hobby' else 'health' end,'partner',b) where id=goal;
  perform set_config('request.jwt.claim.sub',a,true);
  if jsonb_array_length(public.alive_goal_results(code_))<>1 then raise exception 'Result privacy';end if;
  actual:=(public.alive_goal_results(code_)->0->>'met')::boolean;
  if actual is distinct from probe.wanted then raise exception 'Incorrect goal %',probe.kind;end if;
  perform set_config('request.jwt.claim.sub',host_,true);
 end loop;
 if jsonb_array_length(public.alive_goal_results(code_))<>2 then raise exception 'Host result list';end if;
 perform set_config('request.jwt.claim.sub',md5('outside.room')::uuid::text,true);
 if public.alive_room_story(code_) is not null or public.alive_goal_results(code_)<>'[]' then raise exception 'Foreign room exposed';end if;
end $$;
select 'Two selected hints, both verdicts, hidden scenario, all 12 goal predicates and room privacy passed' result;
rollback;
