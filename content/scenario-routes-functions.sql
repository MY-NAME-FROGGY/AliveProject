create or replace function alive_private.seed_combos(p_code text) returns void
language plpgsql security definer set search_path='' as $$
declare r public.rooms;plan record;component record;target_card bigint;owner_ids text[];cursor_pos int:=0;g int;
begin
 if not alive_private.host(p_code) then raise exception 'Только ведущий';end if;
 select * into r from public.rooms where code=p_code for update;
 if r.card_mode='preset' then return;end if;
 if (select count(*) from alive_private.scenario_routes where scenario_id=r.scenario_id)<>6 then raise exception 'Для сценария нужны шесть настроенных связок';end if;
 select array_agg(id order by seat_number,created_at) into owner_ids from (select id,seat_number,created_at from public.players where room_code=p_code and id<>r.host_id order by random() limit greatest(1,least(3,coalesce((r.settings->>'target_survivors')::int,1))))p;
 if cardinality(owner_ids) is null then raise exception 'Нет игроков для раздачи';end if;
 for g in 1..2 loop
  select * into plan from alive_private.scenario_routes where scenario_id=r.scenario_id and group_no=g order by random() limit 1;
  for component in select distinct on(part) * from alive_private.combo_catalog where scenario_id=r.scenario_id and route=plan.key order by part,random() loop
   cursor_pos:=cursor_pos+1;
   select id into target_card from public.player_cards c where c.room_code=p_code and c.player_id=owner_ids[1+(cursor_pos-1)%cardinality(owner_ids)] and c.category=component.category and c.slot=1;
   if not found then raise exception 'Для связок нужны профессия, малый багаж, факт 1, хобби, большой багаж и факт 2';end if;
   update public.player_cards c set pool_id=p.id,text=p.text,value=p.value from public.character_pool p where c.id=target_card and p.id=component.pool_id;
   insert into alive_private.room_combos values(p_code,plan.key,plan.title,component.part,component.pool_id);
  end loop;
 end loop;
end $$;

create or replace function alive_private.draw(p_code text,p_category text,p_effect boolean default false) returns public.character_pool
language plpgsql security definer set search_path='' as $$
declare picked public.character_pool;repeat_mode text;selected_tag text;selected_scenario text;
begin
 if not alive_private.member(p_code) then raise exception 'Нет доступа';end if;
 select coalesce(r.settings->'generation'->>case when p_effect then 'effect_repeats' else 'repeats' end,'unique'),case when p_category in ('special_condition','goal') then null else s.character_pool_tag end,r.scenario_id
 into repeat_mode,selected_tag,selected_scenario from public.rooms r left join public.scenarios s on s.id=r.scenario_id where r.code=p_code;
 select * into picked from public.character_pool p where p.is_active and p.category=p_category and p.scenario_tag is not distinct from selected_tag
 and (coalesce(p.content_key,'') not like 'scenario_route_v2:%' or (p_effect and exists(select 1 from alive_private.combo_catalog k where k.pool_id=p.id and k.scenario_id=selected_scenario)))
 and (p_effect or coalesce(p.content_key,'') not like 'combo_v1:%')
 and (repeat_mode='allow' or not exists(select 1 from public.player_cards c where c.room_code=p_code and c.pool_id=p.id)) order by random() limit 1;
 if not found then raise exception 'В категории % закончились карты выбранного набора',p_category;end if;
 return picked;
end $$;

-- Single definition of usable components for status and final validation.
create function alive_private.combo_card_usable(p_card bigint) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.player_cards c join public.players p on p.id=c.player_id
 join public.character_pool pool on pool.id=c.pool_id join public.rooms r on r.code=c.room_code
 where c.id=p_card and p.is_alive and c.is_active and c.text=pool.text
 and not exists(select 1 from public.round_effects e where e.room_code=r.code and e.is_active and e.round in(0,r.current_round)
 and e.effect_key='block_luggage' and (e.target_player_id=p.id or e.effect_params->>'scope'='all')
 and coalesce(e.effect_params->'categories','["luggage_big","luggage_small"]') ? c.category))
$$;
revoke all on function alive_private.combo_card_usable(bigint) from public,anon,authenticated;

create or replace function alive_private.alive_combo_status(p_code text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;full_access boolean;
begin
 if not alive_private.member(p_code) then raise exception 'Нет доступа';end if;
 if not alive_private.host(p_code) then return '[]'::jsonb;end if;
 full_access:=alive_private.host(p_code);
 select coalesce(jsonb_agg(t),'[]') into result from (
  select rc.route,rc.title,count(*) required,
   case when full_access then count(*) filter(where exists(select 1 from public.player_cards c where c.room_code=p_code and c.pool_id=rc.pool_id and alive_private.combo_card_usable(c.id))) else null end surviving,
   jsonb_agg(jsonb_build_object('part',rc.part,'cards',(select coalesce(jsonb_agg(jsonb_build_object('player',p.name,'text',c.text,'alive',p.is_alive,'revealed',c.revealed,'usable',alive_private.combo_card_usable(c.id))),'[]') from public.player_cards c join public.players p on p.id=c.player_id where c.room_code=p_code and c.pool_id=rc.pool_id and (full_access or c.revealed or c.player_id=auth.uid()::text)))) parts
  from alive_private.room_combos rc left join alive_private.scenario_routes meta on meta.key=rc.route
  where rc.room_code=p_code group by rc.route,rc.title order by rc.route
 )t;
 return result;
end $$;

create function alive_private.scenario_route_catalog(p_scenario text) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Сначала войдите';end if;
 if not exists(select 1 from public.rooms r where r.scenario_id=p_scenario and r.card_mode<>'preset' and alive_private.host(r.code) and alive_private.member(r.code)) then return '[]'::jsonb;end if;
 return (select coalesce(jsonb_agg(t),'[]') from(select key,title,threat,outcome,limitations,group_no from alive_private.scenario_routes where scenario_id=p_scenario order by group_no,key)t);
end $$;
create function public.alive_scenario_routes(p_scenario text) returns jsonb
language sql security invoker set search_path='' as $$select alive_private.scenario_route_catalog(p_scenario)$$;
revoke all on function public.alive_scenario_routes(text),alive_private.scenario_route_catalog(text) from public,anon;
grant execute on function public.alive_scenario_routes(text),alive_private.scenario_route_catalog(text) to authenticated;

create or replace function alive_private.combo_verdict_guard() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.current_phase='finished' and old.current_phase is distinct from 'finished' and new.verdict='victory' and new.card_mode<>'preset' then
  if exists(select 1 from alive_private.room_combos rc where rc.room_code=new.code
   and not exists(select 1 from public.player_cards c where c.room_code=new.code and c.pool_id=rc.pool_id and alive_private.combo_card_usable(c.id)))
   and char_length(trim(coalesce(new.settings->>'combo_override','')))<20 then
   raise exception 'Связка неполна или её компонент недоступен. Объясните альтернативный план выживания (минимум 20 символов)';
  end if;
 end if;
 return new;
end $$;
notify pgrst,'reload schema';

create function alive_private.combo_card_matches(p_route text,p_part int,p_pool bigint,p_card bigint) returns boolean
language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.player_cards c where c.id=p_card and
 (c.pool_id=p_pool or exists(select 1 from alive_private.combo_catalog k
 join alive_private.scenario_routes r on r.key=k.route and r.scenario_id=k.scenario_id
 where k.pool_id=c.pool_id and k.route=p_route and k.part=p_part)))
$$;
revoke all on function alive_private.combo_card_matches(text,int,bigint,bigint) from public,anon,authenticated;
do $$declare def text;begin
 def:=pg_get_functiondef('alive_private.alive_combo_status(text)'::regprocedure);
 def:=replace(def,'c.pool_id=rc.pool_id','alive_private.combo_card_matches(rc.route,rc.part,rc.pool_id,c.id)');execute def;
 def:=pg_get_functiondef('alive_private.combo_verdict_guard()'::regprocedure);
 def:=replace(def,'c.pool_id=rc.pool_id','alive_private.combo_card_matches(rc.route,rc.part,rc.pool_id,c.id)');execute def;
end $$;
