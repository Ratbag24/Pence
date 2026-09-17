// Generates the "£X an hour after tax" pages into docs/rates/ plus docs/sitemap.xml.
//   npm run build:rates
// Static HTML, no JS — these are landing pages that rank for searches like
// "13.50 an hour is how much a year after tax" and send people to the app.
const fs = require("fs"), path = require("path");
const { TAX_YEAR, calcDeductions } = require("../docs/tax.js");

const SITE = "https://ratbag24.github.io/Pence";   // canonical base URL (no trailing slash)
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "docs", "rates");
const STD_HOURS = 37.5;
const HOURS = [16, 20, 25, 30, 35, 37.5, 40, 45, 48];
const TODAY = new Date().toISOString().slice(0, 10);

// £10.85 (18–20 minimum wage), £12.71 (NLW), then £11 → £25 in 50p steps
const rates = new Set([TAX_YEAR.minimumWage1820, TAX_YEAR.nationalLivingWage]);
for (let r = 11; r <= 25.001; r += 0.5) rates.add(Math.round(r * 100) / 100);
const RATES = [...rates].sort((a, b) => a - b);

const money = n => "£" + Math.round(n).toLocaleString("en-GB");
const money2 = n => "£" + n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const rateStr = r => r.toFixed(2).replace(/\.00$/, "");
const slug = r => `${r.toFixed(2).replace(".", "-")}-an-hour.html`;
const hrs = h => String(h).replace(/\.0$/, "");

function figures(rate, hours) {
  const grossYear = rate * hours * 52;
  const d = calcDeductions(grossYear, 1, {});
  return { grossYear, ...d, netMonth: d.net / 12, netWeek: d.net / 52, netDay: d.net / 260, grossMonth: grossYear / 12, grossWeek: grossYear / 52 };
}

const CSS = `
*{box-sizing:border-box;margin:0;padding:0}
:root{--bg:#0f1117;--surface:#1a1d27;--surface2:#22263a;--border:#2e3250;--accent:#4f8ef7;--green:#34d399;--red:#f87171;--text:#e2e8f0;--muted:#8892a8}
html{color-scheme:dark}
body{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;background:var(--bg);color:var(--text);line-height:1.55;-webkit-font-smoothing:antialiased}
main{max-width:720px;margin:0 auto;padding:22px 16px 60px}
header.top{display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:26px}
header.top a.brand{display:flex;align-items:center;gap:9px;color:var(--text);text-decoration:none;font-weight:800}
header.top a.brand img{width:30px;height:30px;border-radius:8px}
header.top a.cta{background:var(--accent);color:#fff;text-decoration:none;font-weight:700;padding:9px 14px;border-radius:10px;font-size:.9rem;white-space:nowrap}
h1{font-size:clamp(1.5rem,5.5vw,2.1rem);font-weight:800;letter-spacing:-.6px;line-height:1.15;margin-bottom:10px}
h2{font-size:1.15rem;font-weight:700;margin:34px 0 10px;letter-spacing:-.2px}
p{margin-bottom:12px}
.lead{font-size:1.05rem;color:var(--muted)}
.lead b{color:var(--text)}
.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:10px;margin:18px 0}
.stat{background:var(--surface);border:1px solid var(--border);border-radius:12px;padding:14px}
.stat .l{font-size:.7rem;text-transform:uppercase;letter-spacing:.8px;color:var(--muted);margin-bottom:4px}
.stat .v{font-size:1.35rem;font-weight:800;letter-spacing:-.4px;font-variant-numeric:tabular-nums}
.stat .v.green{color:var(--green)}
.card{background:var(--surface);border:1px solid var(--border);border-radius:14px;padding:16px 18px;margin:14px 0}
.tbl{overflow-x:auto;margin:0 -18px;padding:0 18px}
table{width:100%;border-collapse:collapse;font-size:.9rem;white-space:nowrap}
th{text-align:right;color:var(--muted);font-weight:600;font-size:.7rem;text-transform:uppercase;letter-spacing:.6px;padding:8px;border-bottom:1px solid var(--border)}
td{text-align:right;padding:9px 8px;border-bottom:1px solid var(--border);font-variant-numeric:tabular-nums}
th:first-child,td:first-child{text-align:left}
tr.hl td{background:rgba(79,142,247,.12);font-weight:700}
td a{color:var(--accent);text-decoration:none}
.kv{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid var(--border);font-size:.95rem}
.kv:last-child{border-bottom:0}
.kv .k{color:var(--muted)}
.kv.total{font-weight:700;border-top:2px solid var(--border);border-bottom:0;margin-top:4px;padding-top:12px}
.kv.total .k{color:var(--text)}
.red{color:var(--red)}.green{color:var(--green)}
.promo{background:linear-gradient(160deg,rgba(79,142,247,.18),var(--surface) 60%);border:1px solid rgba(79,142,247,.45);border-radius:16px;padding:22px;margin:34px 0}
.promo h2{margin:0 0 8px}
.promo p{color:var(--muted)}
.promo a.btn{display:inline-block;background:var(--accent);color:#fff;text-decoration:none;font-weight:700;padding:13px 20px;border-radius:12px;margin-top:8px}
.promo ul{margin:10px 0 14px 18px;color:var(--muted)}
.chips{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0}
.chips a{border:1px solid var(--border);background:var(--surface2);color:var(--text);border-radius:999px;padding:7px 13px;font-size:.88rem;text-decoration:none;font-weight:600}
.chips a.on{border-color:var(--accent);color:var(--accent)}
.small{font-size:.8rem;color:var(--muted);line-height:1.5}
footer{margin-top:40px;color:var(--muted);font-size:.78rem;line-height:1.6;border-top:1px solid var(--border);padding-top:18px}
footer a{color:var(--muted)}
`;

function shell({ title, description, canonical, body, jsonld }) {
  return `<!DOCTYPE html>
<html lang="en-GB">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${title}</title>
<meta name="description" content="${description}">
<link rel="canonical" href="${canonical}">
<link rel="icon" href="../icon.svg" type="image/svg+xml">
<meta property="og:title" content="${title}">
<meta property="og:description" content="${description}">
<meta property="og:type" content="article">
<meta property="og:url" content="${canonical}">
<meta name="theme-color" content="#0f1117">
${jsonld ? `<script type="application/ld+json">${JSON.stringify(jsonld)}</script>` : ""}
<style>${CSS}</style>
</head>
<body>
<main>
<header class="top">
  <a class="brand" href="../"><img src="../icon.svg" alt="">Pence</a>
  <a class="cta" href="../">Get the free app</a>
</header>
${body}
<footer>
  Figures use ${TAX_YEAR.label} rates for England, Wales &amp; Northern Ireland with the standard 1257L tax code, no pension or student-loan deductions, and 52 paid weeks a year. They're estimates for planning — your payslip may differ slightly. Not financial advice.<br>
  <a href="index.html">All hourly rates</a> · <a href="../">Pence app</a> · <a href="../privacy.html">Privacy</a> · © CodedForge
</footer>
</main>
</body>
</html>
`;
}

function ratePage(rate, i) {
  const r = rateStr(rate);
  const f = figures(rate, STD_HOURS);
  const effRate = f.grossYear > 0 ? (f.tax + f.ni) / f.grossYear * 100 : 0;
  const vsNlw = (rate / TAX_YEAR.nationalLivingWage - 1) * 100;

  // one extra 8-hour shift a week
  const ot = [1, 1.5].map(m => {
    const extraGross = 8 * rate * m * 52;
    const extraNet = calcDeductions(f.grossYear + extraGross, 1, {}).net - f.net;
    return { m, grossWeek: extraGross / 52, netWeek: extraNet / 52 };
  });

  const nearby = RATES.slice(Math.max(0, i - 3), i + 4);
  const title = `£${r} an hour is how much a year? ${money(f.grossYear)} before tax, ${money(f.net)} after (${TAX_YEAR.label})`;
  const description = `£${r} an hour on ${hrs(STD_HOURS)} hours a week is ${money(f.grossYear)} a year. After Income Tax and National Insurance you take home about ${money(f.net)} a year, ${money(f.netMonth)} a month or ${money(f.netWeek)} a week. Full breakdown for 16–48 hours.`;
  const canonical = `${SITE}/rates/${slug(rate)}`;

  const jsonld = {
    "@context": "https://schema.org", "@type": "FAQPage",
    mainEntity: [
      { "@type": "Question", name: `How much is £${r} an hour a year?`, acceptedAnswer: { "@type": "Answer", text: `£${r} an hour is ${money(f.grossYear)} a year before tax on a ${hrs(STD_HOURS)}-hour week (${money(f.grossMonth)} a month). On 40 hours it's ${money(figures(rate, 40).grossYear)}.` } },
      { "@type": "Question", name: `What is £${r} an hour after tax?`, acceptedAnswer: { "@type": "Answer", text: `After Income Tax (${money(f.tax)}) and National Insurance (${money(f.ni)}) on a ${hrs(STD_HOURS)}-hour week, £${r} an hour is about ${money(f.net)} a year take-home — ${money(f.netMonth)} a month or ${money(f.netWeek)} a week, using ${TAX_YEAR.label} rates.` } },
      { "@type": "Question", name: `Is £${r} an hour above minimum wage?`, acceptedAnswer: { "@type": "Answer", text: rate >= TAX_YEAR.nationalLivingWage ? `Yes. The National Living Wage for people aged 21 and over is £${TAX_YEAR.nationalLivingWage} from April 2026, so £${r} is ${vsNlw.toFixed(0)}% above it.` : `£${r} is below the £${TAX_YEAR.nationalLivingWage} National Living Wage for people aged 21 and over, but above the £${TAX_YEAR.minimumWage1820} rate for 18–20 year olds.` } },
    ],
  };

  const body = `
<h1>£${r} an hour is ${money(f.grossYear)} a year — <span class="green">${money(f.net)} after tax</span></h1>
<p class="lead">On a <b>${hrs(STD_HOURS)}-hour week</b>, £${r} an hour works out at <b>${money(f.grossYear)}</b> a year before tax. After Income Tax and National Insurance you'd take home about <b>${money(f.netMonth)} a month</b>, or <b>${money(f.netWeek)} a week</b>.</p>

<div class="grid">
  <div class="stat"><div class="l">Per year</div><div class="v green">${money(f.net)}</div></div>
  <div class="stat"><div class="l">Per month</div><div class="v green">${money(f.netMonth)}</div></div>
  <div class="stat"><div class="l">Per week</div><div class="v green">${money(f.netWeek)}</div></div>
  <div class="stat"><div class="l">Per day (7.5h)</div><div class="v green">${money(f.netDay)}</div></div>
</div>
<p class="small">Take-home pay, ${TAX_YEAR.label} tax year, ${hrs(STD_HOURS)} hours a week.</p>

<h2>£${r} an hour by hours per week</h2>
<div class="card"><div class="tbl"><table>
<thead><tr><th>Hours / week</th><th>Gross / year</th><th>Take-home / year</th><th>Take-home / month</th><th>Take-home / week</th></tr></thead>
<tbody>
${HOURS.map(h => { const x = figures(rate, h); return `<tr${h === STD_HOURS ? ' class="hl"' : ""}><td>${hrs(h)} hrs</td><td>${money(x.grossYear)}</td><td>${money(x.net)}</td><td>${money(x.netMonth)}</td><td>${money(x.netWeek)}</td></tr>`; }).join("\n")}
</tbody></table></div></div>

<h2>How the tax is worked out</h2>
<div class="card">
  <div class="kv"><span class="k">Gross pay (${hrs(STD_HOURS)} hrs × 52 weeks)</span><span>${money2(f.grossYear)}</span></div>
  <div class="kv"><span class="k">Tax-free personal allowance</span><span>${money2(Math.min(f.grossYear, TAX_YEAR.personalAllowance))}</span></div>
  <div class="kv"><span class="k">− Income Tax</span><span class="red">${money2(f.tax)}</span></div>
  <div class="kv"><span class="k">− National Insurance</span><span class="red">${money2(f.ni)}</span></div>
  <div class="kv total"><span class="k">Take-home pay</span><span class="green">${money2(f.net)}</span></div>
</div>
<p class="small">That's an effective deduction rate of ${effRate.toFixed(1)}%. Income Tax is 20% on earnings between ${money(TAX_YEAR.personalAllowance)} and ${money(TAX_YEAR.personalAllowance + TAX_YEAR.basicBand)}${f.grossYear > TAX_YEAR.personalAllowance + TAX_YEAR.basicBand ? " and 40% above that" : ""}; employee National Insurance is 8% on earnings between ${money(TAX_YEAR.ni.pt)} and ${money(TAX_YEAR.ni.uel)}${f.grossYear > TAX_YEAR.ni.uel ? " and 2% above that" : ""}. A workplace pension (usually 5%) or a student loan would reduce the take-home figure.</p>

<h2>What an extra shift is worth</h2>
<div class="card">
  ${ot.map(o => `<div class="kv"><span class="k">One extra 8-hour shift a week at ${o.m === 1 ? "your normal rate" : `time-and-a-half (£${rateStr(rate * o.m)}/hr)`}</span><span><b class="green">+${money(o.netWeek)}</b> <span class="small">after tax (${money(o.grossWeek)} gross)</span></span></div>`).join("")}
</div>
<p class="small">Extra hours are taxed at your marginal rate, which is why the after-tax figure is lower than the gross. That's still ${money(ot[1].netWeek * 52)} a year from one time-and-a-half shift a week.</p>

<h2>Is £${r} an hour good?</h2>
<p>${rate >= TAX_YEAR.nationalLivingWage
  ? `£${r} is <b>${vsNlw.toFixed(0)}% above</b> the National Living Wage of £${TAX_YEAR.nationalLivingWage} (21 and over, from April 2026). As a full-time salary it's roughly the same as <b>${money(f.grossYear)}</b> a year${f.grossYear > TAX_YEAR.personalAllowance + TAX_YEAR.basicBand ? ", which takes you into the 40% higher-rate band" : ""}.`
  : `£${r} is <b>below</b> the £${TAX_YEAR.nationalLivingWage} National Living Wage for people aged 21 and over, so if you're 21+ your employer must pay at least that. It's above the £${TAX_YEAR.minimumWage1820} minimum for 18–20 year olds.`}
Whether it's <em>good</em> depends on your hours: shift and hourly work rarely comes to exactly ${hrs(STD_HOURS)} hours every week, which is why the yearly figure above is only a guide.</p>

<div class="promo">
  <h2>Paid by the hour? Track what you actually earn.</h2>
  <p>Pence is a free budgeting app built for hourly and shift workers — the people every other money app forgets.</p>
  <ul>
    <li>Log your shifts and see this week's take-home before payday</li>
    <li>Check your payslip is right — catch underpayment in seconds</li>
    <li>Set a savings goal and get a finish date</li>
  </ul>
  <a class="btn" href="../">Open Pence — it's free</a>
  <p class="small" style="margin-top:10px">No account. No bank connection. Works offline. Nothing leaves your phone.</p>
</div>

<h2>Nearby hourly rates</h2>
<div class="chips">
  ${nearby.map(x => `<a href="${slug(x)}"${x === rate ? ' class="on"' : ""}>£${rateStr(x)}</a>`).join("")}
  <a href="index.html">All rates →</a>
</div>
`;
  return shell({ title, description, canonical, body, jsonld });
}

function indexPage() {
  const title = `UK hourly wage to salary after tax calculator table (${TAX_YEAR.label})`;
  const description = `What every hourly rate from £${rateStr(RATES[0])} to £${rateStr(RATES[RATES.length - 1])} is worth per year, per month and per week after tax on a ${hrs(STD_HOURS)}-hour week, using ${TAX_YEAR.label} UK rates.`;
  const body = `
<h1>Hourly rate to take-home pay, ${TAX_YEAR.label}</h1>
<p class="lead">What each hourly rate is worth <b>after Income Tax and National Insurance</b> on a ${hrs(STD_HOURS)}-hour week. Tap a rate for the full breakdown by hours per week.</p>
<div class="card"><div class="tbl"><table>
<thead><tr><th>Per hour</th><th>Gross / year</th><th>Take-home / year</th><th>Take-home / month</th><th>Take-home / week</th></tr></thead>
<tbody>
${RATES.map(x => { const f = figures(x, STD_HOURS); const tag = x === TAX_YEAR.nationalLivingWage ? " <span class=\"small\">NLW 21+</span>" : x === TAX_YEAR.minimumWage1820 ? " <span class=\"small\">18–20</span>" : "";
  return `<tr><td><a href="${slug(x)}">£${rateStr(x)}</a>${tag}</td><td>${money(f.grossYear)}</td><td>${money(f.net)}</td><td>${money(f.netMonth)}</td><td>${money(f.netWeek)}</td></tr>`; }).join("\n")}
</tbody></table></div></div>

<div class="promo">
  <h2>Paid by the hour? Track what you actually earn.</h2>
  <p>Pence is a free budgeting app for hourly and shift workers: log shifts, check your payslip is right, and hit your savings goal.</p>
  <a class="btn" href="../">Open Pence — it's free</a>
</div>
`;
  return shell({ title, description, canonical: `${SITE}/rates/index.html`, body });
}

fs.mkdirSync(OUT, { recursive: true });
RATES.forEach((r, i) => fs.writeFileSync(path.join(OUT, slug(r)), ratePage(r, i)));
fs.writeFileSync(path.join(OUT, "index.html"), indexPage());

const urls = [`${SITE}/`, `${SITE}/privacy.html`, `${SITE}/rates/index.html`, ...RATES.map(r => `${SITE}/rates/${slug(r)}`)];
fs.writeFileSync(path.join(ROOT, "docs", "sitemap.xml"),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls.map(u => `  <url><loc>${u}</loc><lastmod>${TODAY}</lastmod></url>`).join("\n")}\n</urlset>\n`);
fs.writeFileSync(path.join(ROOT, "docs", "robots.txt"), `User-agent: *\nAllow: /\nSitemap: ${SITE}/sitemap.xml\n`);

console.log(`Wrote ${RATES.length} rate pages + index to docs/rates/, plus docs/sitemap.xml and docs/robots.txt`);
