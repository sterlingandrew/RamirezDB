// Landing page for the reset link from forgot.html. The Supabase client reads
// the recovery token from the URL on load and signs the visitor in, which is
// what lets updateUser() set the new password.
import { supabase } from '../supabase.js';
import { currentSession, MEMBERS, currentProfile } from '../auth.js';
import { renderShell } from '../shell.js';
import { MIN_PASSWORD } from '../config.js';

renderShell(null);

const statusEl = document.getElementById('status');
const form = document.getElementById('reset');
const errorEl = document.getElementById('reset-error');

// An expired or reused link comes back as #error=...&error_description=...
const hash = new URLSearchParams((window.RESET_HASH ?? location.hash).slice(1));
const session = await currentSession();

if (hash.get('error') || !session) {
  statusEl.replaceChildren(
    'This reset link has expired or was already used. ',
    Object.assign(document.createElement('a'), { href: 'forgot.html', textContent: 'Send a new one' }),
    '.',
  );
} else {
  statusEl.hidden = true;
  form.hidden = false;
  form.password.minLength = MIN_PASSWORD;
  document.getElementById('password-hint').textContent = `At least ${MIN_PASSWORD} characters.`;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorEl.hidden = true;
  const password = form.password.value;
  const fail = (message) => { errorEl.textContent = message; errorEl.hidden = false; };

  if (password.length < MIN_PASSWORD) return fail(`Your password needs at least ${MIN_PASSWORD} characters.`);
  if (password !== form.confirm.value) return fail('The two passwords don\'t match.');

  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    button.disabled = false;
    return fail(error.code === 'weak_password'
      ? 'Please choose a different password: ' + error.message
      : 'Your password could not be saved. ' + error.message);
  }

  const profile = await currentProfile();
  location.href = profile && MEMBERS.includes(profile.role) ? 'samples.html' : 'pending.html';
});
