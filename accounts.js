// Login accounts, used by the login page (index.html) and the Staff page (staff.html).
//
// With the online database (supabase-config.js + cloud.js), logins are checked by Supabase.
// Authorized managers create staff logins from the Staff page; their Position there is their role.
//
// Without the online database, only Staff-page logins saved in this browser work.
// There are no built-in accounts: passwords written here would be readable by anyone who opens
// the website's code, so they were removed.
const ACCOUNTS = {};

const STAFF_KEY = "aircon_staff";

// Staff passwords are stored scrambled (SHA-256), never as typed
async function hashPassword(username, password) {
  const data = new TextEncoder().encode("aircon-god|" + username.toLowerCase() + "|" + password);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

// The online database is set up, so only its logins count
const USES_CLOUD = typeof SUPABASE_URL !== "undefined";

// Returns { user, name, role } for a correct login, { error } for a problem, otherwise null
async function checkLogin(username, password) {
  if (USES_CLOUD) {
    if (!window.cloudLogin) return { error: "Can't reach the online database. Check the internet and refresh." };
    return window.cloudLogin(username, password);
  }

  const user = username.trim().toLowerCase();
  const builtIn = ACCOUNTS[user];
  if (builtIn) return password === builtIn.password ? { user, name: builtIn.name, role: builtIn.role } : null;

  const staff = JSON.parse(localStorage.getItem(STAFF_KEY) || "[]")
    .find((s) => (s.username || "").toLowerCase() === user && s.passHash);
  if (!staff || staff.status !== "Active") return null;
  return (await hashPassword(user, password)) === staff.passHash
    ? { user, name: staff.name, role: staff.position }
    : null;
}

const isDeveloper = () => String(sessionStorage.getItem("aircon_role") || "").trim().toLowerCase() === "developer";
