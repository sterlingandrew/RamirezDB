import { currentProfile, signIn, MEMBERS } from '../auth.js';
import { renderShell } from '../shell.js';
import { mountCaptcha } from '../captcha.js';

const home = (profile) => MEMBERS.includes(profile.role) ? 'samples.html' : 'pending.html';

const profile = await currentProfile();
renderShell(profile);
if (profile) location.href = home(profile);

const form = document.getElementById('signin');
const errorEl = document.getElementById('signin-error');
const captcha = await mountCaptcha(document.getElementById('captcha'));

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorEl.hidden = true;
  if (captcha.required && !captcha.token()) {
    errorEl.textContent = 'Please complete the check above the button.';
    errorEl.hidden = false;
    return;
  }
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    await signIn(form.email.value.trim(), form.password.value, captcha.token());
    location.href = home(await currentProfile() ?? { role: 'pending' });
  } catch (error) {
    // Deliberately vague: don't reveal whether the address has an account.
    // "Not confirmed" is only returned for a correct password, so it's safe.
    errorEl.textContent = error?.code === 'email_not_confirmed'
      ? 'Please confirm your email address first — the link is in the email we sent you.'
      : 'That email and password did not match an account.';
    errorEl.hidden = false;
    button.disabled = false;
    captcha.reset();
  }
});
