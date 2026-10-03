-- 0004 — audit trail.
--
-- The client never writes audit_log (its insert policy is `with check (false)`).
-- This trigger does, as security definer, so history cannot be forged or
-- skipped by a client that simply doesn't call it.

create or replace function log_sample_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into audit_log (modified_at, operation, old_value, new_value,
                         related_stssn, modified_by)
  values (
    now(),
    tg_op,
    coalesce(to_jsonb(old)::text, ''),
    coalesce(to_jsonb(new)::text, ''),
    coalesce(new.stssn, old.stssn),
    auth.uid()
  );
  return coalesce(new, old);
end;
$$;

create trigger sample_audit
  after insert or update or delete on sample
  for each row execute function log_sample_change();

create trigger age_reading_audit
  after insert or update or delete on age_reading
  for each row execute function log_sample_change();

create trigger extra_sample_audit
  after insert or update or delete on extra_sample
  for each row execute function log_sample_change();
