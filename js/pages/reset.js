// Landing page for the reset link from forgot.html. The Supabase client reads
// the recovery token from the URL on load and signs the visitor in, which is
// what lets updateUser() set the new password.
import { supabase } from '../supabase.js';
import { currentSession, MEMBERS, currentProfile } from '../auth.js';
import { renderShell } from '../shell.js';
import { attachPasswordHint, passwordMessage, weakPasswordMessage } from '../password.js';

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
  attachPasswordHint(form.password, document.getElementById('password-hint'));
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorEl.hidden = true;
  const password = form.password.value;
  const fail = (message) => { errorEl.textContent = message; errorEl.hidden = false; };

  const passwordError = passwordMessage(password);
  if (passwordError) return fail(passwordError);
  if (password !== form.confirm.value) return fail('The two passwords don\'t match.');

  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  const { error } = await supabase.auth.updateUser({ password });
  if (error) {
    button.disabled = false;
    return fail(error.code === 'weak_password'
      ? weakPasswordMessage(error, password)
      : 'Your password could not be saved. ' + error.message);
  }

  const profile = await currentProfile();
  location.href = profile && MEMBERS.includes(profile.role) ? 'samples.html' : 'pending.html';
});
