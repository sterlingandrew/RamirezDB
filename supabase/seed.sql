-- Local development data. Runs on `supabase db reset`, never in production.
-- Fake records in the real format (initials + date + sequence); the ZZZ
-- prefix marks them as test data.

insert into sample (stssn, species, gamm_id, strand_date, sex, state, strand_scl, processed_bone, rings_consensus)
values
  ('ZZZ20240412-01', 'lk', 'A901', '2024-04-12', 'f', 'VA', 34.7, 'left',    6),
  ('ZZZ20240503-01', 'cc', 'A902', '2024-05-03', 'm', 'TX', 58.4, 'unknown', 12),
  ('ZZZ20231127-02', 'cm', null,   '2023-11-27', 'u', 'LA', 44.1, 'right',   null),
  ('ZZZ20220718-01', 'ei', 'A903', '2022-07-18', 'f', 'TX', 29.9, 'unknown', null),
  ('ZZZ20210621-03', 'lk', null,   '2021-06-21', 'u', 'VA', 41.0, 'left',    8)
on conflict (stssn) do nothing;
