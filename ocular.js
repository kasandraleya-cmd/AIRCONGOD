// OCULAR SURVEY: installers (and the office) list what a site needs: units, materials and other work,
// with NO prices (ocular.html). Submitting it sends it to the office: HR / Manager, Head Supervisor,
// Installation Supervisor (and Developer) see it on their Dashboard and turn it into a Formal Quotation,
// where the Price List prices fill in and can be edited.
//
// Saved under "aircon_ocular" (shared through the online database by cloud.js). Each survey:
// { id, client, date, address, contact, notes, rows: [{ type, d, q, u }], by, byName, submitted,
//   status: "New" | "Quoted", quotedBy, quotedAt }
const Ocular = (function () {
  const KEY = "aircon_ocular";
  const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const read = () => { try { return JSON.parse(localStorage.getItem(KEY) || "[]") || []; } catch (e) { return []; } };
  const write = (list) => localStorage.setItem(KEY, JSON.stringify(list));
  const items = (s) => (s.rows || []).filter((r) => (r.type || "item") === "item" && String(r.d || "").trim());
  const who = () => sessionStorage.getItem("aircon_name") || sessionStorage.getItem("aircon_user") || "";

  // HR / Manager, Owner / Head Supervisor, Admin / Office Staff, Installation Supervisor and Developer see the surveys to quote
  function canReview() {
    if (typeof Roles === "undefined") return false;
    const r = Roles.me();
    return r.dev || r.owner || r.hr || r.office || r.position === "installation supervisor";   // office = Admin / Office Staff
  }

  // Ocular history (every survey sent, with all its items): Admin / Office Staff, Supervisors, HR / Manager,
  // Owner and Developer. Removing one from the history: Owner, HR / Manager and Developer only.
  function canHistory() {
    if (typeof Roles === "undefined") return false;
    const r = Roles.me();
    return canReview() || r.office;
  }
  const canDelete = () => { if (typeof Roles === "undefined") return false; const r = Roles.me(); return r.dev || r.owner || r.hr; };

  // page: an element on a page (the Ocular Records page) to show the list in, instead of a pop-up window
  function showHistory(page) {
    if (!canHistory()) return;
    styles();
    const inline = page instanceof Element;
    const back = inline ? page : document.createElement("div");
    back.className = inline ? "oc-page" : "oc-back";
    back.innerHTML = `
      <div class="oc-box" role="${inline ? "region" : "dialog"}" aria-label="Ocular survey records">
        ${inline ? "" : `<div class="oc-box-head"><i class="fas fa-history"></i><h3>Ocular Survey · History</h3><button type="button" data-x aria-label="Close">&times;</button></div>`}
        <div class="oc-box-tools">
          <input type="search" data-q placeholder="Search client, address, item, installer…">
          <select data-st><option value="">All</option><option value="New">Waiting</option><option value="Quoted">Quoted</option></select>
        </div>
        <div class="oc-box-list" data-list></div>
      </div>`;
    if (!inline) document.body.appendChild(back);
    const q = back.querySelector("[data-q]"), st = back.querySelector("[data-st]");
    const open = new Set();   // surveys shown in full
    const when = (iso) => (iso ? new Date(iso).toLocaleString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" }) : "");
    // Date filter (daterange.js): by the day the site was surveyed, or the day it was sent when no survey date was entered
    const surveyDay = (s) => (typeof DateRange !== "undefined" ? DateRange.day(s.date) || DateRange.day(s.submitted) : "");
    const dates = typeof DateRange !== "undefined"
      ? DateRange.filter({ dates: () => read().map(surveyDay), onChange: () => draw(), title: "Show only the surveys done on these dates" })
      : null;
    if (dates) st.after(dates.el);
    const draw = () => {
      const term = q.value.trim().toLowerCase();
      const list = read().filter((s) => (!st.value || (st.value === "Quoted" ? s.status === "Quoted" : s.status !== "Quoted"))
        && (!dates || dates.has(surveyDay(s)))
        && (!term || [s.client, s.address, s.contact, s.byName, s.surveyor, s.notes, ...(s.rows || []).map((r) => r.d)].join(" ").toLowerCase().includes(term)));
      back.querySelector("[data-list]").innerHTML = list.length ? list.map((s) => {
        const it = items(s), full = open.has(s.id);
        return `<div class="oc-h-item">
          <div class="oc-h-top">
            <div class="oc-main">
              <b>${esc(s.client || "(no client name)")}</b>
              <small>${esc([s.address, s.contact].filter(Boolean).join(" · "))}</small>
              <small>Surveyed${s.date ? " " + esc(s.date) : ""} by <b>${esc(s.surveyor || s.byName || s.by || "?")}</b> · sent ${esc(when(s.submitted))}</small>
              <small>${s.status === "Quoted" ? `<span class="oc-st quoted">Quoted</span> by ${esc(s.quotedBy || "?")}${s.quotedIn ? " in " + esc(s.quotedIn) : ""} · ${esc(when(s.quotedAt))}` : `<span class="oc-st new">Waiting for quotation</span>`} · ${it.length} item${it.length === 1 ? "" : "s"}</small>
            </div>
            <div class="oc-acts">
              <button type="button" class="oc-btn" data-h-view="${s.id}"><i class="fas fa-${full ? "chevron-up" : "list"}"></i> ${full ? "Hide" : "View items"}</button>
              ${canReview() ? `<button type="button" class="oc-btn gold" data-oc-quote="${s.id}"><i class="fas fa-file-signature"></i> ${s.status === "Quoted" ? "Quote again" : "Make quotation"}</button>` : ""}
              ${canDelete() ? `<button type="button" class="oc-btn del" data-h-del="${s.id}" title="Remove from the history"><i class="fas fa-trash"></i></button>` : ""}
            </div>
          </div>
          ${full ? `<table class="oc-h-table"><thead><tr><th>Description</th><th>Qty</th><th>Unit</th></tr></thead><tbody>
            ${(s.rows || []).filter((r) => String(r.d || "").trim()).map((r) => (r.type || "item") === "item"
              ? `<tr><td>${esc(r.d)}</td><td class="c">${esc(r.q || "")}</td><td class="c">${esc(r.u || "")}</td></tr>`
              : `<tr class="oc-h-${esc(r.type)}"><td colspan="3">${esc(r.d)}</td></tr>`).join("")}
            </tbody></table>${s.notes ? `<p class="oc-notes"><i class="fas fa-sticky-note"></i> ${esc(s.notes)}</p>` : ""}` : ""}
        </div>`;
      }).join("") : `<p class="oc-empty" style="padding:24px 20px">${term || st.value || (dates && dates.active) ? "Nothing matches your search or dates." : "No ocular surveys yet."}</p>`;
    };
    draw();
    q.addEventListener("input", draw);
    st.addEventListener("change", draw);
    const close = () => { back.remove(); removeEventListener("keydown", onKey); removeEventListener("storage", onStore); };
    const onKey = (e) => { if (e.key === "Escape") close(); };
    const onStore = (e) => { if (e.key === KEY) draw(); };
    if (!inline) addEventListener("keydown", onKey);
    addEventListener("storage", onStore);
    if (inline) (window.cloudReady || Promise.resolve()).then(draw);   // the page: show the online list once it has loaded
    back.addEventListener("click", (e) => {
      if (!inline && (e.target === back || e.target.closest("[data-x]"))) return close();
      const v = e.target.closest("[data-h-view]");
      if (v) { const id = +v.dataset.hView; open.has(id) ? open.delete(id) : open.add(id); return draw(); }
      const qt = e.target.closest("[data-oc-quote]");
      if (qt) return toQuotation(+qt.dataset.ocQuote);
      const d = e.target.closest("[data-h-del]");
      if (d && canDelete()) {
        const list = read(), s = list.find((x) => x.id === +d.dataset.hDel);
        if (!s || !confirm(`Remove the ocular survey for ${s.client || "this client"} from the history?`)) return;
        write(list.filter((x) => x !== s));
        if (window.cloudSaveNow) window.cloudSaveNow(KEY);
        draw();
      }
    });
    if (!inline) setTimeout(() => q.focus(), 0);
  }

  function submit(survey) {
    const list = read();
    const s = { id: Date.now(), ...survey, by: sessionStorage.getItem("aircon_user") || "", byName: who(),
      submitted: new Date().toISOString(), status: "New", quotedBy: "", quotedAt: "" };
    list.unshift(s);
    write(list);
    if (window.cloudSaveNow) window.cloudSaveNow(KEY);
    return s;
  }

  // Open the Formal Quotation (where = "formal") or the Warranty quotation (where = "warranty") with the
  // survey's client and items; prices come from the Price List (anything not on it is left blank to type in)
  function makeQuotation(id, where) {
    const list = read();
    const s = list.find((x) => x.id === id);
    if (!s) return;
    const UNIT_WORD = { UNIT: "unit", FT: "ft.", SET: "sets", PC: "pc." };
    const money = (n) => Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    const rows = (s.rows || []).filter((r) => String(r.d || "").trim()).map((r) => {
      const type = r.type || "item";
      if (type !== "item") return { type, red: false, d: r.d, q: "", u: "", p: "", t: "", tm: false };
      const known = typeof PricePicker !== "undefined" ? PricePicker.find(r.src || r.d) : null;
      // Copper tube already written on the survey ("COPPER TUBE 35FT. - 10FT. FREE = 25FT. EXCESS", QTY 25):
      // the same line on the quotation, priced per ft from the copper tube that was picked (r.src: 1.0HP, 2.0HP…)
      if (typeof Copper !== "undefined" && Copper.isWritten(r.d)) {
        return { type, red: false, d: r.d, q: r.q || "", u: "ft.", p: known ? money(known.srp) : "", t: "", tm: false, cost: known ? known.srp : 0 };
      }
      // Older surveys: a copper tube with the WHOLE length in QTY → written the same way (the first 10 ft are free)
      if (typeof Copper !== "undefined" && Copper.isItem(r.d) && +r.q > 0) {
        const c = Copper.write(r.q);
        return { type, red: false, d: c.d, q: c.q, u: "ft.", p: known ? money(known.srp) : "", t: "", tm: false, cost: known ? known.srp : 0 };
      }
      return { type, red: false, d: known ? known.name : r.d, q: r.q || "1", u: r.u || (known ? UNIT_WORD[known.unit] || known.unit.toLowerCase() : ""),
        p: known ? money(known.srp) : "", t: "", tm: false };
    });
    if (s.notes) rows.push({ type: "note", red: false, d: s.notes, q: "", u: "", p: "", t: "", tm: false });
    let page;
    if (where === "warranty") {
      // Warranty quotation: the same hand-over the Job Order / Customer Records use (aircon_quote_from_jo).
      // Only the items go (no areas / notes); the Warranty page fills each Price List price by itself.
      const d = new Date(s.date || Date.now());
      const iso = isNaN(d) ? "" : d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
      sessionStorage.setItem("aircon_quote_from_jo", JSON.stringify({
        no: "the ocular survey", customer: s.client || "", mop: "", contact: s.contact || "", date: iso, address: s.address || "",
        // Copper tube within the free 10 ft: quantity 0 so it adds nothing (its price per ft is kept for later)
        items: rows.filter((r) => r.type === "item").map((r) => (r.cost !== undefined
          ? { desc: r.d, qty: +r.q || 0, cost: r.cost } : { desc: r.d, qty: +r.q || 1 })),
      }));
      page = "aftersales.html";
    } else {
      sessionStorage.setItem("aircon_formal_from_warranty", JSON.stringify({
        info: { client: s.client || "", date: s.date || "", address: s.address || "", contact: s.contact || "", mop: "" }, rows }));
      page = "formalquotation.html";
    }
    Object.assign(s, { status: "Quoted", quotedBy: who(), quotedAt: new Date().toISOString(), quotedIn: where === "warranty" ? "Quotation" : "Formal Quotation" });
    write(list);
    const go = () => (location.href = page);
    if (window.cloudSaveNow) window.cloudSaveNow(KEY).then(go, go); else go();
  }

  // "Make quotation": first ask where to make it, the Formal Quotation or the (Warranty) Quotation
  function toQuotation(id) {
    const s = read().find((x) => x.id === id);
    if (!s) return;
    styles();
    const back = document.createElement("div");
    back.className = "oc-back oc-pick-back";
    back.innerHTML = `
      <div class="oc-box oc-pick" role="dialog" aria-label="Where to make the quotation">
        <div class="oc-box-head"><i class="fas fa-file-signature"></i><h3>Make quotation for ${esc(s.client || "this client")}</h3><button type="button" data-x aria-label="Close">&times;</button></div>
        <p class="oc-pick-help">Where do you want to make it? The survey's items and Price List prices fill in; you can still change them.</p>
        <div class="oc-pick-choices">
          <button type="button" data-where="formal"><i class="fas fa-file-invoice"></i><b>Formal Quotation</b><small>With areas (rooms), titles and notes. For projects and many units.</small></button>
          <button type="button" data-where="warranty"><i class="fas fa-file-signature"></i><b>Quotation</b><small>The Warranty quotation, with terms, warranty and signatures.</small></button>
        </div>
      </div>`;
    document.body.appendChild(back);
    const close = () => { back.remove(); removeEventListener("keydown", onKey); };
    const onKey = (e) => { if (e.key === "Escape") close(); };
    addEventListener("keydown", onKey);
    back.addEventListener("click", (e) => {
      if (e.target === back || e.target.closest("[data-x]")) return close();
      const b = e.target.closest("[data-where]");
      if (!b) return;
      back.querySelectorAll("[data-where]").forEach((x) => (x.disabled = true));
      b.querySelector("b").textContent = "Opening…";
      makeQuotation(id, b.dataset.where);
    });
    back.querySelector("[data-where]").focus();
  }

  // ---------- Dashboard card for the people who quote ----------
  function styles() {
    if (document.getElementById("ocStyle")) return;
    const st = document.createElement("style");
    st.id = "ocStyle";
    st.textContent = `
      .oc-panel { margin-bottom: 16px; }
      .oc-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; flex-wrap: wrap; margin-bottom: 10px; }
      .oc-head h3 { margin: 0; }
      .oc-count { display: inline-grid; place-items: center; min-width: 22px; height: 22px; padding: 0 6px; margin-left: 6px; border-radius: 11px; background: #d97706; color: #fff; font-size: 12px; }
      .oc-tabs { display: flex; gap: 6px; }
      .oc-tabs button { padding: 6px 12px; border: 1px solid #d5dde0; border-radius: 8px; background: #fff; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
      .oc-tabs button.on { border-color: #071d49; background: #071d49; color: #fff; }
      .oc-list { display: grid; gap: 10px; }
      .oc-item { display: flex; gap: 14px; align-items: flex-start; justify-content: space-between; padding: 12px 14px; border: 1px solid #e2e8f0; border-radius: 10px; background: #fbfcfd; }
      .oc-main { min-width: 0; }
      .oc-main > b { font-size: 15px; }
      .oc-main small { display: block; color: #64748b; font-size: 12.5px; margin-top: 2px; overflow-wrap: anywhere; }
      .oc-items { margin: 8px 0 0; padding-left: 18px; font-size: 13px; color: #334155; }
      .oc-items li.more { list-style: none; margin-left: -18px; color: #64748b; }
      .oc-notes { margin: 6px 0 0; font-size: 12.5px; color: #475569; }
      .oc-acts { display: flex; flex-direction: column; gap: 6px; flex-shrink: 0; }
      .oc-btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 8px 12px; border: 1px solid #cbd5e1; border-radius: 8px; background: #fff; font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; white-space: nowrap; }
      .oc-btn.gold { border-color: #d97706; background: linear-gradient(135deg, #f59e0b, #d97706); color: #fff; }
      .oc-empty { margin: 0; color: #64748b; }
      /* Nothing waiting: one slim line instead of a whole card */
      .oc-panel.oc-slim { padding-top: 10px; padding-bottom: 10px; }
      .oc-slim .oc-head { margin: 0; }
      .oc-slim .oc-head h3 { font-size: 14px; }
      .oc-slim .oc-head h3 small { margin-left: 8px; color: #64748b; font-size: 13px; font-weight: 600; }
      .oc-slim .oc-tabs button { padding: 4px 10px; font-size: 12.5px; }
      .oc-btn.del { color: #b91c1c; }
      .oc-page .oc-box { width: 100%; box-shadow: none; border: 1px solid #e2e8f0; }
      .oc-page .oc-box-list { max-height: none; }
      .oc-pick-back { z-index: 2100; align-items: center; }
      .oc-pick { width: min(560px, 100%); }
      .oc-pick-help { margin: 16px 20px 0; color: #475569; font-size: 14px; }
      .oc-pick-choices { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; padding: 16px 20px 20px; }
      .oc-pick-choices button { display: flex; flex-direction: column; align-items: flex-start; gap: 6px; padding: 16px; border: 2px solid #e2e8f0; border-radius: 12px; background: #fff; font: inherit; text-align: left; cursor: pointer; }
      .oc-pick-choices button:hover, .oc-pick-choices button:focus-visible { border-color: #d97706; background: #fff8eb; outline: 0; }
      .oc-pick-choices button i { font-size: 22px; color: #d97706; }
      .oc-pick-choices button b { font-size: 16px; color: #071d49; }
      .oc-pick-choices button small { color: #64748b; font-size: 12.5px; line-height: 1.35; }
      .oc-pick-choices button:disabled { opacity: .6; cursor: wait; }
      @media (max-width: 480px) { .oc-pick-choices { grid-template-columns: 1fr; } }
      .oc-back { position: fixed; inset: 0; z-index: 2000; display: flex; align-items: flex-start; justify-content: center; padding: 40px 16px; overflow: auto; background: rgba(15, 23, 42, .55); }
      .oc-box { width: min(820px, 100%); overflow: hidden; border-radius: 14px; background: #fff; color: #1e293b; box-shadow: 0 20px 50px rgba(0,0,0,.3); }
      .oc-box-head { display: flex; align-items: center; gap: 12px; padding: 16px 20px; background: #1c2a4a; color: #fff; }
      .oc-box-head h3 { flex: 1; margin: 0; font-size: 17px; }
      .oc-box-head button { border: 0; background: none; color: #fff; font-size: 24px; line-height: 1; cursor: pointer; }
      .oc-box-tools { display: flex; flex-wrap: wrap; gap: 10px; padding: 14px 20px; border-bottom: 1px solid #e2e8f0; }
      .oc-box-tools input { flex: 1; min-width: 180px; padding: 9px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font: inherit; font-size: 14px; }
      .oc-box-tools select { padding: 9px 10px; border: 1px solid #cbd5e1; border-radius: 8px; font: inherit; font-size: 14px; }
      .oc-box-list { max-height: 65vh; overflow: auto; }
      .oc-h-item { padding: 12px 20px; border-bottom: 1px solid #f1f5f9; }
      .oc-h-top { display: flex; gap: 12px; align-items: flex-start; justify-content: space-between; }
      .oc-h-top .oc-acts { flex-direction: row; flex-wrap: wrap; justify-content: flex-end; }
      .oc-st { font-weight: 700; }
      .oc-st.quoted { color: #15803d; }
      .oc-st.new { color: #b45309; }
      .oc-h-table { width: 100%; margin-top: 10px; border-collapse: collapse; font-size: 13px; }
      .oc-h-table th, .oc-h-table td { padding: 5px 8px; border: 1px solid #e2e8f0; text-align: left; }
      .oc-h-table th { background: #f1f5f9; font-size: 12px; }
      .oc-h-table .c { text-align: center; white-space: nowrap; }
      .oc-h-table tr.oc-h-section td { background: #0b16e0; color: #fff; font-weight: 800; }
      .oc-h-table tr.oc-h-note td { background: #d9fbfb; color: #b91c1c; }
      @media (max-width: 600px) { .oc-h-top { flex-direction: column; } .oc-h-top .oc-acts { width: 100%; justify-content: flex-start; } }
      @media (max-width: 600px) { .oc-item { flex-direction: column; } .oc-acts { flex-direction: row; width: 100%; } .oc-btn { flex: 1; } }`;
    document.head.appendChild(st);
  }

  // The Dashboard box "Ocular surveys to quote": only HR and Owner / Head Supervisor.
  // Everyone else (Installation Supervisor, Admin / Office Staff, Manager, Developer…) uses the Ocular Records page instead.
  const seesDashboardBox = () => {
    if (typeof Roles === "undefined") return false;
    const r = Roles.me();
    return r.owner || ["hr", "human resources"].includes(r.position);
  };
  function mountDashboard(root) {
    if (!root || !seesDashboardBox()) { if (root) root.hidden = true; return; }
    styles();
    root.addEventListener("click", (e) => { if (e.target.closest("[data-oc-history]")) showHistory(); });
    // Admin / Office Staff: no quoting card, just the history
    if (!canReview()) {
      const small = () => {
        const all = read(), waiting = all.filter((s) => s.status !== "Quoted").length;
        root.hidden = false;
        root.innerHTML = `<div class="panel oc-panel"><div class="oc-head" style="margin:0">
          <h3><i class="fas fa-binoculars"></i> Ocular surveys ${waiting ? `<span class="oc-count">${waiting} waiting</span>` : ""}</h3>
          <button type="button" class="oc-btn" data-oc-history><i class="fas fa-history"></i> Ocular history (${all.length})</button></div></div>`;
      };
      addEventListener("storage", (e) => { if (e.key === KEY) small(); });
      (window.cloudReady || Promise.resolve()).then(small);
      return small();
    }
    let show = "New";
    const nice = (iso) => (iso ? new Date(iso).toLocaleDateString("en-PH", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }) : "");
    function draw() {
      const all = read();
      const waiting = all.filter((s) => s.status !== "Quoted").length;
      const list = all.filter((s) => (show === "New" ? s.status !== "Quoted" : s.status === "Quoted")).slice(0, 30);
      root.hidden = false;
      // Nothing waiting: one slim line (Quoted and History still one click away)
      if (!waiting && show === "New") {
        root.innerHTML = `
          <div class="panel oc-panel oc-slim">
            <div class="oc-head">
              <h3><i class="fas fa-binoculars"></i> Ocular surveys <small>None waiting</small></h3>
              <div class="oc-tabs">
                <button type="button" data-oc-tab="Quoted">Quoted</button>
                <button type="button" data-oc-history title="Every ocular survey, with all its items"><i class="fas fa-history"></i> History</button>
              </div>
            </div>
          </div>`;
        return;
      }
      root.innerHTML = `
        <div class="panel oc-panel">
          <div class="oc-head">
            <h3><i class="fas fa-binoculars"></i> Ocular surveys to quote ${waiting ? `<span class="oc-count">${waiting}</span>` : ""}</h3>
            <div class="oc-tabs">
              <button type="button" data-oc-tab="New" class="${show === "New" ? "on" : ""}">Waiting</button>
              <button type="button" data-oc-tab="Quoted" class="${show === "Quoted" ? "on" : ""}">Quoted</button>
              <button type="button" data-oc-history title="Every ocular survey, with all its items"><i class="fas fa-history"></i> History</button>
            </div>
          </div>
          ${list.length ? `<div class="oc-list">${list.map((s) => {
            const it = items(s);
            return `<div class="oc-item">
              <div class="oc-main">
                <b>${esc(s.client || "(no client name)")}</b>
                <small>${esc([s.address, s.contact].filter(Boolean).join(" · "))}</small>
                <small>Surveyed${s.date ? " " + esc(s.date) : ""} by <b>${esc(s.byName || s.by || "?")}</b> · sent ${esc(nice(s.submitted))}${s.status === "Quoted" ? ` · quoted by ${esc(s.quotedBy || "?")}${s.quotedIn ? " in " + esc(s.quotedIn) : ""}` : ""}</small>
                <ul class="oc-items">${it.slice(0, 6).map((r) => `<li>${esc(r.q || "1")} ${esc(r.u || "")} · ${esc(r.d)}</li>`).join("")}${it.length > 6 ? `<li class="more">+${it.length - 6} more</li>` : ""}</ul>
                ${s.notes ? `<p class="oc-notes"><i class="fas fa-sticky-note"></i> ${esc(s.notes)}</p>` : ""}
              </div>
              <div class="oc-acts">
                <button type="button" class="oc-btn gold" data-oc-quote="${s.id}"><i class="fas fa-file-signature"></i> ${s.status === "Quoted" ? "Quote again" : "Make quotation"}</button>
                ${s.status !== "Quoted" ? `<button type="button" class="oc-btn" data-oc-done="${s.id}" title="Already handled: move it to Quoted">Mark done</button>` : ""}
              </div>
            </div>`;
          }).join("")}</div>` : `<p class="oc-empty">${show === "New" ? "No ocular surveys waiting. Installers send them from Ocular Survey." : "Nothing quoted yet."}</p>`}
        </div>`;
    }
    root.addEventListener("click", (e) => {
      const tab = e.target.closest("[data-oc-tab]");
      if (tab) { show = tab.dataset.ocTab; return draw(); }
      const q = e.target.closest("[data-oc-quote]");
      if (q) return toQuotation(+q.dataset.ocQuote);
      const d = e.target.closest("[data-oc-done]");
      if (d) {
        const list = read(), s = list.find((x) => x.id === +d.dataset.ocDone);
        if (s && confirm(`Mark the survey for ${s.client || "this client"} as done (already quoted)?`)) {
          Object.assign(s, { status: "Quoted", quotedBy: who(), quotedAt: new Date().toISOString() });
          write(list);
          draw();
        }
      }
    });
    addEventListener("storage", (e) => { if (e.key === KEY) draw(); });
    (window.cloudReady || Promise.resolve()).then(draw);
    draw();
  }

  return { KEY, read, submit, toQuotation, canReview, canHistory, showHistory, mountDashboard, items };
})();
