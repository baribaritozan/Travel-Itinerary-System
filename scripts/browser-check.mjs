import test, { after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { chromium } from "playwright";
import { withNavigation } from "./ui-navigation.mjs";
import { phase5Fixture } from "./phase5-fixture.mjs";

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
// Serve the deployed asset security headers too: API stubs alone cannot catch
// a Permissions-Policy that prevents the real browser Geolocation API.
const assetHeaders = Object.fromEntries((await readFile("dist/_headers", "utf8")).split(/\r?\n/).flatMap(line => {
  const match = /^\s+([^:]+):\s*(.+)$/.exec(line); return match ? [[match[1], match[2]]] : [];
}));
const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, "http://localhost").pathname;
    if (path.startsWith("/api/")) { res.writeHead(200, { "Content-Type": "application/json", "X-Itinerary-Cache": "hit" }); res.end(JSON.stringify(fixture)); return; }
    if (path === "/favicon.ico") { res.writeHead(204); res.end(); return; }
    if (!["/", "/index.html", "/sw.js", "/manifest.webmanifest", "/icon-192.png", "/icon-512.png"].includes(path) && !/^\/assets\/[a-zA-Z0-9./-]+$/.test(path)) { res.writeHead(404); res.end(); return; }
    const file = path === "/" ? "index.html" : path.slice(1);
    res.writeHead(200, { ...assetHeaders, "Content-Type": { ".html": "text/html", ".js": "application/javascript", ".mjs": "application/javascript", ".css": "text/css", ".png": "image/png", ".webmanifest": "application/manifest+json" }[extname(file)] }); res.end(await readFile(resolve("dist", file)));
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
  const page = withNavigation(await context.newPage()), errors = [], consoles = [];
  page.setDefaultTimeout(8000);
  page.on("pageerror", (error) => errors.push(error.message)); page.on("console", (message) => { if (message.type() === "error") consoles.push(message.text()); });
  await context.route("**/assets/leaflet.*", async (route) => {
    if (options.noMap && /leaflet\.[a-f0-9]+\.js$/.test(route.request().url())) return route.abort();
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
  if (options.initScript) await context.addInitScript(options.initScript);
  await page.clock.install({ time: new Date("2026-10-08T15:30:00Z") }); await page.goto(base); await page.locator(".item").first().waitFor();
  if (!options.minimal) await page.locator(".nav-map").click();
  await page.clock.runFor(250);
  if (!options.noMap && !options.minimal) await page.locator(".place-pin").first().waitFor();
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
  await page.locator('button[data-mode="expanded"]').tap(); assert.equal(await page.locator(".timeline-panel").evaluate((el) => el.inert), true); assert.ok(Math.abs((await page.locator(".map-panel").boundingBox()).height + (await page.locator('.menu-bar').boundingBox()).height - 844) <= 1);
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
  const tl = await page.locator(".timeline-panel").boundingBox(), mp = await page.locator(".map-panel").boundingBox(); assert.ok(tl.x < mp.x && tl.width >= 360 && tl.width <= 480); assert.equal(mp.height + (await page.locator('.menu-bar').boundingBox()).height, 900);
  await card(page, "arrival").locator(".details-toggle").click(); assert.equal(await page.locator(".item.active").count(), 0);
  assert.match(await card(page, "arrival").locator(".item-details").innerText(), /中央改札.*待ち合わせ/s);
  await page.locator('[data-day="2026-10-10"]').click(); await page.locator('[data-day="2026-10-09"]').click();
  assert.equal(await card(page, "arrival").locator(".details-toggle").getAttribute("aria-expanded"), "true", "detail state survives date navigation");
  await card(page, "arrival").locator(".card-focus").click(); assert.equal(await selected(page), "arrival"); assert.equal(await page.locator(".focused-pin").count(), 1);
  await card(page, "visit").locator(".card-focus").click(); assert.equal(await selected(page), "visit"); assert.equal(await card(page, "arrival").locator(".details-toggle").getAttribute("aria-expanded"), "true"); assert.equal(await page.locator(".focused-pin").count(), 1);
  await page.locator('.place-pin[title^="宿："]').click(); await page.clock.runFor(1200); assert.equal(await selected(page), "checkin");
  assert.ok(Math.abs((await card(page, "checkin").boundingBox()).y - tl.height / 2) < 6, "map-origin scroll uses desktop spot");
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
  await page.locator('[data-rail-id="visit"]').focus(); await page.keyboard.press("Space"); assert.equal(await selected(page), "visit");
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
  // Native scroll events arrive on a renderer frame, outside the fake timer queue.
  // Observe each event before advancing the debounce clock; keep all timing assertions.
  await page.locator(".timeline-panel").evaluate(async (el) => { const scrolled = new Promise(resolve => el.addEventListener("scroll", resolve, { once: true })); el.scrollTop = 350; await scrolled; }); await page.clock.runFor(50);
  assert.equal(await page.evaluate(() => __mapCalls.pan), panBefore, "no map animation while scrolling");
  await page.locator(".timeline-panel").evaluate(async (el) => { const scrolled = new Promise(resolve => el.addEventListener("scroll", resolve, { once: true })); el.scrollTop = 370; await scrolled; }); await page.clock.runFor(300);
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
  await page.locator('.leaflet-control-zoom-in').click(); await page.locator('.leaflet-control-zoom-in').click(); await page.clock.runFor(500);
  const touchPoint = await page.locator('.route-hit').evaluate(path => {
    for (let i=1;i<20;i++) { const p=path.getPointAtLength(path.getTotalLength()*i/20), pt=new DOMPoint(p.x,p.y).matrixTransform(path.getScreenCTM()); if(document.elementFromPoint(pt.x,pt.y)===path) return {x:pt.x,y:pt.y}; }
  });
  assert.ok(touchPoint, 'route exposes a real unobstructed touch point'); await page.touchscreen.tap(touchPoint.x,touchPoint.y); await page.clock.runFor(1200); assert.equal(await selected(page), "transit");
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
const own = (page, id, selector) => selector === ".card-focus" ? page.locator(`.item[data-id="${id}"] > .card-heading [data-focus="${id}"], [data-rail-id="${id}"]`).first() : page.locator(`.item[data-id="${id}"] > ${selector}`);
const checkState = (page, id) => own(page, id, ".select-toggle").getAttribute("aria-checked");
async function revealSeries(page) { assert.equal(await card(page, "child-a").isVisible(), true, "series body is visible without opening its details"); }
async function setCandidate(page, id) { const carousel = page.locator(`.group-candidates:has([data-candidate="${id}"])`); const index = await carousel.locator(".candidate-slot").evaluateAll((slots, id) => slots.findIndex(slot => slot.dataset.candidate === id), id); await carousel.focus(); await page.keyboard.press("Home"); for (let n=0;n<index;n++) await page.keyboard.press("ArrowRight"); await page.clock.runFor(400); }
async function checkPhase2Targets(page) {
  assert.deepEqual(await page.locator("button, summary, input[type=range], .check-label").evaluateAll((els) => els.filter((el) => { const r = el.getBoundingClientRect(); return r.width && r.height && (r.width < 44 || r.height < 44); }).map((el) => ({ class: el.className, text: el.textContent }))), []);
  await noOverflow(page);
}
test("Phase 2 mobile: one candidate, buttons/arrows/swipe, active Series map and independent child detail/focus", async (t) => {
  const { page } = await open(t, { payload: phase2Fixture });
  assert.equal(await page.locator('.candidate-slot[data-active="true"]').getAttribute("data-candidate"), "series");
  assert.equal(await page.locator(".place-pin").count(), 2); assert.equal(await page.locator(".route-hit").count(), 1);
  const carousel = page.locator(".group-candidates"), width = (await carousel.boundingBox()).width;
  assert.ok(Math.abs((await page.locator(".candidate-slot").first().boundingBox()).width - width) < 12);
  await own(page, "group", ".card-focus").tap(); assert.equal(await page.locator(".focused-pin").count(), 2);
  await page.getByRole("button", { name: "午前の比較の次の候補", exact: true }).tap(); await page.clock.runFor(400);
  assert.equal(await page.locator('.candidate-slot[data-active="true"]').getAttribute("data-candidate"), "single"); assert.equal(await page.locator(".place-pin").count(), 1); assert.equal(await page.locator(".focused-pin").count(), 1);
  await carousel.focus(); await page.keyboard.press("ArrowRight"); await page.clock.runFor(300); assert.equal(await page.locator('.candidate-slot[data-active="true"]').getAttribute("data-candidate"), "third");
  await carousel.scrollIntoViewIfNeeded();
  const cdp = await page.context().newCDPSession(page), r = await carousel.boundingBox(), clip = await page.locator(".timeline-panel").boundingBox();
  const touchY = Math.min(clip.y + clip.height - 40, Math.max(r.y, clip.y) + 60), touchX = r.x + r.width * .15;
  await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: touchX, y: touchY }] });
  for (let step = 1; step <= 8; step++) { await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: touchX + r.width * .7 * step / 8, y: touchY }] }); await new Promise((resolve) => setTimeout(resolve, 25)); }
  await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] }); await page.clock.runFor(700);
  assert.equal(await page.locator('.candidate-slot[data-active="true"]').getAttribute("data-candidate"), "single", `actual horizontal touch gesture switches candidate: ${JSON.stringify({ r, clip, scroll: await carousel.evaluate((el) => el.scrollLeft) })}`);
  await carousel.focus(); await page.keyboard.press("Home"); await page.clock.runFor(400); await cdp.detach();
  assert.equal(await page.locator('.candidate-slot[data-active="true"]').getAttribute("data-candidate"), "series");
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
  await own(page, "single", ".card-focus").click(); assert.equal(await page.locator('.candidate-slot[data-active="true"]').getAttribute("data-candidate"), "single"); assert.equal(await selected(page), "single");
  await setCandidate(page, "series"); await revealSeries(page); await own(page, "series", ".card-focus").click(); assert.equal(await selected(page), "series"); assert.equal(await page.locator(".focused-pin").count(), 2);
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
  await setCandidate(page, "single"); await own(page, "single", ".select-toggle").click(); await own(page, "single", ".details-toggle").click(); await own(page, "single", ".card-focus").click();
  const refreshed = structuredClone(phase2Fixture); refreshed.items = refreshed.items.filter((item) => item.id !== "child-a");
  await context.route("**/api/refresh?*", (route) => route.fulfill({ contentType: "application/json", headers: { "X-Itinerary-Cache": "refreshed" }, body: JSON.stringify(refreshed) }));
  await page.locator(".publish-button").click(); await page.locator(".publish-status").filter({ hasText: "最新の旅程" }).waitFor();
  assert.match(await page.locator(".comparison-status").innerText(), /選択 1件/); assert.equal(await checkState(page, "single"), "true"); assert.equal(await own(page, "single", ".details-toggle").getAttribute("aria-expanded"), "true");
  assert.equal(await page.locator('.candidate-slot[data-active="true"]').getAttribute("data-candidate"), "single"); assert.equal(await selected(page), "single"); assert.equal(await page.locator(".time-start").inputValue(), "540");
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

const phase3Fixture = {
  ...fixture,
  items: [
    { id: "free", title: "午後の自由時間", structure: "Flexible Block", start: "2026-10-09T04:00:00Z", end: "2026-10-09T06:00:00Z", type: "Activity" },
    { id: "free-a", parentId: "free", title: "寺の散策候補", placeId: "temple", durationMinutes: 30, openingHours: "09:00–17:00", type: "Sightseeing", status: "Candidate", order: 1, reservationStatus: "Not Required", perPersonCost: 500, currency: "JPY" },
    { id: "free-b", parentId: "free", title: "駅の買い物候補", placeId: "station", durationMinutes: 20, type: "Activity", status: "Confirmed", order: 0 },
    { id: "p3-transit", title: "寄り道対象の移動", type: "Transit", transport: "Bus", fromId: "station", toId: "temple", start: "2026-10-09T01:00:00Z", end: "2026-10-09T02:00:00Z" },
    { id: "p3-next", title: "次の固定予定", type: "Meeting", placeId: "temple", start: "2026-10-09T02:30:00Z", end: "2026-10-09T03:00:00Z" },
    { id: "d-item", title: "単独の寄り道", detourForId: "p3-transit", additionalDurationMinutes: 10, durationMinutes: 10, placeId: "hotel", type: "Activity", transport: "Walk" },
    { id: "d-series", title: "系列の寄り道", detourForId: "p3-transit", additionalDurationMinutes: 40, structure: "Series", rejoinPlaceId: "station" },
    { id: "d-child", title: "寄り道の子", parentId: "d-series", placeId: "hotel", durationMinutes: 15, transport: "Car" },
    { id: "d-group", title: "比較する寄り道", detourForId: "p3-transit", additionalDurationMinutes: 30, structure: "Alternative Group" },
    { id: "d-a", title: "寄り道案A", parentId: "d-group", placeId: "hotel", durationMinutes: 10, status: "Confirmed" },
    { id: "d-b", title: "寄り道案B", parentId: "d-group", placeId: "station", durationMinutes: 20, status: "Candidate" },
  ],
};
const geoSuccess = () => {
  window.__geoCalls = 0;
  Object.defineProperty(navigator, "geolocation", { configurable: true, value: { getCurrentPosition(success) { window.__geoCalls++; success({ coords: { latitude: 34.986123, longitude: 135.759456, accuracy: 12 }, timestamp: Date.now() }); }, watchPosition() { throw new Error("watchPosition forbidden"); } } });
};

test("Phase 4 planned route is location-free, safe real popup; copy fallback and transport popup", async t => {
  const { page, context } = await open(t, { initScript: geoSuccess });
  await card(page, "transit").locator(".details-toggle").click();
  assert.match(await page.locator(".transport-label").first().innerText(), /バス/);
  const opened = context.waitForEvent("page"); await page.locator('[data-planned="transit"]').click(); const popup = await opened; await popup.waitForLoadState();
  const url = new URL(popup.url()); assert.equal(url.searchParams.get("origin"), "34.9858,135.7588"); assert.equal(url.searchParams.get("destination"), "34.9949,135.785"); assert.equal(url.searchParams.get("travelmode"), "transit"); assert.equal(await popup.evaluate(() => window.opener), null); await popup.close();
  assert.equal(await page.evaluate(() => __geoCalls), 0);
  await page.evaluate(() => { Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText() { return Promise.reject(new Error("denied")); } } }); });
  await card(page, "transit").locator("[data-copy-place]").first().click(); assert.match(await card(page, "transit").locator(".copy-status").first().innerText(), /選択してコピー/);
  await page.evaluate(() => { navigator.clipboard.writeText = async text => { window.__copied = text; }; }); await card(page, "transit").locator("[data-copy-place]").first().click(); assert.equal(await page.evaluate(() => __copied), "京都駅\n京都市下京区");
  await page.locator(".route-hit").focus(); await page.keyboard.press("Space"); assert.match(await page.locator(".leaflet-popup-content").innerText(), /京都駅.*清水寺.*バス.*10:00.*10:30/s);
});

for (const desktop of [false, true]) test(`Phase 4 visual ${desktop ? 1440 : 390}: saving panel, planned route, 200% text and keyboard`, async t => {
  const { page } = await open(t, { desktop });
  await page.locator(".offline-panel summary").focus(); await page.keyboard.press("Enter"); assert.equal(await page.locator(".save-offline").isVisible(), true);
  await card(page, "transit").locator(".details-toggle").click(); await noOverflow(page); await page.screenshot({ path: `artifacts/phase4-${desktop ? "desktop" : "mobile"}.png` });
  await page.addStyleTag({ content: "html { font-size: 32px !important; }" }); await page.evaluate(() => window.dispatchEvent(new Event("resize"))); await noOverflow(page); await page.screenshot({ path: `artifacts/phase4-${desktop ? "desktop" : "mobile"}-200.png` });
});

test("Phase 4 transport overlapping labels preserve focused label and missing From disables just planned operation", async t => {
  const payload = structuredClone(fixture); payload.items.push({ ...payload.items.find(i => i.id === "transit"), id: "duplicate", title: "徒歩区間", transport: "Walk" }); payload.items.find(i => i.id === "transit").fromId = "missing";
  const { page } = await open(t, { payload, initScript: geoSuccess });
  await card(page, "transit").locator(".details-toggle").click(); assert.equal(await page.locator('[data-planned="transit"]').isDisabled(), false, "address fallback resolves missing-coordinate From");
  await card(page, "duplicate").locator(".card-focus").click(); assert.equal(await page.locator('.transport-label').filter({ hasText: "徒歩" }).isVisible(), true);
  const changed = structuredClone(payload); changed.places.find(p => p.id === "missing").address = "";
  await page.route("**/api/refresh?*", route => route.fulfill({ contentType: "application/json", headers: { "X-Itinerary-Cache": "refreshed" }, body: JSON.stringify(changed) }));
  await page.locator(".publish-button").click(); await page.locator('.publish-status').filter({hasText:'最新の旅程'}).waitFor(); assert.equal(await page.locator('[data-planned="transit"]').isDisabled(), true); assert.match(await card(page, "transit").locator(".planned-reason").innerText(), /出発地/);
  await page.locator(".location-panel summary").click(); await page.locator(".location-button").click(); assert.equal(await page.locator('[data-directions="transit"]').isDisabled(), false);
});
test("Phase 3 Flexible Block checklist: order/facts/focus/selection/filters/parent map time and touch", async t => {
  const { page } = await open(t, { payload: phase3Fixture, initScript: geoSuccess });
  assert.equal(await page.evaluate(() => __geoCalls), 0);
  assert.deepEqual(await page.locator('.flexible-candidates > .item').evaluateAll(els => els.map(e => e.dataset.id)), ["free-b", "free-a"]);
  assert.equal(await page.locator('.flexible-candidates .timeline-node').count(), 0);
  assert.match(await own(page, "free-a", ".card-focus").innerText(), /時刻未定.*30分/s);
  await own(page, "free-a", ".details-toggle").tap(); assert.match(await card(page, "free-a").innerText(), /09:00–17:00/);
  await own(page, "free", ".card-focus").tap(); assert.equal(await page.locator(".focused-pin").count(), 2);
  await own(page, "free-a", ".card-focus").tap(); assert.equal(await page.locator(".focused-pin").count(), 1);
  await own(page, "free-a", ".select-toggle").tap(); assert.equal(await checkState(page, "free"), "mixed");
  await own(page, "free", ".select-toggle").tap(); assert.equal(await checkState(page, "free"), "true");
  await page.locator(".time-panel > summary").click(); await page.locator(".time-start").fill("780"); await page.locator(".time-end").fill("795");
  assert.equal(await page.locator(".place-pin").count(), 2); assert.equal(await selected(page), "free-a");
  await page.locator(".time-end").fill("915"); await page.locator(".time-start").fill("900"); assert.equal(await page.locator(".place-pin").count(), 0);
  await page.locator(".time-reset").click(); await page.locator(".filter-panel > summary").click(); await page.locator('.filter-fields input[value="Sightseeing"]').check();
  assert.equal(await card(page, "free-b").count(), 0); assert.equal(await card(page, "free-a").count(), 1);
  await noOverflow(page);
});
test("Phase 3 detours: three route structures in Transit details, slack and explicit-only map visibility", async t => {
  const { page } = await open(t, { payload: phase3Fixture });
  assert.equal(await page.locator(".items > .item").count(), 3); assert.equal(await page.locator('.place-pin[title*="宿"]').count(), 0);
  await own(page, "p3-transit", ".details-toggle").click(); assert.equal(await page.locator(".detour-routes > .item").count(), 3);
  assert.equal(await page.locator('.place-pin[title*="宿"]').count(), 0);
  assert.match(await card(page, "d-item").innerText(), /追加所要時間：10分.*寄り道可能・20分余裕/s);
  assert.match(await card(page, "d-series").innerText(), /予定超過・10分/); assert.match(await card(page, "d-group").innerText(), /寄り道可能・0分余裕/);
  await own(page, "d-item", ".details-toggle").click(); assert.equal(await page.locator('.place-pin[title*="宿"]').count(), 1);
  await own(page, "d-item", ".details-toggle").click(); assert.equal(await page.locator('.place-pin[title*="宿"]').count(), 0);
  await own(page, "d-series", ".details-toggle").click(); await own(page, "d-child", ".card-focus").click(); assert.equal(await selected(page), "d-child");
  await own(page, "d-group", ".card-focus").click(); await page.getByRole("button", { name: "比較する寄り道の次の候補", exact: true }).click(); await page.clock.runFor(400);
  assert.equal(await page.locator('[data-candidate="d-b"]').getAttribute("data-active"), "true"); await noOverflow(page);
});
test("Phase 3 location privacy: no automatic request, one-shot success/precision/stale/reload and Directions popup contract", async t => {
  const { page, context } = await open(t, { payload: phase3Fixture, initScript: geoSuccess });
  const requests = [], messages = []; page.on("request", r => requests.push(r.url() + (r.postData() || ""))); page.on("console", m => messages.push(m.text()));
  await own(page, "p3-transit", ".card-focus").click(); await own(page, "p3-transit", ".details-toggle").click();
  assert.equal(await page.evaluate(() => __geoCalls), 0);
  await page.locator(".location-panel > summary").click(); await page.locator(".location-button").click(); assert.equal(await page.evaluate(() => __geoCalls), 1);
  assert.equal(await page.locator(".current-location-pin").count(), 1); assert.equal(await page.locator(".current-location-accuracy").count(), 1);
  assert.match(await page.locator(".location-status").innerText(), /精度.*12m/);
  assert.match(await own(page, "p3-transit", ".item-details").innerText(), /第三者.*現在地と目的地/s);
  let opened;
  await page.exposeFunction("captureDirections", (args) => { opened = args; });
  await page.evaluate(() => { window.open = (...args) => { window.captureDirections(args); return null; }; });
  await card(page, "p3-transit").locator(':scope > .item-details > .directions-section .directions-button').click();
  await page.waitForFunction(() => true); assert.ok(opened); const url = new URL(opened[0]);
  assert.equal(url.origin, "https://www.google.com"); assert.equal(url.pathname, "/maps/dir/"); assert.equal(url.searchParams.get("origin"), "34.986123,135.759456"); assert.equal(url.searchParams.get("destination"), "34.9949,135.785"); assert.equal(url.searchParams.get("travelmode"), "transit"); assert.match(opened[2], /noopener/);
  assert.ok(!requests.some(x => /34\.986123|135\.759456/.test(x))); assert.ok(!messages.some(x => /34\.986123|135\.759456/.test(x)));
  assert.deepEqual(await page.evaluate(async () => ({ local: { ...localStorage }, session: { ...sessionStorage }, db: await indexedDB.databases(), cache: await caches.keys(), workers: (await navigator.serviceWorker.getRegistrations()).length })), { local: {}, session: {}, db: [], cache: [], workers: 0 });
  await page.clock.runFor(300001); assert.match(await page.locator(".location-status").innerText(), /古い.*更新/s);
  assert.equal(await card(page, "p3-transit").locator(':scope > .item-details > .directions-section .directions-button').isDisabled(), true);
  await page.reload(); await page.locator(".item").first().waitFor(); assert.equal(await page.evaluate(() => __geoCalls), 0); assert.equal(await page.locator(".current-location-pin").count(), 0);
});
for (const [name, code, expected] of [["denied", 1, "許可されていません"], ["timeout", 3, "タイムアウト"], ["unavailable", 2, "取得できません"], ["unsupported", 0, "対応していません"], ["insecure", -1, "HTTPS"]]) test(`Phase 3 location ${name} keeps itinerary controls usable`, async t => {
  const { page } = await open(t, { payload: phase3Fixture, initScript: `window.__geoCalls=0; ${code === -1 ? 'Object.defineProperty(window,"isSecureContext",{value:false});' : ''} Object.defineProperty(navigator,"geolocation",{configurable:true,value:${code === 0 ? 'undefined' : `{getCurrentPosition(ok,fail){window.__geoCalls++;fail({code:${code}})}}`}});` });
  await page.locator(".location-panel > summary").click(); await page.locator(".location-button").click(); assert.match(await page.locator(".location-status").innerText(), new RegExp(expected));
  assert.equal(await page.evaluate(() => __geoCalls), code <= 0 ? 0 : 1); await own(page, "free", ".select-toggle").click(); assert.equal(await checkState(page, "free"), "true"); await noOverflow(page);
  if(name === "denied") { await page.locator(".location-panel").scrollIntoViewIfNeeded(); await page.screenshot({path:"artifacts/phase3-location-error.png"}); }
});
for (const viewport of [{ width: 390, height: 844 }, { width: 1440, height: 900 }]) test(`Phase 3 visual/keyboard ${viewport.width}: free, detour, location, 200% text and reduced motion`, async t => {
  const { page } = await open(t, { payload: phase3Fixture, desktop: viewport.width === 1440, initScript: geoSuccess });
  await page.locator(".location-panel > summary").focus(); await page.keyboard.press("Enter"); await page.keyboard.press("Tab"); await page.keyboard.press("Space");
  assert.equal(await page.evaluate(() => __geoCalls), 1);
  await own(page, "free-a", ".details-toggle").focus(); await page.keyboard.press("Enter"); await checkPhase2Targets(page);
  await own(page, "free", ".card-focus").scrollIntoViewIfNeeded(); await page.screenshot({ path: `artifacts/phase3-free-${viewport.width}.png` });
  await own(page, "free-a", ".card-focus").scrollIntoViewIfNeeded(); await page.screenshot({ path: `artifacts/phase3-candidate-${viewport.width}.png` });
  await own(page, "p3-transit", ".details-toggle").click(); await own(page, "d-series", ".details-toggle").click(); await own(page, "d-child", ".card-focus").focus(); await page.keyboard.press("Enter");
  await checkPhase2Targets(page); await page.screenshot({ path: `artifacts/phase3-detour-${viewport.width}.png` });
  await page.addStyleTag({ content: "html { font-size: 200%; }" }); await own(page, "d-child", ".card-focus").scrollIntoViewIfNeeded(); await checkPhase2Targets(page); await page.screenshot({ path: `artifacts/phase3-text-200-${viewport.width}.png` });
  await page.locator(".location-panel").scrollIntoViewIfNeeded(); await page.screenshot({ path: `artifacts/phase3-location-${viewport.width}.png` });
});
test("Phase 3 Directions all structures use resolved destination, real noopener popup and disabled reasons", async t => {
  const { page, context } = await open(t, { payload: phase3Fixture, initScript: geoSuccess });
  await page.locator(".location-panel > summary").click(); await page.locator(".location-button").click();
  await own(page, "p3-transit", ".details-toggle").click(); await own(page, "d-series", ".details-toggle").click();
  const captured = [];
  await page.exposeFunction("captureAllDirections", args => captured.push(args));
  await page.evaluate(() => { window.__realOpen = window.open; window.open = (...args) => { window.captureAllDirections(args); return null; }; });
  for(const [id, destination, mode] of [["free-a","34.9949,135.785",null],["p3-next","34.9949,135.785",null],["p3-transit","34.9949,135.785","transit"],["d-item","35.011,135.768","walking"],["d-series","35.011,135.768","driving"],["d-group","35.011,135.768",null]]) {
    if(await own(page,id,".details-toggle").getAttribute("aria-expanded") !== "true") await own(page,id,".details-toggle").click();
    await card(page,id).locator(':scope > .item-details > .directions-section .directions-button').click();
    await page.waitForTimeout(10); const args = captured.at(-1), url = new URL(args[0]); assert.equal(url.searchParams.get("destination"),destination); assert.equal(url.searchParams.get("travelmode"),mode); assert.match(args[2],/noopener/);
  }
  await own(page,"free",".details-toggle").click(); assert.equal(await card(page,"free").locator(':scope > .item-details > .directions-section .directions-button').isDisabled(),true);
  assert.match(await own(page,"free",".item-details").innerText(),/目的地を解決できません/);
  await page.evaluate(() => { window.open = window.__realOpen; });
  const popupPromise = context.waitForEvent("page"); await card(page,"d-item").locator(':scope > .item-details > .directions-section .directions-button').click();
  const popup = await popupPromise; await popup.waitForLoadState(); assert.equal(await popup.evaluate(()=>window.opener),null); assert.equal(new URL(popup.url()).origin,"https://www.google.com"); await popup.close();
});
test("Phase 3 map/external failure preserves location-free itinerary and error screenshot", async t => {
  const { page } = await open(t, { payload: phase3Fixture, noMap:true, initScript:geoSuccess });
  await page.locator(".location-panel > summary").click(); await page.locator(".location-button").click();
  await own(page,"free-a",".details-toggle").click(); await own(page,"free-a",".select-toggle").click(); assert.equal(await checkState(page,"free"),"mixed");
  await page.evaluate(()=>{window.open=()=>{throw new Error("injected popup failure");};});
  await card(page,"free-a").locator(':scope > .item-details > .directions-section .directions-button').click();
  assert.match(await own(page,"free-a",".item-details").innerText(),/外部経路を開けません/);
  assert.match(await page.locator(".map-status").innerText(),/地図ライブラリ/); await noOverflow(page);
  await page.screenshot({path:"artifacts/phase3-external-map-error.png"});
});
test("Phase 3 next fixed candidate changes assessment; filters never change the public schedule", async t => {
  const payload = structuredClone(phase3Fixture);
  const next = payload.items.find(n=>n.id==="p3-next"); next.parentId="next-group"; next.status="Confirmed";
  payload.items.push({id:"next-group",title:"次の予定の比較",structure:"Alternative Group",start:"2026-10-09T02:05:00Z",end:"2026-10-09T03:00:00Z"},{...next,id:"next-other",title:"早い次予定",status:"Candidate",start:"2026-10-09T02:05:00Z"});
  const { page } = await open(t,{payload}); await own(page,"p3-transit",".details-toggle").click();
  assert.equal(await page.locator('[data-detour-assessment="d-item"]').innerText(),"寄り道可能・20分余裕");
  await page.getByRole("button",{name:"次の予定の比較の次の候補",exact:true}).click(); await page.clock.runFor(400);
  assert.equal(await page.locator('[data-detour-assessment="d-item"]').innerText(),"予定超過・5分");
  await page.locator(".filter-panel > summary").click(); await page.locator('.filter-fields input[value="Transit"]').check();
  assert.equal(await page.locator('[data-detour-assessment="d-item"]').count(),0);
  await page.locator(".clear-filters").click(); assert.equal(await page.locator('[data-detour-assessment="d-item"]').innerText(),"予定超過・5分");
});
test("Phase 3 real Geolocation API respects deployed Permissions-Policy and explicit browser permission", async t => {
  const { page, context } = await open(t,{payload:phase3Fixture,initScript:()=>{
    window.__geoCalls=0;const original=navigator.geolocation.getCurrentPosition.bind(navigator.geolocation);
    navigator.geolocation.getCurrentPosition=(...args)=>{window.__geoCalls++;return original(...args);};
  }});
  await context.grantPermissions(["geolocation"]);await context.setGeolocation({latitude:34.986123,longitude:135.759456,accuracy:12});
  assert.equal(await page.evaluate(()=>__geoCalls),0);await page.locator(".location-panel > summary").click();await page.locator(".location-button").click();
  await page.locator(".location-status").filter({hasText:"精度"}).waitFor();assert.equal(await page.evaluate(()=>__geoCalls),1);assert.equal(await page.locator(".current-location-pin").count(),1);
  const response=await page.request.get(base);assert.match(response.headers()["permissions-policy"],/geolocation=\(self\)/);assert.match(response.headers()["permissions-policy"],/camera=\(\), microphone=\(\)/);
});
test("Phase 3 pending candidate scroll callback is harmless after filters remove its carousel", async t => {
  const { page } = await open(t,{payload:phase3Fixture,noMap:true});
  await own(page,"p3-transit",".details-toggle").click();await page.getByRole("button",{name:"比較する寄り道の次の候補",exact:true}).click();await page.clock.runFor(400);
  assert.equal(await page.locator('[data-candidate="d-b"]').getAttribute("data-active"),"true");
  await page.locator('.group-candidates[data-group="d-group"]').evaluate(el=>el.dispatchEvent(new Event("scroll")));
  await page.locator(".filter-panel > summary").click();await page.locator('.filter-fields input[data-filter="type"][value="Transit"]').check();await page.clock.runFor(400);
  await page.locator(".clear-filters").click();assert.equal(await card(page,"d-group").count(),1);await noOverflow(page);
});


// Phase 5 acceptance evidence: real DOM geometry, input and Leaflet; no app hooks.
const p5Active = page => page.locator('.group-candidates[data-group="p5-group"] .candidate-slot[data-active="true"]').getAttribute('data-candidate');
async function measureRail(page, name) {
  // ResizeObserver is a native renderer lifecycle, not a fake-timer callback.
  // Resume frames and wait for the exact geometry contract, without relaxing it.
  await page.clock.resume();
  await page.waitForFunction(() => {
    const events=[...document.querySelectorAll('.rail-event')];
    return events.length && events.every(event=>{const node=event.querySelector('button'),title=document.querySelector('.item[data-id="'+node.dataset.railId+'"] > .card-heading .item-title');const a=node.getBoundingClientRect(),b=title.getBoundingClientRect();return a.width>=44 && a.height>=44 && Math.abs(a.y+a.height/2-b.y-b.height/2)<=2;});
  });
  const entries = await page.locator('.rail-event').evaluateAll(events => events.map(event => {
    const node = event.querySelector('button'), title = document.querySelector('.item[data-id="'+node.dataset.railId+'"] > .card-heading .item-title');
    const a = node.getBoundingClientRect(), b = title.getBoundingClientRect();
    return {id:node.dataset.railId, x:a.x+a.width/2, delta:Math.abs(a.y+a.height/2-b.y-b.height/2), width:a.width,height:a.height};
  }));
  assert.ok(entries.length>0); for (const e of entries) { assert.ok(e.delta<=2, name+' '+JSON.stringify(e)); assert.ok(e.width>=44 && e.height>=44); }
  if (await page.evaluate(()=>innerWidth<=850)) assert.ok(Math.max(...entries.map(e=>e.x))-Math.min(...entries.map(e=>e.x))<=2, 'common axis '+name);
  await fsEvidence(name, entries); return entries;
}
async function fsEvidence(name, value) { const {writeFile}=await import('node:fs/promises'); await writeFile('artifacts/phase5-'+name+'.json',JSON.stringify(value,null,2)); }

test('Phase 5 AC01/02/10/11/12: flat maximum hierarchy, native headings, rail and real time rules', async t => {
  const {page}=await open(t,{payload:phase5Fixture,minimal:true,initScript:geoSuccess});
  assert.equal(await page.locator('.map-panel').getAttribute('data-mode'),'minimal'); assert.equal(await page.locator('#map').isVisible(),false);
  assert.equal(await page.locator('.select-toggle').first().isVisible(),false); assert.equal(await page.locator('.activate-candidate').count(),0);
  assert.equal(await card(page,'p5-street').isVisible(),true); assert.equal(await own(page,'p5-series','.details-toggle').getAttribute('aria-expanded'),'false');
  const lefts=await page.locator('[data-id="p5-series"], [data-id="p5-free"], [data-id="p5-street"]').evaluateAll(els=>els.map(el=>el.getBoundingClientRect().left)); assert.ok(Math.max(...lefts)-Math.min(...lefts)<=2);
  assert.equal(await page.locator('[data-rail-id="p5-street"]').count(),0); assert.match(await card(page,'p5-street').innerText(),/0 JPY/);
  assert.match(await card(page,'p5-lunch').innerText(),/予約必要.*未完了/);
  assert.match(await card(page,'p5-noend').locator('.time').textContent(),/^14:00$/); assert.match(await card(page,'p5-all').locator('.time').textContent(),/終日/);
  assert.match(await card(page,'p5-night').locator('.time').textContent(),/23:30.*10\/10.*01:00/);
  await measureRail(page,'normal-rail');
  await page.screenshot({path:'artifacts/phase5-normal.png'});
  await own(page,'p5-visit','.details-toggle').click(); await measureRail(page,'detail-rail');
  await own(page,'p5-visit','.details-toggle').click(); await card(page,'p5-free').scrollIntoViewIfNeeded();
  await page.screenshot({path:'artifacts/phase5-maximum-hierarchy.png'}); assert.equal(await page.evaluate(()=>__geoCalls),0);
});

test('Phase 5 AC02/04/05/06/09/13/16: all candidate structures, focus isolation and scene return state', async t => {
  const {page}=await open(t,{payload:phase5Fixture,minimal:true,initScript:geoSuccess});
  await own(page,'p5-visit','.card-focus').click(); await own(page,'p5-visit','.details-toggle').click(); await own(page,'p5-visit','.select-toggle').click();
  await page.screenshot({path:'artifacts/phase5-comparison.png'});
  await page.locator('.nav-compare').click(); assert.equal(await own(page,'p5-visit','.select-toggle').isVisible(),false); assert.match(await page.locator('.nav-compare').innerText(),/1件/);
  await page.locator('[data-scene="p5-series"]').scrollIntoViewIfNeeded();
  const parentTop=await card(page,'p5-group').evaluate(el=>el.getBoundingClientRect().top-document.querySelector('.timeline-panel').getBoundingClientRect().top);
  await page.locator('[data-scene="p5-series"]').click(); assert.equal(await selected(page),'p5-visit'); assert.equal(await page.locator('[data-id="p5-lunch"]').count(),0);
  assert.equal(await page.locator('.days').isVisible(),false); assert.equal(await own(page,'p5-visit','.details-toggle').getAttribute('aria-expanded'),'true');
  await page.screenshot({path:'artifacts/phase5-fullscreen.png'}); await measureRail(page,'scene-rail');
  await page.getByRole('button',{name:'午前の過ごし方の次の候補',exact:true}).click(); await page.clock.runFor(600);
  assert.equal(await p5Active(page),'p5-item'); assert.equal(await selected(page),'p5-item'); assert.equal(await checkState(page,'p5-visit'),'true');
  assert.equal(await page.locator('[data-candidate="p5-series"]').evaluate(el=>el.inert),true);
  await measureRail(page,'switched-rail'); await page.screenshot({path:'artifacts/phase5-switched.png'});
  await page.locator('.nav-map').click(); await page.locator('[data-mode="expanded"]').click(); await page.keyboard.press('Escape');
  assert.equal(await page.locator('#app').getAttribute('data-scene'),'true'); assert.equal(await page.locator('.map-panel').getAttribute('data-mode'),'standard');
  await page.locator('.scene-back').click(); assert.equal(await p5Active(page),'p5-item'); assert.equal(await page.locator('.map-panel').getAttribute('data-mode'),'standard');
  assert.ok(Math.abs(await card(page,'p5-group').evaluate(el=>el.getBoundingClientRect().top-document.querySelector('.timeline-panel').getBoundingClientRect().top)-parentTop)<3);
  for (const id of ['p5-item','p5-choice-free']) { await setCandidate(page,id); await page.locator('[data-scene="'+id+'"]').click(); assert.equal(await page.locator('#app').getAttribute('data-scene'),'true'); await page.keyboard.press('Escape'); }
  await page.locator('[data-scene="p5-solo"]').click(); assert.equal(await card(page,'p5-noend').isVisible(),true); await page.locator('.nav-itinerary').click();
  assert.equal(await page.locator('#app').getAttribute('data-scene'),'false'); assert.equal(await page.evaluate(()=>__geoCalls),0);
});

test('Phase 5 AC03/04: real touch horizontal vs vertical vs title tap; hidden candidates never take Tab',async t=>{
  const {page,context}=await open(t,{payload:phase5Fixture,minimal:true}); const carousel=page.locator('.group-candidates[data-group="p5-group"]');
  await carousel.scrollIntoViewIfNeeded(); const r=await carousel.boundingBox(), panel=await page.locator('.timeline-panel').boundingBox(), y=Math.min(panel.y+panel.height-70,Math.max(r.y,panel.y)+90);
  const cdp=await context.newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:r.x+r.width*.85,y}]});
  for(let i=1;i<=8;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:r.x+r.width*(.85-.7*i/8),y}]});await new Promise(resolve=>setTimeout(resolve,25));}
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.clock.runFor(700);
  assert.equal(await p5Active(page),'p5-item');assert.equal(await page.locator('#app').getAttribute('data-scene'),'false');
  await carousel.scrollIntoViewIfNeeded(); const verticalRect=await carousel.boundingBox(), verticalY=Math.min(panel.y+panel.height-50,Math.max(verticalRect.y,panel.y)+140);
  const before=await page.locator('.timeline-panel').evaluate(el=>el.scrollTop);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:verticalRect.x+verticalRect.width/2,y:verticalY}]});
  for(let i=1;i<=8;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:verticalRect.x+verticalRect.width/2,y:verticalY-i*15}]});await new Promise(resolve=>setTimeout(resolve,25));}
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await page.clock.runFor(700);
  assert.equal(await p5Active(page),'p5-item');assert.ok(await page.locator('.timeline-panel').evaluate(el=>el.scrollTop)>before);assert.equal(await page.locator('#app').getAttribute('data-scene'),'false');
  await carousel.focus();await page.keyboard.press('End');await page.clock.runFor(500);assert.equal(await p5Active(page),'p5-choice-free');
  await carousel.focus();for(let i=0;i<18;i++){await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>Boolean(document.activeElement.closest('[inert]'))),false);}
  await carousel.focus();await page.keyboard.press('Home');await page.clock.runFor(500);assert.equal(await p5Active(page),'p5-series');
  await page.locator('[data-scene="p5-series"]').tap();assert.equal(await page.locator('#app').getAttribute('data-scene'),'true');await cdp.detach();
});

test('Phase 5 AC07/08/12: scene removed or filtered resolves to day, filter/notice remain outside menu',async t=>{
  const {page,context}=await open(t,{payload:phase5Fixture,minimal:true}); await setCandidate(page,'p5-item');await page.locator('[data-scene="p5-item"]').click();
  const next=structuredClone(phase5Fixture);next.generatedAt='2026-10-10T00:00:00Z';next.items=next.items.filter(i=>i.id!=='p5-item');
  await context.route('**/api/refresh?*',route=>route.fulfill({contentType:'application/json',headers:{'X-Itinerary-Cache':'refreshed'},body:JSON.stringify(next)}));
  await page.locator('.publish-button').click();await page.locator('.publish-status').filter({hasText:'最新の旅程'}).waitFor();
  assert.equal(await page.locator('#app').getAttribute('data-scene'),'false');assert.match(await page.locator('.focus-status').innerText(),/削除|表示対象/);
  await page.locator('[data-scene="p5-solo"]').click();await page.locator('.filter-panel > summary').click();await page.locator('[data-filter="type"][value="Meal"]').check();await page.locator('.close-menu').click();
  assert.equal(await page.locator('#app').getAttribute('data-scene'),'false');assert.match(await page.locator('.comparison-status').innerText(),/フィルター中/);
  await page.locator('.clear-filters').click();while(await page.locator('.menu-content > details[open] > summary').count())await page.locator('.menu-content > details[open] > summary').first().click();await page.locator('.close-menu').scrollIntoViewIfNeeded();await page.screenshot({path:'artifacts/phase5-other-menu.png'});
  await page.locator('.close-menu').click();await page.locator('.nav-map').click();await page.screenshot({path:'artifacts/phase5-standard-map.png'});
  await noOverflow(page);
});

test('Phase 5 AC02/09/10/13/14: one filtered candidate, desktop parallel axes and responsive text/height',async t=>{
  const {page}=await open(t,{payload:phase5Fixture,minimal:true});await page.locator('.filter-panel > summary').click();await page.locator('[data-filter="type"][value="Activity"]').check();await page.locator('.close-menu').click();
  // Two matching branches initially; status narrows to the single Item candidate.
  await page.locator('[data-filter="status"][value="Tentative"]').check();await page.locator('.close-menu').click();
  assert.equal(await page.locator('.candidate-slot').count(),1);assert.equal(await page.locator('.candidate-controls').isVisible(),false);
  await page.locator('.clear-filters').click();await page.locator('.close-menu').click();
  for(const viewport of [{width:320,height:844},{width:390,height:844},{width:390,height:450},{width:1440,height:900}]){
    await page.setViewportSize(viewport);await page.clock.runFor(400);await noOverflow(page);await measureRail(page,'rail-'+viewport.width+'x'+viewport.height);
    const layout=await page.evaluate(()=>({bar:document.querySelector('.menu-bar').getBoundingClientRect().toJSON(),body:document.querySelector('.timeline-panel').getBoundingClientRect().toJSON(),height:innerHeight}));assert.ok(Math.abs(layout.bar.bottom-layout.height)<=1 && layout.body.bottom<=layout.bar.top+1,'bar below content '+JSON.stringify(layout));
    if(viewport.width===1440){const xs=await page.locator('.rail-event').evaluateAll(es=>[...new Set(es.map(e=>Math.round(e.getBoundingClientRect().x)))]);assert.ok(xs.length>=3,'desktop has separate comparison axes');await page.screenshot({path:'artifacts/phase5-desktop.png'});}
  }
  await page.setViewportSize({width:320,height:844});await page.addStyleTag({content:'html {font-size:200%}'});await page.evaluate(()=>window.dispatchEvent(new Event('resize')));await page.clock.runFor(500);await noOverflow(page);await measureRail(page,'rail-200');
  await page.screenshot({path:'artifacts/phase5-320-text-200.png'});
  await page.locator('.nav-compare').click();await own(page,'p5-group','.select-toggle').click();await page.locator('.nav-map').click();await page.locator('[data-mode="expanded"]').click();await page.clock.runFor(300);
  const enlarged=await page.evaluate(()=>({map:document.querySelector('.map-panel').getBoundingClientRect().toJSON(),bar:document.querySelector('.menu-bar').getBoundingClientRect().toJSON()}));assert.ok(enlarged.map.bottom<=enlarged.bar.top+1,'expanded map leaves actual enlarged menu height '+JSON.stringify(enlarged));await noOverflow(page);await page.keyboard.press('Escape');
});


test('Phase 5 AC06/08/09/12: scene retains latest filters, time, details and comparison independently',async t=>{
  const {page}=await open(t,{payload:phase5Fixture,minimal:true});
  await page.locator('.show-cancelled').check();await page.locator('.time-start').fill('570');await page.locator('.time-end').fill('690');await page.locator('.close-menu').click();
  await own(page,'p5-visit','.select-toggle').click();await own(page,'p5-visit','.details-toggle').click();await page.locator('[data-scene="p5-series"]').click();
  await page.getByRole('button',{name:'午前の過ごし方の次の候補',exact:true}).click();await page.clock.runFor(500);
  await page.locator('.time-end').fill('720');await page.locator('.close-menu').click();await page.keyboard.press('Escape');
  assert.equal(await p5Active(page),'p5-item');assert.equal(await page.locator('.candidate-slot').count(),4);assert.equal(await page.locator('.show-cancelled').isChecked(),true);
  assert.equal(await page.locator('.time-start').inputValue(),'570');assert.equal(await page.locator('.time-end').inputValue(),'720');assert.equal(await own(page,'p5-visit','.details-toggle').getAttribute('aria-expanded'),'true');assert.equal(await checkState(page,'p5-visit'),'true');
  assert.match(await page.locator('.comparison-status').innerText(),/フィルター中/);await page.locator('.nav-compare').click();assert.match(await page.locator('.nav-compare').innerText(),/1件/);
});
