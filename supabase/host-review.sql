-- Retire sabotage allocation, keeping the ordinary balancing algorithm.
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
 perform alive_private.log(p_code,'game.deal',case when alive_private.deals_routes(r.card_mode,r.scenario_id) then 'Карты розданы. В случайной колоде подготовлены два пути выживания из трёх компонентов; карточки сбалансированы.' else 'Карты розданы по условиям сценария; новые связки не применяются.' end,null,false,jsonb_build_object('generation',r.settings->'generation','card_mode',r.card_mode));
 perform set_config('alive.internal',coalesce(previous,''),true);
end $function$;
CREATE OR REPLACE FUNCTION alive_private.join_room(p_code text, p_name text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.rooms; existing public.players; uid text:=auth.uid()::text; seat int; previous_internal text;
begin
 if uid is null then raise exception 'Сначала войдите в аккаунт'; end if;
 if p_name is null or char_length(trim(p_name)) not between 1 and 20 then raise exception 'Имя должно содержать от 1 до 20 символов'; end if;
 select * into r from public.rooms where code=upper(trim(p_code)) for update;
 if not found then raise exception 'Комната не найдена. Проверьте код'; end if;
 select * into existing from public.players where id=uid;
 if found then
  if existing.room_code<>r.code then raise exception 'Сначала покиньте предыдущую комнату'; end if;
  return to_jsonb(r); -- Reconnection never regenerates cards or revives a player.
 end if;
 if r.phase not in ('lobby','starting','game') or r.current_phase='finished' then raise exception 'Партия завершена. Дождитесь новой игры'; end if;
 if r.phase<>'lobby' and coalesce((r.settings->>'allow_late_join')::boolean,true)=false then raise exception 'Ведущий закрыл вход после начала игры'; end if;
 if (select count(*) from public.players where room_code=r.code and id<>r.host_id)>=coalesce((r.settings->>'max_players')::int,12) then raise exception 'Комната заполнена'; end if;
 select coalesce(max(seat_number),0)+1 into seat from public.players where room_code=r.code;
 previous_internal:=current_setting('alive.internal',true);
 perform set_config('alive.internal','yes',true);
 insert into public.players(id,room_code,name,is_ready,seat_number) values(uid,r.code,trim(p_name),r.phase<>'lobby',seat);
 if r.phase='game' then perform alive_private.deal_player(r.code,uid); end if;
 perform alive_private.log(r.code,case when r.phase='game' then 'game.player_joined' else 'game.lobby_joined' end,
  trim(p_name)||case when r.phase='game' then ' присоединился(ась) к партии и получил(а) карты' else ' присоединился(ась) к комнате' end,uid);
 perform set_config('alive.internal',coalesce(previous_internal,''),true);
 return (select to_jsonb(x) from public.rooms x where code=r.code);
end $function$;
drop function alive_private.assign_ruin_goal(text,text);
do $$begin
 perform set_config('alive.internal','yes',true);
 update public.player_cards c set text=g.text, pool_id=g.id, effect_params=g.effect_params
 from public.character_pool g, public.rooms r where r.code=c.room_code and r.current_phase is distinct from 'finished'
 and g.content_key='social_goal_v2:survive' and c.category='goal' and c.effect_params->>'goal_kind' in ('ruin_vote','ruin_bluff');
end $$;

insert into public.character_pool(content_key,category,text,value,is_active,effect_params)
select 'social_table_v1:'||k,'goal',caption,0,true,jsonb_strip_nulls(jsonb_build_object('goal_kind','discussion','a',cat))
from (values
 ('seat','Предложи напарнику общий план и попроси его представить этот план от вашего имени.',null),
 ('neighbour','Попроси ближайшего по номеру места игрока рассказать, чему ваши герои могли бы научить друг друга.',null),
 ('voice','Добейся, чтобы напарнику дали слово и хотя бы один участник ответил на его аргумент.',null),
 ('secret','До финала объясни напарнику, чем полезен твой герой, сохранив одну характеристику в тайне.',null),
 ('support','Пусть другой игрок сошлётся на твой аргумент, защищая напарника.',null),
 ('pair','Предложи совместное применение своей открытой карты и открытой карты напарника.',null),
 ('bio','Сравни с напарником биографии героев. Если в обеих указан пол, обсудите, как их воспринимают при знакомстве. Иначе найдите другое различие в БИО.','bio'),
 ('hobby','Убеди напарника включить твоё хобби в общий план. Пусть он сам объяснит его пользу.','hobby'),
 ('profession','Попроси напарника придумать неожиданное применение твоей профессии. Обсудите его за столом.','profession'),
 ('luggage','Договорись с напарником, кому и когда пригодится предмет из твоего малого багажа.','luggage_small'),
 ('doubt','Назови слабое место плана напарника и договорись с ним об одном исправлении.',null),
 ('promise','До голосования пообещай напарнику конкретную помощь и выполни обещание до вердикта.',null)
) t(k,caption,cat) on conflict(content_key) do nothing;

create table alive_private.goal_marks(
 card_id bigint primary key references public.player_cards(id) on delete cascade,
 owner_id text not null, card_text text not null, self_met boolean, host_met boolean
);
create table alive_private.review_starts(
 room_code text primary key references public.rooms(code) on delete cascade,
 captured_at timestamptz not null, snapshot jsonb not null
);
revoke all on alive_private.goal_marks,alive_private.review_starts from public,anon,authenticated;

create function alive_private.mark_goal(p_code text,p_card bigint,p_met boolean) returns void
language plpgsql security definer set search_path='' as $$
declare r public.rooms; c public.player_cards; host boolean;
begin
 if not alive_private.member(p_code) then raise exception 'Нет доступа'; end if;
 select * into strict r from public.rooms where code=p_code for update;
 host:=alive_private.host(p_code);
 select * into c from public.player_cards where room_code=p_code and id=p_card and category='goal' and is_active for update;
 if not found or (not host and c.player_id<>auth.uid()::text) then raise exception 'Цель недоступна';end if;
 if r.phase<>'game' or r.current_phase='finished' then raise exception 'Отметки принимаются до оглашения вердикта';end if;
 insert into alive_private.goal_marks as m values(c.id,c.player_id,c.text,case when not host then p_met end,case when host then p_met end)
 on conflict(card_id) do update set owner_id=c.player_id,card_text=c.text,
 self_met=case when not host then p_met when (m.owner_id,m.card_text)=(c.player_id,c.text) then m.self_met end,
 host_met=case when host then p_met when (m.owner_id,m.card_text)=(c.player_id,c.text) then m.host_met end;
 perform alive_private.log(p_code,'goal.mark',case when host then 'Ведущий' else 'Игрок' end||' · личная цель: '||case when p_met then 'выполнена' when p_met=false then 'не выполнена' else 'отметка снята' end,c.player_id,true);
end $$;

-- The existing automatic evaluator stays available for closed historical games.
create function alive_private.goal_review(p_code text) returns jsonb
language sql stable security definer set search_path='' as $$
 with evaluated as (select v from jsonb_array_elements(alive_private.goal_results(p_code)) v)
 select coalesce(jsonb_agg(jsonb_build_object('id',c.id,'seat',p.seat_number,'name',p.name,'text',c.text,
 'self_met',m.self_met,'host_met',m.host_met,'automatic',case when c.effect_params->>'goal_kind'<>'discussion' then e.v->'met' end,
 'met',coalesce(m.host_met,m.self_met,case when c.effect_params->>'goal_kind'<>'discussion' then (e.v->>'met')::boolean end),
 'source',case when m.host_met is not null then 'ведущий' when m.self_met is not null then 'игрок'
 when e.v is not null and c.effect_params->>'goal_kind'<>'discussion' then 'по картам' end) order by p.seat_number,c.slot,c.id),'[]')
 from public.player_cards c join public.players p on p.room_code=c.room_code and p.id=c.player_id
 left join alive_private.goal_marks m on m.card_id=c.id and m.owner_id=c.player_id and m.card_text=c.text
 left join evaluated e on (e.v->>'id')::bigint=c.id
 where c.room_code=p_code and c.category='goal' and c.is_active and alive_private.member(p_code)
 and (alive_private.host(p_code) or p.id=auth.uid()::text)
$$;

create function alive_private.review_state(p_code text) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object(
 'scenario',s.title,'story',coalesce(alive_private.room_story(r.code),case when r.card_mode='random_free' and s.combo_enabled and s.id<>'MEDIEVAL_PLAGUE_QUEEN' then split_part(replace(s.catastrophe_description,E'\r',''),E'\n\n',1)||E'\n\n'||split_part(replace(s.catastrophe_description,E'\r',''),E'\n\n',2) else s.catastrophe_description end),
 'host_notes',s.host_notes,'mode',r.card_mode,'settings',r.settings,'round',r.current_round,'phase',r.current_phase,
 'verdict',r.verdict,'survival_percent',r.verdict_percent,
 'players',coalesce((select jsonb_agg(jsonb_build_object('seat',p.seat_number,'name',p.name,'remaining',p.is_alive,'cards',
 (select coalesce(jsonb_agg(jsonb_build_object('category',c.category,'slot',c.slot,'text',c.text,'value',c.value,'revealed',c.revealed,'round_revealed',c.round_revealed,'active',c.is_active,'used',c.used,'effect',c.effect_key) order by c.category,c.slot,c.id),'[]') from public.player_cards c where c.room_code=r.code and c.player_id=p.id)) order by p.seat_number,p.name) from public.players p where p.room_code=r.code and p.id<>r.host_id),'[]'),
 'properties',coalesce((select jsonb_agg(jsonb_build_object('type',b.type,'text',b.text,'available',b.available,'revealed',b.revealed,'blocked',b.blocked,'blocked_until',b.blocked_until_round,'selected_bonus',r.active_bonus_ids @> jsonb_build_array(b.property_id),'host_note',bp.host_note) order by b.id)
 from public.room_bunker_properties b left join public.bunker_properties bp on bp.id=b.property_id where b.room_code=r.code),'[]'),
 'resources',coalesce((select jsonb_agg(jsonb_build_object('label',label,'amount',amount,'unit',unit) order by key) from public.room_resources where room_code=r.code),'[]'),
 'routes',alive_private.alive_combo_status(r.code),'route_rules',coalesce((select jsonb_agg(to_jsonb(d)-'key'-'scenario_id'-'group_no' order by d.key) from alive_private.scenario_routes d where exists(select 1 from alive_private.room_combos c where c.room_code=r.code and c.route=d.key)),'[]'),
 'uncovered_risks',alive_private.host_risks(r.code),'goals',alive_private.goal_review(r.code),
 'conditions',coalesce((select jsonb_agg(jsonb_build_object('round',e.round,'effect',e.effect_key,'active',e.is_active,'source',sp.name,'target',tp.name,'property',bp.text,'parameters',e.effect_params) order by e.id)
 from public.round_effects e left join public.players sp on sp.id=e.source_player_id left join public.players tp on tp.id=e.target_player_id left join public.room_bunker_properties bp on bp.id=e.target_property_id where e.room_code=r.code),'[]'))
 from public.rooms r left join public.scenarios s on s.id=r.scenario_id where r.code=p_code and alive_private.host(p_code)
$$;

create function alive_private.capture_review_start() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.phase='game' and old.phase in ('starting','lobby') and alive_private.host(new.code) then
  insert into alive_private.review_starts values(new.code,transaction_timestamp(),alive_private.review_state(new.code))
  on conflict(room_code) do update set captured_at=excluded.captured_at,snapshot=excluded.snapshot;
 elsif new.phase='lobby' and old.phase<>'lobby' then delete from alive_private.review_starts where room_code=new.code;
 end if;
 return new;
end $$;
create trigger alive_capture_review_start after update of phase on public.rooms for each row when(old.phase is distinct from new.phase) execute function alive_private.capture_review_start();

create function alive_private.review_export(p_code text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare start_row alive_private.review_starts;
begin
 if not alive_private.host(p_code) then raise exception 'Скачать обзор может только ведущий';end if;
 if not exists(select 1 from public.rooms where code=p_code and phase='game') then raise exception 'Обзор доступен после старта партии';end if;
 select * into start_row from alive_private.review_starts where room_code=p_code;
 return jsonb_build_object('format','bunker-review/1','as_of',statement_timestamp(),'started_at',start_row.captured_at,'start',start_row.snapshot,
 'current',alive_private.review_state(p_code),'votes',coalesce((select jsonb_agg(jsonb_build_object('round',v.round,'voter',a.name,'target',b.name) order by v.round,v.id) from public.votes v left join public.players a on a.id=v.voter_id left join public.players b on b.id=v.target_id where v.room_code=p_code),'[]'),
 'events',coalesce((select jsonb_agg(jsonb_build_object('round',e.round,'time',e.created_at,'type',e.event_key,'text',e.text,'private',e.private) order by e.created_at,e.id)
 from public.game_events e where e.room_code=p_code and (start_row.captured_at is null or e.created_at>=start_row.captured_at)),'[]'));
end $$;

create function public.alive_mark_goal(p_code text,p_card bigint,p_met boolean) returns void language sql  security invoker set search_path='' as $$select alive_private.mark_goal(p_code,p_card,p_met)$$;
revoke all on function public.alive_mark_goal(text,bigint,boolean),alive_private.mark_goal(text,bigint,boolean) from public,anon;
grant execute on function public.alive_mark_goal(text,bigint,boolean),alive_private.mark_goal(text,bigint,boolean) to authenticated;

create function public.alive_goal_review(p_code text) returns jsonb language sql stable security invoker set search_path='' as $$select alive_private.goal_review(p_code)$$;
revoke all on function public.alive_goal_review(text),alive_private.goal_review(text) from public,anon;
grant execute on function public.alive_goal_review(text),alive_private.goal_review(text) to authenticated;

create function public.alive_review_export(p_code text) returns jsonb language sql stable security invoker set search_path='' as $$select alive_private.review_export(p_code)$$;
revoke all on function public.alive_review_export(text),alive_private.review_export(text) from public,anon;
grant execute on function public.alive_review_export(text),alive_private.review_export(text) to authenticated;
revoke all on function alive_private.capture_review_start(),alive_private.review_state(text) from public,anon,authenticated;

CREATE OR REPLACE FUNCTION alive_private.timer(p_code text, p_action text, p_seconds integer, p_revision bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare r public.rooms; n integer; begin
 if not alive_private.host(p_code) then raise exception 'Только ведущий управляет таймером'; end if;
 select * into r from public.rooms where code=p_code for update;
 if r.revision<>p_revision then raise exception 'Состояние изменилось. Обновите экран и повторите'; end if;
 if r.phase<>'game' or r.current_phase='finished' then raise exception 'Таймер недоступен'; end if;
 n:=case when r.phase_running then greatest(0,ceil(extract(epoch from r.phase_ends_at-clock_timestamp()))::int) else coalesce(r.phase_paused_remaining,0) end;
 if p_action='start' then n:=p_seconds;
 elsif p_action='resume' then if r.phase_paused_remaining is null or n<=0 then raise exception 'Нет времени для продолжения'; end if;
 elsif p_action='adjust' then n:=least(86400::bigint,greatest(0::bigint,n::bigint+p_seconds));
 elsif p_action not in ('pause','reset') then raise exception 'Неизвестное действие'; end if;
 if p_action in ('start','adjust') and (n<0 or n>86400) then raise exception 'Время должно быть от 0 до 86400 секунд'; end if;
 update public.rooms set phase_running=case when p_action in ('pause','reset') then false else (n>0 and (p_action<>'adjust' or r.phase_running)) end,
 phase_ends_at=case when n>0 and (p_action in ('start','resume') or (p_action='adjust' and r.phase_running)) then clock_timestamp()+make_interval(secs=>greatest(n,0)) else null end,
 phase_paused_remaining=case when p_action='pause' or (p_action='adjust' and not r.phase_running) then n else null end where code=p_code;
 perform alive_private.log(p_code,'timer.'||p_action,format('Таймер: %s, осталось %s сек.',p_action,n));
 return (select to_jsonb(x) from public.rooms x where code=p_code);
end $function$;
