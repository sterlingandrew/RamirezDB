import { supabase } from '../supabase.js';
import { currentProfile } from '../auth.js';
import { copyRowIntoBucket } from '../images.js';

// Admin page: copy the images that are still only Dropbox links (the 81 from
// MySQL) into the private bucket. Each copy is the same as the "Copy into
// secure storage" button on a sample page; this runs them all. admin.js
// already redirects anyone who isn't an admin, and the update policy and
// storage policies are what actually allow it.
const profile = await currentProfile();
if (profile?.role === 'admin') main();

async function main() {
  const section = document.getElementById('images-section');
  const countEl = document.getElementById('images-pending');
  const button = document.getElementById('copy-images');
  const statusEl = document.getElementById('images-status');
  const failedEl = document.getElementById('images-failed');

  async function pending() {
    const { data, error } = await supabase
      .from('consensus_image')
      .select('image_id, raw_image, source_link, of_stssn')
      .ilike('raw_image', 'http%')
      .order('image_id');
    if (error) throw error;
    return data;
  }

  let rows;
  try {
    rows = await pending();
  } catch (e) {
    statusEl.textContent = 'Could not check images: ' + e.message;
    section.hidden = false;
    return;
  }
  if (!rows.length) return;  // nothing left: keep the section hidden
  countEl.textContent = `${rows.length} image${rows.length === 1 ? '' : 's'} to copy.`;
  section.hidden = false;

  button.addEventListener('click', async () => {
    button.disabled = true;
    failedEl.replaceChildren();
    const failed = [];
    let done = 0;
    const leaveWarning = (e) => { e.preventDefault(); e.returnValue = ''; };
    addEventListener('beforeunload', leaveWarning);

    const queue = [...rows];
    await Promise.all([0, 1].map(async () => {
      while (queue.length) {
        const row = queue.shift();
        const problem = await copyRowIntoBucket(row);
        if (problem) failed.push({ row, problem });
        done++;
        statusEl.textContent = `Copied ${done - failed.length} of ${rows.length}${failed.length ? `, ${failed.length} failed` : ''}…`;
      }
    }));
    removeEventListener('beforeunload', leaveWarning);

    failedEl.replaceChildren(...failed.map(({ row, problem }) => {
      const li = document.createElement('li');
      li.className = 'error';
      const a = document.createElement('a');
      a.href = `sample.html?id=${encodeURIComponent(row.of_stssn)}`;
      a.textContent = row.of_stssn;
      li.append(a, `: ${problem}`);
      return li;
    }));
    rows = await pending().catch(() => rows);
    countEl.textContent = rows.length
      ? `${rows.length} image${rows.length === 1 ? '' : 's'} still to copy.`
      : 'Every image is in secure storage.';
    statusEl.textContent = `Done: ${done - failed.length} copied${failed.length ? `, ${failed.length} failed (listed below; try again, or check the link)` : ''}.`;
    button.disabled = rows.length === 0;
  });
}
