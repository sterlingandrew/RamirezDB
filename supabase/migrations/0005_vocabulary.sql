-- 0005 — controlled vocabulary for species and sex.
--
-- The MySQL data mixed casings for the same species ('Cc' and 'CC') and used
-- '', 'u' and 'U' for unknown sex. That is how a filter silently misses rows.
-- These constraints make it impossible from here on.
--
-- Normalizes first, so this is safe whether data is loaded before or after.

update sample set species = lower(species) where species <> lower(species);
update sample set sex = 'u' where sex is null or sex in ('', 'U');
update sample set sex = lower(sex) where sex <> lower(sex);

alter table sample add constraint sample_species_check
  check (species in ('cc', 'cm', 'dc', 'ei', 'lk', 'u'));
alter table sample add constraint sample_sex_check
  check (sex in ('f', 'm', 'u'));
