# Importing samples from a spreadsheet

The **Import** page (`import.html`, personnel and admins only) adds up to 1000
samples at a time from a CSV file. Each import saves every row or none of them,
and is recorded as one numbered **batch**, so a bad import can be found and
removed as a unit.

## Steps

1. Start from [`assets/import-template.csv`](../assets/import-template.csv) (the
   **template** link on the Import page), or use your own sheet if its headers
   appear in the table below. Columns the importer doesn't recognise are
   listed as "Ignored" and nothing is read from them.
2. In Excel: **File → Save As → CSV UTF-8 (Comma delimited) (\*.csv)**. Plain
   "CSV (Comma delimited)" garbles accented letters (Müller, Peña), and the
   page will refuse it. Save one sheet at a time; a CSV holds only one.
3. On the Import page, choose the file. Every problem is listed and its cell is
   highlighted in red (errors) or yellow (warnings). Nothing is saved yet.
   Fix errors **in the spreadsheet**, save as CSV UTF-8 again and choose it again.
4. Click **Dry run**. The database checks every row (duplicates, existing
   STSSNs, types) and still saves nothing.
5. Click **Import**. The page reports e.g. **"212 added, batch #451"**. Write the
   batch number in your import log (below).

Files over 1000 rows: split them (e.g. rows 2–1001, 1002–2001) and import each
part separately. Each part gets its own batch number.

## Columns

Headers are matched ignoring case, spaces and punctuation, so `SCL (cm)`,
`scl_cm` and `SCL cm` all work. Only **STSSN** is required.

| Template header | Also accepted | Database column | Rules |
| --- | --- | --- | --- |
| STSSN | STSSN ID, STSSN number, Field ID | `stssn` | Required, at most 25 characters, unique in the file. Warning if not shaped like `ABC20240612-01` |
| Species | Sp, Species code | `species` | `cc`, `cm`, `dc`, `ei`, `lk`, `u`, or the common name (Loggerhead, Green, Leatherback, Hawksbill, Kemp's ridley, Unknown). Any case. Blank = `u` |
| Sex | Gender | `sex` | `f`, `m`, `u`, or Female / Male / Unknown. Any case. Blank = `u` |
| Strand date | Date, Date stranded, Stranding date | `strand_date` | `2024-06-12` or `6/12/2024` (month/day/year, four-digit year). Not in the future, not before 1950. Blank is allowed, with a warning |
| State | Strand state, St | `state` | Two-letter code, e.g. `FL`. Any case |
| SCL (cm) | SCL, SCL NT, Straight carapace length | `strand_scl` | Number, 2–250 |
| CCL (cm) | CCL, CCL NT, Curved carapace length | `strand_ccl` | Number, 2–250 |
| SCW (cm) | SCW, Straight carapace width | `strand_scw` | Number, 1–200 |
| Decomposition | Decomp, Decomposition code, Condition, Condition code | `decomposition` | Whole number, 0–5 (**lab to confirm**) |
| Collaborator | Collaborators, Collector | `collaborator` | Text, at most 255 characters. Commas are fine |
| GAMM ID | GAMM, GAMM number | `gamm_id` | Text |
| Processed bone | Bone, Bone processed, Humerus side, Side | `processed_bone` | Text, e.g. `left`, `right`, `left & right`, `unknown` |
| Rings (consensus) | Rings, Consensus rings, LAGs | `rings_consensus` | Whole number, 0–150 (**lab to confirm**) |
| Annulus (consensus) | Annulus, Consensus annulus | `annulus_consensus` | Number, 0–100 (**lab to confirm units**) |
| Humerus diameter | Humerus diam, HD | `humerus_diameter` | Number, 0–200 (**lab to confirm units**) |

To accept another header, add it to `ALIASES` in `js/import-rules.js` and to
this table. The ranges are in `RANGES` in the same file.

Not imported here: notes, alternate IDs, age readings, extra samples and
images. Those are separate tables (child-table import is Day 6).

## Existing samples

By default an STSSN that's already in the database is an **error**, so an
import can never silently overwrite data.

Tick **Update existing samples** to change samples that exist. Only the cells
that are filled in are written; **a blank cell never erases** a stored value.
New STSSNs in the same file are still added. Changing the checkbox means
running the dry run again.

## Keep an import log

One line per import, in the lab's shared drive next to the source sheets:

| Date | Who | File | Rows | Batch # | Notes |
| --- | --- | --- | --- | --- | --- |

## Finding and undoing a batch (admin, SQL editor)

Every row an import touches is in `audit_log` with `change_note` = the batch
number. The batch note itself is in `note` (type `Import batch`).

```sql
-- What did batch 451 do?
select operation, related_stssn, modified_at
  from audit_log where change_note = 451 order by log_id;

-- All batches, newest first
select note_id as batch, date, contents, left_by
  from note where note_type = 'Import batch' order by note_id desc;
```

To remove the samples a batch **added** (only possible while nothing else
refers to them; notes, readings etc. added since must be deleted first):

```sql
begin;
delete from sample
 where stssn in (select related_stssn from audit_log
                  where change_note = 451 and operation = 'INSERT');
-- check the count it reports, then:
commit;   -- or rollback;
```

A batch that **updated** samples can't be undone by deleting. The previous
values are in `audit_log.old_value` (JSON) for each `UPDATE` row of the batch;
restore them by hand or ask the maintainer.

## What the database enforces

`import_samples()` (migration `0008_import.sql`) runs as the signed-in user, so
the normal row-level security decides who may import: a pending account is
refused (42501), dry run included. It re-checks species, sex, types, lengths,
duplicates and existing STSSNs itself, so the browser checks are a convenience,
not the boundary. The numeric ranges are checked only in the browser.
