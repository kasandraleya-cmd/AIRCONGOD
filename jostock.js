// Job Order stock status: RED until the job order has its stock, GREEN once it does.
//
//   GREEN  every aircon unit line on the JO has a serial number picked from stock (so it is recorded as
//          stocked out to that JO, on the Job Order page).
//   RED    no stock yet: no items, or at least one aircon unit line still has no serial number
//          (a JO with some of its units shows "1 of 2 units").
//   none   a JO with only services / materials (no aircon unit) needs no stock: no badge.
//
//   JoStock.of(job)      → { state: "green" | "red" | "none", need, have }
//   JoStock.badge(job)   → the small coloured badge as HTML ("" for state "none")
// Load after pricelist.js and pricepicker.js (they tell which items are aircon units).
const JoStock = (function () {
  const BRANDS = ["AMERICAN HOME", "GREE", "MIDEA", "CARRIER", "TCL", "LG", "AUX", "KOLIN", "DAIKIN", "PANASONIC", "SAMSUNG", "HISENSE", "IFFALCON"];
  const hasWord = (word, text) => !!word && new RegExp("(^|[^A-Z0-9])" + word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "([^A-Z0-9]|$)").test(text);

  function brands() {
    let extra = [];
    try { extra = (JSON.parse(localStorage.getItem("aircon_stock") || "[]") || []).map((u) => String(u.brand || "").toUpperCase().trim()).filter(Boolean); } catch (e) {}
    return [...new Set([...BRANDS, ...extra])];
  }
  function isUnitLine(desc, list) {
    const d = String(desc || "").toUpperCase().trim();
    if (!d) return false;
    const p = typeof PricePicker !== "undefined" && PricePicker.find(d);
    if (p) return p.unit === "UNIT";
    return /\((INDOOR|OUTDOOR)\)/.test(d) || list.some((b) => hasWord(b, d));
  }

  function of(job) {
    const list = brands();
    const lines = ((job && job.items) || []).filter((it) => String(it.desc || "").trim() || String(it.serial || "").trim());
    if (!lines.length) return { state: "red", need: 0, have: 0 };   // no items yet: no stock
    let need = 0, have = 0;
    lines.forEach((it) => {
      const serial = String(it.serial || "").trim();
      if (serial) { need += 1; have += 1; }                          // one serial = one unit recorded
      else if (isUnitLine(it.desc, list)) need += Math.max(1, parseInt(it.qty, 10) || 1);
    });
    if (!need) return { state: "none", need: 0, have: 0 };           // services only
    return { state: have >= need ? "green" : "red", need, have };
  }

  function badge(job) {
    const r = of(job);
    if (r.state === "none") return "";
    const text = r.state === "green" ? "Stock recorded" : r.have ? `${r.have} of ${r.need} units` : "No stock";
    const tip = r.state === "green" ? "All units of this job order are recorded from stock."
      : "Waiting for stock: pick the serial number of each unit on this job order.";
    return `<span class="jo-stk ${r.state}" title="${tip}"><i></i>${text}</span>`;
  }

  // The badge's look, added once
  if (typeof document !== "undefined" && !document.getElementById("joStockStyle")) {
    const st = document.createElement("style");
    st.id = "joStockStyle";
    st.textContent = `
      .jo-stk { display: inline-flex; align-items: center; gap: 6px; padding: 2px 9px; border-radius: 99px; font: 700 11.5px/1.5 system-ui, "Segoe UI", sans-serif; white-space: nowrap; }
      .jo-stk i { width: 8px; height: 8px; border-radius: 50%; background: currentColor; }
      .jo-stk.red { background: #fdeceb; color: #b42318; }
      .jo-stk.green { background: #e8f7ee; color: #15803d; }`;
    document.head.appendChild(st);
  }

  return { of, badge };
})();
