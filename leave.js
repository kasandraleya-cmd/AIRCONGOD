// Day-off and leave requests.
// Staff (Installer, Driver, Editor, …) request a day off or a leave on their Dashboard and see if it's
// Pending, Approved or Rejected. Only Human Resources approves or rejects them, on the Staff page
// (Leave requests button).
// Saved under "aircon_leave" (shared through the online database by cloud.js). Each request:
// { id, staffId, name, code, position, type, from, to, days, reason, status, requested, decidedBy, decidedAt, note }
// Cash advance (vale) requests are in the same list: type "Cash advance", amount, from = to = the date needed, days 0.
// Employees (not Owner, HR / Manager, Admin / Office Staff, Developer) send them on their Dashboard;
// HR / Manager approves them on the Staff page (Cash advance button).
//
// Warnings: Human Resources gives a warning on the Staff page (Warnings button); the staff member sees it on
// their Dashboard under "My warnings" and marks it as read. Saved under "aircon_warnings":
// { id, staffId, name, position, level, date, reason, givenBy, givenAt, readAt }
const LEAVE_KEY = "aircon_leave";
const WARN_KEY = "aircon_warnings";

const Leave = (function () {
  const TYPES = ["Vacation leave", "Sick leave", "Emergency leave"];   // "Day off" has its own button
  // Only Human Resources can approve or reject
  const isManager = typeof Roles !== "undefined" && Roles.me().hr;   // HR, Manager (roles.js)

  const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const ymd = (d) => d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  const dateField = (name) => `<span class="lv-date-field"><input type="text" data-date-text="${name}" placeholder="MM/DD/YYYY" inputmode="numeric" maxlength="10" autocomplete="off" aria-label="${name === "from" ? "From" : "To"} date"><button type="button" class="lv-date-button" aria-label="Choose date"><i class="far fa-calendar"></i></button><input type="date" name="${name}" data-date-value class="lv-date-native" tabindex="-1" aria-hidden="true"></span>`;
  const dateToISO = (value) => {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(value);
    if (!m) return "";
    const [, mm, dd, yyyy] = m, date = new Date(+yyyy, +mm - 1, +dd);
    return date.getFullYear() === +yyyy && date.getMonth() === +mm - 1 && date.getDate() === +dd ? `${yyyy}-${mm}-${dd}` : "";
  };
  const isoToMDY = (value) => value ? `${value.slice(5, 7)}/${value.slice(8, 10)}/${value.slice(0, 4)}` : "";
  const nice = (d) => (d ? new Date(d + "T00:00").toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }) : "—");
  const niceRange = (r) => (r.from === r.to ? nice(r.from) : `${nice(r.from)} – ${nice(r.to)}`);
  const daysBetween = (a, b) => Math.round((new Date(b + "T00:00") - new Date(a + "T00:00")) / 864e5) + 1;
  const read = (key, empty) => { try { return JSON.parse(localStorage.getItem(key) || empty); } catch (e) { return JSON.parse(empty); } };

  // Cash advance (vale) requests are kept in the same list, as type "Cash advance" with an amount and
  // the date needed (from = to, days 0). They are NOT leave: Payroll's leave days and the leave lists skip them.
  const CASH = "Cash advance";
  const isCash = (r) => !!r && r.type === CASH;
  const money = (n) => "₱" + (+n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  // Who can ask for one: every employee except Owner, HR / Manager, Admin / Office Staff and Developer
  const canCash = () => { if (typeof Roles === "undefined") return false; const r = Roles.me(); return !(r.owner || r.hr || r.office || r.dev); };

  const all = () => read(LEAVE_KEY, "[]");
  const save = (list) => localStorage.setItem(LEAVE_KEY, JSON.stringify(list));
  const warnings = () => read(WARN_KEY, "[]");
  const saveWarnings = (list) => localStorage.setItem(WARN_KEY, JSON.stringify(list));
  const LEVELS = ["Verbal warning", "Written warning", "Final warning"];
  const levelClass = (l) => ({ "Verbal warning": "verbal", "Written warning": "written", "Final warning": "final" }[l] || "verbal");
  const levelBadge = (l) => `<span class="wn-level ${levelClass(l)}">${esc(l)}</span>`;

  // The staff record of whoever is logged in (same match the login uses: their login email or username)
  // Their personal details (mobile, birthday, address, SSS …) are not in the open staff list: they are in the
  // protected table staff_private (supabase/protect_private_data.sql), where each person can read only their own.
  let myPrivate = null;   // null until loaded (or when that table isn't set up yet: the older staff record is used)
  function me() {
    const user = String(sessionStorage.getItem("aircon_user") || "").trim().toLowerCase();
    if (!user) return null;
    const s = read("aircon_staff", "[]").find((s) => {
      const username = String(s.username || "").toLowerCase();
      const login = String(s.login || (s.username && window.loginEmail ? window.loginEmail(s.username) : "")).toLowerCase();
      return (username && user === username) || (login && user === login);
    }) || null;
    return s && myPrivate ? { ...s, ...myPrivate } : s;
  }
  async function loadMyPrivate() {
    await (window.cloudReady || Promise.resolve());
    const s = me();
    if (!window.cloud || !s) return;
    const { data, error } = await window.cloud.from("staff_private").select("data").eq("staff_id", String(s.id)).maybeSingle();
    if (error || !data) return;
    myPrivate = data.data || {};
    window.dispatchEvent(new StorageEvent("storage", { key: "aircon_staff" }));   // redraws "My information"
  }

  const badge = (status) => `<span class="lv-status ${String(status).toLowerCase()}">${esc(status)}</span>`;

  // ---------- A small pop-up used by both sides ----------
  function popup(title, bodyHtml) {
    const wrap = document.createElement("div");
    wrap.className = "lv-modal";
    wrap.innerHTML = `
      <div class="lv-box" role="dialog" aria-label="${esc(title)}">
        <div class="lv-box-head"><h3>${esc(title)}</h3><button type="button" class="lv-x" aria-label="Close">&times;</button></div>
        ${bodyHtml}
      </div>`;
    document.body.appendChild(wrap);
    const close = () => wrap.remove();
    wrap.querySelector(".lv-x").onclick = close;
    wrap.addEventListener("click", (e) => { if (e.target === wrap) close(); });
    const esc_ = (e) => { if (e.key === "Escape") { close(); removeEventListener("keydown", esc_); } };
    addEventListener("keydown", esc_);
    return { el: wrap, close };
  }

  // =====================================================================
  // EMPLOYEE SIDE (Dashboard): my info, my position, request day off / leave, my requests
  // =====================================================================
  // ---------- Profile picture (supabase/profile_photos.sql) ----------
  // Saved in the "avatars" storage bucket as <login email>.jpg, about 256 × 256 px. Tap the round picture
  // on My information to add or change it. Until there is one (or before the SQL is run), the first letter shows.
  const PHOTO_SIZE = 256;
  const myLogin = () => {
    const u = String(sessionStorage.getItem("aircon_user") || "").trim().toLowerCase();
    return !u || u.includes("@") ? u : `${u}@${typeof LOGIN_DOMAIN !== "undefined" ? LOGIN_DOMAIN : "aircongod.app"}`;
  };
  const photoVer = () => { try { return localStorage.getItem("aircon_photo_v") || ""; } catch (e) { return ""; } };
  function photoUrl(login) {
    if (!login || typeof SUPABASE_URL === "undefined") return "";
    return `${SUPABASE_URL}/storage/v1/object/public/avatars/${encodeURIComponent(login + ".jpg")}${photoVer() ? "?v=" + photoVer() : ""}`;
  }
  // The round picture: the photo when there is one, otherwise the first letter. Clicking it changes the photo.
  function avatarHtml(s) {
    const url = photoUrl(myLogin());
    return `<button type="button" class="lv-avatar lv-photo" data-photo title="Add or change your profile picture" aria-label="Add or change your profile picture">
      <span>${esc(String(s.name || "?").charAt(0).toUpperCase())}</span>
      ${url ? `<img src="${esc(url)}" alt="" onload="this.parentNode.classList.add('has-photo')" onerror="this.remove()">` : ""}
      <i class="fas fa-camera"></i></button>`;
  }
  // A picked picture → a square JPEG (the middle of the picture), PHOTO_SIZE × PHOTO_SIZE
  function squareJpeg(file) {
    return new Promise((resolve, reject) => {
      const img = new Image(), url = URL.createObjectURL(file);
      img.onload = () => {
        const side = Math.min(img.naturalWidth, img.naturalHeight);
        const c = document.createElement("canvas");
        c.width = c.height = PHOTO_SIZE;
        c.getContext("2d").drawImage(img, (img.naturalWidth - side) / 2, (img.naturalHeight - side) / 2, side, side, 0, 0, PHOTO_SIZE, PHOTO_SIZE);
        URL.revokeObjectURL(url);
        c.toBlob((b) => (b ? resolve(b) : reject(new Error("Could not read the picture."))), "image/jpeg", 0.85);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("That file isn't a picture we can read.")); };
      img.src = url;
    });
  }
  async function uploadPhoto(file) {
    if (!window.cloud) throw new Error("Not connected to the online database.");
    const { data } = await window.cloud.auth.getUser();
    const login = String((data && data.user && data.user.email) || myLogin()).toLowerCase();
    const blob = await squareJpeg(file);
    const { error } = await window.cloud.storage.from("avatars")
      .upload(login + ".jpg", blob, { upsert: true, contentType: "image/jpeg", cacheControl: "60" });
    if (error) throw new Error(/bucket/i.test(error.message) ? "Profile pictures aren't set up yet (supabase/profile_photos.sql)." : error.message);
    try { localStorage.setItem("aircon_photo_v", String(Date.now())); } catch (e) {}
  }

  function mountEmployee(root) {
    let myCash = [];
    // The Dashboard shows no "My information" (it is on the My Profile page): data-no-info on root
    const noInfo = !!root.dataset.noInfo;
    // The My Profile page shows ONLY "My information" (with the profile picture) and "My warnings":
    // payslip, leave, cash advance, time in and attendance are on the Dashboard. data-info-only on root
    const infoOnly = !!root.dataset.infoOnly;
    // The My Attendance page shows ONLY "My time in" and "My attendance" (they are not on the Dashboard). data-attendance-only on root
    const attendanceOnly = !!root.dataset.attendanceOnly;
    // ---------- Cash advance (vale): employees ask for an amount; HR / Manager approves on the Staff page ----------
    // Not for Owner, HR / Manager, Admin / Office Staff or Developer. Approved amounts are shown on Payroll
    // beside the person's name, to type into the Cash advance deduction.
    function cashPanel() {
      if (!canCash()) return "";
      const pending = myCash.filter((r) => r.status === "Pending").length;
      return `
        <div class="panel lv-panel">
          <h3><i class="fas fa-hand-holding-usd"></i> Cash advance (vale)</h3>
          <div class="lv-actions">
            <button type="button" class="lv-btn dayoff" data-new="cash"><i class="fas fa-money-bill-wave"></i> Request cash advance</button>
          </div>
          <h4 class="lv-sub">My cash advances ${pending ? `<span class="lv-count">${pending} pending</span>` : ""}</h4>
          ${myCash.length ? `
            <div class="lv-list">
              ${myCash.map((r) => `
                <div class="lv-item">
                  <div class="lv-item-top"><b>${money(r.amount)}</b> ${badge(r.status)}</div>
                  <div class="lv-item-when"><i class="far fa-calendar"></i> Needed ${esc(nice(r.from))} · sent ${esc(new Date(r.requested).toLocaleDateString("en-PH", { month: "short", day: "numeric" }))}</div>
                  ${r.reason ? `<div class="lv-item-reason">${esc(r.reason)}</div>` : ""}
                  ${r.status !== "Pending" && (r.decidedBy || r.note) ? `<div class="lv-item-note">${r.status} by ${esc(r.decidedBy || "the office")}${r.note ? `: “${esc(r.note)}”` : ""}</div>` : ""}
                  ${r.status === "Pending" ? `<button type="button" class="lv-cancel" data-cancel="${r.id}">Cancel request</button>` : ""}
                </div>`).join("")}
            </div>` : `<p class="lv-empty">No cash advance requests yet.</p>`}
        </div>`;
    }

    function openCashForm() {
      const s = me();
      if (!s) return;
      const p = popup("Request cash advance", `
        <form class="lv-form" novalidate>
          <label>Amount (₱)<input type="number" name="amount" min="1" step="any" inputmode="decimal" placeholder="e.g. 1000" required></label>
          <label>Date needed${dateField("from")}</label>
          <label>Reason<textarea name="reason" rows="3" placeholder="e.g. tuition, medicine, rent"></textarea></label>
          <p class="lv-error" hidden></p>
          <div class="lv-form-actions">
            <button type="button" class="lv-btn light" data-close>Cancel</button>
            <button type="submit" class="lv-btn dayoff">Send request</button>
          </div>
        </form>`);
      const form = p.el.querySelector("form");
      const err = p.el.querySelector(".lv-error");
      const text = p.el.querySelector("[data-date-text]"), picker = p.el.querySelector("[data-date-value]");
      picker.value = ymd(new Date());
      text.value = isoToMDY(picker.value);
      text.addEventListener("input", () => {
        const digits = text.value.replace(/\D/g, "").slice(0, 8);
        text.value = digits.length <= 2 ? digits : digits.length <= 4 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
        picker.value = dateToISO(text.value);
      });
      picker.addEventListener("change", () => { text.value = isoToMDY(picker.value); });
      p.el.querySelector(".lv-date-button").addEventListener("click", () => { if (picker.showPicker) picker.showPicker(); else picker.click(); });
      p.el.querySelector("[data-close]").onclick = p.close;
      form.amount.focus();
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const fail = (m) => { err.textContent = m; err.hidden = false; };
        const amount = Math.round((+form.amount.value || 0) * 100) / 100;
        if (!(amount > 0)) return fail("Type the amount you need.");
        const from = dateToISO(text.value);
        if (!from) return fail("Enter the date as MM/DD/YYYY.");
        const list = all();
        if (list.some((r) => r.staffId === s.id && isCash(r) && r.status === "Pending")) return fail("You already have a cash advance waiting for approval. Cancel it first to send a new one.");
        list.push({
          id: Date.now(), staffId: s.id, name: s.name, code: s.code || "", position: s.position || "",
          type: CASH, amount, from, to: from, days: 0,
          reason: form.reason.value.trim(), status: "Pending", requested: new Date().toISOString(),
          decidedBy: "", decidedAt: "", note: "",
        });
        save(list);
        p.close();
        draw();
      });
    }

    // "My information": the profile picture, name, position, status and details
    const meCard = (s, info) => `<div class="panel lv-panel lv-me">
            <h3><i class="fas fa-id-badge"></i> My information</h3>
            <div class="lv-who">
              ${avatarHtml(s)}
              <div>
                <b>${esc(s.name)}</b>
                <span class="lv-position"><i class="fas fa-briefcase"></i> ${esc(s.position || "No position yet")}</span>
                ${badge(s.status || "Active")}
              </div>
            </div>
            <dl class="lv-info">
              ${info.map(([k, v, wide]) => `<div${wide ? ' class="wide"' : ""}><dt>${k}</dt><dd>${esc(v) || "—"}</dd></div>`).join("")}
            </dl>
            <p class="lv-hint">Something wrong here? Ask Human Resources to update it.</p>
          </div>`;

    function draw() {
      const s = me();
      if (!s) {
        root.innerHTML = `
          <div class="panel lv-panel">
            <h3><i class="fas fa-id-badge"></i> My information</h3>
            <p class="lv-empty">Your login isn't linked to a staff record yet, so you can't send requests.
              Please ask Human Resources to add your username in Staff.</p>
          </div>`;
        return;
      }
      const mineAll = all().filter((r) => r.staffId === s.id).sort((a, b) => String(b.requested).localeCompare(String(a.requested)));
      const mine = mineAll.filter((r) => !isCash(r));   // day off & leave
      myCash = mineAll.filter(isCash);                  // cash advance (vale) requests
      const pending = mine.filter((r) => r.status === "Pending").length;
      const info = [
        ["Staff ID", s.code], ["Nickname", s.nickname], ["Mobile number", s.phone], ["Email", s.email],
        ["Date hired", s.hired && nice(s.hired)], ["Birthday", s.birthday && nice(s.birthday)], ["Address", s.address, true],
        ["Emergency contact", [s.emergency_name, s.emergency_contact].filter(Boolean).join(" · "), true],
        ["SSS", s.sss], ["PhilHealth", s.philhealth], ["Pag-IBIG", s.pagibig],
      ];
      // Employees (not Owner / HR / Manager / Office / Supervisor): their own layout, see employeeLayout()
      if (attendanceOnly) { root.innerHTML = `<div class="lv-att-page">${timePanel(s)}${attendancePanel(s)}</div>`; return; }
      if (root.classList.contains("emp-only") && !infoOnly) { root.innerHTML = employeeLayout(s, mine, pending, info); return; }
      if (infoOnly) {   // My Profile: My information + My warnings only
        root.innerHTML = `<div class="lv-grid">${meCard(s, info)}<div class="lv-col">${warningsPanel(s)}</div></div>`;
        return;
      }
      root.innerHTML = `
        <div class="lv-grid${noInfo ? " no-info" : ""}">
          ${noInfo ? "" : meCard(s, info)}

          <div class="lv-col">
          ${payslipPanel()}
          <div class="panel lv-panel">
            <h3><i class="fas fa-plane-departure"></i> Day off &amp; leave</h3>
            <div class="lv-actions">
              <button type="button" class="lv-btn dayoff" data-new="dayoff"><i class="fas fa-calendar-minus"></i> Request day off</button>
              <button type="button" class="lv-btn leave" data-new="leave"><i class="fas fa-suitcase"></i> Request leave</button>
            </div>
            <h4 class="lv-sub">My requests ${pending ? `<span class="lv-count">${pending} pending</span>` : ""}</h4>
            ${mine.length ? `
              <div class="lv-list">
                ${mine.map((r) => `
                  <div class="lv-item">
                    <div class="lv-item-top">
                      <b>${esc(r.type)}</b> ${badge(r.status)}
                    </div>
                    <div class="lv-item-when"><i class="far fa-calendar"></i> ${esc(niceRange(r))} · ${r.days} day${r.days === 1 ? "" : "s"}</div>
                    ${r.reason ? `<div class="lv-item-reason">${esc(r.reason)}</div>` : ""}
                    ${r.status !== "Pending" && (r.decidedBy || r.note) ? `<div class="lv-item-note">${r.status} by ${esc(r.decidedBy || "the office")}${r.note ? `: “${esc(r.note)}”` : ""}</div>` : ""}
                    ${r.status === "Pending" ? `<button type="button" class="lv-cancel" data-cancel="${r.id}">Cancel request</button>` : ""}
                  </div>`).join("")}
              </div>` : `<p class="lv-empty">No requests yet.</p>`}
          </div>
          ${cashPanel()}
          ${warningsPanel(s)}
          </div>
        </div>`;   // My time in and My attendance: on the My Attendance page
    }

    // ---------- EMPLOYEE LAYOUT (installers, drivers, warehouse, editors…) ----------
    // Top: "This week" at a glance. Main column: My time in + My attendance (what they check every day).
    // Side column: payslip, day off & leave, warnings, and My information folded into a small card.
    function leavePanel(mine, pending) {
      return `
        <div class="panel lv-panel">
          <h3><i class="fas fa-plane-departure"></i> Day off &amp; leave</h3>
          <div class="lv-actions">
            <button type="button" class="lv-btn dayoff" data-new="dayoff"><i class="fas fa-calendar-minus"></i> Request day off</button>
            <button type="button" class="lv-btn leave" data-new="leave"><i class="fas fa-suitcase"></i> Request leave</button>
          </div>
          <h4 class="lv-sub">My requests ${pending ? `<span class="lv-count">${pending} pending</span>` : ""}</h4>
          ${mine.length ? `
            <div class="lv-list">
              ${mine.map((r) => `
                <div class="lv-item">
                  <div class="lv-item-top"><b>${esc(r.type)}</b> ${badge(r.status)}</div>
                  <div class="lv-item-when"><i class="far fa-calendar"></i> ${esc(niceRange(r))} · ${r.days} day${r.days === 1 ? "" : "s"}</div>
                  ${r.reason ? `<div class="lv-item-reason">${esc(r.reason)}</div>` : ""}
                  ${r.status !== "Pending" && (r.decidedBy || r.note) ? `<div class="lv-item-note">${r.status} by ${esc(r.decidedBy || "the office")}${r.note ? `: “${esc(r.note)}”` : ""}</div>` : ""}
                  ${r.status === "Pending" ? `<button type="button" class="lv-cancel" data-cancel="${r.id}">Cancel request</button>` : ""}
                </div>`).join("")}
            </div>` : `<p class="lv-empty">No requests yet.</p>`}
        </div>`;
    }

    // "This week" tiles: today's time in, lates this week, last net pay, leave requests
    function weekSummary(s, pending) {
      const tiles = [];
      if (typeof TimeClock !== "undefined") {
        const TC = TimeClock, res = tcTaps[tcThisWeek()];
        const week = res && res.taps ? TC.days(res.taps)[String(s.id)] || {} : null;
        const todayRow = week && week[TC.today()];
        const sum = week ? TC.summary(week) : null;
        tiles.push(!week ? { icon: "fa-id-card", label: "Today's time in", value: "…" }
          : todayRow ? { icon: "fa-id-card", label: "Today's time in", value: TC.timeText(todayRow.in),
              note: todayRow.lateMin ? `${todayRow.lateMin} min late` : "On time", tone: todayRow.lateMin ? "bad" : "good" }
          : { icon: "fa-id-card", label: "Today's time in", value: "Not yet", note: "Tap your IC card", tone: "mut" });
        tiles.push(!sum ? { icon: "fa-clock", label: "Late this week", value: "…" }
          : { icon: "fa-clock", label: "Late this week", value: sum.deduction ? "− " + TC.peso(sum.deduction) : "₱0.00",
              note: sum.lateMin ? `${sum.lateMin} min · ${sum.lateDays} day${sum.lateDays === 1 ? "" : "s"}` : "No lates", tone: sum.lateMin ? "bad" : "good" });
      }
      if (typeof Payslip !== "undefined") {
        const last = slips && slips.slips && slips.slips[0];
        tiles.push(!slips ? { icon: "fa-wallet", label: "Last net pay", value: "…" }
          : last ? { icon: "fa-wallet", label: "Last net pay", value: Payslip.peso(Payslip.pay(last).net), note: last.label || last.period, href: "mypay.html#latest" }
          : { icon: "fa-wallet", label: "Last net pay", value: "—", note: "No payslip yet", tone: "mut" });
      }
      tiles.push({ icon: "fa-plane-departure", label: "Leave requests", value: pending ? `${pending} pending` : "None pending", tone: pending ? "warn" : "mut" });
      return `
        <section class="emp-week">
          ${tiles.map((t) => `
            <${t.href ? `a href="${t.href}"` : "div"} class="emp-tile ${t.tone || ""}">
              <i class="fas ${t.icon}"></i>
              <span class="emp-tile-l">${esc(t.label)}</span>
              <b>${esc(t.value)}</b>
              ${t.note ? `<small>${esc(t.note)}</small>` : ""}
            </${t.href ? "a" : "div"}>`).join("")}
        </section>`;
    }

    // Remember whether "My information" is unfolded, so a redraw (new card tap…) doesn't fold it again
    let empInfoOpen = false;
    root.addEventListener("toggle", (e) => { if (e.target.matches && e.target.matches(".emp-info")) empInfoOpen = e.target.open; }, true);

    function employeeLayout(s, mine, pending, info) {
      // My time in and My attendance are on the My Attendance page; the requests and payslip fill the width here
      return `
        ${weekSummary(s, pending)}
        <div class="emp-grid no-main">
          <div class="emp-side">
            ${payslipPanel()}
            ${leavePanel(mine, pending)}
            ${cashPanel()}
            ${warningsPanel(s)}
            ${noInfo ? "" : `
            <details class="panel lv-panel emp-info"${empInfoOpen ? " open" : ""}>
              <summary>
                ${avatarHtml(s)}
                <div><b>${esc(s.name)}</b><span class="lv-position"><i class="fas fa-briefcase"></i> ${esc(s.position || "No position yet")}</span></div>
                <span class="emp-info-more">My information <i class="fas fa-chevron-down"></i></span>
              </summary>
              <dl class="lv-info">
                ${info.map(([k, v, wide]) => `<div${wide ? ' class="wide"' : ""}><dt>${k}</dt><dd>${esc(v) || "—"}</dd></div>`).join("")}
              </dl>
              <p class="lv-hint">Something wrong here? Ask Human Resources to update it.</p>
            </details>
            `}
          </div>
        </div>`;
    }

    // My time in: IC card taps on the Time Clock (timeclock-lib.js, table time_taps). Every staff member
    // sees only their own; late minutes × ₱2 are taken off their pay (Payroll → Late).
    // WEEKLY: Monday to Sunday (the same pay week as Payroll), in Philippine dates. It checks for new taps
    // every 30 seconds while the Dashboard is open, so a tap shows up without refreshing.
    const tcAdd = (d, n) => { const [y, m, dd] = d.split("-").map(Number); return new Date(Date.UTC(y, m - 1, dd + n)).toISOString().slice(0, 10); };
    const tcMonday = (d) => { const [y, m, dd] = d.split("-").map(Number); return tcAdd(d, -((new Date(Date.UTC(y, m - 1, dd)).getUTCDay() + 6) % 7)); };
    const tcShort = (d) => new Date(d + "T00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
    const tcThisWeek = () => tcMonday(TimeClock.today());
    let tcWeek = typeof TimeClock !== "undefined" ? tcThisWeek() : "";   // the Monday, "2026-11-16"
    const tcTaps = {};   // week → { taps } | { error } | null while loading
    const tcSig = (res) => (res && res.taps ? res.taps.map((t) => t.id).join(",") : "x");
    async function tcReload(s, week) {
      const res = await TimeClock.load(week, tcAdd(week, 6), s.id);
      if (tcTaps[week] && tcSig(res) === tcSig(tcTaps[week])) return;   // already showing these taps: nothing new
      tcTaps[week] = res;
      if (root.isConnected) draw();
    }
    if (typeof TimeClock !== "undefined") {
      const live = () => { const s = me(); if (s && tcWeek && document.visibilityState === "visible") tcReload(s, tcWeek); };
      setInterval(live, 30000);
      document.addEventListener("visibilitychange", live);
    }
    function timePanel(s) {
      if (typeof TimeClock === "undefined") return "";
      const TC = TimeClock;
      if (tcTaps[tcWeek] === undefined) {
        tcTaps[tcWeek] = null;
        tcReload(s, tcWeek);
      }
      const res = tcTaps[tcWeek];
      const sun = tcAdd(tcWeek, 6);
      const label = `${tcShort(tcWeek)} – ${tcShort(sun)}, ${sun.slice(0, 4)}`;
      const isNow = tcWeek >= tcThisWeek();
      let body;
      if (!res) body = `<p class="lv-empty">Loading…</p>`;
      else if (res.error) body = `<p class="lv-empty">${res.missing ? "The Time Clock isn't set up yet." : "Couldn't load your time in. Try refreshing."}</p>`;
      else body = TC.panelHtml(TC.days(res.taps)[String(s.id)] || {}, label);
      return `
        <div class="panel lv-panel at-panel tc-panel">
          <div class="at-head">
            <h3><i class="fas fa-id-card"></i> My time in</h3>
            <div class="at-month">
              <button type="button" data-tcm="-1" aria-label="Previous week"><i class="fas fa-chevron-left"></i></button>
              <b>${esc(label)}</b>
              <button type="button" data-tcm="1" aria-label="Next week"${isNow ? " disabled" : ""}><i class="fas fa-chevron-right"></i></button>
            </div>
          </div>
          ${body}
          <p class="lv-hint">Tap your IC card on the Time Clock when you arrive and when you leave. ${esc(TC.ruleText())}</p>
        </div>`;
    }

    // My payslip: the latest finalized one (only the person's own, from payslip.js)
    let slips = null;   // null while loading, then { slips } or { error, missing }
    function payslipPanel() {
      if (typeof Payslip === "undefined") return "";
      const head = `<h3><i class="fas fa-file-invoice-dollar"></i> My payslip</h3>`;
      if (!slips) return `<div class="panel lv-panel ps-panel">${head}<p class="lv-empty">Loading…</p></div>`;
      if (slips.error) return `<div class="panel lv-panel ps-panel">${head}<p class="lv-empty">${slips.missing
        ? "Payslips aren't set up yet. Ask the Developer to run supabase/my_payslips.sql."
        : "Couldn't load your payslip. Try refreshing."}</p></div>`;
      const last = slips.slips[0];
      if (!last) return `<div class="panel lv-panel ps-panel">${head}<p class="lv-empty">No payslip yet. It shows up here once HR finalizes a pay period.</p></div>`;
      const p = Payslip.pay(last);
      return `
        <div class="panel lv-panel ps-panel">
          ${head}
          <div class="ps-period"><i class="far fa-calendar"></i> ${esc(last.label || last.period)}</div>
          <div class="ps-net"><span>Net pay</span><b>${Payslip.peso(p.net)}</b></div>
          <div class="ps-split">
            <div><span>Gross pay</span><b>${Payslip.peso(p.gross)}</b></div>
            <div><span>Deductions</span><b>${Payslip.peso(p.ded)}</b></div>
          </div>
          <div class="lv-actions">
            <a class="lv-btn dayoff" href="mypay.html#latest"><i class="fas fa-file-invoice"></i> View payslip</a>
            ${slips.slips.length > 1 ? `<a class="lv-btn leave" href="mypay.html"><i class="fas fa-history"></i> All payslips (${slips.slips.length})</a>` : ""}
          </div>
        </div>`;
    }
    if (typeof Payslip !== "undefined") Payslip.load().then((res) => { slips = res; draw(); });

    // My attendance: days with a DONE job on the Daily Schedule, and units installed (attendance.js).
    // Only for crew positions (installers, team service, drivers).
    // The dates shown: a month ("2026-11"), a week ("wk-…") or any dates ("rg-…") picked in the date-range picker (daterange.js)
    let attMonth = typeof Attendance !== "undefined" ? Attendance.thisMonth() : "";
    let attPreset = "This month";
    const attPay = {};   // month → my rate + incentive (only my own, from my_attendance_pay())
    function loadAttPay(m, s) {
      if (attPay[m] !== undefined) return;
      attPay[m] = null;
      Attendance.loadPay(m, null, s).then((p) => { attPay[m] = p; draw(); });
    }
    function attendancePanel(s) {
      if (typeof Attendance === "undefined" || !Attendance.isCrew(s)) return "";
      const A = Attendance, payMonth = A.monthOf(attMonth);
      loadAttPay(payMonth, s);
      const isNow = A.periodRange(attMonth)[1] >= ymd(new Date());   // nothing to see after today
      return `
        <div class="panel lv-panel at-panel">
          <div class="at-head">
            <h3><i class="fas fa-user-check"></i> My attendance</h3>
            <div class="at-month">
              <button type="button" data-att="-1" aria-label="Earlier"><i class="fas fa-chevron-left"></i></button>
              <button type="button" class="at-range" data-att-pick title="Choose the dates">
                <i class="far fa-calendar-alt"></i>
                <span>${attPreset && attPreset !== "Custom" ? `<small>${esc(attPreset)}</small>` : ""}<b>${esc(A.periodLabel(attMonth))}</b></span>
                <i class="fas fa-caret-down"></i>
              </button>
              <button type="button" data-att="1" aria-label="Later"${isNow ? " disabled" : ""}><i class="fas fa-chevron-right"></i></button>
            </div>
          </div>
          ${A.sheetHtml(s, attMonth, attPay[payMonth] || null, false)}
          <p class="lv-hint">From the Daily Schedule: your jobs show here as soon as the office puts your name on a crew. Units count once a job is DONE. Wrong or missing job? Tell the office.</p>
        </div>`;
    }

    // My warnings: newest first; unread ones have a "Mark as read" button
    function warningsPanel(s) {
      const mine = warnings().filter((w) => w.staffId === s.id).sort((a, b) => String(b.date).localeCompare(String(a.date)) || b.id - a.id);
      const unread = mine.filter((w) => !w.readAt).length;
      return `
        <div class="panel lv-panel wn-panel">
          <h3><i class="fas fa-exclamation-circle"></i> My warnings
            ${unread ? `<span class="wn-unread">${unread} new</span>` : ""}</h3>
          ${mine.length ? `
            <div class="lv-list">
              ${mine.map((w) => `
                <div class="lv-item wn-item ${levelClass(w.level)}${w.readAt ? "" : " unread"}">
                  <div class="lv-item-top">${levelBadge(w.level)}<span class="wn-date"><i class="far fa-calendar"></i> ${esc(nice(w.date))}</span></div>
                  <div class="lv-item-reason">${esc(w.reason)}</div>
                  <div class="lv-item-note">Given by ${esc(w.givenBy || "Human Resources")}</div>
                  ${w.readAt
                    ? `<div class="wn-read"><i class="fas fa-check"></i> Read on ${esc(new Date(w.readAt).toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }))}</div>`
                    : `<button type="button" class="lv-btn wn-ack" data-ack="${w.id}"><i class="fas fa-check"></i> Mark as read</button>`}
                </div>`).join("")}
            </div>` : `<p class="lv-empty">No warnings.</p>`}
        </div>`;
    }

    function openForm(kind) {
      const s = me();
      if (!s) return;
      const t = ymd(new Date());
      const isDayOff = kind === "dayoff";
      const p = popup(isDayOff ? "Request day off" : "Request leave", `
        <form class="lv-form" novalidate>
          ${isDayOff ? `
            <label>Date${dateField("from")}</label>` : `
            <label>Type of leave<select name="type" required>${TYPES.map((x) => `<option>${x}</option>`).join("")}</select></label>
            <div class="lv-two">
              <label>From${dateField("from")}</label>
              <label>To${dateField("to")}</label>
            </div>`}
          <label>Reason<textarea name="reason" rows="3" placeholder="${isDayOff ? "e.g. family event" : "e.g. fever, out of town"}"></textarea></label>
          <p class="lv-error" hidden></p>
          <div class="lv-form-actions">
            <button type="button" class="lv-btn light" data-close>Cancel</button>
            <button type="submit" class="lv-btn dayoff">Send request</button>
          </div>
        </form>`);
      const form = p.el.querySelector("form");
      const err = p.el.querySelector(".lv-error");
      form.querySelectorAll(".lv-date-field").forEach((field) => {
        const text = field.querySelector("[data-date-text]"), picker = field.querySelector("[data-date-value]"), button = field.querySelector(".lv-date-button");
        if (text.dataset.dateText === "from" && isDayOff) picker.min = t;
        text.addEventListener("input", () => {
          const digits = text.value.replace(/\D/g, "").slice(0, 8);
          text.value = digits.length <= 2 ? digits : digits.length <= 4 ? `${digits.slice(0, 2)}/${digits.slice(2)}` : `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
          picker.value = dateToISO(text.value);
        });
        picker.addEventListener("change", () => { text.value = isoToMDY(picker.value); });
        button.addEventListener("click", () => { if (picker.showPicker) picker.showPicker(); else picker.click(); });
      });
      p.el.querySelector("[data-close]").onclick = p.close;
      const fromPicker = form.elements.namedItem("from"), toPicker = form.elements.namedItem("to");
      if (!isDayOff) fromPicker.addEventListener("change", () => { if (!toPicker.value || toPicker.value < fromPicker.value) { toPicker.value = fromPicker.value; p.el.querySelector('[data-date-text="to"]').value = isoToMDY(fromPicker.value); } });
      p.el.querySelector('[data-date-text="from"]').focus();
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const fromText = p.el.querySelector('[data-date-text="from"]').value;
        const toText = isDayOff ? fromText : p.el.querySelector('[data-date-text="to"]').value;
        const from = dateToISO(fromText), to = isDayOff ? from : dateToISO(toText);
        const fail = (m) => { err.textContent = m; err.hidden = false; };
        if (!from) return fail("Enter the date as MM/DD/YYYY.");
        if (!to) return fail(isDayOff ? "Enter the date as MM/DD/YYYY." : "Enter the last day as MM/DD/YYYY.");
        if (to < from) return fail("The last day can't be before the first day.");
        if (isDayOff && from < t) return fail("A day off can't be in the past.");
        const list = all();
        const clash = list.find((r) => r.staffId === s.id && !isCash(r) && r.status !== "Rejected" && r.from <= to && r.to >= from);
        if (clash) return fail(`You already have a ${clash.type.toLowerCase()} on ${niceRange(clash)} (${clash.status}).`);
        list.push({
          id: Date.now(), staffId: s.id, name: s.name, code: s.code || "", position: s.position || "",
          type: isDayOff ? "Day off" : form.type.value, from, to, days: daysBetween(from, to),
          reason: form.reason.value.trim(), status: "Pending", requested: new Date().toISOString(),
          decidedBy: "", decidedAt: "", note: "",
        });
        save(list);
        p.close();
        draw();
      });
    }

    // Profile picture: tap the round picture → choose a photo (or take one on a phone) → saved online
    root.addEventListener("click", (e) => {
      const ph = e.target.closest("[data-photo]");
      if (!ph) return;
      e.preventDefault();   // inside "My information" (a <details>): don't open / close it
      e.stopPropagation();
      if (ph.classList.contains("busy")) return;
      const pick = document.createElement("input");
      pick.type = "file";
      pick.accept = "image/*";
      pick.onchange = async () => {
        const file = pick.files && pick.files[0];
        if (!file) return;
        ph.classList.add("busy");
        try {
          await uploadPhoto(file);
          draw();
          // The sidebar card (user.js) shows the new photo too
          const card = document.querySelector(".side .user-avatar");
          if (card && typeof Roles !== "undefined" && Roles.photoImg) {
            card.querySelector(".av-photo")?.remove();
            card.querySelector(".user-dot")?.insertAdjacentHTML("beforebegin", Roles.photoImg(Roles.myLoginEmail()));
          }
          if (window.notify) notify("Profile picture saved.", "good");
        } catch (err) {
          ph.classList.remove("busy");
          alert("Profile picture was NOT saved: " + (err.message || err));
        }
      };
      pick.click();
    }, true);

    root.addEventListener("click", (e) => {
      const att = e.target.closest("[data-att]");
      if (att && !att.disabled) {
        attMonth = Attendance.shiftPeriod(attMonth, +att.dataset.att);
        // "Last 7 days" moved back a week is no longer "Last 7 days"; a month / week keeps a plain label
        attPreset = /^\d{4}-\d{2}$/.test(attMonth) && attMonth === Attendance.thisMonth() ? "This month" : "";
        return draw();
      }
      const pick = e.target.closest("[data-att-pick]");
      if (pick && typeof DateRange !== "undefined") {
        const [from, to] = Attendance.periodRange(attMonth);
        let min = "";   // "All dates": from the first day on the Daily Schedule
        try { min = Object.keys(JSON.parse(localStorage.getItem("aircon_daily") || "{}")).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort()[0] || ""; } catch (err) {}
        DateRange.open({ anchor: pick, from, to, preset: attPreset || "Custom", min,
          onApply: (r) => { attMonth = Attendance.periodFor(r.from, r.to); attPreset = r.preset; draw(); } });
        return;
      }
      const tcm = e.target.closest("[data-tcm]");
      if (tcm && !tcm.disabled) {
        tcWeek = tcAdd(tcWeek, 7 * +tcm.dataset.tcm);
        return draw();
      }
      const n = e.target.closest("[data-new]");
      if (n) return n.dataset.new === "cash" ? openCashForm() : openForm(n.dataset.new);
      const c = e.target.closest("[data-cancel]");
      if (c && confirm("Cancel this request?")) {
        save(all().filter((r) => !(r.id === +c.dataset.cancel && r.status === "Pending")));
        draw();
      }
      const ack = e.target.closest("[data-ack]");
      if (ack) {
        const s = me(), list = warnings();
        const w = list.find((x) => x.id === +ack.dataset.ack && s && x.staffId === s.id);
        if (w && !w.readAt) { w.readAt = new Date().toISOString(); saveWarnings(list); }
        draw();
      }
    });
    // Approved / rejected / a new warning on another computer: show it right away
    addEventListener("storage", (e) => { if ([LEAVE_KEY, WARN_KEY, "aircon_staff", "aircon_daily"].includes(e.key)) draw(); });
    (window.cloudReady || Promise.resolve()).then(draw);
    loadMyPrivate();
    draw();
  }

  // =====================================================================
  // HUMAN RESOURCES SIDE (Staff page): list every request, approve or reject
  // =====================================================================
  // cash: true → the Cash advance (vale) requests instead of day off & leave
  function mountManager(button, cash = false) {
    if (!isManager || !button) return;
    const mineKind = (r) => isCash(r) === cash;
    const count = () => {
      const n = all().filter((r) => mineKind(r) && r.status === "Pending").length;
      button.querySelector(".lv-count")?.remove();
      if (n) button.insertAdjacentHTML("beforeend", ` <span class="lv-count">${n}</span>`);
    };
    count();
    addEventListener("storage", (e) => { if (e.key === LEAVE_KEY) count(); });
    (window.cloudReady || Promise.resolve()).then(count);

    button.addEventListener("click", () => {
      let show = "Pending";
      const p = popup(cash ? "Cash advance requests" : "Day off & leave requests", `
        <div class="lv-tabs">${["Pending", "Approved", "Rejected", "All"].map((t) => `<button type="button" data-tab="${t}">${t}</button>`).join("")}</div>
        <div class="lv-table-wrap"><table class="lv-table">
          <thead><tr><th>Staff</th>${cash ? "<th class=\"num\">Amount</th><th>Needed</th>" : "<th>Type</th><th>Dates</th><th>Days</th>"}<th>Reason</th><th>Status</th><th></th></tr></thead>
          <tbody></tbody>
        </table></div>`);
      p.el.querySelector(".lv-box").classList.add("wide");
      const body = p.el.querySelector("tbody");
      const draw = () => {
        p.el.querySelectorAll("[data-tab]").forEach((b) => b.classList.toggle("on", b.dataset.tab === show));
        const list = all().filter((r) => mineKind(r) && (show === "All" || r.status === show))
          .sort((a, b) => (show === "Pending" ? String(a.from).localeCompare(String(b.from)) : String(b.requested).localeCompare(String(a.requested))));
        const sent = (r) => `<small>sent ${esc(new Date(r.requested).toLocaleDateString("en-PH", { month: "short", day: "numeric" }))}</small>`;
        body.innerHTML = list.length ? list.map((r) => `
          <tr>
            <td><b>${esc(r.name)}</b><small>${esc([r.position, r.code].filter(Boolean).join(" · "))}</small></td>
            ${cash ? `<td class="num"><b>${money(r.amount)}</b></td>
            <td>${esc(nice(r.from))}${sent(r)}</td>` : `<td>${esc(r.type)}</td>
            <td>${esc(niceRange(r))}${sent(r)}</td>
            <td class="num">${r.days}</td>`}
            <td class="reason">${esc(r.reason) || "—"}${r.note ? `<small>Note: ${esc(r.note)}</small>` : ""}</td>
            <td>${badge(r.status)}${r.decidedBy ? `<small>by ${esc(r.decidedBy)}</small>` : ""}</td>
            <td class="act">${r.status === "Pending" ? `
              <button type="button" class="lv-btn ok" data-decide="Approved" data-id="${r.id}"><i class="fas fa-check"></i> Approve</button>
              <button type="button" class="lv-btn no" data-decide="Rejected" data-id="${r.id}"><i class="fas fa-times"></i> Reject</button>` : ""}</td>
          </tr>`).join("") : `<tr><td colspan="${cash ? 6 : 7}" class="lv-empty">No ${show === "All" ? "" : show.toLowerCase() + " "}${cash ? "cash advance " : ""}requests.</td></tr>`;
      };
      p.el.addEventListener("click", (e) => {
        const tab = e.target.closest("[data-tab]");
        if (tab) { show = tab.dataset.tab; return draw(); }
        const d = e.target.closest("[data-decide]");
        if (!d || !isManager) return;
        const list = all();
        const r = list.find((x) => x.id === +d.dataset.id);
        if (!r || r.status !== "Pending") return draw();
        const status = d.dataset.decide;
        const decision = popup(`${status === "Approved" ? "Approve" : "Reject"} ${cash ? "cash advance" : "leave request"}`, `
          <form class="lv-form lv-decision-form" novalidate>
            <p class="lv-decision-summary"><b>${esc(r.name)}</b> · ${cash ? `${esc(money(r.amount))} · needed ${esc(nice(r.from))}` : `${esc(r.type)} · ${esc(niceRange(r))}`}</p>
            <label for="lvDecisionNote">Optional note for the staff member<textarea id="lvDecisionNote" name="note" rows="3" placeholder="Add a note (optional)"></textarea></label>
            <div class="lv-form-actions">
              <button type="button" class="lv-btn light" data-close>Cancel</button>
              <button type="submit" class="lv-btn ${status === "Approved" ? "ok" : "no"}">${status === "Approved" ? "Approve request" : "Reject request"}</button>
            </div>
          </form>`);
        decision.el.querySelector("[data-close]").onclick = decision.close;
        decision.el.querySelector("form").addEventListener("submit", (event) => {
          event.preventDefault();
          const current = all();
          const target = current.find((x) => x.id === r.id && x.status === "Pending");
          if (!target) { decision.close(); draw(); return; }
          Object.assign(target, { status, note: decision.el.querySelector("[name=note]").value.trim(), decidedAt: new Date().toISOString(),
            decidedBy: sessionStorage.getItem("aircon_name") || sessionStorage.getItem("aircon_user") || "" });
          save(current);
          decision.close();
          draw();
          count();
        });
        decision.el.querySelector("textarea").focus();
      });
      draw();
    });
  }

  // =====================================================================
  // HUMAN RESOURCES: give and remove warnings (Staff page, Warnings button)
  // =====================================================================
  function mountWarnings(button) {
    if (!isManager || !button) return;
    button.addEventListener("click", () => {
      const staff = read("aircon_staff", "[]").filter((s) => s.name).sort((a, b) => a.name.localeCompare(b.name));
      const p = popup("Warnings", `
        <form class="lv-form wn-form" novalidate>
          <div class="wn-form-grid">
            <label>Staff<select name="staff" required>
              <option value="">Select staff</option>
              ${staff.map((s) => `<option value="${s.id}">${esc(s.name)}${s.position ? " · " + esc(s.position) : ""}</option>`).join("")}
            </select></label>
            <label>Level<select name="level">${LEVELS.map((l) => `<option>${l}</option>`).join("")}</select></label>
            <label>Date<input type="date" name="date" value="${ymd(new Date())}" required></label>
          </div>
          <label>Reason<textarea name="reason" rows="2" placeholder="e.g. Late 3 times this week without notice"></textarea></label>
          <p class="lv-error" hidden></p>
          <div class="lv-form-actions"><button type="submit" class="lv-btn no wn-give"><i class="fas fa-exclamation-circle"></i> Give warning</button></div>
        </form>
        <h4 class="lv-sub">All warnings</h4>
        <div class="lv-table-wrap"><table class="lv-table">
          <thead><tr><th>Staff</th><th>Level</th><th>Date</th><th>Reason</th><th>Read</th><th></th></tr></thead>
          <tbody></tbody>
        </table></div>`);
      p.el.querySelector(".lv-box").classList.add("wide");
      const form = p.el.querySelector("form"), err = p.el.querySelector(".lv-error"), body = p.el.querySelector("tbody");
      const draw = () => {
        const list = warnings().sort((a, b) => String(b.date).localeCompare(String(a.date)) || b.id - a.id);
        body.innerHTML = list.length ? list.map((w) => `
          <tr>
            <td><b>${esc(w.name)}</b><small>${esc(w.position)}</small></td>
            <td>${levelBadge(w.level)}</td>
            <td>${esc(nice(w.date))}<small>by ${esc(w.givenBy)}</small></td>
            <td class="reason">${esc(w.reason)}</td>
            <td>${w.readAt ? `<span class="lv-status approved">Read</span><small>${esc(new Date(w.readAt).toLocaleDateString("en-PH", { month: "short", day: "numeric" }))}</small>` : `<span class="lv-status pending">Not yet</span>`}</td>
            <td class="act"><button type="button" class="lv-btn no" data-remove="${w.id}" title="Remove this warning"><i class="fas fa-trash"></i></button></td>
          </tr>`).join("") : `<tr><td colspan="6" class="lv-empty">No warnings given yet.</td></tr>`;
      };
      form.addEventListener("submit", (e) => {
        e.preventDefault();
        const fail = (m) => { err.textContent = m; err.hidden = false; };
        const s = staff.find((x) => x.id === +form.staff.value);
        if (!s) return fail("Pick who the warning is for.");
        if (!form.date.value) return fail("Pick the date.");
        if (!form.reason.value.trim()) return fail("Write the reason, so they know what it's for.");
        const list = warnings();
        list.push({
          id: Date.now(), staffId: s.id, name: s.name, position: s.position || "", level: form.level.value,
          date: form.date.value, reason: form.reason.value.trim(),
          givenBy: sessionStorage.getItem("aircon_name") || sessionStorage.getItem("aircon_user") || "Human Resources",
          givenAt: new Date().toISOString(), readAt: "",
        });
        saveWarnings(list);
        err.hidden = true;
        form.staff.value = ""; form.reason.value = "";
        draw();
      });
      p.el.addEventListener("click", (e) => {
        const rm = e.target.closest("[data-remove]");
        if (!rm) return;
        const w = warnings().find((x) => x.id === +rm.dataset.remove);
        if (!w || !confirm(`Remove the ${w.level.toLowerCase()} given to ${w.name} on ${nice(w.date)}?\n\nIt will disappear from their Dashboard too.`)) return;
        saveWarnings(warnings().filter((x) => x.id !== w.id));
        draw();
      });
      draw();
    });
  }

  return { all, me, mountEmployee, mountManager, mountWarnings, isManager, isCash };
})();
