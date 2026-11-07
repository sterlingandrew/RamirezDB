// Cloudflare Turnstile, which Supabase Auth checks on sign-in, sign-up and
// password reset once CAPTCHA is on (Authentication → Attack Protection).
//
// Each token works once: call reset() after every attempt, failed or not.
// With no site key configured this is a no-op and token() returns undefined,
// which Supabase accepts while CAPTCHA is off.
import { TURNSTILE_SITE_KEY } from './config.js';

const SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
let loading;

function load() {
  loading ??= new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = SRC;
    s.async = true;
    s.onload = () => resolve(window.turnstile);
    s.onerror = () => reject(new Error('Could not load the CAPTCHA.'));
    document.head.append(s);
  });
  return loading;
}

export async function mountCaptcha(host) {
  if (!TURNSTILE_SITE_KEY || !host) {
    return { token: () => undefined, reset() {} };
  }
  let current;
  const turnstile = await load();
  const id = turnstile.render(host, {
    sitekey: TURNSTILE_SITE_KEY,
    callback: (t) => { current = t; },
    'expired-callback': () => { current = undefined; },
    'error-callback': () => { current = undefined; },
  });
  return {
    token: () => current,
    reset() { current = undefined; turnstile.reset(id); },
    required: true,
  };
}
