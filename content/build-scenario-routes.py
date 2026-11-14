from pathlib import Path
import json
root=Path(__file__).resolve().parents[1]
recipes=json.loads((root/'content/scenario-routes.json').read_text(encoding='utf8'))
def lit(s):return "'"+s.replace("'","''")+"'"
sql="""alter table alive_private.combo_catalog add column scenario_id text references public.scenarios(id);
create table alive_private.scenario_routes (
 key text primary key,scenario_id text not null references public.scenarios(id),
 group_no int not null check(group_no in(1,2)),title text not null,
 threat text not null,outcome text not null,limitations text not null
);
alter table alive_private.scenario_routes enable row level security;
revoke all on alive_private.scenario_routes from public,anon,authenticated;
"""
for scenario,rows in recipes.items():
 assert len(rows)==6
 for i,row in enumerate(rows,1):
  title,threat,outcome,limitations,*parts=row;assert len(parts)==3
  route=f'{scenario}_route_{i}';group=1 if i<=3 else 2
  sql+='insert into alive_private.scenario_routes values('+','.join(map(lit,[route,scenario]))+f',{group},'+','.join(map(lit,[title,threat,outcome,limitations]))+');\n'
  cats=['profession','luggage_small','fact1'] if group==1 else ['hobby','luggage_big','fact2']
  for part,(cat,txt) in enumerate(zip(cats,parts),1):
   for variant in [1,2]:
    key=f'scenario_route_v2:{scenario}:{i}:{part}:{variant}'
    tail=' Работаете по сверенной схеме; перед применением нужна проверка.' if variant==1 else ' Можете выполнить задачу медленнее с ручной проверкой каждого этапа.'
    text=txt+'.'+tail
    tag="'medieval_plague_queen_v1'" if scenario=='MEDIEVAL_PLAGUE_QUEEN' else 'null'
    sql+=f"with item as (insert into public.character_pool(content_key,category,text,value,scenario_tag,is_active) values({lit(key)},{lit(cat)},{lit(text)},{0 if part==2 else 1},{tag},true) returning id) insert into alive_private.combo_catalog(key,scenario_tag,route,title,part,category,pool_id,scenario_id) select {lit(key)},{tag},{lit(route)},{lit(title)},{part},{lit(cat)},id,{lit(scenario)} from item;\n"
sql+='\n'+(root/'content/scenario-routes-functions.sql').read_text(encoding='utf8')
(root/'supabase/scenario-routes-v2.sql').write_text(sql,encoding='utf8')
print(f'{len(recipes)} scenarios, 60 routes, 360 component variants')
