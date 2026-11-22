// Customer Records → Daily Schedule / Weekly Schedule: carries a customer over to the page.
// Customer Records saves the customer in sessionStorage and opens the page; the page calls
// CustomerHandoff.take("daily" | "weekly") and shows a bar until the customer is placed in a row or slot.
const CustomerHandoff = (function () {
  const KEY = "aircon_customer_handoff";
  const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // Cities used by the Daily Schedule's Location chips
  const CITIES = [
    "NORTH CALOOCAN", "SOUTH CALOOCAN", "LAS PINAS CITY", "MAKATI", "MALABON", "MANDALUYONG", "MANILA", "MARIKINA", "MUNTINLUPA",
    "NAVOTAS", "PARANAQUE", "PASAY", "PASIG", "PATEROS", "QUEZON CITY", "SAN JUAN", "TAGUIG CITY", "VALENZUELA",
    "BACOOR", "CAVITE CITY", "DASMARINAS", "GEN. TRIAS", "GENERAL TRIAS", "IMUS", "KAWIT", "NOVELETA", "ROSARIO", "SILANG", "TAGAYTAY",
    "TANZA", "TRECE MARTIRES", "CARMONA", "NAIC", "ALFONSO", "MAGALLANES", "AMADEO", "GEN. EMILIO AGUINALDO", "GEN. MARIANO ALVAREZ", "INDANG",
    "SAN PEDRO", "BINAN", "STA. ROSA", "CABUYAO", "CALAMBA", "LOS BANOS", "STA. CRUZ",
    "ANTIPOLO", "CAINTA", "TAYTAY", "BINANGONAN", "SAN MATEO", "RODRIGUEZ", "ANGONO", "TANAY", "JALA-JALA", "CARDONA", "BARAS", "TERESA",
  ];
  // "2020 A. Edison St. Makati City" → "MAKATI"; Ñ counts as N, "City" is optional; the longest name wins
  // "Cavite" alone is the province (e.g. "Bacoor, Cavite"), so Cavite City needs "Cavite City" written out
  const NEEDS_CITY = ["CAVITE CITY"];
  function cityOf(address) {
    const a = " " + String(address || "").toUpperCase().replace(/Ñ/g, "N").replace(/[^A-Z0-9.\- ]+/g, " ") + " ";
    const hits = CITIES.filter((n) => a.includes(" " + n + " ") || (!NEEDS_CITY.includes(n) && a.includes(" " + n.replace(/ CITY$/, "") + " ")));
    return hits.sort((x, y) => y.length - x.length)[0] || "";
  }
  const title = (t) => t.toLowerCase().replace(/(^|[\s.-])\w/g, (m) => m.toUpperCase());   // "LAS PINAS CITY" → "Las Pinas City"

  // Daily Schedule MOP chips use these names
  function dailyMop(mop) {
    const m = String(mop || "").toUpperCase();
    if (!m) return "";
    if (/CHECK|CHEQUE/.test(m)) return "CHECK/CHEQUE PAYMENT";
    if (/CREDIT/.test(m)) return "CREDIT CARD";
    if (/DEBIT/.test(m)) return "DEBIT";
    if (/BANK/.test(m)) return "BANK TRANSFER";
    if (/G-?CASH/.test(m)) return "G-CASH";
    if (/MAYA/.test(m)) return "PAYMAYA";
    if (/GOTYME/.test(m)) return "GOTYME";
    if (/SALMON/.test(m)) return "SALMON";
    if (/CASH/.test(m)) return "CASH";
    return m;
  }

  // The customer meant for this page (after the online data has loaded, so nothing gets overwritten)
  async function take(page) {
    if (window.cloudReady) await window.cloudReady;
    let h = null;
    try { h = JSON.parse(sessionStorage.getItem(KEY)); } catch (e) {}
    if (!h || h.to !== page || !h.customer) return null;
    sessionStorage.removeItem(KEY);
    return h.customer;
  }

  // The bar at the top of the page: who is being scheduled, what to do, an optional button, and Cancel
  function banner(c, text, button) {
    const bar = document.createElement("div");
    bar.className = "handoff-bar";
    bar.innerHTML = `
      <i class="fas fa-user-check"></i>
      <div><b>${esc(c.name)}</b><span>${esc(text)}</span></div>
      ${button ? `<button type="button" class="handoff-go">${esc(button.label)}</button>` : ""}
      <button type="button" class="handoff-x" title="Cancel">&times;</button>`;
    const main = document.querySelector("main.content") || document.body;
    main.insertBefore(bar, main.firstChild);
    const api = {
      cancelled: false,
      remove() { bar.remove(); },
      done(msg) {
        bar.classList.add("done");
        bar.innerHTML = `<i class="fas fa-check-circle"></i><div><b>${esc(c.name)}</b><span>${esc(msg)}</span></div>`;
        setTimeout(() => bar.remove(), 4000);
      },
    };
    bar.querySelector(".handoff-x").onclick = () => { api.cancelled = true; bar.remove(); if (api.onCancel) api.onCancel(); };
    if (button) bar.querySelector(".handoff-go").onclick = button.onClick;
    return api;
  }

  return { take, banner, cityOf, title, dailyMop, KEY };
})();
