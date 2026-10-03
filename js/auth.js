import { supabase } from './supabase.js';

export const ROLES = ['user', 'personnel', 'admin'];

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
    .select('id, full_name, role')
    .eq('id', session.user.id)
    .single();
  if (error) return null;
  return { ...data, email: session.user.email };
}

export async function signIn(email, password) {
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
}

export async function signOut() {
  await supabase.auth.signOut();
  location.href = 'index.html';
}

// Redirects signed-out visitors away, and signed-in visitors without one of
// `allow` back to the samples list.
//
// This is convenience, not security. Hiding a page hides nothing — the policies
// in supabase/migrations/0003_rls_policies.sql are the only real boundary.
export async function requireRole(allow = ROLES) {
  const profile = await currentProfile();
  if (!profile) { location.href = 'index.html'; return null; }
  if (!allow.includes(profile.role)) { location.href = 'samples.html'; return null; }
  return profile;
}
