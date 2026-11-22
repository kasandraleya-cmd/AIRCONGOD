// Price picker: suggestions from the Price List (pricelist.js) while typing an item description.
// Load pricelist.js first. Used on Sales (job order) and Warranty (quotation).
//
//   PricePicker.attach(container, ".desc", (input, item) => { ...fill the row... });
//   PricePicker.find("lg premium ipx3 ... 1.5 hp")  →  { name, unit, srp } or undefined
const PricePicker = (function () {
  const key = (t) => String(t).toUpperCase().replace(/[^A-Z0-9.]+/g, "");   // ignore spaces, case and symbols
  const money = (n) => Number(n || 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // Every unit and material with its unit of measure: UNIT for aircons, FT, SET or PC for the rest
  const firstService = PRICE_SHEET.findIndex((s) => s.color === "service");
  const BY_KEY = {};
  PRICE_SHEET.forEach((section, i) => section.rows.forEach(([name, qty, srp]) => {
    const unit = qty === "PER FT" ? "FT" : /set/i.test(qty) ? "SET" : i < firstService ? "UNIT" : "PC";
    BY_KEY[key(name)] = { name, unit, srp };
  }));
  const ITEMS = Object.values(BY_KEY);

  const find = (text) => BY_KEY[key(text)];

  // Every word typed must appear in the name, e.g. "lg 1.5" or "copper 2.0"
  function search(text) {
    const words = String(text).toUpperCase().split(/\s+/).filter(Boolean);
    return words.length ? ITEMS.filter((p) => words.every((w) => p.name.toUpperCase().includes(w))) : [];
  }

  // Outdoor units (Job Order only, attach option { outdoor: true }): every brand has an OUTDOOR choice for each horsepower
  // it comes in, e.g. "MIDEA 1.0 HP (Outdoor)". They have no price (it is on the indoor unit).
  const OUT_BRANDS = ["AMERICAN HOME", "GREE", "MIDEA", "CARRIER", "TCL", "LG", "AUX", "KOLIN", "DAIKIN", "PANASONIC", "SAMSUNG", "HISENSE", "IFFALCON"];
  let OUTDOORS = null;
  function outdoors() {
    if (OUTDOORS) return OUTDOORS;
    OUTDOORS = [];
    OUT_BRANDS.forEach((brand) => {
      const re = new RegExp("(^|[^A-Z0-9])" + brand + "([^A-Z0-9]|$)");
      const hps = [...new Set(ITEMS.filter((p) => p.unit === "UNIT" && re.test(p.name.toUpperCase()))
        .map((p) => (p.name.toUpperCase().match(/(\d+(?:\.\d+)?)\s*HP\b/) || [])[1]).filter(Boolean).map(Number))].sort((a, b) => a - b);
      hps.forEach((h) => OUTDOORS.push({ name: `${brand} ${h.toFixed(1)} HP (Outdoor)`, unit: "UNIT", srp: 0, outdoor: true }));
    });
    return OUTDOORS;
  }

  // One shared list on the page, shown under whichever box is being typed in
  const box = document.createElement("div");
  box.className = "price-suggest";
  box.hidden = true;
  document.addEventListener("DOMContentLoaded", () => document.body.appendChild(box));

  let input = null, shown = [], index = -1, onPick = null, options = {};

  function hide() {
    box.hidden = true;
    input = null;
  }

  // opts.copperFor(input): ONE "COPPER TUBE" choice instead of every "ADDITIONAL COPPER TUBE FOR …HP UNIT".
  // It returns the Price List copper tube for that row (from the HP of the aircon above it, copper.js) or null;
  // that price per ft is shown and filled in. Without copperFor, every copper tube is listed as before (Job Order).
  const isCopper = (name) => /COPPER\s*TUBE/i.test(name) && !/CHIPPING/i.test(name);
  function oneCopper(list, target) {
    if (!options.copperFor || !list.some((p) => isCopper(p.name))) return list;
    const forRow = options.copperFor(target) || null;
    const one = { name: "COPPER TUBE", unit: "FT", srp: forRow ? forRow.srp : 0, copper: true, forRow };
    return [one, ...list.filter((p) => !isCopper(p.name))];
  }

  function show(target, pick, opts) {
    options = opts || {};
    shown = oneCopper(search(target.value), target).slice(0, 8);
    if (options.outdoor) {
      // The brand's models first, then its OUTDOOR choices; typing "outdoor" lists only the outdoor ones
      const words = String(target.value).toUpperCase().split(/\s+/).filter(Boolean);
      const outs = words.length ? outdoors().filter((p) => words.every((w) => p.name.toUpperCase().includes(w))) : [];
      const onlyOut = words.some((w) => "OUTDOOR".startsWith(w) && w.length >= 3);
      shown = onlyOut ? outs.slice(0, 12) : [...shown.slice(0, outs.length ? 6 : 8), ...outs.slice(0, 4)];
    }
    if (!shown.length || (shown.length === 1 && shown[0].name === target.value)) return hide();
    input = target;
    onPick = pick;
    index = -1;
    box.innerHTML = shown.map((p, i) => `
      <button type="button" data-i="${i}">
        <span>${esc(p.name)}</span>
        <b>${p.outdoor ? "outdoor · no price" : p.copper && !p.forRow ? "price by the aircon's HP" : `₱${money(p.srp)}${p.unit === "FT" ? " / ft" : ""}`}</b>
      </button>`).join("");
    const r = target.getBoundingClientRect();
    box.style.left = r.left + window.scrollX + "px";
    box.style.top = r.bottom + window.scrollY + 2 + "px";
    box.style.minWidth = Math.max(r.width, 420) + "px";
    box.hidden = false;
  }

  function highlight(i) {
    index = (i + shown.length) % shown.length;
    [...box.children].forEach((b, n) => b.classList.toggle("on", n === index));
    box.children[index].scrollIntoView({ block: "nearest" });
  }

  function choose(i) {
    const target = input, item = shown[i];
    hide();
    // The one copper choice: the copper tube for that row's HP (its name and price), or just "COPPER TUBE"
    const picked = item.copper ? item.forRow || { name: "COPPER TUBE", unit: "FT", srp: 0 } : item;
    target.value = picked.name;
    onPick(target, picked);
  }

  // mousedown (not click) so the box keeps its focus until the item is picked
  box.addEventListener("mousedown", (e) => {
    const b = e.target.closest("button");
    if (!b) return;
    e.preventDefault();
    choose(+b.dataset.i);
  });
  window.addEventListener("resize", hide);
  document.addEventListener("scroll", hide, true);

  // Typing shows suggestions; an exact name (typed or picked) calls pick(input, item)
  function attach(container, selector, pick, opts) {
    container.addEventListener("input", (e) => {
      if (!e.target.matches(selector)) return;
      const item = find(e.target.value);
      if (item) pick(e.target, item);
      show(e.target, pick, opts);
    });
    container.addEventListener("keydown", (e) => {
      if (!e.target.matches(selector) || box.hidden) return;
      if (e.key === "ArrowDown") { e.preventDefault(); e.stopPropagation(); highlight(index + 1); }
      else if (e.key === "ArrowUp") { e.preventDefault(); e.stopPropagation(); highlight(index - 1); }
      else if (e.key === "Enter" && index >= 0) { e.preventDefault(); e.stopPropagation(); choose(index); }
      else if (e.key === "Escape") hide();
    }, true);
    container.addEventListener("focusout", (e) => { if (e.target === input) setTimeout(hide, 100); });
  }

  return { attach, find, items: ITEMS };
})();
