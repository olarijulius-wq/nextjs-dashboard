alter table public.workspace_invites
  add column if not exists status text;

update public.workspace_invites
set status = case
  when accepted_at is not null then 'accepted'
  when expires_at <= now() then 'expired'
  else 'pending'
end
where status is null;

update public.workspace_invites
set status = 'accepted'
where accepted_at is not null
  and status <> 'accepted';

alter table public.workspace_invites
  alter column status set default 'pending';

alter table public.workspace_invites
  alter column status set not null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'workspace_invites_status_check'
      and conrelid = 'public.workspace_invites'::regclass
  ) then
    alter table public.workspace_invites
      add constraint workspace_invites_status_check
      check (status in ('pending', 'accepted', 'expired', 'canceled'));
  end if;
end $$;

create index if not exists idx_workspace_invites_status
  on public.workspace_invites (status);
