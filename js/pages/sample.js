import { supabase } from '../supabase.js';
import { requireRole } from '../auth.js';
import { renderShell } from '../shell.js';
import { species, sex, date, stamp, num, blank } from '../format.js';
import {
  BUCKET, isLink, fileNameOf, objectUrl, readImageFields, addImageLink, copyRowIntoBucket,
} from '../images.js';

// The detail page. Every member reads everything here; personnel and admin add
// and edit child rows; only admins delete. The buttons follow docs/roles.md,
// but they're convenience: the policies in 0003, 0006 and 0009 are what
// actually refuse a write.


const profile = await requireRole();
const id = new URLSearchParams(location.search).get('id');
const statusEl = document.getElementById('status');
const flashEl = document.getElementById('flash');

// requireRole() only lets members through, and every member can write.
const canWrite = ['personnel', 'admin'].includes(profile?.role);
const isAdmin = profile?.role === 'admin';

let sample = null;  // the last load, children included

// ------------------------------------------------------------- child tables
// One spec per child table. The table, the Edit form, the Add form and the
// Delete button are all built from it, so the four sections behave the same.
//
//   key       columns that identify one row (for update/delete .match())
//   fk        the column pointing at sample.stssn
//   columns   what the table shows: [label, row => text, 'num'?]
//   fields    what the forms edit. keepEmpty: '' is a real value, not null.
//   onInsert  extra columns set on insert only (who wrote it, when)
const PROCESSED = { y: 'Yes', n: 'No' };

const CHILDREN = [
  {
    section: 'alt-ids', title: 'Alternate IDs', noun: 'alternate ID',
    table: 'alt_id', rows: (s) => s.alt_id, key: ['alt_id'], fk: 'stssn',
    empty: 'No alternate IDs.',
    columns: [['Other ID', (r) => r.other_id]],
    fields: [{ name: 'other_id', label: 'Other ID', required: true, maxlength: 45 }],
  },
  {
    section: 'readings', title: 'Age readings', noun: 'age reading',
    table: 'age_reading', rows: (s) => s.age_reading, key: ['stssn', 'user_id'], fk: 'stssn',
    empty: 'No age readings.',
    columns: [
      ['Reader', (r) => r.profiles?.full_name || '—'],
      ['Rings', (r) => String(r.rings), 'num'],
      ['Annulus', (r) => num(r.annulus, 2), 'num'],
      ['Note', (r) => noteText(r.note)],
    ],
    fields: [
      { name: 'rings', label: 'Rings', type: 'number', min: 0, step: 1, required: true },
      { name: 'annulus', label: 'Annulus', type: 'number', min: 0, step: 'any', required: true },
    ],
    // One reading per reader per sample (the primary key). A reading is always
    // the signed-in reader's own.
    onInsert: () => ({ user_id: profile.id }),
    addBlocked: (s) => s.age_reading.some((r) => r.user_id === profile.id)
      && 'You already have a reading for this sample. Edit it above.',
  },
  {
    section: 'extras', title: 'Extra samples', noun: 'extra sample',
    table: 'extra_sample', rows: (s) => s.extra_sample, key: ['extra_id'], fk: 'stssn',
    empty: 'No extra samples.',
    columns: [
      ['Type', (r) => r.sample_type],
      ['Location', (r) => r.location],
      ['Side', (r) => blank(r.side)],
      ['Processed', (r) => PROCESSED[r.processed] ?? blank(r.processed)],
    ],
    fields: [
      { name: 'sample_type', label: 'Type', required: true, maxlength: 45,
        suggest: ['bone_ends', 'extra_whole_bone', 'sia_section', 'skeleto_section'] },
      { name: 'location', label: 'Location', required: true, maxlength: 45 },
      { name: 'side', label: 'Side', maxlength: 45, suggest: ['left', 'right'] },
      { name: 'processed', label: 'Processed', type: 'select', keepEmpty: true,
        options: [['', '—'], ['y', 'Yes'], ['n', 'No']] },
    ],
  },
  {
    section: 'notes', title: 'Notes', noun: 'note',
    table: 'note', rows: (s) => s.note, key: ['note_id'], fk: 'for_sample',
    empty: 'No notes.',
    columns: [
      ['Date', (r) => stamp(r.date)],
      ['By', (r) => r.profiles?.full_name || '—'],
      ['Type', (r) => r.note_type],
      ['Note', (r) => r.contents, 'prewrap'],
    ],
    fields: [
      { name: 'note_type', label: 'Type', required: true, maxlength: 45, value: 'Comment' },
      { name: 'contents', label: 'Note', type: 'textarea', required: true },
    ],
    onInsert: () => ({ left_by: profile.id, date: new Date().toISOString() }),
  },
];

if (profile) {
  renderShell(profile);
  if (!id) {
    statusEl.textContent = 'No sample specified.';
  } else {
    wireUpload();
    wireAddLink();
    wireDeleteSample();
    await load();
  }
}

// ---------------------------------------------------------------- loading
// One request, embedded children. PostgREST resolves the foreign keys;
// note!for_sample picks the sample → note key over age_reading → note.
async function load() {
  const { data, error } = await supabase
    .from('sample')
    .select(`
      stssn, species, gamm_id, strand_date, strand_scl, strand_ccl, strand_scw,
      sex, state, decomposition, collaborator, processed_bone,
      rings_consensus, annulus_consensus, humerus_diameter,
      enterer:profiles!sample_entered_by_fkey ( full_name ),
      alt_id ( alt_id, other_id ),
      age_reading ( stssn, user_id, rings, annulus, note, profiles ( full_name ) ),
      extra_sample ( extra_id, sample_type, location, side, processed ),
      note!for_sample ( note_id, note_type, contents, date, profiles ( full_name ) ),
      consensus_image ( image_id, image_folder, raw_image, source_link )
    `)
    .eq('stssn', id)
    .order('other_id', { referencedTable: 'alt_id' })
    .order('date', { referencedTable: 'note', ascending: false, nullsFirst: false })
    .order('image_id', { referencedTable: 'consensus_image' })
    .maybeSingle();

  if (error || !data) {
    statusEl.textContent = error
      ? 'Could not load this sample: ' + error.message
      : 'That sample could not be found.';
    statusEl.hidden = false;
    return;
  }

  sample = data;
  document.getElementById('title').textContent = data.stssn;
  document.title = `${data.stssn} · RamirezDB`;
  renderCore(data);
  for (const spec of CHILDREN) renderChild(spec);
  await renderImages();
  if (isAdmin) await renderHistory();

  if (canWrite) {
    document.getElementById('edit-link').href =
      `new-sample.html?id=${encodeURIComponent(data.stssn)}`;
    document.getElementById('delete-sample').hidden = !isAdmin;
    show('actions');
  }
  statusEl.hidden = true;
}

function renderCore(d) {
  const pairs = [
    ['Species', species(d.species)],
    ['GAMM ID', blank(d.gamm_id)],
    ['Strand date', date(d.strand_date)],
    ['Sex', sex(d.sex)],
    ['State', blank(d.state)],
    ['Decomposition', blank(d.decomposition)],
    ['SCL / CCL / SCW', `${num(d.strand_scl)} / ${num(d.strand_ccl)} / ${num(d.strand_scw)}`],
    ['Collaborator', blank(d.collaborator)],
    ['Humerus sampled', blank(d.processed_bone)],
    ['Consensus rings', blank(d.rings_consensus)],
    ['Consensus annulus', num(d.annulus_consensus, 2)],
    ['Humerus diameter', num(d.humerus_diameter, 2)],
    ['Entered by', d.enterer?.full_name ?? '—'],
  ];
  document.getElementById('core-pairs').replaceChildren(...pairs.flatMap(([term, value]) => [
    el('dt', {}, term), el('dd', {}, value),
  ]));
  show('core');
}

// An age reading's note points at a note row; show its text if it's on this sample.
function noteText(noteId) {
  if (noteId == null) return '—';
  return sample?.note.find((n) => n.note_id === noteId)?.contents ?? `Note ${noteId}`;
}

// ------------------------------------------------------ child table render
function renderChild(spec) {
  const section = document.getElementById(spec.section);
  const rows = spec.rows(sample) ?? [];
  const showActions = canWrite;

  const heading = el('h2', {}, spec.title, ' ', el('span', { className: 'hint' }, `(${rows.length})`));
  const parts = [heading];

  if (rows.length) {
    const head = el('tr', {}, ...spec.columns.map(([label, , cls]) =>
      el('th', { className: cls === 'num' ? 'num' : '' }, label)));
    if (showActions) head.append(el('th', { className: 'actions' }, el('span', { className: 'visually-hidden' }, 'Actions')));

    const body = el('tbody');
    for (const row of rows) body.append(rowView(spec, row));
    parts.push(el('div', { className: 'table-wrap' },
      el('table', { className: 'table' }, el('thead', {}, head), body)));
  } else {
    parts.push(el('p', { className: 'hint' }, spec.empty));
  }

  if (canWrite) parts.push(addArea(spec));
  section.replaceChildren(...parts);
  section.hidden = false;
}

function rowView(spec, row) {
  const tr = el('tr');
  for (const [, cell, cls] of spec.columns) {
    tr.append(el('td', { className: cls ?? '' }, cell(row)));
  }
  if (!canWrite) return tr;

  const edit = button('Edit', 'btn-ghost');
  edit.addEventListener('click', () => {
    const editRow = el('tr', { className: 'editing' });
    const td = el('td', { colSpan: spec.columns.length + 1 });
    td.append(childForm(spec, row, {
      submitLabel: 'Save',
      onCancel: () => editRow.replaceWith(tr),
      onSubmit: (payload) => supabase.from(spec.table)
        .update(payload).match(keyOf(spec, row)).select().single(),
      done: `Saved the ${spec.noun}.`,
    }));
    editRow.append(td);
    tr.replaceWith(editRow);
    editRow.querySelector('input, textarea, select')?.focus();
  });

  const cellEl = el('td', { className: 'actions' }, edit);

  if (isAdmin) {
    const del = button('Delete', 'btn-ghost');
    del.addEventListener('click', () => confirmInline(cellEl, [edit, del], `Delete this ${spec.noun}?`, async () => {
      const { data, error } = await supabase.from(spec.table)
        .delete().match(keyOf(spec, row)).select();
      if (error) return errorText(error, spec);
      if (!data?.length) return "You don't have permission to delete this.";
      await reload(`Deleted the ${spec.noun}.`);
    }));
    cellEl.append(del);
  }
  tr.append(cellEl);
  return tr;
}

function addArea(spec) {
  const wrap = el('div', { className: 'add-area' });
  const blocked = spec.addBlocked?.(sample);
  if (blocked) {
    wrap.append(el('p', { className: 'hint' }, blocked));
    return wrap;
  }
  const open = button(`Add ${spec.noun}`, 'btn-secondary');
  open.addEventListener('click', () => {
    const form = childForm(spec, null, {
      submitLabel: 'Add',
      onCancel: () => form.replaceWith(open),
      onSubmit: (payload) => supabase.from(spec.table)
        .insert({ ...payload, ...(spec.onInsert?.() ?? {}), [spec.fk]: sample.stssn })
        .select().single(),
      done: `Added the ${spec.noun}.`,
    });
    open.replaceWith(form);
    form.querySelector('input, textarea, select')?.focus();
  });
  wrap.append(open);
  return wrap;
}

// The one form used for both Add and Edit on every child table.
function childForm(spec, row, { submitLabel, onCancel, onSubmit, done }) {
  const form = el('form', { className: 'inline-form', noValidate: false });
  const grid = el('div', { className: 'inline-grid' });

  for (const f of spec.fields) {
    const inputId = `${spec.section}-${f.name}-${row ? keyOf(spec, row, true) : 'new'}`;
    const current = row ? row[f.name] : f.value;
    let input;
    if (f.type === 'select') {
      input = el('select', { className: 'input' },
        ...f.options.map(([value, label]) => el('option', { value }, label)));
    } else if (f.type === 'textarea') {
      input = el('textarea', { className: 'input', rows: 3 });
    } else {
      input = el('input', { className: 'input', type: f.type ?? 'text' });
      if (f.min !== undefined) input.min = f.min;
      if (f.step !== undefined) input.step = f.step;
      if (f.suggest) {
        const listId = `${inputId}-list`;
        input.setAttribute('list', listId);
        grid.append(el('datalist', { id: listId }, ...f.suggest.map((v) => el('option', { value: v }))));
      }
    }
    Object.assign(input, { id: inputId, name: f.name, required: Boolean(f.required) });
    if (f.maxlength) input.maxLength = f.maxlength;
    input.value = current ?? '';

    const field = el('div', { className: `field${f.type === 'textarea' ? ' field-wide' : ''}` },
      el('label', { htmlFor: inputId }, f.label, f.required ? '' : ' (optional)'), input);
    grid.append(field);
  }

  const errorEl = el('p', { className: 'error', role: 'alert', hidden: true });
  const submit = el('button', { className: 'btn btn-primary', type: 'submit' }, submitLabel);
  const cancel = button('Cancel', 'btn-ghost');
  cancel.addEventListener('click', onCancel);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorEl.hidden = true;
    submit.disabled = true;

    // Empty strings become null (numeric columns reject ''), except where ''
    // is a stored value, like extra_sample.processed.
    const payload = {};
    for (const f of spec.fields) {
      const value = String(form.elements[f.name].value).trim();
      payload[f.name] = value === '' && !f.keepEmpty ? null : value;
    }

    const { error } = await onSubmit(payload);
    if (error) {
      errorEl.textContent = errorText(error, spec);
      errorEl.hidden = false;
      submit.disabled = false;
      return;
    }
    await reload(done);
  });

  form.append(grid, el('div', { className: 'row' }, submit, cancel), errorEl);
  return form;
}

function keyOf(spec, row, asText = false) {
  const key = Object.fromEntries(spec.key.map((k) => [k, row[k]]));
  return asText ? spec.key.map((k) => row[k]).join('-').replace(/[^\w-]/g, '_') : key;
}

function errorText(error, spec) {
  switch (error.code) {
    case 'PGRST116': return "You don't have permission to change this.";
    case '42501': return "You don't have permission to do that.";
    case '23505': return spec?.table === 'age_reading'
      ? 'You already have a reading for this sample.'
      : 'That would duplicate an existing row.';
    case '23503': return spec?.table === 'note'
      ? 'This note is still referenced, by an import batch in the history or by an age reading, so it can\'t be deleted.'
      : 'Other records still point at this one.';
    case '22P02': return 'One of the values is not a valid number.';
    default: return 'Could not save: ' + error.message;
  }
}

// ----------------------------------------------------------------- images
// Only members may see images, so nothing is shown from Dropbox (a share link
// is public). Bucket files are downloaded with the viewer's session and shown
// from memory as blob: URLs, which can't be shared. A row whose file isn't in
// the bucket yet (legacy Dropbox rows, or an import whose copy failed) shows
// a button to copy it in.
let blobUrls = [];

async function renderImages() {
  const rows = sample.consensus_image ?? [];
  blobUrls.forEach((u) => URL.revokeObjectURL(u));
  blobUrls = [];

  const urls = await Promise.all(rows.map((r) => (isLink(r.raw_image) ? null : objectUrl(r.raw_image))));
  urls.forEach((u) => { if (u) blobUrls.push(u); });

  document.getElementById('thumbs').replaceChildren(...rows.map((r, i) => imageCard(r, urls[i])));
  document.getElementById('images-empty').hidden = rows.length > 0;
  document.querySelector('#images h2').replaceChildren(
    'Consensus images ', el('span', { className: 'hint' }, `(${rows.length})`));
  document.getElementById('upload').hidden = !canWrite;
  document.getElementById('add-link').hidden = !canWrite;
  show('images');
}

function imageCard(row, url) {
  const legacy = isLink(row.raw_image);
  const name = legacy || !row.raw_image ? fileNameOf(row.source_link ?? row.raw_image)
    : row.raw_image.split('/').pop().replace(/^\d+-/, '');
  const figure = el('figure', { className: 'thumb' });

  if (url) {
    figure.append(el('a', { href: url, target: '_blank', rel: 'noopener' },
      el('img', { src: url, alt: `Consensus image ${name}` })));
  } else {
    const box = el('div', { className: 'thumb-missing' },
      legacy ? 'Not in secure storage yet.' : 'The file is missing from secure storage.');
    if (canWrite && (row.source_link || legacy)) {
      const copy = button('Copy into secure storage', 'btn-secondary');
      const err = el('span', { className: 'error', role: 'alert' });
      copy.addEventListener('click', async () => {
        copy.disabled = true;
        copy.textContent = 'Copying…';
        const problem = await copyRowIntoBucket({ ...row, of_stssn: sample.stssn });
        if (problem) {
          err.textContent = problem;
          copy.disabled = false;
          copy.textContent = 'Copy into secure storage';
          return;
        }
        await reload('Copied the image into secure storage.');
      });
      box.append(copy, err);
    }
    figure.append(box);
  }

  const caption = el('figcaption', { className: 'hint' }, name);
  figure.append(caption);
  const source = row.source_link ?? (legacy ? row.raw_image : null);
  if (source) {
    // The lab's record of where the image came from. The link itself is
    // public on Dropbox, so it isn't loaded, only listed for members.
    caption.append(el('br'), 'Source: ',
      el('a', { href: source, target: '_blank', rel: 'noopener noreferrer' }, 'Dropbox link'));
  }

  if (isAdmin) {
    const del = button('Delete', 'btn-ghost');
    del.addEventListener('click', () => confirmInline(caption, [del], 'Delete this image?', async () => {
      // Row first: if removing the file then fails, the leftover is an unseen
      // file, not a row pointing at nothing.
      const { data, error } = await supabase.from('consensus_image')
        .delete().eq('image_id', row.image_id).select();
      if (error) return errorText(error);
      if (!data?.length) return "You don't have permission to delete this.";
      if (!legacy) {
        const { data: gone, error: storageError } = await supabase.storage.from(BUCKET).remove([row.raw_image]);
        if (url && (storageError || !gone?.length)) {
          await reload(`Deleted the image record, but the file could not be removed from storage (${row.raw_image}).`);
          return;
        }
      }
      await reload('Deleted the image.');
    }));
    caption.append(' ', del);
  }
  return figure;
}

function wireUpload() {
  const form = document.getElementById('upload');
  const errorEl = form.querySelector('.error');
  const submit = form.querySelector('button[type="submit"]');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const file = form.elements.file.files[0];
    if (!file) return;
    errorEl.hidden = true;
    submit.disabled = true;
    submit.textContent = 'Uploading…';

    // Timestamped, so an upload never collides with (or overwrites) a file.
    const safe = file.name.replace(/[^\w.-]+/g, '_');
    const path = `${sample.stssn.replace(/[^\w.-]+/g, '_')}/${Date.now()}-${safe}`;

    const fail = (message) => {
      errorEl.textContent = message;
      errorEl.hidden = false;
      submit.disabled = false;
      submit.textContent = 'Upload';
    };

    const { error: upError } = await supabase.storage.from(BUCKET)
      .upload(path, file, { upsert: false, contentType: file.type });
    if (upError) {
      return fail(/mime|type/i.test(upError.message) ? 'Only JPEG, PNG and WebP images can be uploaded.'
        : /size|large/i.test(upError.message) ? 'That file is over 50 MB.'
        : /row-level|policy|unauthorized/i.test(upError.message) ? "You don't have permission to upload."
        : 'Upload failed: ' + upError.message);
    }

    const { error } = await supabase.from('consensus_image')
      .insert({ image_folder: BUCKET, raw_image: path, of_stssn: sample.stssn })
      .select().single();
    if (error) {
      // Personnel can't delete, so the file stays; say where it is so an admin can.
      return fail(`The file uploaded to ${path} but its record could not be saved: ${error.message}`);
    }

    form.reset();
    submit.disabled = false;
    submit.textContent = 'Upload';
    await reload('Uploaded the image.');
  });
}

// Record a Dropbox link, with the same checks as the CSV import.
function wireAddLink() {
  const form = document.getElementById('add-link');
  const errorEl = form.querySelector('.error');
  const submit = form.querySelector('button[type="submit"]');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorEl.hidden = true;
    const image = readImageFields(form.elements.link.value, form.elements.folder.value);
    let problem = image.error ?? (image.link ? null : 'Paste the Dropbox link to the image file.');
    if (!problem) {
      submit.disabled = true;
      problem = await addImageLink(sample.stssn, image.link, image.folder);
      submit.disabled = false;
    }
    if (problem) {
      errorEl.textContent = problem;
      errorEl.hidden = false;
      return;
    }
    form.reset();
    await reload('Added the image link.');
  });
}

// ---------------------------------------------------------------- history
async function renderHistory() {
  const { data, error } = await supabase
    .from('audit_log')
    .select('log_id, modified_at, operation, profiles ( full_name )')
    .eq('related_stssn', sample.stssn)
    .order('modified_at', { ascending: false })
    .limit(50);
  if (error) return;

  const body = document.querySelector('#history tbody');
  body.replaceChildren(...data.map((r) => el('tr', {},
    el('td', {}, stamp(r.modified_at)),
    el('td', {}, r.profiles?.full_name ?? 'SQL editor'),
    el('td', {}, describeOperation(r.operation)))));
  if (!data.length) body.append(el('tr', {}, el('td', { colSpan: 3, className: 'hint' }, 'No changes recorded.')));
  show('history');
}

// 0004 logged sample, age_reading and extra_sample changes as a bare 'UPDATE';
// 0006 onward prefixes the table, e.g. 'note INSERT'.
function describeOperation(op) {
  const [a, b] = op.split(' ');
  const verb = { INSERT: 'added', UPDATE: 'edited', DELETE: 'deleted' }[b ?? a] ?? (b ?? a).toLowerCase();
  const what = b ? a.replace('_', ' ') : 'sample or child row';
  return `${what} ${verb}`;
}

// ----------------------------------------------------------- delete sample
// The foreign keys stay `restrict` (0001), so a sample with child rows can't
// be deleted, and nothing disappears by accident. The panel lists what's in
// the way instead of letting the database refuse with a raw FK error.
function wireDeleteSample() {
  const open = document.getElementById('delete-sample');
  const panel = document.getElementById('delete-panel');

  open.addEventListener('click', () => {
    const blockers = [
      ['alt-ids', 'alternate ID', sample.alt_id.length],
      ['readings', 'age reading', sample.age_reading.length],
      ['extras', 'extra sample', sample.extra_sample.length],
      ['notes', 'note', sample.note.length],
      ['images', 'image', sample.consensus_image.length],
    ].filter(([, , n]) => n > 0);

    const cancel = button('Cancel', 'btn-ghost');
    cancel.addEventListener('click', () => { panel.hidden = true; open.focus(); });

    if (blockers.length) {
      panel.replaceChildren(
        el('h2', {}, `${sample.stssn} still has child records`),
        el('p', {}, 'Remove these first, then delete the sample. They are kept on purpose so nothing is lost by accident:'),
        el('ul', {}, ...blockers.map(([section, noun, n]) => el('li', {},
          el('a', { href: `#${section}` }, `${n} ${noun}${n === 1 ? '' : 's'}`)))),
        el('div', { className: 'row' }, cancel));
    } else {
      const errorEl = el('p', { className: 'error', role: 'alert', hidden: true });
      const yes = button(`Yes, delete ${sample.stssn}`, 'btn-danger');
      yes.addEventListener('click', async () => {
        yes.disabled = true;
        const { data, error } = await supabase.from('sample')
          .delete().eq('stssn', sample.stssn).select('stssn');
        if (error || !data?.length) {
          errorEl.textContent = error?.code === '23503'
            ? 'Someone added a child record in the meantime. Reload the page to see it.'
            : error ? 'Could not delete: ' + error.message
            : "You don't have permission to delete samples.";
          errorEl.hidden = false;
          yes.disabled = false;
          return;
        }
        location.href = 'samples.html';
      });
      panel.replaceChildren(
        el('h2', {}, `Delete ${sample.stssn}?`),
        el('p', {}, 'This removes the stranding record permanently. Its audit history is kept.'),
        el('div', { className: 'row' }, yes, cancel), errorEl);
    }
    panel.hidden = false;
    panel.scrollIntoView({ block: 'nearest' });
    panel.querySelector('button')?.focus();
  });
}

// ---------------------------------------------------------------- helpers
async function reload(message) {
  document.getElementById('delete-panel').hidden = true;
  await load();
  flashEl.textContent = message;
  flashEl.hidden = false;
  clearTimeout(reload.timer);
  reload.timer = setTimeout(() => { flashEl.hidden = true; }, 5000);
}

// Swaps `hide` for a "Sure? Yes / No" pair inside `host`. `action` returns an
// error message to show, or nothing on success.
function confirmInline(host, hide, question, action) {
  const yes = button('Yes, delete', 'btn-danger');
  const no = button('No', 'btn-ghost');
  const msg = el('span', { className: 'confirm-q' }, question);
  const err = el('span', { className: 'error', role: 'alert' });
  const box = el('span', { className: 'confirm' }, msg, yes, no, err);
  hide.forEach((b) => { b.hidden = true; });
  host.append(box);
  yes.focus();
  no.addEventListener('click', () => { box.remove(); hide.forEach((b) => { b.hidden = false; }); });
  yes.addEventListener('click', async () => {
    yes.disabled = no.disabled = true;
    const problem = await action();
    if (problem) {
      err.textContent = problem;
      no.disabled = false;
    }
  });
}

function show(elementId) { document.getElementById(elementId).hidden = false; }

function button(label, variant) {
  return el('button', { className: `btn ${variant}`, type: 'button' }, label);
}

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(props)) {
    if (k === 'role') node.setAttribute('role', v); else node[k] = v;
  }
  node.append(...children.filter((c) => c !== null && c !== undefined && c !== false));
  return node;
}
