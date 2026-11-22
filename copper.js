// COPPER TUBE: the first 10 ft are FREE; only the feet over 10 are charged.
// On the quotations a copper tube row is written like the office's own quotations:
//   COPPER TUBE 35FT. - 10FT. FREE = 25FT. EXCESS     QUANTITY 25 · ft. · price per ft · total of the 25 ft
//   COPPER TUBE 10FT. - 10FT. FREE = FREE              no quantity · total 0.00
// Picking a copper tube from the Price List writes "COPPER TUBE 10FT. - 10FT. FREE = FREE" with the 10 highlighted.
// Both numbers are editable: changing the length in the description (10 → 35) sets QUANTITY to the excess (25),
// and changing QUANTITY (the excess) rewrites the length in the description. The total is QUANTITY × price per ft.
// The price per ft stays the one from the Price List (it depends on the HP: 1.0HP ₱420, 2.0HP ₱500…).
// Used by the Warranty quotation (aftersales.html), the Formal Quotation (formalquotation.html) and
// Ocular survey → quotation (ocular.js).
const Copper = (function () {
  const FREE = 10;
  const n = (v) => Math.round((parseFloat(String(v ?? "").replace(/[^0-9.]/g, "")) || 0) * 100) / 100;
  // A copper tube line (not chipping works for copper pipes)
  const isItem = (d) => /COPPER\s*TUBE/i.test(String(d || "")) && !/CHIPPING/i.test(String(d || ""));
  // "COPPER TUBE 35FT. - 10FT. FREE = …" → 35 (also the older "… — 35FT - 10FT FREE …" note); otherwise null
  // Typed the short way works too: "copper tube 20ft", "copper tube 20", "COPPER TUBE 20FT." → 20
  // (not "COPPER TUBE FOR 1.0HP UNIT": a number right after COPPER TUBE that isn't an HP)
  function lengthOf(d) {
    const s = String(d || "");
    const m = s.match(/COPPER\s*TUBE\s+(\d+(?:\.\d+)?)\s*FT\.?\s*-\s*10\s*FT\.?\s*FREE/i) || s.match(/\s—\s(\d+(?:\.\d+)?)\s*FT\b/i)
      || s.match(/^\s*COPPER\s*TUBE\s+(\d+(?:\.\d+)?)\s*(?:FT\.?|FEET|FOOT|')?\s*$/i);
    return m ? +m[1] : null;
  }
  // The Price List copper tube for the aircon above it: the nearest unit row before it with an HP
  // ("… 2.0 HP" → "ADDITIONAL COPPER TUBE FOR 2.0HP UNIT"), for its price per ft. descsAbove: descriptions, nearest last.
  function priceItemFor(descsAbove) {
    for (let i = descsAbove.length - 1; i >= 0; i--) {
      const d = String(descsAbove[i] || "");
      if (isItem(d)) continue;
      const hp = d.match(/(\d+(?:\.\d+)?)\s*HP\b/i);
      if (!hp) continue;
      const name = `ADDITIONAL COPPER TUBE FOR ${(+hp[1]).toFixed(1)}HP UNIT`;
      const floor = /FLOOR/i.test(d) ? `FLOOR MOUNTED ${name}` : "";
      const find = (n) => (typeof PricePicker !== "undefined" ? PricePicker.find(n) : null);
      return find(floor) || find(name) || null;
    }
    return null;
  }
  const isWritten = (d) => lengthOf(d) !== null;
  // The excess written after "FREE =": "… FREE = 15FT. EXCESS" or "… FREE = 15" → 15; "… FREE = FREE" → 0; none → null
  function excessOf(d) {
    const m = String(d || "").match(/FREE\s*=\s*(\d+(?:\.\d+)?|FREE)/i);
    return !m ? null : /FREE/i.test(m[1]) ? 0 : +m[1];
  }
  // Both feet numbers in the description are editable. Which one was changed?
  //   before: the whole length when the person started editing (null if not known)
  //   the whole length changed (10 → 20)      → that length
  //   only the excess changed (FREE → 15)     → excess + 10 (= 25)
  function resolve(d, before) {
    const len = lengthOf(d), ex = excessOf(d);
    if (len === null) return null;
    const fits = ex === null || Math.abs(Math.max(0, len - FREE) - ex) < 0.001;
    if (fits) return len;
    if (before !== null && before !== undefined && Math.abs(len - before) < 0.001) return ex + FREE;   // only the excess was changed
    return len;   // the whole length was changed (the old excess is just left over)
  }
  // The row for a whole length: { d: description, q: excess feet ("" when it's all free) }
  function write(length) {
    const len = n(length), ex = Math.round(Math.max(0, len - FREE) * 100) / 100;
    return { d: `COPPER TUBE ${len}FT. - ${FREE}FT. FREE = ${ex > 0 ? ex + "FT. EXCESS" : "FREE"}`, q: ex > 0 ? String(ex) : "" };
  }
  // QUANTITY (the excess) changed → the whole length is excess + 10 (no excess: keep a length of 10 or less)
  const fromExcess = (q, oldLen) => (n(q) > 0 ? write(n(q) + FREE) : write(oldLen && oldLen <= FREE ? oldLen : FREE));
  // Ask for the whole length (used when a copper tube is picked or typed); null when cancelled
  function ask(suggest) {
    const a = prompt("Total copper tube length (ft)?\nThe first 10 ft are free; only the excess is charged.", suggest || "");
    if (a === null || !String(a).trim()) return null;
    return n(a) > 0 ? n(a) : null;
  }
  return { FREE, isItem, lengthOf, excessOf, resolve, isWritten, write, fromExcess, ask, priceItemFor };
})();
