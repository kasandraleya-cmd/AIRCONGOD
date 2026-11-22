// TIME CLOCK rules, shared by the Time Clock page (timeclock.html), the Dashboard (My time in) and
// Payroll (Late deduction). Taps are saved in the database table time_taps (supabase/time_clock.sql);
// their time comes from the database server, in Philippine time.
//
//   * The FIRST tap of the day = time in, the LAST tap of the day = time out.
//   * Work starts at 8:00 AM with a 10-minute grace: up to 8:10 = on time.
//   * Late = every full minute after 8:10: 8:10 = on time, 8:11 = 1 min, 8:15 = 5 min, 8:30 = 20 min.
//   * Each late minute is deducted from the pay: ₱2 per minute (8:15 = ₱10).
//   * Taps within 1 minute of the person's last tap are ignored (a card tapped twice by mistake).
const TimeClock = (function () {
  const START = "08:00";        // work starts at 8:00 AM
  const PER_MINUTE = 2;         // ₱2 deducted per late minute
  const GRACE_MINUTES = 10;     // up to 8:10 still counts as on time; late minutes are counted from 8:10
  const DOUBLE_TAP_SECONDS = 60;
  const TZ = "Asia/Manila";

  const pad = (n) => String(n).padStart(2, "0");
  const startMin = (() => { const [h, m] = START.split(":").map(Number); return h * 60 + m; })();
  const peso = (n) => "₱" + (Math.round((+n || 0) * 100) / 100).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

  // A moment in Philippine time: { date: "2026-11-15", minutes: 487 (= 8:07), seconds }
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false });
  function local(iso) {
    const p = Object.fromEntries(fmt.formatToParts(new Date(iso)).map((x) => [x.type, x.value]));
    const h = +p.hour % 24;
    return { date: `${p.year}-${p.month}-${p.day}`, minutes: h * 60 + +p.minute, seconds: +p.second };
  }
  const timeText = (iso) => (iso ? new Date(iso).toLocaleTimeString("en-PH", { timeZone: TZ, hour: "numeric", minute: "2-digit" }) : "—");
  const today = () => local(new Date().toISOString()).date;

  // Minutes late for a time in, counted from the end of the grace (8:10): 8:11 = 1, 0 when on time
  function lateMinutes(iso) {
    const l = local(iso);
    return Math.max(0, l.minutes - startMin - GRACE_MINUTES);
  }

  // "8:10 AM": the last minute that still counts as on time
  const clockText = (min) => new Date(2000, 0, 1, Math.floor(min / 60), min % 60).toLocaleTimeString("en-PH", { hour: "numeric", minute: "2-digit" });
  const START_TEXT = clockText(startMin);
  const ON_TIME_UNTIL = clockText(startMin + GRACE_MINUTES);
  // The rule in words, shown on the Time Clock pages and the Dashboard
  const ruleText = () => `Work starts at ${START_TEXT}; tapping in up to ${ON_TIME_UNTIL} is on time. After that, every minute late is ${peso(PER_MINUTE)}, taken off the pay.`;

  // taps (rows from time_taps) → { staffId: { "2026-11-15": { in, out, lateMin, deduction, taps } } }
  function days(taps) {
    const out = {};
    [...(taps || [])].sort((a, b) => String(a.tapped_at).localeCompare(String(b.tapped_at))).forEach((t) => {
      const d = local(t.tapped_at).date;
      const who = out[t.staff_id] || (out[t.staff_id] = {});
      const day = who[d] || (who[d] = { date: d, in: t.tapped_at, out: null, taps: 0 });
      day.taps += 1;
      if (t.tapped_at !== day.in) day.out = t.tapped_at;
    });
    Object.values(out).forEach((who) => Object.values(who).forEach((day) => {
      day.lateMin = lateMinutes(day.in);
      day.deduction = day.lateMin * PER_MINUTE;
    }));
    return out;
  }

  // One person's totals for some days: { days, lateDays, lateMin, deduction }
  function summary(byDate) {
    const list = Object.values(byDate || {});
    const lateMin = list.reduce((x, d) => x + d.lateMin, 0);
    return { days: list.length, lateDays: list.filter((d) => d.lateMin > 0).length, lateMin, deduction: lateMin * PER_MINUTE };
  }

  // Taps from…to (YYYY-MM-DD, Philippine dates). staffId: only that person's (the database also limits
  // staff to their own). → { taps } or { error, missing }
  async function load(from, to, staffId) {
    await (window.cloudReady || Promise.resolve());
    if (!window.cloud) return { error: "The online database isn't connected." };
    let all = [];
    for (let page = 0; page < 20; page++) {
      let q = window.cloud.from("time_taps").select("id,staff_id,card,tapped_at")
        .gte("tapped_at", `${from}T00:00:00+08:00`).lte("tapped_at", `${to}T23:59:59.999+08:00`)
        .order("tapped_at").range(page * 1000, page * 1000 + 999);
      if (staffId != null) q = q.eq("staff_id", String(staffId));
      const { data, error } = await q;
      if (error) return { error: error.message, missing: /schema cache|does not exist|PGRST205|could not find/i.test(error.message + error.code) };
      all = all.concat(data || []);
      if (!data || data.length < 1000) break;
    }
    return { taps: all };
  }

  // The "My time in" table for the Dashboard: one row per day of the month
  function panelHtml(byDate, monthLabel) {
    const list = Object.values(byDate || {}).sort((a, b) => a.date.localeCompare(b.date));
    const s = summary(byDate);
    const nice = (d) => new Date(d + "T00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", weekday: "short" });
    return `
      <div class="tc-stats">
        <div><b>${s.days}</b><span>Days timed in</span></div>
        <div class="${s.lateDays ? "bad" : ""}"><b>${s.lateDays}</b><span>Days late</span></div>
        <div class="${s.lateMin ? "bad" : ""}"><b>${s.lateMin}</b><span>Minutes late</span></div>
        <div class="${s.deduction ? "bad" : ""}"><b>${peso(s.deduction)}</b><span>Late deduction</span></div>
      </div>
      <div class="at-table-wrap"><table class="at-table">
        <thead><tr><th>Date</th><th>Time in</th><th>Time out</th><th class="num">Late</th><th class="num">Deduction</th></tr></thead>
        <tbody>${list.length ? list.map((d) => `<tr>
          <td class="at-day">${esc(nice(d.date))}</td>
          <td><b>${esc(timeText(d.in))}</b></td>
          <td>${esc(d.out ? timeText(d.out) : "—")}</td>
          <td class="num">${d.lateMin ? `<span class="tc-late">${d.lateMin} min</span>` : '<span class="tc-ok">On time</span>'}</td>
          <td class="num">${d.deduction ? peso(d.deduction) : "—"}</td></tr>`).join("")
          : `<tr><td colspan="5" class="at-none">No card taps in ${esc(monthLabel || "this month")} yet.</td></tr>`}
        </tbody>
        ${s.deduction ? `<tfoot><tr class="at-total"><td colspan="3">Late deduction (${s.lateMin} min × ${peso(PER_MINUTE)})</td><td colspan="2" class="num">− ${peso(s.deduction)}</td></tr></tfoot>` : ""}
      </table></div>`;
  }

  return { START, START_TEXT, ON_TIME_UNTIL, ruleText, PER_MINUTE, GRACE_MINUTES, DOUBLE_TAP_SECONDS, TZ, local, today, timeText, lateMinutes, days, summary, load, panelHtml, peso };
})();
