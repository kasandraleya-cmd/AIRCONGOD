// Connection to the AIRCON G.O.D online database (Supabase).
// The URL and publishable key are safe to have in the website; the database's security rules
// only let logged-in staff read or change data. Never put a secret / service_role key here.
const SUPABASE_URL = "https://mbzptcotbdstlylyrrmc.supabase.co";
const SUPABASE_KEY = "sb_publishable_Zyhs8NjlWt-L-RhFN1tDVA_kM4ykoiw";

// These logins are always Developers, even before they're added on the Staff page
const DEVELOPER_EMAILS = ["kasandraleya@gmail.com"];

// Staff without a real email log in with a short username; it becomes username@aircongod.app
const LOGIN_DOMAIN = "aircongod.app";
