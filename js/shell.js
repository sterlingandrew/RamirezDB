import { signOut, MEMBERS } from './auth.js';
import { supabase } from './supabase.js';

const LINKS = [
  { href: 'samples.html',    label: 'Samples',    roles: ['personnel', 'admin'] },
  { href: 'new-sample.html', label: 'New sample', roles: ['personnel', 'admin'] },
  { href: 'admin.html',      label: 'Admin',      roles: ['admin'] },
];

export function renderShell(profile) {
  const host = document.getElementById('shell-header');
  if (!host) return;
  const here = location.pathname.split('/').pop() || 'index.html';

  const nav = document.createElement('nav');
  nav.className = 'nav';

  const brand = document.createElement('a');
  brand.className = 'nav-brand';
  brand.href = !profile ? 'index.html'
    : MEMBERS.includes(profile.role) ? 'samples.html' : 'pending.html';
  brand.textContent = 'RamirezDB';
  nav.append(brand);

  const links = document.createElement('div');
  links.className = 'nav-links';

  if (profile) {
    for (const link of LINKS) {
      if (!link.roles.includes(profile.role)) continue;
      const a = document.createElement('a');
      a.href = link.href;
      a.textContent = link.label;
      if (link.href === here) a.setAttribute('aria-current', 'page');
      if (link.href === 'admin.html') {
        const badge = document.createElement('span');
        badge.className = 'badge';
        badge.id = 'nav-requests-badge';
        badge.hidden = true;
        a.append(' ', badge);
      }
      links.append(a);
    }
    const role = document.createElement('span');
    role.className = 'nav-role';
    role.textContent = `${profile.full_name ?? profile.email} · ${profile.role}`;
    links.append(role);

    const out = document.createElement('button');
    out.className = 'btn btn-ghost';
    out.type = 'button';
    out.textContent = 'Sign out';
    out.addEventListener('click', () => signOut());
    links.append(out);
  }

  nav.append(links);
  host.replaceChildren(nav);
  if (profile?.role === 'admin') refreshRequestBadge();
}

// Confirmed requests waiting on an admin. There's no email alert (that would
// need an Edge Function, which ADR-001 rules out), so this badge is the alert.
// Pass a count to skip the query when the caller already knows it.
export async function refreshRequestBadge(count) {
  const badge = document.getElementById('nav-requests-badge');
  if (!badge) return;
  if (count === undefined) {
    const { data, error } = await supabase.rpc('list_requests');
    if (error) return;
    count = data.filter((r) => r.confirmed_at).length;
  }
  badge.textContent = String(count);
  badge.title = `${count} access request${count === 1 ? '' : 's'} waiting`;
  badge.setAttribute('aria-label', badge.title);
  badge.hidden = count === 0;
}
