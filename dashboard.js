// Dashboard: fills in the boxes on dashboard.html from the website's own data.
//   Sales and top brands   job orders on the Purchase page ("aircon_jobs")
//   Low stock              Scanner / Inventory ("aircon_stock", "aircon_items")
//   Today's schedule       Daily Schedule ("aircon_daily")
//   Requests               installation form (table "install_requests" + this browser)
//   Activity / warranty    scans ("aircon_scans"), job orders, requests and signed forms (table "signed_forms")
// Needs pricelist.js + pricepicker.js (which items are aircon units) and warranty.js (warranty lengths).
(function () {
  const $ = (s) => document.getElementById(s);
  const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const load = (key, empty) => { try { return JSON.parse(localStorage.getItem(key)) || empty; } catch (e) { return empty; } };
  const peso = (n) => "₱" + Math.round(n).toLocaleString("en-PH");
  const short = (n) => n >= 1e6 ? "₱" + (n / 1e6).toFixed(2) + "M" : n >= 1e3 ? "₱" + Math.round(n / 1e3) + "k" : "₱" + Math.round(n);
  const pad = (n) => String(n).padStart(2, "0");
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const ym = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  const now = new Date();
  const TODAY = ymd(now), THIS_MONTH = ym(now);
  const MONTH = (d) => d.toLocaleDateString("en-US", { month: "short" });
  const plural = (n, w) => `${n} ${w}${n === 1 ? "" : "s"}`;
  // Sales money (totals, chart, job order amounts) is for the Owner (and Developer) only
  const SEE_SALES = Roles.me().seesDashboardSales;   // Owner, HR / Manager, Admin / Office Staff, Developer (roles.js)
  const isBusiness = !$("bizBoxes").hidden;

  const empty = (icon, title, text, link, good) => `
    <div class="db-empty${good ? " good" : ""}"><i class="fas ${icon}"></i>
      <div><b>${title}</b>${text ? "<br>" + text : ""}${link ? `<br><a href="${link[0]}">${link[1]} →</a>` : ""}</div></div>`;

  // ---------- Greeting ----------
  const hour = now.getHours();
  const part = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";
  const who = sessionStorage.getItem("aircon_name") || sessionStorage.getItem("aircon_user") || "";
  const nice = who.includes("@") ? "" : who.charAt(0).toUpperCase() + who.slice(1);
  $("greet").textContent = `Good ${part}${nice ? ", " + nice : ""}!`;
  $("today").textContent = now.toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  // ---------- Job orders (Purchase page) ----------
  // Which items are aircon units: the Price List says so (unit of measure "UNIT")
  const isUnit = (desc) => { const p = PricePicker.find(desc); return p ? p.unit === "UNIT" : !!WARRANTY.find(desc); };
  const BRANDS = ["AMERICAN HOME", "CARRIER", "DAIKIN", "HISENSE", "LG", "MIDEA", "PANASONIC", "TCL", "AUX", "KOLIN", "SAMSUNG", "GREE"];
  const brandOf = (desc) => {
    const d = String(desc).toUpperCase();
    const b = BRANDS.find((x) => d.startsWith(x)) || (WARRANTY.find(desc) || { name: "" }).name.split(" ")[0].toUpperCase();
    return b ? b.replace(/\b\w+/g, (w) => (w.length <= 3 ? w : w[0] + w.slice(1).toLowerCase())) : "";
  };
  const initials = (b) => (b === "American Home" ? "AH" : b.slice(0, 2).toUpperCase());

  function jobsByMonth() {
    const jobs = load("aircon_jobs", []);
    const sums = {}, units = {}, brands = {};
    jobs.forEach((j) => {
      const m = String(j.date || "").slice(0, 7);
      if (!m) return;
      sums[m] = (sums[m] || 0) + (+j.total || 0);
      (j.items || []).forEach((it) => {
        if (!it.desc || !isUnit(it.desc)) return;
        const q = +it.qty || 1;
        units[m] = (units[m] || 0) + q;
        if (m !== THIS_MONTH) return;
        const b = brandOf(it.desc) || "Other";
        const row = brands[b] || (brands[b] = { units: 0, amount: 0 });
        row.units += q;
        row.amount += q * (+it.cost || 0) - (+it.disc || 0);
      });
    });
    return { jobs, sums, units, brands };
  }

  // ---------- Cash vouchers (Cash Voucher page, "aircon_cv") ----------
  // A CV's date is typed as mm/dd/yyyy; deleted vouchers don't count. Its total is the full amount paid.
  const cvMonth = (c) => { const m = String(c.date || "").match(/^(\d{2})\/\d{2}\/(\d{4})$/); return m ? `${m[2]}-${m[1]}` : ""; };
  const cvsOf = (month) => load("aircon_cv", []).filter((c) => !c.deleted_at && cvMonth(c) === month);
  const cvTotal = (month) => cvsOf(month).reduce((t, c) => t + (+c.total || 0), 0);
  const cvCount = (month) => cvsOf(month).length;

  function sales() {
    const { sums, units, brands } = jobsByMonth();
    const last = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const thisTotal = sums[THIS_MONTH] || 0, lastTotal = sums[ym(last)] || 0;
    const thisUnits = units[THIS_MONTH] || 0;
    drawBrands(brands);
    if (!SEE_SALES) return;   // the sales boxes are hidden; don't even fill in the amounts
    $("monthSales").textContent = peso(thisTotal);
    $("monthSalesLabel").textContent = `Sales this month · ${plural(thisUnits, "unit")}`;
    const d = $("salesDelta");
    if (lastTotal) {
      const pct = Math.round((thisTotal / lastTotal - 1) * 100);
      d.className = "db-delta " + (pct > 0 ? "up" : pct < 0 ? "down" : "flat");
      d.textContent = `${pct > 0 ? "▲" : pct < 0 ? "▼" : ""} ${Math.abs(pct)}% vs ${MONTH(last)}`.trim();
    } else { d.className = "db-delta flat"; d.textContent = thisTotal ? `No ${MONTH(last)} sales` : "No sales yet"; }
    d.hidden = !lastTotal && !thisTotal;   // "No sales yet" only repeats the ₱0: no badge

    // This month's cash vouchers (Cash Voucher page) taken away from this month's sales
    const cv = cvTotal(THIS_MONTH), net = thisTotal - cv;
    // Exact amounts here (centavos shown when there are any), so the three lines always add up
    const pesoX = (n) => "₱" + (Math.round(n * 100) / 100).toLocaleString("en-PH", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 });
    const box = $("salesBreak");
    box.hidden = false;
    box.innerHTML = `
      <div><span>Sales</span><b>${pesoX(thisTotal)}</b></div>
      <div><span>Expenses${cv ? ` · ${plural(cvCount(THIS_MONTH), "record")}` : ""}</span><b class="neg">${cv ? "−" + pesoX(cv) : pesoX(0)}</b></div>
      <div class="net ${net < 0 ? "loss" : ""}"><span>Net (sales − expenses)</span><b>${net < 0 ? "−" + pesoX(-net) : pesoX(net)}</b></div>`;

    $("heroSum").innerHTML = `<div><b>${short(thisTotal)}</b><span>sales this month</span></div><div><b>${thisUnits}</b><span>units sold</span></div>`;
    drawChart(sums);
  }

  // ---------- Monthly sales chart: one series, bars from zero, hover for the exact amount ----------
  let range = 6, lastSums = {};
  function drawChart(sums) {
    lastSums = sums;
    const months = Array.from({ length: range }, (_, i) => new Date(now.getFullYear(), now.getMonth() - (range - 1 - i), 1));
    const data = months.map((d) => [d, sums[ym(d)] || 0]);
    const total = data.reduce((s, x) => s + x[1], 0);
    $("chartTotal").textContent = short(total);
    $("chartSub").textContent = `last ${range} months · this month in gold`;
    const box = $("chart");
    if (!total) {
      box.innerHTML = empty("fa-chart-bar", "No sales to show yet", "Saved job orders appear here.", ["sales.html", "Open Job Order"]);
      return;
    }
    const W = Math.max(300, box.clientWidth), H = 230, L = 46, B = 24, T = 10;
    const top = Math.max(...data.map((x) => x[1]));
    const stepV = Math.pow(10, Math.floor(Math.log10(top))) * (top / Math.pow(10, Math.floor(Math.log10(top))) > 5 ? 2 : 1) / 2;
    const max = Math.ceil(top / stepV) * stepV;
    const step = (W - L) / data.length, bw = Math.min(38, step * 0.56);
    const y = (v) => T + (H - T - B) * (1 - v / max);
    let svg = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Monthly sales, last ${range} months">`;
    for (let v = 0; v <= max + 1e-6; v += max / 4) {
      svg += `<line class="gl" x1="${L}" x2="${W}" y1="${y(v)}" y2="${y(v)}"/><text class="ax" x="${L - 8}" y="${y(v) + 4}" text-anchor="end">${v ? short(v) : "0"}</text>`;
    }
    svg += '<g class="bars">';
    data.forEach(([d, v], i) => {
      const x = L + step * i + (step - bw) / 2, t = y(v), h = H - B - t, r = Math.min(4, h);
      if (h > 0) svg += `<path class="bar${i === data.length - 1 ? " now" : ""}" data-i="${i}" d="M${x},${H - B} V${t + r} Q${x},${t} ${x + r},${t} H${x + bw - r} Q${x + bw},${t} ${x + bw},${t + r} V${H - B} Z"/>`;
      if (range <= 6 || i % 2 === data.length % 2 || i === data.length - 1) svg += `<text class="ax" x="${x + bw / 2}" y="${H - 6}" text-anchor="middle">${MONTH(d)}</text>`;
      svg += `<rect class="hit" data-i="${i}" x="${L + step * i}" y="${T}" width="${step}" height="${H - T - B}"/>`;
    });
    svg += '</g></svg><div class="db-tip" hidden></div>';
    box.innerHTML = svg;

    const tip = box.querySelector(".db-tip"), g = box.querySelector(".bars");
    box.querySelectorAll(".hit").forEach((hit) => {
      const show = () => {
        const i = +hit.dataset.i, [d, v] = data[i], prev = data[i - 1];
        const r = hit.getBoundingClientRect(), br = box.getBoundingClientRect();
        g.classList.add("dim");
        const bar = box.querySelector(`.bar[data-i="${i}"]`);
        if (bar) bar.classList.add("hl");
        const change = prev && prev[1] ? Math.round((v / prev[1] - 1) * 100) : null;
        tip.innerHTML = `${d.toLocaleDateString("en-US", { month: "long", year: "numeric" })}<br><b>${peso(v)}</b>` +
          (change === null ? "" : `<br>${change >= 0 ? "▲" : "▼"} ${Math.abs(change)}% vs ${MONTH(prev[0])}`);
        tip.style.left = r.left - br.left + r.width / 2 + "px";
        tip.style.top = (bar ? bar.getBoundingClientRect().top : r.bottom) - br.top - 8 + "px";
        tip.hidden = false;
      };
      const hide = () => { g.classList.remove("dim"); box.querySelectorAll(".bar.hl").forEach((b) => b.classList.remove("hl")); tip.hidden = true; };
      hit.addEventListener("mouseenter", show);
      hit.addEventListener("mouseleave", hide);
      hit.addEventListener("click", show);   // phones: tap a month
    });
  }
  document.querySelectorAll(".db-seg button").forEach((b) => b.addEventListener("click", () => {
    document.querySelectorAll(".db-seg button").forEach((x) => x.classList.toggle("on", x === b));
    range = +b.dataset.range;
    drawChart(lastSums);
  }));
  let resizeTimer;
  window.addEventListener("resize", () => { clearTimeout(resizeTimer); resizeTimer = setTimeout(() => drawChart(lastSums), 150); });

  // ---------- Top brands this month ----------
  function drawBrands(brands) {
    const list = Object.entries(brands).sort((a, b) => b[1].units - a[1].units).slice(0, 6);
    if (!list.length) {
      $("brands").innerHTML = empty("fa-trophy", "No units sold this month yet", "Aircon units on this month's job orders show here.", ["sales.html", "New job order"]);
      return;
    }
    const most = list[0][1].units;
    $("brands").innerHTML = list.map(([b, r]) => `
      <div class="db-brand"><span class="db-logo">${esc(initials(b))}</span>
        <div><span class="name">${esc(b)}</span><div class="db-meter"><span style="width:${(r.units / most) * 100}%"></span></div></div>
        <span class="num">${plural(r.units, "unit")}${SEE_SALES ? `<br><small>${short(Math.max(0, r.amount))}</small>` : ""}</span></div>`).join("");
  }

  // ---------- Low stock (same rule as Inventory) ----------
  const LOW_STOCK_AT = 5;
  function lowStock() {
    const groups = {};
    load("aircon_stock", []).filter((s) => s.status === "in").forEach((s) => {
      const key = (s.brand || "").trim().toLowerCase() || "-";
      const g = groups[key] || (groups[key] = { name: s.brand || "No brand", qty: 0, reorder: 0 });
      g.qty++;
      g.reorder = Math.max(g.reorder, +s.reorder || 0);
    });
    const manual = load("aircon_items", []).map((i) => ({ name: i.name, qty: +i.qty || 0, reorder: +i.reorder || 0 }));
    const low = Object.values(groups).concat(manual).filter((r) => r.qty <= (r.reorder || LOW_STOCK_AT)).sort((a, b) => a.qty - b.qty);
    const out = low.filter((r) => r.qty <= 0).length;

    $("lowCount").textContent = low.length;
    const d = $("lowDelta");
    d.className = "db-delta " + (out ? "down" : low.length ? "flat" : "up");
    d.textContent = out ? `${out} out of stock` : low.length ? "Reorder soon" : "✓ All good";
    d.hidden = !low.length;   // nothing low: the 0 says it, no badge
    $("lowList").innerHTML = low.length
      ? low.slice(0, 6).map((r) => `
        <div class="db-li"><span class="db-logo">${esc(String(r.name).slice(0, 2).toUpperCase())}</span>
          <div><b>${esc(r.name)}</b><small>${r.qty <= 0 ? "Out of stock" : "Reorder level " + (r.reorder || LOW_STOCK_AT)}</small></div>
          <span class="r">${r.qty <= 0 ? '<span class="db-pill red"><i class="fas fa-times-circle"></i> Out</span>' : `<span class="db-qty">${r.qty}</span> left`}</span></div>`).join("")
      : empty("fa-check", "Nothing to reorder right now", "", ["scanner.html", "Scan new stock"], true);
  }

  // ---------- Today's schedule (Daily Schedule) ----------
  const STATUS = {
    "WAITING": ["amber", "far fa-clock", "Waiting"], "ON THE WAY": ["blue", "fas fa-truck", "On the way"],
    "ONGOING": ["blue", "fas fa-tools", "Ongoing"], "DONE": ["green", "fas fa-check", "Done"],
    "RESCHEDULED": ["amber", "fas fa-redo", "Rescheduled"], "CANCELLED": ["gray", "fas fa-ban", "Cancelled"],
  };
  const pill = (s) => {
    const [c, ic, label] = STATUS[s] || ["amber", "far fa-clock", s ? s.charAt(0) + s.slice(1).toLowerCase() : "Scheduled"];
    return `<span class="db-pill ${c}"><i class="${ic}"></i> ${esc(label)}</span>`;
  };
  function todaysJobs() {
    const day = load("aircon_daily", {})[TODAY];
    let team = 0;
    const jobs = [];
    (day && day.groups || []).forEach((g) => {
      const label = g.kind === "service" ? "Service team" : `Installer team ${++team}`;
      // Merged rows (one customer, several units / brands on the Daily Schedule): ONE job listing every unit.
      // Same customer = rows next to each other with the same name and JO # (a blank JO # matches any).
      const nm = (r) => String(r.name || "").trim().toUpperCase(), jo = (r) => String(r.jo || "").trim().toUpperCase();
      const same = (a, b) => a && nm(a) && nm(a) === nm(b) && (!jo(a) || !jo(b) || jo(a) === jo(b));
      let prev = null;
      g.rows.filter((r) => r.name || r.model).forEach((r) => {
        if (prev && same(prev.rows[prev.rows.length - 1], r)) { prev.rows.push(r); return; }
        prev = { ...r, rows: [r], team: label, short: g.kind === "service" ? "SV" : "T" + team };
        jobs.push(prev);
      });
    });
    // A merged job's status: DONE / CANCELLED only when every unit is; otherwise the first unit still open
    jobs.forEach((j) => {
      if (j.rows.length < 2) return;
      const st = j.rows.map((r) => String(r.status || "").toUpperCase());
      j.status = st.every((s) => s === "DONE") ? "DONE" : st.every((s) => s === "CANCELLED") ? "CANCELLED"
        : st.find((s) => s !== "DONE" && s !== "CANCELLED") || j.status;
    });
    const open = jobs.filter((r) => !["DONE", "CANCELLED"].includes(r.status));
    const done = jobs.filter((r) => r.status === "DONE").length;
    const teamsOut = new Set(open.map((r) => r.team)).size;

    $("todayCount").textContent = open.length;
    $("jobsDelta").className = "db-delta " + (done ? "up" : "flat");
    $("jobsDelta").textContent = jobs.length ? `${done} done` : "None today";
    $("jobsDelta").hidden = !jobs.length;   // no jobs: the 0 says it, no badge
    $("heroLine").innerHTML = jobs.length
      ? `<i class="fas fa-sun"></i> ${plural(jobs.length, "job")} today · ${plural(teamsOut, "team")} still out`
      : '<i class="fas fa-sun"></i> No jobs on today\'s schedule yet';

    $("todayList").innerHTML = jobs.length
      ? jobs.slice(0, 8).map((r) => {
        const units = (r.rows || [r]).filter((u, i) => u.model || i === 0);   // units with no model picked yet aren't listed
        const what = units.map((u) => [u.model, u.hp, u.qty && u.qty !== "-" ? "× " + u.qty : ""].filter(Boolean).join(" ")).filter(Boolean).join(" + ");
        return `<div class="db-job${r.status === "DONE" ? " done" : r.status === "CANCELLED" ? " cancelled" : ""}">
          <time>${esc(String(r.time || "—").replace(/^(\d+)(ST|ND|RD|TH) BATCH$/i, (m, n, s) => n + s.toLowerCase() + " batch"))}</time><span class="db-dot"></span>
          <div class="who"><b>${esc(r.name || "—")}</b>
            <small>${esc(what || "—")}${r.location ? ` · <i class="fas fa-map-marker-alt"></i> ${esc(r.location)}` : ""}</small>
            <div class="db-team"><span class="db-av">${esc(r.short)}</span>${esc(r.team)}${r.assign ? " · " + esc(r.assign) : ""}</div></div>
          ${pill(r.status)}</div>`;
      }).join("") + (jobs.length > 8 ? `<p class="db-empty" style="padding:8px 0 0">+ ${jobs.length - 8} more on the Daily Schedule</p>` : "")
      : empty("fa-calendar-day", "No jobs on today's schedule", "", ["dailysched.html", "Add a job"]);
  }

  // ---------- New customer requests ----------
  let onlineRequests = null;   // null until the database answers
  let onlineCleaningRequests = null;
  function requests() {
    let local = [];
    try { local = JSON.parse(localStorage.getItem("aircon_install_requests") || "[]"); } catch (e) {}
    const online = onlineRequests || [];
    const seen = new Set(online.map((r) => r.no));
    const all = online.concat(local.filter((r) => !seen.has(r.no)).map((r) => ({ ...r, created_at: r.submitted })));
    let localCleaning = [];
    try { localCleaning = JSON.parse(localStorage.getItem("aircon_cleaning_requests") || "[]"); } catch (e) {}
    const onlineCleaning = onlineCleaningRequests || [];
    const seenCleaning = new Set(onlineCleaning.map((r) => r.no));
    const cleaning = onlineCleaning.concat(localCleaning.filter((r) => !seenCleaning.has(r.no)));
    cleaning.forEach((r) => all.push({ ...r, kind: "cleaning" }));
    const fresh = all.filter((r) => (r.status || "New") === "New");
    const today = all.filter((r) => String(r.created_at || "").slice(0, 10) === TODAY).length;
    $("newCustomerRequests").textContent = fresh.length;
    $("reqDelta").className = "db-delta " + (today ? "up" : "flat");
    $("reqDelta").textContent = today ? `▲ ${today} today` : "None today";
    $("reqDelta").hidden = !today;   // none new today: no badge
    return all;
  }

  // ---------- Recent activity ----------
  let onlineForms = [];
  const ago = (t) => {
    const m = Math.round((Date.now() - t) / 6e4);
    if (m < 1) return "just now";
    if (m < 60) return m + " min ago";
    const h = Math.round(m / 60);
    if (h < 24) return plural(h, "hr") + " ago";
    const d = Math.round(h / 24);
    return d === 1 ? "yesterday" : d < 7 ? d + " days ago" : new Date(t).toLocaleDateString("en-PH", { month: "short", day: "numeric" });
  };
  function activity(allRequests) {
    const items = [];
    load("aircon_scans", []).forEach((s) => items.push({
      t: +s.time, c: s.type === "Stock In" ? "green" : "amber", ic: s.type === "Stock In" ? "fa-dolly" : "fa-truck-loading",
      title: s.type || "Scan", sub: [s.name, s.barcode].filter(Boolean).join(" · "),
    }));
    load("aircon_jobs", []).forEach((j) => items.push({
      t: +j.id || Date.parse(j.date), c: "", ic: "fa-shopping-cart",
      title: "Job order " + (j.no || ""), sub: [j.customer, j.total && SEE_SALES ? peso(j.total) : ""].filter(Boolean).join(" · "),
    }));
    allRequests.forEach((r) => items.push({
      t: Date.parse(r.created_at), c: r.kind === "cleaning" ? "amber" : "blue",
      ic: r.kind === "cleaning" ? "fa-wind" : "fa-user-plus",
      title: r.kind === "cleaning" ? "New cleaning request" : "New installation request",
      sub: [r.no, r.name, r.kind === "cleaning" ? r.brand_hp : (r.qty ? plural(+r.qty, "unit") : "")].filter(Boolean).join(" · "),
    }));
    onlineForms.forEach((f) => items.push({ t: Date.parse(f.created_at), c: "green", ic: "fa-file-signature", title: "Signed form saved", sub: `${f.no} · ${f.client}` }));

    const list = items.filter((i) => i.t && i.t <= Date.now() + 6e4).sort((a, b) => b.t - a.t).slice(0, 6);
    $("activity").innerHTML = list.length
      ? list.map((i) => `<div class="db-li"><span class="db-ic ${i.c}"><i class="fas ${i.ic}"></i></span>
          <div><b>${esc(i.title)}</b><small>${esc(i.sub || "")}</small></div><span class="r">${ago(i.t)}</span></div>`).join("")
      : empty("fa-stream", "Nothing has happened yet", "Scans, job orders, requests and signed forms show here.");
  }

  // ---------- Warranty ending soon (from signed forms) ----------
  const SOON_DAYS = 30;
  function endsOn(start, term) {
    const m = /(\d+)\s*(year|month|day)/i.exec(term);
    if (!m) return null;
    const d = new Date(start), n = +m[1], unit = m[2].toLowerCase();
    if (unit === "year") d.setFullYear(d.getFullYear() + n);
    else if (unit === "month") d.setMonth(d.getMonth() + n);
    else d.setDate(d.getDate() + n);
    return d;
  }
  function warrantySoon(formsLoaded) {
    const soon = [];
    onlineForms.forEach((f) => (((f.details || {}).warranty) || []).forEach((w) => (w.terms || []).forEach((term) => {
      if (/replacement/i.test(term)) return;   // the 7-day replacement is too short to list here
      const end = endsOn(f.created_at, term);
      const days = end && Math.ceil((end - now) / 864e5);
      if (days >= 0 && days <= SOON_DAYS) soon.push({ f, w, term, days });
    })));
    soon.sort((a, b) => a.days - b.days);
    $("warrantyList").innerHTML = soon.length
      ? soon.slice(0, 6).map(({ f, w, term, days }) => `
        <div class="db-li"><span class="db-ic amber"><i class="fas fa-shield-alt"></i></span>
          <div><b>${esc(f.client)}</b><small>${esc(w.series)} · ${esc(term)}</small></div>
          <span class="r"><span class="db-pill amber">${days === 0 ? "today" : days === 1 ? "tomorrow" : `in ${days} days`}</span></span></div>`).join("")
      : formsLoaded
        ? empty("fa-shield-alt", `No warranties ending in the next ${SOON_DAYS} days`, "Based on saved signed forms.", null, true)
        : empty("fa-shield-alt", "Warranty reminders", "They appear once signed forms are saved on the Warranty page.", ["aftersales.html", "Open Warranty"]);
  }

  // ---------- Draw everything ----------
  function drawAll(formsLoaded) {
    sales();
    lowStock();
    todaysJobs();
    const all = requests();
    activity(all);
    warrantySoon(formsLoaded);
  }
  if (!isBusiness) { todaysJobs(); return; }   // staff view: only the greeting line is used
  drawAll(false);

  // Data from other PCs (cloud.js) or other tabs
  window.addEventListener("storage", (e) => {
    if (["aircon_jobs", "aircon_stock", "aircon_items", "aircon_daily", "aircon_scans", "aircon_install_requests", "aircon_cleaning_requests", "aircon_cv"].includes(e.key)) drawAll(formsLoaded);
  });

  // Online tables: installation requests and signed forms
  let formsLoaded = false;
  (async function online() {
    if (!window.cloud) return;
    if (window.cloudReady) await window.cloudReady;
    const db = window.cloud;
    const loadRequests = async () => {
      const r = await db.from("install_requests").select("*").order("created_at", { ascending: false }).limit(200);
      if (!r.error) onlineRequests = (r.data || []).filter((x) => !x.archived_at);
    };
    const loadCleaningRequests = async () => {
      const r = await db.from("cleaning_requests").select("no,created_at,name,brand_hp,status").order("created_at", { ascending: false }).limit(200);
      if (!r.error) onlineCleaningRequests = r.data || [];
    };
    const loadForms = async () => {
      const r = await db.from("signed_forms").select("id,no,client,created_at,details").is("archived_at", null).order("created_at", { ascending: false }).limit(1000);
      if (!r.error) { onlineForms = r.data || []; formsLoaded = true; }
    };
    await Promise.all([loadRequests(), loadCleaningRequests(), loadForms()]);
    drawAll(formsLoaded);
    db.channel("dashboard-live")
      .on("postgres_changes", { event: "*", schema: "public", table: "install_requests" }, async () => { await loadRequests(); drawAll(formsLoaded); })
      .on("postgres_changes", { event: "*", schema: "public", table: "cleaning_requests" }, async () => { await loadCleaningRequests(); drawAll(formsLoaded); })
      .on("postgres_changes", { event: "*", schema: "public", table: "signed_forms" }, async () => { await loadForms(); drawAll(formsLoaded); })
      .subscribe();
  })();
})();
