CREATE OR REPLACE FUNCTION alive_private.bind_social_goal()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare partner public.players;
begin
 if new.category='goal' and new.effect_params ? 'goal_kind' and new.effect_params->>'goal_kind' not in ('secret','survive') then
  select p.* into partner from public.players p join public.rooms r on r.code=p.room_code
  where p.room_code=new.room_code and p.id not in (new.player_id,r.host_id) and p.is_alive
  order by random() limit 1;
  if found then
   new.effect_params:=new.effect_params||jsonb_build_object('partner',partner.id);
   new.text:=new.text||' Напарник — '||coalesce('№'||partner.seat_number||' ','')||partner.name||'.';
  end if;
 end if;
 return new;
end $function$;

CREATE OR REPLACE FUNCTION alive_private.goal_results(p_code text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
 with goals as (
  select c.id,c.player_id,c.text,c.effect_params goal_params,r.verdict,p.name,p.is_alive owner_safe,c.effect_params->>'goal_kind' kind,
   c.effect_params->>'a' a,c.effect_params->>'b' b,c.effect_params->>'partner' partner
  from public.player_cards c join public.players p on p.id=c.player_id and p.room_code=c.room_code
  join public.rooms r on r.code=c.room_code
  where c.room_code=p_code and c.category='goal' and c.is_active and (r.current_phase='finished' or (r.current_phase='awaiting_verdict' and alive_private.host(p_code)))
  and alive_private.member(p_code) and (p.id=auth.uid()::text or alive_private.host(p_code))
  and c.effect_params ? 'goal_kind'
 ), checks as (
  select g.*,exists(select 1 from public.player_cards c where c.room_code=p_code and c.player_id=g.player_id and c.category=g.a and c.is_active and c.revealed) own_open,
   (select bool_and(not c.revealed) from public.player_cards c where c.room_code=p_code and c.player_id=g.player_id and c.category=g.b and c.is_active) kept,
   exists(select 1 from public.player_cards c where c.room_code=p_code and c.player_id=g.partner and c.category=g.b and c.is_active and c.revealed) partner_open,
   exists(select 1 from public.players p where p.room_code=p_code and p.id=g.partner and p.is_alive) partner_safe,
   array(select category from public.player_cards c where c.room_code=p_code and c.player_id=g.player_id and c.revealed and c.is_active and c.category not in ('goal','special_condition')) mine,
   array(select category from public.player_cards c where c.room_code=p_code and c.player_id=g.partner and c.revealed and c.is_active and c.category not in ('goal','special_condition')) theirs
  from goals g
 )
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'text',text,'ruin',kind in ('ruin_bluff','ruin_vote'),'met',coalesce(case kind
 when 'ruin_vote' then verdict='defeat' and exists(select 1 from public.votes v join public.players t on t.id=v.target_id and t.room_code=v.room_code where v.room_code=p_code and v.voter_id=checks.player_id and not t.is_alive)
 when 'ruin_bluff' then verdict='defeat' and owner_safe and exists(select 1 from public.player_cards c where c.room_code=p_code and c.player_id=checks.player_id and c.id=(goal_params->>'show_id')::bigint and c.revealed and c.is_active)
 and exists(select 1 from public.player_cards c where c.room_code=p_code and c.player_id=checks.player_id and c.id=(goal_params->>'hide_id')::bigint and not c.revealed and c.is_active)
 
 when 'secret' then own_open and kept when 'pair' then own_open and partner_open
 when 'trust' then kept and partner_open when 'protect' then own_open and partner_safe
 when 'survive' then owner_safe when 'escort' then partner_safe when 'together' then owner_safe and partner_safe
 when 'legacy' then not owner_safe and partner_safe when 'lead' then cardinality(mine)>cardinality(theirs)
 when 'listen' then cardinality(theirs)>cardinality(mine) when 'equals' then cardinality(mine)>0 and cardinality(mine)=cardinality(theirs)
 when 'contrast' then cardinality(mine)>0 and cardinality(theirs)>0 and not (mine && theirs) end,false)) order by id),'[]') from checks
$function$;

CREATE OR REPLACE FUNCTION alive_private.review_export(p_code text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
declare start_row alive_private.review_starts;
begin
 if not alive_private.host(p_code) then raise exception 'Скачать обзор может только ведущий';end if;
 if not exists(select 1 from public.rooms where code=p_code and phase='game') then raise exception 'Обзор доступен после старта партии';end if;
 select * into start_row from alive_private.review_starts where room_code=p_code;
 return jsonb_build_object('format','bunker-review/1','as_of',statement_timestamp(),'started_at',start_row.captured_at,'start',start_row.snapshot,
 'current',alive_private.review_state(p_code),
 'effects_played',coalesce((select jsonb_agg(jsonb_build_object('round',e.round,'actor',p.name,'effect',e.effect_key,'target_kind',e.target_kind,'targets',e.target_ids,'choices',e.params) order by e.id) from public.effect_log e left join public.players p on p.id=e.player_id::text where e.room_code=p_code and (start_row.captured_at is null or e.created_at>=start_row.captured_at)),'[]'),
 'effect_requests',coalesce((select jsonb_agg(jsonb_build_object('actor',p.name,'effect',e.effect_key,'choices',e.choices,'status',e.status,'resolution',e.resolution) order by e.id) from public.effect_requests e left join public.players p on p.id=e.player_id::text where e.room_code=p_code and (start_row.captured_at is null or e.created_at>=start_row.captured_at)),'[]'),
 'votes',coalesce((select jsonb_agg(jsonb_build_object('round',v.round,'voter',a.name,'target',b.name) order by v.round,v.id) from public.votes v left join public.players a on a.id=v.voter_id left join public.players b on b.id=v.target_id where v.room_code=p_code),'[]'),
 'events',coalesce((select jsonb_agg(jsonb_build_object('round',e.round,'time',e.created_at,'type',e.event_key,'text',e.text,'private',e.private) order by e.created_at,e.id)
 from public.game_events e where e.room_code=p_code and (start_row.captured_at is null or e.created_at>=start_row.captured_at)),'[]'));
end $function$;

create or replace function public.alive_goal_results(p_code text) returns jsonb language sql stable security invoker set search_path='' as $$
 select case when exists(select 1 from public.rooms where code=p_code and current_phase='finished') then alive_private.goal_review(p_code) else '[]'::jsonb end
$$;
