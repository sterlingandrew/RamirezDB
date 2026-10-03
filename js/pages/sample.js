import { supabase } from '../supabase.js';
import { requireRole } from '../auth.js';
import { renderShell } from '../shell.js';
import { species, sex, date, stamp, num, blank } from '../format.js';

const profile = await requireRole();
if (profile) {
  renderShell(profile);

  const id = new URLSearchParams(location.search).get('id');
  const statusEl = document.getElementById('status');

  if (!id) {
    statusEl.textContent = 'No sample specified.';
  } else {
    // One request, embedded children — PostgREST resolves the foreign keys.
    const { data, error } = await supabase
      .from('sample')
      .select(`
        stssn, species, gamm_id, strand_date, strand_scl, strand_ccl, strand_scw,
        sex, state, decomposition, collaborator, processed_bone,
        rings_consensus, annulus_consensus, humerus_diameter,
        age_reading ( user_id, rings, annulus, note ),
        extra_sample ( sample_type, location, side, processed ),
        note!for_sample ( note_id, note_type, contents, date )
      `)
      .eq('stssn', id)
      .single();

    if (error || !data) {
      statusEl.textContent = 'That sample could not be found.';
    } else {
      document.getElementById('title').textContent = data.stssn;
      document.title = `${data.stssn} · RamirezDB`;

      const pairs = [
        ['Species', species(data.species)],
        ['GAMM ID', blank(data.gamm_id)],
        ['Strand date', date(data.strand_date)],
        ['Sex', sex(data.sex)],
        ['State', blank(data.state)],
        ['Decomposition', blank(data.decomposition)],
        ['SCL / CCL / SCW', `${num(data.strand_scl)} / ${num(data.strand_ccl)} / ${num(data.strand_scw)}`],
        ['Collaborator', blank(data.collaborator)],
        ['Processed bone', blank(data.processed_bone)],
        ['Consensus rings', blank(data.rings_consensus)],
        ['Consensus annulus', num(data.annulus_consensus, 2)],
        ['Humerus diameter', num(data.humerus_diameter, 2)],
      ];
      const dl = document.getElementById('core-pairs');
      dl.replaceChildren(...pairs.flatMap(([term, value]) => {
        const dt = document.createElement('dt'); dt.textContent = term;
        const dd = document.createElement('dd'); dd.textContent = value;
        return [dt, dd];
      }));
      show('core');

      fillRows('readings', data.age_reading,
        (r) => [r.user_id, r.rings, num(r.annulus, 2), blank(r.note)]);
      fillRows('extras', data.extra_sample,
        (r) => [r.sample_type, r.location, blank(r.side), r.processed]);

      if (data.note?.length) {
        const list = document.querySelector('#notes .notes');
        list.replaceChildren(...data.note.map((n) => {
          const li = document.createElement('li');
          const head = document.createElement('div');
          head.className = 'hint';
          head.textContent = `${n.note_type} · ${stamp(n.date)}`;
          const text = document.createElement('div');
          text.textContent = n.contents;
          li.append(head, text);
          return li;
        }));
        show('notes');
      }

      if (['personnel', 'admin'].includes(profile.role)) {
        document.getElementById('edit-link').href =
          `new-sample.html?id=${encodeURIComponent(data.stssn)}`;
        show('actions');
      }
      statusEl.hidden = true;
    }
  }

  function show(elementId) { document.getElementById(elementId).hidden = false; }

  function fillRows(sectionId, rows, toCells) {
    if (!rows?.length) return;
    const body = document.querySelector(`#${sectionId} tbody`);
    body.replaceChildren(...rows.map((row) => {
      const tr = document.createElement('tr');
      toCells(row).forEach((value, i) => {
        const td = document.createElement('td');
        if (i > 0 && i < 3) td.className = 'num';
        td.textContent = value;
        tr.append(td);
      });
      return tr;
    }));
    show(sectionId);
  }
}
