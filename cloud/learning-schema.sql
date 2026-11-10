-- SAATHI Learning Ledger, Release 1.5.
-- Run after schema.sql in the configured Supabase SQL Editor.
-- Learning signals are append-only, owner-scoped events. Memory candidates are
-- derived and reviewed by the application; this table never stores model state.
begin;

do $guard$
begin
  if to_regclass('public.saathi_learning_events') is not null
    and obj_description(to_regclass('public.saathi_learning_events'), 'pg_class')
      is distinct from 'SAATHI append-only learning events; schema version 1'
  then
    raise exception 'public.saathi_learning_events already exists with an unknown schema. Review it before applying a migration.';
  end if;
end;
$guard$;

create table if not exists public.saathi_learning_events (
  id uuid not null,
  owner_id uuid not null,
  mission_id uuid not null,
  event_type text not null default 'learning_signal',
  payload jsonb not null,
  created_at timestamptz not null default now(),
  constraint saathi_learning_events_pkey primary key (id),
  constraint saathi_learning_events_owner_fkey foreign key (owner_id)
    references auth.users (id) on delete cascade,
  constraint saathi_learning_events_type_check check (event_type = 'learning_signal'),
  constraint saathi_learning_events_payload_size_check check (
    octet_length(payload::text) <= 524288
  ),
  constraint saathi_learning_events_payload_envelope_check check (
    jsonb_typeof(payload) = 'object'
    and payload ?& array[
      'schema', 'version', 'id', 'missionId', 'createdAt', 'outcome', 'rating',
      'reflection', 'corrections', 'preferences', 'tags', 'reusable',
      'allowLearning', 'sensitiveSource'
    ]
    and payload ->> 'schema' = 'saathi.learning-signal'
    and payload ->> 'version' = '1'
    and jsonb_typeof(payload -> 'id') = 'string'
    and jsonb_typeof(payload -> 'missionId') = 'string'
    and payload ->> 'id' = id::text
    and payload ->> 'missionId' = mission_id::text
    and jsonb_typeof(payload -> 'corrections') = 'array'
    and jsonb_typeof(payload -> 'preferences') = 'array'
    and jsonb_typeof(payload -> 'tags') = 'array'
    and jsonb_typeof(payload -> 'reusable') = 'boolean'
    and jsonb_typeof(payload -> 'allowLearning') = 'boolean'
    and jsonb_typeof(payload -> 'sensitiveSource') = 'boolean'
  )
);

comment on table public.saathi_learning_events is
  'SAATHI append-only learning events; schema version 1';
comment on column public.saathi_learning_events.payload is
  'Validated saathi.learning-signal JSON. Application code derives reviewable memory candidates from it.';
comment on column public.saathi_learning_events.created_at is
  'Authoritative server append time; payload.createdAt is the client event time.';

do $shape$
declare
  relation regclass := 'public.saathi_learning_events'::regclass;
begin
  if exists (
    with expected(column_name, type_name, required) as (
      values
        ('id', 'uuid', true), ('owner_id', 'uuid', true),
        ('mission_id', 'uuid', true), ('event_type', 'text', true),
        ('payload', 'jsonb', true), ('created_at', 'timestamp with time zone', true)
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
    raise exception 'SAATHI learning event columns differ from schema version 1. Apply a reviewed migration instead.';
  end if;

  if exists (
    select 1 from unnest(array[
      'saathi_learning_events_pkey', 'saathi_learning_events_owner_fkey',
      'saathi_learning_events_type_check', 'saathi_learning_events_payload_size_check',
      'saathi_learning_events_payload_envelope_check'
    ]) as expected(name)
    where not exists (
      select 1 from pg_constraint where conrelid = relation and conname = expected.name
        and convalidated
    )
  ) then
    raise exception 'SAATHI learning event constraints differ from schema version 1. Apply a reviewed migration instead.';
  end if;

  if exists (
    select 1 from pg_policy where polrelid = relation and polname not in (
      'saathi_learning_events_select_own', 'saathi_learning_events_insert_own'
    )
  ) then
    raise exception 'Unexpected SAATHI learning event RLS policies exist. Review them rather than combining permissive policies.';
  end if;
end;
$shape$;

create or replace function public.saathi_guard_learning_event_write()
returns trigger
language plpgsql
set search_path = ''
as $write$
begin
  if tg_op <> 'INSERT' then
    raise exception using errcode = '42501', message = 'SAATHI learning events are append-only.';
  end if;
  new.created_at := now();
  return new;
end;
$write$;

revoke all on function public.saathi_guard_learning_event_write() from public, anon, authenticated;
drop trigger if exists saathi_learning_events_append_only on public.saathi_learning_events;
create trigger saathi_learning_events_append_only
  before insert or update or delete on public.saathi_learning_events
  for each row execute function public.saathi_guard_learning_event_write();

create index if not exists saathi_learning_events_owner_created_idx
  on public.saathi_learning_events (owner_id, created_at, id);

alter table public.saathi_learning_events enable row level security;
alter table public.saathi_learning_events force row level security;
revoke all on table public.saathi_learning_events from public, anon, authenticated;
grant select, insert on table public.saathi_learning_events to authenticated;

drop policy if exists saathi_learning_events_select_own on public.saathi_learning_events;
create policy saathi_learning_events_select_own on public.saathi_learning_events
  for select to authenticated
  using ((select auth.uid()) = owner_id);

drop policy if exists saathi_learning_events_insert_own on public.saathi_learning_events;
create policy saathi_learning_events_insert_own on public.saathi_learning_events
  for insert to authenticated
  with check ((select auth.uid()) = owner_id);

do $realtime$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'supabase_realtime is absent; learning event setup continues without replication.';
    return;
  end if;
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime' and puballtables)
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public'
        and tablename = 'saathi_learning_events'
    )
  then
    alter publication supabase_realtime add table public.saathi_learning_events;
  end if;
end;
$realtime$;

commit;
