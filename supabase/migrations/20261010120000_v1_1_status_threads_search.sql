-- VibeMail Engine v1.1 (CONTRACT.md §3.4 `status`, §4.8 thread view, §4.9 search, §5.1).
--
-- Every statement is idempotent: re-running this file is a no-op and must exit 0.
--
-- Backward compatible with v1 server code: `status` is derived by a trigger on
-- every insert and every update, so writers that do not know the column keep
-- working, and no writer (not even one that sends `status`) can set it to
-- anything but the §3.4 derivation.

-- ---------------------------------------------------------------------------
-- §3.4 status derivation. The first matching rule wins.
-- ---------------------------------------------------------------------------

create or replace function public.message_status(labels text[])
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when 'TRASH' = any(labels) then 'trash'
    when 'SPAM' = any(labels) then 'spam'
    when 'INBOX' = any(labels) then 'inbox'
    when 'SENT' = any(labels) then 'sent'
    else 'archived'
  end;
$$;

revoke execute on function public.message_status(text[]) from public, anon, authenticated;
grant execute on function public.message_status(text[]) to service_role;

create or replace function public.set_message_status()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.status := public.message_status(coalesce(new.label_ids, '{}'));
  return new;
end;
$$;

-- Trigger-only; nobody calls it directly.
revoke execute on function public.set_message_status() from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- messages.status (§5.1)
-- ---------------------------------------------------------------------------

alter table public.messages add column if not exists status text;

update public.messages
set status = public.message_status(label_ids)
where status is distinct from public.message_status(label_ids);

drop trigger if exists messages_set_status on public.messages;
create trigger messages_set_status
  before insert or update on public.messages
  for each row execute function public.set_message_status();

alter table public.messages alter column status set not null;

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'messages_status_check'
                 and conrelid = 'public.messages'::regclass) then
    alter table public.messages add constraint messages_status_check
      check (status in ('inbox', 'sent', 'archived', 'trash', 'spam'));
  end if;
end;
$$;

-- Thread view (§4.8).
create index if not exists messages_user_id_thread_id_internal_date_idx
  on public.messages (user_id, thread_id, internal_date);

-- ---------------------------------------------------------------------------
-- Search (§4.9). Every term must appear, case-insensitively, in at least one
-- of subject, from_address, any to_address element, snippet or body_plain.
-- `%`, `_` and `\` in terms match literally. Keyset pagination as §4.2.
--
-- Tenant isolation: the function filters on p_user_id, which src/db passes
-- from the verified token (§5.3). Only service_role may execute it.
-- ---------------------------------------------------------------------------

create or replace function public.search_messages(
  p_user_id uuid,
  p_terms text[],
  p_limit integer,
  p_before_date timestamptz default null,
  p_before_gmail_id text default null
)
returns setof public.messages
language sql
stable
set search_path = ''
as $$
  select m.*
  from public.messages m
  where m.user_id = p_user_id
    and (
      p_before_date is null
      or m.internal_date < p_before_date
      or (m.internal_date = p_before_date and m.gmail_id < p_before_gmail_id)
    )
    and not exists (
      select 1
      from unnest(p_terms) as t(term)
      cross join lateral (
        select '%' || replace(replace(replace(t.term, '\', '\\'), '%', '\%'), '_', '\_') || '%' as pattern
      ) as p
      where not (
        coalesce(m.subject, '') ilike p.pattern
        or m.from_address ilike p.pattern
        or m.snippet ilike p.pattern
        or coalesce(m.body_plain, '') ilike p.pattern
        or exists (select 1 from unnest(m.to_address) as a(addr) where a.addr ilike p.pattern)
      )
    )
  order by m.internal_date desc, m.gmail_id desc
  limit p_limit;
$$;

revoke execute on function public.search_messages(uuid, text[], integer, timestamptz, text) from public, anon, authenticated;
grant execute on function public.search_messages(uuid, text[], integer, timestamptz, text) to service_role;
