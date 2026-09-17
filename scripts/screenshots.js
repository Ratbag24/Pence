// Generates store screenshots from the web app using Playwright + Chromium.
//   npm run screenshots
// Output: store/screenshots/ios-6.7/*.png (1290x2796) and store/screenshots/android/*.png (1080x2400)
const { chromium } = require("playwright");
const http = require("http"), fs = require("fs"), path = require("path");

const ROOT = path.resolve(__dirname, "..");
const DOCS = path.join(ROOT, "docs");
const OUT = path.join(ROOT, "store", "screenshots");
const MIME = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };

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
      if (w === 3 && i === 4) return; // a week with no overtime
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

async function capture(browser, { dir, width, height, scale }) {
  fs.mkdirSync(dir, { recursive: true });
  const ctx = await browser.newContext({ viewport: { width: Math.round(width / scale), height: Math.round(height / scale) }, deviceScaleFactor: scale, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.goto(url);
  await page.evaluate(s => localStorage.setItem("pence_v2", JSON.stringify(s)), demoState());
  await page.reload();
  await page.waitForSelector('[data-screen="home"].active');
  const shot = async (name, go) => {
    if (go) { await page.click(`[data-go="${go}"]`); await page.waitForSelector(`[data-screen="${go}"].active`); }
    await page.waitForTimeout(500);
    await page.screenshot({ path: path.join(dir, name + ".png") });
    console.log("  ", path.relative(ROOT, path.join(dir, name + ".png")));
  };
  await shot("1-home");
  await page.click('[data-go="payslip"]'); await page.waitForSelector("#ps-actual");
  await page.fill("#ps-actual", "540.10"); await page.waitForTimeout(600);
  await shot("2-payslip");
  await shot("3-shifts", "shifts");
  await page.click('[data-go="plan"]'); await page.waitForSelector("#plan-chart");
  await page.evaluate(() => document.querySelectorAll("details.section").forEach(d => d.open = false));
  await page.waitForTimeout(300);
  await shot("4-plan");
  await ctx.close();
}

let url;
(async () => {
  await new Promise(r => server.listen(0, r));
  url = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
  console.log("iOS 6.7\" (1290x2796):");
  await capture(browser, { dir: path.join(OUT, "ios-6.7"), width: 1290, height: 2796, scale: 3 });
  console.log("Android (1080x2400):");
  await capture(browser, { dir: path.join(OUT, "android"), width: 1080, height: 2400, scale: 2.75 });
  await browser.close(); server.close();
})().catch(e => { console.error(e); process.exit(1); });
