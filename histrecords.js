// RECORDS PAGES for the quotation history kept by history.js:
//   Warranty Records (warranty-records.html) → "aircon_hist_quotation" (Warranty quotations)
//   Formal Records   (formal-records.html)   → "aircon_hist_formal"    (Formal Quotations)
// A table of every record: the quotation's date, client, what's on it, total, when it was saved and by whom,
// and what happened to it (Saved / Printed / Signed copy). Search, a date filter (daterange.js) and
// Open, which opens the record on its own page (history.js picks it up from "aircon_hist_open").
//
//   HistRecords.mount(element, { key: "aircon_hist_formal", page: "formalquotation.html", what: "formal quotation" });
const HistRecords = (function () {
  const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const money = (n) => "₱" + Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pad = (n) => String(n).padStart(2, "0");
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const EVENTS = { print: "Printed", signed: "Signed copy", saved: "Saved" };

  function styles() {
    if (document.getElementById("hrStyle")) return;
    const s = document.createElement("style");
    s.id = "hrStyle";
    s.textContent = `
      .hr-tools { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; margin-bottom: 14px; }
      .hr-tools .inv-search { flex: 1; min-width: 220px; }
      .hr-range { display: inline-flex; align-items: center; gap: 10px; min-width: 230px; height: 42px; padding: 0 12px; border: 1px solid var(--line, #d9e1e5);
        border-radius: 10px; background: #fff; color: #071d49; font: inherit; font-weight: 700; text-align: left; cursor: pointer; }
      .hr-range i:first-child { color: #0a66c2; }
      .hr-range span { flex: 1; display: flex; flex-direction: column; line-height: 1.15; }
      .hr-range small { color: #65737e; font-size: 11.5px; font-weight: 600; }
      .hr-count { color: #64748b; font-size: 13.5px; }
      .hr-table td { vertical-align: top; }
      .hr-date b { display: block; color: #071d49; white-space: nowrap; }
      .hr-date small, .hr-client small, .hr-saved small { display: block; color: #64748b; font-size: 12px; margin-top: 2px; }
      .hr-client b { display: block; }
      .hr-total { text-align: right; font-weight: 800; white-space: nowrap; }
      .hr-tag { display: inline-block; margin: 2px 4px 0 0; padding: 1px 8px; border-radius: 99px; background: #eef3f4; color: #334155; font-size: 11.5px; font-weight: 700; }
      .hr-tag.signed { background: #e5f6ea; color: #15803d; } .hr-tag.print { background: #e8efff; color: #1d4ed8; }
      .hr-acts { white-space: nowrap; text-align: right; }
      .hr-acts button { margin-left: 4px; }
      .hr-empty { padding: 30px; text-align: center; color: #64748b; }
      @media (max-width: 700px) { .hr-table thead { display: none; } .hr-table tr { display: grid; grid-template-columns: 1fr auto; gap: 4px 10px; padding: 10px 0; }
        .hr-table td { border: 0; padding: 2px 10px; } .hr-acts { grid-column: 1 / -1; text-align: left; } }`;
    document.head.appendChild(s);
  }

  function mount(root, opts) {
    styles();
    const read = () => { try { return JSON.parse(localStorage.getItem(opts.key) || "[]") || []; } catch (e) { return []; } };
    const write = (list) => { localStorage.setItem(opts.key, JSON.stringify(list)); if (window.cloudSaveNow) window.cloudSaveNow(opts.key); };
    const canDelete = typeof Roles !== "undefined" && (Roles.me().dev || Roles.me().owner || Roles.me().hr);
    let from = "", to = "", preset = "All dates";
    const savedDay = (r) => ymd(new Date(r.updated || r.created || 0));

    root.innerHTML = `
      <div class="hr-tools">
        <div class="inv-search"><i class="fas fa-search"></i><input type="search" data-q placeholder="Search client, item, date or who saved it"></div>
        <button type="button" class="hr-range" data-range title="Show the records saved on these dates">
          <i class="far fa-calendar-alt"></i><span><small data-preset>All dates</small><b data-label>Every record</b></span><i class="fas fa-caret-down"></i>
        </button>
        <span class="hr-count" data-count></span>
      </div>
      <div class="inv-table-wrap">
        <table class="inv-table hr-table">
          <thead><tr><th>Date</th><th>Client</th><th style="text-align:right">Total</th><th>Saved</th><th></th></tr></thead>
          <tbody data-body></tbody>
        </table>
      </div>`;
    const q = root.querySelector("[data-q]"), body = root.querySelector("[data-body]");

    function draw() {
      const term = q.value.trim().toLowerCase();
      const list = read()
        .filter((r) => (!from || savedDay(r) >= from) && (!to || savedDay(r) <= to))
        .filter((r) => !term || [r.client, r.date, r.sub, r.createdBy, r.updatedBy, JSON.stringify(r.data)].join(" ").toLowerCase().includes(term))
        .sort((a, b) => String(b.updated || b.created).localeCompare(String(a.updated || a.created)));
      root.querySelector("[data-count]").textContent = `${list.length} record${list.length === 1 ? "" : "s"}`;
      body.innerHTML = list.length ? list.map((r) => {
        const saved = new Date(r.updated || r.created);
        const tags = (r.events || []).map((e) => `<span class="hr-tag ${esc(e)}">${esc(EVENTS[e] || e)}</span>`).join("");
        return `<tr>
          <td class="hr-date"><b>${esc(r.date || saved.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }))}</b>${r.date ? "" : "<small>(no date on the sheet)</small>"}</td>
          <td class="hr-client"><b>${esc(r.client || "(no client name)")}</b>${r.sub ? `<small>${esc(r.sub)}</small>` : ""}${tags ? `<div>${tags}</div>` : ""}</td>
          <td class="hr-total">${r.total != null ? money(r.total) : "—"}</td>
          <td class="hr-saved">${esc(saved.toLocaleDateString("en-PH", { month: "short", day: "numeric", year: "numeric" }))}
            <small>${esc(saved.toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" }))}${r.updatedBy || r.createdBy ? " · " + esc(r.updatedBy || r.createdBy) : ""}</small></td>
          <td class="hr-acts">
            <button type="button" class="inv-btn light" data-open="${esc(r.id)}"><i class="fas fa-folder-open"></i> Open</button>
            ${canDelete ? `<button type="button" class="inv-btn light" data-del="${esc(r.id)}" title="Remove from the records" style="color:#b91c1c"><i class="fas fa-trash"></i></button>` : ""}
          </td></tr>`;
      }).join("") : `<tr><td colspan="5" class="hr-empty">${term || from ? "No records match your search or dates." : `No ${esc(opts.what)}s saved yet.`}</td></tr>`;
    }

    q.addEventListener("input", draw);
    root.addEventListener("click", (e) => {
      const rg = e.target.closest("[data-range]");
      if (rg && typeof DateRange !== "undefined") {
        const all = read().map(savedDay).sort();
        const t = ymd(new Date());
        DateRange.open({ anchor: rg, from: from || all[0] || t, to: to || t, preset, min: all[0] || "",
          onApply: (r) => {
            preset = r.preset;
            const isAll = r.preset === "All dates";
            from = isAll ? "" : r.from; to = isAll ? "" : r.to;
            const nice = (s) => new Date(s + "T00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
            root.querySelector("[data-preset]").textContent = isAll ? "All dates" : r.preset === "Custom" ? "Dates" : r.preset;
            root.querySelector("[data-label]").textContent = isAll ? "Every record" : r.from === r.to ? nice(r.from) : `${nice(r.from)} – ${nice(r.to)}`;
            draw();
          } });
        return;
      }
      const o = e.target.closest("[data-open]");
      if (o) {
        sessionStorage.setItem("aircon_hist_open", JSON.stringify({ key: opts.key, id: o.dataset.open }));
        location.href = opts.page;
        return;
      }
      const d = e.target.closest("[data-del]");
      if (d && canDelete) {
        const list = read(), r = list.find((x) => String(x.id) === d.dataset.del);
        if (!r || !confirm(`Remove the ${opts.what} for ${r.client || "this client"} from the records?`)) return;
        write(list.filter((x) => x !== r));
        draw();
      }
    });
    addEventListener("storage", (e) => { if (e.key === opts.key) draw(); });
    (window.cloudReady || Promise.resolve()).then(draw);
    draw();
  }

  return { mount };
})();
