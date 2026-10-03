import { supabase } from '../supabase.js';
import { requireRole } from '../auth.js';
import { renderShell } from '../shell.js';

// Personnel and Admin only. The insert policy enforces this server-side;
// this guard just avoids showing a form that would fail.
const profile = await requireRole(['personnel', 'admin']);
if (profile) {
  renderShell(profile);

  const form = document.getElementById('new-sample');
  const errorEl = document.getElementById('form-error');

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    errorEl.hidden = true;
    const button = form.querySelector('button[type="submit"]');
    button.disabled = true;

    // Empty strings must become null, not '' — numeric and date columns
    // reject the empty string.
    const payload = {};
    for (const [key, raw] of new FormData(form).entries()) {
      const value = String(raw).trim();
      payload[key] = value === '' ? null : value;
    }

    const { data, error } = await supabase
      .from('sample')
      .insert(payload)
      .select('stssn')
      .single();

    if (error) {
      errorEl.textContent = error.code === '23505'
        ? 'A sample with that STSSN already exists.'
        : 'Could not save: ' + error.message;
      errorEl.hidden = false;
      button.disabled = false;
      return;
    }
    location.href = `sample.html?id=${encodeURIComponent(data.stssn)}`;
  });
}
