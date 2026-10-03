-- 0003 — Row Level Security on the data tables.
--
-- This file is the entire security boundary of the application. There is no
-- server of ours between the browser and Postgres: the anon key is public, so
-- anything these policies permit, the internet can do.
--
-- Rules followed here:
--   * RLS is enabled on every table, with no exceptions.
--   * Four separate policies per table — select, insert, update, delete.
--     Never a single "for all" policy; you cannot read one and know what it
--     allows.
--   * Nothing is granted to anon. The public tier, when it exists, is served
--     by a specific view or rpc, not by opening a table.
--   * Every policy lives in this repo. A policy clicked into the dashboard is
--     invisible in review and lost on a rebuild.
--
-- The shape, per ADR-001 and the role matrix in docs/roles.md:
--   select  -> any authenticated member
--   insert  -> personnel, admin
--   update  -> personnel, admin
--   delete  -> admin only
--
-- OPEN (ADR-001 question 2): may the `user` role see strand locations for
-- protected species? These policies assume yes. If the lab says no, change
-- sample_select before loading real data.

do $$
declare t text;
begin
  foreach t in array array['sample', 'note', 'alt_id', 'age_reading',
                           'extra_sample', 'consensus_image', 'audit_log']
  loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- sample
create policy sample_select on sample for select to authenticated using (true);
create policy sample_insert on sample for insert to authenticated with check (can_write());
create policy sample_update on sample for update to authenticated using (can_write()) with check (can_write());
create policy sample_delete on sample for delete to authenticated using (is_admin());

-- note
create policy note_select on note for select to authenticated using (true);
create policy note_insert on note for insert to authenticated with check (can_write());
create policy note_update on note for update to authenticated using (can_write()) with check (can_write());
create policy note_delete on note for delete to authenticated using (is_admin());

-- alt_id
create policy alt_id_select on alt_id for select to authenticated using (true);
create policy alt_id_insert on alt_id for insert to authenticated with check (can_write());
create policy alt_id_update on alt_id for update to authenticated using (can_write()) with check (can_write());
create policy alt_id_delete on alt_id for delete to authenticated using (is_admin());

-- age_reading
create policy age_reading_select on age_reading for select to authenticated using (true);
create policy age_reading_insert on age_reading for insert to authenticated with check (can_write());
create policy age_reading_update on age_reading for update to authenticated using (can_write()) with check (can_write());
create policy age_reading_delete on age_reading for delete to authenticated using (is_admin());

-- extra_sample
create policy extra_sample_select on extra_sample for select to authenticated using (true);
create policy extra_sample_insert on extra_sample for insert to authenticated with check (can_write());
create policy extra_sample_update on extra_sample for update to authenticated using (can_write()) with check (can_write());
create policy extra_sample_delete on extra_sample for delete to authenticated using (is_admin());

-- consensus_image
create policy consensus_image_select on consensus_image for select to authenticated using (true);
create policy consensus_image_insert on consensus_image for insert to authenticated with check (can_write());
create policy consensus_image_update on consensus_image for update to authenticated using (can_write()) with check (can_write());
create policy consensus_image_delete on consensus_image for delete to authenticated using (is_admin());

-- audit_log — append-only history. Written by trigger (0004), never edited.
create policy audit_log_select on audit_log for select to authenticated using (is_admin());
create policy audit_log_insert on audit_log for insert to authenticated with check (false);
-- No update or delete policy, deliberately: with RLS on and no policy, the
-- operation is denied. An audit log you can rewrite is not an audit log.
