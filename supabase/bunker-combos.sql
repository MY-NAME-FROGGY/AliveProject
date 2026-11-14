-- Server-owned victory routes. A route is useful only with all three components.
create table alive_private.combo_catalog (
 key text primary key, scenario_tag text, route text not null, title text not null,
 part int not null check(part between 1 and 3), category text not null,
 pool_id bigint not null references public.character_pool(id)
);
create table alive_private.room_combos (
 room_code text references public.rooms(code) on delete cascade,
 route text not null, title text not null, part int not null,
 pool_id bigint references public.character_pool(id),
 primary key(room_code,route,part)
);
alter table alive_private.combo_catalog enable row level security;
alter table alive_private.room_combos enable row level security;
revoke all on alive_private.combo_catalog,alive_private.room_combos from public,anon,authenticated;

-- Several interchangeable components for each part; the six categories remain
-- independent of personal goals and special conditions.
do $seed$
declare tag text; medieval boolean; route text; part int; category text; label text; txt text; k text; pool bigint; v int;
begin
 foreach tag in array array['','medieval_plague_queen_v1'] loop
  medieval:=tag<>'';
  foreach route in array array['care','water'] loop
   for part in 1..3 loop
    category:=case when route='care' then (array['profession','luggage_small','fact1'])[part] else (array['hobby','luggage_big','fact2'])[part] end;
    label:=case when route='care' then 'Помощь раненым: знание + инструмент + безопасное применение' else 'Чистая вода: навык + оборудование + источник' end;
    for v in 1..3 loop
     txt:=case
      when route='care' and part=1 and medieval then (array['Знахарь походной дружины: умеете останавливать кровотечение, но нужны чистые инструменты и повязки.','Храмовый врачеватель: знакомы с обработкой ран; без чистой воды и перевязочного набора помощь ограничена.','Ученик лекаря: умеете оказать первую помощь по памятке; сложные операции вам недоступны.'])[v]
      when route='care' and part=1 then (array['Фельдшер: первая помощь и обработка ран; нужны чистые материалы и безопасный порядок работы.','Медсестра экстренной помощи: стабилизация раненых при наличии перевязочных средств.','Спасатель с медицинской подготовкой: поддержка пострадавшего до полноценного лечения.'])[v]
      when route='care' and part=2 and medieval then (array['Чистые льняные повязки и игла в запечатанном воске футляре. Запас на три обработки ран.','Сумка лекаря: нить, ножницы и кипятильный котелок. Для применения нужен обученный спутник.','Дорожный перевязочный свёрток на три ранения; повторно без очистки не использовать.'])[v]
      when route='care' and part=2 then (array['Запечатанный перевязочный набор на три ранения. Без медицинского навыка возможности ограничены.','Полевой комплект: стерильные повязки, перчатки и ножницы на три применения.','Медицинский контейнер с чистыми инструментами и тремя комплектами расходников.'])[v]
      when route='care' and part=3 then (array['Знаете порядок очистки рук, инструментов и воды перед перевязкой; можете организовать чистое рабочее место.','Можете объяснить безопасный порядок первой помощи и отличить чистую повязку от непригодной.','Умеете подготовить освещённое место для обработки ран и не смешивать чистые и использованные материалы.'])[v]
      when route='water' and part=1 and medieval then (array['Собираете дождевую воду в походах; умеете устроить сбор и очистку, если есть ёмкость.','Изучаете родники и водосбор: знаете, как подготовить оборудование и хранить воду чистой.','Увлекаетесь походными перегонными устройствами; умеете собрать простой водоочиститель.'])[v]
      when route='water' and part=1 then (array['Походная очистка воды: умеете собрать и обслужить фильтр или простой дистиллятор.','Увлекаетесь автономным водоснабжением: умеете получить безопасную воду при наличии источника и оборудования.','Туристический водосбор: знаете порядок очистки и хранения воды.'])[v]
      when route='water' and part=2 and medieval then (array['Медный перегонный котёл с крышкой и чистым приёмником. Нужны вода, огонь и обученный человек; проклятие не снимает.','Складной водосбор и закрывающаяся бочка; нужны источник и навык очистки, пустая тара воды не создаёт.','Песчано-угольный фильтр с котелком для кипячения. Нужны исходная вода и топливо; магическую чуму не устраняет.'])[v]
      when route='water' and part=2 then (array['Компактный дистиллятор и закрытый приёмник: нужны источник воды, энергия и умеющий пользоваться человек.','Полевой водоочиститель с канистрой. Без источника и обслуживания бесполезен.','Водосбор, фильтр и герметичная ёмкость; требуют подходящего источника и навыка обработки.'])[v]
      else (array['Помните доступный источник воды рядом с маршрутом и можете объяснить путь к нему; без очистки безопасность не гарантируется.','Умеете находить место для сбора воды и знаете, как проверить и защитить его от повторного загрязнения.','Сохранили схему водосбора по маршруту: можете привести группу к сырой воде, но её необходимо обработать.'])[v]
     end;
     k:='combo_v1:'||coalesce(nullif(tag,''),'generic')||':'||route||':'||part||':'||v;
     insert into public.character_pool(content_key,category,text,value,scenario_tag,is_active)
     values(k,category,txt,case when part=2 then 0 else 1 end,nullif(tag,''),true) on conflict(content_key) do update set text=excluded.text returning id into pool;
     insert into alive_private.combo_catalog values(k,nullif(tag,''),route,label,part,category,pool);
    end loop;
   end loop;
  end loop;
 end loop;
end $seed$;

create function alive_private.balance_deal(p_code text,p_target text) returns void
language plpgsql security definer set search_path='' as $$
declare total int; selected record; step int; tag text; mode text;
begin
 if not alive_private.member(p_code) then raise exception 'Нет доступа';end if;
 select s.character_pool_tag,coalesce(r.settings->'generation'->>'repeats','unique') into tag,mode from public.rooms r left join public.scenarios s on s.id=r.scenario_id where r.code=p_code;
 for step in 1..40 loop
  select coalesce(sum(value),0) into total from public.player_cards where room_code=p_code and player_id=p_target and category not in ('goal','special_condition');
  exit when abs(total)<=1;
  select c.id card_id,p.id pool_id,p.text,p.value into selected
  from public.player_cards c join public.character_pool p on p.category=c.category
  where c.room_code=p_code and c.player_id=p_target and c.category not in ('goal','special_condition')
   and not exists(select 1 from alive_private.room_combos rc where rc.room_code=p_code and rc.pool_id=c.pool_id)
   and p.is_active and p.scenario_tag is not distinct from tag
   and not exists(select 1 from alive_private.combo_catalog k where k.pool_id=p.id)
   and (mode='allow' or not exists(select 1 from public.player_cards d where d.room_code=p_code and d.pool_id=p.id))
   and abs(total-c.value+p.value)<abs(total)
  order by abs(total-c.value+p.value),random() limit 1;
  if not found then raise exception 'Для этого состава категорий невозможно сбалансировать карточку. Добавьте обычные категории или разрешите повторы';end if;
  update public.player_cards set pool_id=selected.pool_id,text=selected.text,value=selected.value where id=selected.card_id;
 end loop;
end $$;
revoke all on function alive_private.balance_deal(text,text) from public,anon,authenticated;

create function alive_private.seed_combos(p_code text) returns void
language plpgsql security definer set search_path='' as $$
declare r public.rooms; tag text; v_route text; component record; target_card bigint; owner_ids text[]; owner_count int; cursor_pos int:=0;
begin
 if not alive_private.host(p_code) then raise exception 'Только ведущий';end if;
 select * into r from public.rooms where code=p_code for update;
 if r.card_mode='preset' then return;end if;
 select character_pool_tag into tag from public.scenarios where id=r.scenario_id;
 -- Tagged scenarios must have their own compatible catalogue; never inject
 -- modern equipment into another scenario's pool.
 if not exists(select 1 from alive_private.combo_catalog where scenario_tag is not distinct from tag) then raise exception 'Для сценарного набора ещё не настроены связки';end if;
 select array_agg(id order by seat_number,created_at) into owner_ids from (select id,seat_number,created_at from public.players where room_code=p_code and id<>r.host_id order by random() limit greatest(1,least(3,coalesce((r.settings->>'target_survivors')::int,1))))p;
 owner_count:=cardinality(owner_ids);if owner_count is null then raise exception 'Нет игроков для раздачи';end if;
 foreach v_route in array array['care','water'] loop
  for component in select distinct on(part) * from alive_private.combo_catalog where scenario_tag is not distinct from tag and combo_catalog.route=v_route order by part,random() loop
   cursor_pos:=cursor_pos+1;
   select id into target_card from public.player_cards c where c.room_code=p_code and c.player_id=owner_ids[1+(cursor_pos-1)%owner_count] and c.category=component.category and c.slot=1;
   if not found then raise exception 'Связкам нужны категории: профессия, малый багаж, факт 1, хобби, большой багаж, факт 2 (минимум по одной карте)';end if;
   update public.player_cards c set pool_id=p.id,text=p.text,value=p.value from public.character_pool p where c.id=target_card and p.id=component.pool_id;
   insert into alive_private.room_combos values(p_code,v_route,component.title,component.part,component.pool_id);
  end loop;
 end loop;
end $$;
revoke all on function alive_private.seed_combos(text) from public,anon,authenticated;

alter function alive_private.deal_player(text,text) rename to deal_player_base;
create function alive_private.deal_player(p_code text,p_target text) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not alive_private.member(p_code) or (auth.uid()::text<>p_target and not alive_private.host(p_code)) then raise exception '??? ???????';end if;
 perform alive_private.deal_player_base(p_code,p_target);
 if exists(select 1 from public.rooms where code=p_code and card_mode<>'preset') then perform alive_private.balance_deal(p_code,p_target);end if;
end $$;
revoke all on function alive_private.deal_player(text,text),alive_private.deal_player_base(text,text) from public,anon,authenticated;

-- Replace the orchestration only; existing preset and late-join dealing remain.
create or replace function alive_private.draw(p_code text,p_category text,p_effect boolean default false) returns public.character_pool
language plpgsql security definer set search_path='' as $$
declare picked public.character_pool;repeat_mode text;selected_tag text;
begin
 if not alive_private.member(p_code) then raise exception 'Нет доступа';end if;
 select coalesce(r.settings->'generation'->>case when p_effect then 'effect_repeats' else 'repeats' end,'unique'),
 case when p_category in ('special_condition','goal') then null else s.character_pool_tag end
 into repeat_mode,selected_tag from public.rooms r left join public.scenarios s on s.id=r.scenario_id where r.code=p_code;
 select * into picked from public.character_pool p where p.is_active and p.category=p_category
 and p.scenario_tag is not distinct from selected_tag
 and (p_effect or coalesce(p.content_key,'') not like 'combo_v1:%')
 and (repeat_mode='allow' or not exists(select 1 from public.player_cards c where c.room_code=p_code and c.pool_id=p.id)) order by random() limit 1;
 if not found then raise exception 'В категории % закончились карты выбранного набора. Разрешите повторы или уменьшите количество',p_category;end if;
 return picked;
end $$;

create or replace function alive_private.generate(p_code text) returns void
language plpgsql security definer set search_path='' as $$
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
  insert into public.room_resources(room_code,key,label,amount,unit) values(p_code,'water_liters','Чистая вода отряда',8,'л') on conflict(room_code,key) do nothing;
 end if;
 perform alive_private.log(p_code,'game.deal','Карты розданы. В случайной колоде подготовлены два пути выживания из трёх компонентов; карточки сбалансированы.',null,false,jsonb_build_object('generation',r.settings->'generation'));
 perform set_config('alive.internal',coalesce(previous,''),true);
end $$;

create function public.alive_combo_status(p_code text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare result jsonb;full_access boolean;
begin
 if not alive_private.member(p_code) then raise exception 'Нет доступа';end if;
 full_access:=alive_private.host(p_code);
 select coalesce(jsonb_agg(t),'[]') into result from (
  select rc.route,rc.title,count(*) required,
   case when full_access then count(*) filter(where exists(select 1 from public.player_cards c join public.players p on p.id=c.player_id where c.room_code=p_code and c.pool_id=rc.pool_id and c.text=(select text from public.character_pool where id=rc.pool_id) and p.is_alive)) else null end surviving,
   jsonb_agg(jsonb_build_object('part',rc.part,'cards',(select coalesce(jsonb_agg(jsonb_build_object('player',p.name,'text',c.text,'alive',p.is_alive,'revealed',c.revealed)),'[]') from public.player_cards c join public.players p on p.id=c.player_id where c.room_code=p_code and c.pool_id=rc.pool_id and c.text=(select text from public.character_pool where id=rc.pool_id) and (full_access or c.revealed or c.player_id=auth.uid()::text)))) parts
  from alive_private.room_combos rc where rc.room_code=p_code group by rc.route,rc.title order by rc.route
 )t;
 return result;
end $$;
revoke all on function public.alive_combo_status(text) from public,anon;
grant execute on function public.alive_combo_status(text) to authenticated;
notify pgrst,'reload schema';

alter function public.alive_combo_status(text) set schema alive_private;
create function public.alive_combo_status(p_code text) returns jsonb language sql security invoker set search_path='' as $$select alive_private.alive_combo_status(p_code)$$;
revoke all on function public.alive_combo_status(text),alive_private.alive_combo_status(text) from public,anon;
grant execute on function public.alive_combo_status(text),alive_private.alive_combo_status(text) to authenticated;
