/* ============================================================
   VOLMERRA — Supabase backend configuration (example)
   ------------------------------------------------------------
   Copy this file to `config.js` (same folder) and fill in your
   project values (Supabase dashboard → Project Settings → API):

     Project URL  -> url
     anon public  -> anonKey

   The anon key is public by design: Row Level Security decides
   what it can do. Keep the service_role key out of this file
   and out of the repository.

   `config.js` ships with the site (it is committed). Without
   it the website falls back to the localStorage adapters —
   every browser/device then keeps its own separate data.
   ============================================================ */

window.VOLMERRA_BACKEND = {
  url: "https://YOUR-PROJECT-REF.supabase.co",
  anonKey: "YOUR-ANON-PUBLIC-KEY",
};

/* This alternative shape is also accepted:
window.VOLMERRA_CONFIG = {
  supabaseUrl: "https://YOUR-PROJECT-REF.supabase.co",
  supabaseAnonKey: "YOUR-ANON-PUBLIC-KEY",
};
*/
