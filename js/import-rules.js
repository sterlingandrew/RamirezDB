// CSV import: header mapping and per-cell checks. No DOM and no network, so
// it can be tested on its own. js/pages/import.js does the parsing and UI.
//
// The database re-checks everything that matters (0008_import.sql). These
// checks exist so the lab sees every problem at once, with the cell
// highlighted, instead of one server error at a time.

import { SPECIES, SEX } from './format.js';

// The template's headers, in order. They follow the lab's own inventory
// sheets (LK_Inventory.xlsx: stssn.id, strand.SCL, humerus sampled), so a
// sheet already in that style needs no renaming.
export const COLUMNS = [
  { key: 'stssn',             label: 'stssn.id' },
  { key: 'species',           label: 'species' },
  { key: 'sex',               label: 'sex' },
  { key: 'strand_date',       label: 'strand.date' },
  { key: 'state',             label: 'state' },
  { key: 'strand_scl',        label: 'strand.SCL' },
  { key: 'strand_ccl',        label: 'strand.CCL' },
  { key: 'strand_scw',        label: 'strand.SCW' },
  { key: 'decomposition',     label: 'decomposition' },
  { key: 'collaborator',      label: 'collaborator' },
  { key: 'gamm_id',           label: 'gamm.id' },
  { key: 'processed_bone',    label: 'humerus sampled' },
  { key: 'rings_consensus',   label: 'rings.consensus' },
  { key: 'annulus_consensus', label: 'annulus.consensus' },
  { key: 'humerus_diameter',  label: 'humerus.diameter' },
];

// Header spellings accepted for each column, compared after normalising
// (lowercase, letters and digits only), so "SCL (cm)", "scl_cm" and "SCL cm"
// are all the same. When the lab's own sheet uses a different header, add it
// here and to the table in docs/import.md.
const ALIASES = {
  stssn:             ['stssn', 'stssnid', 'stssnnumber', 'stssnno', 'fieldid'],
  species:           ['species', 'sp', 'speciescode'],
  sex:               ['sex', 'gender'],
  strand_date:       ['stranddate', 'date', 'datestranded', 'strandingdate'],
  state:             ['state', 'strandstate', 'st'],
  strand_scl:        ['strandscl', 'scl', 'sclcm', 'sclnt', 'sclntcm', 'straightcarapacelength',
                      'straightcarapacelengthcm'],
  strand_ccl:        ['strandccl', 'ccl', 'cclcm', 'cclnt', 'cclntcm', 'curvedcarapacelength',
                      'curvedcarapacelengthcm'],
  strand_scw:        ['strandscw', 'scw', 'scwcm', 'straightcarapacewidth', 'straightcarapacewidthcm'],
  decomposition:     ['decomposition', 'decomp', 'decompcode', 'decompositioncode', 'condition',
                      'conditioncode'],
  collaborator:      ['collaborator', 'collaborators', 'collector'],
  gamm_id:           ['gammid', 'gamm', 'gammnumber', 'gammno'],
  processed_bone:    ['processedbone', 'humerussampled', 'boneprocessed', 'humerusside', 'side'],
  rings_consensus:   ['ringsconsensus', 'rings', 'consensusrings', 'lags', 'lagsconsensus'],
  annulus_consensus: ['annulusconsensus', 'annulus', 'consensusannulus'],
  humerus_diameter:  ['humerusdiameter', 'humerusdiam', 'hd', 'humerusdiametermm'],
};

export const normHeader = (h) => String(h ?? '').replace(/^﻿/, '').toLowerCase().replace(/[^a-z0-9]/g, '');

// Columns the lab's inventory sheets have that this importer does not read,
// and where that information lives instead. Listed by name on the page, so
// nobody assumes it was saved.
export const NOT_IMPORTED = {
  boneid:              'lab bone number, no database column',
  otherid:             'alternate IDs (alt_id table), not imported yet',
  strandyear:          'use strand.date (a full date) instead',
  strandmo:            'use strand.date (a full date) instead',
  boneends:            'sample locations (extra_sample table), not imported yet',
  skeletosection:      'sample locations (extra_sample table), not imported yet',
  siasection:          'sample locations (extra_sample table), not imported yet',
  muscle:              'sample locations (extra_sample table), not imported yet',
  epidermis:           'sample locations (extra_sample table), not imported yet',
  barnacle:            'sample locations (extra_sample table), not imported yet',
  otherspecify:        'sample locations (extra_sample table), not imported yet',
  wholebone:           'sample locations (extra_sample table), not imported yet',
  extrawholebone:      'sample locations (extra_sample table), not imported yet',
  notes:               'notes (note table), not imported yet',
  enteredby:           'recorded automatically: the signed-in importer',
  initialentrydate:    'recorded automatically in the audit log',
  modifiedon:          'recorded automatically in the audit log',
  consensusimagefound: 'images are linked separately (Day 5)',
};

const HEADER_TO_KEY = new Map();
for (const [key, list] of Object.entries(ALIASES)) {
  for (const alias of list) HEADER_TO_KEY.set(alias, key);
}
for (const { key, label } of COLUMNS) {
  HEADER_TO_KEY.set(normHeader(key), key);
  HEADER_TO_KEY.set(normHeader(label), key);
}

// Plausible ranges. Out of range is an error, because a value in the wrong
// unit (mm for cm) is the usual cause. Ranges marked CONFIRM are guesses until
// the lab confirms them (docs/import.md).
export const RANGES = {
  strand_scl:        { min: 2,  max: 250, integer: false },  // hatchling to big leatherback
  strand_ccl:        { min: 2,  max: 250, integer: false },
  strand_scw:        { min: 1,  max: 200, integer: false },
  decomposition:     { min: 0,  max: 5,   integer: true  },  // CONFIRM: STSSN condition code
  rings_consensus:   { min: 0,  max: 150, integer: true  },  // CONFIRM
  annulus_consensus: { min: 0,  max: 100, integer: false },  // CONFIRM units
  humerus_diameter:  { min: 0,  max: 200, integer: false },  // CONFIRM units
};

const MAX_LEN = { stssn: 25, collaborator: 255 };

// Network IDs that turn up in the stssn.id column of the lab's sheets but are
// alternate IDs in the database: VAQS / VASC / VDGIF / DMF + year + number,
// ST + year (+ -number), or a bare number. A real STSSN starts with initials.
const ALT_ID_SHAPES = [/^VAQS\d/i, /^VASC\d/i, /^VDGIF\d/i, /^ST\d{4}/i, /^DMF\d/i, /^\d/];
export const MAX_ROWS = 1000; // must match max_rows in import_samples()
const EARLIEST_YEAR = 1950;

// Codes, plus the labels from format.js ("Loggerhead", "kemp's ridley").
const lettersOnly = (s) => s.toLowerCase().replace(/[^a-z]/g, '');
const SPECIES_IN = new Map();
for (const [code, label] of Object.entries(SPECIES)) {
  SPECIES_IN.set(code, code);
  SPECIES_IN.set(lettersOnly(label), code);
}
SPECIES_IN.set('unknown', 'u');
const SEX_IN = new Map();
for (const [code, label] of Object.entries(SEX)) {
  SEX_IN.set(code, code);
  SEX_IN.set(lettersOnly(label), code);
}

// Map the file's headers to columns. Returns
//   { map: [key|null per header], ignored: [header], fatal: [message] }
// Index of the header row: the first of the top 10 rows with an STSSN
// column. Lab sheets often have a title or group banner above the headers.
export function findHeaderRow(table) {
  for (let i = 0; i < Math.min(10, table.length); i++) {
    if (table[i].some((h) => HEADER_TO_KEY.get(normHeader(h)) === 'stssn')) return i;
  }
  return 0;
}

export function mapHeaders(headers) {
  const map = [];
  const ignored = [];
  const fatal = [];
  const firstAt = new Map();
  headers.forEach((h, i) => {
    const key = HEADER_TO_KEY.get(normHeader(h)) ?? null;
    if (key === null) {
      if (normHeader(h) !== '') {
        ignored.push({ header: h, why: NOT_IMPORTED[normHeader(h)] ?? 'not a database column' });
      }
      map.push(null);
      return;
    }
    if (firstAt.has(key)) {
      fatal.push(`Columns "${headers[firstAt.get(key)]}" and "${h}" both mean ${labelOf(key)}. Delete or rename one.`);
      map.push(null);
      return;
    }
    firstAt.set(key, i);
    map.push(key);
  });
  if (!firstAt.has('stssn')) {
    fatal.push('No stssn.id column. The first row must hold the column headers, one of them "stssn.id".');
  }
  // Inventory sheets are one species per file and often leave the column
  // out. Without it every new sample would be saved as unknown species.
  if (firstAt.size && !firstAt.has('species')) {
    fatal.push('No species column. Add a "species" column (e.g. lk on every row of a Kemp\'s ridley sheet).');
  }
  return { map, ignored, fatal };
}

export const labelOf = (key) => COLUMNS.find((c) => c.key === key)?.label ?? key;

// ISO 2024-06-12 or US 6/12/2024 -> '2024-06-12', or an error message.
export function parseDate(raw, today = new Date()) {
  let y, m, d;
  let match = raw.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (match) [, y, m, d] = match.map(Number);
  else if ((match = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/))) [, m, d, y] = match.map(Number);
  else if (/^\d{1,2}\/\d{1,2}\/\d{2}$/.test(raw)) {
    return { error: 'Two-digit year. Use a four-digit year, e.g. 6/12/2024.' };
  } else {
    return { error: 'Not a date. Use 2024-06-12 or 6/12/2024.' };
  }
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) {
    return { error: 'No such date (month/day out of range). Dates are month/day/year.' };
  }
  const todayUtc = Date.UTC(today.getFullYear(), today.getMonth(), today.getDate());
  if (dt.getTime() > todayUtc) return { error: 'Date is in the future.' };
  if (y < EARLIEST_YEAR) return { error: `Date is before ${EARLIEST_YEAR}.` };
  const iso = `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
  return { value: iso };
}

function parseNumber(raw, { min, max, integer }) {
  if (!/^[+-]?(\d+\.?\d*|\.\d+)$/.test(raw)) return { error: 'Not a number.' };
  const n = Number(raw);
  if (integer && !Number.isInteger(n)) return { error: 'Must be a whole number.' };
  if (n < min || n > max) return { error: `Out of range (${min}–${max}). Check the units.` };
  return { value: raw.replace(/^\+/, '') };
}

// Check one cell. Returns { value } with the normalised value ('' = blank,
// not sent), and optionally { error } or { warning }.
export function checkCell(key, rawIn, today) {
  const raw = String(rawIn ?? '').trim();

  if (key === 'stssn') {
    if (!raw) return { value: '', error: 'STSSN is required.' };
    if (raw.length > MAX_LEN.stssn) return { value: raw, error: `Longer than ${MAX_LEN.stssn} characters.` };
    if (/[\s()?]/.test(raw)) {
      return { value: raw, error: 'Spaces, brackets or "?" in the ID. Put only the STSSN here: a side goes in "humerus sampled", anything else in your notes.' };
    }
    if (/(-restained|-?left|-?right|\d[LR])$/i.test(raw)) {
      return { value: raw, error: 'The ID has a suffix (a side or "restained"). Remove it and put the side in "humerus sampled".' };
    }
    if (ALT_ID_SHAPES.some((re) => re.test(raw))) {
      return { value: raw, error: 'This looks like a stranding-network ID (VAQS…, ST2015-…), not an STSSN. Use the turtle\'s STSSN; network IDs are kept as alternate IDs.' };
    }
    if (/^XXX/i.test(raw)) {
      return { value: raw, warning: 'Placeholder initials (XXX). Fine if that is the real STSSN.' };
    }
    if (!/^[A-Za-z]{2,4}\d{8}-\d{2,3}$/.test(raw)) {
      return { value: raw, warning: 'Unusual STSSN format (expected e.g. ABC20240612-01).' };
    }
    return { value: raw };
  }
  if (raw === '') {
    if (key === 'strand_date') return { value: '', warning: 'No strand date.' };
    if (key === 'species') return { value: '', warning: 'No species: a new sample is saved as u (unknown).' };
    return { value: '' };
  }
  if (key === 'species') {
    const code = SPECIES_IN.get(raw.toLowerCase()) ?? SPECIES_IN.get(lettersOnly(raw));
    return code ? { value: code }
      : { value: raw, error: `Unknown species. Use ${Object.keys(SPECIES).join(', ')} or the common name.` };
  }
  if (key === 'sex') {
    const code = SEX_IN.get(raw.toLowerCase()) ?? SEX_IN.get(lettersOnly(raw));
    return code ? { value: code } : { value: raw, error: 'Sex must be f, m or u.' };
  }
  if (key === 'strand_date') {
    const r = parseDate(raw, today);
    return r.error ? { value: raw, error: r.error } : { value: r.value };
  }
  if (key === 'state') {
    const v = raw.toUpperCase();
    // FL(FG) / FL(FA), Florida Gulf or Atlantic coast. There is one state
    // column, so the qualifier is dropped, with a warning.
    const coast = v.match(/^([A-Z]{2})\s*\((.+)\)$/);
    if (coast) return { value: coast[1], warning: `Saved as ${coast[1]}; the "(${coast[2]})" qualifier isn't stored.` };
    return /^[A-Z]{1,2}$/.test(v) ? { value: v } : { value: raw, error: 'Use the two-letter state code, e.g. FL.' };
  }
  if (key in RANGES) {
    const r = parseNumber(raw, RANGES[key]);
    return r.error ? { value: raw, error: r.error } : { value: r.value };
  }
  if (MAX_LEN[key] && raw.length > MAX_LEN[key]) {
    return { value: raw, error: `Longer than ${MAX_LEN[key]} characters.` };
  }
  return { value: raw };
}

// Check every row. `records` are arrays of cells in header order; the first
// data row is spreadsheet row 2. Returns
//   { rows: [{ row, cells: {key: {raw, value, error?, warning?}} }],
//     errorCount, warningCount, fatal: [message] }
export function checkRows(headers, records, today = new Date(), firstRow = 2) {
  const { map, ignored, fatal } = mapHeaders(headers);
  const keys = map.filter(Boolean);
  const rows = [];

  if (!fatal.length) {
    records.forEach((cells, i) => {
      const row = { row: i + firstRow, cells: {} };
      map.forEach((key, c) => {
        if (!key) return;
        const raw = cells[c] ?? '';
        row.cells[key] = { raw: String(raw), ...checkCell(key, raw, today) };
      });
      rows.push(row);
    });

    // Duplicate STSSNs within the file: flag every copy.
    const byId = new Map();
    for (const row of rows) {
      const id = row.cells.stssn?.value;
      if (!id) continue;
      if (!byId.has(id)) byId.set(id, []);
      byId.get(id).push(row);
    }
    for (const [, list] of byId) {
      if (list.length < 2) continue;
      const where = list.map((r) => r.row).join(', ');
      for (const row of list) {
        row.cells.stssn.error = `Duplicate STSSN in this file (rows ${where}).`;
        delete row.cells.stssn.warning;
      }
    }

    if (rows.length === 0) fatal.push('The file has headers but no data rows.');
    if (rows.length > MAX_ROWS) {
      fatal.push(`${rows.length} rows. At most ${MAX_ROWS} per import: split the file into batches.`);
    }
  }

  let errorCount = 0;
  let warningCount = 0;
  for (const row of rows) {
    for (const cell of Object.values(row.cells)) {
      if (cell.error) errorCount++;
      else if (cell.warning) warningCount++;
    }
  }
  // File-level warnings: things missing from every row at once.
  const notices = [];
  if (!fatal.length && !keys.includes('strand_date')) {
    notices.push(keys.length && ignored.some((i) => /^strand\W*(year|mo)/i.test(i.header))
      ? 'No strand.date column: strand.year and strand.mo are not imported, so new samples will have no strand date. Add a strand.date column with full dates where they are known.'
      : 'No strand.date column: new samples will have no strand date.');
  }
  return { keys, ignored, rows, errorCount, warningCount, fatal, notices };
}

// What import_samples() receives: non-blank values only, plus the row number.
// Blank cells are left out, so on an update they never erase stored data, and
// on an insert species and sex fall back to 'u' in the database.
export function toPayload(rows) {
  return rows.map((row) => {
    const out = { _row: row.row };
    for (const [key, cell] of Object.entries(row.cells)) {
      if (cell.value !== '') out[key] = cell.value;
    }
    return out;
  });
}

// The template file's contents: headers only. An example row would get
// imported by someone who forgot to delete it.
export const templateCsv = () => COLUMNS.map((c) => c.label).join(',') + '\r\n';
