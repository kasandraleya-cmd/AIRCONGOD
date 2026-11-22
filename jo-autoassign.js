// Units go to the customer by the JOB ORDER, automatically.
//
//   JoAuto.run()   looks at every saved job order and:
//     1. REPAIRS: a serial that is on a JO but whose unit is still "in stock" is marked out (sold) to that JO's customer.
//     2. ASSIGNS: a JO unit line with no serial takes an available unit that fits it (same brand and horsepower, the
//        exact model when the line is a Price List model; "(Outdoor)" lines take outdoor units, other lines indoor
//        units; the lowest Unit No. first, the oldest JO first). The serial and (when empty) the unit cost, the
//        Price List SRP, are filled in on the JO, the unit is stocked out to that customer, and Serial Number
//        Tracking shows the customer and SOLD. A line with Qty 3 becomes one line per unit that has stock.
//   It runs when Serial Number Tracking, JO Records, the Job Order page and the Scanner open or get new stock.
//   Returns { assigned, repaired, list } and shows a notice when something was assigned.
const JoAuto = (function () {
  const JOBS = "aircon_jobs", STOCK = "aircon_stock", SERIALS = "aircon_serials";
  const BRANDS = ["AMERICAN HOME", "GREE CRYSTAL", "GREE", "MIDEA", "CARRIER", "TCL", "LG", "AUX", "KOLIN", "DAIKIN", "PANASONIC", "SAMSUNG", "HISENSE", "IFFALCON"];
  const up = (t) => String(t || "").toUpperCase().trim();
  const low = (t) => String(t || "").trim().toLowerCase();
  const squash = (t) => up(t).replace(/[^A-Z0-9.]+/g, "");
  const hpOf = (t) => { const m = up(t).match(/(\d+(?:\.\d+)?)\s*HP\b/); return m ? +m[1] : null; };
  const hasWord = (word, text) => !!word && new RegExp("(^|[^A-Z0-9])" + word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "([^A-Z0-9]|$)").test(text);
  const read = (k) => { try { const v = JSON.parse(localStorage.getItem(k) || "[]"); return Array.isArray(v) ? v : []; } catch (e) { return []; } };
  const find = (t) => (typeof PricePicker !== "undefined" && t ? PricePicker.find(t) : null);
  const today = () => new Date().toISOString().slice(0, 10);

  const isModel = (t) => !!find(t);
  function isUnitLine(desc, brands) {
    const d = up(desc);
    if (!d) return false;
    const p = find(d);
    if (p) return p.unit === "UNIT";
    return /\((INDOOR|OUTDOOR)\)/.test(d) || brands.some((b) => hasWord(b, d));
  }
  // Does this scanned unit fit the JO line? (same rules as the Job Order page's Serial No. list)
  function fits(u, line) {
    const wantOut = /\(OUTDOOR\)/.test(line);
    if (wantOut ? (u.unit && u.unit !== "Outdoor") : u.unit === "Outdoor") return false;
    const desc = line.replace(/\s*\((INDOOR|OUTDOOR)\)\s*/g, " ").trim();
    if (!hasWord(up(u.brand), desc)) return false;
    if (isModel(desc)) return squash(u.specs) === squash(desc);
    const hd = hpOf(desc), hu = hpOf(u.specs || u.name);
    return !(hd && hu && hd !== hu);
  }
  const srpOfUnit = (u) => { const p = find(u.specs) || find([u.brand, u.specs].filter(Boolean).join(" ")) || find(u.name); return p ? +p.srp : 0; };

  let running = false;
  function run() {
    if (running) return { assigned: 0, repaired: 0, list: [] };
    running = true;
    try {
      const jobs = read(JOBS), stock = read(STOCK);
      if (!jobs.length || !stock.length) return { assigned: 0, repaired: 0, list: [] };
      const serials = read(SERIALS);
      const brands = [...new Set([...BRANDS, ...stock.map((u) => up(u.brand)).filter(Boolean)])];
      const unitOf = (code) => stock.find((u) => low(u.barcode) === low(code));
      const used = new Set();
      jobs.forEach((j) => (j.items || []).forEach((i) => { if (String(i.serial || "").trim()) used.add(low(i.serial)); }));

      let repaired = 0, assigned = 0, jobsChanged = false, stockChanged = false;
      const list = [], touched = new Map();   // barcode → job
      const sell = (u, job) => {
        Object.assign(u, { status: "out", outDate: job.date || today(), customer: job.customer || "", jo: job.no || "" });
        stockChanged = true;
        touched.set(u.barcode, job);
      };

      // 1) A serial on a JO whose unit is still in stock: it is sold to that JO's customer
      jobs.forEach((j) => (j.items || []).forEach((i) => {
        const code = String(i.serial || "").trim();
        const u = code && unitOf(code);
        if (u && u.status !== "out") { sell(u, j); repaired++; }
      }));

      // 2) Lines still waiting for a unit take an available one (oldest JO first)
      const order = jobs.map((j, k) => ({ j, k })).sort((a, b) => String(a.j.date || "").localeCompare(String(b.j.date || "")) || (+a.j.id || 0) - (+b.j.id || 0) || a.k - b.k);
      order.forEach(({ j }) => {
        if (!Array.isArray(j.items) || !j.items.length) return;
        const next = [];
        let changed = false;
        j.items.forEach((it) => {
          const desc = up(it.desc);
          if (String(it.serial || "").trim() || !isUnitLine(desc, brands)) { next.push(it); return; }
          const want = Math.max(1, parseInt(it.qty, 10) || 1);
          const cands = stock.filter((u) => u.status === "in" && u.barcode && !used.has(low(u.barcode)) && fits(u, desc))
            .sort((a, b) => (+a.unitNo || 1e9) - (+b.unitNo || 1e9));
          const take = cands.slice(0, want);
          if (!take.length) { next.push(it); return; }
          take.forEach((u) => {
            const isOut = /\(OUTDOOR\)/.test(desc);
            const line = { ...it, qty: "1", serial: u.barcode };
            if (!isOut && !(+line.cost)) { const srp = srpOfUnit(u); if (srp) line.cost = String(srp); }
            next.push(line);
            used.add(low(u.barcode));
            sell(u, j);
            assigned++; changed = true;
            list.push({ jo: j.no, customer: j.customer, serial: u.barcode });
          });
          if (want > take.length) next.push({ ...it, qty: String(want - take.length) });   // the rest still waits for stock
        });
        if (changed) {
          j.items = next;
          j.total = next.reduce((t, i) => { const s = (+i.qty || 0) * (+i.cost || 0); return t + (s ? s - (+i.disc || 0) : 0); }, 0);
          jobsChanged = true;
        }
      });

      if (!repaired && !assigned) return { assigned: 0, repaired: 0, list: [] };

      // Serial Number Tracking's own list follows
      touched.forEach((job, code) => {
        const s = serials.find((x) => low(x.serial) === low(code));
        if (s) Object.assign(s, { status: "Sold", customer: job.customer || "" });
      });
      const save = (k, v) => localStorage.setItem(k, JSON.stringify(v));
      if (jobsChanged) save(JOBS, jobs);
      if (stockChanged) save(STOCK, stock);
      save(SERIALS, serials);
      if (typeof window.cloudSaveNow === "function") [JOBS, STOCK, SERIALS].forEach((k) => { try { window.cloudSaveNow(k); } catch (e) {} });

      if (assigned && typeof window.notify === "function") {
        const who = [...new Set(list.map((x) => x.customer || x.jo))].slice(0, 3).join(", ");
        window.notify(`${assigned} unit${assigned > 1 ? "s were" : " was"} assigned to ${who} by their job order. Serial Number Tracking shows them as SOLD.`, "good");
      }
      return { assigned, repaired, list };
    } finally {
      running = false;
    }
  }

  return { run };
})();
