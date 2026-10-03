# Migration report

Evidence that the Postgres database holds what MySQL held. Written during
Sprint 1–2, kept as the record.

## Row counts

Postgres column: paste from the check query at the bottom of `load.sql`.

| Table | MySQL | Postgres | Match |
| --- | --- | --- | --- |
| sample | 1234 | | |
| note | 376 | | |
| alt_id | 194 | | |
| age_reading | 0 | | |
| extra_sample | 1444 | | |
| consensus_image | 81 | | |
| audit_log | 0 | | |

## Spot checks

Ten records compared field by field. Record which, and by whom.

| STSSN | Checked by | Date | Result |
| --- | --- | --- | --- |
| __STSSN__ | __NAME__ | __DATE__ | |

## Known data problems carried over

- Species casing mixed (`Cc`/`CC`, `CM`, `Ei`, `LK`) — lowercased on load;
  0005 adds a check constraint. Loaded: lk 837, cc 282, ei 86, cm 29.
- Sex used `''`, `u` and `U` for unknown — all set to `u`.
- 5 samples had strand date `0000-00-00` and load with no date:
  CTH1930624-05, EBB20140015-01, KXO20107001-01, MMSC040911-04, SJD20110585-01.
  Real dates needed from the lab.
- No duplicate STSSNs in this dump (checked case-insensitively).
- `note.date` was `0000-00-00` on every row — loaded as NULL.

## Sequences

After any bulk load, identity sequences must be re-set or the first insert from
the UI collides. Confirm per table with an identity column:

```sql
select setval(pg_get_serial_sequence('note', 'note_id'),
              coalesce((select max(note_id) from note), 1));
```

| Table | setval run | By | Date |
| --- | --- | --- | --- |
| note | | | |
| alt_id | | | |
| extra_sample | | | |
| consensus_image | | | |
| audit_log | | | |
