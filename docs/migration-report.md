# Migration Report

Evidence that the PostgreSQL database holds the expected data from the MySQL migration. Written during Sprint 1–2 and retained as the migration verification record.

## Row Counts

Postgres counts from the verification query after loading `load.sql`.

| Table | MySQL | Postgres | Match |
| --- | ---: | ---: | --- |
| sample | 1234 | 1234 | Yes |
| note | 376 | 376 | Yes |
| alt_id | 194 | 194 | Yes |
| age_reading | 0 | 0 | Yes |
| extra_sample | 1444 | 1444 | Yes |
| consensus_image | 81 | 81 | Yes |
| audit_log | 0 | 2678 | No — expected |


## Spot Checks

Ten records compared field by field. Record which records were checked and by whom.

| STSSN | Checked by | Date | Result |
| --- | --- | --- | --- |
| **\_\_STSSN\_\_** | **\_\_NAME\_\_** | **\_\_DATE\_\_** | |

## Known Data Problems Carried Over

- **Species casing:** Mixed values (`Cc`/`CC`, `CM`, `Ei`, `LK`) were lowercased during loading. Migration `0005` adds a check constraint. Loaded counts: `lk` 837, `cc` 282, `ei` 86, `cm` 29.
- **Unknown sex values:** Values `''`, `u`, and `U` were normalized to `u`.
- **Missing strand dates:** Five samples had strand date `0000-00-00` and were loaded with no date. Real dates are needed from the lab:
  - `CTH1930624-05`
  - `EBB20140015-01`
  - `KXO20107001-01`
  - `MMSC040911-04`
  - `SJD20110585-01`
- **Duplicate STSSNs:** No duplicate STSSNs were found in the MySQL dump when checked case-insensitively.
- **Note dates:** `note.date` was `0000-00-00` on every MySQL row and was loaded as `NULL`.

## Sequences

After any bulk load, identity sequences must be reset to prevent the first UI insert from colliding with an existing ID. Confirm the sequence for each table with an identity column.

Example for `note`:

```sql
SELECT setval(
    pg_get_serial_sequence('note', 'note_id'),
    COALESCE((SELECT MAX(note_id) FROM note), 1)
);
```

| Table | setval run | By | Date |
| --- | --- | --- | --- |
| note | | | |
| alt_id | | | |
| extra_sample | | | |
| consensus_image | | | |
| audit_log | | | |
