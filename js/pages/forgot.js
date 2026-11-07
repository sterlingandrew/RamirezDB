import { supabase } from '../supabase.js';
import { siteUrl } from '../auth.js';
import { renderShell } from '../shell.js';
import { mountCaptcha } from '../captcha.js';

renderShell(null);

const form = document.getElementById('forgot');
const errorEl = document.getElementById('forgot-error');
const captcha = await mountCaptcha(document.getElementById('captcha'));

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorEl.hidden = true;
  const email = form.email.value.trim();
  if (!email || !form.email.checkValidity()) {
    errorEl.textContent = 'Please enter the email address you signed up with.';
    errorEl.hidden = false;
    return;
  }
  if (captcha.required && !captcha.token()) {
    errorEl.textContent = 'Please complete the check above the button.';
    errorEl.hidden = false;
    return;
  }

  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: siteUrl('reset.html'),
    captchaToken: captcha.token(),
  });
  captcha.reset();

  // Only real failures (CAPTCHA, rate limit) come back as errors. An unknown
  // address succeeds silently, so the page never reveals who has an account.
  if (error) {
    errorEl.textContent = error.status === 429
      ? 'Too many reset emails just now. Please try again in an hour.'
      : 'The link could not be sent. ' + error.message;
    errorEl.hidden = false;
    button.disabled = false;
    return;
  }
  document.getElementById('sent-email').textContent = email;
  form.hidden = true;
  document.getElementById('sent').hidden = false;
});
