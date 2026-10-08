import test, { after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { chromium } from "playwright";

// Local fixtures only, actual Leaflet 1.9.4. No production API or Notion access.
const fixture = {
  generatedAt: "2026-10-08T15:30:00Z",
  trip: { name: "秋の京都 · 検証用旅程", slug: "sample-trip", timezone: "Asia/Tokyo", start: "2026-10-08", end: "2026-10-11" },
  places: [
    { id: "station", name: "京都駅", latitude: 34.9858, longitude: 135.7588, address: "京都市下京区", phone: "+81 75-123-4567", website: "https://example.test/station", notes: "中央改札に集合" },
    { id: "temple", name: "清水寺", latitude: 34.9949, longitude: 135.785, address: "京都市東山区", website: "https://example.test/temple" },
    { id: "hotel", name: "宿", latitude: 35.011, longitude: 135.768 },
    { id: "missing", name: "位置未登録", address: "京都市" },
  ],
  items: [
    { id: "lunch", title: "昼食", type: "Meal", start: "2026-10-09T03:00:00Z", end: "2026-10-09T04:00:00Z", placeId: "temple", status: "Confirmed" },
    { id: "arrival", title: "京都駅に集合", type: "Meeting", start: "2026-10-08T15:30:00Z", end: "2026-10-08T16:00:00Z", placeId: "station", status: "Confirmed", reservationStatus: "Booked", perPersonCost: 600, totalCost: 1200, currency: "JPY", notes: "中央改札で待ち合わせ。\n公開用メモ", reservationUrl: "https://example.test/reservation?a=1&b=2" },
    { id: "transit", title: "清水寺へ移動", type: "Transit", start: "2026-10-09T01:00:00Z", end: "2026-10-09T01:30:00Z", fromId: "station", toId: "temple", transport: "Bus", status: "Confirmed" },
    { id: "visit", title: "清水寺を見学", type: "Sightseeing", start: "2026-10-09T01:30:00Z", end: "2026-10-09T03:00:00Z", placeId: "temple", status: "Confirmed", notes: "歩きやすい靴で" },
    { id: "checkin", title: "宿にチェックイン", type: "Stay", start: "2026-10-09T06:00:00Z", end: "2026-10-09T07:00:00Z", placeId: "hotel", status: "Confirmed" },
    { id: "missing-location", title: "自由メモ", type: "Note", start: "2026-10-09T07:00:00Z", placeId: "missing", notes: "雨の場合は連絡" },
    { id: "next-day", title: "翌日の朝食", type: "Meal", start: "2026-10-10T00:00:00Z", placeId: "hotel", status: "Tentative" },
    { id: "cancelled", title: "中止の予定", type: "Activity", start: "2026-10-09T00:00:00Z", placeId: "station", status: "Cancelled" },
  ],
};
const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, "http://localhost").pathname;
    if (path.startsWith("/api/")) { res.writeHead(200, { "Content-Type": "application/json", "X-Itinerary-Cache": "hit" }); res.end(JSON.stringify(fixture)); return; }
    if (path === "/favicon.ico") { res.writeHead(204); res.end(); return; }
    if (!["/", "/index.html", "/app.js", "/model.mjs", "/styles.css"].includes(path)) { res.writeHead(404); res.end(); return; }
    const file = path === "/" ? "index.html" : path.slice(1);
    res.writeHead(200, { "Content-Type": { ".html": "text/html", ".js": "application/javascript", ".mjs": "application/javascript", ".css": "text/css" }[extname(file)] }); res.end(await readFile(resolve("dist", file)));
  } catch { res.writeHead(500); res.end(); }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
const browser = await chromium.launch({ headless: true, ...(process.platform === "win32" ? { channel: process.env.BROWSER_CHANNEL || "chrome" } : {}) });
after(async () => { await browser.close(); await new Promise((resolve) => server.close(resolve)); });
await mkdir("artifacts", { recursive: true });
const leaflet = await readFile("node_modules/leaflet/dist/leaflet.js", "utf8"), css = await readFile("node_modules/leaflet/dist/leaflet.css", "utf8");
const instrument = `;window.__mapCalls={fit:0,pan:0,options:[]};for(const [key,counter] of [['fitBounds','fit'],['panTo','pan']]){const original=L.Map.prototype[key];L.Map.prototype[key]=function(...args){window.__mapCalls[counter]++;window.__mapCalls.options.push({method:key,options:args[1]});return original.apply(this,args);}}`;
const tile = '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#dbe6df"/><path d="M0 64H256 M0 128H256 M0 192H256 M64 0V256 M128 0V256 M192 0V256" stroke="#c4d3c8"/><text x="12" y="24" fill="#4e625b" font-size="12">Test map tile</text></svg>';

async function open(t, options = {}) {
  const context = await browser.newContext({ viewport: options.desktop ? { width: 1440, height: 900 } : { width: 390, height: 844 }, timezoneId: "America/Los_Angeles", reducedMotion: options.motion || "reduce", hasTouch: !options.desktop });
  const page = await context.newPage(), errors = [], consoles = [];
  page.setDefaultTimeout(8000);
  page.on("pageerror", (error) => errors.push(error.message)); page.on("console", (message) => { if (message.type() === "error") consoles.push(message.text()); });
  await context.route("https://unpkg.com/**", async (route) => {
    if (options.noMap && route.request().url().endsWith("leaflet.js")) return route.abort();
    const isCss = route.request().url().endsWith(".css"); await route.fulfill({ contentType: isCss ? "text/css" : "application/javascript", body: isCss ? css : leaflet + "\n" + instrument });
  });
  await context.route("https://tile.openstreetmap.org/**", (route) => options.noTiles ? route.abort() : route.fulfill({ contentType: "image/svg+xml", body: tile }));
  for (const pattern of ["https://example.test/**", "https://www.google.com/**"]) await context.route(pattern, (route) => route.fulfill({ contentType: "text/html", body: "<title>External link fixture</title><p>Link opened</p>" }));
  if (options.payload || options.cache) await context.route("**/api/itinerary", (route) => route.fulfill({ contentType: "application/json", headers: { "X-Itinerary-Cache": options.cache || "hit" }, body: JSON.stringify(options.payload || fixture) }));
  t.after(async () => {
    assert.deepEqual(errors, [], "no uncaught application errors");
    const unexpected = consoles.filter((message) => !(options.noMap || options.noTiles || options.apiFailure) || !/Failed to load resource/.test(message));
    assert.deepEqual(unexpected, [], "no unexpected console errors"); await context.close();
  });
  await page.clock.install({ time: new Date("2026-10-08T15:30:00Z") }); await page.goto(base); await page.locator(".item").first().waitFor();
  if (!options.noMap) await page.locator(".place-pin").first().waitFor();
  return { page, context };
}
const card = (page, id) => page.locator(`.item[data-id="${id}"]`);
const selected = (page) => page.locator(".item.active").getAttribute("data-id");
async function noOverflow(page) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, "no document horizontal overflow");
  assert.deepEqual(await page.locator(".timeline-panel, .map-panel").evaluateAll((elements) => elements.filter((el) => el.scrollWidth > el.clientWidth + 1).map((el) => el.className)), [], "no panel horizontal overflow");
}

test("mobile: zone, sorting, empty dates, map update, panel modes, 44px and touch", async (t) => {
  const { page } = await open(t);
  assert.equal(await page.locator('.day-button[aria-pressed="true"]').getAttribute("data-day"), "2026-10-09");
  assert.deepEqual(await page.locator(".item").evaluateAll((els) => els.map((el) => el.dataset.id)), ["arrival", "transit", "visit", "lunch", "checkin", "missing-location"]);
  assert.match(await card(page, "arrival").locator(".time").innerText(), /00:30.*01:00/);
  assert.equal(await page.locator(".place-pin").count(), 3); assert.equal(await page.locator(".route-hit").count(), 1); assert.match(await page.locator(".map-legend").innerText(), /概略線/);
  assert.equal(await card(page, "arrival").evaluate((el) => el.classList.contains("same-place")), true);
  assert.equal(await card(page, "transit").evaluate((el) => el.classList.contains("moving")), true);
  const mr = await page.locator(".map-panel").boundingBox(), tr = await page.locator(".timeline-panel").boundingBox();
  assert.ok(mr.height / 844 >= .32 && mr.height / 844 <= .4); assert.ok(tr.y >= mr.height - 1); await noOverflow(page);
  assert.deepEqual(await page.locator("button, .actions a, .leaflet-control-zoom a, .place-pin").evaluateAll((els) => els.filter((el) => { const r = el.getBoundingClientRect(); return r.width && r.height && (r.width < 44 || r.height < 44); }).map((el) => ({ class: el.className, text: el.textContent }))), []);
  assert.equal(await page.locator(".timeline-node").evaluateAll((els) => els.every((el) => el.getBoundingClientRect().left >= 0)), true, "node hit areas are not clipped at screen edge");
  await page.locator('button[data-mode="minimal"]').tap(); assert.equal(await page.locator("#map").isVisible(), false);
  await page.locator('button[data-mode="expanded"]').tap(); assert.equal(await page.locator(".timeline-panel").evaluate((el) => el.inert), true); assert.equal(Math.round((await page.locator(".map-panel").boundingBox()).height), 844);
  await page.keyboard.press("Escape"); assert.equal(await page.locator(".map-panel").getAttribute("data-mode"), "standard");
  await page.locator('[data-day="2026-10-10"]').tap(); assert.equal(await page.locator(".item").count(), 1); assert.equal(await page.locator(".place-pin").count(), 1);
  await page.locator('[data-day="2026-10-11"]').tap(); assert.match(await page.locator(".empty").innerText(), /公開予定はありません/); assert.equal(await page.locator(".place-pin").count(), 0);
  await page.locator('[data-other-day="2026-10-09"]').tap(); await page.screenshot({ path: "artifacts/mobile-390x844.png" });
});

test("date change while map is minimal fits the new day when map is restored", async (t) => {
  const { page } = await open(t);
  const fit = await page.evaluate(() => __mapCalls.fit);
  await page.locator('button[data-mode="minimal"]').tap(); await page.locator('[data-day="2026-10-10"]').tap();
  assert.equal(await page.evaluate(() => __mapCalls.fit), fit);
  await page.locator('button[data-mode="standard"]').tap(); await page.clock.runFor(100);
  assert.equal(await page.evaluate(() => __mapCalls.fit), fit + 1); assert.equal(await page.locator(".place-pin").count(), 1);
});

test("desktop: independent panes, details independence and bidirectional map focus", async (t) => {
  const { page } = await open(t, { desktop: true });
  const tl = await page.locator(".timeline-panel").boundingBox(), mp = await page.locator(".map-panel").boundingBox(); assert.ok(tl.x < mp.x && tl.width >= 360 && tl.width <= 480); assert.equal(mp.height, 900);
  await card(page, "arrival").locator(".details-toggle").click(); assert.equal(await page.locator(".item.active").count(), 0);
  assert.match(await card(page, "arrival").locator(".item-details").innerText(), /中央改札.*待ち合わせ/s);
  await page.locator('[data-day="2026-10-10"]').click(); await page.locator('[data-day="2026-10-09"]').click();
  assert.equal(await card(page, "arrival").locator(".details-toggle").getAttribute("aria-expanded"), "true", "detail state survives date navigation");
  await card(page, "arrival").locator(".card-focus").click(); assert.equal(await selected(page), "arrival"); assert.equal(await page.locator(".focused-pin").count(), 1);
  await card(page, "visit").locator(".card-focus").click(); assert.equal(await selected(page), "visit"); assert.equal(await card(page, "arrival").locator(".details-toggle").getAttribute("aria-expanded"), "true"); assert.equal(await page.locator(".focused-pin").count(), 1);
  await page.locator('.place-pin[title^="宿："]').click(); await page.clock.runFor(1200); assert.equal(await selected(page), "checkin");
  assert.ok(Math.abs((await card(page, "checkin").boundingBox()).y - 450) < 6, "map-origin scroll uses desktop spot");
  await page.locator('.place-pin[title^="清水寺："]').click(); assert.equal(await page.locator(".popup-item").count(), 3);
  await page.getByRole("button", { name: "10:30 清水寺を見学", exact: true }).click(); await page.clock.runFor(1200); assert.equal(await selected(page), "visit");
  await page.locator(".route-hit").focus(); await page.keyboard.press("Enter"); await page.clock.runFor(1200); assert.equal(await selected(page), "transit"); assert.equal(await page.locator('.route-hit[aria-pressed="true"]').count(), 1);
  await page.locator(".collapse-all").click(); assert.equal(await card(page, "arrival").locator(".details-toggle").getAttribute("aria-expanded"), "false"); await noOverflow(page); await page.screenshot({ path: "artifacts/desktop-1440x900.png" });
});

test("keyboard only: dates, summary, details, links, nodes, markers and lines", async (t) => {
  const { page, context } = await open(t, { desktop: true });
  await page.locator('[data-day="2026-10-09"]').focus(); await page.keyboard.press("ArrowRight"); assert.equal(await page.locator('.day-button[aria-pressed="true"]').getAttribute("data-day"), "2026-10-10"); await page.keyboard.press("ArrowLeft");
  for (let count = 0; count < 12 && !(await page.locator(".card-focus").first().evaluate((el) => el === document.activeElement)); count++) await page.keyboard.press("Tab");
  assert.equal(await page.locator(".card-focus").first().evaluate((el) => el === document.activeElement), true);
  await page.keyboard.press("Space"); assert.equal(await selected(page), "arrival"); await page.keyboard.press("Tab"); await page.keyboard.press("Enter"); assert.equal(await card(page, "arrival").locator(".details-toggle").getAttribute("aria-expanded"), "true");
  await page.keyboard.press("Tab"); assert.equal(await page.evaluate(() => document.activeElement.tagName), "A");
  const promised = context.waitForEvent("page"); await page.keyboard.press("Enter"); const popup = await promised; await popup.waitForLoadState(); assert.match(popup.url(), /example\.test/); assert.equal(await popup.evaluate(() => window.opener), null); await popup.close(); assert.equal(await selected(page), "arrival");
  await card(page, "visit").locator(".timeline-node").focus(); await page.keyboard.press("Space"); assert.equal(await selected(page), "visit");
  await page.locator('.place-pin[title^="宿："]').focus(); await page.keyboard.press("Space"); await page.clock.runFor(1200); assert.equal(await selected(page), "checkin");
  await page.locator(".route-hit").focus(); await page.keyboard.press("Space"); await page.clock.runFor(1200); assert.equal(await selected(page), "transit"); assert.notEqual(await card(page, "transit").locator(".card-focus").evaluate((el) => getComputedStyle(el).outlineStyle), "none");
});

test("manual map zoom survives focus and automatic focus runs after scroll settles", async (t) => {
  const { page } = await open(t, { desktop: true, motion: "no-preference" });
  await page.locator(".leaflet-control-zoom-in").click(); await page.clock.runFor(500); const fit = await page.evaluate(() => __mapCalls.fit);
  await card(page, "transit").locator(".card-focus").click(); await card(page, "visit").locator(".card-focus").click(); assert.equal(await page.evaluate(() => __mapCalls.fit), fit);
  await page.locator(".show-all").click(); assert.equal(await page.evaluate(() => __mapCalls.fit), fit + 1);
  await card(page, "arrival").locator(".details-toggle").click(); await page.clock.runFor(300);
  const panBefore = await page.evaluate(() => __mapCalls.pan);
  await page.locator(".timeline-panel").evaluate((el) => { el.scrollTop = 350; }); await page.clock.runFor(50);
  assert.equal(await page.evaluate(() => __mapCalls.pan), panBefore, "no map animation while scrolling");
  await page.locator(".timeline-panel").evaluate((el) => { el.scrollTop = 370; }); await page.clock.runFor(300);
  const expected = await page.evaluate(() => {
    const spot = document.querySelector(".timeline-panel").getBoundingClientRect().height / 2;
    return [...document.querySelectorAll(".item")].map((el) => { const r = el.getBoundingClientRect(); return { id: el.dataset.id, d: spot < r.top ? r.top - spot : spot > r.bottom ? spot - r.bottom : 0 }; }).sort((a, b) => a.d - b.d)[0].id;
  });
  assert.equal(await selected(page), expected); const settled = await page.evaluate(() => __mapCalls.pan); await page.clock.runFor(700); assert.equal(await page.evaluate(() => __mapCalls.pan), settled); assert.equal(await card(page, "arrival").locator(".details-toggle").getAttribute("aria-expanded"), "true");
  assert.ok(settled - panBefore <= 1, "at most one pan after a scroll burst");
});

test("mobile map-origin focus aligns with 35% spot and touch line is operable", async (t) => {
  const { page } = await open(t);
  await page.locator('.place-pin[title^="宿："]').tap(); await page.clock.runFor(1200); assert.equal(await selected(page), "checkin");
  const panel = await page.locator(".timeline-panel").boundingBox(), focused = await card(page, "checkin").boundingBox();
  assert.ok(Math.abs(focused.y - (panel.y + panel.height * .35)) < 6);
  await page.locator(".route-hit").tap(); await page.clock.runFor(1200); assert.equal(await selected(page), "transit");
});

test("pending refresh cannot be repeated while the response is slow", async (t) => {
  const { page, context } = await open(t);
  let release, calls = 0;
  const pending = new Promise((resolve) => { release = resolve; });
  await context.route("**/api/refresh?*", async (route) => { calls++; await pending; await route.fulfill({ contentType: "application/json", headers: { "X-Itinerary-Cache": "refreshed" }, body: JSON.stringify(fixture) }); });
  await page.locator(".publish-button").click(); await page.clock.fastForward(2500);
  assert.equal(await page.locator(".publish-button").isDisabled(), true);
  await page.locator(".publish-button").evaluate((el) => el.click()); assert.equal(calls, 1);
  release(); await page.locator(".publish-status").filter({ hasText: "最新の旅程" }).waitFor();
});

test("refresh failure, stale cache, throttled and success keep itinerary and independent state", async (t) => {
  for (const mode of ["failure", "stale", "throttled", "refreshed"]) {
    const { page, context } = await open(t, { desktop: true, apiFailure: mode === "failure" });
    await card(page, "arrival").locator(".details-toggle").click(); await card(page, "arrival").locator(".card-focus").click();
    await context.route("**/api/refresh?*", (route) => route.fulfill({ status: mode === "failure" ? 502 : 200, contentType: "application/json", headers: { "X-Itinerary-Cache": mode }, body: JSON.stringify(mode === "failure" ? { error: "fixture failure" } : fixture) }));
    await page.locator(".publish-button").click(); await page.locator(".publish-status").filter({ hasText: mode === "refreshed" ? "最新の旅程" : mode === "throttled" ? "クールダウン" : "最新でない可能性" }).waitFor();
    assert.equal(await page.locator(".item").count(), 6); assert.equal(await card(page, "arrival").locator(".details-toggle").getAttribute("aria-expanded"), "true"); assert.equal(await selected(page), "arrival");
    if (mode !== "failure") { assert.equal(await page.locator(".publish-button").isDisabled(), true); await page.clock.fastForward(61000); assert.equal(await page.locator(".publish-button").isDisabled(), false); }
  }
});

test("Leaflet load failure preserves itinerary and usable external maps link", async (t) => {
  const { page, context } = await open(t, { noMap: true }); await page.locator(".map-status").filter({ hasText: "地図ライブラリを読み込めません" }).waitFor();
  await card(page, "arrival").locator(".card-focus").tap(); await card(page, "arrival").locator(".details-toggle").tap();
  const promised = context.waitForEvent("page"); await card(page, "arrival").getByRole("link", { name: "地図・経路を開く" }).click(); const popup = await promised; await popup.waitForLoadState(); assert.match(popup.url(), /google\.com\/maps/); await popup.close(); assert.equal(await selected(page), "arrival"); await noOverflow(page);
});

test("tile failure is announced while pins and itinerary remain usable", async (t) => {
  const { page } = await open(t, { noTiles: true }); await page.locator(".map-status").filter({ hasText: "背景地図を読み込めません" }).waitFor(); assert.equal(await page.locator(".place-pin").count(), 3); await card(page, "arrival").locator(".card-focus").tap(); assert.equal(await selected(page), "arrival");
});

test("malicious HTML/attributes stay text; unsafe URL is not an actionable link", async (t) => {
  const payload = structuredClone(fixture); payload.trip.name = '<img src=x onerror="window.pwned=1">';
  payload.items[1].id = 'x" data-pwned="yes'; payload.items[1].title = '<script>window.pwned=1</script>'; payload.items[1].notes = '<svg onload="window.pwned=1">'; payload.items[1].reservationUrl = "javascript:window.pwned=1";
  const { page } = await open(t, { payload }); const malicious = page.locator(".item").first(); await malicious.locator(".details-toggle").click(); await malicious.locator(".card-focus").click();
  assert.equal(await page.locator("[data-pwned]").count(), 0); assert.equal(await page.locator(".item script, .item svg, h1 img").count(), 0); assert.equal(await page.evaluate(() => window.pwned), undefined); assert.equal(await page.locator('a[href^="javascript:"]').count(), 0); assert.match(await malicious.locator(".notes").last().innerText(), /<svg/);
});

test("200% text, zoom-equivalent viewport, reduced motion and initial stale cache", async (t) => {
  const { page } = await open(t, { cache: "stale" }); assert.match(await page.locator(".publish-status").innerText(), /最新でない可能性/);
  await page.addStyleTag({ content: "html { font-size: 200%; }" }); await card(page, "arrival").locator(".details-toggle").click(); await noOverflow(page); await page.screenshot({ path: "artifacts/mobile-text-200-percent.png" });
  assert.equal(await page.locator("#map").isVisible(), false, "large text leaves itinerary space");
  await page.locator('button[data-mode="expanded"]').click(); assert.equal(await page.locator("#map").isVisible(), true); await page.keyboard.press("Escape");
  await page.locator('button[data-mode="minimal"]').click(); assert.equal(await page.locator("#map").isVisible(), false); await page.setViewportSize({ width: 720, height: 450 }); await noOverflow(page); await card(page, "visit").locator(".card-focus").click(); assert.equal(await card(page, "visit").locator(".card-focus").isVisible(), true);
  assert.equal(await page.evaluate(() => matchMedia("(prefers-reduced-motion: reduce)").matches), true); assert.equal(await page.evaluate(() => __mapCalls.options.filter((call) => call.options?.animate === true).length), 0);
});

test("loading and initial API failure offer retry, then itinerary succeeds", async (t) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 } }), page = await context.newPage(); t.after(() => context.close()); await context.route("https://unpkg.com/**", (route) => route.abort());
  let attempt = 0; await context.route("**/api/itinerary", async (route) => { attempt++; await new Promise((resolve) => setTimeout(resolve, 150)); await route.fulfill({ status: attempt === 1 ? 502 : 200, contentType: "application/json", body: JSON.stringify(attempt === 1 ? { error: "fixture" } : fixture) }); });
  await page.clock.install({ time: new Date("2026-10-08T15:30:00Z") });
  await page.goto(base, { waitUntil: "domcontentloaded" }); assert.match(await page.locator(".loading").innerText(), /読み込んでいます/); await page.locator(".retry").waitFor(); await page.locator(".retry").click(); await page.locator(".item").first().waitFor(); assert.equal(attempt, 2);
});

const phase2Fixture = {
  ...structuredClone(fixture),
  items: [
    { id: "group", title: "午前の比較", structure: "Alternative Group", type: "Activity", start: "2026-10-09T00:00:00Z", end: "2026-10-09T04:00:00Z", placeId: "hotel" },
    { id: "series", title: "寺と食事の系列", structure: "Series", parentId: "group", type: "Activity", status: "Confirmed", order: 10, start: "2026-10-09T00:00:00Z", end: "2026-10-09T03:00:00Z" },
    { id: "child-a", title: "系列の寺", parentId: "series", type: "Sightseeing", status: "Confirmed", reservationStatus: "Required", transport: "Walk", start: "2026-10-09T00:00:00Z", end: "2026-10-09T01:00:00Z", placeId: "temple", notes: "系列の公開詳細" },
    { id: "child-b", title: "系列の移動", parentId: "series", type: "Transit", status: "Candidate", reservationStatus: "Pending", transport: "Bus", start: "2026-10-09T02:00:00Z", end: "2026-10-09T03:00:00Z", fromId: "temple", toId: "station" },
    { id: "single", title: "宿で食事", parentId: "group", type: "Meal", status: "Tentative", order: -100, reservationStatus: "Booked", start: "2026-10-09T00:00:00Z", end: "2026-10-09T02:00:00Z", placeId: "hotel", perPersonCost: 1500, currency: "JPY" },
    { id: "third", title: "駅で食事", parentId: "group", type: "Meal", status: "Candidate", order: 0, reservationStatus: "Required", start: "2026-10-09T01:00:00Z", end: "2026-10-09T04:00:00Z", placeId: "station" },
    { id: "cancelled-choice", title: "中止候補", parentId: "group", type: "Meal", status: "Cancelled", start: "2026-10-09T01:00:00Z", placeId: "hotel" },
    { id: "later", title: "翌日の予定", type: "Meal", start: "2026-10-10T00:00:00Z", placeId: "hotel" },
  ],
};
const own = (page, id, selector) => page.locator(`.item[data-id="${id}"] > ${selector}`);
const checkState = (page, id) => own(page, id, ".select-toggle").getAttribute("aria-checked");
async function revealSeries(page) { await own(page, "series", ".details-toggle").click(); }
async function checkPhase2Targets(page) {
  assert.deepEqual(await page.locator("button, summary, input[type=range], .check-label").evaluateAll((els) => els.filter((el) => { const r = el.getBoundingClientRect(); return r.width && r.height && (r.width < 44 || r.height < 44); }).map((el) => ({ class: el.className, text: el.textContent }))), []);
  await noOverflow(page);
}
test("Phase 2 mobile: one candidate, buttons/arrows/swipe, active Series map and independent child detail/focus", async (t) => {
  const { page } = await open(t, { payload: phase2Fixture });
  assert.equal(await page.locator('.activate-candidate[aria-pressed="true"]').getAttribute("data-activate"), "series");
  assert.equal(await page.locator(".place-pin").count(), 2); assert.equal(await page.locator(".route-hit").count(), 1);
  const carousel = page.locator(".group-candidates"), width = (await carousel.boundingBox()).width;
  assert.ok(Math.abs((await page.locator(".candidate-slot").first().boundingBox()).width - width) < 12);
  await own(page, "group", ".card-focus").tap(); assert.equal(await page.locator(".focused-pin").count(), 2);
  await page.getByRole("button", { name: "午前の比較の次の候補", exact: true }).tap(); await page.clock.runFor(400);
  assert.equal(await page.locator('.activate-candidate[aria-pressed="true"]').getAttribute("data-activate"), "single"); assert.equal(await page.locator(".place-pin").count(), 1); assert.equal(await page.locator(".focused-pin").count(), 1);
  await carousel.focus(); await page.keyboard.press("ArrowRight"); await page.clock.runFor(300); assert.equal(await page.locator('.activate-candidate[aria-pressed="true"]').getAttribute("data-activate"), "third");
  await carousel.scrollIntoViewIfNeeded();
  const cdp = await page.context().newCDPSession(page), r = await carousel.boundingBox(), clip = await page.locator(".timeline-panel").boundingBox();
  const touchY = Math.min(clip.y + clip.height - 40, Math.max(r.y, clip.y) + 60), touchX = r.x + r.width * .15;
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: touchX, y: touchY }] });
  for (let step = 1; step <= 8; step++) { await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: touchX + r.width * .7 * step / 8, y: touchY }] }); await new Promise((resolve) => setTimeout(resolve, 25)); }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); await page.clock.runFor(700);
  assert.equal(await page.locator('.activate-candidate[aria-pressed="true"]').getAttribute("data-activate"), "single", `actual horizontal touch gesture switches candidate: ${JSON.stringify({ r, clip, scroll: await carousel.evaluate((el) => el.scrollLeft) })}`);
  await carousel.focus(); await page.keyboard.press("Home"); await page.clock.runFor(400); await cdp.detach();
  assert.equal(await page.locator('.activate-candidate[aria-pressed="true"]').getAttribute("data-activate"), "series");
  await revealSeries(page); await own(page, "child-a", ".card-focus").tap(); assert.equal(await selected(page), "child-a");
  await own(page, "child-a", ".details-toggle").tap(); await own(page, "child-b", ".card-focus").tap(); assert.equal(await selected(page), "child-b");
  assert.equal(await own(page, "child-a", ".details-toggle").getAttribute("aria-expanded"), "true"); assert.match(await card(page, "child-a").locator(".notes").innerText(), /公開詳細/);
  await own(page, "child-a", ".card-focus").scrollIntoViewIfNeeded(); await page.screenshot({ path: "artifacts/phase2-mobile-series.png" });
  await checkPhase2Targets(page); await own(page, "group", ".card-focus").scrollIntoViewIfNeeded(); await page.screenshot({ path: "artifacts/phase2-mobile-390x844.png" });
});
test("Phase 2 desktop: 2–3 visible candidates, explicit active state, group/Series/child map focus and no duplicate fallback pin", async (t) => {
  const { page } = await open(t, { desktop: true, payload: phase2Fixture });
  const visibleSlots = () => page.locator(".candidate-slot").evaluateAll((els) => { const r = els[0].parentElement.getBoundingClientRect(); return els.filter((el) => { const b = el.getBoundingClientRect(); return b.left >= r.left - 1 && b.right <= r.right + 1; }).length; });
  assert.equal(await visibleSlots(), 3); await page.setViewportSize({ width: 1100, height: 900 }); assert.equal(await visibleSlots(), 2); await page.setViewportSize({ width: 1440, height: 900 });
  await own(page, "single", ".card-focus").click(); assert.equal(await page.locator('.activate-candidate[aria-pressed="true"]').getAttribute("data-activate"), "single"); assert.equal(await selected(page), "single");
  await page.locator('[data-activate="series"]').click(); await revealSeries(page); await own(page, "series", ".card-focus").click(); assert.equal(await selected(page), "series"); assert.equal(await page.locator(".focused-pin").count(), 2);
  assert.equal(await page.locator('.place-pin[title^="宿："]').count(), 0, "group own Place does not duplicate or add child map data");
  await page.locator('.place-pin[title^="清水寺："]').focus(); await page.keyboard.press("Space"); await page.getByRole("button", { name: "09:00 系列の寺", exact: true }).click(); await page.clock.runFor(1200); assert.equal(await selected(page), "child-a");
  await checkPhase2Targets(page); await own(page, "group", ".card-focus").scrollIntoViewIfNeeded(); await page.screenshot({ path: "artifacts/phase2-desktop-1440x900.png" });
  await own(page, "child-a", ".card-focus").scrollIntoViewIfNeeded(); await page.screenshot({ path: "artifacts/phase2-desktop-series.png" });
});
test("Phase 2 selection: mixed parents use hidden descendants, selected map shape, date/filter retention and clear", async (t) => {
  const { page } = await open(t, { desktop: true, payload: phase2Fixture }); await revealSeries(page);
  await own(page, "child-a", ".select-toggle").focus(); await page.keyboard.press("Space");
  assert.equal(await checkState(page, "group"), "mixed"); assert.equal(await checkState(page, "series"), "mixed"); assert.equal(await page.locator(".selected-pin").count(), 1); assert.ok(await page.locator(".unselected-pin").count());
  await own(page, "child-a", ".card-focus").click(); await own(page, "child-b", ".card-focus").click(); assert.equal(await checkState(page, "child-a"), "true");
  await page.locator(".filter-panel > summary").click(); await page.locator('[data-filter="type"][value="Meal"]').check();
  assert.match(await page.locator(".comparison-status").innerText(), /非表示 1件/); assert.equal(await checkState(page, "group"), "mixed");
  await own(page, "group", ".select-toggle").click(); assert.equal(await checkState(page, "group"), "true"); assert.match(await page.locator(".comparison-status").innerText(), /選択 5件/);
  await page.locator('[data-day="2026-10-10"]').click(); assert.match(await page.locator(".comparison-status").innerText(), /選択 5件/);
  await page.locator('[data-day="2026-10-09"]').click(); assert.equal(await checkState(page, "group"), "true");
  await own(page, "group", ".select-toggle").click(); assert.equal(await checkState(page, "group"), "false");
  await own(page, "group", ".select-toggle").click(); await page.locator(".clear-selection").click(); assert.match(await page.locator(".comparison-status").innerText(), /選択 0件/);
});
test("Phase 2 filters: OR/AND, ancestors, reservation shortcut, Cancelled gate, notification and reset", async (t) => {
  const { page } = await open(t, { desktop: true, payload: phase2Fixture }); await revealSeries(page);
  await own(page, "child-a", ".card-focus").click(); await page.locator(".filter-panel > summary").click();
  await page.locator('[data-filter="type"][value="Meal"]').check(); assert.equal(await page.locator(".item.active").count(), 0); assert.match(await page.locator(".focus-status").innerText(), /解除/);
  await page.locator('[data-filter="type"][value="Transit"]').check(); await page.locator('[data-filter="reservationStatus"][value="Required"]').check();
  assert.deepEqual(await page.locator(".item").evaluateAll((els) => els.map((el) => el.dataset.id)), ["group", "third"]);
  await page.locator(".clear-filters").click(); await page.locator(".reservation-shortcut").click();
  assert.deepEqual(await page.locator(".item").evaluateAll((els) => els.map((el) => el.dataset.id)), ["group", "series", "child-a", "child-b", "third"]);
  await page.locator(".clear-filters").click(); assert.equal(await card(page, "cancelled-choice").count(), 0); await page.locator(".show-cancelled").check(); assert.equal(await card(page, "cancelled-choice").count(), 1);
  await page.locator(".clear-filters").click(); assert.equal(await card(page, "cancelled-choice").count(), 0); assert.doesNotMatch(await page.locator(".comparison-status").innerText(), /フィルター中/);
  await page.locator(".filter-panel").scrollIntoViewIfNeeded(); await page.screenshot({ path: "artifacts/phase2-desktop-filters.png" });
});
test("Phase 2 map time: 15 minute keyboard/range changes preserve timeline, focus, selection and width at boundaries", async (t) => {
  const payload = structuredClone(phase2Fixture); delete payload.items[0].placeId;
  const { page } = await open(t, { desktop: true, payload }); await revealSeries(page);
  await own(page, "child-a", ".select-toggle").click(); await own(page, "child-a", ".card-focus").click();
  const ids = await page.locator(".item").evaluateAll((els) => els.map((el) => el.dataset.id));
  await page.locator(".time-panel > summary").click(); assert.equal(await page.locator(".time-start").inputValue(), "540"); assert.equal(await page.locator(".time-end").inputValue(), "780");
  await page.locator(".time-start").focus(); await page.keyboard.press("ArrowRight"); assert.equal(await page.locator(".time-start").inputValue(), "555");
  await page.locator(".time-start").evaluate((el) => { el.value = 600; el.dispatchEvent(new Event("input", { bubbles: true })); });
  await page.locator(".time-end").evaluate((el) => { el.value = 660; el.dispatchEvent(new Event("input", { bubbles: true })); });
  assert.equal(await page.locator(".place-pin").count(), 0, "endpoint 10:00 excludes 09–10 and 11–12"); assert.equal(await selected(page), "child-a"); assert.equal(await checkState(page, "child-a"), "true");
  assert.deepEqual(await page.locator(".item").evaluateAll((els) => els.map((el) => el.dataset.id)), ids);
  await page.locator(".time-next").click(); assert.equal(await page.locator(".time-start").inputValue(), "660"); assert.equal(await page.locator(".route-hit").count(), 1);
  await page.locator(".time-start").evaluate((el) => { el.value = 0; el.dispatchEvent(new Event("input", { bubbles: true })); }); await page.locator(".time-end").evaluate((el) => { el.value = 60; el.dispatchEvent(new Event("input", { bubbles: true })); }); assert.equal(await page.locator(".time-prev").isDisabled(), true);
  await page.locator(".time-end").evaluate((el) => { el.value = 1440; el.dispatchEvent(new Event("input", { bubbles: true })); }); await page.locator(".time-start").evaluate((el) => { el.value = 1380; el.dispatchEvent(new Event("input", { bubbles: true })); }); assert.equal(await page.locator(".time-next").isDisabled(), true);
  await page.locator(".time-reset").click(); assert.equal(await page.locator(".time-start").inputValue(), "540"); assert.equal(await page.locator(".time-end").inputValue(), "780");
});
test("Phase 2 refresh: existing selection/detail/active/time retained and removed IDs pruned", async (t) => {
  const { page, context } = await open(t, { desktop: true, payload: phase2Fixture }); await revealSeries(page); await own(page, "child-a", ".select-toggle").click();
  await page.locator('[data-activate="single"]').click(); await own(page, "single", ".select-toggle").click(); await own(page, "single", ".details-toggle").click(); await own(page, "single", ".card-focus").click();
  const refreshed = structuredClone(phase2Fixture); refreshed.items = refreshed.items.filter((item) => item.id !== "child-a");
  await context.route("**/api/refresh?*", (route) => route.fulfill({ contentType: "application/json", headers: { "X-Itinerary-Cache": "refreshed" }, body: JSON.stringify(refreshed) }));
  await page.locator(".publish-button").click(); await page.locator(".publish-status").filter({ hasText: "最新の旅程" }).waitFor();
  assert.match(await page.locator(".comparison-status").innerText(), /選択 1件/); assert.equal(await checkState(page, "single"), "true"); assert.equal(await own(page, "single", ".details-toggle").getAttribute("aria-expanded"), "true");
  assert.equal(await page.locator('.activate-candidate[aria-pressed="true"]').getAttribute("data-activate"), "single"); assert.equal(await selected(page), "single"); assert.equal(await page.locator(".time-start").inputValue(), "540");
});
test("Phase 2 accessible mobile 200% text/reduced motion, filters and time panel, keyboard Enter/Space and selected only", async (t) => {
  const { page } = await open(t, { payload: phase2Fixture });
  await page.addStyleTag({ content: "html { font-size: 200%; }" }); await page.locator(".filter-panel > summary").focus(); await page.keyboard.press("Enter");
  await page.locator(".reservation-shortcut").focus(); await page.keyboard.press("Space");
  await own(page, "group", ".select-toggle").focus(); await page.keyboard.press("Space"); await page.locator(".selected-only").check();
  assert.match(await page.locator(".comparison-status").innerText(), /選択 5件/); await page.locator(".time-panel > summary").click();
  await checkPhase2Targets(page); await page.locator(".time-panel").scrollIntoViewIfNeeded(); await page.screenshot({ path: "artifacts/phase2-mobile-text-200-percent.png" });
  await page.locator(".filter-panel").scrollIntoViewIfNeeded(); await page.screenshot({ path: "artifacts/phase2-mobile-text-200-filters.png" });
  await page.locator(".filter-panel > summary").click(); await page.locator(".time-panel > summary").click(); await revealSeries(page);
  await own(page, "child-a", ".card-focus").scrollIntoViewIfNeeded(); await checkPhase2Targets(page); await page.screenshot({ path: "artifacts/phase2-mobile-text-200-series.png" });
  assert.equal(await page.evaluate(() => __mapCalls.options.filter((call) => call.options?.animate === true).length), 0);
});
