-- Append after mafia.sql inside a transaction ending in ROLLBACK.
set local role authenticated;
do $$begin
 begin perform public.mafia_storage('read','ABC234');raise exception 'TEST FAILED: player read private room';exception when insufficient_privilege then null;end;
 begin perform public.mafia_scheduler_auth('guess');raise exception 'TEST FAILED: player scheduler auth';exception when insufficient_privilege then null;end;
end $$;
reset role;
set local role service_role;
select public.mafia_storage('create','TST234',null,'{"host":"test-host","phase":"lobby","players":[],"night":{"secret":"not-public"}}');
select public.mafia_storage('claim','TST234','00000000-0000-4000-8000-000000000001');
do $$begin
 if public.mafia_storage('claim','TST234','00000000-0000-4000-8000-000000000002') is not null then raise exception 'TEST FAILED: double claim';end if;
 begin perform public.mafia_storage('save','TST234','00000000-0000-4000-8000-000000000002','{}');raise exception 'TEST FAILED: stolen lease';exception when others then if sqlerrm like 'TEST FAILED:%' then raise;end if;end;
end $$;
select public.mafia_storage('save','TST234','00000000-0000-4000-8000-000000000001','{"host":"test-host","phase":"lobby","players":[]}');
do $$begin
 if (public.mafia_storage('read','TST234')->>'version')::int<>2 then raise exception 'TEST FAILED: version';end if;
 if public.mafia_scheduler_auth(repeat('x',64)) then raise exception 'TEST FAILED: scheduler secret';end if;
end $$;
reset role;
select 'Mafia private storage and lease checks passed' as result;
