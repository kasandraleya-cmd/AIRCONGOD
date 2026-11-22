// A staff member's OWN payslips, shared by My Payslips (mypay.html) and the Dashboard (leave.js).
// The database function my_payslips() (supabase/my_payslips.sql) returns only the logged-in
// person's line from each finalized pay period; nobody else's pay ever reaches the browser.
const Payslip = (function () {
  // Same rules as payroll.html
  const OT_RATE = 1.25, HOURS_PER_DAY = 8, WORKDAYS_PER_MONTH = 26;
  const DEDUCTIONS = [["sss", "SSS"], ["ph", "PhilHealth"], ["pi", "Pag-IBIG"], ["ca", "Cash advance"], ["other", "Other deductions"]];
  const num = (v) => Math.max(0, parseFloat(v) || 0);
  const r2 = (n) => Math.round((+n || 0) * 100) / 100;
  const peso = (n) => "₱" + r2(n).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  function pay(slip) {
    const r = slip.line || {}, snap = r.snap || {};
    const v = (f) => num(r[f]);
    const rate = +snap.rate || 0, basis = String(snap.basis || "daily").toLowerCase();
    const whole = String(slip.period).endsWith("-M");
    let basic = 0, daily = 0;
    if (basis === "monthly") {
      daily = rate / WORKDAYS_PER_MONTH;
      const weekly = String(slip.period).startsWith("wk-");   // weekly pay (Mon–Sun): monthly × 12 ÷ 52
      basic = Math.max(0, (whole ? rate : weekly ? rate * 12 / 52 : rate / 2) - v("days") * daily);
    } else if (basis === "per job") {
      basic = rate * v("days");
    } else {
      daily = rate;
      basic = rate * v("days");
    }
    const otPay = v("ot") * (daily / HOURS_PER_DAY) * OT_RATE;
    const meal = v("meal");   // meal allowance, saved by payroll.html when the period is saved
    // Incentive saved by payroll.html ("incentive": team incentive or the amount HR typed; older saves: "inc")
    const inc = r.incentive != null && r.incentive !== "" ? v("incentive") : v("inc");
    const gross = basic + otPay + v("allow") + meal + inc;
    // Late (Time Clock, ₱2 per minute), saved by payroll.html ("lateAmt"; older saves: "late")
    const late = r.lateAmt != null && r.lateAmt !== "" ? v("lateAmt") : v("late");
    const ded = DEDUCTIONS.reduce((s, [f]) => s + v(f), 0) + late;
    return { basic: r2(basic), otPay: r2(otPay), allow: r2(v("allow")), meal: r2(meal), mealDays: v("mealDays"), inc: r2(inc), incDays: v("incDays"), late: r2(late), lateMin: v("lateMin"), gross: r2(gross), ded: r2(ded), net: r2(gross - ded), basis, rate, whole, weekly: String(slip.period).startsWith("wk-") };
  }

  // → { slips: [...] } newest first, or { error, missing } when it can't load
  async function load() {
    await (window.cloudReady || Promise.resolve());
    if (!window.cloud) return { error: "The online database isn't connected. Check the internet and refresh." };
    const { data, error } = await window.cloud.rpc("my_payslips");
    if (error) return { error: error.message, missing: /schema cache|does not exist|PGRST202|could not find/i.test(error.message + error.code) };
    return { slips: (data || []).filter((s) => s && s.line) };
  }

  return { pay, load, peso, num, DEDUCTIONS };
})();
