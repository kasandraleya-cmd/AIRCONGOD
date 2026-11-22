// Redirect to the login page if nobody is logged in
if (!sessionStorage.getItem("aircon_user")) location.href = "index.html";

(function showLoggedInUser() {
  const username = sessionStorage.getItem("aircon_user") || "user";
  const capitalize = (t) => t.charAt(0).toUpperCase() + t.slice(1);

  // Use the saved name and role, or work them out from the username
  const name = sessionStorage.getItem("aircon_name") || capitalize(username);
  const role =
    sessionStorage.getItem("aircon_role") || (username === "admin" ? "Administrator" : "Staff");

  // Remember the first time this session opened a page
  if (!sessionStorage.getItem("aircon_since")) {
    sessionStorage.setItem("aircon_since", Date.now());
  }
  const since = new Date(+sessionStorage.getItem("aircon_since")).toLocaleTimeString([], {
    hour: "numeric",
    minute: "2-digit",
  });

  const make = (tag, className, text) => {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text) el.textContent = text;
    return el;
  };

  const card = make("div", "user-card");

  const avatar = make("div", "user-avatar", name.charAt(0).toUpperCase());
  // Their profile picture over the letter, when they have one (roles.js photoImg)
  if (typeof Roles !== "undefined" && Roles.photoImg) avatar.insertAdjacentHTML("beforeend", Roles.photoImg(Roles.myLoginEmail()));
  avatar.append(make("span", "user-dot"));

  const info = make("div", "user-info");
  info.append(make("b", "", name), make("span", "user-role", role), make("small", "", "Online since " + since));

  card.append(avatar, info);

  // Put the card just above the Logout button
  const logout = document.querySelector(".out, #out, .logout, [data-logout]");
  if (logout) logout.parentNode.insertBefore(card, logout);
  else (document.querySelector(".side, aside") || document.body).appendChild(card);
})();

// The Price List page is for Developers only. Everyone else doesn't see its link in the sidebar;
// the prices still fill in by themselves when they type a unit on Sales or Warranty
// (that uses pricelist.js, not the page).
(function hidePriceListFromStaff() {
  if (sessionStorage.getItem("aircon_role") === "Developer") return;
  document.querySelectorAll("nav button").forEach((b) => {
    if ((b.getAttribute("onclick") || "").includes("pricelist.html") || b.classList.contains("on") && /Price List/.test(b.textContent)) b.remove();
  });
})();

// Payroll (payroll.html) is only for Developers, Owners and Human Resources:
// nobody else sees its link, and opening it directly goes back to the Dashboard.
// (The database also refuses payroll to anyone else: supabase/payroll.sql.)
(function payrollForHROnly() {
  if (Roles.me().staffAndPay) return;   // Owner / Founder, Head Supervisor, HR, Manager, Developer (roles.js)
  if ((location.pathname.split("/").pop() || "").toLowerCase() === "payroll.html") {
    document.documentElement.style.visibility = "hidden";
    location.replace("dashboard.html");
    return;
  }
  document.querySelectorAll("nav button").forEach((b) => {
    if ((b.getAttribute("onclick") || "").includes("payroll.html")) b.remove();
  });
})();

// Cleaning Records (cleaning-records.html) is hidden from installers (Head / Senior / Junior / Assistant
// Installer), warehouse staff and drivers: no sidebar link, no links to it, and opening it directly goes
// back to the Dashboard. Anyone of them with "Office access" ticked on their Staff record still has it.
// Services, Installation Supervisor and the office keep it.
// Particular people (not a whole position): Cris and Noel don't get Expenses, Staff, Payroll, Scanner,
// Serial Number Tracking or Inventory, nor the Crew attendance box, Low-stock and Sales tiles on the Dashboard.
// Matched by the logged-in person's first name or nickname on the Staff page (e.g. "Noel Pestañas", nickname "Noel").
// To add or remove someone, change PEOPLE below.
(function hideForCertainPeople() {
  const PEOPLE = ["cris", "noel"];
  const PAGES = ["cashvoucher.html", "staff.html", "payroll.html", "scanner.html", "serialtrackernumber.html", "inventory.html"];
  const first = (t) => String(t || "").trim().toLowerCase().split(/\s+/)[0] || "";
  let names = [first(sessionStorage.getItem("aircon_name"))];
  try {
    const user = String(sessionStorage.getItem("aircon_user") || "").trim().toLowerCase();
    const domain = typeof LOGIN_DOMAIN !== "undefined" ? LOGIN_DOMAIN : "aircongod.app";
    const s = (JSON.parse(localStorage.getItem("aircon_staff") || "[]") || []).find((x) => x && x.username && (
      String(x.username).toLowerCase() === user || String(x.login || x.username + "@" + domain).toLowerCase() === user));
    if (s) names.push(first(s.name), first(s.nickname));
  } catch (e) {}
  if (!names.some((n) => PEOPLE.includes(n))) return;
  if (PAGES.includes((location.pathname.split("/").pop() || "").toLowerCase())) {
    document.documentElement.style.visibility = "hidden";
    location.replace("dashboard.html");
    return;
  }
  const hit = (text) => PAGES.some((p) => String(text || "").includes(p));
  document.querySelectorAll("nav button").forEach((b) => { if (hit(b.getAttribute("onclick"))) b.remove(); });
  document.querySelectorAll("a[href]").forEach((a) => {
    if (!hit(a.getAttribute("href"))) return;
    // Dashboard tiles (e.g. Low-stock items → Inventory) stay visible, just not clickable; other links go
    if (a.classList.contains("db-kpi")) { a.removeAttribute("href"); a.style.cursor = "default"; } else a.remove();
  });
  // Dashboard: the Crew attendance box (rates and incentives of the whole crew), the Low-stock and
  // Sales this month tiles, the Monthly sales / top brands row and the sales numbers in the welcome banner
  const hideAtt = () => {
    const low = document.getElementById("lowCount");
    [...document.querySelectorAll(".db-att, #salesKpi, #salesRow, #heroSum"), low && low.closest(".db-kpi")]
      .forEach((el) => { if (el) { el.hidden = true; el.style.display = "none"; } });
    const kpis = document.querySelector(".db-kpis");
    if (kpis) kpis.classList.remove("three");   // the tiles left keep their normal size (dashboard.css)
  };
  hideAtt();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", hideAtt);
})();

// Expenses (cashvoucher.html), Payroll (payroll.html) and Scanner (scanner.html) are hidden from Admin / Office Staff, HR and Manager;
// Staff (staff.html) too, except for HR (Human Resources), who approves leave, cash advances and warnings there.
// No sidebar link, no links to them, and opening one directly goes back to the Dashboard.
// (Owner / Head Supervisor and Developer keep them all.)
(function hideMoneyAndStaffPages() {
  const r = Roles.me();
  if (r.dev || r.owner || !(r.hr || r.office)) return;
  const isHR = ["hr", "human resources"].includes(r.position);
  // Scanner (scanner.html) is hidden from all of them too
  const PAGES = ["cashvoucher.html", "payroll.html", "scanner.html", ...(isHR ? [] : ["staff.html"])];
  if (PAGES.includes((location.pathname.split("/").pop() || "").toLowerCase())) {
    document.documentElement.style.visibility = "hidden";
    location.replace("dashboard.html");
    return;
  }
  const hit = (text) => PAGES.some((p) => String(text || "").includes(p));
  document.querySelectorAll("nav button").forEach((b) => { if (hit(b.getAttribute("onclick"))) b.remove(); });
  const tidy = () => document.querySelectorAll("a[href]").forEach((a) => {
    if (!hit(a.getAttribute("href"))) return;
    // Dashboard tiles stay visible, just not clickable; other links go
    if (a.classList.contains("db-kpi")) { a.removeAttribute("href"); a.style.cursor = "default"; } else a.remove();
  });
  tidy();
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", tidy);
})();

// Ocular Survey (ocular.html) is hidden the same way from warehouse staff and drivers.
(function hideCleaningRecordsFromInstallers() {
  const WAREHOUSE_DRIVERS = ["warehouse staff", "warehouse staff / driver", "driver", "driver / mechanic"];
  const HIDE = {
    "cleaning-records.html": ["head installer", "senior installer", "junior installer", "assistant installer",
      "installer", "technician / head installer", "technician",   // (the last three: older position names)
      ...WAREHOUSE_DRIVERS],
    "ocular.html": WAREHOUSE_DRIVERS,
  };
  const r = Roles.me();
  if (r.manager || r.fieldOffice) return;
  const pages = Object.keys(HIDE).filter((p) => HIDE[p].includes(r.position));
  if (!pages.length) return;
  if (pages.includes((location.pathname.split("/").pop() || "").toLowerCase())) {
    document.documentElement.style.visibility = "hidden";
    location.replace("dashboard.html");
    return;
  }
  pages.forEach((page) => {
    document.querySelectorAll("nav button").forEach((b) => { if ((b.getAttribute("onclick") || "").includes(page)) b.remove(); });
    document.querySelectorAll(`a[href*="${page}"]`).forEach((a) => a.remove());
  });
})();

// Ocular Records (ocular-records.html): only HR / Manager, Owner / Head Supervisor, Installation Supervisor,
// Admin / Office Staff and Developer (the same people who see the ocular history, ocular.js canHistory).
// Everyone else: no sidebar link, and opening it goes back to the Dashboard.
(function ocularRecordsForOfficeOnly() {
  const r = Roles.me();
  if (r.dev || r.owner || r.hr || r.office || r.position === "installation supervisor") return;
  const PAGE = "ocular-records.html";
  if ((location.pathname.split("/").pop() || "").toLowerCase() === PAGE) {
    document.documentElement.style.visibility = "hidden";
    location.replace("dashboard.html");
    return;
  }
  document.querySelectorAll("nav button").forEach((b) => { if ((b.getAttribute("onclick") || "").includes(PAGE)) b.remove(); });
  document.querySelectorAll(`a[href*="${PAGE}"]`).forEach((a) => a.remove());
})();

// Room Measurement (btucalc.html) is hidden from Editors and Warehouse Staff:
// no sidebar link, and opening the page directly goes back to the Dashboard.
(function hideRoomMeasurement() {
  const r = Roles.me();
  if (!(r.editor || (r.warehouse && !r.crew))) return;   // editors and warehouse staff (not a warehouse driver)
  // Ocular Survey (ocular.html) too: it's for installers and the office
  const HIDDEN = ["btucalc.html", "ocular.html"];
  if (HIDDEN.includes((location.pathname.split("/").pop() || "").toLowerCase())) {
    document.documentElement.style.visibility = "hidden";
    location.replace("dashboard.html");
    return;
  }
  document.querySelectorAll("nav button").forEach((b) => {
    if (HIDDEN.some((p) => (b.getAttribute("onclick") || "").includes(p))) b.remove();
  });
})();

// Accounting sees ONLY: Dashboard, Cash Voucher, Serial Number Tracking, Inventory (and their own pay).
// Every other page is taken out of the menu, and opening one goes back to the Dashboard.
(function accountingPagesOnly() {
  const r = Roles.me();
  if (!r.accounting || r.manager) return;
  const ALLOWED = ["dashboard.html", "myprofile.html", "myattendance.html", "cashvoucher.html", "serialtrackernumber.html", "inventory.html", "mypay.html", "index.html", ""];
  // "Office access" ticked on their Staff record (roles.js): the schedule / customer pages too
  if (r.fieldOffice) ALLOWED.push("dailysched.html", "schedule.html", "aftersales.html", "formalquotation.html", "survey.html", "warranty-records.html", "formal-records.html",
    "customers.html", "cleaning-records.html", "survey-records.html");
  const pageOf = (text) => ((String(text || "").match(/([\w-]+\.html)/i) || [])[1] || "").toLowerCase();
  const page = (location.pathname.split("/").pop() || "").toLowerCase();
  if (!ALLOWED.includes(page)) {
    document.documentElement.style.visibility = "hidden";
    location.replace("dashboard.html");
    return;
  }
  document.querySelectorAll("nav button").forEach((b) => { const p = pageOf(b.getAttribute("onclick")); if (p && !ALLOWED.includes(p)) b.remove(); });
  document.querySelectorAll("a[href]").forEach((a) => {
    const p = pageOf(a.getAttribute("href"));
    if (!p || ALLOWED.includes(p)) return;
    // Dashboard cards (e.g. the sales card links to Purchase) stay, just not clickable; other links go
    if (a.classList.contains("db-kpi")) { a.removeAttribute("href"); a.style.cursor = "default"; }
    else a.remove();
  });
  // (sidebar.js hides menu headings left with nothing under them)
})();

// Office pages have role-based visibility and direct-page guards. Warehouse Staff can use
// Scanner, Serial Number Tracking, and Inventory, while other office tools remain manager-only.
(function officePagesForManagersOnly() {
  const OFFICE_PAGES = [
    "scanner.html", "serialtrackernumber.html", "inventory.html", "aftersales.html", "formalquotation.html", "survey.html",
    "warranty-records.html", "formal-records.html",   // Warranty / Formal Records: same people as the Warranty page
    "sales.html", "jo-records.html", "customers.html", "schedule.html", "staff.html", "cashvoucher.html",
    "timeclock.html",   // Time Clock (IC card reader): office accounts only (supabase/time_clock.sql)
    "survey-records.html",   // Survey Records: office only, not installers / drivers / other crew
  ];
  // Purchase (sales.html): warehouse may open job orders to fill in the units' serial numbers only (sales.html locks the rest)
  const WAREHOUSE_PAGES = ["scanner.html", "serialtrackernumber.html", "inventory.html", "sales.html", "jo-records.html"];
  const page = (location.pathname.split("/").pop() || "").toLowerCase();
  const isManager = Roles.me().manager;     // owner, HR and office positions (roles.js)
  const isWarehouse = Roles.me().warehouse;
  // Cash Voucher (money): Owner, HR / Manager, Admin / Office Staff, Developer only; the database
  // allows the same (supabase/security_sales_cv.sql), so e.g. Installation Supervisor doesn't get it
  const MONEY_PAGES = ["cashvoucher.html"];
  const seesMoney = Roles.me().seesDashboardSales;
  // Accounting: Cash Voucher, Serial Number Tracking and Inventory (plus the Dashboard, which isn't an office page)
  const ACCOUNTING_PAGES = ["cashvoucher.html", "serialtrackernumber.html", "inventory.html"];
  const isAccounting = Roles.me().accounting;
  // "Office access" ticked on their Staff record (roles.js): Warranty (with its quotation / survey forms),
  // Customer Records, Weekly Schedule and Survey Records. (Daily Schedule and Cleaning Records are open to all.)
  const FIELD_OFFICE_PAGES = ["aftersales.html", "formalquotation.html", "survey.html", "customers.html", "schedule.html", "survey-records.html",
    "warranty-records.html", "formal-records.html"];
  const isFieldOffice = Roles.me().fieldOffice;
  const canOpen = (file) => (MONEY_PAGES.includes(file) ? seesMoney
    : isManager || (isWarehouse && WAREHOUSE_PAGES.includes(file)) || (isAccounting && ACCOUNTING_PAGES.includes(file))
      || (isFieldOffice && FIELD_OFFICE_PAGES.includes(file)));

  if (OFFICE_PAGES.includes(page) && !canOpen(page)) {
    document.documentElement.style.visibility = "hidden";   // don't flash the page before leaving
    location.replace("dashboard.html");
    return;
  }
  if (isManager && seesMoney) return;
  // The page a link opens, matched by its WHOLE file name ("aftersales.html" is not "sales.html")
  const isRestrictedLink = (text) => {
    const file = ((String(text || "").match(/([\w-]+\.html)/i) || [])[1] || "").toLowerCase();
    return OFFICE_PAGES.includes(file) && !canOpen(file);
  };
  document.querySelectorAll("nav button").forEach((b) => { if (isRestrictedLink(b.getAttribute("onclick"))) b.remove(); });
  document.querySelectorAll("a[href]").forEach((a) => {
    if (!isRestrictedLink(a.getAttribute("href"))) return;
    // Dashboard tiles (e.g. Low-stock items → Inventory) stay visible, just not clickable; other links go
    if (a.classList.contains("db-kpi")) { a.removeAttribute("href"); a.style.cursor = "default"; }
    else a.remove();
  });
})();

// Phones: the sidebar becomes a top bar. This adds the menu button that opens and closes it
// (the look is in style.css, under "MOBILE PHONES").
(function mobileMenu() {
  const side = document.querySelector(".side");
  const brand = side && side.querySelector(".side-brand");
  if (!brand || brand.querySelector(".nav-toggle")) return;

  const btn = document.createElement("button");
  btn.type = "button";
  btn.className = "nav-toggle";
  btn.setAttribute("aria-label", "Open menu");
  btn.setAttribute("aria-expanded", "false");
  btn.innerHTML = '<i class="fas fa-bars"></i>';
  brand.appendChild(btn);

  const setOpen = (open) => {
    document.body.classList.toggle("nav-open", open);
    btn.setAttribute("aria-expanded", String(open));
    btn.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    btn.innerHTML = open ? '<i class="fas fa-times"></i>' : '<i class="fas fa-bars"></i>';
    if (open) side.scrollTop = 0;
  };

  btn.addEventListener("click", () => setOpen(!document.body.classList.contains("nav-open")));
  // Close after choosing a page, on Escape, or when the screen gets wide again (e.g. rotating a tablet)
  side.querySelectorAll("nav button").forEach((b) => b.addEventListener("click", () => setOpen(false)));
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") setOpen(false); });
  // Tapping the dimmed page beside the sidebar closes it
  document.addEventListener("click", (e) => {
    if (document.body.classList.contains("nav-open") && !side.contains(e.target)) setOpen(false);
  });
  matchMedia("(min-width: 801px)").addEventListener("change", (e) => { if (e.matches) setOpen(false); });
})();

// Phones: don't jump straight into a text box when a page opens (it pops up the keyboard
// and scrolls wide sheets sideways). Desktop keeps the autofocus.
(function noAutofocusOnPhones() {
  if (!matchMedia("(max-width: 800px)").matches) return;
  let touched = false;   // once the user taps something, leave their focus alone
  ["pointerdown", "keydown"].forEach((t) => addEventListener(t, () => (touched = true), { once: true, capture: true }));
  const undo = () => {
    const el = document.activeElement;
    if (touched || !el || !el.matches("input, textarea, select")) return;
    el.blur();
    for (let p = el.parentElement; p; p = p.parentElement) p.scrollLeft = 0;
  };
  if (document.readyState === "complete") setTimeout(undo, 0);
  else addEventListener("load", () => setTimeout(undo, 0));
})();

// Phones: list tables (Inventory, Customers, Staff, Serial Number Tracking) become stacked cards,
// one card per row with each column's name beside its value. The labels come from the table header,
// so pages need no changes. Spreadsheet-style sheets (schedules, job order, price list) keep scrolling.
(function phoneTables() {
  const TABLES = ".inv-table-wrap > table, .table-container > table";
  function label(table) {
    const heads = [...table.querySelectorAll(":scope > thead th")].map((th) => th.textContent.trim());
    if (!heads.length) return;
    table.classList.add("ptable");
    table.parentElement.classList.add("ptable-wrap");
    table.querySelectorAll(":scope > tbody > tr").forEach((tr) => {   // not the rows of a table inside a row
      const cells = [...tr.children];
      tr.classList.toggle("p-empty", cells.length === 1 && !tr.querySelector("table"));   // "No items yet" rows stay one line
      tr.classList.toggle("p-full", cells.length === 1 && !!tr.querySelector("table"));   // a row holding its own small table
      let col = 0;
      cells.forEach((td) => {
        if (!td.hasAttribute("data-label")) td.setAttribute("data-label", heads[col] || "");
        col += +td.getAttribute("colspan") || 1;
      });
    });
  }
  const run = () => document.querySelectorAll(TABLES).forEach(label);
  const start = () => {
    run();
    // Pages redraw their rows (search, filters, live updates): label the new rows too
    let queued = false;
    new MutationObserver(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; run(); });
    }).observe(document.body, { childList: true, subtree: true });
  };
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", start) : start();
})();

// On-page notices instead of the browser's pop-up boxes.
// Every page's alert("...") now shows a notice at the top that closes by itself (tap to close sooner).
// confirm() questions still use the browser box, because the page has to wait for the answer.
(function notices() {
  const BAD = /\b(not|only|please|already|at least|can't|cannot|couldn't|wasn't|weren't|isn't|error|failed|empty|set a|nothing|no records)\b|n't\b/i;
  const GOOD = /\b(saved|added|updated|done|restored|archived)\b/i;
  let box;
  function toast(message, kind) {
    const text = String(message ?? "");
    if (!box) {
      box = document.createElement("div");
      box.id = "uiNotices";
      document.body.appendChild(box);
    }
    kind = kind || (BAD.test(text) ? "bad" : GOOD.test(text) ? "good" : "info");
    const n = document.createElement("div");
    n.className = "ui-notice " + kind;
    n.setAttribute("role", kind === "bad" ? "alert" : "status");
    const icon = { bad: "fa-exclamation-circle", good: "fa-check-circle", info: "fa-info-circle" }[kind];
    n.innerHTML = `<i class="fas ${icon}"></i><span></span><button type="button" aria-label="Close">&times;</button>`;
    n.querySelector("span").textContent = text;
    box.appendChild(n);
    while (box.children.length > 3) box.firstChild.remove();
    const close = () => { n.classList.add("out"); setTimeout(() => n.remove(), 200); };
    n.addEventListener("click", close);
    setTimeout(close, Math.min(10000, Math.max(3500, text.length * 70)));
  }
  window.notify = toast;
  window.alert = (message) => toast(message);
})();

// ---------- Warehouse: told about new job orders (Purchase page) ----------
// Warehouse Staff fill in the units' serial numbers on job orders, so on every page they get:
//   * a pop-up when a new job order comes in (also from another computer, live), with an "Open JO" button
//   * a red number on "Purchase" in the menu: job orders that still have units without a serial number
//   * a desktop notification too, if they allow it (button in the pop-up)
// The job orders they've already been told about are remembered on this computer.
(function warehouseJobAlerts() {
  if (typeof Roles === "undefined") return;
  const r = Roles.me();
  if (!r.warehouse || r.manager) return;
  const JOBS = "aircon_jobs";
  const SEEN = "aircon_jo_seen:" + String(sessionStorage.getItem("aircon_user") || "").toLowerCase();
  const BRANDS = /\b(MIDEA|AMERICAN HOME|CARRIER|TCL|LG|AUX|KOLIN|DAIKIN|PANASONIC|SAMSUNG|GREE|HISENSE)\b/i;
  const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const jobs = () => { try { return JSON.parse(localStorage.getItem(JOBS) || "[]") || []; } catch (e) { return []; } };
  // Aircon unit rows of a job order that have no serial number yet
  const needSerial = (j) => (j.items || []).filter((i) => i.desc && BRANDS.test(i.desc) && !String(i.serial || "").trim()).length;

  // Style (once)
  const css = document.createElement("style");
  css.textContent = `
    #joAlerts { position: fixed; left: 16px; bottom: 16px; z-index: 9500; display: grid; gap: 8px; width: min(360px, calc(100vw - 32px)); }
    .jo-alert { display: grid; grid-template-columns: auto 1fr auto; gap: 4px 12px; align-items: start; padding: 12px 14px;
      border: 1px solid #f3d27a; border-left: 5px solid #d5a52a; border-radius: 12px; background: #fffbea;
      box-shadow: 0 10px 28px rgba(7, 29, 73, .2); font: 13px system-ui, "Segoe UI", sans-serif; color: #16252b; animation: joIn .25s ease; }
    .jo-alert > i { grid-row: span 2; margin-top: 2px; color: #b45309; font-size: 18px; }
    .jo-alert b { font-size: 14px; color: #071d49; }
    .jo-alert small { grid-column: 2; color: #64767d; }
    .jo-alert .jo-x { border: 0; background: none; color: #64767d; font-size: 18px; line-height: 1; cursor: pointer; }
    .jo-alert .jo-actions { grid-column: 2 / -1; display: flex; flex-wrap: wrap; gap: 8px; margin-top: 6px; }
    .jo-alert .jo-actions a, .jo-alert .jo-actions button { padding: 6px 12px; border: 0; border-radius: 8px; font: 700 12.5px system-ui, sans-serif; cursor: pointer; text-decoration: none; }
    .jo-alert .jo-open { background: #071d49; color: #fff; }
    .jo-alert .jo-desk { background: #fff; color: #071d49; box-shadow: inset 0 0 0 1px #c9d3dc; }
    nav button .jo-badge { display: inline-grid; place-items: center; min-width: 20px; height: 20px; margin-left: auto; padding: 0 6px;
      border-radius: 99px; background: #dc2626; color: #fff; font-size: 11px; font-weight: 800; }
    @keyframes joIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: none; } }
    @media print { #joAlerts { display: none !important; } }`;
  document.head.appendChild(css);

  function popup(list) {
    let box = document.getElementById("joAlerts");
    if (!box) { box = document.createElement("div"); box.id = "joAlerts"; document.body.appendChild(box); }
    const canAsk = "Notification" in window && Notification.permission === "default";
    list.slice(-3).forEach((j) => {
      const n = needSerial(j);
      const el = document.createElement("div");
      el.className = "jo-alert";
      el.setAttribute("role", "alert");
      el.innerHTML = `<i class="fas fa-bell"></i>
        <b>New job order ${esc(j.no || "")}</b>
        <button type="button" class="jo-x" aria-label="Close">&times;</button>
        <small>${esc(j.customer || "")}${n ? ` · ${n} unit${n > 1 ? "s need" : " needs"} a serial number` : ""}</small>
        <div class="jo-actions"><a class="jo-open" href="sales.html?jo=${encodeURIComponent(j.id)}">Open JO</a>
          ${canAsk ? '<button type="button" class="jo-desk">Turn on desktop alerts</button>' : ""}</div>`;
      el.querySelector(".jo-x").onclick = () => el.remove();
      const desk = el.querySelector(".jo-desk");
      if (desk) desk.onclick = () => Notification.requestPermission().then(() => desk.remove());
      box.appendChild(el);
    });
    if (list.length > 3) {
      const more = document.createElement("div");
      more.className = "jo-alert";
      more.innerHTML = `<i class="fas fa-bell"></i><b>${list.length - 3} more new job orders</b><button type="button" class="jo-x" aria-label="Close">&times;</button>
        <div class="jo-actions"><a class="jo-open" href="sales.html">Open Job Order</a></div>`;
      more.querySelector(".jo-x").onclick = () => more.remove();
      box.appendChild(more);
    }
    // Desktop notification (when allowed), so it's seen even with the browser in the background
    if ("Notification" in window && Notification.permission === "granted") {
      list.slice(-3).forEach((j) => {
        try {
          const note = new Notification("New job order " + (j.no || ""), { body: [j.customer, needSerial(j) ? needSerial(j) + " unit(s) need a serial number" : ""].filter(Boolean).join(" · "), tag: "jo-" + j.id });
          note.onclick = () => { window.focus(); location.href = "sales.html?jo=" + encodeURIComponent(j.id); };
        } catch (e) {}
      });
    }
  }

  // Red number on "Purchase": job orders with units still missing a serial number
  function badge() {
    const n = jobs().filter((j) => needSerial(j) > 0).length;
    document.querySelectorAll("nav button").forEach((b) => {
      if (!/sales\.html/.test(b.getAttribute("onclick") || "") && !(b.classList.contains("on") && /sales\.html$/i.test(location.pathname))) return;
      let s = b.querySelector(".jo-badge");
      if (!n) { if (s) s.remove(); return; }
      if (!s) { s = document.createElement("span"); s.className = "jo-badge"; b.appendChild(s); }
      s.textContent = n;
      b.title = `Job Order · ${n} job order${n > 1 ? "s" : ""} with units needing a serial number`;
    });
  }

  function check() {
    const list = jobs();
    let seen = null;
    try { seen = JSON.parse(localStorage.getItem(SEEN) || "null"); } catch (e) {}
    const ids = list.map((j) => String(j.id));
    if (!Array.isArray(seen)) {   // first time on this computer: start from now, don't announce old ones
      localStorage.setItem(SEEN, JSON.stringify(ids));
      badge();
      return;
    }
    const known = new Set(seen);
    const fresh = list.filter((j) => !known.has(String(j.id)));
    if (fresh.length) {
      localStorage.setItem(SEEN, JSON.stringify(ids));
      popup(fresh);
    }
    badge();
  }

  // After the online data has loaded (cloud.js), then whenever job orders change (live from other computers)
  const start = () => (window.cloudReady || Promise.resolve()).then(check);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start); else start();
  window.addEventListener("storage", (e) => { if (e.key === JOBS) check(); });
})();
