// The one shared client. Every module imports this — never construct another,
// or you get two sessions that disagree about who is signed in.
//
// Version is pinned deliberately: an unpinned import lets a vendor release
// break the live site with no commit on our side. Bump it on purpose.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4';
import { SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY } from './config.js';

export const supabase = createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: true, autoRefreshToken: true },
});
