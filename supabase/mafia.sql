-- Independent Mafia storage. Nothing in the existing bunker game is altered.
create schema if not exists mafia_private;
revoke all on schema mafia_private from public,anon,authenticated;
grant usage on schema mafia_private to service_role;
create table if not exists mafia_private.rooms (
 code text primary key check(code ~ '^[A-Z2-9]{6}$'),
 state jsonb not null,
 version bigint not null default 1,
 lease uuid,
 lease_until timestamptz,
 next_check timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
alter table mafia_private.rooms enable row level security;
revoke all on mafia_private.rooms from public,anon,authenticated;
grant select,insert,update,delete on mafia_private.rooms to service_role;
create index if not exists mafia_rooms_due on mafia_private.rooms(next_check) where state->>'phase' not in ('lobby','finished');

create or replace function public.mafia_storage(p_op text,p_code text default null,p_lease uuid default null,p_state jsonb default null) returns jsonb
language plpgsql security invoker set search_path='' as $$
declare r mafia_private.rooms; result jsonb;
begin
 if p_op='create' then
  if (select count(*) from mafia_private.rooms where state->>'host'=p_state->>'host' and state->>'phase'<>'finished')>=3 then raise exception 'Можно создать не больше трёх незавершённых комнат';end if;
  insert into mafia_private.rooms(code,state) values(p_code,p_state) returning * into r;
 elsif p_op='read' then select * into r from mafia_private.rooms where code=p_code;
 elsif p_op='claim' then
  update mafia_private.rooms set lease=p_lease,lease_until=clock_timestamp()+interval '60 seconds' where code=p_code and (lease is null or lease_until<clock_timestamp()) returning * into r;
 elsif p_op in ('save','save_tick') then
  update mafia_private.rooms set state=p_state,version=version+1,lease=null,lease_until=null,updated_at=now(),next_check=case when p_op='save_tick' then now()+interval '5 seconds' else next_check end
   where code=p_code and lease=p_lease and lease_until>clock_timestamp() returning * into r;
  if not found then raise exception 'Состояние изменилось, повторите запрос';end if;
 elsif p_op='release' then
  update mafia_private.rooms set lease=null,lease_until=null where code=p_code and lease=p_lease;
  return '{}';
 elsif p_op='due' then
  select coalesce(jsonb_agg(code),'[]') into result from (select code from mafia_private.rooms where state->>'phase' not in ('lobby','finished') and next_check<=now() and (lease is null or lease_until<now()) order by next_check limit 5) x;
  return result;
 else raise exception 'Неизвестная операция';end if;
 if r.code is null then return null;end if;
 return jsonb_build_object('state',r.state,'version',r.version);
end $$;
revoke all on function public.mafia_storage(text,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.mafia_storage(text,text,uuid,jsonb) to service_role;
notify pgrst,'reload schema';

create extension if not exists pg_cron with schema pg_catalog;
create extension if not exists pg_net with schema extensions;
do $$begin
 if not exists(select 1 from vault.secrets where name='mafia_scheduler_token') then
  perform vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'mafia_scheduler_token','Internal Mafia scheduler authentication');
 end if;
end $$;
create or replace function mafia_private.scheduler_auth(p_token text) returns boolean
language sql security definer set search_path='' as $$
 select length(p_token)=64 and exists(select 1 from vault.decrypted_secrets where name='mafia_scheduler_token' and decrypted_secret=p_token)
$$;
revoke all on function mafia_private.scheduler_auth(text) from public,anon,authenticated;
grant execute on function mafia_private.scheduler_auth(text) to service_role;
create or replace function public.mafia_scheduler_auth(p_token text) returns boolean
language sql security invoker set search_path='' as $$select mafia_private.scheduler_auth(p_token)$$;
revoke all on function public.mafia_scheduler_auth(text) from public,anon,authenticated;
grant execute on function public.mafia_scheduler_auth(text) to service_role;
select cron.schedule('mafia-automatic-phases','5 seconds',$job$
 select net.http_post(
  url:='https://dhuqvintfsmbigmvdvak.supabase.co/functions/v1/mafia',
  headers:=jsonb_build_object('Content-Type','application/json','Authorization','Bearer '||(select decrypted_secret from vault.decrypted_secrets where name='mafia_scheduler_token')),
  body:='{"op":"scheduler"}'::jsonb,timeout_milliseconds:=50000
 ) where exists(select 1 from mafia_private.rooms where state->>'phase' not in ('lobby','finished') and next_check<=now() and (lease is null or lease_until<now()));
$job$);
