import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = window.ENV?.SUPABASE_URL || import.meta.env?.VITE_SUPABASE_URL;
const supabaseAnonKey = window.ENV?.SUPABASE_ANON_KEY || import.meta.env?.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Critical configuration error: Missing required public environment variables.');
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: false
    }
});
