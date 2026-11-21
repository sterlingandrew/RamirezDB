import { supabase } from '../supabase.js';
import { currentProfile } from '../auth.js';
import { copyRowsIntoBucket } from '../images.js';

// Admin page: copies the images that are still only Dropbox links (the 81
// from MySQL) into the private bucket, automatically, as soon as an admin
// opens the page. There's no server of ours to do it in the background
// (ADR-001), so it runs here, in the admin's browser. Sample pages do the
// same for their own image. The section stays hidden when nothing is left.
const profile = await currentProfile();
if (profile?.role === 'admin') main();

async function main() {
  const section = document.getElementById('images-section');
  const countEl = document.getElementById('images-pending');
  const retry = document.getElementById('copy-images');
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

  async function run() {
    let rows;
    try {
      rows = await pending();
    } catch (e) {
      section.hidden = false;
      statusEl.textContent = 'Could not check images: ' + e.message;
      return;
    }
    if (!rows.length) { section.hidden = true; return; }

    section.hidden = false;
    retry.hidden = true;
    failedEl.replaceChildren();
    countEl.textContent = `Copying ${rows.length} image${rows.length === 1 ? '' : 's'} into secure storage. Keep this page open until it finishes.`;
    const leaveWarning = (e) => { e.preventDefault(); e.returnValue = ''; };
    addEventListener('beforeunload', leaveWarning);
    const failed = await copyRowsIntoBucket(rows, (done, bad) => {
      statusEl.textContent = `${done - bad} of ${rows.length} copied${bad ? `, ${bad} failed` : ''}…`;
    });
    removeEventListener('beforeunload', leaveWarning);

    if (!failed.length) {
      countEl.textContent = `All ${rows.length} images are now in secure storage.`;
      statusEl.textContent = '';
      return;
    }
    countEl.textContent = `${rows.length - failed.length} of ${rows.length} copied. These ${failed.length} could not be:`;
    statusEl.textContent = '';
    failedEl.replaceChildren(...failed.map(({ row, problem }) => {
      const li = document.createElement('li');
      li.className = 'error';
      const a = document.createElement('a');
      a.href = `sample.html?id=${encodeURIComponent(row.of_stssn)}`;
      a.textContent = row.of_stssn;
      li.append(a, `: ${problem}`);
      return li;
    }));
    retry.hidden = false;
  }

  retry.addEventListener('click', run);
  run();
}
