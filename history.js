// HISTORY RECORDS for the Warranty quotation, the Formal Quotation and the Agreement (Survey) page.
//
// Each page calls FormHistory.attach({...}) once. That adds a "History" button to the page's toolbar:
// it lists every quotation / agreement made before, newest first, with search, and opens one back
// onto the sheet. A record is kept (or updated) automatically when the sheet is printed or its
// signed copy is saved, and with the "Save to history" button in the History window.
// Signatures are NOT kept in the history (only the typed details).
//
// The lists are saved in this browser and copied to the online database by cloud.js
// (keys aircon_hist_quotation, aircon_hist_formal, aircon_hist_agreement), so every PC sees them.
(function () {
  const MAX = 500;   // records kept per page (oldest go first)
  const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const money = (n) => "₱" + Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const who = () => sessionStorage.getItem("aircon_name") || sessionStorage.getItem("aircon_user") || "";

  // One window shared by every page that uses it
  function styles() {
    if (document.getElementById("fhStyle")) return;
    const s = document.createElement("style");
    s.id = "fhStyle";
    s.textContent = `
      .fh-back { position: fixed; inset: 0; z-index: 2000; background: rgba(15, 23, 42, 0.55); display: flex; align-items: flex-start; justify-content: center; padding: 40px 16px; overflow: auto; }
      .fh-box { width: min(760px, 100%); background: #fff; color: #1e293b; border-radius: 14px; box-shadow: 0 20px 50px rgba(0,0,0,0.3); overflow: hidden; font-family: inherit; }
      .fh-head { display: flex; align-items: center; gap: 12px; padding: 16px 20px; background: #1c2a4a; color: #fff; }
      .fh-head h3 { margin: 0; font-size: 17px; flex: 1; }
      .fh-head button { background: none; border: 0; color: #fff; font-size: 24px; line-height: 1; cursor: pointer; }
      .fh-tools { display: flex; gap: 10px; padding: 14px 20px; border-bottom: 1px solid #e2e8f0; flex-wrap: wrap; }
      .fh-tools input { flex: 1; min-width: 180px; padding: 9px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font: inherit; font-size: 14px; }
      .fh-btn { display: inline-flex; align-items: center; gap: 6px; padding: 8px 14px; border: 1px solid #cbd5e1; border-radius: 8px; background: #fff; color: #1e293b; font: inherit; font-size: 13px; font-weight: 600; cursor: pointer; }
      .fh-btn:hover { background: #f1f5f9; }
      .fh-btn.gold { border-color: #d97706; background: linear-gradient(135deg, #f59e0b, #d97706); color: #fff; }
      .fh-btn.del { color: #b91c1c; }
      .fh-list { max-height: 60vh; overflow: auto; }
      .fh-item { display: flex; align-items: center; gap: 12px; padding: 12px 20px; border-bottom: 1px solid #f1f5f9; }
      .fh-item.on { background: #fff8e1; }
      .fh-main { flex: 1; min-width: 0; }
      .fh-main b { display: block; font-size: 15px; overflow-wrap: anywhere; }
      .fh-main small { display: block; color: #64748b; font-size: 12px; margin-top: 2px; overflow-wrap: anywhere; }
      .fh-total { font-weight: 700; white-space: nowrap; }
      .fh-acts { display: flex; gap: 6px; }
      .fh-empty { padding: 30px 20px; text-align: center; color: #64748b; }
      .fh-toast { position: fixed; left: 50%; bottom: 24px; transform: translateX(-50%); z-index: 2100; background: #1c2a4a; color: #fff; padding: 10px 18px; border-radius: 10px; font-size: 14px; box-shadow: 0 8px 24px rgba(0,0,0,0.25); }
      @media (max-width: 560px) { .fh-item { flex-wrap: wrap; } .fh-acts { width: 100%; justify-content: flex-end; } }
      @media print { .fh-back, .fh-toast { display: none !important; } }`;
    document.head.appendChild(s);
  }

  function toast(text) {
    const t = document.createElement("div");
    t.className = "fh-toast";
    t.textContent = text;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2600);
  }

  // opts: { key, title, button (element to add the History button after, or the toolbar),
  //         get() → data, set(data), summary(data) → { client, date, total, sub }, empty(data) → true/false }
  function attach(opts) {
    styles();
    const read = () => { try { return JSON.parse(localStorage.getItem(opts.key) || "[]") || []; } catch (e) { return []; } };
    const write = (list) => {
      localStorage.setItem(opts.key, JSON.stringify(list.slice(0, MAX)));
      if (window.cloudSaveNow) window.cloudSaveNow(opts.key);
    };
    let current = null;   // id of the record on the sheet now (so saving again updates it, not a copy)

    // Keep the sheet in the history. Returns the record, or null when the sheet is blank.
    function record(how) {
      const data = opts.get();
      if (opts.empty(data)) return null;
      const s = opts.summary(data) || {};
      const list = read();
      const at = new Date().toISOString();
      let r = current && list.find((x) => x.id === current);
      // A different client on the sheet now (e.g. a job order was brought in): that's a new record
      const norm = (t) => String(t || "").trim().toLowerCase();
      if (r && norm(r.client) && norm(s.client) && norm(r.client) !== norm(s.client)) r = null;
      if (r) {
        Object.assign(r, { data, client: s.client || "", date: s.date || "", total: s.total ?? null, sub: s.sub || "", updated: at, updatedBy: who() });
        if (how && !(r.events || []).includes(how)) r.events = [...(r.events || []), how];
        list.splice(list.indexOf(r), 1);
      } else {
        r = { id: Date.now() + "-" + Math.random().toString(36).slice(2, 6), data, client: s.client || "", date: s.date || "",
          total: s.total ?? null, sub: s.sub || "", created: at, createdBy: who(), updated: at, updatedBy: who(), events: how ? [how] : [] };
        current = r.id;
      }
      list.unshift(r);
      write(list);
      return r;
    }

    // show("Juan") opens the window already searching for that client
    function show(search) {
      const back = document.createElement("div");
      back.className = "fh-back";
      back.innerHTML = `
        <div class="fh-box" role="dialog" aria-label="${esc(opts.title)} history">
          <div class="fh-head"><i class="fas fa-history"></i><h3>${esc(opts.title)} · History</h3><button type="button" data-x aria-label="Close">&times;</button></div>
          <div class="fh-tools">
            <input type="search" placeholder="Search client, date, item…" data-q>
            <button type="button" class="fh-btn gold" data-save><i class="fas fa-save"></i> Save this sheet to history</button>
          </div>
          <div class="fh-list" data-list></div>
        </div>`;
      document.body.appendChild(back);
      const q = back.querySelector("[data-q]");
      if (typeof search === "string") q.value = search;
      const draw = () => {
        const term = q.value.trim().toLowerCase();
        const list = read().filter((r) => !term || [r.client, r.date, r.sub, r.createdBy, JSON.stringify(r.data)].join(" ").toLowerCase().includes(term));
        back.querySelector("[data-list]").innerHTML = list.length ? list.map((r) => {
          const when = new Date(r.updated || r.created).toLocaleString("en-PH", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
          const tags = (r.events || []).map((e) => ({ print: "Printed", signed: "Signed copy saved", saved: "Saved" }[e] || e)).join(" · ");
          return `<div class="fh-item${r.id === current ? " on" : ""}">
            <div class="fh-main"><b>${esc(r.client || "(no client name)")}</b>
              <small>${esc([r.date && "Date: " + r.date, r.sub].filter(Boolean).join(" · "))}</small>
              <small>Saved ${esc(when)}${r.updatedBy ? " by " + esc(r.updatedBy) : ""}${tags ? " · " + esc(tags) : ""}</small></div>
            ${r.total != null ? `<span class="fh-total">${money(r.total)}</span>` : ""}
            <div class="fh-acts">
              <button type="button" class="fh-btn" data-open="${esc(r.id)}"><i class="fas fa-folder-open"></i> Open</button>
              <button type="button" class="fh-btn del" data-del="${esc(r.id)}" title="Remove from history"><i class="fas fa-trash"></i></button>
            </div></div>`;
        }).join("") : `<div class="fh-empty">${term ? "Nothing matches your search." : "No records yet. Printing, saving a signed copy or “Save this sheet to history” adds one."}</div>`;
      };
      draw();
      q.addEventListener("input", draw);
      const close = () => { back.remove(); document.removeEventListener("keydown", onKey); };
      const onKey = (e) => { if (e.key === "Escape") close(); };
      document.addEventListener("keydown", onKey);
      back.addEventListener("click", (e) => {
        if (e.target === back || e.target.closest("[data-x]")) return close();
        if (e.target.closest("[data-save]")) {
          const r = record("saved");
          if (!r) return alert("The sheet is empty, so there's nothing to save.");
          toast("Saved to history: " + (r.client || "no client name"));
          return draw();
        }
        const open = e.target.closest("[data-open]");
        if (open) {
          const r = read().find((x) => x.id === open.dataset.open);
          if (!r) return;
          const now = opts.get();
          if (!opts.empty(now) && current !== r.id && !confirm(`Open ${r.client || "this record"}? The sheet on screen will be replaced.\n\n(Tip: “Save this sheet to history” first if you want to keep it.)`)) return;
          opts.set(JSON.parse(JSON.stringify(r.data)));
          current = r.id;
          close();
          toast("Opened: " + (r.client || "record"));
          return;
        }
        const del = e.target.closest("[data-del]");
        if (del) {
          const list = read();
          const r = list.find((x) => x.id === del.dataset.del);
          if (!r || !confirm(`Remove ${r.client || "this record"} from the history?`)) return;
          write(list.filter((x) => x !== r));
          if (current === r.id) current = null;
          draw();
        }
      });
      setTimeout(() => q.focus(), 0);
    }

    // The History button, after the given button / at the end of the toolbar
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "q-btn";
    btn.id = "historyBtn";
    btn.innerHTML = '<i class="fas fa-history"></i> History';
    btn.onclick = () => show();
    if (opts.button) opts.button.after(btn);

    // Printing keeps the sheet in the history
    window.addEventListener("beforeprint", () => record("print"));

    // "Open" on the Warranty Records / Formal Records page (histrecords.js): put that record on the sheet.
    // Done after the page has finished loading (and the online data is in), so nothing on the page overwrites it.
    let pending = null;
    try { pending = JSON.parse(sessionStorage.getItem("aircon_hist_open") || "null"); } catch (e) {}
    if (pending && pending.key === opts.key) {
      sessionStorage.removeItem("aircon_hist_open");
      const openIt = () => {
        const r = read().find((x) => String(x.id) === String(pending.id));
        if (!r) return toast("That record wasn't found. It may have been removed.");
        opts.set(JSON.parse(JSON.stringify(r.data)));
        current = r.id;   // saving again updates this record, not a copy
        toast("Opened: " + (r.client || "record"));
      };
      (window.cloudReady || Promise.resolve()).then(() => setTimeout(openIt, 0));
    }

    return {
      record,                          // record("signed") after a signed copy is saved
      reset: () => { current = null; },   // "New": the next save is a new record
      show,
    };
  }

  window.FormHistory = { attach };
})();
