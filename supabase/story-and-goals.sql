-- Apply after general-goals.sql and route-privacy-and-short-text.sql.
create table if not exists alive_private.story_endings(
 scenario_id text primary key references public.scenarios(id),
 hints text[] not null check(cardinality(hints)=6), victory text not null, defeat text not null
);
alter table alive_private.story_endings enable row level security;
revoke all on alive_private.story_endings from public,anon,authenticated;
insert into alive_private.story_endings values
('SC01',array['За решёткой воздух почти не движется.','На полке остался последний ящик свежих овощей.','На внутренней двери заметили серый след снаружи.','При включении света гаснет один из приборов.','В дальнем ряду кладовой вздулись крышки банок.','Утром уровень воды в баке снова оказался ниже метки.'],'Под землёй прошла первая долгая зима. За общим столом снова строят планы на весну.','До весны убежище пришлось покинуть.'),
('SC02',array['После ночной вахты вода в кружке горчит.','На стыке модулей появилась тонкая полоска воды.','Два журнала отмечают последнюю сушу с разных сторон.','Вечером к борту вернулась пустая сеть.','Дождь идёт всю ночь, а бочки под палубой почти пусты.','Дальний берег то появляется, то исчезает под стеной облаков.'],'На рассвете модуль вошёл в тихую бухту. Впервые за долгое время вахта увидела землю.','Последнюю запись в судовом журнале оборвали посреди строки.'),
('SC03',array['За закрытой дверью каждый слышит знакомый голос.','За несколько минут до каждого приступа дрожат стрелки приборов.','В одном углу комнаты даже тени падают по-разному.','Двое смотрят на одну надпись и читают разные слова.','Над огнями ближайшего города снова сгущается сияние.','Один из дежурных перестал узнавать тех, с кем пришёл.'],'Утром все назвали свои имена и узнали друг друга.','К рассвету каждый помнил своё убежище по-разному.'),
('SC04',array['Из глубины поднимается тепло, но в жилой комнате появился иней.','Каждый раз после смены караула у тамбура нарастает лёд.','Манометр за ночь потерял ещё одно деление.','Вокруг лежит лёд, а на кухне осталась последняя фляга.','До следующего подвоза семена придётся превратить в еду.','В просвете между метелями ненадолго виден соседний купол.'],'После самой холодной ночи на стене прибавилась ещё одна дата.','Под снегом погас последний огонь стоянки.'),
('SC05',array['Пресная лужа на дне лодки стала солёной.','По вечерам над горизонтом проходит огонь далёкого судна.','Остров весь день держится на одном месте, хотя все гребут.','У берега полно незнакомых плодов и пёстрой рыбы.','Вода в последней фляге должна дотянуть до следующего дождя.','После шторма один из пассажиров никак не согреется.'],'К утру люди смогли оставить на берегу знак для следующих потерпевших крушение.','Спасатели нашли лодку слишком поздно.'),
('SC06',array['В чистом отсеке пахнет воздухом из старого коридора.','После каждого толчка снаружи дверная петля отходит от стены.','Стоит запустить генератор, и за баррикадой собирается толпа.','Никто не помнит, кто дежурил рядом с заболевшим.','До закрытия обратного пути остаётся лишь светлая часть дня.','После прорыва трубы питьевые ёмкости оказались рядом с грязным стоком.'],'На воротах повесили расписание дежурств на следующий месяц.','Утром из-за баррикады больше никто не ответил.'),
('SC07',array['Даже несколько шагов отделяют вход от полной темноты.','Под дверью стелется тонкая полоса тумана.','Вчера на звон упавшей пряжки из тумана кто-то отозвался.','Видимость заканчивается у порога, а громкая тревога зовёт существ.','Свет касается посадок только на короткое время.','На обратном пути двое вспомнили совершенно разные ориентиры.'],'На следующий день из тумана увидели знакомый знак у входа.','На условный сигнал из тумана никто не вернулся.'),
('water_world',array['После каждой смены вода с платформы становится чуть солонее.','Утром на несущем стыке нашли свежую трещину.','На двух койках за ночь началась одна и та же лихорадка.','На палубе лежит улов, но его хватит ненадолго.','Даже в закрытой кладовой на стенках выступают капли.','Слухи о суше уводят платформу всё дальше от знакомых течений.'],'Платформа встретила новый сезон с людьми на вахте и запасом на завтра.','К концу сезона от платформы осталось лишь имя на морской карте.'),
('MEDIEVAL_PLAGUE_QUEEN',array['У часовни королевский гонец сползает с седла. Впереди ещё целая ночь пути.','За дубовой дверью колокол тянет вниз почерневшая цепь.','На ступенях часовни едва хватает места для двоих. Пока один склоняется над печатью, кто-то поднимается снизу.','У последнего привала расходится шов бурдюка. На старой карте рядом с тропой нарисован камыш.','Болотные огни ведут прямиком в топь. Только верхушки старых вех ещё видны над водой.','При каждом ударе колокола на цепи проступают письмена, а железо становится холоднее льда.'],'На третьем рассвете замковый звонарь дождался ответа из часовни. Туча над стенами начала редеть.','На третьем рассвете колокол часовни ударил сам. Облако накрыло башни короля.')
on conflict(scenario_id) do update set hints=excluded.hints,victory=excluded.victory,defeat=excluded.defeat;

create or replace function alive_private.room_story(p_code text) returns text
language sql stable security definer set search_path='' as $$
 select string_agg(e.hints[z.idx],' ' order by z.idx) ||
   case when r.current_phase='finished' then E'\n\n'||case when r.verdict='victory' then e.victory else e.defeat end else '' end
 from public.rooms r join alive_private.story_endings e on e.scenario_id=r.scenario_id
 cross join lateral (select distinct i idx from generate_series(1,6) i
  join alive_private.room_combos c on c.route=r.scenario_id||'_route_'||i and c.room_code=r.code) z
 where r.code=p_code and alive_private.member(r.code) and (r.scenario_visible or alive_private.host(r.code))
 and r.card_mode<>'preset' and alive_private.scenario_combos_enabled(r.scenario_id)
 group by r.code,r.current_phase,r.verdict,e.victory,e.defeat having count(*)=2
$$;
create or replace function public.alive_room_story(p_code text) returns text
language sql stable security invoker set search_path='' as $$ select alive_private.room_story(p_code) $$;
revoke all on function public.alive_room_story(text),alive_private.room_story(text) from public,anon;
grant execute on function public.alive_room_story(text),alive_private.room_story(text) to authenticated;

-- The catalogue combines short, observable conditions. A target is bound once at deal.
with cats(id,label) as (values
 ('bio','БИО'),('profession','Профессия'),('hobby','Хобби'),('fact1','Факт 1'),('fact2','Факт 2'),
 ('phobia','Фобия'),('health','Здоровье'),('luggage_big','Большой багаж'),('luggage_small','Малый багаж'),('trait','Черта характера')
), rules(kind,a,b,caption) as (
 select 'secret',a.id,b.id,format('Открой «%s». Сохрани «%s» в тайне до финала.',a.label,b.label) from cats a cross join cats b where a.id<>b.id
 union all select 'pair',a.id,b.id,format('Открой «%s». Пусть напарник откроет «%s».',a.label,b.label) from cats a cross join cats b
 union all select 'trust',id,id,format('Пусть напарник откроет «%s», а твоя карта этой категории останется тайной.',label) from cats
 union all select 'protect',id,id,format('Открой «%s» и помоги напарнику остаться среди выживших.',label) from cats
 union all select * from (values
  ('survive',null,null,'Останься среди выживших.'),
  ('escort',null,null,'Проведи напарника в финальный состав. Твоё место может достаться другому.'),
  ('together',null,null,'Останьтесь в финальном составе вместе с напарником.'),
  ('legacy',null,null,'Уступи место. К финалу напарник остаётся в составе, а ты выбываешь.'),
  ('lead',null,null,'К финалу у тебя должно быть больше открытых характеристик, чем у напарника.'),
  ('listen',null,null,'Пусть напарник раскроет больше характеристик, чем ты.'),
  ('equals',null,null,'Закончите с напарником с одинаковым числом открытых характеристик. Откройте хотя бы по одной.'),
  ('contrast',null,null,'Оба покажите хотя бы по одной характеристике. Среди открытых категорий не должно быть общих.')
 ) as social(kind,a,b,caption)
)
insert into public.character_pool(content_key,category,text,value,is_active,effect_params)
select concat_ws(':','social_goal_v2',kind,a,b),'goal',caption,0,true,
 jsonb_build_object('goal_kind',kind,'a',a,'b',b) from rules
on conflict(content_key) do nothing;
update public.character_pool set is_active=false where category='goal' and left(content_key,16)='general_goal_v1:' and is_active;

create or replace function alive_private.bind_social_goal() returns trigger
language plpgsql set search_path='' as $$
declare partner public.players;
begin
 if new.category='goal' and new.effect_params ? 'goal_kind' and new.effect_params->>'goal_kind' not in ('secret','survive') then
  select p.* into partner from public.players p join public.rooms r on r.code=p.room_code
  where p.room_code=new.room_code and p.id not in (new.player_id,r.host_id) and p.is_alive
  order by random() limit 1;
  if found then
   new.effect_params:=new.effect_params||jsonb_build_object('partner',partner.id);
   new.text:=new.text||' Напарник — '||partner.name||'.';
  end if;
 end if;
 return new;
end $$;
create or replace trigger bind_social_goal before insert on public.player_cards
 for each row execute function alive_private.bind_social_goal();

-- Keep the existing tag, repeat, permissions and effect filters in the installed draw function.
do $$declare def text; anchor text:='where p.is_active and p.category=p_category';begin
 def:=pg_get_functiondef('alive_private.draw(text,text,boolean)'::regprocedure);
 if strpos(def,'eligible_social_goal')=0 then
  if strpos(def,anchor)=0 then raise exception 'Unknown draw function';end if;
  execute replace(def,anchor,anchor||$filter$
   and (p.category<>'goal' or not (p.effect_params ? 'goal_kind') or exists(
    select 1 from public.rooms cfg where cfg.code=p_code
    and coalesce((cfg.settings->'generation'->'counts'->>(p.effect_params->>'a'))::int,1)>0
    and coalesce((cfg.settings->'generation'->'counts'->>(p.effect_params->>'b'))::int,1)>0
    and (p.effect_params->>'goal_kind'<>'together' or coalesce((cfg.settings->>'target_survivors')::int,3)>=2)
    and (p.effect_params->>'goal_kind' in ('secret','survive') or
      (select count(*) from public.players sp where sp.room_code=p_code and sp.id<>cfg.host_id and sp.is_alive)>=2)
   )) /* eligible_social_goal */$filter$);
 end if;
end $$;

create or replace function alive_private.goal_results(p_code text) returns jsonb
language sql stable security definer set search_path='' as $$
 with goals as (
  select c.id,c.player_id,c.text,p.name,p.is_alive owner_safe,c.effect_params->>'goal_kind' kind,
   c.effect_params->>'a' a,c.effect_params->>'b' b,c.effect_params->>'partner' partner
  from public.player_cards c join public.players p on p.id=c.player_id and p.room_code=c.room_code
  join public.rooms r on r.code=c.room_code
  where c.room_code=p_code and c.category='goal' and c.is_active and r.current_phase='finished'
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
 select coalesce(jsonb_agg(jsonb_build_object('id',id,'name',name,'text',text,'met',coalesce(case kind
 when 'secret' then own_open and kept when 'pair' then own_open and partner_open
 when 'trust' then kept and partner_open when 'protect' then own_open and partner_safe
 when 'survive' then owner_safe when 'escort' then partner_safe when 'together' then owner_safe and partner_safe
 when 'legacy' then not owner_safe and partner_safe when 'lead' then cardinality(mine)>cardinality(theirs)
 when 'listen' then cardinality(theirs)>cardinality(mine) when 'equals' then cardinality(mine)>0 and cardinality(mine)=cardinality(theirs)
 when 'contrast' then cardinality(mine)>0 and cardinality(theirs)>0 and not (mine && theirs) end,false)) order by id),'[]') from checks
$$;
create or replace function public.alive_goal_results(p_code text) returns jsonb
language sql stable security invoker set search_path='' as $$ select alive_private.goal_results(p_code) $$;
revoke all on function public.alive_goal_results(text),alive_private.goal_results(text) from public,anon;
grant execute on function public.alive_goal_results(text),alive_private.goal_results(text) to authenticated;
notify pgrst,'reload schema';
