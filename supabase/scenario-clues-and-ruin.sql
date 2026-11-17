-- Publish two room-specific capabilities using the same route indices as the story.
alter table alive_private.story_endings add column if not exists skill_clues text[] check(cardinality(skill_clues)=6);
update alive_private.story_endings e set skill_clues=v.clues from (values
('SC01',array['Пригодится тот, кто услышит неполадку в работе вентиляции и сумеет вернуть тягу.','Ищите человека, который умеет получать урожай без солнечного света.','За дверь стоит поставить того, кто отличит чистую вещь от опасной на вид обычной.','Кто сумеет оставить свет и воздух, когда мощности на всё уже мало?','Нужен тот, кто замечает порчу раньше, чем пропадает весь запас.','Шансы выше с тем, кто умеет пустить использованную воду по второму кругу.']),
('SC02',array['Нужен тот, кто умеет снова сделать морскую воду пригодной для питья.','На борт стоит взять того, кто знает, какой шов первым сдаст в шторм.','Ищите того, кто выйдет к земле, даже потеряв привычные ориентиры.','Кто сумеет и выловить ужин, и сохранить его до завтра?','Полезен спутник, который сумеет собрать ливень и сберечь воду чистой.','Ищите того, кто успеет различить в ветре приближение опасного шторма.']),
('SC03',array['Пригодится человек, способный помочь другим удержаться в собственных мыслях.','Нужен тот, кто замечает приближение аномалии раньше приборной тревоги.','Выручит тот, кто умеет удерживать пространство вокруг людей устойчивым.','Кто поможет другому проверить, действительно ли оба видят одно и то же?','Ищите знающего обходные пути вдали от людных мест.','Пригодится человек, умеющий вернуть растерянному спутнику чувство опоры.']),
('SC04',array['Нужен тот, кто вернёт тепло от глубинного источника к жилым комнатам.','Ищите того, кто найдёт, куда уходит тепло даже за закрытой дверью.','Выручит тот, кто замечает незримую потерю воздуха.','Кто добудет питьё из окружающего льда и сбережёт топливо?','Ценен тот, кто умеет вырастить пищу даже на клочке тёплой земли.','В переходе решающим окажется спутник, знающий, когда продолжать путь по льду, а когда возвращаться.']),
('SC05',array['Нужен тот, кто найдёт течь и сумеет удержать лодку на плаву.','Ищите человека, который знает, как дать о себе знать далёкому судну.','Пригодится тот, кто умеет учесть течение и вывести лодку к берегу.','Полезен спутник, умеющий выбирать пищу среди незнакомого улова.','Ищите того, кто умеет собирать пресную воду в открытом море.','Кто сумеет помочь промокшим и раненым дотянуть до суши?']),
('SC06',array['Ищите человека, который сумеет разделить воздух укрытия и заражённого отсека.','Понадобится тот, кто знает, как укрепить вход и сохранить путь отхода.','Полезен тот, кто сумеет питать приборы, не привлекая толпу шумом.','Ищите спутника, способного понять, кого наблюдать после опасной встречи.','Нужен тот, кто найдёт припасы и вернёт людей до темноты.','Выручит тот, кто сумеет уберечь питьевой запас от грязных стоков.']),
('SC07',array['Ищите того, кто сможет привести людей обратно почти вслепую.','Полезен тот, кто знает, как защитить воздух укрытия от тумана.','Нужен спутник, умеющий провести людей так, чтобы их не услышали.','Кто сумеет предупредить о чужих шагах без единого звука?','Выручит тот, кто сумеет вырастить пищу за короткий час света.','Ищите человека, который отличит настоящий ориентир от обманчивого воспоминания.']),
('water_world',array['Кто сумеет вернуть платформе пресную воду, когда дождевых запасов мало?','Нужен человек, понимающий, какие части корпуса ещё выдержат переход.','Пригодится тот, кто узнает первые признаки общей болезни и проследит контакты.','Ищите спутника, который знает местный улов и сумеет прокормить людей.','Выручит человек, способный уберечь и припасы, и приборы от вечной сырости.','Нужен тот, кто отличит достоверный курс к суше от красивого слуха.']),
('MEDIEVAL_PLAGUE_QUEEN',array['Ищите среди спутников того, в чьих руках раненый продержится до рассвета. Одной храбростью гонца на ноги не поднять.','В часовне пригодится тот, кто по звону металла поймёт, какое звено поддастся первым.','Пока у колокола заняты обе руки, судьба отряда зависит от того, кто сумеет удержать узкий вход.','Пригодится спутник, который отыщет чистую воду там, где остальные увидят только камыш.','Ищите того, кто читает старые болотные тропы и сможет вывести отряд до рассвета.','У колокола нужен тот, кто понимает язык старых чар и сумеет ослабить их, пока цепь ещё цела.'])
) v(id,clues) where e.scenario_id=v.id;
create or replace function alive_private.room_story(p_code text) returns text
language sql stable security definer set search_path='' as $$
 select string_agg(e.hints[z.idx],' ' order by z.idx)
 || E'\n\nТуманная подсказка\n' || string_agg(e.skill_clues[z.idx],E'\n' order by z.idx)
 || case when r.current_phase='finished' then E'\n\n'||case when r.verdict='victory' then e.victory else e.defeat end else '' end
 from public.rooms r join alive_private.story_endings e on e.scenario_id=r.scenario_id
 cross join lateral (select distinct i idx from generate_series(1,6) i
 join alive_private.room_combos c on c.route=r.scenario_id||'_route_'||i and c.room_code=r.code) z
 where r.code=p_code and alive_private.member(r.code) and (r.scenario_visible or alive_private.host(r.code))
 and r.card_mode<>'preset' and alive_private.scenario_combos_enabled(r.scenario_id)
 group by r.code,r.current_phase,r.verdict,e.victory,e.defeat having count(*)=2
$$;
alter table public.character_pool drop constraint character_pool_value_check,
 add constraint character_pool_value_check check (value between -3 and 3);
insert into public.character_pool(content_key,category,text,value,scenario_tag) values
('bunker_range:0:bio:0','bio','Несколько лет провёл в полной изоляции',-3,null),
('bunker_range:0:bio:1','bio','Впервые живёте вдали от семьи',-2,null),
('bunker_range:0:bio:2','bio','Выросли в общине спасателей',2,null),
('bunker_range:0:bio:3','bio','Пережили зимовку в отрезанном посёлке',3,null),
('bunker_range:0:profession:0','profession','Лжеспециалист с поддельным дипломом',-3,null),
('bunker_range:0:profession:1','profession','Стажёр без полевой практики',-2,null),
('bunker_range:0:profession:2','profession','Инструктор аварийных бригад',2,null),
('bunker_range:0:profession:3','profession','Психолог кризисной службы',3,null),
('bunker_range:0:health:0','health','Тяжёлая реакция на металлические поверхности',-3,null),
('bunker_range:0:health:1','health','При нагрузке быстро отекают суставы',-2,null),
('bunker_range:0:health:2','health','Хорошо переносите длительные переходы',2,null),
('bunker_range:0:health:3','health','Отличная выносливость после многих экспедиций',3,null),
('bunker_range:0:phobia:0','phobia','В темноте открытое пространство вызывает ступор',-3,null),
('bunker_range:0:phobia:1','phobia','Теряетесь при внезапном громком звуке',-2,null),
('bunker_range:0:phobia:2','phobia','Сохраняете спокойствие в тесноте',2,null),
('bunker_range:0:phobia:3','phobia','Научились преодолевать панику в полной темноте',3,null),
('bunker_range:0:trait:0','trait','В панике бросаете начатое дело',-3,null),
('bunker_range:0:trait:1','trait','С трудом признаёте ошибку',-2,null),
('bunker_range:0:trait:2','trait','Умеете вовремя передать руководство',2,null),
('bunker_range:0:trait:3','trait','Сохраняете самообладание в кризисе',3,null),
('bunker_range:0:hobby:0','hobby','Азартные игры до последнего запаса',-3,null),
('bunker_range:0:hobby:1','hobby','Коллекционирование просроченных билетов',-2,null),
('bunker_range:0:hobby:2','hobby','Пешее ориентирование',2,null),
('bunker_range:0:hobby:3','hobby','Добровольная помощь поисковым группам',3,null),
('bunker_range:0:fact1:0','fact1','Скрыли крупную ошибку на учениях',-3,null),
('bunker_range:0:fact1:1','fact1','Плохо запоминаете инструкции на слух',-2,null),
('bunker_range:0:fact1:2','fact1','Обучали новичков взаимопомощи',2,null),
('bunker_range:0:fact1:3','fact1','Уже вывели группу из заброшенной шахты',3,null),
('bunker_range:0:fact2:0','fact2','Однажды потеряли общий запас в споре',-3,null),
('bunker_range:0:fact2:1','fact2','Не умеете распределять время',-2,null),
('bunker_range:0:fact2:2','fact2','Знаете порядок проверки снаряжения',2,null),
('bunker_range:0:fact2:3','fact2','Вели смену при длительной аварии',3,null),
('bunker_range:0:luggage_small:0','luggage_small','Протекающий флакон с едкой жидкостью',-3,null),
('bunker_range:0:luggage_small:1','luggage_small','Разбитая лупа',-2,null),
('bunker_range:0:luggage_small:2','luggage_small','Комплект бесшовных защитных перчаток',2,null),
('bunker_range:0:luggage_small:3','luggage_small','Индивидуальный набор психологической самопомощи',3,null),
('bunker_range:0:luggage_big:0','luggage_big','Тяжёлый ящик с отсыревшим мусором',-3,null),
('bunker_range:0:luggage_big:1','luggage_big','Порванная палатка без стоек',-2,null),
('bunker_range:0:luggage_big:2','luggage_big','Неметаллический комплект защитной одежды',2,null),
('bunker_range:0:luggage_big:3','luggage_big','Мобильная мастерская с ручным приводом',3,null),
('bunker_range:1:bio:0','bio','Всю жизнь провели в закрытой башне',-3,'medieval_plague_queen_v1'),
('bunker_range:1:bio:1','bio','Никогда не ночевали за стенами',-2,'medieval_plague_queen_v1'),
('bunker_range:1:bio:2','bio','Выросли у странствующих лекарей',2,'medieval_plague_queen_v1'),
('bunker_range:1:bio:3','bio','Вернулись из трёх зимних походов',3,'medieval_plague_queen_v1'),
('bunker_range:1:profession:0','profession','Самозваный лекарь при ярмарке',-3,'medieval_plague_queen_v1'),
('bunker_range:1:profession:1','profession','Ученик без ремесленной практики',-2,'medieval_plague_queen_v1'),
('bunker_range:1:profession:2','profession','Наставник походных дозорных',2,'medieval_plague_queen_v1'),
('bunker_range:1:profession:3','profession','Опытный странствующий врачеватель',3,'medieval_plague_queen_v1'),
('bunker_range:1:health:0','health','Тяжёлая реакция на прикосновение к металлу',-3,'medieval_plague_queen_v1'),
('bunker_range:1:health:1','health','Слабые суставы после долгой дороги',-2,'medieval_plague_queen_v1'),
('bunker_range:1:health:2','health','Хорошо переносите болотную сырость',2,'medieval_plague_queen_v1'),
('bunker_range:1:health:3','health','Редкая выносливость в многодневном походе',3,'medieval_plague_queen_v1'),
('bunker_range:1:phobia:0','phobia','Замираете перед тёмной бездной',-3,'medieval_plague_queen_v1'),
('bunker_range:1:phobia:1','phobia','Теряетесь при ударе колокола',-2,'medieval_plague_queen_v1'),
('bunker_range:1:phobia:2','phobia','Спокойно переносите тесные переходы',2,'medieval_plague_queen_v1'),
('bunker_range:1:phobia:3','phobia','Сохраняете ориентиры даже в кромешной тьме',3,'medieval_plague_queen_v1'),
('bunker_range:1:trait:0','trait','В страхе бросаете спутников',-3,'medieval_plague_queen_v1'),
('bunker_range:1:trait:1','trait','Неохотно делитесь инструментом',-2,'medieval_plague_queen_v1'),
('bunker_range:1:trait:2','trait','Умеете примирять спорящих',2,'medieval_plague_queen_v1'),
('bunker_range:1:trait:3','trait','Сохраняете отряд собранным при панике',3,'medieval_plague_queen_v1'),
('bunker_range:1:hobby:0','hobby','Проигрываете припасы в кости',-3,'medieval_plague_queen_v1'),
('bunker_range:1:hobby:1','hobby','Собираете бесполезные подковные гвозди',-2,'medieval_plague_queen_v1'),
('bunker_range:1:hobby:2','hobby','Плетёте страховочные верёвки',2,'medieval_plague_queen_v1'),
('bunker_range:1:hobby:3','hobby','Водили поисковые отряды за пропавшими путниками',3,'medieval_plague_queen_v1'),
('bunker_range:1:fact1:0','fact1','Однажды оставили дозор без смены',-3,'medieval_plague_queen_v1'),
('bunker_range:1:fact1:1','fact1','Часто путаете отметки на тропе',-2,'medieval_plague_queen_v1'),
('bunker_range:1:fact1:2','fact1','Обучали послушников уходу за ранеными',2,'medieval_plague_queen_v1'),
('bunker_range:1:fact1:3','fact1','Вывели обоз из затопленного оврага',3,'medieval_plague_queen_v1'),
('bunker_range:1:fact2:0','fact2','Продали общий припас за ложную карту',-3,'medieval_plague_queen_v1'),
('bunker_range:1:fact2:1','fact2','Медленно завязываете дорожные узлы',-2,'medieval_plague_queen_v1'),
('bunker_range:1:fact2:2','fact2','Знаете места для безопасного ночлега',2,'medieval_plague_queen_v1'),
('bunker_range:1:fact2:3','fact2','Организовали эвакуацию деревни в паводок',3,'medieval_plague_queen_v1'),
('bunker_range:1:luggage_small:0','luggage_small','Треснувший сосуд с едкой краской',-3,'medieval_plague_queen_v1'),
('bunker_range:1:luggage_small:1','luggage_small','Кисет с промокшим трутом',-2,'medieval_plague_queen_v1'),
('bunker_range:1:luggage_small:2','luggage_small','Запас кожаных защитных рукавиц',2,'medieval_plague_queen_v1'),
('bunker_range:1:luggage_small:3','luggage_small','Набор лекаря для дальней дороги',3,'medieval_plague_queen_v1'),
('bunker_range:1:luggage_big:0','luggage_big','Сундук с прогнившими припасами',-3,'medieval_plague_queen_v1'),
('bunker_range:1:luggage_big:1','luggage_big','Навес с разошедшимся швом',-2,'medieval_plague_queen_v1'),
('bunker_range:1:luggage_big:2','luggage_big','Дорожный комплект без металлической фурнитуры',2,'medieval_plague_queen_v1'),
('bunker_range:1:luggage_big:3','luggage_big','Складная ремесленная мастерская',3,'medieval_plague_queen_v1') on conflict(content_key) do nothing;

-- Use the final balanced hand. Normal and late deals share this allocator.
create or replace function alive_private.assign_ruin_goal(p_code text,p_target text default null) returns void
language plpgsql security definer set search_path='' as $$
declare candidate bigint; kind text; caption text;
begin
 if not exists(select 1 from public.rooms where code=p_code and card_mode<>'preset' and scenario_id<>'SC08') then return;end if;
 if exists(select 1 from public.player_cards where room_code=p_code and category='goal' and effect_params->>'goal_kind' like 'ruin_%') then return;end if;
 select g.id into candidate from public.player_cards g join lateral (
  select sum(c.value) total,min(c.value) worst,count(*) filter(where c.value<0) weaknesses,
   count(*) filter(where c.value>0) strengths
  from public.player_cards c where c.room_code=g.room_code and c.player_id=g.player_id and c.is_active and c.category not in ('goal','special_condition')
 ) hand on true where g.room_code=p_code and g.category='goal' and g.is_active and g.effect_params ? 'goal_kind'
 and (p_target is null or g.player_id=p_target) and hand.strengths>0 and (hand.worst<=-3 or (hand.total<0 and hand.weaknesses>=3))
 order by hand.worst,hand.total,random() limit 1;
 if candidate is null then return;end if;
 if random()<0.5 then
  kind:='ruin_bluff'; caption:='Блеф. Останься в финальном составе при поражении группы.';
 else
  kind:='ruin_vote'; caption:='Раскол. При поражении группы добейся, чтобы за пределами финального состава остался хотя бы один игрок, против которого ты голосовал.';
 end if;
 update public.player_cards g set text=caption || case when kind='ruin_bluff' then format(' Раскрой «%s». Сохрани в тайне «%s».',pos.text,neg.text) else '' end,
  effect_params=jsonb_build_object('goal_kind',kind,'show_id',pos.id,'hide_id',neg.id),pool_id=null
 from public.player_cards owner_goal
 cross join lateral (select c.id,c.text from public.player_cards c where c.room_code=p_code and c.player_id=owner_goal.player_id and c.category not in ('goal','special_condition') and c.is_active and c.value>0 order by c.value desc,c.id limit 1) pos
 cross join lateral (select c.id,c.text from public.player_cards c where c.room_code=p_code and c.player_id=owner_goal.player_id and c.category not in ('goal','special_condition') and c.is_active and c.value<0 order by c.value,c.id limit 1) neg
 where owner_goal.id=candidate and g.id=candidate;
end $$;
revoke all on function alive_private.assign_ruin_goal(text,text) from public,anon,authenticated;
do $$declare def text;begin
 def:=pg_get_functiondef('alive_private.generate(text)'::regprocedure);
 if strpos(def,'perform alive_private.log(p_code,''game.deal''')=0 then raise exception 'Unknown generate';end if;
 execute replace(def,'perform alive_private.log(p_code,''game.deal''','perform alive_private.assign_ruin_goal(p_code);perform alive_private.log(p_code,''game.deal''');
 def:=pg_get_functiondef('alive_private.join_room(text,text)'::regprocedure);
 if strpos(def,'perform alive_private.deal_player(r.code,uid);')=0 then raise exception 'Unknown late deal';end if;
 execute replace(def,'perform alive_private.deal_player(r.code,uid);','perform alive_private.deal_player(r.code,uid);perform alive_private.assign_ruin_goal(r.code,uid);');
 def:=pg_get_functiondef('alive_private.goal_results(text)'::regprocedure);
 if strpos(def,'c.id,c.player_id,c.text,p.name')=0 or strpos(def,'case kind')=0 then raise exception 'Unknown goal evaluator';end if;
 def:=replace(def,'c.id,c.player_id,c.text,p.name','c.id,c.player_id,c.text,c.effect_params goal_params,r.verdict,p.name');
 def:=replace(def,'''met'',coalesce(case kind','''ruin'',kind in (''ruin_bluff'',''ruin_vote''),''met'',coalesce(case kind');
 execute replace(def,'case kind', $cases$case kind
 when 'ruin_vote' then verdict='defeat' and exists(select 1 from public.votes v join public.players t on t.id=v.target_id and t.room_code=v.room_code where v.room_code=p_code and v.voter_id=checks.player_id and not t.is_alive)
 when 'ruin_bluff' then verdict='defeat' and owner_safe and exists(select 1 from public.player_cards c where c.room_code=p_code and c.player_id=checks.player_id and c.id=(goal_params->>'show_id')::bigint and c.revealed and c.is_active)
 and exists(select 1 from public.player_cards c where c.room_code=p_code and c.player_id=checks.player_id and c.id=(goal_params->>'hide_id')::bigint and not c.revealed and c.is_active)
 $cases$);
end $$;

-- Only the affected character and support cards in the final roster matter.
create function alive_private.uncovered_risks(p_code text) returns table(name text, reason text)
language sql stable security definer set search_path='' as $$
 select p.name,case when pool.category='phobia' then 'Тьма и открытая местность: нужен психолог, навык психологической первой помощи или набор самопомощи.'
 else 'Металлические поверхности убежища: нужны защитные перчатки или неметаллический комплект одежды.' end
 from public.rooms r join public.player_cards c on c.room_code=r.code
 join public.character_pool pool on pool.id=c.pool_id and pool.text=c.text
 join public.players p on p.id=c.player_id and p.room_code=r.code and p.is_alive
 where r.code=p_code and r.card_mode<>'preset' and c.is_active
 and ((r.scenario_id='SC07' and pool.content_key='bunker_range:0:phobia:0')
 or (r.scenario_id='SC01' and pool.content_key='bunker_range:0:health:0'))
 and not exists(select 1 from public.player_cards help join public.character_pool item on item.id=help.pool_id
 where help.room_code=r.code and (case when pool.category='phobia' then
 item.content_key in ('bunker_range:0:profession:3','bunker_range:0:luggage_small:3') or (item.category='hobby' and item.text='Психологическая первая помощь')
 else item.content_key in ('bunker_range:0:luggage_small:2','bunker_range:0:luggage_big:2') end)
 and alive_private.combo_card_usable(help.id))
$$;
revoke all on function alive_private.uncovered_risks(text) from public,anon,authenticated;
create function alive_private.host_risks(p_code text) returns jsonb language sql stable security definer set search_path='' as $$
 select case when alive_private.host(p_code) then (select coalesce(jsonb_agg(to_jsonb(u) order by u.name),'[]') from alive_private.uncovered_risks(p_code) u) else '[]'::jsonb end
$$;
create function public.alive_host_risks(p_code text) returns jsonb language sql stable security invoker set search_path='' as $$select alive_private.host_risks(p_code)$$;
revoke all on function public.alive_host_risks(text),alive_private.host_risks(text) from public,anon;
grant execute on function public.alive_host_risks(text),alive_private.host_risks(text) to authenticated;
create function alive_private.check_final_risks() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.current_phase='finished' and new.verdict='victory'
 and (old.current_phase is distinct from new.current_phase or old.verdict is distinct from new.verdict)
 and exists(select 1 from alive_private.uncovered_risks(new.code)) then
  raise exception 'В финальном составе остался игрок с критическим риском. Проверьте лечение, защиту или состав группы.';
 end if;
 return new;
end $$;
revoke all on function alive_private.check_final_risks() from public,anon,authenticated;
create trigger alive_check_final_risks before update of current_phase,verdict on public.rooms
for each row execute function alive_private.check_final_risks();
