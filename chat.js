// Chat between staff, like Messenger: a chat bubble at the bottom-right of every page, a list of
// groups and staff, and small chat windows along the bottom of the screen.
//   * Private chats: the Supabase "messages" table (supabase/messages.sql); only the sender and the
//     person it was sent to can read them.
//   * Group chats: "chat_groups", "chat_group_members" and "group_messages" (supabase/group_chat.sql);
//     only a group's members can read them. "All staff" is a built-in group everyone is in.
// Load this at the end of <body>, after cloud.js.
(function () {
  if (!window.cloud || typeof DEVELOPER_EMAILS === "undefined") return;
  if (window.top !== window) return;   // a page shown inside a pop-up (Customer Records) has no chat of its own
  const db = window.cloud;

  const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const initial = (name) => (String(name).trim()[0] || "?").toUpperCase();
  const maxBoxes = () => (innerWidth < 700 ? 1 : innerWidth < 1150 ? 2 : 3);
  const STATE = "chat_open";            // chat windows stay open when going to another page
  const COLORS = ["#071d49"];
  const colorOf = (email) => COLORS[[...email].reduce((n, c) => n + c.charCodeAt(0), 0) % COLORS.length];
  // Names in group chats get one of these colours, so it's easy to see who wrote what
  const NAME_COLORS = ["#0f766e", "#b45309", "#7c3aed", "#be123c", "#1d4ed8", "#15803d", "#a16207", "#0e7490"];
  const nameColor = (email) => NAME_COLORS[[...email].reduce((n, c) => n + c.charCodeAt(0), 0) % NAME_COLORS.length];
  const iAmManager = () => typeof Roles !== "undefined" && Roles.me().staffAndPay;   // roles.js

  let me = "";
  let contacts = [];                    // [{ email, name, role }]
  let groups = [];                      // [{ id, name, created_by, is_all_staff, members: [email] }]
  let groupsNote = "";                  // why group chats can't work yet
  let online = new Set();
  let unread = {};                      // key → count (key = email, or "g:<id>" for a group)
  let notReady = "";                    // why chat can't work yet (table missing, etc.)
  const boxes = [];                     // open chat windows: { key, email | group, min, msgs, el }

  const gkey = (id) => "g:" + id;
  const isGroupKey = (key) => String(key).startsWith("g:");
  const groupOf = (key) => groups.find((g) => gkey(g.id) === key);

  // ---------- People you can message: staff with a login, plus the owners ----------
  const loginOf = (s) => (s.login || (s.username ? window.loginEmail(s.username) : "")).toLowerCase();
  function loadContacts() {
    let staff = [];
    try { staff = JSON.parse(localStorage.getItem("aircon_staff") || "[]"); } catch (e) {}
    const map = new Map();
    DEVELOPER_EMAILS.forEach((e) => map.set(e.toLowerCase(), { email: e.toLowerCase(), name: e.split("@")[0], role: "Developer" }));
    staff.filter((s) => s.username && s.status === "Active").forEach((s) => {
      const email = loginOf(s);
      map.set(email, { email, name: s.name || email.split("@")[0], role: s.position || "" });
    });
    map.delete(me);
    contacts = [...map.values()].sort((a, b) => a.name.localeCompare(b.name));
  }
  const person = (email) => email === me ? { email, name: "You", role: "" }
    : contacts.find((c) => c.email === email) || { email, name: email.split("@")[0], role: "" };
  const membersOf = (g) => g.is_all_staff ? [me, ...contacts.map((c) => c.email)] : g.members;
  const canManage = (g) => g && !g.is_all_staff && (g.created_by === me || iAmManager());

  // ---------- Look ----------
  const style = document.createElement("style");
  style.textContent = `
    #cloudBadge { right: 84px !important; bottom: 22px !important; }
    #chatLauncher { position: fixed; right: 18px; bottom: 16px; z-index: 9100; width: 54px; height: 54px; border-radius: 50%;
      border: 2px solid #d5a52a; background: linear-gradient(135deg, #0d2a60, #041432); color: #f4d477; font-size: 22px; cursor: pointer;
      box-shadow: 0 6px 18px rgba(4,20,50,.35); display: grid; place-items: center; }
    #chatLauncher:hover { filter: brightness(1.08); }
    .chat-count { position: absolute; top: -4px; right: -4px; min-width: 20px; height: 20px; padding: 0 6px; border-radius: 99px;
      background: #d5a52a; color: #071d49; font: 700 12px/20px system-ui, "Segoe UI", sans-serif; border: 2px solid #fff; }
    .chat-count[hidden], #chatPanel[hidden], .chat-modal[hidden] { display: none !important; }

    #chatPanel { position: fixed; right: 18px; bottom: 82px; z-index: 9100; width: 310px; max-width: calc(100vw - 36px);
      max-height: min(520px, 75vh); display: flex; flex-direction: column; background: #fff; border-radius: 14px;
      box-shadow: 0 12px 32px rgba(0,0,0,.18); border: 1px solid #e2e8f0; overflow: hidden;
      font: 14px system-ui, "Segoe UI", sans-serif; color: #0f172a; }
    .chat-panel-head { background: #071d49; color: #f4d477; }
    .chat-panel-head { display: flex; align-items: center; justify-content: space-between; gap: 6px; padding: 14px 12px 8px 16px; }
    .chat-panel-head b { flex: 1; font-size: 20px; }
    .chat-panel-head .chat-new { width: auto; height: 32px; padding: 0 12px; border-radius: 99px; border: 1px solid #d5a52a;
      color: #f4d477; font: 700 12.5px system-ui, "Segoe UI", sans-serif; }
    #chatPanel *, #chatDock *, .chat-modal * { box-sizing: border-box; }
    .chat-search { width: auto !important; margin: 10px 12px 8px; padding: 9px 14px; border-radius: 99px; border: 1px solid #e2e8f0; background: #f1f5f9; font: inherit; outline: none; }
    .chat-search:focus,
    .chat-search:focus-visible { border: 1px solid #d5a52a !important; outline: none !important; box-shadow: none !important; }
    .chat-list { overflow-y: auto; padding: 0 6px 8px; }
    .chat-sec { margin: 8px 10px 2px; color: #94a3b8; font-size: 11px; font-weight: 700; letter-spacing: .6px; text-transform: uppercase; }
    .chat-person { display: flex; align-items: center; gap: 10px; width: 100%; padding: 8px 10px; border: 0; background: none;
      border-radius: 10px; cursor: pointer; text-align: left; font: inherit; color: inherit; }
    .chat-person:hover { background: #f1f5f9; }
    .chat-person > span:not(.chat-av) { flex: 1; min-width: 0; }
    .chat-person b, .chat-person small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .chat-person small { color: #64748b; font-size: 12px; }
    .chat-person.has-new b { color: #071d49; }
    .chat-person em { font-style: normal; background: #d5a52a; color: #071d49; border-radius: 99px; padding: 1px 8px; font-size: 12px; font-weight: 700; }
    .chat-note { padding: 14px 16px; color: #64748b; font-size: 13px; line-height: 1.5; }

    .chat-av { position: relative; flex: none !important; margin: 0; width: 36px; height: 36px; border-radius: 50%; color: #fff; font-weight: 700;
      display: grid; place-items: center; font-size: 15px; }
    .chat-av i { position: absolute; right: -1px; bottom: -1px; width: 11px; height: 11px; border-radius: 50%;
      background: #d5a52a; border: 2px solid #fff; display: none; }
    .chat-av.on i { display: block; }
    .chat-av.group { background: linear-gradient(135deg, #d5a52a, #a8781a) !important; color: #071d49; font-size: 15px; }

    #chatDock { position: fixed; right: 84px; bottom: 0; z-index: 9050; display: flex; flex-direction: row-reverse;
      align-items: flex-end; gap: 10px; font: 14px system-ui, "Segoe UI", sans-serif; color: #0f172a; }
    .chat-box { position: relative; width: 328px; height: 440px; display: flex; flex-direction: column; background: #fff; border-radius: 12px 12px 0 0;
      box-shadow: 0 8px 28px rgba(0,0,0,.2); border: 1px solid #e2e8f0; overflow: hidden; }
    .chat-box.min { height: auto; }
    .chat-box.min .chat-msgs, .chat-box.min .chat-form { display: none; }
    .chat-head { display: flex; align-items: center; gap: 10px; padding: 8px 8px 8px 10px; border-bottom: 1px solid #e2e8f0; cursor: pointer; }
    .chat-box.flash .chat-head { background: #fbf5e4; }
    .chat-who { flex: 1; min-width: 0; }
    .chat-who b, .chat-who small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .chat-who small { color: #64748b; font-size: 12px; }
    .chat-head button, .chat-panel-head button { width: 32px; height: 32px; border: 0; border-radius: 50%; background: none;
      color: #b8860b; font-size: 18px; cursor: pointer; }
    .chat-head button[data-act="manage"] { font-size: 15px; }
    .chat-head button:hover, .chat-panel-head button:hover { background: #f1f5f9; }
    .chat-panel-head button:hover { background: rgba(255,255,255,.08); }
    .chat-msgs { flex: 1; overflow-y: auto; padding: 10px 12px; display: flex; flex-direction: column; gap: 3px; }
    .chat-time { align-self: center; margin: 8px 0 4px; color: #94a3b8; font-size: 11px; }
    .chat-from { align-self: flex-start; margin: 6px 0 0 4px; font-size: 11.5px; font-weight: 700; }
    .chat-msg { max-width: 78%; padding: 7px 12px; border-radius: 18px; line-height: 1.35; white-space: pre-wrap; overflow-wrap: anywhere;
      background: #f1f5f9; align-self: flex-start; }
    .chat-msg.mine { background: #071d49; color: #fff; align-self: flex-end; }
    .chat-seen { align-self: flex-end; color: #94a3b8; font-size: 11px; margin-top: 2px; }
    .chat-empty { margin: auto; text-align: center; color: #64748b; font-size: 13px; }
    .chat-empty .chat-av { margin: 0 auto 6px; }
    .chat-error { color: #b42318; font-size: 12px; padding: 4px 12px; }
    .chat-form { display: flex; align-items: center; gap: 6px; padding: 8px 10px; border-top: 1px solid #e2e8f0; }
    .chat-form textarea { flex: 1; resize: none; height: 36px; max-height: 96px; padding: 8px 14px; border: 0; border-radius: 18px;
      background: #f1f5f9; font: inherit; outline: none; }
    .chat-form button { width: 36px; height: 36px; border: 0; border-radius: 50%; background: #071d49; color: #f4d477; font-size: 18px; cursor: pointer; }
    .chat-form button:disabled { color: #cbd5e1; cursor: default; }

    /* New group / group settings */
    .chat-modal { position: fixed; inset: 0; z-index: 9600; display: flex; align-items: center; justify-content: center; padding: 16px;
      background: rgba(15,23,42,.5); font: 14px system-ui, "Segoe UI", sans-serif; color: #0f172a; }
    .chat-modal-box { width: min(420px, 100%); max-height: calc(100vh - 32px); display: flex; flex-direction: column; overflow: hidden;
      border-radius: 14px; background: #fff; box-shadow: 0 12px 40px rgba(0,0,0,.3); }
    .chat-modal-h { display: flex; align-items: center; gap: 10px; padding: 14px 16px; background: #071d49; color: #f4d477; }
    .chat-modal-h b { flex: 1; font-size: 17px; }
    .chat-modal-h button { width: 32px; height: 32px; border: 0; border-radius: 50%; background: none; color: #f4d477; font-size: 20px; cursor: pointer; }
    .chat-modal-b { flex: 1; overflow-y: auto; padding: 14px 16px; }
    .chat-modal-b label.cm-field { display: grid; gap: 5px; margin-bottom: 12px; color: #475569; font-size: 12px; font-weight: 700; }
    .chat-modal-b input[type="text"], .chat-modal-b input[type="search"] { width: 100%; padding: 9px 12px; border: 1px solid #e2e8f0; border-radius: 9px;
      background: #fff; font: 14px system-ui, "Segoe UI", sans-serif; color: #0f172a; }
    .chat-modal-b input:focus { outline: none; border-color: #d5a52a; }
    .cm-sub { margin: 4px 0 6px; color: #475569; font-size: 12px; font-weight: 700; }
    .cm-photo { display: flex; align-items: center; gap: 12px; margin-bottom: 12px; }
    .cm-photo .chat-av { width: 56px; height: 56px; font-size: 22px; }
    .cm-photo button { padding: 7px 12px; border: 1px solid #d9e1e5; border-radius: 8px; background: #fff; color: #071d49; font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; }
    .cm-photo button:hover { border-color: #071d49; }
    .cm-photo button:disabled { opacity: .55; cursor: progress; }
    .cm-list { display: grid; gap: 2px; max-height: 260px; overflow-y: auto; margin-top: 6px; }
    .cm-row { display: flex; align-items: center; gap: 10px; padding: 6px 8px; border-radius: 9px; cursor: pointer; }
    .cm-row:hover { background: #f1f5f9; }
    .cm-row > span:not(.chat-av) { flex: 1; min-width: 0; }
    .cm-row b, .cm-row small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .cm-row small { color: #64748b; font-size: 12px; }
    .cm-row input[type="checkbox"] { width: 18px; height: 18px; accent-color: #071d49; }
    .cm-row .cm-x { border: 0; background: none; color: #b42318; font-size: 18px; cursor: pointer; padding: 0 6px; }
    .cm-tag { margin-left: 6px; padding: 0 6px; border-radius: 99px; background: #fff6dc; color: #8a6200; font-size: 10.5px; font-weight: 700; }
    .chat-modal-f { display: flex; flex-wrap: wrap; justify-content: flex-end; gap: 8px; padding: 12px 16px; border-top: 1px solid #e2e8f0; }
    .chat-modal-f button { padding: 9px 16px; border: 1px solid #e2e8f0; border-radius: 9px; background: #fff; font: 700 13px system-ui, "Segoe UI", sans-serif; cursor: pointer; }
    .chat-modal-f button.go { border-color: #071d49; background: #071d49; color: #f4d477; }
    .chat-modal-f button.warn { margin-right: auto; color: #b42318; }
    .chat-modal-f button:disabled { opacity: .5; cursor: default; }
    .cm-msg { margin: 8px 0 0; color: #b42318; font-size: 12.5px; }
    .cm-note { margin: 0 0 10px; color: #64748b; font-size: 13px; line-height: 1.5; }

    @media (max-width: 700px) {
      #chatDock { right: 0; left: 0; bottom: 80px; padding: 0 8px; }
      .chat-box { width: 100%; height: min(70vh, calc(100vh - 100px)); border-radius: 12px; }
    }
    @media print { #chatLauncher, #chatPanel, #chatDock, .chat-modal { display: none !important; } }`;
  document.head.appendChild(style);

  const root = document.createElement("div");
  root.innerHTML = `
    <button type="button" id="chatLauncher" title="Chats" aria-label="Chats">
      <i class="fas fa-comment-dots"></i><span class="chat-count" hidden></span>
    </button>
    <div id="chatPanel" hidden>
      <div class="chat-panel-head"><b>Chats</b>
        <button type="button" class="chat-new" data-act="newgroup" title="Make a group chat"><i class="fas fa-users"></i> New group</button>
        <button type="button" data-act="hide" title="Close">&times;</button></div>
      <input class="chat-search" type="search" placeholder="Search groups and staff" autocomplete="off">
      <div class="chat-list"></div>
    </div>
    <div id="chatDock"></div>
    <div class="chat-modal" id="chatModal" hidden><div class="chat-modal-box"></div></div>`;
  document.body.append(...root.children);
  const launcher = document.getElementById("chatLauncher");
  const panel = document.getElementById("chatPanel");
  const dock = document.getElementById("chatDock");
  const search = panel.querySelector(".chat-search");
  const modal = document.getElementById("chatModal");

  // Profile picture over the letter, when the person has one (roles.js photoImg)
  const photo = (email) => (typeof Roles !== "undefined" && Roles.photoImg ? Roles.photoImg(email) : "");
  const avatar = (p) =>
    `<span class="chat-av${online.has(p.email) ? " on" : ""}" data-av="${esc(p.email)}" style="background:${colorOf(p.email)}">${esc(initial(p.name))}${photo(p.email)}<i></i></span>`;
  const groupAvatar = (g) => `<span class="chat-av group"><i class="fas fa-users" style="position:static;display:block;width:auto;height:auto;border:0;background:none"></i>${g && g.id != null ? photo("group-" + g.id) : ""}</span>`;
  // Changing a group's photo: any member (All staff: only the person who made it). The database checks the same.
  const canPhoto = (g) => g && (g.is_all_staff ? g.created_by === me : membersOf(g).includes(me));
  const groupLine = (g) => g.is_all_staff ? "Everyone on the team" : `${membersOf(g).length} member${membersOf(g).length === 1 ? "" : "s"}`;

  // ---------- The list: groups, then staff ----------
  function renderList() {
    const q = search.value.trim().toLowerCase();
    const gs = groups
      .filter((g) => !q || g.name.toLowerCase().includes(q))
      .sort((a, b) => (unread[gkey(b.id)] || 0) - (unread[gkey(a.id)] || 0) || b.is_all_staff - a.is_all_staff || a.name.localeCompare(b.name));
    const list = contacts
      .filter((p) => !q || (p.name + " " + p.role + " " + p.email).toLowerCase().includes(q))
      .sort((a, b) => (unread[b.email] || 0) - (unread[a.email] || 0) || online.has(b.email) - online.has(a.email) || a.name.localeCompare(b.name));
    const groupRows = gs.map((g) => {
      const n = unread[gkey(g.id)] || 0;
      return `<button type="button" class="chat-person${n ? " has-new" : ""}" data-open="${esc(gkey(g.id))}">
          ${groupAvatar(g)}<span><b>${esc(g.name)}</b><small>${esc(groupLine(g))}</small></span>${n ? `<em>${n}</em>` : ""}
        </button>`;
    }).join("");
    const peopleRows = list.map((p) => `
        <button type="button" class="chat-person${unread[p.email] ? " has-new" : ""}" data-open="${esc(p.email)}">
          ${avatar(p)}
          <span><b>${esc(p.name)}</b><small>${online.has(p.email) ? "Active now" : esc(p.role || p.email)}</small></span>
          ${unread[p.email] ? `<em>${unread[p.email]}</em>` : ""}
        </button>`).join("");
    panel.querySelector(".chat-list").innerHTML =
      (notReady ? `<p class="chat-note">${notReady}</p>` : "") +
      (groupsNote ? `<p class="chat-note">${groupsNote}</p>` : "") +
      (groupRows ? `<div class="chat-sec">Groups</div>${groupRows}` : "") +
      (peopleRows ? `<div class="chat-sec">People</div>${peopleRows}` : "") +
      (!groupRows && !peopleRows
        ? `<p class="chat-note">${contacts.length || groups.length ? "Nothing matches your search." : "No staff to message yet. A Developer adds staff (with a login) on the Staff page."}</p>` : "");
  }

  const baseTitle = document.title;
  function renderCount() {
    const total = Object.values(unread).reduce((a, b) => a + b, 0);
    const badge = launcher.querySelector(".chat-count");
    badge.hidden = !total;
    badge.textContent = total > 99 ? "99+" : total;
    document.title = (total ? `(${total}) ` : "") + baseTitle;
  }

  // ---------- Chat windows ----------
  const saveState = () => {
    try { sessionStorage.setItem(STATE, JSON.stringify(boxes.map((b) => ({ key: b.key, min: b.min })))); } catch (e) {}
  };

  function openBox(key, { min = false, focus = true } = {}) {
    if (isGroupKey(key) && !groupOf(key)) return null;   // not (or no longer) in that group
    let box = boxes.find((b) => b.key === key);
    if (box) {
      if (!min) box.min = false;
    } else {
      box = { key, group: isGroupKey(key) ? +key.slice(2) : null, email: isGroupKey(key) ? null : key,
        min, msgs: [], loaded: false, el: document.createElement("div") };
      box.el.className = "chat-box";
      box.el.dataset.key = key;
      boxes.unshift(box);
      // Too many windows: the oldest one closes
      while (boxes.length > maxBoxes()) boxes.pop().el.remove();
      buildBox(box);
      loadMessages(box);
    }
    dock.prepend(box.el);
    box.el.classList.toggle("min", box.min);
    saveState();
    if (!box.min) {
      markRead(box);
      if (focus) setTimeout(() => box.el.querySelector("textarea").focus(), 0);
    }
    return box;
  }

  function closeBox(box) {
    const i = boxes.indexOf(box);
    if (i >= 0) boxes.splice(i, 1);
    box.el.remove();
    saveState();
  }

  function headHtml(box) {
    if (box.group) {
      const g = groupOf(box.key) || { name: "Group", members: [] };
      return `${groupAvatar(g)}
        <div class="chat-who"><b>${esc(g.name)}</b><small data-status></small></div>
        <button type="button" data-act="manage" title="Group settings: name, members, leave"><i class="fas fa-cog"></i></button>`;
    }
    const p = person(box.email);
    return `${avatar(p)}<div class="chat-who"><b>${esc(p.name)}</b><small data-status></small></div>`;
  }

  function buildBox(box) {
    box.el.innerHTML = `
      <div class="chat-head" title="Minimize / open">
        <span class="chat-head-main" style="display:contents">${headHtml(box)}</span>
        <button type="button" data-act="min" title="Minimize">&minus;</button>
        <button type="button" data-act="close" title="Close">&times;</button>
      </div>
      <div class="chat-msgs"><p class="chat-empty">Loading…</p></div>
      <form class="chat-form">
        <textarea rows="1" maxlength="2000" placeholder="Aa"></textarea>
        <button type="submit" title="Send" disabled><i class="fas fa-paper-plane"></i></button>
      </form>`;
    renderStatus(box);

    const area = box.el.querySelector("textarea");
    const sendBtn = box.el.querySelector(".chat-form button");
    area.addEventListener("input", () => {
      sendBtn.disabled = !area.value.trim();
      area.style.height = "36px";
      area.style.height = Math.min(area.scrollHeight, 96) + "px";
    });
    area.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); box.el.querySelector(".chat-form").requestSubmit(); }
    });
    area.addEventListener("focus", () => markRead(box));
    box.el.querySelector(".chat-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const text = area.value.trim();
      if (!text) return;
      area.value = "";
      area.dispatchEvent(new Event("input"));
      send(box, text);
    });
    box.el.querySelector(".chat-head").addEventListener("click", (e) => {
      const act = e.target.closest("[data-act]");
      if (act && act.dataset.act === "close") return closeBox(box);
      if (act && act.dataset.act === "manage") return openGroupSettings(box.group);
      box.min = !box.min;
      box.el.classList.toggle("min", box.min);
      saveState();
      if (!box.min) { renderMessages(box); markRead(box); area.focus(); }
    });
  }

  // Group renamed or members changed: refresh the window's title line
  function refreshHead(box) {
    const main = box.el.querySelector(".chat-head-main");
    if (main) main.innerHTML = headHtml(box);
    renderStatus(box);
  }

  function renderStatus(box) {
    const n = unread[box.key] || 0;
    let line;
    if (box.group) {
      const g = groupOf(box.key);
      line = box.min && n ? `${n} new message${n === 1 ? "" : "s"}` : g ? groupLine(g) : "";
    } else {
      const p = person(box.email);
      line = box.min && n ? `${n} new message${n === 1 ? "" : "s"}` : online.has(box.email) ? "Active now" : p.role || p.email;
      const av = box.el.querySelector(".chat-av");
      if (av) av.classList.toggle("on", online.has(box.email));
    }
    const s = box.el.querySelector("[data-status]");
    if (s) s.textContent = line;
    box.el.classList.toggle("flash", box.min && n > 0);
  }

  const timeLabel = (iso) => {
    const d = new Date(iso);
    const today = new Date().toDateString() === d.toDateString();
    return today
      ? d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
      : d.toLocaleString([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
  };

  function renderMessages(box) {
    const wrap = box.el.querySelector(".chat-msgs");
    const atBottom = wrap.scrollHeight - wrap.scrollTop - wrap.clientHeight < 60;
    if (!box.loaded) return;
    if (!box.msgs.length) {
      const g = box.group && groupOf(box.key);
      wrap.innerHTML = box.group
        ? `<p class="chat-empty">${groupAvatar(g)}<br>No messages in ${esc(g ? g.name : "this group")} yet.</p>`
        : `<p class="chat-empty">${avatar(person(box.email))}<br>No messages with ${esc(person(box.email).name)} yet.</p>`;
      if (box.error) wrap.innerHTML += `<div class="chat-error">${esc(box.error)}</div>`;
      return;
    }
    let last = 0, lastSender = "";
    const lastMine = box.group ? null : [...box.msgs].reverse().find((m) => m.sender === me);
    wrap.innerHTML = box.msgs.map((m) => {
      const t = new Date(m.created_at).getTime();
      const gap = t - last > 15 * 60 * 1000 ? `<div class="chat-time">${timeLabel(m.created_at)}</div>` : "";
      // Group chats: the sender's name above their messages (not above your own)
      const from = box.group && m.sender !== me && (gap || m.sender !== lastSender)
        ? `<div class="chat-from" style="color:${nameColor(m.sender)}">${esc(person(m.sender).name)}</div>` : "";
      last = t; lastSender = m.sender;
      const seen = m === lastMine && m.read_at ? '<div class="chat-seen">Seen</div>' : "";
      return `${gap}${from}<div class="chat-msg${m.sender === me ? " mine" : ""}${m.failed ? " failed" : ""}" title="${esc(timeLabel(m.created_at))}">${esc(m.body)}</div>${seen}`;
    }).join("") + (box.error ? `<div class="chat-error">${esc(box.error)}</div>` : "");
    if (atBottom || box.scrollDown) wrap.scrollTop = wrap.scrollHeight;
    box.scrollDown = false;
  }

  const q = (email) => `"${email.replace(/"/g, "")}"`;
  async function loadMessages(box) {
    const res = box.group
      ? await db.from("group_messages").select("*").eq("group_id", box.group).order("created_at", { ascending: false }).limit(200)
      : await db.from("messages").select("*")
        .or(`and(sender.eq.${q(me)},recipient.eq.${q(box.email)}),and(sender.eq.${q(box.email)},recipient.eq.${q(me)})`)
        .order("created_at", { ascending: false }).limit(200);
    const { data, error } = res;
    box.loaded = true;
    if (error) {
      box.error = problem(error, !!box.group);
    } else {
      const known = new Set(box.msgs.map((m) => m.id));
      box.msgs = (data || []).reverse().concat(box.msgs.filter((m) => !known.has(m.id) && !(data || []).some((d) => d.id === m.id)));
    }
    box.scrollDown = true;
    renderMessages(box);
  }

  function problem(error, group) {
    const msg = (error && error.message) || String(error);
    if (/relation|schema cache|PGRST205|PGRST202|42P01|does not exist|could not find/i.test(msg + (error && error.code)))
      return group ? "Group chats aren't set up in the database yet. A Developer needs to run supabase/group_chat.sql in Supabase."
        : "Chat isn't set up in the database yet. A Developer needs to run supabase/messages.sql in Supabase.";
    if (/fetch|network/i.test(msg)) return "Can't reach the online database. Check the internet.";
    if (/row-level security/i.test(msg)) return group ? "You're not a member of this group any more." : msg;
    return msg;
  }

  async function send(box, body) {
    box.error = "";
    const { data, error } = box.group
      ? await db.from("group_messages").insert({ group_id: box.group, body }).select().single()
      : await db.from("messages").insert({ recipient: box.email, body }).select().single();
    if (error) {
      box.error = "Not sent: " + problem(error, !!box.group);
    } else if (!box.msgs.some((m) => m.id === data.id)) {
      box.msgs.push(data);
    }
    box.scrollDown = true;
    renderMessages(box);
  }

  async function markRead(box) {
    if (box.min || document.hidden || !unread[box.key]) return;
    delete unread[box.key];
    renderStatus(box); renderCount(); renderList();
    const now = new Date().toISOString();
    if (!box.group) {
      await db.from("messages").update({ read_at: now }).eq("recipient", me).eq("sender", box.email).is("read_at", null);
      return;
    }
    // Groups: remember "read up to now" (All staff: the row is made the first time)
    const { data } = await db.from("chat_group_members").update({ last_read_at: now }).eq("group_id", box.group).eq("member", me).select("group_id");
    const g = groupOf(box.key);
    if ((!data || !data.length) && g && g.is_all_staff) {
      await db.from("chat_group_members").insert({ group_id: box.group, member: me, last_read_at: now });
    }
  }

  async function refreshUnread() {
    const { data, error } = await db.from("messages").select("sender").eq("recipient", me).is("read_at", null).limit(1000);
    const fresh = {};
    if (error) {
      notReady = problem(error);
    } else {
      notReady = "";
      data.forEach((m) => (fresh[m.sender] = (fresh[m.sender] || 0) + 1));
    }
    if (!groupsNote) {
      const g = await db.rpc("my_group_unread");
      if (!g.error) (g.data || []).forEach((r) => { if (+r.unread) fresh[gkey(r.group_id)] = +r.unread; });
    }
    unread = fresh;
    renderCount(); renderList();
    boxes.forEach((b) => { renderStatus(b); markRead(b); });
  }

  // ---------- Groups: load, make, rename, members, leave ----------
  async function loadGroups() {
    const gr = await db.from("chat_groups").select("id,name,created_by,is_all_staff").order("name");
    if (gr.error) {
      groupsNote = /relation|schema cache|PGRST205|42P01|does not exist/i.test(gr.error.message + gr.error.code)
        ? "Group chats aren't set up yet. A Developer needs to run supabase/group_chat.sql in Supabase." : "";
      groups = [];
      return;
    }
    groupsNote = "";
    const mem = await db.from("chat_group_members").select("group_id,member");
    const byGroup = {};
    (mem.data || []).forEach((m) => (byGroup[m.group_id] = byGroup[m.group_id] || []).push(m.member));
    // Groups you made but aren't in any more aren't shown (you left them)
    groups = (gr.data || []).map((g) => ({ ...g, members: byGroup[g.id] || [] }))
      .filter((g) => g.is_all_staff || g.members.includes(me));
    // Windows of groups you've been removed from close
    boxes.filter((b) => b.group && !groupOf(b.key)).forEach(closeBox);
    boxes.filter((b) => b.group).forEach(refreshHead);
  }

  function showModal(html) {
    modal.querySelector(".chat-modal-box").innerHTML = html;
    modal.hidden = false;
    const close = () => (modal.hidden = true);
    modal.querySelectorAll("[data-close]").forEach((b) => (b.onclick = close));
    return { el: modal.querySelector(".chat-modal-box"), close };
  }
  modal.addEventListener("click", (e) => { if (e.target === modal) modal.hidden = true; });

  const pickRows = (people, checked = new Set()) => people.map((p) => `
      <label class="cm-row" data-find="${esc((p.name + " " + p.role).toLowerCase())}">
        ${avatar(p)}<span><b>${esc(p.name)}</b><small>${esc(p.role || p.email)}</small></span>
        <input type="checkbox" value="${esc(p.email)}"${checked.has(p.email) ? " checked" : ""}>
      </label>`).join("");
  const wireFind = (el) => {
    const f = el.querySelector("[data-find-box]");
    if (f) f.addEventListener("input", () => {
      const t = f.value.trim().toLowerCase();
      el.querySelectorAll(".cm-row[data-find]").forEach((r) => (r.hidden = !!t && !r.dataset.find.includes(t)));
    });
  };

  function openNewGroup() {
    loadContacts();
    const m = showModal(`
      <div class="chat-modal-h"><i class="fas fa-users"></i><b>New group</b><button type="button" data-close title="Close">&times;</button></div>
      <div class="chat-modal-b">
        <label class="cm-field">Group name<input type="text" data-name maxlength="60" placeholder="e.g. Installers – Team A"></label>
        <p class="cm-sub">Members</p>
        <input type="search" data-find-box placeholder="Search staff" autocomplete="off">
        <div class="cm-list">${contacts.length ? pickRows(contacts) : '<p class="cm-note">No staff to add yet.</p>'}</div>
        <p class="cm-msg" data-msg></p>
      </div>
      <div class="chat-modal-f"><button type="button" data-close>Cancel</button><button type="button" class="go" data-create>Create group</button></div>`);
    wireFind(m.el);
    m.el.querySelector("[data-name]").focus();
    m.el.querySelector("[data-create]").onclick = async (e) => {
      const name = m.el.querySelector("[data-name]").value.trim();
      const picked = [...m.el.querySelectorAll(".cm-row input:checked")].map((c) => c.value);
      const say = (t) => (m.el.querySelector("[data-msg]").textContent = t);
      if (!name) return say("Type a name for the group.");
      if (!picked.length) return say("Pick at least one person.");
      e.target.disabled = true;
      const g = await db.from("chat_groups").insert({ name }).select().single();
      if (g.error) { e.target.disabled = false; return say("Not created: " + problem(g.error, true)); }
      const rows = [me, ...picked].map((member) => ({ group_id: g.data.id, member }));
      const add = await db.from("chat_group_members").insert(rows);
      if (add.error) { e.target.disabled = false; return say("The group was made but members weren't added: " + problem(add.error, true)); }
      m.close();
      await loadGroups();
      renderList();
      panel.hidden = true;
      openBox(gkey(g.data.id));
    };
  }

  function openGroupSettings(id) {
    loadContacts();
    const g = groups.find((x) => x.id === id);
    if (!g) return;
    const manage = canManage(g);
    const members = membersOf(g).map(person).sort((a, b) => (a.email === me) - (b.email === me) || a.name.localeCompare(b.name));
    const others = contacts.filter((c) => !g.members.includes(c.email));
    const m = showModal(`
      <div class="chat-modal-h"><i class="fas fa-users"></i><b>${esc(g.name)}</b><button type="button" data-close title="Close">&times;</button></div>
      <div class="chat-modal-b">
        ${canPhoto(g) ? `<div class="cm-photo">${groupAvatar(g)}<button type="button" data-gphoto><i class="fas fa-camera"></i> Change group photo</button></div>` : ""}
        ${g.is_all_staff ? '<p class="cm-note">Everyone with a login is in <b>All staff</b>. Good for announcements to the whole team.</p>' : ""}
        ${manage ? `<label class="cm-field">Group name<input type="text" data-name maxlength="60" value="${esc(g.name)}"></label>` : ""}
        <p class="cm-sub">Members (${members.length})</p>
        <div class="cm-list">${members.map((p) => `
          <div class="cm-row">${p.email === me ? `<span class="chat-av" style="background:${colorOf(me)}">${esc(initial(sessionStorage.getItem("aircon_name") || "Y"))}${photo(me)}<i></i></span>` : avatar(p)}
            <span><b>${esc(p.name)}${p.email === g.created_by ? '<span class="cm-tag">made the group</span>' : ""}</b><small>${esc(p.role || p.email)}</small></span>
            ${manage && p.email !== me ? `<button type="button" class="cm-x" data-remove="${esc(p.email)}" title="Remove from the group">&times;</button>` : ""}
          </div>`).join("")}</div>
        ${manage && others.length ? `
          <p class="cm-sub" style="margin-top:14px">Add people</p>
          <input type="search" data-find-box placeholder="Search staff" autocomplete="off">
          <div class="cm-list">${pickRows(others)}</div>` : ""}
        <p class="cm-msg" data-msg></p>
      </div>
      <div class="chat-modal-f">
        ${g.is_all_staff ? "" : '<button type="button" class="warn" data-leave><i class="fas fa-sign-out-alt"></i> Leave group</button>'}
        <button type="button" data-close>Close</button>
        ${manage ? '<button type="button" class="go" data-save>Save</button>' : ""}
      </div>`);
    wireFind(m.el);
    const say = (t) => (m.el.querySelector("[data-msg]").textContent = t);
    const reopen = async () => { await loadGroups(); renderList(); if (groups.some((x) => x.id === id)) openGroupSettings(id); else m.close(); };
    const gphoto = m.el.querySelector("[data-gphoto]");
    if (gphoto) gphoto.onclick = async () => {
      const file = await Roles.pickPicture();
      if (!file) return;
      gphoto.disabled = true;
      say("Saving the photo…");
      try { await Roles.savePhoto("group-" + id, file); } catch (err) { gphoto.disabled = false; return say("Photo not saved: " + err.message); }
      renderList();
      await reopen();
    };

    m.el.querySelectorAll("[data-remove]").forEach((b) => (b.onclick = async () => {
      const who = person(b.dataset.remove).name;
      if (!confirm(`Remove ${who} from ${g.name}?`)) return;
      const { error } = await db.from("chat_group_members").delete().eq("group_id", id).eq("member", b.dataset.remove);
      if (error) return say("Not removed: " + problem(error, true));
      await reopen();
    }));
    const leave = m.el.querySelector("[data-leave]");
    if (leave) leave.onclick = async () => {
      if (!confirm(`Leave ${g.name}? You won't see its messages any more unless someone adds you back.`)) return;
      const { error } = await db.from("chat_group_members").delete().eq("group_id", id).eq("member", me);
      if (error) return say("Couldn't leave: " + problem(error, true));
      m.close();
      await loadGroups();
      renderList(); refreshUnread();
    };
    const save = m.el.querySelector("[data-save]");
    if (save) save.onclick = async () => {
      const name = m.el.querySelector("[data-name]").value.trim();
      const add = [...m.el.querySelectorAll(".cm-row input:checked")].map((c) => ({ group_id: id, member: c.value }));
      if (!name) return say("The group needs a name.");
      save.disabled = true;
      if (name !== g.name) {
        const { error } = await db.from("chat_groups").update({ name }).eq("id", id);
        if (error) { save.disabled = false; return say("Name not saved: " + problem(error, true)); }
      }
      if (add.length) {
        const { error } = await db.from("chat_group_members").insert(add);
        if (error) { save.disabled = false; return say("People not added: " + problem(error, true)); }
      }
      m.close();
      await loadGroups();
      renderList();
    };
  }

  // ---------- Live: new messages, "Seen", groups, who's online ----------
  function onMessage(m) {
    const other = m.sender === me ? m.recipient : m.sender;
    let box = boxes.find((b) => b.key === other);
    if (m.sender !== me) {
      unread[other] = (unread[other] || 0) + 1;
      // Like Messenger: a new private message opens its chat window
      if (!box) box = openBox(other, { focus: false, min: false });
    }
    if (box && box.loaded && !box.msgs.some((x) => x.id === m.id)) {
      box.msgs.push(m);
      box.scrollDown = true;
      renderMessages(box);
    }
    if (box) { renderStatus(box); markRead(box); }
    renderCount(); renderList();
  }

  function onGroupMessage(m) {
    const key = gkey(m.group_id);
    if (!groupOf(key)) return;
    const box = boxes.find((b) => b.key === key);
    // Group messages don't pop a window open (All staff could get busy): the count shows instead
    if (m.sender !== me) unread[key] = (unread[key] || 0) + 1;
    if (box && box.loaded && !box.msgs.some((x) => x.id === m.id)) {
      box.msgs.push(m);
      box.scrollDown = true;
      renderMessages(box);
    }
    if (box) { renderStatus(box); markRead(box); }
    renderCount(); renderList();
  }

  function onSeen(m) {
    const box = boxes.find((b) => b.key === m.recipient);
    const msg = box && box.msgs.find((x) => x.id === m.id);
    if (msg) { msg.read_at = m.read_at; renderMessages(box); }
  }

  function setOnline(emails) {
    online = new Set(emails);
    document.querySelectorAll("[data-av]").forEach((el) => el.classList.toggle("on", online.has(el.dataset.av)));
    boxes.forEach(renderStatus);
    if (!panel.hidden) renderList();
  }

  let groupsTimer = null;
  const groupsChanged = () => {   // several member rows can change at once: reload once
    clearTimeout(groupsTimer);
    groupsTimer = setTimeout(async () => { await loadGroups(); renderList(); refreshUnread(); }, 300);
  };

  // ---------- Buttons ----------
  launcher.addEventListener("click", () => {
    panel.hidden = !panel.hidden;
    if (!panel.hidden) { loadContacts(); renderList(); search.focus(); }
  });
  panel.addEventListener("click", (e) => {
    if (e.target.closest('[data-act="hide"]')) return (panel.hidden = true);
    if (e.target.closest('[data-act="newgroup"]')) { panel.hidden = true; return openNewGroup(); }
    const pick = e.target.closest("[data-open]");
    if (pick) { panel.hidden = true; search.value = ""; openBox(pick.dataset.open); }
  });
  search.addEventListener("input", renderList);
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") { panel.hidden = true; modal.hidden = true; } });
  document.addEventListener("visibilitychange", () => boxes.forEach(markRead));
  // Smaller screen: keep only as many chat windows as fit (the newest ones)
  window.addEventListener("resize", () => {
    let trimmed = false;
    while (boxes.length > maxBoxes()) { boxes.pop().el.remove(); trimmed = true; }
    if (trimmed) saveState();
  });
  window.addEventListener("storage", (e) => {
    if (e.key === "aircon_staff") { loadContacts(); renderList(); boxes.forEach((b) => (b.group ? refreshHead(b) : renderStatus(b))); }
  });

  // ---------- Start ----------
  (async () => {
    if (window.cloudReady) await window.cloudReady;
    const { data } = await db.auth.getSession();
    me = (data.session && data.session.user.email || "").toLowerCase();
    if (!me) { launcher.remove(); return; }
    loadContacts();
    await loadGroups();
    renderList();

    let saved = [];
    try { saved = JSON.parse(sessionStorage.getItem(STATE) || "[]"); } catch (e) {}
    saved.reverse().forEach((b) => openBox(b.key || b.email, { min: b.min, focus: false }));   // b.email: saved by the older chat
    await refreshUnread();

    db.channel("chat-" + me)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages" }, (c) => c.new && onMessage(c.new))
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "messages" }, (c) => c.new && c.new.sender === me && onSeen(c.new))
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "group_messages" }, (c) => c.new && onGroupMessage(c.new))
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_group_members" }, groupsChanged)
      .on("postgres_changes", { event: "*", schema: "public", table: "chat_groups" }, groupsChanged)
      .subscribe((status) => { if (status === "SUBSCRIBED") refreshUnread(); });

    const presence = db.channel("online-staff", { config: { presence: { key: me } } });
    presence
      .on("presence", { event: "sync" }, () => setOnline(Object.keys(presence.presenceState())))
      .subscribe(async (status) => { if (status === "SUBSCRIBED") await presence.track({ since: Date.now() }); });
  })();
})();
