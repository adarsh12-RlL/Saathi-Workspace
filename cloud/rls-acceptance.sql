-- Run AFTER schema.sql in the Supabase SQL Editor, using an administrative role.
-- Replace BOTH UUIDs below with two DISTINCT EXISTING auth.users IDs.
-- These are fixture inputs, not credentials. No real user rows are created/deleted.
-- All mission fixtures, role switches, and JWT claim settings are rolled back.
-- On any error, ROLLBACK the failed transaction before retrying the whole script.
begin;

do $inputs$
declare
  user_a uuid := '00000000-0000-0000-0000-000000000001'; -- REPLACE
  user_b uuid := '00000000-0000-0000-0000-000000000002'; -- REPLACE
begin
  if user_a = user_b then raise exception 'Use two distinct existing test accounts.'; end if;
  if not exists (select 1 from auth.users where id = user_a)
    or not exists (select 1 from auth.users where id = user_b)
  then
    raise exception 'Replace both input UUIDs with existing auth.users IDs. The owner foreign key is intentional.';
  end if;
  perform set_config('saathi.test_user_a', user_a::text, true);
  perform set_config('saathi.test_user_b', user_b::text, true);
  perform set_config('saathi.test_mission_id', gen_random_uuid()::text, true);
end;
$inputs$;

set local role authenticated;
select set_config('request.jwt.claims', jsonb_build_object(
  'sub', current_setting('saathi.test_user_a'), 'role', 'authenticated'
)::text, true);
select set_config('request.jwt.claim.sub', current_setting('saathi.test_user_a'), true);

do $owner$
declare
  mission_id uuid := current_setting('saathi.test_mission_id')::uuid;
  user_a uuid := current_setting('saathi.test_user_a')::uuid;
  user_b uuid := current_setting('saathi.test_user_b')::uuid;
  changed bigint;
  snapshot jsonb := jsonb_build_object(
    'id', current_setting('saathi.test_mission_id'), 'title', 'RLS acceptance fixture',
    'goal', 'Verify account isolation', 'notes', '', 'nextStep', '', 'stage', 'captured',
    'tasks', '[]'::jsonb, 'decisions', '[]'::jsonb, 'artifacts', '[]'::jsonb,
    'miniApps', '[]'::jsonb, 'updatedAt', '2026-10-08T00:00:00.000Z', 'templateSource', null
  );
begin
  if auth.uid() is distinct from user_a then raise exception 'Account A claims were not installed.'; end if;
  insert into public.saathi_missions (id, owner_id, title, payload)
    values (mission_id, user_a, 'RLS acceptance fixture', snapshot);
  if (select count(*) from public.saathi_missions where id = mission_id) <> 1 then
    raise exception 'FAIL: owner cannot read its fixture.';
  end if;

  update public.saathi_missions set revision = 2,
    payload = jsonb_set(payload, '{goal}', '"Owner update accepted"'::jsonb)
    where id = mission_id and revision = 1;
  get diagnostics changed = row_count;
  if changed <> 1 then raise exception 'FAIL: owner CAS update did not affect one row.'; end if;

  update public.saathi_missions set revision = 2
    where id = mission_id and revision = 1;
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'FAIL: stale CAS update changed a row.'; end if;

  begin
    update public.saathi_missions set revision = 4 where id = mission_id;
    raise exception 'FAIL: nonsequential revision was accepted.';
  exception when check_violation then null;
  end;

  begin
    update public.saathi_missions set revision = 3, owner_id = user_b where id = mission_id;
    raise exception 'FAIL: owner transfer was accepted.';
  exception when check_violation then null;
  end;

  begin
    update public.saathi_missions set revision = 3, created_at = created_at - interval '1 day'
      where id = mission_id;
    raise exception 'FAIL: created_at change was accepted.';
  exception when check_violation then null;
  end;

  begin
    update public.saathi_missions set revision = 3, id = gen_random_uuid() where id = mission_id;
    raise exception 'FAIL: mission id change was accepted.';
  exception when check_violation then null;
  end;

  begin
    update public.saathi_missions set revision = 3, payload = payload - 'tasks' where id = mission_id;
    raise exception 'FAIL: missing required payload array was accepted.';
  exception when check_violation then null;
  end;

  begin
    update public.saathi_missions set revision = 3, title = 'Mismatched payload title' where id = mission_id;
    raise exception 'FAIL: row and payload titles can diverge.';
  exception when check_violation then null;
  end;

  begin
    delete from public.saathi_missions where id = mission_id;
    raise exception 'FAIL: owner has hard-delete permission.';
  exception when insufficient_privilege then null;
  end;

  update public.saathi_missions set revision = 3, deleted_at = now()
    where id = mission_id and revision = 2;
  get diagnostics changed = row_count;
  if changed <> 1 or not exists (
    select 1 from public.saathi_missions
    where id = mission_id and revision = 3 and deleted_at is not null
  ) then raise exception 'FAIL: owner cannot read its soft-delete tombstone.'; end if;
  raise notice 'PASS: owner insert/read/update, CAS, immutable identity, envelope checks, and tombstone; hard delete denied.';
end;
$owner$;

select set_config('request.jwt.claims', jsonb_build_object(
  'sub', current_setting('saathi.test_user_b'), 'role', 'authenticated'
)::text, true);
select set_config('request.jwt.claim.sub', current_setting('saathi.test_user_b'), true);

do $other_account$
declare
  mission_id uuid := current_setting('saathi.test_mission_id')::uuid;
  forged_id uuid := gen_random_uuid();
  changed bigint;
begin
  if auth.uid() is distinct from current_setting('saathi.test_user_b')::uuid then
    raise exception 'Account B claims were not installed.';
  end if;
  if (select count(*) from public.saathi_missions where id = mission_id) <> 0 then
    raise exception 'FAIL: account B can read account A mission/tombstone.';
  end if;
  update public.saathi_missions set revision = 4 where id = mission_id;
  get diagnostics changed = row_count;
  if changed <> 0 then raise exception 'FAIL: account B can modify account A mission.'; end if;

  begin
    insert into public.saathi_missions (id, owner_id, title, payload)
      values (
        forged_id, current_setting('saathi.test_user_a')::uuid,
        'Forbidden ownership', jsonb_build_object(
          'id', forged_id::text, 'title', 'Forbidden ownership', 'goal', '', 'notes', '',
          'nextStep', '', 'stage', 'captured', 'tasks', '[]'::jsonb,
          'decisions', '[]'::jsonb, 'artifacts', '[]'::jsonb, 'miniApps', '[]'::jsonb,
          'updatedAt', '2026-10-08T00:00:00.000Z', 'templateSource', null
        )
      );
    raise exception 'FAIL: account B can create data owned by account A.';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS: account B reads zero owner rows, changes zero rows, and cannot insert for account A.';
end;
$other_account$;

set local role anon;
select set_config('request.jwt.claims', '{"role":"anon"}', true);
select set_config('request.jwt.claim.sub', '', true);

do $anonymous$
declare
  mission_id uuid := current_setting('saathi.test_mission_id')::uuid;
  visible bigint;
  changed bigint;
begin
  if auth.uid() is not null then raise exception 'Anonymous claims were not cleared.'; end if;
  begin
    select count(*) into visible from public.saathi_missions where id = mission_id;
    if visible <> 0 then raise exception 'FAIL: anonymous client can read an owner mission.'; end if;
  exception when insufficient_privilege then null;
  end;
  begin
    update public.saathi_missions set revision = 4 where id = mission_id;
    get diagnostics changed = row_count;
    if changed <> 0 then raise exception 'FAIL: anonymous client can modify an owner mission.'; end if;
  exception when insufficient_privilege then null;
  end;
  begin
    delete from public.saathi_missions where id = mission_id;
    raise exception 'FAIL: anonymous client has hard-delete permission.';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.saathi_missions(id, owner_id, title, payload)
      values (gen_random_uuid(), current_setting('saathi.test_user_a')::uuid, 'Forbidden anonymous insert', '{}'::jsonb);
    raise exception 'FAIL: anonymous client has INSERT permission.';
  exception when insufficient_privilege then null;
  end;
  raise notice 'PASS: anonymous reads/writes denied; no owner data disclosed or changed.';
end;
$anonymous$;

reset role;
do $final_integrity$
begin
  if not exists (
    select 1 from public.saathi_missions
    where id = current_setting('saathi.test_mission_id')::uuid
      and owner_id = current_setting('saathi.test_user_a')::uuid
      and revision = 3 and deleted_at is not null
      and payload ->> 'goal' = 'Owner update accepted'
  ) then raise exception 'FAIL: fixture integrity changed during isolation checks.'; end if;
  raise notice 'PASS: final owner/revision/payload unchanged. Rolling back every fixture.';
end;
$final_integrity$;

rollback;
