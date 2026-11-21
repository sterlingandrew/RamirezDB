import { supabase } from '../supabase.js';
import { requireRole } from '../auth.js';
import { renderShell } from '../shell.js';
import { checkCell, dateFromStssn } from '../import-rules.js';
import { readImageFields, findLinkOwner, addImageLink } from '../images.js';

// Personnel and Admin only. The insert/update policies enforce this
// server-side; this guard just avoids showing a form that would fail.
// With ?id=STSSN the page edits that sample instead of creating one.
//
// Fields are checked with the CSV import's rules (checkCell), so a value the
// import would refuse is refused here too, and the import's automatic fixes
// (STSSN repairs, FL(FG) → FL, dates from the STSSN) happen here visibly.
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
  const imageFields = document.getElementById('image-fields');

  // The column list comes from the form's own fields, so the two can't drift.
  // The image inputs have no name: they're consensus_image, not sample.
  const columns = [...new Set([...form.elements].map((el) => el.name).filter(Boolean))];

  // Text inputs checked by checkCell. Selects can only hold valid values.
  const checked = columns.filter((c) => form.elements[c].tagName === 'INPUT');
  const dirty = new Set();

  for (const msg of form.querySelectorAll('.field-msg')) msg.dataset.default = msg.textContent;

  if (editId) {
    // Images are added and removed in the Images section of the sample's page.
    imageFields.hidden = true;
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

    // Nulls become empty fields. A select with no matching option (legacy
    // values such as processed_bone 'u') is left unselected; it's only sent
    // if someone picks a new value.
    for (const col of columns) form.elements[col].value = data[col] ?? '';
    form.elements.stssn.readOnly = true; // primary key; child tables reference it
    setMsg('stssn', 'The STSSN can\'t be changed: other records point at it.');
    button.disabled = false;
  }

  // Only fields someone touched are checked and, when editing, sent. Legacy
  // values the import rules would now reject don't block an unrelated edit.
  for (const col of columns) {
    const el = form.elements[col];
    el.addEventListener('input', () => dirty.add(col));
    el.addEventListener('change', () => { dirty.add(col); if (checked.includes(col)) check(col); });
  }
  if (!editId) {
    form.elements.stssn.addEventListener('change', fillDateFromStssn);
    for (const id of ['image_link', 'image_folder_link']) {
      document.getElementById(id).addEventListener('change', () => checkImage(id));
    }
  }

  // Run the import rule for one field: apply a fix to the input, show the
  // message. Returns false on an error.
  function check(col) {
    const el = form.elements[col];
    if (el.readOnly) return true;
    const r = checkCell(col, el.value);
    if (!r.error && r.value !== el.value.trim()) el.value = r.value;
    if (r.error) setMsg(col, r.error, 'error');
    else if (r.warning) setMsg(col, r.warning, 'warn');
    else if (r.fixed) setMsg(col, r.fixed, 'fixed');
    else setMsg(col);
    return !r.error;
  }

  function checkImage(id) {
    const el = document.getElementById(id);
    const r = checkCell(id === 'image_link' ? 'raw_image' : 'image_folder', el.value);
    if (!r.error && r.value !== el.value.trim()) el.value = r.value;
    if (r.error) setMsg(id, r.error, 'error');
    else if (r.warning) setMsg(id, r.warning, 'warn');
    else if (r.fixed) setMsg(id, r.fixed, 'fixed');
    else setMsg(id);
    return !r.error;
  }

  // The STSSN carries the stranding date, as in the import's "Fill blank
  // strand dates" option. Shown in green, never silent.
  function fillDateFromStssn() {
    const date = form.elements.strand_date;
    const fromId = check('stssn') ? dateFromStssn(form.elements.stssn.value) : null;
    if (!fromId) return;
    if (!date.value) {
      date.value = fromId;
      dirty.add('strand_date');
      setMsg('strand_date', 'Filled from the date in the STSSN.', 'fixed');
    } else if (date.value !== fromId) {
      setMsg('strand_date', `Differs from the date in the STSSN (${fromId}).`, 'warn');
    }
  }

  function setMsg(id, text, kind) {
    const msg = form.querySelector(`.field-msg[data-for="${id}"]`);
    if (!msg) return;
    msg.textContent = text ?? msg.dataset.default;
    msg.className = `field-msg ${kind === 'error' ? 'error' : kind === 'fixed' ? 'fixed' : 'hint'}`;
    const input = document.getElementById(id);
    if (kind === 'error') input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorEl.hidden = true;

    const fail = (message) => {
      errorEl.replaceChildren(message);
      errorEl.hidden = false;
      button.disabled = false;
    };

    if (!editId && !form.elements.stssn.value.trim()) {
      setMsg('stssn', 'STSSN is required.', 'error');
      form.elements.stssn.focus();
      return fail('Fill in the STSSN.');
    }

    // Every field on a new sample; only touched fields on an edit.
    const toCheck = checked.filter((c) => !editId || dirty.has(c));
    const bad = toCheck.filter((c) => !check(c));
    if (!editId) {
      fillDateFromStssn();
      for (const id of ['image_link', 'image_folder_link']) if (!checkImage(id)) bad.push(id);
    }
    if (bad.length) {
      document.getElementById(bad[0]).focus();
      return fail(`Fix the field${bad.length === 1 ? '' : 's'} marked in red.`);
    }

    button.disabled = true;

    // Empty strings become null, not '' — numeric and date columns reject it.
    const payload = {};
    for (const [key, raw] of new FormData(form).entries()) {
      if (editId && !dirty.has(key)) continue;
      const value = String(raw).trim();
      payload[key] = value === '' ? null : value;
    }

    let image = { link: null };
    if (!editId) {
      // The import refuses a network ID that's already an alternate ID of
      // another turtle; so does the form.
      const { data: alt, error: altError } = await supabase.from('alt_id')
        .select('stssn').eq('other_id', payload.stssn).neq('stssn', payload.stssn).limit(1);
      if (altError) return fail('Could not check alternate IDs: ' + altError.message);
      if (alt.length) {
        setMsg('stssn', `This is an alternate ID of ${alt[0].stssn}.`, 'error');
        return fail(`${payload.stssn} is an alternate ID of ${alt[0].stssn}. Use ${alt[0].stssn}, or add details to that sample.`);
      }

      // Check the image link before the sample is saved, so a bad or
      // already-used link doesn't leave a sample saved without it.
      image = readImageFields(document.getElementById('image_link').value,
                              document.getElementById('image_folder_link').value);
      if (image.error) return fail(image.error);
      if (image.link) {
        try {
          const owner = await findLinkOwner(image.link);
          if (owner) {
            setMsg('image_link', `Already on sample ${owner}.`, 'error');
            return fail(`That image is already on sample ${owner}. Each turtle needs its own image.`);
          }
        } catch (e) {
          return fail('Could not check the image link: ' + e.message);
        }
      }
    }

    if (editId && Object.keys(payload).length === 0) {
      location.href = `sample.html?id=${encodeURIComponent(editId)}`;
      return;
    }

    let result;
    if (editId) {
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
      return fail(
        error.code === '23505' ? 'A sample with that STSSN already exists.'
        : error.code === 'PGRST116' ? "You don't have permission to edit this sample."
        : error.code === '42501' ? "You don't have permission to add samples."
        : error.code === '23514' ? 'One of the values isn\'t allowed: ' + error.message
        : 'Could not save: ' + error.message);
    }

    const page = `sample.html?id=${encodeURIComponent(data.stssn)}`;
    if (image.link) {
      const problem = await addImageLink(data.stssn, image.link, image.folder);
      if (problem) {
        // The sample is saved; don't let a second click try to create it again.
        form.querySelectorAll('input, select, button').forEach((el) => { el.disabled = true; });
        errorEl.replaceChildren(`${data.stssn} was saved, but its image link wasn't: ${problem} `,
          Object.assign(document.createElement('a'), { href: page, textContent: 'Open the sample to add it' }));
        errorEl.hidden = false;
        return;
      }
    }
    location.href = page;
  });
}
