-- Older rooms use 'random' for the deal with survival routes. Keep that meaning.
alter table public.rooms drop constraint rooms_card_mode_check,
 add constraint rooms_card_mode_check check (card_mode in ('preset','random_free','random'));

create function alive_private.deals_routes(p_mode text,p_scenario text)
returns boolean language sql stable set search_path='' as $$
 select p_mode='random' and alive_private.scenario_combos_enabled(p_scenario)
$$;
revoke all on function alive_private.deals_routes(text,text) from public,anon,authenticated;

create function alive_private.guard_dealt_mode() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 if new.card_mode is distinct from old.card_mode and exists(select 1 from public.player_cards where room_code=old.code) then
  raise exception 'Карты уже розданы. Верните комнату в лобби перед сменой режима.';
 end if;
 return new;
end $$;
revoke all on function alive_private.guard_dealt_mode() from public,anon,authenticated;
create trigger alive_dealt_mode before update of card_mode on public.rooms
 for each row execute function alive_private.guard_dealt_mode();

CREATE OR REPLACE FUNCTION alive_private.seed_combos(p_code text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.rooms;plan record;component record;target_card bigint;owner_ids text[];cursor_pos int:=0;g int;
begin
 if not alive_private.host(p_code) then raise exception 'Только ведущий';end if;
 select * into r from public.rooms where code=p_code for update;
 if not alive_private.deals_routes(r.card_mode,r.scenario_id) then return;end if;
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
end $function$;

CREATE OR REPLACE FUNCTION alive_private.draw(p_code text, p_category text, p_effect boolean DEFAULT false)
 RETURNS character_pool
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare picked public.character_pool;repeat_mode text;selected_tag text;selected_scenario text;selected_mode text;
begin
 if not alive_private.member(p_code) then raise exception 'Нет доступа';end if;
 select coalesce(r.settings->'generation'->>case when p_effect then 'effect_repeats' else 'repeats' end,'unique'),case when p_category in ('special_condition','goal') then null else s.character_pool_tag end,r.scenario_id,r.card_mode
 into repeat_mode,selected_tag,selected_scenario,selected_mode from public.rooms r left join public.scenarios s on s.id=r.scenario_id where r.code=p_code;
 select * into picked from public.character_pool p where p.is_active and p.category=p_category
   and (p.category<>'goal' or not (p.effect_params ? 'goal_kind') or exists(
    select 1 from public.rooms cfg where cfg.code=p_code
    and coalesce((cfg.settings->'generation'->'counts'->>(p.effect_params->>'a'))::int,1)>0
    and coalesce((cfg.settings->'generation'->'counts'->>(p.effect_params->>'b'))::int,1)>0
    and (p.effect_params->>'goal_kind'<>'together' or coalesce((cfg.settings->>'target_survivors')::int,3)>=2)
    and (p.effect_params->>'goal_kind' in ('secret','survive') or
      (select count(*) from public.players sp where sp.room_code=p_code and sp.id<>cfg.host_id and sp.is_alive)>=2)
   )) /* eligible_social_goal */ and (alive_private.deals_routes(selected_mode,selected_scenario) or (coalesce(p.content_key,'') not like 'combo_v1:%' and coalesce(p.content_key,'') not like 'scenario_route_v2:%')) and p.scenario_tag is not distinct from selected_tag
 and (coalesce(p.content_key,'') not like 'scenario_route_v2:%' or (p_effect and exists(select 1 from alive_private.combo_catalog k where k.pool_id=p.id and k.scenario_id=selected_scenario)))
 and (p_effect or coalesce(p.content_key,'') not like 'combo_v1:%')
 and (repeat_mode='allow' or not exists(select 1 from public.player_cards c where c.room_code=p_code and c.pool_id=p.id)) order by random() limit 1;
 if not found then raise exception 'В категории % закончились карты выбранного набора',p_category;end if;
 return picked;
end $function$;

CREATE OR REPLACE FUNCTION alive_private.generate(p_code text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.rooms;p record; previous text:=current_setting('alive.internal',true);
begin
 if not alive_private.host(p_code) then raise exception 'Только ведущий';end if;
 select * into r from public.rooms where code=p_code for update;
 if r.phase not in ('lobby','starting') then raise exception 'Раздача доступна до начала игры';end if;
 if exists(select 1 from public.player_cards where room_code=p_code) then return;end if;
 perform set_config('alive.internal','yes',true);
 delete from alive_private.room_combos where room_code=p_code;
 delete from alive_private.deal_assignments where room_code=p_code;
 for p in select id from public.players where room_code=p_code and id<>r.host_id order by created_at loop perform alive_private.deal_player(p_code,p.id);end loop;
 perform alive_private.seed_combos(p_code);
 if r.card_mode<>'preset' then
  for p in select id from public.players where room_code=p_code and id<>r.host_id loop perform alive_private.balance_deal(p_code,p.id);end loop;
 end if;
 if exists(select 1 from public.scenarios where id=r.scenario_id and character_pool_tag='medieval_plague_queen_v1') then
  insert into public.room_resources(room_code,key,label,amount,unit) values(p_code,'water_liters','Чистая вода отряда',greatest(8,4*least(coalesce((r.settings->>'target_survivors')::int,1),(select count(*)::int from public.players where room_code=p_code and id<>r.host_id))),'л') on conflict(room_code,key) do nothing;
 end if;
 perform alive_private.assign_ruin_goal(p_code);perform alive_private.log(p_code,'game.deal',case when alive_private.deals_routes(r.card_mode,r.scenario_id) then 'Карты розданы. В случайной колоде подготовлены два пути выживания из трёх компонентов; карточки сбалансированы.' else 'Карты розданы по условиям сценария; новые связки не применяются.' end,null,false,jsonb_build_object('generation',r.settings->'generation','card_mode',r.card_mode));
 perform set_config('alive.internal',coalesce(previous,''),true);
end $function$;

CREATE OR REPLACE FUNCTION alive_private.room_story(p_code text)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 select replace(e.opening,'{места}',coalesce(nullif(r.settings->>'target_survivors',''),'1'))
 ||E'\n\n'||string_agg(e.skill_clues[z.idx],E'\n\n' order by z.idx)||E'\n\n'||e.closing
 ||case when r.current_phase='finished' then E'\n\n'||case when r.verdict='victory' then e.victory else e.defeat end else '' end
 from public.rooms r join alive_private.story_endings e on e.scenario_id=r.scenario_id
 cross join lateral (select distinct i idx from generate_series(1,6) i
 join alive_private.room_combos c on c.route=r.scenario_id||'_route_'||i and c.room_code=r.code) z
 where r.code=p_code and alive_private.member(r.code) and (r.scenario_visible or alive_private.host(r.code))
 and alive_private.deals_routes(r.card_mode,r.scenario_id)
 group by r.code,r.current_phase,r.verdict,e.opening,e.closing,e.victory,e.defeat having count(*)=2
$function$;

CREATE OR REPLACE FUNCTION alive_private.scenario_route_catalog(p_scenario text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if auth.uid() is null then raise exception 'Сначала войдите';end if;
 if not alive_private.scenario_combos_enabled(p_scenario) then return '[]'::jsonb;end if;
 if not exists(select 1 from public.rooms r where r.scenario_id=p_scenario and r.card_mode='random' and alive_private.host(r.code) and alive_private.member(r.code)) then return '[]'::jsonb;end if;
 return (select coalesce(jsonb_agg(t),'[]') from(select key,title,threat,outcome,limitations,group_no from alive_private.scenario_routes where scenario_id=p_scenario order by group_no,key)t);
end $function$;

CREATE OR REPLACE FUNCTION alive_private.alive_combo_status(p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare result jsonb;
begin
 if not alive_private.member(p_code) then raise exception 'Нет доступа';end if;
 if not alive_private.host(p_code) then return '[]'::jsonb;end if;
 if not exists(select 1 from public.rooms r where r.code=p_code and alive_private.deals_routes(r.card_mode,r.scenario_id)) then return '[]'::jsonb;end if;
 select coalesce(jsonb_agg(t),'[]') into result from (
  select rc.route,rc.title,count(*) required,
   count(*) filter(where exists(select 1 from public.player_cards c where c.room_code=p_code and alive_private.combo_card_matches(rc.route,rc.part,rc.pool_id,c.id) and alive_private.combo_card_usable(c.id))) surviving,
   jsonb_agg(jsonb_build_object('part',rc.part,'cards',(
    select coalesce(jsonb_agg(jsonb_build_object('player',p.name,'text',c.text,'alive',p.is_alive,'revealed',c.revealed,'usable',alive_private.combo_card_usable(c.id))),'[]')
    from public.player_cards c join public.players p on p.id=c.player_id
    where c.room_code=p_code and alive_private.combo_card_matches(rc.route,rc.part,rc.pool_id,c.id)
   ))) parts
  from alive_private.room_combos rc where rc.room_code=p_code
  group by rc.route,rc.title order by rc.route
 )t;
 return result;
end $function$;

CREATE OR REPLACE FUNCTION alive_private.combo_verdict_guard()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
begin
 if new.current_phase='finished' and old.current_phase is distinct from 'finished' and new.verdict='victory' and alive_private.deals_routes(new.card_mode,new.scenario_id) then
  if exists(select 1 from alive_private.room_combos rc where rc.room_code=new.code
   and not exists(select 1 from public.player_cards c where c.room_code=new.code and alive_private.combo_card_matches(rc.route,rc.part,rc.pool_id,c.id) and alive_private.combo_card_usable(c.id)))
   and char_length(trim(coalesce(new.settings->>'combo_override','')))<20 then
   raise exception 'Связка неполна или её компонент недоступен. Объясните альтернативный план выживания (минимум 20 символов)';
  end if;
 end if;
 return new;
end $function$;
