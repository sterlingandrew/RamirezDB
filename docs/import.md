# Importing samples from a spreadsheet

The **Import** page (`import.html`, personnel and admins only) adds up to 1000
samples at a time from a CSV file. Each import saves every row or none of them,
and is recorded as one numbered **batch**, so a bad import can be found and
removed as a unit.

## Steps

1. Start from [`assets/import-template.csv`](../assets/import-template.csv) (the
   **template** link on the Import page), or use your own sheet if its headers
   appear in the table below. Columns the importer doesn't read are listed as
   "Not imported", with the reason.
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

## The template

`assets/import-template.csv` is the lab's standard format from now on. Its
headers follow the lab's inventory sheets (`stssn.id`, `strand.SCL`,
`humerus sampled`), so a sheet in that style keeps its names. Rules:

- **One header row**, then one row per turtle. Title or banner rows above the
  headers are skipped, but nothing may sit between the headers and the data.
- **One sheet per file.** Save each Excel tab separately as CSV UTF-8.
- **`stssn.id` holds only the STSSN**: initials + date + sequence, e.g.
  `ABC20240612-01`. No sides (`… right`, `-01R`), no `-restained`, no
  `(BJD)` prefixes, no `?`. A side goes in `humerus sampled`. Anything else
  goes in a note (once notes are importable) or your import log.
- **Stranding-network IDs are not STSSNs.** `VAQS` + year + number, `ST` + year + `-` +
  number, `14-` + number etc. are stored as alternate IDs of the turtle's STSSN.
  The dry run names the STSSN when the network ID is already known.
- **Always fill `species`**, even on a single-species sheet: a file without
  the column is refused, and a blank cell saves the turtle as `u` (unknown).
- **`strand.date` is a full date** (`6/12/2024` or `2024-06-12`). Leave it
  blank if the day is unknown: the database can't store a year and month on
  their own, so `strand.year` / `strand.mo` are not imported.
- **`state` is the two-letter code.** `FL(FG)` / `FL(FA)` are accepted and
  saved as `FL`, with a warning, because the database has no coast column.
- **Unknown is `u`** for species and sex (`unknown` is also accepted). Use
  `unknown` in `humerus sampled`.

## Automatic fixes

The page repairs common problems itself and shows every repair in green in
the preview, with a list under **Automatic fixes**. Nothing is fixed silently.

STSSN repairs come from the lab's ID tool (`IDdaterV2.py`, A. Horstkamp, 2024):

| In the file | Saved as | Fix |
| --- | --- | --- |
| `ABC990612-01` | `ABC19990612-01` | Two-digit year expanded: 0–2 → 20xx, 3–9 → 19xx |
| `ABC240103_01` | `ABC20240103-01` | Underscores → dashes |
| `abc 240103-01` | `ABC20240103-01` | Spaces removed, initials uppercased |
| `*ABC-SPECIAL-01` | `ABC-SPECIAL-01` | A leading `*` means "keep exactly as written" |

Differences from the Python tool, all on the safe side:

- A year is only expanded when the ID has exactly a six-digit date and the
  result is a real date. (The script inserted `20`/`19` by position, so an ID
  that already had a four-digit year became `ABC2020240612-01`.)
- Spaces are only removed when that leaves a well-formed STSSN. (The script
  turned `ABC20010518 RIGHT` into `ABC20010518RIGHT`.) Otherwise the space is
  reported as an error.
- A `*` ID still can't contain spaces, brackets or `?`, but the format,
  suffix and network-ID checks become warnings for it.

Other fixes:

- **Strand date from the STSSN.** With "Fill blank strand dates from the
  STSSN" ticked (the default), a blank `strand.date` is filled from the date
  in the ID (`ABC20240612-01` → 2024-06-12). A filled-in date that disagrees
  with the ID is always a warning. Untick it when updating existing samples
  if the stored dates should be left alone.
- Species and sex names become codes (`Kemp's ridley` → `lk`, `Female` → `f`).
- State is uppercased; `FL(FG)` / `FL(FA)` become `FL` (warning).
- Dates in `6/12/2024` form become `2024-06-12`.

## Columns

Headers are matched ignoring case, spaces and punctuation, so `strand.SCL`,
`SCL (cm)` and `scl_cm` all work. `stssn.id` and `species` are required columns.

| Template header | Also accepted | Database column | Rules |
| --- | --- | --- | --- |
| stssn.id | STSSN, STSSN number, Field ID | `stssn` | Required, at most 25 characters, unique in the file, no spaces, brackets, `?` or side suffixes. Network IDs (VAQS…, ST2015-…) are refused. Warning for `XXX` initials or an unusual shape |
| species | Sp, Species code | `species` | Required column. `cc`, `cm`, `dc`, `ei`, `lk`, `u`, or the common name (Loggerhead, Green, Leatherback, Hawksbill, Kemp's ridley, Unknown). Any case. Blank cell = `u`, with a warning |
| sex | Gender | `sex` | `f`, `m`, `u`, or Female / Male / Unknown. Any case. Blank = `u` |
| strand.date | Strand date, Date, Date stranded, Stranding date | `strand_date` | `2024-06-12` or `6/12/2024` (month/day/year, four-digit year). Not in the future, not before 1950. Blank is allowed, with a warning |
| state | Strand state, St | `state` | Two-letter code, e.g. `FL`. Any case. `FL(FG)` saved as `FL` with a warning |
| strand.SCL | SCL, SCL (cm), SCL NT, Straight carapace length | `strand_scl` | Number in cm, 2–250 |
| strand.CCL | CCL, CCL (cm), CCL NT, Curved carapace length | `strand_ccl` | Number in cm, 2–250 |
| strand.SCW | SCW, SCW (cm), Straight carapace width | `strand_scw` | Number in cm, 1–200 |
| decomposition | Decomp, Decomposition code, Condition, Condition code | `decomposition` | Whole number, 0–5 (**lab to confirm**) |
| collaborator | Collaborators, Collector | `collaborator` | Text, at most 255 characters. Commas are fine |
| gamm.id | GAMM ID, GAMM, GAMM number | `gamm_id` | Text |
| humerus sampled | Processed bone, Bone processed, Humerus side, Side | `processed_bone` | `left`, `right`, `left & right` or `unknown` |
| rings.consensus | Rings, Rings (consensus), Consensus rings, LAGs | `rings_consensus` | Whole number, 0–150 (**lab to confirm**) |
| annulus.consensus | Annulus, Annulus (consensus), Consensus annulus | `annulus_consensus` | Number, 0–100 (**lab to confirm units**) |
| humerus.diameter | Humerus diameter, Humerus diam, HD | `humerus_diameter` | Number, 0–200 (**lab to confirm units**) |

To accept another header, add it to `ALIASES` in `js/import-rules.js` and to
this table. The ranges are in `RANGES` in the same file.

### Columns from the lab's sheets that are not imported

These are recognised and listed as "Not imported", with the reason, so nobody
assumes they were saved. Keep them in your sheet if useful; they are skipped.

| Lab header | Why not | Where it lives |
| --- | --- | --- |
| bone.id | Lab bone number | No database column (ask if it should have one) |
| other.id | Alternate IDs are a separate table | `alt_id`, child-table import (Day 6) |
| strand.year, strand.mo | Not a full date | Use `strand.date` |
| bone ends, skeleto section, SIA section, muscle, epidermis, barnacle, other (specify) | Sample locations are a separate table, one row per sample type | `extra_sample`, child-table import (Day 6) |
| notes | Notes are a separate table | `note`, not yet importable |
| entered by, initial entry date, modified on | Recorded automatically | Audit log: who imported, and when |
| consensus image found | Images are linked as files | `consensus_image` (Day 5) |

## What the LK inventory showed (2026-11-14)

`LK_Inventory.xlsx` (Kemp's ridley, 806 rows) was run through these checks as
an example of the backlog:

- **636 of its 804 IDs are already in the database**, all as `lk`, and its
  location columns are already in `extra_sample`. The sheet is mostly an
  inventory of samples the database has, not new samples. Re-importing it
  with **Update existing samples** would overwrite `sex`, `state`,
  `strand.SCL` and `humerus sampled` with the sheet's values: only do that
  if the sheet is known to be the more correct copy.
- **130 rows use a network ID** (VAQS…, ST2015-…, VASC…, DMF…) in `stssn.id`.
  Most are already alternate IDs of an STSSN in the database.
- **13 IDs carry suffixes or notes** (a side after the ID, `-restained`,
  initials in brackets, a bare date with a `?`, `unnamed?`) and must be cleaned by hand.
- **2 network IDs appear twice.**
- **No species column** and **no full strand date** (613 of 806 have month
  `0`). Both must be added for any genuinely new turtle.
- 66 Florida rows use `FL(FG)` / `FL(FA)`; 15 IDs start `XXX`.

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
