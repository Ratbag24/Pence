/* Pence — UK tax engine.
   Shared by the app (docs/index.html loads it as a plain script) and by the
   Node scripts that generate the "£X an hour after tax" pages. Keep every
   rate and threshold in TAX_YEAR so a new tax year is a one-block change. */

/* ---------- UK tax year constants ----------
   2026/27. Income Tax and NI thresholds are frozen until April 2028, so
   these match 2024/25 → 2027/28. Bands are on taxable income (after the
   personal allowance). Student-loan thresholds move each April — check
   gov.uk when a new tax year starts. Rates are for England, Wales & NI
   (Scotland has different income-tax bands). */
const TAX_YEAR = {
  label: "2026/27",
  personalAllowance: 12570,
  paTaperStart: 100000,          // PA drops £1 per £2 earned above this
  basicBand: 37700,              // 20% on the first £37,700 of taxable income
  additionalThreshold: 125140,   // 45% on taxable income above this
  rates: { basic: 0.20, higher: 0.40, additional: 0.45 },
  ni: { pt: 12570, uel: 50270, main: 0.08, upper: 0.02 },
  pension: { lower: 6240, upper: 50270 },  // auto-enrolment qualifying earnings
  studentLoan: {
    plan1: { label: "Plan 1",       threshold: 26065, rate: 0.09 },
    plan2: { label: "Plan 2",       threshold: 28470, rate: 0.09 },
    plan4: { label: "Plan 4",       threshold: 32745, rate: 0.09 },
    plan5: { label: "Plan 5",       threshold: 25000, rate: 0.09 },
    pg:    { label: "Postgraduate", threshold: 21000, rate: 0.06 },
  },
  nationalLivingWage: 12.71,     // 21 and over, from April 2026
  minimumWage1820: 10.85,        // 18–20
  minimumWageUnder18: 8.00,      // 16–17 and apprentices
};

const PAY_FREQ = {
  weekly:     { label: "Weekly",        weeks: 1, fraction: 1 / 52 },
  fortnightly:{ label: "Fortnightly",   weeks: 2, fraction: 2 / 52 },
  fourweekly: { label: "Every 4 weeks", weeks: 4, fraction: 4 / 52 },
  monthly:    { label: "Monthly",       weeks: null, fraction: 1 / 12 },
};

/* calcDeductions(gross, fraction, profile)
   fraction = share of the tax year the pay covers (1 = annual, 1/52 = a
   week, 1/12 = a month). Thresholds are scaled by it — the standard
   non-cumulative ("week 1 / month 1") basis, which is what a payslip
   check needs. NI is genuinely per-period so that part is exact.
   profile: { pensionPct, pensionBeforeTax, studentLoan } — all optional. */
function calcDeductions(gross, fraction, p) {
  const T = TAX_YEAR, f = fraction;
  p = p || {};
  gross = Math.max(0, gross);

  let pension = 0;
  if (p.pensionPct > 0) {
    const lower = T.pension.lower * f, upper = T.pension.upper * f;
    pension = Math.max(0, Math.min(gross, upper) - lower) * (p.pensionPct / 100);
  }
  const taxablePay = p.pensionBeforeTax === false ? gross : gross - pension;

  let pa = T.personalAllowance;
  const annualised = taxablePay / f;
  if (annualised > T.paTaperStart) pa = Math.max(0, pa - (annualised - T.paTaperStart) / 2);
  pa *= f;

  const ti = Math.max(0, taxablePay - pa);
  const basicTop = T.basicBand * f, addTop = T.additionalThreshold * f;
  const tax = Math.min(ti, basicTop) * T.rates.basic
            + Math.max(0, Math.min(ti, addTop) - basicTop) * T.rates.higher
            + Math.max(0, ti - addTop) * T.rates.additional;

  const pt = T.ni.pt * f, uel = T.ni.uel * f;
  let ni = 0;
  if (gross > pt)  ni += (Math.min(gross, uel) - pt) * T.ni.main;
  if (gross > uel) ni += (gross - uel) * T.ni.upper;

  let loan = 0;
  const sl = T.studentLoan[p.studentLoan];
  if (sl) loan = Math.max(0, gross - sl.threshold * f) * sl.rate;

  const net = gross - tax - ni - pension - loan;
  return { gross, tax, ni, pension, loan, net, total: tax + ni + pension + loan };
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { TAX_YEAR, PAY_FREQ, calcDeductions };
}
