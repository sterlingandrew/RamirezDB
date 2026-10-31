import { currentProfile, signOut, MEMBERS } from '../auth.js';
import { renderShell } from '../shell.js';

// No data calls here: a pending account can read nothing but its own profile.
const profile = await currentProfile();
if (!profile) location.href = 'index.html';
else if (MEMBERS.includes(profile.role)) location.href = 'samples.html';
else {
  renderShell(profile);
  document.getElementById('sign-out').addEventListener('click', () => signOut());
}
