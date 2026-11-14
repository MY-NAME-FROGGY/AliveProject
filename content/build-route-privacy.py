from pathlib import Path
import json
root=Path(__file__).resolve().parents[1]
short=json.loads((root/'content/route-card-texts.json').read_text(encoding='utf8'))
recipes=json.loads((root/'content/scenario-routes.json').read_text(encoding='utf8'))
assert set(short)==set(recipes) and 'SC08' not in short
assert all(len(rows)==6 and all(len(row)==3 for row in rows) for rows in short.values())
assert max(len(text) for rows in short.values() for row in rows for text in row)<=64

def lit(s):return "'"+s.replace("'","''")+"'"
updates=[]
for scenario,rows in short.items():
 for i,parts in enumerate(rows,1):
  recipes[scenario][i-1][4:]=parts
  for part,text in enumerate(parts,1):
   for variant in [1,2]:updates.append((f'scenario_route_v2:{scenario}:{i}:{part}:{variant}',text))
(root/'content/scenario-routes.json').write_text(json.dumps(recipes,ensure_ascii=False,indent=2)+'\n',encoding='utf8')

sql="""-- Shorten route traits without resetting cards, owners, values, reveals or effects.
-- Host-edited card text is preserved. SC08 is explicitly excluded.
create temporary table route_text_updates on commit drop as
select p.id,p.text old_text,m.new_text
from public.character_pool p join (values
"""+',\n'.join('('+lit(key)+','+lit(text)+')' for key,text in updates)+"""
) m(content_key,new_text) on m.content_key=p.content_key;
do $$begin
 if (select count(*) from route_text_updates)<>324 then raise exception 'Expected 324 route variants';end if;
end $$;
update public.player_cards c set text=u.new_text from route_text_updates u
where c.pool_id=u.id and c.text=u.old_text and c.text is distinct from u.new_text;
update public.character_pool p set text=u.new_text from route_text_updates u
where p.id=u.id and p.text is distinct from u.new_text;

create or replace function alive_private.alive_combo_status(p_code text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;
begin
 if not alive_private.member(p_code) then raise exception 'Нет доступа';end if;
 if not alive_private.host(p_code) then return '[]'::jsonb;end if;
 if not exists(select 1 from public.rooms r where r.code=p_code and r.card_mode<>'preset' and alive_private.scenario_combos_enabled(r.scenario_id)) then return '[]'::jsonb;end if;
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
end $$;

create or replace function alive_private.scenario_route_catalog(p_scenario text) returns jsonb
language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception 'Сначала войдите';end if;
 if not alive_private.scenario_combos_enabled(p_scenario) then return '[]'::jsonb;end if;
 if not exists(select 1 from public.rooms r where r.scenario_id=p_scenario and r.card_mode<>'preset' and alive_private.host(r.code) and alive_private.member(r.code)) then return '[]'::jsonb;end if;
 return (select coalesce(jsonb_agg(t),'[]') from(select key,title,threat,outcome,limitations,group_no from alive_private.scenario_routes where scenario_id=p_scenario order by group_no,key)t);
end $$;
notify pgrst,'reload schema';
"""
(root/'supabase/route-privacy-and-short-text.sql').write_text(sql,encoding='utf8')
print('324 short variants; host-only route status/catalogue; manual card edits preserved.')
