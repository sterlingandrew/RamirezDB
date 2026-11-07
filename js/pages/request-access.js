import { currentProfile, requestAccess, MEMBERS } from '../auth.js';
import { renderShell } from '../shell.js';
import { mountCaptcha } from '../captcha.js';
import { MIN_PASSWORD } from '../config.js';

const profile = await currentProfile();
if (profile) location.href = MEMBERS.includes(profile.role) ? 'samples.html' : 'pending.html';
renderShell(null);

const form = document.getElementById('request');
const errorEl = document.getElementById('request-error');
form.password.minLength = MIN_PASSWORD;
document.getElementById('password-hint').textContent = `At least ${MIN_PASSWORD} characters.`;
const captcha = await mountCaptcha(document.getElementById('captcha'));

function fail(message) {
  errorEl.textContent = message;
  errorEl.hidden = false;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  errorEl.hidden = true;

  const value = (name) => form[name].value.trim();
  const fields = {
    full_name: value('full_name'),
    email: value('email'),
    password: form.password.value,
    affiliation: value('affiliation'),
    reason: value('reason'),
  };

  if (!fields.full_name || !fields.email || !fields.affiliation || !fields.reason) {
    return fail('Please fill in every field.');
  }
  if (!form.email.checkValidity()) return fail('That email address doesn\'t look right.');
  if (fields.password.length < MIN_PASSWORD) {
    return fail(`Your password needs at least ${MIN_PASSWORD} characters.`);
  }
  if (captcha.required && !captcha.token()) return fail('Please complete the check above the button.');

  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    await requestAccess(fields, captcha.token());
    // Supabase answers the same way for an address that already has an
    // account, so this never reveals who is registered.
    document.getElementById('sent-email').textContent = fields.email;
    form.hidden = true;
    document.getElementById('sent').hidden = false;
  } catch (error) {
    // weak_password covers both the length rule and leaked-password protection.
    fail(error?.code === 'weak_password'
      ? 'Please choose a different password: ' + error.message
      : error?.status === 429
        ? 'Too many requests just now. Please try again in an hour.'
        : 'Your request could not be sent. ' + (error?.message ?? ''));
    button.disabled = false;
    captcha.reset();
  }
});
