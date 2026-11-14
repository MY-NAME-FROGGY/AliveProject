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
