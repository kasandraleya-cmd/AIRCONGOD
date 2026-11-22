// DATE-RANGE PICKER: quick choices on the left (Today, Last 7 days, This month…), two months of
// calendar on the right (click the first day, then the last day), and Cancel / Apply at the bottom.
// Dates are the Philippines' local dates (YYYY-MM-DD).
//
//   DateRange.open({
//     anchor: button,                 // the picker opens under this
//     from: "2026-11-01", to: "2026-11-30", preset: "This month",
//     min: "2026-01-05",              // optional: where "All dates" starts
//     onApply: ({ from, to, preset }) => { ... },
//   });
const DateRange = (function () {
  const pad = (n) => String(n).padStart(2, "0");
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const parse = (s) => { const [y, m, d] = String(s).split("-").map(Number); return new Date(y, m - 1, d); };
  const add = (s, n) => { const d = parse(s); return ymd(new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)); };
  const nice = (s) => (s ? parse(s).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "");
  const monthName = (d) => d.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  // The quick choices. A week is Monday to Sunday (the same pay week as Payroll).
  function presets(min) {
    const t = ymd(new Date()), d = parse(t);
    const monday = add(t, -((d.getDay() + 6) % 7));
    const first = ymd(new Date(d.getFullYear(), d.getMonth(), 1)), last = ymd(new Date(d.getFullYear(), d.getMonth() + 1, 0));
    const pFirst = ymd(new Date(d.getFullYear(), d.getMonth() - 1, 1)), pLast = ymd(new Date(d.getFullYear(), d.getMonth(), 0));
    return [
      ["Today", t, t], ["Yesterday", add(t, -1), add(t, -1)],
      ["This week", monday, add(monday, 6)], ["Last week", add(monday, -7), add(monday, -1)],
      ["Last 7 days", add(t, -6), t], ["Last 14 days", add(t, -13), t], ["Last 30 days", add(t, -29), t],
      ["This month", first, last], ["Last month", pFirst, pLast],
      ...(min ? [["All dates", min, t]] : []),
    ];
  }

  // Everything is scoped under .dr so the site's general input / select / label styles don't change it
  function styles() {
    if (document.getElementById("drStyle")) return;
    const s = document.createElement("style");
    s.id = "drStyle";
    s.textContent = `
      .dr-back { position: fixed; inset: 0; z-index: 2500; }
      .dr { position: absolute; display: flex; max-width: calc(100vw - 16px); border: 1px solid #d9e1e5; border-radius: 12px; background: #fff;
        color: #1f2d3d; box-shadow: 0 10px 30px rgba(7, 29, 73, .16); font-size: 13.5px; line-height: 1.3; overflow: hidden; }
      .dr button { font: inherit; color: inherit; margin: 0; }
      .dr-side { display: flex; flex-direction: column; width: 150px; flex-shrink: 0; padding: 8px; border-right: 1px solid #edf1f3; background: #f8fafb; }
      .dr-side button { padding: 7px 10px; border: 0; border-radius: 7px; background: none; text-align: left; cursor: pointer; white-space: nowrap; }
      .dr-side button:hover { background: #eef2f6; }
      .dr-side button.on { background: #071d49; color: #fff; font-weight: 600; }
      .dr-body { display: flex; flex-direction: column; padding: 14px 16px 14px; }
      .dr-months { display: flex; gap: 22px; }
      .dr-month { width: 224px; }
      .dr-month-h { display: flex; align-items: center; justify-content: space-between; height: 30px; margin-bottom: 6px; }
      .dr-month-h b { flex: 1; text-align: center; font-size: 14px; font-weight: 700; color: #071d49; }
      .dr-arrow { width: 30px; height: 30px; padding: 0; border: 0; border-radius: 7px; background: none; color: #071d49; cursor: pointer; }
      .dr-arrow:hover { background: #eef2f6; }
      .dr-arrow.ghost { visibility: hidden; }
      .dr-grid { display: grid; grid-template-columns: repeat(7, 32px); row-gap: 2px; }
      .dr-grid .wd { display: grid; place-items: center; height: 26px; color: #8a97a3; font-size: 11.5px; font-weight: 600; }
      .dr-grid button { height: 32px; padding: 0; border: 0; background: none; cursor: pointer; font-size: 13px; }
      .dr-grid button:hover { background: #eef2f6; border-radius: 7px; }
      .dr-grid button.today { font-weight: 700; color: #b8860b; }
      .dr-grid button.in { background: #e8eef8; border-radius: 0; }
      .dr-grid button.start, .dr-grid button.end { background: #071d49; color: #fff; font-weight: 600; }
      .dr-grid button.start { border-radius: 7px 0 0 7px; } .dr-grid button.end { border-radius: 0 7px 7px 0; }
      .dr-grid button.start.end { border-radius: 7px; }
      .dr-grid button.later { color: #9aa6b1; }
      .dr-foot { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-top: 12px; padding-top: 12px; border-top: 1px solid #edf1f3; }
      .dr-sel { color: #475569; }
      .dr-sel b { color: #071d49; }
      .dr-sel em { color: #b8860b; font-style: normal; }
      .dr-acts { display: flex; gap: 8px; }
      .dr-btn { padding: 8px 14px; border: 1px solid #d9e1e5; border-radius: 8px; background: #fff; font-weight: 600; cursor: pointer; }
      .dr-btn:hover { background: #f4f6f8; }
      .dr-btn.go { border-color: #071d49; background: #071d49; color: #fff; }
      .dr-btn.go:hover { background: #0c2a63; }
      .dr-btn:disabled { opacity: .45; cursor: default; }
      @media (max-width: 720px) {
        .dr { position: fixed; left: 8px !important; right: 8px; top: auto !important; bottom: 8px; flex-direction: column; max-height: calc(100vh - 16px); overflow-y: auto; }
        .dr-side { width: auto; flex-direction: row; flex-wrap: wrap; gap: 4px; border-right: 0; border-bottom: 1px solid #edf1f3; }
        .dr-side button { padding: 6px 10px; border: 1px solid #d9e1e5; background: #fff; }
        .dr-months { justify-content: center; } .dr-month + .dr-month { display: none; }
        .dr-grid { grid-template-columns: repeat(7, 1fr); } .dr-month { width: 100%; max-width: 320px; }
        .dr-foot { flex-direction: column; align-items: stretch; } .dr-acts .dr-btn { flex: 1; }
      }`;
    document.head.appendChild(s);
  }

  function open(opts) {
    styles();
    const today = ymd(new Date());
    const list = presets(opts.min);
    let from = opts.from || today, to = opts.to || from, preset = opts.preset || "";
    let picking = null;   // after the first click: waiting for the last day
    // The months shown: the one before the last day, and the last day's month
    const end = parse(to);
    let view = new Date(end.getFullYear(), end.getMonth() - 1, 1);
    const phone = () => innerWidth <= 720;

    const back = document.createElement("div");
    back.className = "dr-back";
    const pop = document.createElement("div");
    pop.className = "dr";
    pop.setAttribute("role", "dialog");
    pop.setAttribute("aria-label", "Choose dates");
    back.appendChild(pop);
    document.body.appendChild(back);

    // both: one month on its own (phones), with ‹ and ›
    const monthHtml = (first, isLeft, both = false) => {
      const y = first.getFullYear(), m = first.getMonth();
      let cells = ["Su", "Mo", "Tu", "We", "Th", "Fr", "Sa"].map((d) => `<span class="wd">${d}</span>`).join("");
      for (let i = 0; i < first.getDay(); i++) cells += "<span></span>";
      const days = new Date(y, m + 1, 0).getDate();
      const lo = picking || from, hi = picking || to;
      for (let d = 1; d <= days; d++) {
        const s = ymd(new Date(y, m, d));
        const cls = [s === today ? "today" : "", s > lo && s < hi ? "in" : "", s === lo ? "start" : "", s === hi ? "end" : "", s > today ? "later" : ""]
          .filter(Boolean).join(" ");
        cells += `<button type="button" data-day="${s}" class="${cls}" aria-label="${nice(s)}">${d}</button>`;
      }
      // Left month: ‹ on its left; right month: › on its right (on phones the one month has both)
      return `<div class="dr-month">
        <div class="dr-month-h">
          <button type="button" class="dr-arrow${isLeft || both ? "" : " ghost"}" data-nav="-1" aria-label="Earlier month"><i class="fas fa-chevron-left"></i></button>
          <b>${monthName(first)}</b>
          <button type="button" class="dr-arrow${isLeft && !both ? " ghost" : ""}" data-nav="1" aria-label="Later month"><i class="fas fa-chevron-right"></i></button>
        </div>
        <div class="dr-grid">${cells}</div></div>`;
    };

    function draw() {
      const second = new Date(view.getFullYear(), view.getMonth() + 1, 1);
      const days = Math.round((parse(to) - parse(from)) / 864e5) + 1;
      pop.innerHTML = `
        <div class="dr-side">${list.map(([name]) => `<button type="button" data-preset="${name}" class="${name === preset ? "on" : ""}">${name}</button>`).join("")}</div>
        <div class="dr-body">
          <div class="dr-months">${phone() ? monthHtml(second, true, true) : monthHtml(view, true) + monthHtml(second, false)}</div>
          <div class="dr-foot">
            <div class="dr-sel">${picking ? `<b>${nice(picking)}</b> – <em>now pick the last day</em>`
              : `<b>${nice(from)}</b>${from === to ? "" : ` – <b>${nice(to)}</b>`} · ${days} day${days === 1 ? "" : "s"}`}</div>
            <div class="dr-acts"><button type="button" class="dr-btn" data-cancel>Cancel</button><button type="button" class="dr-btn go" data-apply${picking ? " disabled" : ""}>Apply</button></div>
          </div>
        </div>`;
      place();
    }
    function place() {
      if (phone() || !opts.anchor) return;
      const r = opts.anchor.getBoundingClientRect(), w = pop.offsetWidth, h = pop.offsetHeight;
      const left = Math.max(8, Math.min(r.right - w, innerWidth - w - 8));
      let top = r.bottom + 6;
      if (top + h > innerHeight - 8) top = Math.max(8, r.top - h - 6);
      pop.style.left = left + "px";
      pop.style.top = top + "px";
    }
    const close = () => { back.remove(); removeEventListener("keydown", onKey); removeEventListener("resize", draw); };
    const onKey = (e) => { if (e.key === "Escape") close(); };
    addEventListener("keydown", onKey);
    addEventListener("resize", draw);

    back.addEventListener("click", (e) => { if (e.target === back) close(); });
    pop.addEventListener("click", (e) => {
      const p = e.target.closest("[data-preset]");
      if (p) {
        const hit = list.find(([n]) => n === p.dataset.preset);
        preset = hit[0]; from = hit[1]; to = hit[2]; picking = null;
        const t = parse(to); view = new Date(t.getFullYear(), t.getMonth() - 1, 1);
        return draw();
      }
      const nav = e.target.closest("[data-nav]");
      if (nav) { view = new Date(view.getFullYear(), view.getMonth() + +nav.dataset.nav, 1); return draw(); }
      const day = e.target.closest("[data-day]");
      if (day) {
        const s = day.dataset.day;
        preset = "";
        if (!picking) { picking = s; from = s; to = s; }
        else { [from, to] = s < picking ? [s, picking] : [picking, s]; picking = null; }
        // Dates that match a quick choice light it up again
        const same = list.find(([, f, t]) => f === from && t === to);
        if (!picking && same) preset = same[0];
        return draw();
      }
      if (e.target.closest("[data-cancel]")) return close();
      if (e.target.closest("[data-apply]") && !picking) {
        close();
        opts.onApply({ from, to, preset: preset || "Custom" });
      }
    });
    draw();
    (pop.querySelector(".dr-side .on") || pop.querySelector(".dr-side button")).focus();
  }

  // A ready-made "All dates / Every record" button for a records page (the same look as Warranty / Formal Records).
  //   const when = DateRange.filter({ dates: () => list.map((r) => r.date), onChange: draw, title: "…" });
  //   toolbar.appendChild(when.el);  …  rows.filter((r) => when.has(r.date))
  // dates: the YYYY-MM-DD dates of the records (where "All dates" starts). has(day) is true for every
  // day while no dates are picked; when.active tells whether some are.
  function filter(opts) {
    if (!document.getElementById("drBtnStyle")) {
      const s = document.createElement("style");
      s.id = "drBtnStyle";
      s.textContent = `
        .dr-pick { display: inline-flex; align-items: center; gap: 10px; min-width: 230px; height: 42px; padding: 0 12px; border: 1px solid #d9e1e5;
          border-radius: 10px; background: #fff; color: #071d49; font: inherit; font-weight: 700; text-align: left; cursor: pointer; flex-shrink: 0; }
        .dr-pick:hover { border-color: #b8c6cf; }
        .dr-pick > i:first-child { color: #0a66c2; }
        .dr-pick > span { flex: 1; display: flex; flex-direction: column; line-height: 1.15; }
        .dr-pick small { color: #65737e; font-size: 11.5px; font-weight: 600; }
        .dr-pick.on { border-color: #071d49; box-shadow: 0 0 0 1px #071d49 inset; }
        .dr-pick-x { margin-left: 2px; padding: 2px 4px; color: #94a3b8; }
        .dr-pick-x:hover { color: #b91c1c; }
        @media (max-width: 600px) { .dr-pick { width: 100%; } }`;
      document.head.appendChild(s);
    }
    let from = "", to = "", preset = "All dates";
    const el = document.createElement("button");
    el.type = "button";
    el.className = "dr-pick";
    el.title = opts.title || "Show only the records on these dates";
    const label = () => {
      const all = !from;
      el.classList.toggle("on", !all);
      el.innerHTML = `<i class="far fa-calendar-alt"></i><span><small>${all ? "All dates" : preset === "Custom" ? "Dates" : preset}</small>`
        + `<b>${all ? "Every record" : from === to ? nice(from) : `${nice(from)} – ${nice(to)}`}</b></span>`
        + (all ? `<i class="fas fa-caret-down"></i>` : `<i class="fas fa-times dr-pick-x" data-clear title="Show every date again"></i>`);
    };
    const api = {
      el,
      get active() { return !!from; },
      has: (day) => !from || (!!day && day >= from && day <= to),
      clear() { from = to = ""; preset = "All dates"; label(); opts.onChange && opts.onChange(); },
    };
    el.addEventListener("click", (e) => {
      if (e.target.closest("[data-clear]")) return api.clear();
      const t = ymd(new Date());
      const days = (opts.dates ? opts.dates() : []).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d || "")).sort();
      const min = days[0] && days[0] < t ? days[0] : t;
      open({ anchor: el, from: from || min, to: to || t, preset, min,
        onApply: (r) => {
          preset = r.preset;
          const all = r.preset === "All dates";
          from = all ? "" : r.from; to = all ? "" : r.to;
          label();
          opts.onChange && opts.onChange();
        } });
    });
    label();
    return api;
  }

  // A saved date or time (ISO text, a number, a Date) as the Philippines' local YYYY-MM-DD
  const day = (v) => {
    if (!v) return "";
    if (typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v;
    const d = new Date(v);
    return isNaN(d) ? "" : ymd(d);
  };

  return { open, presets, ymd, filter, day };
})();
