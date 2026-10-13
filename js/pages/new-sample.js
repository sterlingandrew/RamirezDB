import { supabase } from '../supabase.js';
import { requireRole } from '../auth.js';
import { renderShell } from '../shell.js';

// Personnel and Admin only. The insert/update policies enforce this
// server-side; this guard just avoids showing a form that would fail.
// With ?id=STSSN the page edits that sample instead of creating one.
const profile = await requireRole(['personnel', 'admin']);
if (profile) {
  renderShell(profile);
  main();
}

async function main() {
  const form = document.getElementById('new-sample');
  const errorEl = document.getElementById('form-error');
  const button = form.querySelector('button[type="submit"]');
  const heading = document.querySelector('main h1');
  const editId = new URLSearchParams(location.search).get('id');

  // The column list comes from the form's own fields, so the two can't drift.
  const columns = [...new Set([...form.elements].map((el) => el.name).filter(Boolean))];

  if (editId) {
    heading.textContent = `Edit ${editId}`;
    document.title = `Edit ${editId} · RamirezDB`;
    button.textContent = 'Save changes';
    form.querySelector('a.btn-ghost').href = `sample.html?id=${encodeURIComponent(editId)}`;
    button.disabled = true;

    const { data, error } = await supabase
      .from('sample')
      .select(columns.join(','))
      .eq('stssn', editId)
      .maybeSingle();

    if (error || !data) {
      // Never fall back to a blank form here: it would quietly create a new record.
      form.hidden = true;
      heading.textContent = 'Sample not found';
      const msg = document.createElement('p');
      msg.className = 'error';
      msg.textContent = error
        ? 'Could not load this sample: ' + error.message
        : 'That sample could not be found.';
      const back = document.createElement('a');
      back.className = 'btn btn-ghost';
      back.href = 'samples.html';
      back.textContent = 'Back to samples';
      heading.after(msg, back);
      return;
    }

    // Nulls become empty fields. A select with no matching option is left
    // unselected, so FormData omits it and the update leaves the column as is.
    for (const col of columns) form.elements[col].value = data[col] ?? '';
    form.elements.stssn.readOnly = true; // primary key; child tables reference it
    button.disabled = false;
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorEl.hidden = true;
    button.disabled = true;

    // Empty strings must become null, not '' — numeric and date columns
    // reject the empty string.
    const payload = {};
    for (const [key, raw] of new FormData(form).entries()) {
      const value = String(raw).trim();
      payload[key] = value === '' ? null : value;
    }

    let result;
    if (editId) {
      delete payload.stssn;
      // RLS-blocked updates return zero rows, not an error; .single() turns
      // that into PGRST116 so it can't pass as a successful save.
      result = await supabase
        .from('sample')
        .update(payload)
        .eq('stssn', editId)
        .select('stssn')
        .single();
    } else {
      result = await supabase
        .from('sample')
        .insert(payload)
        .select('stssn')
        .single();
    }

    const { data, error } = result;
    if (error) {
      errorEl.textContent =
        error.code === '23505' ? 'A sample with that STSSN already exists.'
        : error.code === 'PGRST116' ? "You don't have permission to edit this sample."
        : 'Could not save: ' + error.message;
      errorEl.hidden = false;
      button.disabled = false;
      return;
    }
    location.href = `sample.html?id=${encodeURIComponent(data.stssn)}`;
  });
}
