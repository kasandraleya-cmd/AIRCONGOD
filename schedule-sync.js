// CANCEL SYNC between the Daily Schedule (aircon_daily) and the Weekly Schedule (aircon_schedule).
//
// The same customer on the same day (matched by NAME, ignoring capitals and extra spaces):
//   * Daily → Weekly: when EVERY Daily row of that customer that day is CANCELLED (a customer with several
//     units / brands: all of them), their Weekly slot that day becomes "Cancel". Un-cancelling a Daily row
//     puts a cancelled Weekly slot back to "Booked".
//   * Weekly → Daily: setting a Weekly slot to "Cancel" makes all that customer's Daily rows that day
//     CANCELLED. Changing it back from Cancel puts those rows back to WAITING.
// Loaded by dailysched.html and schedule.html. Saving through localStorage lets cloud.js save it online.
const ScheduleSync = (function () {
  const DAILY = "aircon_daily", WEEKLY = "aircon_schedule";
  const norm = (t) => String(t ?? "").trim().replace(/\s+/g, " ").toUpperCase();
  const read = (k) => { try { return JSON.parse(localStorage.getItem(k) || "{}") || {}; } catch (e) { return {}; } };
  const rowsOf = (dayData, name) => {
    const out = [];
    ((dayData && dayData.groups) || []).forEach((g) => (g.rows || []).forEach((r) => { if (norm(r.name) && norm(r.name) === norm(name)) out.push(r); }));
    return out;
  };

  // Daily changed for this customer on this date → update their Weekly slot(s). Returns how many changed.
  function fromDaily(date, name) {
    if (!date || !norm(name)) return 0;
    const rows = rowsOf(read(DAILY)[date], name);
    if (!rows.length) return 0;
    const allCancelled = rows.every((r) => String(r.status || "").toUpperCase() === "CANCELLED");
    const weekly = read(WEEKLY);
    let n = 0;
    Object.entries(weekly).forEach(([key, e]) => {
      if (!key.startsWith(date + "|") || !e || norm(e.client) !== norm(name)) return;
      if (allCancelled && e.status !== "cancel") { e.status = "cancel"; n++; }
      else if (!allCancelled && e.status === "cancel") { e.status = ""; n++; }   // back to Booked
    });
    if (n) localStorage.setItem(WEEKLY, JSON.stringify(weekly));
    return n;
  }

  // Weekly slot changed to / from Cancel → update that customer's Daily rows. Returns how many changed.
  function fromWeekly(date, name, cancelled) {
    if (!date || !norm(name)) return 0;
    const daily = read(DAILY);
    const rows = rowsOf(daily[date], name);
    let n = 0;
    rows.forEach((r) => {
      const st = String(r.status || "").toUpperCase();
      if (cancelled && st !== "CANCELLED") { r.status = "CANCELLED"; n++; }
      else if (!cancelled && st === "CANCELLED") { r.status = "WAITING"; n++; }
    });
    if (n) localStorage.setItem(DAILY, JSON.stringify(daily));
    return n;
  }

  return { fromDaily, fromWeekly, norm };
})();
