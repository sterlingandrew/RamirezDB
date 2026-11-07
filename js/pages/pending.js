import { currentProfile, signOut, MEMBERS } from '../auth.js';
import { renderShell } from '../shell.js';
import { stamp, blank } from '../format.js';

// No data calls here: a pending account can read nothing but its own profile,
// which currentProfile() already fetched.
const profile = await currentProfile();
if (!profile) location.href = 'index.html';
else if (MEMBERS.includes(profile.role)) location.href = 'samples.html';
else {
  renderShell(profile);
  const set = (id, value) => { document.getElementById(id).textContent = value; };
  set('d-name', blank(profile.full_name));
  set('d-email', blank(profile.email));
  set('d-affiliation', blank(profile.affiliation));
  set('d-reason', blank(profile.reason));
  set('d-date', stamp(profile.created_at));
  document.getElementById('details').hidden = false;
  document.getElementById('sign-out').addEventListener('click', () => signOut());
}
