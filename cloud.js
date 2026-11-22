// Online database (Supabase) for the whole website.
//
// The pages keep saving to the browser's storage like before; this file copies those saves to the
// database and brings in changes made on other PCs, so every device shares the same data.
// Load it in <head> after the Supabase library and supabase-config.js.
(function () {
  if (typeof supabase === "undefined" || typeof SUPABASE_URL === "undefined") return;

  // The database login is kept per TAB (sessionStorage), like the website's own login (aircon_user /
  // aircon_role). Before, it was shared by every tab: logging in as someone else in one tab silently
  // switched the database login of all the others, so a tab showing "Owner" was really saving as e.g.
  // an Installer and the database refused it.
  const db = supabase.createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { storage: window.sessionStorage, persistSession: true } });
  // The old shared login (from before this change) isn't used any more: remove it
  try { Object.keys(localStorage).filter((k) => /^sb-.*-auth-token/.test(k)).forEach((k) => localStorage.removeItem(k)); } catch (e) {}
  window.cloud = db;

  // Data shared between devices, with what an empty one looks like
  const SYNCED = {
    aircon_stock: [], aircon_scans: [], aircon_items: [], aircon_jobs: [],
    aircon_staff: [], aircon_schedule: {}, aircon_daily: {}, aircon_serials: [],
    aircon_employees: [], aircon_leave: [], aircon_warnings: [],
    aircon_cv: [],   // Cash Vouchers (cashvoucher.html)
    aircon_ocular: [],   // Ocular surveys sent by installers (ocular.html / ocular.js), quoted from the Dashboard
    aircon_prices: [], // Price List overrides (Developer editable)
    aircon_teams: {},  // Installation teams and incentive shares (Payroll → Teams & incentive; supabase/team_incentives.sql)
    // History records of the Warranty quotation, Formal Quotation and Agreement pages (history.js)
    aircon_hist_quotation: [], aircon_hist_formal: [], aircon_hist_agreement: [],
  };
  // Lists where each person may only see and send THEIR OWN entries (leave requests, cash advances, warnings).
  // Developer / Owner / HR get the whole list; everyone else gets only their own through two database functions
  // (supabase/protect_private_data.sql). Until those functions exist, the shared block is used as before.
  const PRIVATE_LISTS = ["aircon_leave", "aircon_warnings"];
  const privateMode = {};   // key → true once those functions answered

  // Data kept as ONE ROW PER RECORD in its own table (instead of one shared block in app_data).
  // Pages still read and write the whole list in the browser as before; this file saves only the
  // records that changed, so two people saving at the same time no longer overwrite each other.
  // "Deleting" a record only hides it (deleted_at). If the table isn't set up yet, the old way is used.
  // id: what makes each record unique (must match how supabase/*.sql copied the old data in)
  const ROW_TABLES = {
    aircon_jobs: { table: "job_orders", id: (r) => r.id, numeric: true },                            // job_orders.sql
    aircon_stock: { table: "stock_units", id: (r) => String(r.barcode ?? "").trim() },               // stock.sql
    aircon_items: { table: "stock_items", id: (r) => r.id },                                         // stock.sql
    aircon_cv: { table: "cash_vouchers", id: (r) => r.id, numeric: true },                           // security_sales_cv.sql
    aircon_serials: { table: "serial_numbers", id: (r) => String(r.serial ?? "").trim().toLowerCase() }, // stock.sql
    // Saved as { key: entry } instead of a list: each key (a date, or a date|slot cell) is one row
    aircon_daily: { table: "daily_schedule", object: true },                                         // schedules.sql
    aircon_schedule: { table: "weekly_schedule", object: true },                                     // schedules.sql
  };
  // A record with no id/serial of its own gets a hidden "_rid", so it can still be saved one row each
  const rowId = (key, r) => {
    if (!r || typeof r !== "object") return "";
    const v = ROW_TABLES[key].id(r);
    const own = v == null ? "" : String(v);
    return own || (r._rid ? String(r._rid) : "");
  };
  const dbId = (key, id) => (ROW_TABLES[key].numeric ? Number(id) : id);
  const rowMode = {};    // key → true once its table answered
  const lastRows = {};   // key → Map(id → the record as last saved/loaded)

  // Pages that redraw by themselves when data changes; others get a "Refresh" note
  const LIVE_PAGES = ["dashboard.html", "inventory.html", "customers.html", "schedule.html", "dailysched.html", "staff.html", "jo-records.html"];

  const page = location.pathname.split("/").pop() || "index.html";
  const onLoginPage = page === "index.html";
  const rawSet = Storage.prototype.setItem;
  const rawRemove = Storage.prototype.removeItem;

  // Same data written in a different key order still counts as the same
  const canon = (text) => {
    try {
      const sort = (v) => Array.isArray(v) ? v.map(sort)
        : v && typeof v === "object" ? Object.keys(v).sort().reduce((o, k) => ((o[k] = sort(v[k])), o), {}) : v;
      return JSON.stringify(sort(JSON.parse(text)));
    } catch (e) {
      return text;
    }
  };
  const writeLocal = (key, value) => rawSet.call(localStorage, key, JSON.stringify(value));

  // ---------- Logging in (used by accounts.js) ----------
  const loginEmail = (name) => {
    const n = String(name || "").trim().toLowerCase();
    return n.includes("@") ? n : n + "@" + LOGIN_DOMAIN;
  };
  window.loginEmail = loginEmail;

  // Audit log entry (supabase/audit_events.sql): "login", or "view" of a page. A missing function or
  // no internet is ignored: the website works the same without it.
  const logEvent = (kind, place) => db.rpc("log_event", place ? { kind, place } : { kind }).then(() => {}, () => {});

  // Returns { user, name, role }, { error } or null for a wrong password
  window.cloudLogin = async (username, password) => {
    // A username may belong to an account made with the person's own email (e.g. Gmail)
    let email = loginEmail(username);
    if (!String(username).includes("@")) {
      const { data: found } = await db.rpc("login_email", { uname: String(username).trim() });
      if (found) email = String(found).toLowerCase();
    }
    const { error } = await db.auth.signInWithPassword({ email, password });
    if (error) return /fetch|network/i.test(error.message) ? { error: "Can't reach the online database. Check the internet." } : null;

    // Role: their Position on the Staff page; owners in DEVELOPER_EMAILS are Developers
    const { data } = await db.from("app_data").select("value").eq("key", "aircon_staff");
    const staff = ((data && data[0] && data[0].value) || []).find((s) => s.username && (s.login || loginEmail(s.username)) === email);
    if (staff && staff.status !== "Active") {
      await db.auth.signOut();
      return { error: "This account is not active. Please ask a Developer." };
    }
    // Audit log: who signed in. Waits briefly so the login page's move to the Dashboard doesn't
    // cut it off; never blocks or breaks the login.
    await Promise.race([logEvent("login"), new Promise((r) => setTimeout(r, 3000))]);
    if (DEVELOPER_EMAILS.map((e) => e.toLowerCase()).includes(email)) {
      return { user: email, name: staff ? staff.name : email.split("@")[0], role: "Developer" };
    }
    if (staff) return { user: email, name: staff.name, role: staff.position };
    return { user: email, name: email.split("@")[0], role: "Staff" };
  };

  // The login page always starts logged out of the database too
  if (onLoginPage) {
    if (!sessionStorage.getItem("aircon_user")) db.auth.signOut({ scope: "local" });
    return;
  }

  // ---------- Saving: copy every change of shared data to the database ----------
  const lastSynced = {};   // what the database has, per key
  const timers = {};
  let pending = 0;

  // Save only the records that were added, changed or removed since the last save
  async function uploadRows(key) {
    const cfg = ROW_TABLES[key];
    const table = cfg.table;
    let list = cfg.object ? {} : [];
    try { list = JSON.parse(localStorage.getItem(key) || (cfg.object ? "{}" : "[]")); } catch (e) {}
    const now = new Map();
    let missing = 0;   // records that aren't objects can't be saved online
    if (cfg.object) {
      // { "2026-11-09": {...}, ... }: each key is one row
      if (!list || typeof list !== "object" || Array.isArray(list)) list = {};
      Object.entries(list).forEach(([id, r]) => { if (r != null) now.set(id, r); });
    } else {
      if (!Array.isArray(list)) list = [];
      let gaveIds = false;
      list.forEach((r) => {
        if (r && typeof r === "object" && !rowId(key, r)) { r._rid = "r" + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); gaveIds = true; }
        const id = rowId(key, r);
        if (id) now.set(id, r); else missing++;
      });
      if (gaveIds) writeLocal(key, list);
    }
    const before = lastRows[key];
    const changed = [], gone = [];   // changed: [id, record]
    now.forEach((r, id) => { if (before.get(id) !== canon(JSON.stringify(r))) changed.push([id, r]); });
    before.forEach((_, id) => { if (!now.has(id)) gone.push(id); });
    if (!changed.length && !gone.length) {
      if (missing) badge("error", "A record without a serial number / ID can't be saved online.");
      return null;
    }

    pending++;
    badge("saving");
    let error = null;
    if (changed.length) {
      ({ error } = await db.from(table).upsert(changed.map(([id, r]) => ({ id: dbId(key, id), data: r, deleted_at: null }))));
    }
    if (!error && gone.length) {
      ({ error } = await db.from(table).update({ deleted_at: new Date().toISOString() }).in("id", gone.map((id) => dbId(key, id))));
    }
    pending--;
    if (error) { badge("error", error.message); return error.message; }
    changed.forEach(([id, r]) => before.set(id, canon(JSON.stringify(r))));
    gone.forEach((id) => before.delete(id));
    lastSynced[key] = canon(JSON.stringify(list));
    if (missing) { badge("error", "A record without a serial number / ID can't be saved online."); return null; }
    if (!pending) badge("saved");
    return null;
  }

  // Shared block in app_data: returns the error message, or null when saved (or nothing changed)
  async function uploadBlock(key) {
    const text = localStorage.getItem(key);
    const value = text ? JSON.parse(text) : SYNCED[key];
    if (lastSynced[key] === canon(JSON.stringify(value))) return null;
    pending++;
    badge("saving");
    if (privateMode[key]) {
      // The database merges what this person may change into the list and returns what they now have
      const { data: saved, error: rpcError } = await db.rpc("save_private_list", { k: key, v: value });
      pending--;
      if (rpcError) { badge("error", rpcError.message); return rpcError.message; }
      const back = Array.isArray(saved) ? saved : value;
      const backText = JSON.stringify(back);
      if (canon(backText) !== canon(JSON.stringify(value))) {   // the database changed something (e.g. a new request is always Pending)
        writeLocal(key, back);
        window.dispatchEvent(new StorageEvent("storage", { key, newValue: backText }));
      }
      lastSynced[key] = canon(backText);
      if (!pending) badge("saved");
      return null;
    }
    const { error } = await db.from("app_data").upsert({ key, value, updated_at: new Date().toISOString() });
    pending--;
    if (error) { badge("error", error.message); return error.message; }
    lastSynced[key] = canon(JSON.stringify(value));
    if (!pending) badge("saved");
    return null;
  }

  function upload(key) {
    clearTimeout(timers[key]);
    timers[key] = setTimeout(() => (rowMode[key] ? uploadRows(key) : uploadBlock(key)), 400);
  }

  // Save one key to the database NOW and wait for the answer (pages use it when something must be
  // online before moving on, e.g. Customer Records booking a client in the schedules).
  // Returns null when saved, or the reason it wasn't.
  window.cloudSaveNow = async (key) => {
    if (!(key in SYNCED)) return null;
    await window.cloudReady;
    if (!ready) return "Not connected to the online database.";
    clearTimeout(timers[key]);
    try {
      return await (rowMode[key] ? uploadRows(key) : uploadBlock(key));
    } catch (e) {
      return e.message || String(e);
    }
  };

  Storage.prototype.setItem = function (key, value) {
    rawSet.call(this, key, value);
    if (this === localStorage && key in SYNCED && ready) upload(key);
  };
  Storage.prototype.removeItem = function (key) {
    rawRemove.call(this, key);
    if (this === localStorage && key in SYNCED && ready) upload(key);
  };

  // ---------- Opening a page: load the latest data first ----------
  let ready = false;
  // Pages can wait for this before saving anything at start-up (saves before it aren't uploaded)
  let markReady;
  window.cloudReady = new Promise((resolve) => (markReady = resolve));
  const style = document.createElement("style");
  style.textContent = `
    html.cloud-loading body { visibility: hidden; }
    #cloudBadge { position: fixed; right: 14px; bottom: 12px; z-index: 9000; padding: 6px 12px;
      border-radius: 99px; background: #fff; border: 1px solid #dbe4e7; box-shadow: 0 2px 8px rgba(0,0,0,.08);
      font: 600 12px system-ui, "Segoe UI", sans-serif; color: #475569; }
    #cloudBadge.saved { color: #15803d; } #cloudBadge.saving { color: #b45309; } #cloudBadge.error { color: #b42318; }
    #cloudBadge button { margin-left: 8px; border: 0; background: none; color: #0f766e; font: inherit; cursor: pointer; text-decoration: underline; }
    @media print { #cloudBadge { display: none !important; } }`;
  document.head.appendChild(style);
  document.documentElement.classList.add("cloud-loading");
  const show = () => document.documentElement.classList.remove("cloud-loading");
  setTimeout(show, 4000);   // never keep the page hidden for long

  function badge(state, detail) {
    const run = () => {
      let b = document.getElementById("cloudBadge");
      if (!b) { b = document.createElement("div"); b.id = "cloudBadge"; document.body.appendChild(b); }
      b.className = state;
      b.title = detail || "";
      b.innerHTML = {
        saved: "☁ Saved online",
        saving: "☁ Saving…",
        error: "⚠ Not saved online",
        offline: "⚠ Offline: changes stay on this PC",
        changed: '☁ Updated from another device<button type="button" onclick="location.reload()">Refresh</button>',
      }[state];
    };
    document.body ? run() : document.addEventListener("DOMContentLoaded", run);
  }

  async function start() {
    const { data: auth } = await db.auth.getSession();
    // Not logged in to the database, or logged in as someone other than this tab's user: log in again
    const tabUser = String(sessionStorage.getItem("aircon_user") || "").trim().toLowerCase();
    const dbUser = String((auth.session && auth.session.user && auth.session.user.email) || "").toLowerCase();
    if (!auth.session || (tabUser.includes("@") && dbUser && dbUser !== tabUser)) {
      if (auth.session) await db.auth.signOut({ scope: "local" });
      sessionStorage.clear();
      location.replace("index.html");
      return;
    }

    const { data, error } = await db.from("app_data").select("key, value");
    if (error) {
      show();
      markReady();
      return badge("offline", error.message);
    }

    // Records kept one row each (job orders, stock, schedules): load them from their own tables
    let changed = false;
    for (const [key, cfg] of Object.entries(ROW_TABLES)) {
      const res = await db.from(cfg.table).select("id,data").is("deleted_at", null).order("created_at").order("id");
      if (res.error) continue;   // table not set up yet: keep using the shared block for this key
      rowMode[key] = true;
      let list;
      if (cfg.object) {
        // { "2026-11-09": {...}, ... } rebuilt from one row per key
        list = Object.fromEntries((res.data || []).map((r) => [String(r.id), r.data]));
        lastRows[key] = new Map(Object.entries(list).map(([id, r]) => [id, canon(JSON.stringify(r))]));
      } else {
        // A record copied in without an id/serial of its own keeps the database's id as its hidden "_rid"
        list = (res.data || []).map((r) => (rowId(key, r.data) === String(r.id) ? r.data : { ...r.data, _rid: String(r.id) }));
        lastRows[key] = new Map(list.map((r) => [rowId(key, r), canon(JSON.stringify(r))]));
      }
      const text = JSON.stringify(list);
      lastSynced[key] = canon(text);
      if (canon(localStorage.getItem(key)) !== canon(text)) {
        writeLocal(key, list);
        changed = true;
      }
    }

    // Bring in what other devices saved
    const inCloud = new Set();
    data.forEach((row) => {
      if (!(row.key in SYNCED) || rowMode[row.key]) return;
      inCloud.add(row.key);
      const text = JSON.stringify(row.value);
      lastSynced[row.key] = canon(text);
      if (canon(localStorage.getItem(row.key)) !== canon(text)) {
        writeLocal(row.key, row.value);
        changed = true;
      }
    });
    // Leave requests, cash advances, warnings: only this person's own entries (the whole list for Developer / Owner / HR)
    const privateLists = await Promise.all(PRIVATE_LISTS.map((key) => db.rpc("my_private_list", { k: key })));
    for (const [i, key] of PRIVATE_LISTS.entries()) {
      const { data: mine, error: privError } = privateLists[i];
      if (privError || !Array.isArray(mine)) continue;   // supabase/protect_private_data.sql not run yet: shared block as before
      privateMode[key] = true;
      const text = JSON.stringify(mine);
      lastSynced[key] = canon(text);
      if (canon(localStorage.getItem(key)) !== canon(text)) {
        writeLocal(key, mine);
        changed = true;
      }
    }
    ready = true;

    // First time online: a Developer's existing data on this PC is uploaded
    if (sessionStorage.getItem("aircon_role") === "Developer") {
      Object.keys(SYNCED).forEach((key) => { if (!rowMode[key] && !inCloud.has(key) && localStorage.getItem(key)) upload(key); });
    }

    // The page already drew the old data, so draw it again once with the latest
    const flag = "cloud_reloaded:" + page;
    if (changed && !sessionStorage.getItem(flag)) {
      sessionStorage.setItem(flag, "1");
      location.reload();
      return;
    }
    sessionStorage.removeItem(flag);
    if (page !== "dashboard.html") logEvent("view", page);   // Audit log: who opened this page (not the Dashboard, which everyone opens all day)
    show();
    badge("saved");
    markReady();

    // Live changes from other devices
    db.channel("app_data")
      .on("postgres_changes", { event: "*", schema: "public", table: "app_data" }, (change) => {
        const row = change.new;
        if (!row || !(row.key in SYNCED) || rowMode[row.key]) return;
        const text = JSON.stringify(row.value);
        lastSynced[row.key] = canon(text);
        if (canon(localStorage.getItem(row.key)) === canon(text)) return;   // our own save coming back
        writeLocal(row.key, row.value);
        window.dispatchEvent(new StorageEvent("storage", { key: row.key, newValue: text }));
        if (!LIVE_PAGES.includes(page)) badge("changed");
      })
      .subscribe();

    // Live changes to one-row-per-record tables: add, update or remove just that record
    Object.entries(ROW_TABLES).forEach(([key, cfg]) => {
      if (!rowMode[key]) return;
      const table = cfg.table;
      db.channel("rows-" + table)
        .on("postgres_changes", { event: "*", schema: "public", table }, (change) => {
          const row = change.new;
          if (!row || row.id == null || row.data == null) return;
          if (cfg.object) {
            // One day / cell changed: put just that key back into the { key: entry } object
            const id = String(row.id);
            let obj = {};
            try { obj = JSON.parse(localStorage.getItem(key) || "{}"); } catch (e) {}
            if (!obj || typeof obj !== "object" || Array.isArray(obj)) obj = {};
            if (row.deleted_at) {
              lastRows[key].delete(id);
              if (!(id in obj)) return;
              delete obj[id];
            } else {
              const c = canon(JSON.stringify(row.data));
              if (lastRows[key].get(id) === c && id in obj) return;   // our own save coming back
              lastRows[key].set(id, c);
              obj[id] = row.data;
            }
            const text = JSON.stringify(obj);
            lastSynced[key] = canon(text);
            writeLocal(key, obj);
            window.dispatchEvent(new StorageEvent("storage", { key, newValue: text }));
            if (!LIVE_PAGES.includes(page)) badge("changed");
            return;
          }
          const data = rowId(key, row.data) === String(row.id) ? row.data : { ...row.data, _rid: String(row.id) };
          const id = rowId(key, data);
          let list = [];
          try { list = JSON.parse(localStorage.getItem(key) || "[]"); } catch (e) {}
          if (!Array.isArray(list)) list = [];
          const i = list.findIndex((r) => rowId(key, r) === id);
          if (row.deleted_at) {
            lastRows[key].delete(id);
            if (i < 0) return;
            list.splice(i, 1);
          } else {
            const c = canon(JSON.stringify(data));
            if (lastRows[key].get(id) === c && i >= 0) return;   // our own save coming back
            lastRows[key].set(id, c);
            if (i >= 0) list[i] = data; else list.push(data);
          }
          const text = JSON.stringify(list);
          lastSynced[key] = canon(text);
          writeLocal(key, list);
          window.dispatchEvent(new StorageEvent("storage", { key, newValue: text }));
          if (!LIVE_PAGES.includes(page)) badge("changed");
        })
        .subscribe();
    });
  }

  start();
})();
