import assert from "node:assert/strict";
import { readFile, writeFile, mkdtemp, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
const base = "https://travel-itinerary.baribaritozan.workers.dev", baseline = process.argv.includes("--baseline");
await mkdir("artifacts", { recursive: true });
const apiResponse = await fetch(`${base}/api/itinerary`); assert.equal(apiResponse.status, 200);
const payload = await apiResponse.json(), payloadHash = createHash("sha256").update(JSON.stringify(payload)).digest("hex");
assert.ok(payload.items.every(item => /^[a-f0-9]{64}$/.test(item.id)));
const profile = await mkdtemp(resolve(tmpdir(), "travel-live-"));
const launch = () => chromium.launchPersistentContext(profile, { channel: process.platform === "win32" ? "chrome" : undefined, headless: true, viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
let context;
const evidence = { checkedAt: new Date().toISOString(), mode: baseline ? "baseline" : "phase4", publicItems: payload.items.length, publicPlaces: payload.places.length, phase3SamplesAtTaskStart: payload.items.filter(item => item.title.startsWith("[Phase3 Sample]")).length, payloadHash, apiCache: apiResponse.headers.get("X-Itinerary-Cache"), checks: [] };
async function configure(context, routes = true) {
  await context.addInitScript(() => { window.__geoCalls = 0; Object.defineProperty(navigator, "geolocation", { value: { getCurrentPosition() { window.__geoCalls++; throw new Error("Smoke must not request position"); } } }); });
  if (routes) await configureRoutes(context);
}
async function configureRoutes(context) {
  await context.route("https://tile.openstreetmap.org/**", route => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#dbe6df"/></svg>' }));
  await context.route("https://unpkg.com/**", async route => { const css = route.request().url().endsWith(".css"); await route.fulfill({ contentType: css ? "text/css" : "application/javascript", body: await readFile(`node_modules/leaflet/dist/leaflet.${css ? "css" : "js"}`) }); });
  await context.route("https://www.google.com/**", route => route.fulfill({ contentType: "text/html", body: "<title>External route intercepted</title>" }));
}
try {
  context = await launch(); await configure(context); let page = context.pages()[0]; const errors = [], consoles = [], requests = [];
  const monitor = page => { page.on("pageerror", error => errors.push(error.message)); page.on("console", message => { if (message.type() === "error") consoles.push(message.text()); }); page.on("request", request => { if (request.url().startsWith(base)) requests.push({ url: request.url(), method: request.method() }); }); };
  monitor(page); await page.goto(base); await page.locator(".item").first().waitFor(); await page.locator(".place-pin").first().waitFor();
  assert.equal(await page.evaluate(() => __geoCalls), 0);
  await page.locator(".day-button").first().click(); await page.locator(".details-toggle").first().click(); await page.locator(".card-focus").first().click();
  await page.locator('button[data-mode="minimal"]').click(); await page.locator('button[data-mode="standard"]').click();
  evidence.checks.push("public API boundary", "dates/details/focus/mobile map", "zero automatic geolocation");
  await page.screenshot({ path: `artifacts/phase4-production-${baseline ? "baseline" : "mobile"}.png` });
  await page.setViewportSize({ width: 1440, height: 900 }); await page.screenshot({ path: `artifacts/phase4-production-${baseline ? "baseline-desktop" : "desktop"}.png` });
  if (!baseline) {
    const manifest = JSON.parse(await readFile("dist/asset-manifest.json", "utf8"));
    for (const file of manifest.precache) { const response = await fetch(base + file.url); assert.equal(response.status, 200); assert.equal(createHash("sha256").update(Buffer.from(await response.arrayBuffer())).digest("hex"), file.hash, `deployed ${file.url}`); }
    const worker = await fetch(base + "/sw.js"); assert.match(worker.headers.get("content-type"), /javascript/); assert.match(worker.headers.get("cache-control"), /no-cache/); assert.equal(await worker.text(), await readFile("dist/sw.js", "utf8")); evidence.checks.push("all deployed shell hashes and SW headers");
    await page.locator(".offline-panel summary").click(); await page.locator(".save-offline").click(); await page.waitForFunction(() => document.querySelector(".storage-message").textContent.includes("有効にしました")); await page.waitForFunction(() => navigator.serviceWorker.controller);
    await context.close(); context = await launch(); await configure(context, false); await context.setOffline(true); page = context.pages()[0]; monitor(page);
    await page.goto(base); await page.locator(".item").first().waitFor(); await page.locator(".place-pin").first().waitFor(); assert.equal(await page.evaluate(() => __geoCalls), 0); evidence.checks.push("saved profile closed then offline restarted", "offline pins and schematic lines");
    await page.locator(".offline-panel summary").click(); await page.screenshot({ path: "artifacts/phase4-production-offline.png" });
    await configureRoutes(context); await context.setOffline(false); await page.waitForFunction(() => document.querySelector(".offline-status").textContent.includes("オンライン"));
    let routeOpened = false;
    for (const button of await page.locator(".day-button").all()) {
      await button.click(); const transit = page.locator(".item").filter({ has: page.locator("[data-planned]") }).first();
      if (!await transit.count()) continue;
      await transit.locator(":scope > .details-toggle").click(); const route = transit.locator("[data-planned]").first(); if (await route.isDisabled()) continue;
      const opened = context.waitForEvent("page"); await route.click(); const popup = await opened; await popup.waitForLoadState(); assert.equal(new URL(popup.url()).origin, "https://www.google.com"); assert.equal(await popup.evaluate(() => window.opener), null); await popup.close(); routeOpened = true; break;
    }
    assert.ok(routeOpened, "production planned route opened with network intercepted"); assert.equal(await page.evaluate(() => __geoCalls), 0); evidence.checks.push("reconnected GET", "planned route real noopener popup, Google network intercepted");
    await page.locator(".delete-offline").click(); await page.waitForFunction(() => document.querySelector(".storage-message").textContent.includes("削除しました"));
    assert.deepEqual(await page.evaluate(async () => ({ db: await indexedDB.databases(), caches: await caches.keys(), sw: (await navigator.serviceWorker.getRegistrations()).length })), { db: [], caches: [], sw: 0 }); evidence.checks.push("explicit deletion of DB/cache/SW");
    assert.equal(requests.filter(request => request.method === "POST").length, 0);
  }
  assert.deepEqual(errors, []); assert.deepEqual(consoles.filter(text => !text.includes("Failed to load resource")), []);
  const after = await (await fetch(`${base}/api/itinerary`)).json(); assert.equal(createHash("sha256").update(JSON.stringify(after)).digest("hex"), payloadHash); evidence.checks.push("unchanged public payload", "no uncaught/normal console errors");
  evidence.result = "passed"; await writeFile(`artifacts/phase4-production-${baseline ? "baseline" : "smoke"}.json`, JSON.stringify(evidence, null, 2)); console.log(JSON.stringify(evidence, null, 2));
} finally { await context?.close(); }
