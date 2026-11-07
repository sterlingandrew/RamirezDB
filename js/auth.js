import { supabase } from './supabase.js';

export const ROLES = ['pending', 'personnel', 'admin'];

// Roles that can see lab data. `pending` has asked for access and sees none.
export const MEMBERS = ['personnel', 'admin'];

// A page in the folder the site is served from, e.g.
// https://sterlingandrew.github.io/RamirezDB/pending.html. Links in auth emails
// must land under a URL in Supabase's redirect allow-list (docs/operations.md).
export const siteUrl = (page) => new URL(page, location.href).href;

export async function currentSession() {
  const { data } = await supabase.auth.getSession();
  return data.session ?? null;
}

// The profile row carries the role. Roles are never read from user metadata —
// metadata is user-writable, profiles.role is not.
export async function currentProfile() {
  const session = await currentSession();
  if (!session) return null;
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, role, affiliation, reason, created_at')
    .eq('id', session.user.id)
    .single();
  if (error) return null;
  return { ...data, email: session.user.email };
}

export async function signIn(email, password, captchaToken) {
  const { error } = await supabase.auth.signInWithPassword({
    email, password, options: { captchaToken },
  });
  if (error) throw error;
}

// Creates a pending account. handle_new_user() (0007) copies full_name,
// affiliation and reason from this metadata into profiles. The role is never
// taken from here.
export async function requestAccess({ email, password, full_name, affiliation, reason }, captchaToken) {
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      captchaToken,
      data: { full_name, affiliation, reason },
      emailRedirectTo: siteUrl('pending.html'),
    },
  });
  if (error) throw error;
}

export async function signOut() {
  await supabase.auth.signOut();
  location.href = 'index.html';
}

// Redirects signed-out visitors to the landing page, pending accounts to
// pending.html, and members without one of `allow` back to the samples list.
//
// This is convenience, not security. Hiding a page hides nothing — the policies
// in supabase/migrations/0003 and 0006 are the only real boundary.
export async function requireRole(allow = MEMBERS) {
  const profile = await currentProfile();
  if (!profile) { location.href = 'index.html'; return null; }
  if (allow.includes(profile.role)) return profile;
  location.href = MEMBERS.includes(profile.role) ? 'samples.html' : 'pending.html';
  return null;
}
