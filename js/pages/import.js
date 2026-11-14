import Papa from 'https://esm.sh/papaparse@5.4.1';
import { supabase } from '../supabase.js';
import { requireRole } from '../auth.js';
import { renderShell } from '../shell.js';
import { checkRows, toPayload, labelOf, findHeaderRow } from '../import-rules.js';

// Personnel and admin. import_samples() is security invoker, so the insert
// policies decide for real: a pending account is refused by the database even
// if it reaches this page.
const profile = await requireRole(['personnel', 'admin']);
if (profile) {
  renderShell(profile);
  main();
}

// Rows shown in the preview. Rows with problems are always shown.
const PREVIEW_CLEAN_ROWS = 50;

function main() {
  const fileInput = document.getElementById('file');
  const updateBox = document.getElementById('update-existing');
  const dryBtn = document.getElementById('dry-run');
  const commitBtn = document.getElementById('commit');
  const statusEl = document.getElementById('status');
  const resultEl = document.getElementById('result');
  const summaryEl = document.getElementById('summary');
  const fatalEl = document.getElementById('fatal');
  const errorList = document.getElementById('errors');
  const errorSection = document.getElementById('errors-section');
  const previewSection = document.getElementById('preview-section');
  const table = document.getElementById('preview');

  let checked = null;       // result of checkRows for the current file
  let fileName = null;
  let dryRunPassed = false; // a clean dry run for this file + checkbox state

  fileInput.addEventListener('change', () => loadFile(fileInput.files[0]));
  updateBox.addEventListener('change', () => {
    // A dry run without "update existing" says nothing about one with it.
    dryRunPassed = false;
    if (checked) render(checked, []);
  });
  dryBtn.addEventListener('click', () => send(true));
  commitBtn.addEventListener('click', () => send(false));

  async function loadFile(file) {
    reset();
    if (!file) return;
    fileName = file.name;

    const head = new Uint8Array(await file.slice(0, 4).arrayBuffer());
    if (head[0] === 0x50 && head[1] === 0x4b) {
      return showFatal(['This is an Excel workbook, not a CSV. In Excel: File → Save As → "CSV UTF-8 (Comma delimited)".']);
    }

    const text = await file.text();
    if (text.includes('�')) {
      return showFatal(['The file isn\'t UTF-8, so accented letters would be garbled. In Excel: File → Save As → "CSV UTF-8 (Comma delimited)", not plain "CSV".']);
    }

    // A real CSV parser: collaborator names contain commas ("Smith, J.") and
    // Excel quotes those cells. Never split lines on commas by hand.
    const parsed = Papa.parse(text, { skipEmptyLines: 'greedy' });
    const fatal = parsed.errors
      .filter((e) => e.type !== 'Delimiter') // one-column files are fine to report below
      .slice(0, 5)
      .map((e) => `Row ${(e.row ?? 0) + 1}: ${e.message}`);
    if (fatal.length) return showFatal(['The file could not be read as CSV.', ...fatal]);
    if (!parsed.data.length) return showFatal(['The file is empty.']);

    // Rows above the headers (titles, group banners) are skipped. Row numbers
    // stay those of the spreadsheet.
    const h = findHeaderRow(parsed.data);
    const [headers, ...records] = parsed.data.slice(h);
    checked = checkRows(headers, records, new Date(), h + 2);
    if (checked.fatal.length) return showFatal(checked.fatal);
    render(checked, []);
  }

  function reset() {
    checked = null;
    fileName = null;
    dryRunPassed = false;
    fatalEl.hidden = true;
    resultEl.hidden = true;
    errorSection.hidden = true;
    previewSection.hidden = true;
    summaryEl.textContent = '';
    statusEl.textContent = '';
    dryBtn.disabled = true;
    commitBtn.disabled = true;
  }

  function showFatal(messages) {
    fatalEl.replaceChildren(...messages.map((m) => {
      const p = document.createElement('p');
      p.textContent = m;
      return p;
    }));
    fatalEl.hidden = false;
  }

  // serverErrors: [{row, stssn, column, message}] from import_samples().
  function render(result, serverErrors) {
    const { keys, ignored, rows, errorCount, warningCount } = result;
    const byRow = new Map();
    for (const e of serverErrors) {
      if (!byRow.has(e.row)) byRow.set(e.row, []);
      byRow.get(e.row).push(e);
    }

    // Summary line.
    const parts = [`${rows.length} row${rows.length === 1 ? '' : 's'} in ${fileName}.`];
    parts.push(`Columns: ${keys.map(labelOf).join(', ')}.`);
    if (ignored.length) {
      parts.push(`Not imported: ${ignored.map((i) => `"${i.header}" (${i.why})`).join('; ')}.`);
    }
    parts.push(...result.notices);
    summaryEl.textContent = parts.join(' ');

    // Error list: browser checks first, then what the database said.
    const items = [];
    for (const row of rows) {
      for (const [key, cell] of Object.entries(row.cells)) {
        if (cell.error) items.push(['error', row.row, key, cell.raw, cell.error]);
      }
    }
    for (const e of serverErrors) {
      items.push(['error', e.row, e.column ?? null, e.stssn ?? '', e.message]);
    }
    for (const row of rows) {
      for (const [key, cell] of Object.entries(row.cells)) {
        if (!cell.error && cell.warning) items.push(['warning', row.row, key, cell.raw, cell.warning]);
      }
    }
    errorList.replaceChildren(...items.map(([kind, rowNo, key, raw, message]) => {
      const li = document.createElement('li');
      li.className = kind === 'error' ? 'error' : 'warn';
      const where = key ? `Row ${rowNo}, ${labelOf(key)}` : `Row ${rowNo}`;
      li.textContent = `${kind === 'error' ? 'Error' : 'Warning'} · ${where}${raw ? ` ("${raw}")` : ''}: ${message}`;
      return li;
    }));
    const totalErrors = errorCount + serverErrors.length;
    document.getElementById('errors-heading').textContent =
      `${totalErrors} error${totalErrors === 1 ? '' : 's'}, ${warningCount} warning${warningCount === 1 ? '' : 's'}`;
    errorSection.hidden = items.length === 0;

    // Preview table: every row with a problem, plus the first clean ones.
    const thead = document.createElement('tr');
    for (const label of ['Row', ...keys.map(labelOf)]) {
      const th = document.createElement('th');
      th.textContent = label;
      thead.append(th);
    }
    table.tHead.replaceChildren(thead);

    let clean = 0;
    const trs = [];
    for (const row of rows) {
      const rowServer = byRow.get(row.row) ?? [];
      const hasProblem = rowServer.length > 0
        || Object.values(row.cells).some((c) => c.error || c.warning);
      if (!hasProblem && clean++ >= PREVIEW_CLEAN_ROWS) continue;

      const tr = document.createElement('tr');
      const num = document.createElement('td');
      num.textContent = row.row;
      if (rowServer.some((e) => !e.column)) num.className = 'cell-bad';
      tr.append(num);
      for (const key of keys) {
        const cell = row.cells[key];
        const td = document.createElement('td');
        td.textContent = cell.value !== cell.raw.trim() && !cell.error
          ? `${cell.raw} → ${cell.value}` : cell.raw;
        const server = rowServer.find((e) => e.column === key);
        const problem = cell.error || server?.message;
        if (problem) { td.className = 'cell-bad'; td.title = problem; }
        else if (cell.warning) { td.className = 'cell-warn'; td.title = cell.warning; }
        tr.append(td);
      }
      trs.push(tr);
    }
    table.tBodies[0].replaceChildren(...trs);
    const hidden = Math.max(0, clean - PREVIEW_CLEAN_ROWS);
    document.getElementById('preview-note').textContent = hidden
      ? `Showing every row with a problem and the first ${PREVIEW_CLEAN_ROWS} clean rows (${hidden} more clean rows not shown).`
      : 'Showing every row.';
    previewSection.hidden = false;

    dryBtn.disabled = errorCount > 0;
    commitBtn.disabled = !dryRunPassed;
    statusEl.textContent = errorCount > 0
      ? 'Fix the errors in the spreadsheet, save it as CSV UTF-8 again, and choose it again.'
      : dryRunPassed ? 'Dry run passed. Nothing has been saved yet.'
      : 'Checks passed in the browser. Run a dry run to check against the database.';
  }

  async function send(dryRun) {
    if (!checked) return;
    dryBtn.disabled = true;
    commitBtn.disabled = true;
    fileInput.disabled = true;
    updateBox.disabled = true;
    resultEl.hidden = true;
    statusEl.textContent = dryRun ? 'Dry run…' : 'Importing…';

    // The lab's sheets put network IDs (VAQS…) in the STSSN column. Any ID
    // that is already an alternate ID would otherwise import as a duplicate
    // turtle, so it's an error, naming the STSSN to use.
    const altErrors = await findAltIds(checked.rows);
    if (altErrors === null) {
      fileInput.disabled = false;
      updateBox.disabled = false;
      dryBtn.disabled = false;
      statusEl.textContent = 'Could not check alternate IDs. Try again.';
      return;
    }
    if (altErrors.length) {
      fileInput.disabled = false;
      updateBox.disabled = false;
      dryRunPassed = false;
      render(checked, altErrors);
      statusEl.textContent = `${altErrors.length} ID${altErrors.length === 1 ? ' is' : 's are'} an alternate ID of another sample. Nothing was saved.`;
      return;
    }

    const { data, error } = await supabase.rpc('import_samples', {
      rows: toPayload(checked.rows),
      dry_run: dryRun,
      update_existing: updateBox.checked,
      file_name: fileName,
    });

    fileInput.disabled = false;
    updateBox.disabled = false;

    if (error) {
      dryRunPassed = false;
      statusEl.textContent = error.code === '42501'
        ? 'Your account can\'t import samples. Only personnel and admins can; ask an admin to approve your account.'
        : 'The import failed: ' + error.message;
      dryBtn.disabled = false;
      return;
    }

    if (!data.ok) {
      dryRunPassed = false;
      render(checked, data.errors);
      statusEl.textContent = `The database found ${data.errors.length} problem${data.errors.length === 1 ? '' : 's'}. Nothing was saved.`;
      return;
    }

    if (dryRun) {
      dryRunPassed = true;
      render(checked, []);
      showResult(`Dry run passed: ${data.added} would be added, ${data.updated} updated. Nothing has been saved yet.`);
      return;
    }

    // Committed. Lock the page on this file so it can't be sent twice.
    dryRunPassed = false;
    dryBtn.disabled = true;
    commitBtn.disabled = true;
    statusEl.textContent = 'Done. Choose another file to import more.';
    showResult(`${data.added} added${data.updated ? `, ${data.updated} updated` : ''}, batch #${data.batch}. Write the batch number down: it identifies this import if it ever needs undoing.`);
    checked = null;
  }

  // [{row, stssn, column, message}] for IDs in the file that are stored as
  // alternate IDs, or null if the lookup failed. Chunked to keep URLs short.
  async function findAltIds(rows) {
    const rowById = new Map(rows.map((r) => [r.cells.stssn.value, r.row]));
    const ids = [...rowById.keys()];
    const errors = [];
    for (let i = 0; i < ids.length; i += 150) {
      const { data, error } = await supabase
        .from('alt_id')
        .select('other_id, stssn')
        .in('other_id', ids.slice(i, i + 150));
      if (error) return null;
      for (const alt of data) {
        if (alt.other_id === alt.stssn) continue;
        errors.push({
          row: rowById.get(alt.other_id), stssn: alt.other_id, column: 'stssn',
          message: `This is an alternate ID of ${alt.stssn}. Use ${alt.stssn} in stssn.id.`,
        });
      }
    }
    return errors;
  }

  function showResult(text) {
    resultEl.textContent = text;
    resultEl.hidden = false;
  }
}
