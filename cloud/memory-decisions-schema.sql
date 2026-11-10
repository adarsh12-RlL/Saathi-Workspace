-- SAATHI Memory Review, schema version 1.
-- Apply after schema.sql and learning-schema.sql. Source signals are immutable;
-- only explicit review decisions change the memory projection.
begin;

do $guard$
begin
  if to_regclass('public.saathi_learning_events') is null
    or obj_description(to_regclass('public.saathi_learning_events'), 'pg_class')
      is distinct from 'SAATHI append-only learning events; schema version 1'
  then
    raise exception 'Apply the reviewed SAATHI learning-schema.sql before memory-decisions-schema.sql.';
  end if;
  if to_regclass('public.saathi_memory_decisions') is not null
    and obj_description(to_regclass('public.saathi_memory_decisions'), 'pg_class')
      is distinct from 'SAATHI append-only memory decisions; schema version 1'
  then
    raise exception 'public.saathi_memory_decisions already exists with an unknown schema. Review it before applying a migration.';
  end if;
end;
$guard$;

-- The reference includes owner and mission. Knowing another signal UUID never
-- permits attaching a decision to another account's evidence.
create unique index if not exists saathi_learning_events_owner_identity_idx
  on public.saathi_learning_events (owner_id, id, mission_id);

create table if not exists public.saathi_memory_decisions (
  id uuid not null,
  owner_id uuid not null,
  signal_id uuid not null,
  candidate_id uuid not null,
  mission_id uuid not null,
  action text not null,
  payload jsonb not null,
  created_at timestamptz not null default now(),
  constraint saathi_memory_decisions_pkey primary key (id),
  constraint saathi_memory_decisions_owner_fkey foreign key (owner_id)
    references auth.users (id) on delete cascade,
  constraint saathi_memory_decisions_source_fkey foreign key (owner_id, signal_id, mission_id)
    references public.saathi_learning_events (owner_id, id, mission_id),
  constraint saathi_memory_decisions_action_check check (action in ('accept', 'edit', 'reject', 'forget')),
  constraint saathi_memory_decisions_uuid_check check (
    id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and signal_id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and candidate_id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    and mission_id::text ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
  ),
  constraint saathi_memory_decisions_payload_size_check check (octet_length(payload::text) <= 8192),
  constraint saathi_memory_decisions_payload_envelope_check check (
    jsonb_typeof(payload) = 'object'
    and payload ?& array['schema', 'version', 'id', 'signalId', 'candidateId', 'missionId', 'action', 'statement', 'createdAt']
    and (payload - array['schema', 'version', 'id', 'signalId', 'candidateId', 'missionId', 'action', 'statement', 'createdAt']) = '{}'::jsonb
    and jsonb_typeof(payload -> 'schema') = 'string' and payload ->> 'schema' = 'saathi.memory-decision'
    and jsonb_typeof(payload -> 'version') = 'number' and payload ->> 'version' = '1'
    and jsonb_typeof(payload -> 'id') = 'string' and payload ->> 'id' = id::text
    and jsonb_typeof(payload -> 'signalId') = 'string' and payload ->> 'signalId' = signal_id::text
    and jsonb_typeof(payload -> 'candidateId') = 'string' and payload ->> 'candidateId' = candidate_id::text
    and jsonb_typeof(payload -> 'missionId') = 'string' and payload ->> 'missionId' = mission_id::text
    and jsonb_typeof(payload -> 'action') = 'string' and payload ->> 'action' = action
    and jsonb_typeof(payload -> 'createdAt') = 'string'
    and length(payload ->> 'createdAt') <= 50
    and payload ->> 'createdAt' ~ '^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,6})?(Z|[+-]\d{2}:\d{2})$'
    and isfinite((payload ->> 'createdAt')::timestamptz)
    and case when action = 'edit' then
      jsonb_typeof(payload -> 'statement') = 'string'
      and length(payload ->> 'statement') between 1 and 1000
      and length(btrim(payload ->> 'statement')) > 0
    else payload -> 'statement' = 'null'::jsonb end
  )
);

comment on table public.saathi_memory_decisions is
  'SAATHI append-only memory decisions; schema version 1';
comment on column public.saathi_memory_decisions.payload is
  'Explicit saathi.memory-decision JSON. The deterministic projection permanently excludes forgotten candidates from personal memory.';
comment on column public.saathi_memory_decisions.created_at is
  'Authoritative server append time. Replay uses this time, then id; the client payload timestamp cannot select a winner.';

do $shape$
declare
  relation regclass := 'public.saathi_memory_decisions'::regclass;
begin
  if exists (
    with expected(column_name, type_name, required) as (
      values ('id', 'uuid', true), ('owner_id', 'uuid', true),
        ('signal_id', 'uuid', true), ('candidate_id', 'uuid', true),
        ('mission_id', 'uuid', true), ('action', 'text', true),
        ('payload', 'jsonb', true), ('created_at', 'timestamp with time zone', true)
    ), actual as (
      select attname::text as column_name, format_type(atttypid, atttypmod) as type_name, attnotnull as required
      from pg_attribute where attrelid = relation and attnum > 0 and not attisdropped
    )
    select 1 from expected full outer join actual using (column_name)
    where expected.column_name is null or actual.column_name is null
      or expected.type_name is distinct from actual.type_name
      or expected.required is distinct from actual.required
  ) then
    raise exception 'SAATHI memory decision columns differ from schema version 1. Apply a reviewed migration instead.';
  end if;
  if exists (
    select 1 from unnest(array[
      'saathi_memory_decisions_pkey', 'saathi_memory_decisions_owner_fkey',
      'saathi_memory_decisions_source_fkey', 'saathi_memory_decisions_action_check',
      'saathi_memory_decisions_uuid_check', 'saathi_memory_decisions_payload_size_check',
      'saathi_memory_decisions_payload_envelope_check'
    ]) as expected(name)
    where not exists (
      select 1 from pg_constraint where conrelid = relation and conname = expected.name and convalidated
    )
  ) then
    raise exception 'SAATHI memory decision constraints differ from schema version 1. Apply a reviewed migration instead.';
  end if;
  if exists (
    select 1 from pg_policy where polrelid = relation and polname not in (
      'saathi_memory_decisions_select_own', 'saathi_memory_decisions_insert_own'
    )
  ) then
    raise exception 'Unexpected SAATHI memory decision RLS policies exist. Review them before combining permissive policies.';
  end if;
end;
$shape$;

create or replace function public.saathi_guard_memory_decision_write()
returns trigger
language plpgsql
set search_path = ''
as $write$
begin
  if tg_op <> 'INSERT' then
    raise exception using errcode = '42501', message = 'SAATHI memory decisions are append-only.';
  end if;
  if not exists (
    select 1 from public.saathi_learning_events source
    where source.id = new.signal_id and source.owner_id = new.owner_id and source.mission_id = new.mission_id
      and source.payload -> 'allowLearning' = 'true'::jsonb
      and source.payload -> 'sensitiveSource' = 'false'::jsonb
  ) then
    raise exception using errcode = '42501', message = 'Memory decisions require an owned, consented, nonsensitive learning signal.';
  end if;
  new.created_at := clock_timestamp();
  return new;
end;
$write$;

revoke all on function public.saathi_guard_memory_decision_write() from public, anon, authenticated;
drop trigger if exists saathi_memory_decisions_append_only on public.saathi_memory_decisions;
create trigger saathi_memory_decisions_append_only
  before insert or update or delete on public.saathi_memory_decisions
  for each row execute function public.saathi_guard_memory_decision_write();

create index if not exists saathi_memory_decisions_owner_created_idx
  on public.saathi_memory_decisions (owner_id, created_at, id);
create index if not exists saathi_memory_decisions_owner_candidate_idx
  on public.saathi_memory_decisions (owner_id, candidate_id);

alter table public.saathi_memory_decisions enable row level security;
alter table public.saathi_memory_decisions force row level security;
revoke all on table public.saathi_memory_decisions from public, anon, authenticated;
grant select, insert on table public.saathi_memory_decisions to authenticated;

drop policy if exists saathi_memory_decisions_select_own on public.saathi_memory_decisions;
create policy saathi_memory_decisions_select_own on public.saathi_memory_decisions
  for select to authenticated using ((select auth.uid()) = owner_id);

drop policy if exists saathi_memory_decisions_insert_own on public.saathi_memory_decisions;
create policy saathi_memory_decisions_insert_own on public.saathi_memory_decisions
  for insert to authenticated with check (
    (select auth.uid()) = owner_id
    and exists (
      select 1 from public.saathi_learning_events source
      where source.id = signal_id and source.owner_id = saathi_memory_decisions.owner_id
        and source.mission_id = saathi_memory_decisions.mission_id
        and source.payload -> 'allowLearning' = 'true'::jsonb
        and source.payload -> 'sensitiveSource' = 'false'::jsonb
    )
  );

do $realtime$
begin
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    raise notice 'supabase_realtime is absent; memory decision setup continues without replication.';
    return;
  end if;
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime' and puballtables)
    and not exists (
      select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'saathi_memory_decisions'
    )
  then
    alter publication supabase_realtime add table public.saathi_memory_decisions;
  end if;
end;
$realtime$;

commit;
