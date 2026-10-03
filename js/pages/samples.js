import { supabase } from '../supabase.js';
import { requireRole } from '../auth.js';
import { renderShell } from '../shell.js';
import { PAGE_SIZE } from '../config.js';
import { species, sex, date, num, blank } from '../format.js';

const profile = await requireRole();
if (profile) {
  renderShell(profile);

  const form = document.getElementById('filters');
  const table = document.getElementById('results');
  const body = table.querySelector('tbody');
  const statusEl = document.getElementById('status');
  const pager = document.getElementById('pager');
  const pagerLabel = document.getElementById('pager-label');
  let page = 0;

  async function load() {
    statusEl.hidden = false;
    statusEl.textContent = 'Loading…';

    // Select columns explicitly — select('*') leaks new columns into the UI
    // and gets slower as the schema grows.
    let query = supabase
      .from('sample')
      .select('stssn, species, strand_date, sex, state, strand_scl, rings_consensus',
              { count: 'exact' })
      .order('strand_date', { ascending: false })
      .range(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE - 1);

    const q = form.q.value.trim();
    if (q) query = query.ilike('stssn', `%${q}%`);
    if (form.species.value) query = query.eq('species', form.species.value);
    if (form.from.value) query = query.gte('strand_date', form.from.value);
    if (form.to.value) query = query.lte('strand_date', form.to.value);

    const { data, count, error } = await query;

    if (error) {
      statusEl.textContent = 'Could not load samples. ' + error.message;
      table.hidden = true;
      pager.hidden = true;
      return;
    }
    if (!data.length) {
      statusEl.textContent = 'No samples match those filters.';
      table.hidden = true;
      pager.hidden = true;
      return;
    }

    body.replaceChildren(...data.map((row) => {
      const tr = document.createElement('tr');
      const link = document.createElement('a');
      link.href = `sample.html?id=${encodeURIComponent(row.stssn)}`;
      link.textContent = row.stssn;
      const cells = [
        link, species(row.species), date(row.strand_date), sex(row.sex),
        blank(row.state), num(row.strand_scl), blank(row.rings_consensus),
      ];
      cells.forEach((value, i) => {
        const td = document.createElement('td');
        if (i >= 5) td.className = 'num';
        td.append(value);
        tr.append(td);
      });
      return tr;
    }));

    statusEl.hidden = true;
    table.hidden = false;
    pager.hidden = false;
    const first = page * PAGE_SIZE + 1;
    pagerLabel.textContent = `${first}–${first + data.length - 1} of ${count}`;
    pager.querySelector('[data-page="prev"]').disabled = page === 0;
    pager.querySelector('[data-page="next"]').disabled =
      (page + 1) * PAGE_SIZE >= count;
  }

  form.addEventListener('submit', (event) => { event.preventDefault(); page = 0; load(); });
  form.addEventListener('reset', () => { page = 0; setTimeout(load, 0); });
  pager.addEventListener('click', (event) => {
    const dir = event.target.dataset.page;
    if (!dir) return;
    page += dir === 'next' ? 1 : -1;
    load();
  });

  load();
}
