from pathlib import Path
import json
root=Path(__file__).resolve().parents[1]
stories=json.loads((root/'content/scenario-stories.json').read_text(encoding='utf8'))
assert 'SC08' not in stories and len(stories)==9
def lit(s):return "'"+s.replace("'","''")+"'"
sql="""create temporary table author_story_before on commit drop as select id,md5(coalesce(catastrophe_description,'')||coalesce(host_notes,'')) fingerprint from public.scenarios where id='SC08';
alter table public.scenarios add column combo_enabled boolean not null default true;
grant select(combo_enabled) on public.scenarios to authenticated;
update public.scenarios set combo_enabled=false where id='SC08';
create function alive_private.scenario_combos_enabled(p_scenario text) returns boolean
language sql stable security definer set search_path='' as $$select p_scenario<>'SC08' and coalesce((select combo_enabled from public.scenarios where id=p_scenario),false)$$;
revoke all on function alive_private.scenario_combos_enabled(text) from public,anon,authenticated;
-- Preserve all historical definitions, cards and manifests. The feature gate below
-- excludes the author's scenario without deleting or deactivating any data.
"""
for scenario,row in stories.items():
 notes=row['host']+'\n\nПравило честной раздачи: две выбранные связки задают основные трудности случайной партии. Остальные этапы не требуют третьей уникальной невыданной карты. Полный комплект должен быть доступен живым участникам и использоваться с соблюдением своих ограничений. Числовые запасы и изменения ведущего учитываются явно; творческий альтернативный план можно записать при вердикте.'
 expression=lit(notes)
 if scenario=='water_world':expression+="||case when host_notes is null then '' else E'\\n\\nИсходные заметки ТОЛЬКО для готовых персонажей (preset):\\n'||host_notes end"
 sql+=f"update public.scenarios set catastrophe_description={lit(row['description'])},host_notes={expression} where id={lit(scenario)} and id<>'SC08';\n"
sql+="""
update public.bunker_properties set text='Королевская дорожная повозка. Лёгкая повозка с мулом, тентом и опечатанными бурдюками. Базовый запас — 8 литров чистой воды; к новой раздаче король добавляет воду по согласованному числу мест, из расчёта 4 литра на человека. Фактический запас показан в ресурсах. На болоте повозку придётся вести вручную.' where scenario_id='MEDIEVAL_PLAGUE_QUEEN' and type='base';
update alive_private.scenario_routes set threat='Задержка или потеря бурдюка истощает походный запас',outcome='Подготовлено пополнение воды на случай задержки или потери части запаса' where key='MEDIEVAL_PLAGUE_QUEEN_route_4';
do $$declare def text;begin
 def:=pg_get_functiondef('alive_private.seed_combos(text)'::regprocedure);
 def:=replace(def,'if r.card_mode=''preset'' then return;end if;','if r.card_mode=''preset'' or not alive_private.scenario_combos_enabled(r.scenario_id) then return;end if;');
 def:=replace(def,'for g in 1..2 loop',$patch$
 if r.scenario_id='MEDIEVAL_PLAGUE_QUEEN' then
  insert into public.room_resources(room_code,key,label,amount,unit)
  values(p_code,'water_liters','Чистая вода отряда',greatest(8,4*least(coalesce((r.settings->>'target_survivors')::int,1),(select count(*)::int from public.players where room_code=p_code and id<>r.host_id))),'л') on conflict(room_code,key) do nothing;
 end if;
 for g in 1..2 loop$patch$);execute def;
 def:=pg_get_functiondef('alive_private.draw(text,text,boolean)'::regprocedure);
 def:=replace(def,'where p.is_active and p.category=p_category','where p.is_active and p.category=p_category and (alive_private.scenario_combos_enabled(selected_scenario) or (coalesce(p.content_key,'''') not like ''combo_v1:%'' and coalesce(p.content_key,'''') not like ''scenario_route_v2:%''))');execute def;
 def:=pg_get_functiondef('alive_private.alive_combo_status(text)'::regprocedure);
 def:=replace(def,'full_access:=alive_private.host(p_code);','if not alive_private.scenario_combos_enabled((select scenario_id from public.rooms where code=p_code)) then return ''[]''::jsonb;end if;full_access:=alive_private.host(p_code);');execute def;
 def:=pg_get_functiondef('alive_private.scenario_route_catalog(text)'::regprocedure);
 def:=replace(def,'return (select','if not alive_private.scenario_combos_enabled(p_scenario) then return ''[]''::jsonb;end if;return (select');execute def;
 def:=pg_get_functiondef('alive_private.combo_verdict_guard()'::regprocedure);
 def:=replace(def,'new.card_mode<>''preset'' then','new.card_mode<>''preset'' and alive_private.scenario_combos_enabled(new.scenario_id) then');execute def;
 def:=pg_get_functiondef('alive_private.generate(text)'::regprocedure);
 def:=replace(def,quote_literal('Карты розданы. В случайной колоде подготовлены два пути выживания из трёх компонентов; карточки сбалансированы.'),$message$case when r.card_mode<>'preset' and alive_private.scenario_combos_enabled(r.scenario_id) then 'Карты розданы. В случайной колоде подготовлены два пути выживания из трёх компонентов; карточки сбалансированы.' else 'Карты розданы по условиям сценария; новые связки не применяются.' end$message$);execute def;
end $$;
do $$begin
 if exists(select 1 from author_story_before b join public.scenarios s using(id) where b.fingerprint<>md5(coalesce(s.catastrophe_description,'')||coalesce(s.host_notes,''))) then raise exception 'Author scenario text changed';end if;
end $$;
notify pgrst,'reload schema';
"""
(root/'supabase/scenario-alignment.sql').write_text(sql,encoding='utf8')
print('Nine stories aligned; author excluded; medieval departure water initialized once.')
