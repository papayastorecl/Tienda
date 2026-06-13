const SUPABASE_URL =
'https://cfhjywllsnsurulywoyc.supabase.co';

const SUPABASE_KEY =
'TU_PUBLISHABLE_KEY';

const supabaseClient =
window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
);