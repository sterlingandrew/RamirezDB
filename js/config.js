export const SUPABASE_URL = 'https://tusyiykdtblfuakjdrnw.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_hBM0ATamd8lJpue_l00svQ_tOw7AWr_';

// Cloudflare Turnstile site key (public, like the key above). Its secret half
// lives only in Supabase → Authentication → Attack Protection.
// Empty = no widget. Set this and deploy BEFORE turning CAPTCHA on in
// Supabase, or every sign-in, sign-up and reset will be refused.
export const TURNSTILE_SITE_KEY = '';

// Minimum password length. Must match Supabase → Authentication → Providers →
// Email → Minimum password length.
export const MIN_PASSWORD = 10;

// Page size for list views.
export const PAGE_SIZE = 50;
