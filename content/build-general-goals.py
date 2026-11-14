from pathlib import Path
import json

root=Path(__file__).resolve().parents[1]
groups=json.loads((root/'content/general-goals.json').read_text(encoding='utf8'))
rows=[row for group in groups.values() for row in group]
assert len(groups)==10 and all(len(group)==15 for group in groups.values())
assert len(rows)==150 and len({row[0] for row in rows})==150
assert len({row[1] for row in rows})==150
assert all(len(row)==2 and len(row[1])>=70 for row in rows)

def lit(s): return "'"+s.replace("'","''")+"'"
sql="""-- General personal goals: no scenario tag, no effects, no contribution to card balance.
-- Safe to reapply: existing content and already dealt cards are not overwritten.
insert into public.character_pool(content_key,category,text,value,scenario_tag,is_active)
values
"""
sql+=',\n'.join(f"({lit('general_goal_v1:'+str(i).zfill(3))},'goal',{lit(title+' — '+condition)},0,null,true)" for i,(title,condition) in enumerate(rows,1))
sql+="""
on conflict(content_key) do nothing;
do $$declare definition text;begin
 if (select count(*) from public.character_pool where content_key like 'general_goal_v1:%' and category='goal' and value=0 and scenario_tag is null and is_active and effect_key is null)<>150 then
  raise exception 'Expected 150 active neutral general goals';
 end if;
 definition:=pg_get_functiondef('alive_private.deal_player_base(text,text)'::regprocedure);
 if strpos(definition,$old$n:=coalesce((cfg->>cat)::int,case when cat='goal' and preset is null then 0 else 1 end);$old$)>0 then
  definition:=replace(definition,$old$n:=coalesce((cfg->>cat)::int,case when cat='goal' and preset is null then 0 else 1 end);$old$,$new$n:=coalesce((cfg->>cat)::int,1);$new$);
  execute definition;
 elsif strpos(definition,'n:=coalesce((cfg->>cat)::int,1);')=0 then
  raise exception 'Unexpected dealer version: review goal default before applying';
 end if;
end $$;
"""
(root/'supabase/general-goals.sql').write_text(sql,encoding='utf8')
print('150 unique neutral goals; one per player by default; explicit counts and preset goals preserved.')
