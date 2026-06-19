const SUPABASE_URL =
'https://cfhjywllsnsurulywoyc.supabase.co';

const SUPABASE_KEY =
'sb_publishable_zJzWm_HJp5ykplTBnH0oiA_dqJbK9T1';

const supabaseClient =
window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_KEY
);

console.log("✅ Supabase conectado");

async function testSupabase() {

    const { data, error } =
    await supabaseClient
        .from('configuracion')
        .select('*');

    console.log("CONFIG:", data);

    if (error) {
        console.error("ERROR:", error);
    }
}

testSupabase();
