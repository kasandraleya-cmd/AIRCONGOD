// Attendance from the Daily Schedule (dailysched.html, saved under "aircon_daily").
//
// Picking a name in a crew dropdown on the Daily Schedule puts every job of that block (that day)
// on the person's attendance: who, when, client, location, unit and the job's status.
//   * Days present (araw ng pasok) = days with a DONE job, plus days up to today where they're on a
//     crew with a job that isn't CANCELLED or RESCHEDULED
//   * Units installed = the QTY of DONE jobs in INSTALLER blocks (blank QTY counts as 1, "-" as 0)
//   * Services done  = DONE jobs in SERVICE blocks
// Pay uses the Payroll rate the owner sets on the Staff page (daily / monthly / per job) plus one
// incentive per month the owner types on the person's sheet (supabase/attendance_pay.sql):
//   daily rate × days present · per-job rate × DONE jobs · monthly rate for the month
// Names are matched to the Staff page by nickname, full name or username (as the crew dropdown writes them).
const Attendance = (function () {
  const read = (k, d) => { try { return JSON.parse(localStorage.getItem(k) || d) || JSON.parse(d); } catch (e) { return JSON.parse(d); } };
  const norm = (t) => String(t || "").trim().toUpperCase().replace(/\s+/g, " ");
  const units = (q) => (q === "-" ? 0 : q === "" || q == null ? 1 : Math.max(0, parseInt(q, 10) || 0));
  const esc = (t) => String(t ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const peso = (n) => "₱" + (Math.round((+n || 0) * 100) / 100).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const pad = (n) => String(n).padStart(2, "0");
  const today = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const OFF = ["CANCELLED", "RESCHEDULED"];   // the crew didn't go: not a day present
  // PROJECT = YES on the Daily Schedule: the job still counts for attendance and units installed,
  // but its units are NOT counted toward the team incentive
  const isProject = (r) => String((r && r.project) || "").trim().toUpperCase() === "YES";

  // The names a staff member may appear as in a crew box
  const namesOf = (s) => [...new Set([s.nickname, s.name, s.username].map(norm).filter(Boolean))];

  // { "EMAR": [job, job, …], … } for every job (not empty rows) dated from…to (YYYY-MM-DD)
  function tally(from, to) {
    const out = {};
    const daily = read("aircon_daily", "{}");
    Object.keys(daily).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= from && d <= to).sort().forEach((date) => {
      ((daily[date] && daily[date].groups) || []).forEach((g, gi) => {
        const crew = String(g.crew || "").split("|").map(norm).filter(Boolean);
        if (!crew.length) return;
        (g.rows || []).forEach((r, ri) => {
          if (!String(r.name || "").trim() && !r.model) return;   // an empty row
          const status = String(r.status || "").toUpperCase() || "WAITING";
          const service = g.kind === "service";
          const job = {
            id: `${date}#${gi}#${ri}`, date, service, status, done: status === "DONE",
            // DONE always counts (so its rate applies right away); otherwise only days up to today
            present: status === "DONE" || (!OFF.includes(status) && date <= today()),
            client: String(r.name || "").trim(), location: String(r.location || "").trim(),
            unit: [r.model, r.hp].filter(Boolean).join(" "), qty: service ? 0 : units(r.qty),
            project: isProject(r),   // PROJECT = YES on the Daily Schedule: no team incentive for it
          };
          crew.forEach((n) => (out[n] || (out[n] = [])).push(job));
        });
      });
    });
    return out;
  }

  // ---------- Team incentive (rules and teams in incentive-teams.js) ----------
  // → { staffId: { amount, days, detail: [{ date, team, jobs, amount }] } } for from…to (YYYY-MM-DD).
  // Per day and team: count the DONE UNITS (each row's QTY) in INSTALLER blocks that have a team member on
  // the crew: PER UNIT, not per client (1 client with 2 units = 2). From the 2nd unit (startAtBatch) the team
  // earns its incentive; members on the crew get their share,
  // and only members on the crew get their OWN share (an absent member's share goes to no one).
  // The teams: saved in the online database (key "aircon_teams", edited on the Payroll page);
  // until someone saves them there, the starting list in incentive-teams.js
  function incentiveTeams() {
    const saved = read("aircon_teams", "null");
    if (saved && Array.isArray(saved.teams)) return saved;
    return window.INCENTIVE_TEAMS || { startAtBatch: 2, onePerDay: true, teams: [] };
  }

  function teamIncentives(from, to, staffList) {
    const cfg = incentiveTeams();
    if (!cfg || !Array.isArray(cfg.teams)) return {};
    const startAt = +cfg.startAtBatch || 2;
    const staff = (staffList || read("aircon_staff", "[]")).filter(Boolean);
    const daily = read("aircon_daily", "{}");
    const crewOf = (g) => String(g.crew || "").split("|").map(norm).filter(Boolean);
    const teams = cfg.teams.map((t) => ({
      team: t.team,
      members: (t.members || []).map((m) => {
        const aliases = [m.name, ...(m.also || [])].map(norm).filter(Boolean);
        const s = (m.staffId != null && staff.find((x) => String(x.id) === String(m.staffId)))
          || staff.find((x) => norm(x.name) === norm(m.name)) || staff.find((x) => namesOf(x).some((n) => aliases.includes(n)));
        return { ...m, share: +m.share || 0, staffId: s ? String(s.id) : null, names: new Set([...aliases, ...(s ? namesOf(s) : [])]) };
      }),
    }));
    const out = {};
    Object.keys(daily).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && d >= from && d <= to).sort().forEach((date) => {
      const groups = ((daily[date] && daily[date].groups) || []).filter((g) => g && g.kind !== "service");
      teams.forEach((t) => {
        const onCrew = (m, g) => crewOf(g).some((n) => m.names.has(n));
        const teamGroups = groups.filter((g) => t.members.some((m) => onCrew(m, g)));
        if (!teamGroups.length) return;
        // DONE units that day (QTY of each DONE row; a blank QTY = 1, "-" = 0). PROJECT jobs don't count.
        const done = teamGroups.reduce((c, g) => c + (g.rows || []).filter((r) =>
          (String(r.name || "").trim() || r.model) && String(r.status || "").toUpperCase() === "DONE" && !isProject(r)).reduce((x, r) => x + units(r.qty), 0), 0);
        if (done < startAt) return;   // only the 1st unit (or none): covered by the daily rate
        const times = cfg.onePerDay === false ? done - startAt + 1 : 1;
        const present = t.members.filter((m) => teamGroups.some((g) => onCrew(m, g)));
        if (!present.length) return;
        // Each member present gets ONLY their own share; an absent member's share isn't given to anyone.
        // (splitAbsent: true in the settings would split it equally among those present instead.)
        const absentShares = t.members.filter((m) => !present.includes(m)).reduce((x, m) => x + m.share, 0);
        const extra = cfg.splitAbsent === true ? absentShares / present.length : 0;
        present.forEach((m) => {
          if (!m.staffId) return;
          const amount = (m.share + extra) * times;
          const o = out[m.staffId] || (out[m.staffId] = { amount: 0, days: 0, detail: [] });
          o.amount += amount;
          o.days += 1;
          o.detail.push({ date, team: t.team, jobs: done, amount: Math.round(amount * 100) / 100 });
        });
      });
    });
    Object.values(out).forEach((o) => (o.amount = Math.round(o.amount * 100) / 100));
    return out;
  }

  // One staff member's jobs and counts (a person written two ways in one crew is counted once)
  function forStaff(s, from, to, t) {
    t = t || tally(from, to);
    const seen = {};
    namesOf(s).forEach((n) => (t[n] || []).forEach((j) => (seen[j.id] = j)));
    const jobs = Object.values(seen).sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
    const done = jobs.filter((j) => j.done);
    return {
      jobs, days: new Set(jobs.filter((j) => j.present).map((j) => j.date)).size,
      units: done.reduce((x, j) => x + j.qty, 0), services: done.filter((j) => j.service).length, doneJobs: done.length,
    };
  }

  // Meal allowance: ₱100 for each day present, for EVERY employee except the Owner and the Developer
  // (same rule as payroll.html)
  const MEAL_PER_DAY = 100;
  const mealEligible = (position) => !/owner|developer/i.test(String(position || ""));
  const mealOf = (a, s) => (s && mealEligible(s.position) ? a.days * MEAL_PER_DAY : 0);

  // Pay for the month from the Payroll rate: { rate, basis, ratePay, meal, incentive, total, how }
  // s: the staff record (for the meal allowance)
  // team: this person's TEAM incentive for the same dates ({ amount, days }, from teamIncentives)
  function payOf(a, pay, s, team) {
    if (!pay || pay.rate == null) return null;
    const rate = +pay.rate || 0, basis = String(pay.basis || "daily").toLowerCase(), incentive = +pay.incentive || 0;
    const [ratePay, how] = basis === "monthly" ? [rate, "monthly rate"]
      : basis === "per job" ? [rate * a.doneJobs, `${peso(rate)} × ${a.doneJobs} DONE job${a.doneJobs === 1 ? "" : "s"}`]
      : [rate * a.days, `${peso(rate)} × ${a.days} day${a.days === 1 ? "" : "s"} present`];
    const meal = mealOf(a, s);
    const teamInc = (team && +team.amount) || 0;
    return { rate, basis, ratePay, meal, incentive, teamInc, teamDays: (team && team.days) || 0, total: ratePay + meal + teamInc + incentive, how };
  }

  // Is this staff member on one of the incentive teams?
  function inTeam(s) {
    const cfg = incentiveTeams();
    const names = namesOf(s);
    return (cfg.teams || []).some((t) => (t.members || []).some((m) =>
      (m.staffId != null && m.staffId !== "" && String(m.staffId) === String(s.id))
      || [m.name, ...(m.also || [])].map(norm).some((n) => names.includes(n))));
  }

  // The rate + incentive of the logged-in person (mine: pass their staff record as `me`) or of one
  // staff member (managers: pass staffId)
  async function loadPay(month, staffId, me) {
    await (window.cloudReady || Promise.resolve());
    if (!window.cloud) return { error: "offline" };
    if (!staffId) {
      const { data, error } = await window.cloud.rpc("my_attendance_pay", { m: month });
      if (error) return { error: error.message, missing: /schema cache|does not exist|PGRST202|could not find/i.test(error.message + error.code) };
      const row = (data || [])[0];
      // The database found the login on a different staff record than the one on screen: don't show that rate
      if (row && me && row.staff_id != null && String(row.staff_id) !== String(me.id)) return { mismatch: true };
      return row ? { rate: row.rate, basis: row.basis, incentive: row.incentive } : { rate: null };
    }
    const [p, i] = await Promise.all([
      window.cloud.from("staff_pay").select("rate,basis").eq("staff_id", String(staffId)).maybeSingle(),
      window.cloud.from("staff_incentives").select("amount").eq("staff_id", String(staffId)).eq("month", month).maybeSingle(),
    ]);
    if (p.error) return { error: p.error.message };
    return { rate: p.data ? p.data.rate : null, basis: p.data && p.data.basis, incentive: i.data ? i.data.amount : 0, noIncentiveTable: !!i.error };
  }

  // Every crew member's rate + this month's incentive (managers): { staffId: { rate, basis, incentive } }
  async function loadTeamPay(month) {
    await (window.cloudReady || Promise.resolve());
    if (!window.cloud) return {};
    const [p, i] = await Promise.all([
      window.cloud.from("staff_pay").select("staff_id,rate,basis"),
      window.cloud.from("staff_incentives").select("staff_id,amount").eq("month", month),
    ]);
    const out = {};
    (p.data || []).forEach((r) => (out[r.staff_id] = { rate: r.rate, basis: r.basis, incentive: 0 }));
    (i.data || []).forEach((r) => { if (out[r.staff_id]) out[r.staff_id].incentive = r.amount; });
    return out;
  }

  async function saveIncentive(staffId, month, amount) {
    const { error } = await window.cloud.from("staff_incentives").upsert({ staff_id: String(staffId), month, amount: Math.max(0, +amount || 0) });
    return error ? error.message : null;
  }

  // Month helpers: "2026-11" → first and last date
  const thisMonth = () => { const d = new Date(); return d.getFullYear() + "-" + pad(d.getMonth() + 1); };
  const monthRange = (m) => { const [y, mo] = m.split("-").map(Number); return [`${m}-01`, `${m}-${pad(new Date(y, mo, 0).getDate())}`]; };
  const monthLabel = (m) => { const [y, mo] = m.split("-").map(Number); return new Date(y, mo - 1, 1).toLocaleDateString("en-US", { month: "long", year: "numeric" }); };
  const shiftMonth = (m, n) => { const [y, mo] = m.split("-").map(Number); const d = new Date(y, mo - 1 + n, 1); return d.getFullYear() + "-" + pad(d.getMonth() + 1); };
  const shortDay = (d) => new Date(d + "T00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });

  // Week helpers: a week is Monday to Sunday (same as Payroll's pay week), saved as "wk-2026-11-16" (the Monday).
  // The "period" functions below take either a week ("wk-…") or a month ("2026-11").
  const ymd = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const isWeek = (p) => String(p || "").startsWith("wk-");
  const weekStart = (p) => { const [y, m, d] = String(p).slice(3).split("-").map(Number); return new Date(y, m - 1, d); };
  const thisWeek = () => { const d = new Date(); return "wk-" + ymd(new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7))); };
  // Any dates (from the date-range picker, daterange.js): "rg-2026-10-19_2026-11-17"
  const isRange = (p) => String(p || "").startsWith("rg-");
  const toDate = (s) => { const [y, m, d] = String(s).split("-").map(Number); return new Date(y, m - 1, d); };
  // The period for from…to (YYYY-MM-DD): a whole month → "2026-11", Monday to Sunday → "wk-…", anything else → "rg-…"
  const periodFor = (from, to) => {
    if (to < from) [from, to] = [to, from];
    const [mf, ml] = monthRange(from.slice(0, 7));
    if (from === mf && to === ml) return from.slice(0, 7);
    const f = toDate(from);
    if (f.getDay() === 1 && ymd(new Date(f.getFullYear(), f.getMonth(), f.getDate() + 6)) === to) return "wk-" + from;
    return `rg-${from}_${to}`;
  };
  const periodRange = (p) => {
    if (isRange(p)) return String(p).slice(3).split("_");
    if (!isWeek(p)) return monthRange(p);
    const mon = weekStart(p);
    return [ymd(mon), ymd(new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 6))];
  };
  const periodLabel = (p) => {
    if (!isWeek(p) && !isRange(p)) return monthLabel(p);
    const [from, to] = periodRange(p);
    if (from === to) return `${shortDay(from)}, ${to.slice(0, 4)}`;
    return from.slice(0, 4) === to.slice(0, 4) ? `${shortDay(from)} – ${shortDay(to)}, ${to.slice(0, 4)}`
      : `${shortDay(from)}, ${from.slice(0, 4)} – ${shortDay(to)}, ${to.slice(0, 4)}`;
  };
  const shiftPeriod = (p, n) => {
    if (isRange(p)) {   // the same number of days, earlier or later
      const [from, to] = periodRange(p), f = toDate(from), t = toDate(to);
      const days = Math.round((t - f) / 864e5) + 1;
      return periodFor(ymd(new Date(f.getFullYear(), f.getMonth(), f.getDate() + days * n)), ymd(new Date(t.getFullYear(), t.getMonth(), t.getDate() + days * n)));
    }
    if (!isWeek(p)) return shiftMonth(p, n);
    const mon = weekStart(p);
    return "wk-" + ymd(new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + 7 * n));
  };
  // The month a period's pay rate is read from (a week or other dates: the month of its last day)
  const monthOf = (p) => (isWeek(p) || isRange(p) ? periodRange(p)[1].slice(0, 7) : p);

  // Crew positions (same groups as the crew dropdown on the Daily Schedule)
  const isCrew = (s) => Roles.of(s.position).crew;   // installers, services, drivers, Installation Supervisor (roles.js)

  // The attendance sheet for one person and period (a week "wk-…" or a month "2026-11").
  // pay: what loadPay() returned (or null while loading); canEdit: show the incentive box (managers)
  // For a WEEK the monthly "other incentive" isn't counted (extra amounts are typed in Payroll for the week).
  function sheetHtml(s, month, pay, canEdit) {
    const week = isWeek(month) || isRange(month);   // other dates count like a week: no monthly "other incentive"
    const [from, to] = periodRange(month), a = forStaff(s, from, to);
    const team = teamIncentives(from, to)[String(s.id)] || { amount: 0, days: 0, detail: [] };
    const p = payOf(a, week && pay ? { ...pay, incentive: 0 } : pay, s, team);
    const teamDayAmt = {};   // date → team incentive earned that day (shown on that day's row)
    team.detail.forEach((d) => (teamDayAmt[d.date] = (teamDayAmt[d.date] || 0) + d.amount));
    const teamShown = {}, unitsSoFar = {};
    const startAt = +incentiveTeams().startAtBatch || 2;
    const basis = p && p.basis;
    const firstOfDay = {};
    const rows = a.jobs.map((j) => {
      // Rate shown on the row that earns it: each DONE job (per job), or the first job of each day present (daily)
      let rate = "";
      if (p && basis === "per job" && j.done) rate = peso(p.rate);
      if (p && basis !== "per job" && basis !== "monthly" && j.present && !firstOfDay[j.date]) { firstOfDay[j.date] = 1; rate = peso(p.rate); }
      // The team incentive shows on the DONE row whose unit reaches the 2nd unit of the day (the one that earns it;
      // a row with QTY 2 earns it on its own)
      if (p && teamDayAmt[j.date] && j.done && !j.service && !j.project && !teamShown[j.date]) {
        unitsSoFar[j.date] = (unitsSoFar[j.date] || 0) + j.qty;
        if (unitsSoFar[j.date] >= startAt) {
          teamShown[j.date] = 1;
          rate = (rate ? rate + " " : "") + `<span class="at-tag" title="Team incentive">+ ${peso(teamDayAmt[j.date])} incentive</span>`;
        }
      }
      return `<tr class="${j.done ? "" : "at-notyet"}">
        <td class="at-day">${esc(shortDay(j.date))}</td>
        <td><b>${esc(j.client || "—")}</b></td>
        <td>${esc(j.location || "—")}</td>
        <td>${esc(j.unit || "—")}${j.service ? ' <span class="at-tag">service</span>' : j.qty > 1 ? ` <span class="at-tag">×${j.qty}</span>` : ""}${j.project ? ' <span class="at-tag" title="PROJECT on the Daily Schedule: not counted for the team incentive">project · no incentive</span>' : ""}</td>
        <td><span class="at-st st-${esc(j.status.toLowerCase().replace(/\s+/g, "-"))}">${esc(j.status)}</span></td>
        <td class="num">${rate || "—"}</td>
      </tr>`;
    }).join("");

    let foot = "";
    if (pay && pay.mismatch) {
      foot = `<tr><td colspan="6" class="at-paynote">Your login is linked to more than one staff record, so your rate can't be shown. Ask HR to fix your record on the Staff page.</td></tr>`;
    } else if (pay && pay.hidden) {
      foot = `<tr><td colspan="6" class="at-paynote">Only the Owner and Human Resources can see rates and incentives.</td></tr>`;
    } else if (pay && pay.error) {
      foot = `<tr><td colspan="6" class="at-paynote">${pay.missing ? "Rates aren't set up in the database yet (supabase/attendance_pay.sql)." : "Couldn't load the rate. Try refreshing."}</td></tr>`;
    } else if (!pay) {
      foot = `<tr><td colspan="6" class="at-paynote">Loading rate…</td></tr>`;
    } else if (!p) {
      foot = `<tr><td colspan="6" class="at-paynote">No rate set yet. The owner sets it on the Staff page (Payroll rate).</td></tr>`;
    } else {
      const inc = canEdit
        ? `<span class="at-inc"><span>₱</span><input type="number" min="0" step="any" inputmode="decimal" data-incentive value="${p.incentive || ""}" placeholder="0"><button type="button" data-save-inc>Save</button></span>`
        : peso(p.incentive);
      foot = `
        <tr><td colspan="5">Rate <small>(${esc(p.how)})</small></td><td class="num">${peso(p.ratePay)}</td></tr>
        ${mealEligible(s.position) ? `<tr><td colspan="5">Meal allowance <small>(${peso(MEAL_PER_DAY)} × ${a.days} day${a.days === 1 ? "" : "s"} present)</small></td><td class="num">${peso(p.meal)}</td></tr>` : ""}
        ${p.teamInc || inTeam(s) ? `<tr><td colspan="5">Team incentive <small>(${p.teamDays} day${p.teamDays === 1 ? "" : "s"} with ${+incentiveTeams().startAtBatch || 2}+ units installed)</small></td><td class="num">${peso(p.teamInc)}</td></tr>` : ""}
        ${week ? "" : `<tr><td colspan="5">${p.teamInc || inTeam(s) ? "Other incentive" : "Incentive"} <small>(${esc(monthLabel(month))})</small></td><td class="num">${inc}</td></tr>`}
        <tr class="at-total"><td colspan="5">Total</td><td class="num">${peso(p.total)}</td></tr>`;
    }

    return `
      <div class="at-sheet">
        <div class="at-name"><span>Name</span><b>${esc(s.name)}</b>${s.position ? `<small>${esc(s.position)}</small>` : ""}
          ${p ? `<em class="at-rate">${peso(p.rate)} / ${esc(p.basis)}</em>` : ""}</div>
        <div class="at-stats">
          <div><b>${a.days}</b><span>Days present</span></div>
          <div><b>${a.units}</b><span>Units installed</span></div>
          <div><b>${a.services}</b><span>Services done</span></div>
        </div>
        <div class="at-table-wrap">
          <table class="at-table">
            <thead><tr><th>Date</th><th>Client</th><th>Location</th><th>Unit</th><th>Status</th><th class="num">Rate</th></tr></thead>
            <tbody>${rows || `<tr><td colspan="6" class="at-none">Not on any crew on the Daily Schedule in ${esc(periodLabel(month))} yet.</td></tr>`}</tbody>
            <tfoot>${foot}</tfoot>
          </table>
        </div>
      </div>`;
  }

  return { tally, forStaff, teamIncentives, incentiveTeams, payOf, mealEligible, MEAL_PER_DAY, loadPay, loadTeamPay, saveIncentive, namesOf, isCrew, thisMonth, monthRange, monthLabel, shiftMonth,
    isWeek, isRange, periodFor, thisWeek, periodRange, periodLabel, shiftPeriod, monthOf, sheetHtml, peso };
})();
