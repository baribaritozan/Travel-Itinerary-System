import test, { after } from "node:test";
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir, mkdtemp, writeFile } from "node:fs/promises";
import { resolve, extname } from "node:path";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { chromium } from "playwright";
import { withNavigation } from "./ui-navigation.mjs";
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const assetManifest = JSON.parse(await readFile("dist/asset-manifest.json", "utf8"));
const swOriginal = await readFile("dist/sw.js", "utf8"), htmlOriginal = await readFile("dist/index.html", "utf8");
const legacyDir = 'artifacts/phase5-baseline-dist';
const legacyHtml = await readFile(`${legacyDir}/index.html`, 'utf8'), legacySW = await readFile(`${legacyDir}/sw.js`, 'utf8');
const DB = "travel-itinerary-offline-v1";
const fixture = {
  generatedAt: "2026-10-12T00:00:00Z", trip: { name: "PWA検証旅行", slug: "sample-trip", timezone: "Asia/Tokyo", start: "2026-10-12", end: "2026-10-13" },
  places: [{ id: "a", name: "駅", latitude: 35, longitude: 139, address: "駅の住所" }, { id: "b", name: "宿", latitude: 35.01, longitude: 139.02, address: "宿の住所" }],
  items: [
    { id: "move", title: "宿へ移動", type: "Transit", transport: "Bus", start: "2026-10-12T01:00:00Z", end: "2026-10-12T02:00:00Z", fromId: "a", toId: "b" },
    { id: "free", title: "自由時間", structure: "Flexible Block", start: "2026-10-12T02:00:00Z", end: "2026-10-12T04:00:00Z" },
    { id: "child", title: "散策候補", parentId: "free", placeId: "b", durationMinutes: 30 },
    { id: "detour", title: "寄り道", detourForId: "move", placeId: "a", durationMinutes: 10, additionalDurationMinutes: 10 },
    { id: "group", title: "候補比較", structure: "Alternative Group", start: "2026-10-12T04:00:00Z", end: "2026-10-12T06:00:00Z" },
    { id: "series", title: "系列案", structure: "Series", parentId: "group", start: "2026-10-12T04:00:00Z", end: "2026-10-12T05:00:00Z" },
    { id: "series-child", title: "系列の訪問", parentId: "series", placeId: "a", start: "2026-10-12T04:00:00Z", end: "2026-10-12T05:00:00Z" },
    { id: "other", title: "別案", parentId: "group", placeId: "b", start: "2026-10-12T05:00:00Z", end: "2026-10-12T06:00:00Z" },
  ],
};
let payload = structuredClone(fixture), status = 200, cacheHeader = "hit", delay = 0, shellVariant = "original", broken = false;
let requests = [];
const server = createServer(async (req, res) => {
  const path = new URL(req.url, "http://localhost").pathname; requests.push({ method: req.method, path });
  try {
    if (path.startsWith("/api/")) { if (delay) await new Promise(resolve => setTimeout(resolve, delay)); res.writeHead(status, { "Content-Type": "application/json", "Cache-Control": "no-store", "X-Itinerary-Cache": cacheHeader }); res.end(JSON.stringify(payload)); return; }
    if (path === "/index.html") { res.writeHead(307, { Location: "/" }); res.end(); return; }
    if (path === "/favicon.ico") { res.writeHead(204); res.end(); return; }
    let bytes;
    if (path === "/sw.js") {
      requests[requests.length - 1].variant = shellVariant;
      if (shellVariant === "legacy") bytes = legacySW;
      else if (shellVariant === "recovery") bytes = await readFile("scripts/recovery-sw.js");
      else if (shellVariant === "original") bytes = swOriginal;
      else {
        const html = htmlOriginal + `<!-- ${shellVariant} -->`, list = assetManifest.precache.map(file => file.url === "/index.html" ? { ...file, hash: digest(html) } : file);
        bytes = swOriginal.replace(JSON.stringify(assetManifest.precache), JSON.stringify(list)).replaceAll(assetManifest.version, digest(shellVariant).slice(0, 16));
      }
    } else if (path === "/" || path === "/index.html") bytes = shellVariant === "legacy" ? legacyHtml : shellVariant === "recovery" ? await readFile("artifacts/phase4-recovery-dist/index.html") : htmlOriginal + (shellVariant === "original" ? "" : `<!-- ${shellVariant} -->`);
    else {
      if (!/^\/(assets\/[\w./-]+|manifest\.webmanifest|icon-\d+\.png|app\.js|model\.mjs|styles\.css)$/.test(path) || path.includes("..")) { res.writeHead(404); res.end(); return; }
      if (broken && path === assetManifest.assets["offline.mjs"]) bytes = "broken module";
      else {
        const directory = shellVariant === "legacy" ? legacyDir : shellVariant === "recovery" && !path.startsWith("/assets/") ? "artifacts/phase4-recovery-dist" : "dist";
        try { bytes = await readFile(resolve(directory, path.slice(1))); }
        catch(error) { if (shellVariant === 'legacy' || !path.startsWith('/assets/')) throw error; bytes = await readFile(resolve(legacyDir,path.slice(1))); }
      }
    }
    res.writeHead(200, { "Content-Type": { ".js": "application/javascript", ".mjs": "application/javascript", ".html": "text/html", ".css": "text/css", ".png": "image/png", ".webmanifest": "application/manifest+json" }[extname(path)] || "text/html", "Cache-Control": "no-cache", "Permissions-Policy": "camera=(), microphone=(), geolocation=(self)" }); res.end(bytes);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const base = `http://127.0.0.1:${server.address().port}`;
await mkdir("artifacts", { recursive: true });
after(async () => { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); });
const launch = async profile => {
  const context = await chromium.launchPersistentContext(profile, { headless: true, channel: process.platform === "win32" ? "chrome" : undefined, viewport: { width: 390, height: 844 }, reducedMotion: "reduce" });
  // Keep the fixture's today stable as calendar time advances. Timers remain real.
  await context.addInitScript(() => {
    const NativeDate = Date, offset = NativeDate.parse("2026-10-12T00:00:00Z") - NativeDate.now();
    window.Date = class extends NativeDate {
      constructor(...args) { super(...(args.length ? args : [NativeDate.now() + offset])); }
      static now() { return NativeDate.now() + offset; }
    };
  });
  return context;
};
async function setup(t, options = {}) {
  payload = structuredClone(fixture); status = 200; cacheHeader = "hit"; delay = 0; shellVariant = options.legacy ? "legacy" : "original"; broken = false; requests = [];
  // Chrome CacheStorage on Windows fails beyond MAX_PATH; use a short isolated profile.
  const profile = await mkdtemp(resolve(tmpdir(), "travel-pwa-")), context = await launch(profile); let closed = false;
  context.on("console", message => { if (message.type() === "error" && !message.text().includes("Failed to load resource")) console.log("Browser error:", message.text()); });
  t.after(async () => { if (!closed) await context.close(); });
  const page = withNavigation(context.pages()[0]); page.setDefaultTimeout(10000);
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  await context.addInitScript(() => {
    window.__geoCalls = 0;
    Object.defineProperty(navigator, "geolocation", { value: { getCurrentPosition(success) { window.__geoCalls++; success({ coords: { latitude: 12.345678, longitude: 98.765432, accuracy: 7 }, timestamp: Date.now() }); } } });
  });
  await context.route("https://tile.openstreetmap.org/**", route => route.fulfill({ contentType: "image/svg+xml", body: '<svg xmlns="http://www.w3.org/2000/svg" width="256" height="256"><rect width="256" height="256" fill="#dbe6df"/></svg>' }));
  await context.route("https://www.google.com/**", route => route.fulfill({ contentType: "text/html", body: "<title>Captured external route</title>" }));
  if (options.init) await context.addInitScript(options.init);
  await page.goto(base); await page.locator(".item").first().waitFor(); if(await page.locator(".nav-map").count()) await page.locator(".nav-map").click(); await page.locator(".place-pin").first().waitFor();
  t.after(() => assert.deepEqual(errors, [], "no uncaught app errors"));
  return { page, context, profile, close: async () => { closed = true; await context.close(); } };
}
async function enable(page) {
  await page.locator(".offline-panel summary").click(); await page.locator(".save-offline").click();
  try { await page.waitForFunction(() => document.querySelector(".storage-message").textContent.includes("有効にしました")); }
  catch (error) { console.log(await page.locator(".storage-message").innerText(), requests, await page.evaluate(async () => ({ caches: await caches.keys(), sw: (await navigator.serviceWorker.getRegistrations()).map(r => ({ active: r.active?.state, installing: r.installing?.state, waiting: r.waiting?.state })) }))); throw error; }
  await page.waitForFunction(() => navigator.serviceWorker.controller);
}
const record = page => page.evaluate(async DB => {
  const db = await new Promise((resolve, reject) => { const r = indexedDB.open(DB); r.onsuccess = () => resolve(r.result); r.onerror = reject; });
  try { return await new Promise(resolve => { const r = db.transaction("records").objectStore("records").get("active"); r.onsuccess = () => resolve(r.result); }); } finally { db.close(); }
}, DB);
async function mutateRecord(page, mode) {
  await page.evaluate(async ({ DB, mode }) => {
    const db = await new Promise(resolve => { const r = indexedDB.open(DB); r.onsuccess = () => resolve(r.result); });
    await new Promise(resolve => { const tx = db.transaction("records", "readwrite"), store = tx.objectStore("records"), r = store.get("active"); r.onsuccess = () => { const value = r.result; if (mode === "expire") { value.firstSavedAt = Date.now() - 30 * 86400000 - 1; value.expiresAt = value.firstSavedAt + 30 * 86400000; } else value.payload.items = null; store.put(value, "active"); }; tx.oncomplete = resolve; }); db.close();
  }, { DB, mode });
}
test("PWA explicit consent, persistent profile closed then offline restarted, full controls and private storage scan", async t => {
  const { page, context, profile, close } = await setup(t);
  assert.deepEqual(await page.evaluate(async () => ({ db: await indexedDB.databases(), caches: await caches.keys(), sw: (await navigator.serviceWorker.getRegistrations()).length, geo: __geoCalls })), { db: [], caches: [], sw: 0, geo: 0 });
  await enable(page);
  await page.locator(".location-panel summary").click(); await page.locator(".location-button").click(); assert.equal(await page.evaluate(() => __geoCalls), 1);
  const saved = await record(page); assert.equal(saved.payload.items.length, 8);
  const contents = await page.evaluate(async () => {
    const result = []; for (const name of await caches.keys()) { const cache = await caches.open(name); for (const request of await cache.keys()) { const response = await cache.match(request); result.push({ url: request.url, body: await response.text() }); } } return result;
  });
  for (const value of [JSON.stringify(saved), JSON.stringify(contents), JSON.stringify(requests)]) for (const coordinate of ["12.345678", "98.765432"]) assert.ok(!value.includes(coordinate), "GPS never enters persisted data, shell or API");
  assert.ok(contents.every(entry => entry.url.startsWith(base) && !/api|google|tile\.openstreetmap/.test(new URL(entry.url).pathname)));
  assert.equal(await page.evaluate(() => localStorage.length + sessionStorage.length), 0);
  await close();
  const restarted = await launch(profile); t.after(() => restarted.close());
  await restarted.setOffline(true); const offline = withNavigation(restarted.pages()[0]); await offline.goto(base); await offline.locator(".item").first().waitFor(); await offline.locator(".nav-map").click(); await offline.locator(".place-pin").first().waitFor();
  assert.equal(await offline.locator(".route-hit").count(), 1);
  await offline.locator('.item[data-id="move"] > .details-toggle').click(); assert.equal(await offline.locator('.item[data-id="detour"]').isVisible(), true);
  await offline.locator('.item[data-id="child"] .card-focus').click(); await offline.locator('.item[data-id="child"] .select-toggle').click();
  await offline.locator('.item[data-id="group"] > .details-toggle').click(); await offline.locator('.item[data-id="series"] > .details-toggle').click(); assert.equal(await offline.locator('.item[data-id="series-child"]').isVisible(), true);
  await offline.locator(".filter-panel summary").click(); await offline.locator(".selected-only").check(); assert.equal(await offline.locator('.item[data-id="move"]').count(), 0); await offline.locator(".clear-filters").click();
  await offline.locator(".time-panel summary").click(); await offline.locator(".time-next").click(); await offline.locator(".time-reset").click();
  await offline.locator('[data-day="2026-10-13"]').click(); assert.equal(await offline.locator(".item").count(), 0); await offline.locator('[data-day="2026-10-12"]').click();
  await offline.locator(".offline-panel summary").click(); assert.match(await offline.locator(".offline-status").innerText(), /保存済み/);
  await offline.screenshot({ path: "artifacts/phase4-offline-mobile.png" });
  await restarted.setOffline(false); await offline.waitForFunction(() => document.querySelector(".offline-status").textContent.includes("オンライン"));
  assert.equal(requests.filter(r => r.method === "POST").length, 0);
});
test("PWA same version, new version with removed items, 5xx fallback, tombstone and new sync recovery", async t => {
  const { page } = await setup(t); await enable(page); const original = await record(page);
  await page.reload(); await page.locator(".item").first().waitFor(); assert.equal((await record(page)).expiresAt, original.expiresAt);
  payload.generatedAt = "2026-10-13T00:00:00Z"; payload.items = [payload.items[0]];
  await page.reload(); await page.waitForFunction(() => document.querySelectorAll(".item").length === 1); await page.waitForFunction(async DB => { const db = await new Promise(r => { const q = indexedDB.open(DB); q.onsuccess = () => r(q.result); }); const value = await new Promise(r => { const q = db.transaction("records").objectStore("records").get("active"); q.onsuccess = () => r(q.result); }); db.close(); return value.payload.items.length === 1; }, DB);
  assert.equal((await record(page)).payload.items.length, 1);
  status = 503; await page.reload(); await page.locator(".item").first().waitFor(); await page.waitForFunction(() => document.querySelector(".publish-status").textContent.includes("通信できません")); assert.equal((await record(page)).payload.items.length, 1);
  await mutateRecord(page, "expire"); await page.reload(); await page.locator(".error").waitFor(); assert.equal((await record(page)).payload, undefined);
  status = 200; await page.locator(".retry").click(); await page.locator(".item").waitFor(); assert.equal((await record(page)).payload, undefined);
  payload.generatedAt = "2026-11-15T00:00:00Z"; await page.reload(); await page.waitForFunction(() => document.querySelector(".sync")?.textContent.includes("11/15")); await page.waitForTimeout(200); assert.ok((await record(page)).payload);
});
test("PWA corrupt snapshot, published 404 purge and explicit deletion preserve unrelated storage", async t => {
  const { page } = await setup(t); await enable(page);
  await page.evaluate(async () => { localStorage.setItem("other-app", "keep"); await caches.open("other-app-cache"); });
  await mutateRecord(page, "corrupt"); await page.reload(); await page.locator(".item").first().waitFor(); assert.equal(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length), 1);
  await page.locator(".offline-panel summary").click(); await page.locator(".save-offline").click(); await page.waitForFunction(() => document.querySelector(".storage-message").textContent.includes("有効にしました"));
  status = 404; await page.reload(); await page.locator(".error").waitFor(); assert.match(await page.locator(".error").innerText(), /公開されていません/);
  assert.equal(await page.evaluate(async () => (await indexedDB.databases()).some(db => db.name === "travel-itinerary-offline-v1")), false);
  status = 200; await page.locator(".retry").click(); await page.locator(".item").first().waitFor(); await enable(page); await page.locator(".delete-offline").click();
  await page.waitForFunction(() => document.querySelector(".storage-message").textContent.includes("削除しました"));
  assert.deepEqual(await page.evaluate(async () => ({ db: await indexedDB.databases(), caches: await caches.keys(), registrations: (await navigator.serviceWorker.getRegistrations()).length, unrelated: localStorage.getItem("other-app") })), { db: [], caches: ["other-app-cache"], registrations: 0, unrelated: "keep" });
});
test("PWA storage denied and quota failure remain usable online", async t => {
  const { page } = await setup(t, { init: () => { const open = indexedDB.open.bind(indexedDB); indexedDB.open = (...args) => { if (window.__denySave) throw new DOMException("Quota exceeded", "QuotaExceededError"); return open(...args); }; } });
  await page.evaluate(() => window.__denySave = true); await page.locator(".offline-panel summary").click(); await page.locator(".save-offline").click();
  await page.waitForFunction(() => document.querySelector(".storage-message").textContent.includes("Quota")); assert.equal(await page.locator(".item").count(), 8); assert.equal(await page.evaluate(async () => (await navigator.serviceWorker.getRegistrations()).length), 0);
  await page.locator('.close-menu').click(); assert.match(await page.locator('.state-notice').innerText(),/Quota/);
});
test("PWA waiting update, multiple tabs block activation, partial install fails atomically, recovery retires SW", async t => {
  const { page, context } = await setup(t); await enable(page);
  shellVariant = "update-v2";
  await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update()); await page.locator(".update-app").waitFor({ state: "visible" });
  const second = await context.newPage(); await second.goto(base); await second.locator(".item").first().waitFor();
  await page.locator(".update-app").click(); await page.waitForFunction(() => document.querySelector(".storage-message").textContent.includes("他のタブ"));
  await second.close(); await page.locator(".update-app").click(); await page.waitForFunction(() => document.documentElement.nextSibling?.textContent.includes("update-v2"));
  assert.equal((await page.evaluate(() => caches.keys())).length, 1);
  broken = true; shellVariant = "broken-v3";
  await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
  await page.waitForTimeout(1000); assert.deepEqual(await page.evaluate(() => caches.keys()), [`travel-itinerary-shell-${digest("update-v2").slice(0,16)}`]);
  await context.setOffline(true); await page.reload(); await page.locator(".item").first().waitFor(); assert.equal(await page.evaluate(() => document.documentElement.nextSibling?.textContent), " update-v2 ");
  await context.setOffline(false); broken = false; shellVariant = "recovery";
  await context.route("https://unpkg.com/**", async route => { const css = route.request().url().endsWith(".css"); await route.fulfill({ contentType: css ? "text/css" : "application/javascript", body: await readFile(`node_modules/leaflet/dist/leaflet.${css ? "css" : "js"}`) }); });
  await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
  await page.waitForFunction(() => document.querySelector(".item") && !document.querySelector(".offline-panel"));
  await page.waitForFunction(async () => (await navigator.serviceWorker.getRegistrations()).length === 0 && (await caches.keys()).length === 0);
  assert.deepEqual(await page.evaluate(() => caches.keys()), []);
  await page.reload(); await page.locator(".item").first().waitFor(); assert.equal(await page.locator(".offline-panel").count(), 0, "baseline UI served through network-only recovery");
});
test("PWA no snapshot times out in three seconds and offers retry", async t => {
  const { page } = await setup(t); delay = 4000; await page.reload(); await page.locator(".error").waitFor(); assert.match(await page.locator(".error").innerText(), /事前|保存済み/); delay = 0; await page.locator(".retry").click(); await page.locator(".item").first().waitFor();
});

test("PWA stale/throttled cannot renew; runtime expiration removes offline payload before display", async t => {
  const { page, context } = await setup(t); await enable(page); const before = await record(page);
  for (const header of ["stale", "throttled"]) {
    cacheHeader = header; payload.generatedAt = "2026-10-13T00:00:00Z";
    await page.reload(); await page.locator(".item").first().waitFor(); await page.waitForFunction(() => /失敗|クールダウン/.test(document.querySelector(".publish-status").textContent));
    assert.equal((await record(page)).expiresAt, before.expiresAt); assert.equal((await record(page)).generatedAt, before.generatedAt);
  }
  await context.setOffline(true); await page.reload(); await page.locator(".item").first().waitFor();
  await mutateRecord(page, "expire"); await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange"))); await page.locator(".error").waitFor(); assert.equal((await record(page)).payload, undefined);
});

test("PWA incomplete initial shell leaves no partial cache and retry succeeds", async t => {
  const { page } = await setup(t); broken = true;
  await page.locator(".offline-panel summary").click(); await page.locator(".save-offline").click();
  await page.waitForFunction(() => !document.querySelector(".save-offline").disabled && document.querySelector(".storage-message").textContent.includes("保存できません"));
  assert.deepEqual(await page.evaluate(() => caches.keys()), []); assert.equal(await page.locator(".item").count(), 8);
  broken = false; await page.locator(".save-offline").click(); await page.waitForFunction(() => document.querySelector(".storage-message").textContent.includes("有効にしました")); assert.equal((await page.evaluate(() => caches.keys())).length, 1);
});

test("PWA known broken production shell receives automatic repair; ordinary updates still wait", async t => {
  const { page } = await setup(t); await enable(page);
  await page.evaluate(() => caches.open("travel-itinerary-shell-de42708cbeae0de0"));
  shellVariant = "repaired-release"; await page.evaluate(async () => (await navigator.serviceWorker.getRegistration()).update());
  await page.waitForFunction(() => document.documentElement.nextSibling?.textContent.includes("repaired-release"));
  assert.equal((await page.evaluate(() => caches.keys())).length, 1); assert.ok((await record(page)).payload);
});


test('Phase 5 AC15/16/17: actual legacy UI saved profile waits, explicit update then closed-profile offline restart',async t=>{
  const {page,context,profile,close}=await setup(t,{legacy:true});assert.equal(await page.locator('.menu-bar').count(),0);
  await enable(page);const before=await record(page);let navigations=0;page.on('framenavigated',frame=>{if(frame===page.mainFrame())navigations++;});
  shellVariant='original';await page.evaluate(async()=>{await(await navigator.serviceWorker.getRegistration()).update();});
  await page.waitForFunction(async()=>Boolean((await navigator.serviceWorker.getRegistration()).waiting));
  await page.locator('.update-app').waitFor({state:'visible'});await page.waitForTimeout(500);
  assert.equal(navigations,0,'ordinary update does not reload');assert.equal(await page.locator('.menu-bar').count(),0,'still the real old UI');
  assert.deepEqual(await record(page),before);await page.screenshot({path:'artifacts/phase5-legacy-update-waiting.png'});
  await page.locator('.update-app').click();await page.locator('.menu-bar').waitFor();await page.waitForFunction(()=>navigator.serviceWorker.controller);
  assert.equal(navigations,1,'explicit action reloads once');assert.deepEqual(await record(page),before,'public saved trip survives migration');
  const shell=await page.evaluate(async()=>{const names=await caches.keys();const urls=[];for(const name of names){const cache=await caches.open(name);urls.push(...(await cache.keys()).map(req=>new URL(req.url).pathname));}return {names,urls,assets:[...document.querySelectorAll('script[src],link[rel="stylesheet"]')].map(el=>new URL(el.src||el.href).pathname)};});
  assert.deepEqual(shell.names,['travel-itinerary-shell-'+assetManifest.version]);
  assert.deepEqual(shell.urls.sort(),assetManifest.precache.map(f=>f.url).sort(),'only the new verified asset set remains');
  for(const asset of shell.assets)assert.ok(Object.values(assetManifest.assets).includes(asset),'no legacy DOM asset '+asset);
  assert.equal(await page.evaluate(()=>__geoCalls),0);await close();
  const restarted=await launch(profile);t.after(()=>restarted.close());await restarted.setOffline(true);const offline=withNavigation(restarted.pages()[0]);
  await offline.goto(base);await offline.locator('.menu-bar').waitFor();await offline.locator('.item').first().waitFor();assert.equal(await offline.locator('.map-panel').getAttribute('data-mode'),'minimal');
  await offline.locator('[data-scene="series"]').click();assert.equal(await offline.locator('#app').getAttribute('data-scene'),'true');
  await offline.locator('.nav-compare').click();await offline.locator('[data-select="series-child"]').click();
  await offline.getByRole('button',{name:'候補比較の次の候補',exact:true}).click();await offline.waitForFunction(()=>document.querySelector('[data-candidate="other"]').dataset.active==='true');
  await offline.locator('.nav-map').click();await offline.locator('.place-pin').first().waitFor();await offline.locator('[data-mode="expanded"]').click();await offline.keyboard.press('Escape');
  assert.equal(await offline.locator('#app').getAttribute('data-scene'),'true');await offline.locator('.scene-back').click();
  await offline.locator('.nav-map').click();await offline.locator('.nav-compare').click();assert.match(await offline.locator('.nav-compare').innerText(),/1件/);
  assert.match(await offline.locator('.state-notice').innerText(),/圏外/);assert.match(await offline.locator('.nav-more').innerText(),/圏外/);await offline.screenshot({path:'artifacts/phase5-offline.png'});
  await offline.locator('.nav-more').click();await offline.locator('.time-panel > summary').click();await offline.locator('.time-next').click();await offline.locator('.time-reset').click();await offline.locator('.close-menu').click();
  assert.equal(await offline.evaluate(()=>localStorage.length+sessionStorage.length),0);const final=await record(offline);assert.deepEqual(final,before);
  await writeFile('artifacts/phase5-migration-evidence.json',JSON.stringify({legacyVersion:JSON.parse(await readFile(legacyDir+'/asset-manifest.json','utf8')).version,newVersion:assetManifest.version,navigations,shell,savedVersion:final.generatedAt,expiresAt:final.expiresAt,offlineRestart:true},null,2));
});
