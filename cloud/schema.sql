-- SAATHI Release 1: run in the SQL Editor of your configured Supabase project.
-- This creates only SAATHI's mission aggregate; it does not alter Hub tables.
-- Every statement is transactional. Re-running this exact schema is supported.
begin;

-- An existing table without our schema marker requires a deliberate migration.
-- CREATE IF NOT EXISTS must not conceal an unrelated or incompatible table.
do $guard$
begin
  if to_regclass('public.saathi_missions') is not null
    and obj_description(to_regclass('public.saathi_missions'), 'pg_class')
      is distinct from 'SAATHI mission aggregate; schema version 1'
  then
    raise exception 'public.saathi_missions already exists with an unknown schema. Review it before applying a migration.';
  end if;
end;
$guard$;

create table if not exists public.saathi_missions (
  id uuid not null,
  owner_id uuid not null,
  revision bigint not null default 1,
  title text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint saathi_missions_pkey primary key (id),
  constraint saathi_missions_owner_fkey foreign key (owner_id)
    references auth.users (id) on delete cascade,
  constraint saathi_missions_revision_check check (
    revision between 1 and 9007199254740991
  ),
  constraint saathi_missions_title_check check (
    char_length(title) between 1 and 120 and char_length(btrim(title)) > 0
  ),
  -- Size the uncompressed JSON representation, rather than its compressed storage.
  constraint saathi_missions_payload_size_check check (
    octet_length(payload::text) <= 10485760
  ),
  constraint saathi_missions_payload_envelope_check check (
    jsonb_typeof(payload) = 'object'
    and payload ?& array[
      'id', 'title', 'goal', 'notes', 'nextStep', 'stage', 'tasks',
      'decisions', 'artifacts', 'miniApps', 'updatedAt', 'templateSource'
    ]
    and jsonb_typeof(payload -> 'id') = 'string'
    and payload ->> 'id' = id::text
    and jsonb_typeof(payload -> 'title') = 'string'
    and payload ->> 'title' = title
    and jsonb_typeof(payload -> 'goal') = 'string'
    and char_length(payload ->> 'goal') <= 2000
    and jsonb_typeof(payload -> 'notes') = 'string'
    and char_length(payload ->> 'notes') <= 12000
    and jsonb_typeof(payload -> 'nextStep') = 'string'
    and char_length(payload ->> 'nextStep') <= 400
    and jsonb_typeof(payload -> 'stage') = 'string'
    and payload ->> 'stage' in ('captured', 'planned', 'working', 'complete')
    and jsonb_typeof(payload -> 'updatedAt') = 'string'
    and char_length(payload ->> 'updatedAt') between 1 and 50
    and (
      jsonb_typeof(payload -> 'templateSource') = 'null'
      or (
        jsonb_typeof(payload -> 'templateSource') = 'string'
        and char_length(payload ->> 'templateSource') <= 100
      )
    )
    -- CASE guards avoid calling jsonb_array_length on a malformed value.
    and case when jsonb_typeof(payload -> 'tasks') = 'array'
      then jsonb_array_length(payload -> 'tasks') <= 100 else false end
    and case when jsonb_typeof(payload -> 'decisions') = 'array'
      then jsonb_array_length(payload -> 'decisions') <= 100 else false end
    and case when jsonb_typeof(payload -> 'artifacts') = 'array'
      then jsonb_array_length(payload -> 'artifacts') <= 100 else false end
    and case when jsonb_typeof(payload -> 'miniApps') = 'array'
      then jsonb_array_length(payload -> 'miniApps') <= 10 else false end
  )
);

comment on table public.saathi_missions is 'SAATHI mission aggregate; schema version 1';
comment on column public.saathi_missions.payload is
  'Complete mission snapshot including miniApps. Basic envelope validated in SQL; detailed instance/item contract validated by the client.';
comment on column public.saathi_missions.updated_at is
  'Authoritative server write time. The snapshot updatedAt is a separate client timestamp.';
comment on column public.saathi_missions.deleted_at is
  'Soft-delete tombstone retained in owner SELECT results so other devices can observe deletions.';

-- Refuse marked tables whose columns or baseline constraints have been changed.
-- No existing table is rebuilt, truncated, or automatically migrated here.
do $shape$
declare
  relation regclass := 'public.saathi_missions'::regclass;
begin
  if exists (
    with expected(column_name, type_name, required) as (
      values
        ('id', 'uuid', true), ('owner_id', 'uuid', true),
        ('revision', 'bigint', true), ('title', 'text', true),
        ('payload', 'jsonb', true),
        ('created_at', 'timestamp with time zone', true),
        ('updated_at', 'timestamp with time zone', true),
        ('deleted_at', 'timestamp with time zone', false)
    ), actual as (
      select attname::text as column_name, format_type(atttypid, atttypmod) as type_name,
        attnotnull as required
      from pg_attribute where attrelid = relation and attnum > 0 and not attisdropped
    )
    select 1 from expected full outer join actual using (column_name)
    where expected.column_name is null or actual.column_name is null
      or expected.type_name is distinct from actual.type_name
      or expected.required is distinct from actual.required
  ) then
    raise exception 'SAATHI mission columns differ from schema version 1. Apply a reviewed migration instead.';
  end if;

  if exists (
    select 1 from unnest(array[
      'saathi_missions_pkey', 'saathi_missions_owner_fkey',
      'saathi_missions_revision_check', 'saathi_missions_title_check',
      'saathi_missions_payload_size_check', 'saathi_missions_payload_envelope_check'
    ]) as expected(name)
    where not exists (
      select 1 from pg_constraint where conrelid = relation and conname = expected.name
        and convalidated
    )
  ) then
    raise exception 'SAATHI mission constraints differ from schema version 1. Apply a reviewed migration instead.';
  end if;

  if exists (
    select 1 from pg_policy where polrelid = relation and polname not in (
      'saathi_missions_select_own', 'saathi_missions_insert_own', 'saathi_missions_update_own'
    )
  ) then
    raise exception 'Unexpected SAATHI mission RLS policies exist. Review them rather than combining permissive policies.';
  end if;
end;
$shape$;

create or replace function public.saathi_guard_mission_write()
returns trigger
language plpgsql
set search_path = ''
as $write$
begin
  if tg_op = 'INSERT' then
    if new.revision is distinct from 1::bigint then
      raise exception using errcode = '23514', message = 'A new SAATHI mission must start at revision 1.';
    end if;
    new.created_at := now();
    new.updated_at := new.created_at;
    if new.deleted_at is not null then new.deleted_at := new.created_at; end if;
  else
    if new.id is distinct from old.id or new.owner_id is distinct from old.owner_id
      or new.created_at is distinct from old.created_at
    then
      raise exception using errcode = '23514', message = 'Mission id, owner_id, and created_at are immutable.';
    end if;
    if new.revision is distinct from old.revision + 1 then
      raise exception using errcode = '23514', message = 'Mission updates must increment revision by exactly one.';
    end if;
    new.updated_at := now();
    if new.deleted_at is distinct from old.deleted_at and new.deleted_at is not null then
      new.deleted_at := new.updated_at;
    end if;
  end if;
  return new;
end;
$write$;

revoke all on function public.saathi_guard_mission_write() from public, anon, authenticated;
drop trigger if exists saathi_missions_guard_write on public.saathi_missions;
create trigger saathi_missions_guard_write
  before insert or update on public.saathi_missions
  for each row execute function public.saathi_guard_mission_write();

create index if not exists saathi_missions_owner_updated_idx
  on public.saathi_missions (owner_id, updated_at, id);

alter table public.saathi_missions enable row level security;
alter table public.saathi_missions force row level security;
revoke all on table public.saathi_missions from public, anon, authenticated;
grant select, insert, update on table public.saathi_missions to authenticated;

drop policy if exists saathi_missions_select_own on public.saathi_missions;
create policy saathi_missions_select_own on public.saathi_missions
  for select to authenticated
  using ((select auth.uid()) = owner_id);

drop policy if exists saathi_missions_insert_own on public.saathi_missions;
create policy saathi_missions_insert_own on public.saathi_missions
  for insert to authenticated
  with check ((select auth.uid()) = owner_id);

drop policy if exists saathi_missions_update_own on public.saathi_missions;
create policy saathi_missions_update_own on public.saathi_missions
  for update to authenticated
  using ((select auth.uid()) = owner_id)
  with check ((select auth.uid()) = owner_id);

-- Publish only this supported table; never publish all public tables here.
do $realtime$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'supabase_realtime is absent; table setup continues without replication. Enable it in Supabase and rerun this schema before realtime acceptance.';
    return;
  end if;
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime' and puballtables)
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'saathi_missions'
    )
  then
    alter publication supabase_realtime add table public.saathi_missions;
  end if;
end;
$realtime$;

commit;
