// End-to-end test: drives the web app in headless Chromium and checks the tax maths.
//   npm run test:e2e   (set CHROMIUM_PATH to use a specific Chromium binary)
const { chromium } = require("playwright");
const http = require("http"), fs = require("fs"), path = require("path");

const DOCS = require("path").resolve(__dirname, "..", "docs");
const OUT = require("path").resolve(__dirname, "..", ".e2e-shots");
fs.mkdirSync(OUT, { recursive: true });
const MIME = { ".html": "text/html", ".js": "text/javascript", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]); if (p.endsWith("/")) p += "index.html";
  const f = path.join(DOCS, p);
  if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { "Content-Type": MIME[path.extname(f)] || "application/octet-stream" }); fs.createReadStream(f).pipe(res);
});

(async () => {
  await new Promise(r => server.listen(0, r));
  const url = `http://127.0.0.1:${server.address().port}/`;
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH || undefined, args: ["--no-sandbox"] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  const errors = [];
  page.on("console", m => { if (m.type() === "error") errors.push("console: " + m.text()); });
  page.on("pageerror", e => errors.push("pageerror: " + e.message));
  const step = async (name, fn) => { try { await fn(); console.log("✓", name); } catch (e) { console.log("✗", name, "-", e.message.split("\n")[0]); errors.push(name + ": " + e.message.split("\n")[0]); } };
  const snap = n => page.screenshot({ path: `${OUT}/${n}.png` });
  const text = async sel => (await page.locator(sel).first().textContent()).trim();

  await page.goto(url);
  await step("onboarding shows", async () => { await page.waitForSelector("#onboarding:not(.hidden)"); await snap("01-onboarding-1"); });
  await step("onboarding step 1", async () => { await page.fill("#ob-hourly", "13.50"); await page.fill("#ob-shift", "14.85"); await page.click('[data-ob="next"]'); await page.waitForSelector("#ob-hours"); });
  await step("onboarding step 2", async () => { await page.fill("#ob-hours", "37.5"); await page.click('[data-seg="ob-freq"] [data-v="weekly"]'); await page.click('[data-ob="next"]'); await page.waitForSelector("#ob-label"); await snap("02-onboarding-3"); });
  await step("onboarding finish", async () => {
    await page.fill("#ob-label", "Ibiza"); await page.fill("#ob-goal", "1500"); await page.fill("#ob-amount", "75"); await page.click('[data-ob="next"]');
    await page.waitForSelector("#onboarding.hidden", { state: "attached" }); await page.waitForSelector('[data-screen="home"].active');
    const prof = await page.evaluate(() => JSON.parse(localStorage.getItem("pence_v2")).profile);
    if (Math.abs(prof.shiftPct - 10) > 0.01 || prof.shiftMode !== "rate" || !prof.usualAtShiftRate) throw new Error("shift rate not applied: " + JSON.stringify(prof));
    console.log("   shift rate £14.85 on £13.50 →", prof.shiftPct.toFixed(2) + "% premium, mode", prof.shiftMode);
  });
  await step("home shows planned take-home", async () => {
    const big = await text('[data-screen="home"] .big');
    if (!/£\d/.test(big)) throw new Error("no amount: " + big);
    console.log("   this week (planned):", big);
    await snap("03-home-empty");
  });
  await step("mark savings done", async () => {
    await page.click('[data-act="toggle-saved"]');
    await page.waitForSelector(".card.green");
    const bal = await text('[data-screen="home"] .ring-wrap .med');
    if (!bal.startsWith("£75")) throw new Error("balance not updated: " + bal);
  });
  await step("log shifts via sheet", async () => {
    await page.click('[data-go="shifts"]');
    await page.waitForSelector('[data-screen="shifts"].active');
    const days = await page.locator('[data-act="add-shift"]').all();
    for (const [i, h, type] of [[0, "8", "standard"], [1, "8", "standard"], [2, "12", "ot"], [3, "8", "standard"], [4, "6", "standard"]]) {
      await days[i].click();
      await page.waitForSelector("#sheet:not(.hidden)");
      await page.fill("#sh-hours", h);
      await page.click(`[data-seg="sh-type"] [data-v="${type}"]`);
      await page.click('[data-act="save-shift"]');
      await page.waitForSelector("#sheet.hidden", { state: "attached" });
    }
    const pills = await page.locator(".shift-pill").count();
    if (pills !== 5) throw new Error("expected 5 pills, got " + pills);
    console.log("   week hours:", await text('[data-screen="shifts"] .stat .val'));
    await snap("04-shifts");
  });
  await step("one-tap preset logs a shift", async () => {
    const sun = page.locator('.day-row').nth(6).locator('[data-act="quick-shift"]').first();
    const label = (await sun.textContent()).trim();
    await sun.click();
    await page.waitForFunction(() => document.querySelectorAll(".shift-pill").length === 6);
    console.log("   tapped:", label);
    // preset chip in the sheet fills hours + note
    await page.locator('[data-act="add-shift"]').first().click();
    await page.waitForSelector("#sheet:not(.hidden)");
    await page.locator("#sheet .chip[data-preset]").last().click();
    const h = await page.inputValue("#sh-hours"), n = await page.inputValue("#sh-note");
    if (h !== "8" || n !== "Nights") throw new Error(`preset fill ${h} ${n}`);
    // Earlies = 8h with a 30 min unpaid break → 7.5 paid hours
    await page.locator("#sheet .chip[data-preset]").first().click();
    if (await page.inputValue("#sh-break") !== "30") throw new Error("break not filled");
    const prev = await text("#sh-preview"); if (!prev.startsWith("7.5 paid hrs")) throw new Error("preview: " + prev);
    console.log("   preview:", prev);
    await page.click("#sheet-backdrop", { position: { x: 10, y: 10 } });
    await page.waitForSelector("#sheet.hidden", { state: "attached" });
  });
  await step("edit + delete a shift", async () => {
    await page.locator(".shift-pill").last().click();
    await page.waitForSelector("#sheet:not(.hidden)");
    await page.fill("#sh-hours", "7");
    await page.click('[data-act="save-shift"]');
    await page.waitForSelector("#sheet.hidden", { state: "attached" });
    await page.locator(".shift-pill").last().click();
    await page.click('[data-act="delete-shift"]');
    await page.waitForSelector("#sheet.hidden", { state: "attached" });
    if (await page.locator(".shift-pill").count() !== 5) throw new Error("delete failed");
  });
  await step("prev week + copy last week", async () => {
    await page.click('[data-act="week-next"]');
    await page.click('[data-act="copy-last-week"]');
    await page.waitForSelector(".shift-pill");
    if (await page.locator(".shift-pill").count() !== 5) throw new Error("copy failed");
    await page.click('[data-act="week-today"]');
  });
  await step("home reflects logged shifts", async () => {
    await page.click('[data-go="home"]');
    const big = await text('[data-screen="home"] .big');
    console.log("   this week (logged):", big);
    if (!(await page.locator(".bars").count())) throw new Error("no bars chart");
    await snap("05-home");
    // week / month toggle
    await page.click('[data-seg="homePeriod"] [data-v="month"]');
    const h2 = await text('[data-screen="home"] .card.accent h2'); if (h2 !== "This month") throw new Error("toggle: " + h2);
    const monthNet = await text('[data-screen="home"] .big'); console.log("   this month (logged):", monthNet, "| bars:", await text('[data-screen="home"] .bars .bar-col.now .l'));
    await page.reload(); await page.waitForSelector('[data-screen="home"].active');
    if ((await text('[data-screen="home"] .card.accent h2')) !== "This month") throw new Error("month choice not remembered");
    await page.click('[data-seg="homePeriod"] [data-v="week"]');
  });
  await step("payslip check", async () => {
    await page.click('[data-go="payslip"]');
    await page.waitForSelector('[data-screen="payslip"].active');
    // weekly pay: default period is last week (has no shifts) -> move forward to this week
    await page.click('[data-act="period-next"]');
    await page.waitForSelector("#ps-actual");
    const exp = await text('[data-screen="payslip"] .kv.total .num');
    console.log("   expected net:", exp);
    const expN = parseFloat(exp.replace(/[£,]/g, ""));
    await page.fill("#ps-actual", String((expN - 40).toFixed(2)));
    await page.waitForSelector(".verdict.under", { timeout: 3000 });
    await page.fill("#ps-actual", String((expN + 2).toFixed(2)));
    await page.waitForSelector(".verdict.ok", { timeout: 3000 });
    await page.click('[data-act="save-check"]');
    await page.waitForSelector(".check-item");
    await snap("06-payslip");
  });
  await step("payslip manual hours (no shifts period)", async () => {
    await page.click('[data-act="period-prev"]'); await page.click('[data-act="period-prev"]');
    await page.waitForSelector("#ps-hours");
    await page.fill("#ps-hours", "40");
    await page.waitForTimeout(600);
    console.log("   40h manual gross:", await text('[data-screen="payslip"] .kv .num'));
  });
  await step("plan renders chart + table", async () => {
    await page.click('[data-go="plan"]');
    await page.waitForSelector("#plan-chart");
    await page.evaluate(() => document.querySelectorAll("details.section").forEach(d => d.open = true));
    const rows = await page.locator("#plan-results tbody tr").count();
    if (rows < 12) throw new Error("rows " + rows);
    // plan: shift-rate field shows £14.85, changing basic keeps it, switching to % shows 10
    const sr = await page.inputValue("#pl-shiftrate"); if (sr !== "14.85") throw new Error("shift rate field " + sr);
    await page.fill('[data-bind="profile.hourly"]', "14"); await page.waitForTimeout(300);
    let prof = await page.evaluate(() => JSON.parse(localStorage.getItem("pence_v2")).profile);
    if (Math.abs(prof.hourly * (1 + prof.shiftPct / 100) - 14.85) > 0.001) throw new Error("rate not kept: " + JSON.stringify(prof));
    await page.selectOption('[data-bind="profile.shiftMode"]', "pct"); await page.waitForSelector('[data-bind="profile.shiftPct"]');
    await page.fill('[data-bind="profile.hourly"]', "13.50"); await page.fill('[data-bind="profile.shiftPct"]', "10"); await page.waitForTimeout(300);
    await page.fill('[data-bind="expenses.rent"]', "600");
    await page.waitForTimeout(400);
    console.log("   kpis:", (await page.locator("#plan-results .kpi").allTextContents()).map(s => s.replace(/\s+/g, " ").trim()).join(" | "));
    await page.click('[data-act="add-extra"]');
    await page.fill('[data-extra="0"][data-k="label"]', "Child benefit");
    await page.fill('[data-extra="0"][data-k="amount"]', "100");
    await page.waitForTimeout(100);
    await snap("07-plan");
  });
  await step("settings: pension + student loan affect payslip", async () => {
    await page.click('[data-go="settings"]');
    await page.fill('[data-bind="profile.pensionPct"]', "5");
    await page.selectOption('[data-bind="profile.studentLoan"]', "plan2");
    await page.click('[data-seg="payFreq"] [data-v="monthly"]');
    await snap("08-settings");
    await page.click('[data-go="payslip"]');
    await page.waitForSelector("#ps-hours");
    await page.fill("#ps-hours", "160");
    await page.waitForTimeout(600);
    const kvs = (await page.locator('[data-screen="payslip"] .kv').allTextContents()).map(s => s.replace(/\s+/g, " ").trim());
    console.log("   monthly 160h:", kvs.join(" | "));
    if (!kvs.some(k => k.includes("Pension"))) throw new Error("no pension line");
  });
  await step("week can start on Sunday", async () => {
    await page.click('[data-go="settings"]');
    await page.click('[data-seg="weekStart"] [data-v="0"]');
    await page.click('[data-go="shifts"]');
    const first = (await page.locator(".day-row .dn").first().textContent()).trim();
    const last = (await page.locator(".day-row .dn").last().textContent()).trim();
    if (first !== "Sun" || last !== "Sat") throw new Error(`week runs ${first}–${last}`);
    await page.click('[data-go="settings"]'); await page.click('[data-seg="weekStart"] [data-v="1"]');
    await page.click('[data-go="shifts"]');
    if ((await page.locator(".day-row .dn").first().textContent()).trim() !== "Mon") throw new Error("Monday not restored");
  });
  await step("pay month start day + pay weeks", async () => {
    await page.click('[data-go="settings"]');
    await page.click('[data-seg="payFreq"] [data-v="monthly"]');
    await page.fill('[data-bind="profile.periodStartDay"]', "26"); await page.waitForTimeout(100);
    await page.click('[data-go="payslip"]');
    const t = await text('[data-screen="payslip"] .nav-row .title'); if (!t.includes("–")) throw new Error("period label: " + t);
    console.log("   pay period:", t.split("\n")[0].trim());
    await page.click('[data-go="home"]'); await page.click('[data-seg="homePeriod"] [data-v="month"]');
    const sub = await text('[data-screen="home"] .screen-head .sub'); if (!sub.startsWith("Pay month")) throw new Error("home period: " + sub);
    await page.click('[data-act="period-weeks"][data-n="5"]');
    const hrs = await text('[data-screen="home"] .stat .val'); if (!hrs.endsWith("/ 187.5")) throw new Error("5 weeks planned hours: " + hrs);
    await page.click('[data-act="period-weeks"][data-n="0"]');
    console.log("   5 pay weeks →", hrs.replace(/\s+/g, " "));
    await page.click('[data-seg="homePeriod"] [data-v="week"]');
    await page.click('[data-go="settings"]'); await page.fill('[data-bind="profile.periodStartDay"]', "1");
  });
  await step("persists across reload", async () => {
    await page.reload();
    await page.waitForSelector('[data-screen="home"].active');
    if (!(await page.locator(".bars").count())) throw new Error("state lost");
  });
  await step("v1 migration", async () => {
    await page.evaluate(() => { localStorage.clear(); localStorage.setItem("pence_inputs", JSON.stringify({ hourly: "14", shiftRate: "10", baseHours: "40", otHours: "2", otMult: "1.5", exp_rent: "700", exp_food: "200", loans: "50", isaWeekly: "60", startSavings: "900", interestRate: "4.5", months: "18", goal: "5000" })); localStorage.setItem("pence_extra_incomes", JSON.stringify([{ label: "Solar", amount: 200, freqMonths: 3 }])); });
    await page.reload();
    await page.waitForSelector('[data-screen="home"].active', { timeout: 3000 });
    const s = await page.evaluate(() => JSON.parse(localStorage.getItem("pence_v2")));
    if (s.profile.hourly !== 14 || s.savings.balance !== 900 || s.extraIncomes.length !== 1) throw new Error("bad migration " + JSON.stringify(s.profile));
  });
  // tax engine spot checks
  await step("tax engine spot checks", async () => {
    const r = await page.evaluate(() => {
      const p = { pensionPct: 0, studentLoan: "none" };
      return { a30k: calcDeductions(30000, 1, p), a60k: calcDeductions(60000, 1, p), a110k: calcDeductions(110000, 1, p), a150k: calcDeductions(150000, 1, p), wk500: calcDeductions(500, 1 / 52, p) };
    });
    const near = (x, y, tol = 1) => Math.abs(x - y) <= tol;
    // £30k: tax (30000-12570)*0.2 = 3486; NI = 17430*0.08 = 1394.40
    if (!near(r.a30k.tax, 3486) || !near(r.a30k.ni, 1394.4)) throw new Error("30k wrong " + JSON.stringify(r.a30k));
    // £60k: tax 37700*0.2 + (60000-50270)*0.4 = 7540+3892 = 11432; NI 37700*.08 + 9730*.02 = 3016+194.6
    if (!near(r.a60k.tax, 11432) || !near(r.a60k.ni, 3210.6)) throw new Error("60k wrong " + JSON.stringify(r.a60k));
    // £110k: PA = 12570-5000 = 7570; ti = 102430; tax = 7540 + (102430-37700)*.4 = 7540+25892 = 33432
    if (!near(r.a110k.tax, 33432)) throw new Error("110k wrong " + JSON.stringify(r.a110k));
    // £150k: PA 0; ti 150000; tax = 7540 + (125140-37700)*.4 + (150000-125140)*.45 = 7540+34976+11187 = 53703
    if (!near(r.a150k.tax, 53703)) throw new Error("150k wrong " + JSON.stringify(r.a150k));
    // £500/wk: PA 241.73; tax (500-241.73)*.2 = 51.65; NI (500-241.73)*.08 = 20.66
    if (!near(r.wk500.tax, 51.65, .05) || !near(r.wk500.ni, 20.66, .05)) throw new Error("wk500 wrong " + JSON.stringify(r.wk500));
    console.log("   £30k:", JSON.stringify(r.a30k), "\n   £500/wk:", JSON.stringify(r.wk500));
  });

  await browser.close(); server.close();
  console.log("\n" + (errors.length ? "ERRORS:\n" + errors.join("\n") : "No errors."));
  process.exit(errors.length ? 1 : 0);
})();
