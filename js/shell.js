import { signOut } from './auth.js';

const LINKS = [
  { href: 'samples.html',    label: 'Samples',    roles: ['user', 'personnel', 'admin'] },
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
  brand.href = profile ? 'samples.html' : 'index.html';
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
}
