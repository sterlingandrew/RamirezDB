import { currentProfile, signIn } from '../auth.js';
import { renderShell } from '../shell.js';

const profile = await currentProfile();
renderShell(profile);
if (profile) location.href = 'samples.html';

const form = document.getElementById('signin');
const errorEl = document.getElementById('signin-error');

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorEl.hidden = true;
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    await signIn(form.email.value.trim(), form.password.value);
    location.href = 'samples.html';
  } catch {
    // Deliberately vague: don't reveal whether the address has an account.
    errorEl.textContent = 'That email and password did not match an account.';
    errorEl.hidden = false;
    button.disabled = false;
  }
});
