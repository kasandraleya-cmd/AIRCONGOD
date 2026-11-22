// IMPORT FROM EXCEL (Expenses page, cashvoucher.html)
//
// Brings expenses typed in an Excel sheet into the website, as normal expense records:
//   1. Pick the file (.xlsx / .xls / .csv) and the sheet.
//   2. Each column is matched to an Expenses field by its heading (DATE, SUPPLIER NAME, ACCOUNT TITLE,
//      AMOUNT, …); any match can be changed.
//   3. Account titles that aren't on the website's list are matched to the closest one (check them).
//   4. Tick the months to bring in. Rows already on the website (same date, supplier and amount) are skipped.
//   5. Preview, then Import. Each record gets the next Expense # and is saved online like a typed one.
//
// Rows with the same Expense # in the sheet become ONE record with several account lines. Without an
// Expense # column, rows with the same date, supplier and reference (when there is one) are grouped.
(function () {
  const btn = document.getElementById("importBtn");
  if (!btn || !window.CV) return;
  const CV = window.CV;
  const esc = CV.esc, money = CV.money, r2 = CV.r2;
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const pad = (n) => String(n).padStart(2, "0");

  // ---------- Fields and the headings that mean them ----------
  const FIELDS = [
    ["no", "Expense # (groups lines)", ["expense #", "expense no", "cv #", "cv no", "cv#", "voucher", "voucher no", "expense number"]],
    ["date", "Date *", ["date", "transaction date", "date paid"]],
    ["supplier", "Supplier name *", ["supplier name", "supplier", "payee", "paid to", "vendor", "store", "name"]],
    ["account", "Account title *", ["account title", "account", "category", "expense type", "type of expense", "chart of account"]],
    ["amount", "Amount *", ["amount", "total amount", "gross amount", "total", "cost", "price"]],
    ["particulars", "Particulars", ["particulars", "description", "details", "remarks", "purpose", "memo", "notes", "item", "items"]],
    ["reference", "Reference (OR / SI / DR)", ["reference", "ref", "ref no", "or no", "or #", "si no", "receipt", "invoice", "or", "si", "dr"]],
    ["address", "Address", ["address", "supplier address"]],
    ["tin", "TIN#", ["tin#", "tin", "tin no"]],
    ["vat", "VAT / Non-VAT", ["vat / non-vat", "vat/non-vat", "vat or non-vat", "vatable", "vat type", "vat"]],
    ["expense", "Expense amount (net of VAT)", ["expense amount", "net amount", "net of vat"]],
    ["inputVat", "Input VAT", ["input vat", "vat amount"]],
    ["atc", "ATC code", ["atc code", "atc", "ewt code"]],
    ["wt", "Amount withheld", ["amount withheld", "withheld", "ewt amount", "withholding tax", "ewt"]],
    ["receiver", "Receiver's name", ["receiver's name", "receivers name", "receiver", "received by"]],
    ["mop", "Mode of payment", ["mode of payment", "payment mode", "mop", "paid via", "payment"]],
  ];
  const norm = (t) => String(t ?? "").toLowerCase().replace(/[’']/g, "'").replace(/\s+/g, " ").trim();

  // Best column for each field: exact heading first, then a heading that starts with / contains it
  function guessColumns(headers) {
    const h = headers.map(norm), used = new Set(), out = {};
    const bad = { amount: /expense|withheld|vat|ewt/, supplier: /address|tin/, date: /month|hired/ };
    [3, 2, 1].forEach((level) => FIELDS.forEach(([key, , syn]) => {
      if (out[key] != null) return;
      const i = h.findIndex((x, i) => !used.has(i) && x && !(bad[key] && bad[key].test(x)) && syn.some((s) =>
        level === 3 ? x === s : level === 2 ? x.startsWith(s + " ") || x.startsWith(s + "#") : s.length > 3 && x.includes(s)));
      if (i >= 0) { out[key] = i; used.add(i); }
    }));
    return out;
  }

  // ---------- Reading values ----------
  const amountOf = (v) => {
    if (typeof v === "number") return isFinite(v) ? Math.abs(v) : 0;
    const t = String(v ?? "").replace(/[₱P,\s]/gi, "").replace(/^\((.*)\)$/, "$1");
    const n = parseFloat(t);
    return isFinite(n) ? Math.abs(n) : 0;
  };
  // → "mm/dd/yyyy" or "" (Excel dates, 2026-11-03, 11/03/2026, Nov 3 2026, 3-Nov-26 …)
  function dateOf(v) {
    if (v == null || v === "") return "";
    if (v instanceof Date && !isNaN(v)) return `${pad(v.getMonth() + 1)}/${pad(v.getDate())}/${v.getFullYear()}`;
    if (typeof v === "number" && v > 20000 && v < 80000) {   // Excel serial date
      const d = new Date(Math.round((v - 25569) * 864e5));
      return `${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())}/${d.getUTCFullYear()}`;
    }
    const t = String(v).trim();
    let m = t.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (m) return `${pad(m[2])}/${pad(m[3])}/${m[1]}`;
    m = t.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/);   // month/day/year (Philippine Excel default)
    if (m) { const y = m[3].length === 2 ? "20" + m[3] : m[3]; return +m[1] <= 12 ? `${pad(m[1])}/${pad(m[2])}/${y}` : `${pad(m[2])}/${pad(m[1])}/${y}`; }
    const d = new Date(t.replace(/(\d)(st|nd|rd|th)\b/, "$1"));
    if (!isNaN(d) && d.getFullYear() > 2000) return `${pad(d.getMonth() + 1)}/${pad(d.getDate())}/${d.getFullYear()}`;
    return "";
  }
  const monthKey = (date) => { const m = date.match(/^(\d{2})\/\d{2}\/(\d{4})$/); return m ? m[2] + "-" + m[1] : ""; };
  const monthName = (key) => { const [y, m] = key.split("-"); return MONTHS[+m - 1] + " " + y; };

  // Account title in the sheet → one on the website's list (exact, then by shared words, then a few common names)
  const COMMON = [
    [/fuel|gas(?!ket)|diesel|gasoline|petrol/, "Fuel, Gas & Oil Expense"], [/toll|fare|grab|taxi|parking|transpo|travel/, "Travel & Transportation Expense"],
    [/meal|food|snack|lunch|dinner|merienda/, "Meals & Representation"], [/load|internet|phone|globe|smart|pldt|converge|communication/, "Communications Expense"],
    [/electric|meralco|water|maynilad|utilit/, "Utilities Expense"], [/rent/, "Rent Expense"], [/salary|salaries|wage|payroll/, "Salaries & Wages"],
    [/sss|philhealth|pag-?ibig|hdmf|contribution/, "SSS / PhilHealth / Pag-IBIG Contributions"], [/repair|maint/, "Repair & Maintenance"],
    [/ads|advert|marketing|boost|promo/, "Advertising & Marketing Expense"], [/office|supplies|packag/, "Office & Packaging Supplies Expense"],
    [/tool|equipment/, "Tools & Small Equipment"], [/tax|permit|license|bir/, "Taxes & Licenses"], [/bank charge|service fee|transfer fee/, "Bank Charges"],
    [/freight|shipping|delivery|lbc|courier/, "Freight-In"], [/commission/, "Commission Expense"], [/professional|lawyer|accountant fee|notary/, "Professional Fees"],
    [/material|pipe|copper|wire|bracket|insulation|tape|freon/, "Inventory - Materials"], [/\bunit\b|aircon|inverter/, "Inventory - Unit"],
    [/advance.*(employee|staff)|cash advance|\bca\b/, "Advances to Employees"],
  ];
  function guessAccount(t) {
    const n = norm(t);
    if (!n) return "";
    const exact = CV.ACCOUNTS.find((a) => norm(a) === n);
    if (exact) return exact;
    const common = COMMON.find(([re]) => re.test(n));   // everyday words first: gas, toll, load, food…
    if (common) return common[1];
    const words = n.split(/[^a-z0-9]+/).filter((w) => w.length > 2 && !["expense", "expenses", "and"].includes(w));
    let best = "", score = 0;
    CV.ACCOUNTS.forEach((a) => {
      const aw = norm(a).split(/[^a-z0-9]+/);
      const s = words.filter((w) => aw.some((x) => x.startsWith(w) || w.startsWith(x) && x.length > 3)).length;
      if (s > score) { score = s; best = a; }
    });
    return best;
  }
  const isVat = (v) => /^(vat|vatable|yes|y|true|1|with vat|vat inc)/i.test(String(v ?? "").trim()) && !/non/i.test(String(v));

  // ---------- The pop-up ----------
  let XLSX_READY = null;
  const loadXlsx = () => XLSX_READY || (XLSX_READY = new Promise((ok, fail) => {
    if (window.XLSX) return ok();
    const s = document.createElement("script");
    s.src = "https://cdnjs.cloudflare.com/ajax/libs/xlsx/0.18.5/xlsx.full.min.js";
    s.onload = () => ok(); s.onerror = () => { XLSX_READY = null; fail(new Error("Couldn't load the Excel reader. Check the internet.")); };
    document.head.appendChild(s);
  }));

  const box = document.createElement("div");
  box.className = "cv-modal cvi";
  box.hidden = true;
  box.innerHTML = `
    <div class="cv-modal-box cvi-box" role="dialog" aria-modal="true" aria-label="Import expenses from Excel">
      <div class="cvi-h">
        <h2><i class="fas fa-file-excel"></i> Import expenses from Excel</h2>
        <button type="button" class="cv-db-x" data-x title="Close">&times;</button>
      </div>
      <div class="cvi-body" id="cviBody"></div>
      <div class="cvi-foot" id="cviFoot"></div>
    </div>`;
  document.body.appendChild(box);
  const body = box.querySelector("#cviBody"), foot = box.querySelector("#cviFoot");
  const close = () => { box.hidden = true; };
  box.querySelector("[data-x]").onclick = close;
  box.addEventListener("click", (e) => { if (e.target === box) close(); });

  let wb = null, sheetName = "", grid = [], headerRow = 0, cols = {}, acctMap = {}, monthsOn = null, fileName = "";

  btn.onclick = () => { box.hidden = false; stepFile(); };

  // Step 1: choose the file
  function stepFile(msg) {
    wb = null;
    body.innerHTML = `
      <div class="cvi-drop">
        <i class="fas fa-file-excel"></i>
        <b>Choose your expenses Excel file</b>
        <span>.xlsx, .xls or .csv · one row per expense (or per account line)</span>
        <label class="inv-btn navy"><i class="fas fa-folder-open"></i> Choose file<input type="file" id="cviFile" accept=".xlsx,.xls,.xlsm,.csv" hidden></label>
        ${msg ? `<p class="cvi-err">${esc(msg)}</p>` : ""}
      </div>
      <p class="cvi-tip"><i class="fas fa-lightbulb"></i> Best: a sheet with headings like <b>DATE</b>, <b>SUPPLIER NAME</b>, <b>ACCOUNT TITLE</b>, <b>AMOUNT</b>
        (and if you have them: PARTICULARS, REFERENCE, VAT / Non-VAT, MODE OF PAYMENT). You can match the columns on the next step.</p>`;
    foot.innerHTML = `<button type="button" class="inv-btn light" data-cancel>Cancel</button>`;
    foot.querySelector("[data-cancel]").onclick = close;
    body.querySelector("#cviFile").onchange = async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      fileName = f.name;
      body.querySelector(".cvi-drop b").textContent = "Reading " + f.name + "…";
      try {
        await loadXlsx();
        const buf = await f.arrayBuffer();
        wb = XLSX.read(buf, { type: "array", cellDates: true });
        const best = wb.SheetNames.map((n) => [n, sheetGrid(n)]).sort((a, b) => b[1].score - a[1].score)[0];
        pickSheet(best ? best[0] : wb.SheetNames[0]);
      } catch (err) { stepFile(err.message || "Couldn't read that file."); }
    };
  }

  // A sheet as rows of cells, with the heading row found (the first row with 2+ known headings)
  function sheetGrid(name) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, raw: true, defval: "", blankrows: false });
    let hr = 0, score = -1;
    rows.slice(0, 20).forEach((r, i) => { const s = Object.keys(guessColumns(r)).length; if (s > score) { score = s; hr = i; } });
    return { rows, hr, score };
  }
  function pickSheet(name) {
    sheetName = name;
    const g = sheetGrid(name);
    grid = g.rows; headerRow = g.hr;
    cols = guessColumns(grid[headerRow] || []);
    acctMap = {}; monthsOn = null;
    stepMap();
  }

  // Step 2: columns + account titles + months, with the preview
  function stepMap() {
    const headers = (grid[headerRow] || []).map((h, i) => String(h || "").trim() || `Column ${String.fromCharCode(65 + (i % 26))}`);
    const opt = (key) => `<select data-col="${key}"><option value="">— not in my sheet —</option>${headers.map((h, i) => `<option value="${i}"${cols[key] === i ? " selected" : ""}>${esc(h)}</option>`).join("")}</select>`;
    // Account titles from the sheet that aren't exactly on the website's list: guess them first, then build
    const odd = [...new Set(build().rawAccounts)].filter((a) => !CV.ACCOUNTS.some((x) => norm(x) === norm(a)));
    odd.forEach((a) => { if (acctMap[a] === undefined) acctMap[a] = guessAccount(a); });
    const res = build();
    const months = [...new Set(res.records.map((r) => monthKey(r.date)).filter(Boolean))].sort().reverse();
    if (!monthsOn) {
      // Default: last month and this month (if the sheet has them), otherwise everything
      const now = new Date(), thisM = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
      const lastD = new Date(now.getFullYear(), now.getMonth() - 1, 1), lastM = `${lastD.getFullYear()}-${pad(lastD.getMonth() + 1)}`;
      const recent = months.filter((m) => m === thisM || m === lastM);
      monthsOn = new Set(recent.length ? recent : months);
    }
    const chosen = res.records.filter((r) => monthsOn.has(monthKey(r.date)));
    const fresh = chosen.filter((r) => !r.dupe);
    const total = fresh.reduce((s, r) => s + r.total, 0);
    const missingReq = ["date", "supplier", "account", "amount"].filter((k) => cols[k] == null);

    body.innerHTML = `
      <div class="cvi-file"><i class="fas fa-file-excel"></i> <b>${esc(fileName)}</b>
        ${wb.SheetNames.length > 1 ? `<label>Sheet <select id="cviSheet">${wb.SheetNames.map((n) => `<option${n === sheetName ? " selected" : ""}>${esc(n)}</option>`).join("")}</select></label>` : ""}
        <label>Headings on row <input type="number" id="cviHr" min="1" max="50" value="${headerRow + 1}"></label>
        <button type="button" class="inv-btn light" id="cviOther"><i class="fas fa-redo"></i> Other file</button>
      </div>

      <h3 class="cvi-sec">1 · Match your columns</h3>
      <div class="cvi-cols">${FIELDS.filter(([k, label]) => cols[k] != null || /\*/.test(label)).map(([k, label]) => `<label class="${cols[k] == null ? "need" : ""}"><span>${esc(label)}</span>${opt(k)}</label>`).join("")}</div>
      ${FIELDS.some(([k, label]) => cols[k] == null && !/\*/.test(label)) ? `<details class="cvi-more"><summary>More columns (not found in your sheet)</summary>
        <div class="cvi-cols">${FIELDS.filter(([k, label]) => cols[k] == null && !/\*/.test(label)).map(([k, label]) => `<label><span>${esc(label)}</span>${opt(k)}</label>`).join("")}</div></details>` : ""}
      ${missingReq.length ? `<p class="cvi-err"><i class="fas fa-exclamation-circle"></i> Pick the column for: ${missingReq.map((k) => esc(FIELDS.find((f) => f[0] === k)[1].replace(" *", ""))).join(", ")}.</p>` : ""}

      ${odd.length && cols.account != null ? `
        <h3 class="cvi-sec">2 · Account titles <small>your sheet → the website's list (check the guesses)</small></h3>
        <div class="cvi-acct">${odd.map((a) => `<label class="${acctMap[a] ? "" : "need"}"><span title="${esc(a)}">${esc(a || "(blank)")}</span><i class="fas fa-arrow-right"></i>
          <select data-acct="${esc(a)}"><option value="">— choose —</option>${CV.ACCOUNTS.map((x) => `<option${x === acctMap[a] ? " selected" : ""}>${esc(x)}</option>`).join("")}</select></label>`).join("")}</div>` : ""}

      ${months.length ? `
        <h3 class="cvi-sec">${odd.length && cols.account != null ? 3 : 2} · Months to import</h3>
        <div class="cvi-months">${months.map((m) => {
          const n = res.records.filter((r) => monthKey(r.date) === m);
          return `<label><input type="checkbox" data-month="${m}"${monthsOn.has(m) ? " checked" : ""}> <b>${monthName(m)}</b> <small>${n.length} record${n.length === 1 ? "" : "s"} · ₱${money(n.reduce((s, r) => s + r.total, 0))}</small></label>`;
        }).join("")}</div>` : ""}

      <h3 class="cvi-sec">Preview <small>${fresh.length} to import · ₱${money(total)}${chosen.length - fresh.length ? ` · ${chosen.length - fresh.length} already on the website (skipped)` : ""}${res.skipped.length ? ` · ${res.skipped.length} row${res.skipped.length === 1 ? "" : "s"} skipped` : ""}</small></h3>
      <div class="cvi-prev"><table>
        <thead><tr><th>Date</th><th>Supplier</th><th>Account title</th><th>Particulars</th><th class="num">Amount</th><th></th></tr></thead>
        <tbody>${chosen.length ? chosen.slice(0, 300).map((r) => `<tr class="${r.dupe ? "dupe" : r.problem ? "bad" : ""}">
          <td>${esc(r.date)}</td><td>${esc(r.supplier)}</td>
          <td>${r.lines.map((l) => esc(l.account || "—")).join("<br>")}</td>
          <td class="wide">${esc(r.particulars)}</td>
          <td class="num">${r.lines.map((l) => money(l.amount)).join("<br>")}</td>
          <td>${r.dupe ? '<span class="cvi-tag">Already on website</span>' : r.problem ? `<span class="cvi-tag bad">${esc(r.problem)}</span>` : r.vat ? '<span class="cvi-tag">VAT</span>' : ""}</td></tr>`).join("")
          : `<tr><td colspan="6" class="cvi-none">${missingReq.length ? "Match the columns above first." : "No expenses found for the ticked months."}</td></tr>`}</tbody>
      </table></div>
      ${res.skipped.length ? `<details class="cvi-skip"><summary>${res.skipped.length} row${res.skipped.length === 1 ? "" : "s"} skipped (blank, totals, or no amount)</summary>
        <ul>${res.skipped.slice(0, 50).map((s) => `<li>Row ${s.row}: ${esc(s.why)}</li>`).join("")}</ul></details>` : ""}`;

    const problems = fresh.filter((r) => r.problem).length;
    foot.innerHTML = `
      <span class="cvi-sum">${problems ? `<i class="fas fa-exclamation-triangle"></i> ${problems} record${problems === 1 ? "" : "s"} need${problems === 1 ? "s" : ""} an account title` : ""}</span>
      <button type="button" class="inv-btn light" data-cancel>Cancel</button>
      <button type="button" class="inv-btn navy" id="cviGo"${!fresh.length || problems || missingReq.length ? " disabled" : ""}><i class="fas fa-file-import"></i> Import ${fresh.length} expense${fresh.length === 1 ? "" : "s"}</button>`;
    foot.querySelector("[data-cancel]").onclick = close;
    foot.querySelector("#cviGo").onclick = () => doImport(fresh);

    body.querySelectorAll("[data-col]").forEach((s) => (s.onchange = () => {
      const k = s.dataset.col, v = s.value === "" ? null : +s.value;
      Object.keys(cols).forEach((x) => { if (cols[x] === v && x !== k) delete cols[x]; });   // one column, one field
      if (v == null) delete cols[k]; else cols[k] = v;
      monthsOn = null; stepMap();
    }));
    body.querySelectorAll("[data-acct]").forEach((s) => (s.onchange = () => { acctMap[s.dataset.acct] = s.value; stepMap(); }));
    body.querySelectorAll("[data-month]").forEach((c) => (c.onchange = () => { c.checked ? monthsOn.add(c.dataset.month) : monthsOn.delete(c.dataset.month); stepMap(); }));
    const sh = body.querySelector("#cviSheet");
    if (sh) sh.onchange = () => pickSheet(sh.value);
    body.querySelector("#cviHr").onchange = (e) => {
      const n = Math.max(1, Math.min(grid.length, +e.target.value || 1)) - 1;
      headerRow = n; cols = guessColumns(grid[n] || []); acctMap = {}; monthsOn = null; stepMap();
    };
    body.querySelector("#cviOther").onclick = () => stepFile();
  }

  // Sheet rows → expense records { date, supplier, …, lines: [{ account, amount, … }], total, dupe, problem }
  function build() {
    const out = { records: [], skipped: [], rawAccounts: [] };
    if (["date", "supplier", "amount"].some((k) => cols[k] == null)) return out;
    const cell = (r, k) => (cols[k] == null ? "" : r[cols[k]]);
    const text = (r, k) => String(cell(r, k) ?? "").trim();
    const groups = new Map();
    let lastDate = "", lastSupplier = "", lastKey = "";
    grid.slice(headerRow + 1).forEach((r, i) => {
      const rowNo = headerRow + 2 + i;
      const amount = amountOf(cell(r, "amount"));
      const joined = r.map((c) => String(c ?? "")).join(" ").toLowerCase();
      if (!r.some((c) => String(c ?? "").trim())) return;
      if (/\b(grand )?total\b|\bsubtotal\b/.test(joined) && !text(r, "supplier")) return out.skipped.push({ row: rowNo, why: "a TOTAL row" });
      if (!amount) return out.skipped.push({ row: rowNo, why: "no amount" });
      // A blank date / supplier under a filled one = another line of the same expense (merged cells)
      let date = dateOf(cell(r, "date")), supplier = text(r, "supplier"), carried = false;
      if (!date && !supplier && lastDate) { date = lastDate; supplier = lastSupplier; carried = true; }
      if (!date) return out.skipped.push({ row: rowNo, why: `date not understood (“${String(cell(r, "date") ?? "")}”)` });
      if (!supplier) supplier = "(no supplier)";
      lastDate = date; lastSupplier = supplier;
      const rawAcct = text(r, "account");
      if (cols.account != null) out.rawAccounts.push(rawAcct);
      const account = cols.account == null ? "" : (CV.ACCOUNTS.find((a) => norm(a) === norm(rawAcct)) || acctMap[rawAcct] || "");
      const ref = text(r, "reference"), no = text(r, "no");
      const key = no ? "no|" + no : carried && !ref ? lastKey : ref ? ["ref", date, norm(supplier), norm(ref)].join("|") : "row|" + rowNo;
      lastKey = key;
      const atc = text(r, "atc").toUpperCase();
      const line = { unitNo: "", account, amount, atc: atc && atc !== "NO EWT" ? atc : "NO EWT",
        expense: cols.expense != null && amountOf(cell(r, "expense")) ? amountOf(cell(r, "expense")) : "",
        vat: cols.inputVat != null && String(cell(r, "inputVat") ?? "").trim() !== "" ? amountOf(cell(r, "inputVat")) : "",
        wt: cols.wt != null && amountOf(cell(r, "wt")) ? amountOf(cell(r, "wt")) : "" };
      let g = groups.get(key);
      if (!g) {
        g = { date, supplier, address: text(r, "address"), tin: text(r, "tin"), reference: ref || "", excel_no: no,
          vat: cols.vat != null ? isVat(cell(r, "vat")) : !!(line.vat && +line.vat > 0), withheld: false,
          particulars: text(r, "particulars"), receiver: text(r, "receiver"), mop: text(r, "mop"), lines: [] };
        groups.set(key, g);
      } else if (text(r, "particulars") && !g.particulars.includes(text(r, "particulars"))) {
        g.particulars = [g.particulars, text(r, "particulars")].filter(Boolean).join("; ");
      }
      if (line.atc !== "NO EWT" || line.wt) g.withheld = true;
      g.lines.push(line);
    });
    // Already on the website: same date + supplier + total
    const have = new Set(CV.all().filter((c) => !c.deleted_at).map((c) => [c.date, norm(c.supplier), r2(c.total)].join("|")));
    groups.forEach((g) => {
      g.total = r2(g.lines.reduce((s, l) => s + l.amount, 0));
      g.dupe = have.has([g.date, norm(g.supplier), g.total].join("|"));
      g.problem = cols.account == null ? "" : g.lines.some((l) => !l.account) ? "No account title" : "";
      if (cols.account == null) g.lines.forEach((l) => (l.account = "Miscellaneous Expense"));
      out.records.push(g);
    });
    out.records.sort((a, b) => sortable(a.date).localeCompare(sortable(b.date)));
    return out;
  }
  const sortable = (d) => { const m = d.match(/^(\d{2})\/(\d{2})\/(\d{4})$/); return m ? m[3] + m[1] + m[2] : d; };

  // Step 3: save them as normal expense records
  function doImport(records) {
    if (!records.length) return;
    const total = records.reduce((s, r) => s + r.total, 0);
    if (!confirm(`Import ${records.length} expense record${records.length === 1 ? "" : "s"} (₱${money(total)})?\n\nEach gets the next Expense # and is saved online. You can open, edit or delete them afterwards like any expense.`)) return;
    const list = CV.all(), now = new Date().toISOString(), by = CV.me();
    const MOPS = ["Cash", "CASH - PCF REPLENISHMENT", "Check", "Bank Transfer", "GCash", "Maya", "Credit Card"];
    let base = Date.now();
    const first = CV.nextNo();
    records.forEach((r) => {
      // Totals the same way the Expenses page works them out
      const t = r.lines.reduce((s, l) => { const k = CV.lineCalc(l, r.vat, r.withheld); return { a: s.a + k.amount, e: s.e + k.expense, v: s.v + k.vat, w: s.w + k.wt }; }, { a: 0, e: 0, v: 0, w: 0 });
      const mop = MOPS.find((m) => norm(m) === norm(r.mop)) || (/gcash|g-cash/i.test(r.mop) ? "GCash" : /maya|paymaya/i.test(r.mop) ? "Maya" : /bank|transfer|bdo|bpi/i.test(r.mop) ? "Bank Transfer"
        : /check|cheque/i.test(r.mop) ? "Check" : /card/i.test(r.mop) ? "Credit Card" : /pcf|petty/i.test(r.mop) ? "CASH - PCF REPLENISHMENT" : /cash/i.test(r.mop) ? "Cash" : r.mop);
      const cv = {
        id: base++, no: "", date: r.date, supplier: r.supplier, address: r.address, tin: r.tin, reference: r.reference,
        vat: r.vat, withheld: r.withheld, lines: r.lines, particulars: r.particulars, receiver: r.receiver, mop,
        total: r2(t.a), expense: r2(t.e), input_vat: r2(t.v), withheld_total: r2(t.w),
        imported_from: fileName + (r.excel_no ? " · " + r.excel_no : ""),
        created_by: by, created_at: now, updated_by: by, updated_at: now,
      };
      list.push(cv);
      cv.no = nextNoIn(list);
    });
    CV.saveAll(list);   // cloud.js saves the new records online (one row each)
    CV.renderDb(); CV.refreshNo();
    const last = list[list.length - 1].no;
    CV.status(`Imported ${records.length} expense record${records.length === 1 ? "" : "s"} (${first} – ${last}), ₱${money(total)}. Open SEARCH EXPENSES to see them.`, "ok");
    if (typeof notify === "function") notify(`Imported ${records.length} expenses.`, "good");
    close();
  }
  // Next "Expense #00012" counting the records being imported too
  function nextNoIn(list) {
    const used = list.map((c) => String(c.no || "").match(/(\d+)$/)).filter(Boolean).map((m) => +m[1]);
    return "Expense #" + String((used.length ? Math.max(...used) : 0) + 1).padStart(5, "0");
  }
})();
