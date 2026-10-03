import { supabase } from '../supabase.js';
import { requireRole, ROLES } from '../auth.js';
import { renderShell } from '../shell.js';
import { stamp, blank } from '../format.js';

const profile = await requireRole(['admin']);
if (profile) {
  renderShell(profile);

  const statusEl = document.getElementById('status');
  const table = document.getElementById('members');

  const { data: members, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, role')
    .order('full_name');

  if (error) {
    statusEl.textContent = 'Could not load members. ' + error.message;
  } else {
    table.querySelector('tbody').replaceChildren(...members.map((member) => {
      const tr = document.createElement('tr');

      const name = document.createElement('td');
      name.textContent = blank(member.full_name);

      const email = document.createElement('td');
      email.textContent = blank(member.email);

      const roleCell = document.createElement('td');
      const select = document.createElement('select');
      select.className = 'input';
      select.disabled = member.id === profile.id; // don't demote yourself
      for (const role of ROLES) {
        const option = document.createElement('option');
        option.value = role;
        option.textContent = role;
        option.selected = role === member.role;
        select.append(option);
      }
      roleCell.append(select);

      const actions = document.createElement('td');
      const save = document.createElement('button');
      save.className = 'btn btn-secondary';
      save.type = 'button';
      save.textContent = 'Save role';
      save.disabled = select.disabled;
      save.addEventListener('click', async () => {
        save.disabled = true;
        const { error: updateError } = await supabase
          .from('profiles')
          .update({ role: select.value })
          .eq('id', member.id);
        save.textContent = updateError ? 'Failed' : 'Saved';
        if (updateError) save.disabled = false;
      });
      actions.append(save);

      tr.append(name, email, roleCell, actions);
      return tr;
    }));
    statusEl.hidden = true;
    table.hidden = false;
  }

  const { data: log } = await supabase
    .from('audit_log')
    .select('modified_at, operation, related_stssn, modified_by')
    .order('modified_at', { ascending: false })
    .limit(50);

  if (log?.length) {
    document.querySelector('#audit tbody').replaceChildren(...log.map((entry) => {
      const tr = document.createElement('tr');
      for (const value of [stamp(entry.modified_at), entry.operation,
                           blank(entry.related_stssn), blank(entry.modified_by)]) {
        const td = document.createElement('td');
        td.textContent = value;
        tr.append(td);
      }
      return tr;
    }));
  }
}
