// Display helpers. Keep every code-to-label mapping here so a vocabulary
// change is one edit, not a grep.

// Must match sample_species_check in 0005_vocabulary.sql.
export const SPECIES = {
  cc: 'Loggerhead',
  cm: 'Green',
  dc: 'Leatherback',
  ei: 'Hawksbill',
  lk: "Kemp's ridley",
  u:  'Unknown',
};

export const SEX = { f: 'Female', m: 'Male', u: 'Unknown' };

export const species = (code) => SPECIES[code] ?? code ?? '—';
export const sex = (code) => SEX[code] ?? code ?? '—';

export const date = (iso) => iso
  ? new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { dateStyle: 'medium' })
  : '—';

export const stamp = (iso) => iso
  ? new Date(iso).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
  : '—';

export const num = (v, digits = 1) =>
  (v === null || v === undefined || v === '') ? '—' : Number(v).toFixed(digits);

export const blank = (v) => (v === null || v === undefined || v === '') ? '—' : v;
