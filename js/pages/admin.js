import { supabase } from '../supabase.js';
import { requireRole, ROLES } from '../auth.js';
import { renderShell, refreshRequestBadge } from '../shell.js';
import { stamp, blank } from '../format.js';

const profile = await requireRole(['admin']);
if (profile) {
  renderShell(profile);
  await renderRequests();

  const statusEl = document.getElementById('status');
  const table = document.getElementById('members');

  const { data: members, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, role')
    .neq('role', 'pending') // pending accounts are listed under Requests
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
      const saveError = document.createElement('p');
      saveError.className = 'error';
      saveError.hidden = true;
      save.addEventListener('click', async () => {
        save.disabled = true;
        saveError.hidden = true;
        const { error: updateError } = await supabase
          .from('profiles')
          .update({ role: select.value })
          .eq('id', member.id);
        save.textContent = updateError ? 'Save role' : 'Saved';
        if (updateError) {
          // The role guard in 0006 explains itself, e.g. "The last admin cannot be demoted."
          saveError.textContent = updateError.message;
          saveError.hidden = false;
          save.disabled = false;
        }
      });
      actions.append(save, saveError);

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

// ------------------------------------------------------------------ Requests
// Approve and reject are rpcs (0007) that re-check is_admin() and that the
// target is still pending, so a stale page can't approve someone twice or
// reject a member.
async function renderRequests() {
  const statusEl = document.getElementById('requests-status');
  const table = document.getElementById('requests');
  const countEl = document.getElementById('requests-count');
  const tbody = table.querySelector('tbody');

  const { data, error } = await supabase.rpc('list_requests');
  if (error) {
    statusEl.textContent = 'Could not load requests. ' + error.message;
    return;
  }

  const update = () => {
    const confirmed = tbody.querySelectorAll('tr[data-confirmed="true"]').length;
    countEl.textContent = String(confirmed);
    countEl.hidden = confirmed === 0;
    refreshRequestBadge(confirmed);
    const empty = tbody.children.length === 0;
    statusEl.textContent = empty ? 'No requests waiting.' : '';
    statusEl.hidden = !empty;
    table.hidden = empty;
  };

  tbody.replaceChildren(...data.map((req) => requestRow(req, update)));
  update();
}

function requestRow(req, onDone) {
  const tr = document.createElement('tr');
  tr.dataset.confirmed = String(Boolean(req.confirmed_at));

  const name = document.createElement('td');
  const strong = document.createElement('strong');
  strong.textContent = blank(req.full_name);
  const email = document.createElement('div');
  email.className = 'hint';
  email.textContent = blank(req.email);
  name.append(strong, email);
  if (!req.confirmed_at) {
    const unconfirmed = document.createElement('div');
    unconfirmed.className = 'hint';
    unconfirmed.textContent = 'Email not confirmed yet';
    name.append(unconfirmed);
  }

  const affiliation = document.createElement('td');
  affiliation.textContent = blank(req.affiliation);

  const reason = document.createElement('td');
  reason.className = 'prewrap';
  reason.textContent = blank(req.reason);

  const when = document.createElement('td');
  when.textContent = stamp(req.created_at);

  const actions = document.createElement('td');
  const buttons = document.createElement('div');
  buttons.className = 'row';
  const message = document.createElement('p');
  message.className = 'error';
  message.hidden = true;

  const button = (label, cls) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = `btn ${cls}`;
    b.textContent = label;
    return b;
  };
  const approve = button('Approve', 'btn-primary');
  const reject = button('Reject', 'btn-secondary');
  const confirmReject = button('Yes, delete request', 'btn-danger');
  const cancel = button('Cancel', 'btn-ghost');

  // Approving before the email is confirmed would let an unverified address in.
  approve.disabled = !req.confirmed_at;
  if (approve.disabled) approve.title = 'They need to confirm their email first.';

  const showDefault = () => buttons.replaceChildren(approve, reject);
  const run = async (rpc, doneText) => {
    for (const b of buttons.children) b.disabled = true;
    message.hidden = true;
    const { error } = await supabase.rpc(rpc, { target: req.id });
    if (error) {
      message.textContent = error.message;
      message.hidden = false;
      for (const b of [reject, confirmReject, cancel]) b.disabled = false;
      approve.disabled = !req.confirmed_at;
      showDefault();
      return;
    }
    actions.replaceChildren(Object.assign(document.createElement('span'),
      { className: 'hint', textContent: doneText }));
    setTimeout(() => { tr.remove(); onDone(); }, 1200);
  };

  approve.addEventListener('click', () => run('approve_request', 'Approved — now personnel'));
  reject.addEventListener('click', () => {
    buttons.replaceChildren(confirmReject, cancel);
    confirmReject.focus();
  });
  cancel.addEventListener('click', () => { showDefault(); reject.focus(); });
  confirmReject.addEventListener('click', () => run('reject_request', 'Rejected — account deleted'));

  showDefault();
  actions.append(buttons, message);
  tr.append(name, affiliation, reason, when, actions);
  return tr;
}
