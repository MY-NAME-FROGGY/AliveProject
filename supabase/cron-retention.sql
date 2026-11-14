-- Only operational run history; schedules, game content and player logs survive.
set local lock_timeout = '3s';
create temporary table saved_cron_failures on commit drop as
 select * from cron.job_run_details where status='failed'
 and start_time>now()-interval '7 days' order by runid desc limit 500;
truncate table cron.job_run_details;
insert into cron.job_run_details select * from saved_cron_failures;
-- ~4,320 successful five-second runs retained, instead of unbounded growth.
-- Small hourly deletes are recycled by autovacuum; no recurring full vacuum,
-- external service, HTTP function or per-player cleanup request required.
select cron.schedule('operational-history-retention','17 * * * *',$retention$
 delete from cron.job_run_details where runid in (
  select runid from cron.job_run_details
  where (status='succeeded' and end_time<now()-interval '6 hours')
     or (status='failed' and end_time<now()-interval '7 days')
  order by runid limit 20000
 );
$retention$);
