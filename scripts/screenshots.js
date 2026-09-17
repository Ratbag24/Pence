// Generates store screenshots from the web app using Playwright + Chromium.
//   npm run screenshots
// For each store size it captures raw screens into raw/ and then composes the
// final captioned screenshots (headline + device frame) next to them:
//   store/screenshots/ios-6.7/  1290x2796 (iPhone 6.7", App Store Connect)
//   store/screenshots/android/  1080x2400 (Google Play phone)
const { chromium } = require("playwright");
const http = require("http"), fs = require("fs"), path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DOCS = path.join(ROOT, "docs");
const OUT = path.join(ROOT, "store", "screenshots");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };

const SHOTS = [
  { name: "1-home",    go: null,      headline: "Know your take-home before payday", sub: "Log your shifts. See this week's pay after tax — instantly." },
  { name: "2-payslip", go: "payslip", headline: "Did you get paid right?",           sub: "Pence works out what your payslip should say, so you can check it." },
  { name: "3-shifts",  go: "shifts",  headline: "Log shifts in seconds",             sub: "Standard, nights, overtime — tap a day and you're done." },
  { name: "4-plan",    go: "plan",    headline: "A savings goal with a finish date", sub: "See exactly when you'll get there, and how an extra shift moves it." },
];

const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]); if (p.endsWith("/")) p += "index.html";
  const f = path.join(DOCS, p);
  if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(res);
});

// Demo data: a care worker on £13.20/hr, mostly 12h shifts, saving for a holiday.
function demoState() {
  const pad = n => String(n).padStart(2, "0");
  const key = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const t = new Date(); const today = new Date(t.getFullYear(), t.getMonth(), t.getDate());
  const ws = new Date(today); ws.setDate(ws.getDate() - ((ws.getDay() + 6) % 7));
  const shifts = [];
  const pattern = [[0, 12, "standard"], [1, 12, "standard"], [3, 12, "premium", "Nights"], [4, 12, "premium", "Nights"], [5, 8, "ot"]];
  for (let w = 7; w >= 0; w--) {
    pattern.forEach(([dow, hours, type, note], i) => {
      if (w === 0 && dow > (today.getDay() + 6) % 7) return; // this week: only up to today
      if ((w === 3 || w === 5) && i === 4) return;             // a couple of weeks without overtime
      if (w === 2 && i === 1) return;                          // and one short week
      const d = new Date(ws); d.setDate(d.getDate() - w * 7 + dow);
      shifts.push({ id: `s${w}${i}`, date: key(d), hours, type, note: note || "" });
    });
  }
  const deposits = {}; for (let w = 6; w >= 1; w--) { const d = new Date(ws); d.setDate(d.getDate() - w * 7); deposits[key(d)] = 75; }
  return {
    v: 2, onboarded: true,
    profile: { name: "Sam", hourly: 13.2, shiftPct: 20, baseHours: 48, otHours: 0, otMult: 1.5, payFreq: "weekly", pensionPct: 5, pensionBeforeTax: true, studentLoan: "plan2" },
    expenses: { rent: 650, food: 220, utils: 140, transport: 90, subs: 35, other: 120, loans: 60 },
    extraIncomes: [{ label: "Child benefit", amount: 112, freqMonths: 1 }],
    savings: { amount: 75, freq: "week", balance: 1430, interestRate: 4.1, goal: 2500, goalLabel: "Tenerife", months: 12 },
    shifts, deposits, checks: [],
  };
}

async function captureRaw(browser, url, { dir, width, height, scale }) {
  fs.mkdirSync(dir, { recursive: true });
  const ctx = await browser.newContext({ viewport: { width: Math.round(width / scale), height: Math.round(height / scale) }, deviceScaleFactor: scale, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(url);
  await page.evaluate(s => localStorage.setItem("pence_v2", JSON.stringify(s)), demoState());
  await page.reload();
  await page.waitForSelector('[data-screen="home"].active');
  for (const s of SHOTS) {
    if (s.go) { await page.click(`[data-go="${s.go}"]`); await page.waitForSelector(`[data-screen="${s.go}"].active`); }
    if (s.go === "payslip") { await page.waitForSelector("#ps-actual"); await page.fill("#ps-actual", "540.10"); await page.waitForTimeout(600); }
    if (s.go === "plan") { await page.waitForSelector("#plan-chart"); await page.evaluate(() => document.querySelectorAll("details.section").forEach(d => d.open = false)); }
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(dir, s.name + ".png") });
  }
  await ctx.close();
}

// Compose: headline over a rounded, shadowed screenshot that bleeds off the bottom.
async function compose(browser, { rawDir, outDir, width, height, scale }) {
  const cssW = Math.round(width / scale), cssH = Math.round(height / scale);
  const ctx = await browser.newContext({ viewport: { width: cssW, height: cssH }, deviceScaleFactor: scale });
  const page = await ctx.newPage();
  for (const s of SHOTS) {
    const img = "data:image/png;base64," + fs.readFileSync(path.join(rawDir, s.name + ".png")).toString("base64");
    await page.setContent(`<!DOCTYPE html><html><head><meta charset="utf-8"><style>
      *{margin:0;padding:0;box-sizing:border-box}
      body{width:${cssW}px;height:${cssH}px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,sans-serif;color:#e2e8f0;
        background:radial-gradient(120% 70% at 50% -10%,#24305a 0%,#141727 45%,#0f1117 100%)}
      .head{padding:${Math.round(cssH * 0.075)}px 30px 0;text-align:center}
      .badge{display:inline-flex;align-items:center;gap:8px;font-weight:800;font-size:15px;color:#8fb3ff;margin-bottom:22px;letter-spacing:.3px}
      .badge img{width:26px;height:26px;border-radius:7px}
      h1{font-size:${Math.round(cssW * 0.082)}px;font-weight:800;letter-spacing:-1px;line-height:1.1;margin-bottom:12px}
      p{font-size:${Math.round(cssW * 0.04)}px;color:#a3adc4;line-height:1.4;max-width:88%;margin:0 auto}
      .shot{position:absolute;left:50%;top:${Math.round(cssH * 0.295)}px;transform:translateX(-50%);width:${Math.round(cssW * 0.86)}px;
        border-radius:34px 34px 0 0;overflow:hidden;border:8px solid #2a2f45;border-bottom:0;box-shadow:0 30px 80px rgba(0,0,0,.6),0 0 0 1px rgba(255,255,255,.06)}
      .shot img{display:block;width:100%}
    </style></head><body>
      <div class="head"><div class="badge"><img src="../icon.svg" alt="">PENCE</div><h1>${s.headline}</h1><p>${s.sub}</p></div>
      <div class="shot"><img src="${img}" alt=""></div>
    </body></html>`.replace('src="../icon.svg"', `src="data:image/svg+xml;base64,${fs.readFileSync(path.join(DOCS, "icon.svg")).toString("base64")}"`));
    await page.waitForTimeout(150);
    await page.screenshot({ path: path.join(outDir, s.name + ".png"), clip: { x: 0, y: 0, width: cssW, height: cssH } });
    console.log("  ", path.relative(ROOT, path.join(outDir, s.name + ".png")));
  }
  await ctx.close();
}

(async () => {
  await new Promise(r => server.listen(0, r));
  const url = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
  for (const t of [
    { label: 'iOS 6.7" (1290x2796)', dir: path.join(OUT, "ios-6.7"), width: 1290, height: 2796, scale: 3 },
    { label: "Android (1080x2400)",   dir: path.join(OUT, "android"), width: 1080, height: 2400, scale: 2.5 },
  ]) {
    console.log(t.label + ":");
    const rawDir = path.join(t.dir, "raw");
    await captureRaw(browser, url, { ...t, dir: rawDir });
    await compose(browser, { ...t, rawDir, outDir: t.dir });
  }
  await browser.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
