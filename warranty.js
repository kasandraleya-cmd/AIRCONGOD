// Warranty per aircon model series, copied from the EJ Cooling Care product sheets.
// The Warranty page uses it to fill in the WARRANTY box for the units on the quotation.
//
// To add or change a series: add a line below. "match" lists words that must ALL be in the item
// description (or any one of the model "codes": text or a pattern), e.g. "LG PREMIUM IPX3 DUAL SPLIT TYPE INVERTER 1.5 HP".
const WARRANTY = (function () {
  const P = "1 Year Parts and Labor";
  const PCB = "3 Years PCB Board";
  const R = "7 Days Replacement";
  const C = (years) => `${years} Years Compressor`;
  const GP = "3 Years Parts";     // Gree
  const GS = "1 Year Service";    // Gree

  const SERIES = [
    { name: "Carrier Aura Full DC Inverter",          match: ["CARRIER", "AURA"],      codes: ["53CEP"],         terms: [P, C(10), PCB, R] },
    { name: "Carrier Nexus Full DC Inverter",         match: ["CARRIER", "NEXUS"],     codes: ["53CEA"],         terms: [P, C(10), PCB, R] },
    { name: "Daikin D-Smart Amihan",                  match: ["DAIKIN", "AMIHAN"],     codes: ["FTKE"],          terms: [P, C(5), PCB, R] },
    { name: "Daikin D-Smart King Series",             match: ["DAIKIN", "KING"],       codes: ["FTKZ"],          terms: [P, C(5), PCB, R] },
    { name: "Daikin D-Smart Queen Series",            match: ["DAIKIN", "QUEEN"],      codes: ["FTKC"],          terms: [P, C(5), PCB, R] },
    { name: "Daikin D-Smart Series",                  match: ["DAIKIN", "D-SMART"],    codes: ["FTKQ"],          terms: [P, C(5), PCB, R] },
    { name: "Hisense Wall Mounted Inverter",          match: ["HISENSE"],              codes: ["TR5RCB"],        terms: [P, C(10), PCB, R] },
    { name: "LG Deluxe APX3 Dual Inverter",           match: ["LG", "APX3"],           codes: ["APX3"],                terms: [P, C(10), R] },
    { name: "LG Dual Inverter ISB Model",             match: ["LG", "ISB"],            codes: [/HS-?\d+\/?ISB/], terms: [P, C(10), R] },
    { name: "LG Premium IPX3 Inverter",               match: ["LG", "IPX3"],           codes: ["IPX3"],                terms: [P, C(10), R] },
    { name: "Midea Avigator Full DC Inverter",        match: ["MIDEA", "AVIGATOR"],    codes: ["MSAI"],          terms: [P, C(10), PCB, R] },
    { name: "Midea Celest Pro Full DC Inverter",      match: ["MIDEA", "CELEST"],      codes: ["MSCE"],          terms: [P, C(10), PCB, R] },
    { name: "Midea Numen Pro Full DC Inverter",       match: ["MIDEA", "NUMEN"],       codes: ["MSNE"],          terms: [P, C(10), PCB, R] },
    { name: "Panasonic Basic Inverter",               match: ["PANASONIC", "BASIC"],   codes: [/PU-?\d*AKQ/], terms: [P, C(12), R] },
    { name: "Panasonic Deluxe Inverter",              match: ["PANASONIC", "DELUXE"],  codes: [/RU-?\d*AKQ/], terms: [P, C(12), R] },
    { name: "Panasonic Premium Inverter",             match: ["PANASONIC", "PREMIUM"], codes: [/XU-?\d*AKQ/], terms: [P, C(12), R] },
    { name: "TCL CoolPro Obsidian",                   match: ["TCL", "OBSIDIAN"],      codes: ["CSA/BEI", "CSA-BEI"], terms: [P, C(10), R] },
    { name: "TCL Voxin Air Inverter",                 match: ["TCL", "VOXIN"],         codes: ["CSD/WEI", "CSD-WEI"], terms: [P, C(10), R] },
    { name: "TCL BreezeIn + WiFi Inverter",           match: ["TCL", "BREEZE"],        codes: ["BR-CSV", "CSV/TA"],   terms: [P, C(10), R] },
    { name: "TCL FreshIN 3.0 Inverter",               match: ["TCL", "FRESH"],         codes: ["CSD/P7"],        terms: [P, C(10), R] },
    { name: "TCL KEI2 Split Type Inverter",           match: ["TCL", "KEI2"],          codes: ["KEI2"],          terms: [P, C(10), R] },
    { name: "TCL iFFALCON Split Type Inverter",       match: ["IFFALCON"],             codes: ["IFAC"],          terms: [P, C(10), R] },
    { name: "American Home Full DC Inverter",         match: ["AMERICAN", "HOME"],     codes: ["AHAC", /MINV\d+EHW/], terms: [P, C(5), R] },
    { name: "AUX FLDI Series Inverter",               match: ["AUX", "FLDI"],          codes: ["FLDI"],          terms: [P, C(10), R] },
    { name: "AUX QCDI Series Inverter",               match: ["AUX", "QCDI"],          codes: ["QCDI"],          terms: [P, C(10), R] },   // also "QQCDI"
    { name: "Gree Crysta Series Inverter",            match: ["GREE", "CRYSTA"],       codes: ["6DR"],           terms: [GP, C(12), GS] },
    { name: "Gree Full DC Inverter",                  match: ["GREE", "FULL", "DC"],   codes: ["6DCR"],          terms: [GP, C(12), GS] },
    { name: "Gree Zephyr Non-Inverter",               match: ["GREE", "ZEPHYR"],       codes: ["6NR"],           terms: [GP, C(12), GS] },
    { name: "Kolin Certus AI Inverter",               match: ["KOLIN", "CERTUS"],      codes: ["KSM-IW", "WCT"], terms: [P, C(10), R] },
    { name: "Kolin Primus Gold AI",                   match: ["KOLIN", "PRIMUS"],      codes: ["KSG-IWF", "KSGIWF", "WFY8K1M32"], terms: [P, C(10), R] },
    { name: "Samsung WindFree Bespoke Midnight Black", match: ["SAMSUNG", "BESPOKE"],  codes: ["CYECABTN"],      terms: [P, C(10), R] },
    { name: "Samsung WindFree Premium Inverter",      match: ["SAMSUNG", "WINDFREE", "PREMIUM"], codes: ["CYEAAWKN"], terms: [P, C(10), R] },
    { name: "Samsung Standard Split Type",            match: ["SAMSUNG", "BASIC"],     also: [["SAMSUNG", "STANDARD"]], codes: ["TYHYEWKN"], terms: [P, C(10), R] },
  ];

  // The series of one item description, or undefined (materials, services, or a series not listed)
  function find(desc) {
    const text = String(desc || "").toUpperCase().replace(/\s+/g, " ");
    const squashed = text.replace(/\s+/g, "");
    if (!text.trim()) return;
    return SERIES.find((s) => s.codes.some((c) => (c instanceof RegExp ? c.test(squashed) : squashed.includes(c))))
      || SERIES.find((s) => [s.match, ...(s.also || [])].some((words) =>
        words.every((w) => new RegExp(`(^|[^A-Z0-9])${w.replace(/[-]/g, "\\-")}`).test(text))));
  }

  // The different warranties for a list of item descriptions, in order: [{ name, terms }]
  function forItems(descs) {
    const seen = new Set();
    const out = [];
    descs.forEach((d) => {
      const s = find(d);
      if (s && !seen.has(s.name)) { seen.add(s.name); out.push(s); }
    });
    return out;
  }

  return { SERIES, find, forItems };
})();
