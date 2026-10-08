import test from "node:test";
import assert from "node:assert/strict";
import { buildTripPayload, syncTripFromNotion, queryDataSource } from "../scripts/notion.mjs";
import { ItineraryState, handleItineraryRequest, handleRefreshRequest, handleNotionWebhook } from "../src/worker.mjs";

const text = (value) => ({ rich_text: [{ plain_text: value }] });
const rel = (id) => ({ relation: [{ id }] });
const tripPage = { id: "internal-trip", properties: { Trip: text("Test trip"), Slug: text("sample-trip"), Timezone: text("Asia/Tokyo"), Period: { date: { start: "2026-10-08", end: "2026-10-10" } } } };
const placePage = { id: "internal-place", properties: { Place: text("Test station"), Latitude: { number: 35 }, Longitude: { number: 139 }, Website: { url: "javascript:alert(1)" }, "Maps URL": { url: "https://www.notion.so/private" }, "Public Notes": text("Public"), Secret: text("NEVER_PUBLISH") } };
const itemPage = { id: "internal-item", properties: { Item: text("Start"), Trip: rel(tripPage.id), Place: rel(placePage.id), Period: { date: { start: "2026-10-08T09:00:00", end: "2026-10-08T10:00:00", time_zone: "Asia/Tokyo" } }, "Reservation Status": { select: { name: "Booked" } }, "Total Cost": { number: 1200 }, "Per Person Cost": { number: 600 }, Currency: { select: { name: "JPY" } }, "Duration Minutes": { number: 60 }, "Reservation Number": text("NEVER_PUBLISH"), "Public Notes": text("Public meeting spot") } };
const env = { NOTION_TOKEN: "fixture-only", DEFAULT_TRIP_SLUG: "sample-trip", NOTION_TRIPS_DATA_SOURCE_ID: "trips", NOTION_PLACES_DATA_SOURCE_ID: "places", NOTION_ITEMS_DATA_SOURCE_ID: "items" };

function notionFetch(calls) {
  return async (url, options) => {
    calls.push({ url, options });
    const source = /data_sources\/([^/]+)/.exec(url)[1];
    return Response.json({ results: [{ trips: tripPage, places: placePage, items: itemPage }[source]], has_more: false });
  };
}

test("Notion sync only queries Publish=true and exposes public fields with opaque IDs", async () => {
  const calls = [];
  const payload = await syncTripFromNotion({ token: env.NOTION_TOKEN, tripSlug: "sample-trip", tripsDataSourceId: "trips", placesDataSourceId: "places", itemsDataSourceId: "items", fetchImpl: notionFetch(calls) });
  assert.equal(calls.length, 3);
  for (const { options } of calls) assert.deepEqual(JSON.parse(options.body).filter, { property: "Publish", checkbox: { equals: true } });
  assert.equal(payload.trip.id, undefined);
  assert.equal(payload.items[0].placeId, payload.places[0].id);
  assert.equal(payload.items[0].start, "2026-10-08T00:00:00.000Z");
  assert.equal(payload.items[0].reservationStatus, "Booked"); assert.equal(payload.items[0].perPersonCost, 600);
  assert.equal(payload.places[0].website, null); assert.equal(payload.places[0].mapsUrl, null);
  assert.doesNotMatch(JSON.stringify(payload), /internal-|NEVER_PUBLISH|fixture-only|notion\.so/);
  const again = await syncTripFromNotion({ token: env.NOTION_TOKEN, tripSlug: "sample-trip", tripsDataSourceId: "trips", placesDataSourceId: "places", itemsDataSourceId: "items", fetchImpl: notionFetch([]) });
  assert.equal(again.items[0].id, payload.items[0].id);
});

test("Notion query paginates without dropping publish filter", async () => {
  let calls = 0;
  const result = await queryDataSource({ token: "fixture", dataSourceId: "fixture", filter: { published: true }, fetchImpl: async (_url, options) => {
    const body = JSON.parse(options.body); assert.deepEqual(body.filter, { published: true }); calls++;
    assert.equal(body.start_cursor, calls === 1 ? undefined : "next");
    return Response.json({ results: [calls], has_more: calls === 1, next_cursor: "next" });
  } });
  assert.deepEqual(result, [1, 2]);
});

test("invalid timezones, dates, coordinates, unpublished relations fail the entire sync", () => {
  const build = (trip = tripPage, place = placePage, item = itemPage) => buildTripPayload({ tripPage: trip, placePages: [place], itemPages: [item] });
  assert.throws(() => build({ ...tripPage, properties: { ...tripPage.properties, Timezone: text("Invalid/Zone") } }), /Timezone/);
  assert.throws(() => build(tripPage, { ...placePage, properties: { ...placePage.properties, Latitude: { number: 200 } } }), /coordinates/);
  assert.throws(() => build(tripPage, placePage, { ...itemPage, properties: { ...itemPage.properties, Place: rel("unpublished") } }), /published Place/);
  assert.throws(() => build(tripPage, placePage, { ...itemPage, properties: { ...itemPage.properties, Period: { date: { start: "not a date" } } } }), /invalid date/);
  assert.throws(() => build(tripPage, placePage, { ...itemPage, properties: { ...itemPage.properties, Period: { date: { start: "2026-10-08T10:00:00Z", end: "2026-10-08T09:00:00Z" } } } }), /end precedes/);
});

test("refresh failure keeps existing DO cache and returns stale; first failure returns 502", async () => {
  const payload = { trip: { name: "Cached" }, items: [], places: [] };
  const storage = { async get(key) { return key === "payload" ? payload : 0; }, async put() { assert.fail("failed sync must not overwrite cache"); } };
  const state = new ItineraryState({ storage }, {});
  state.refresh = async () => { throw new Error("fixture failure"); };
  const response = await state.fetch(new Request("https://internal/data?slug=sample-trip&refresh=1"));
  assert.equal(response.status, 200); assert.equal(response.headers.get("X-Itinerary-Cache"), "stale"); assert.deepEqual(await response.json(), payload);
  const empty = new ItineraryState({ storage: { async get() { return undefined; } } }, {}); empty.refresh = state.refresh;
  assert.equal((await empty.fetch(new Request("https://internal/data?slug=sample-trip"))).status, 502);
});

test("simultaneous Notion refreshes share one fetch and preserve the published cache", async () => {
  const original = globalThis.fetch, calls = [], stored = {};
  globalThis.fetch = async (...args) => { await new Promise((resolve) => setTimeout(resolve, 10)); return notionFetch(calls)(...args); };
  try {
    const state = new ItineraryState({ storage: { async put(values) { Object.assign(stored, values); } } }, env);
    const [first, second] = await Promise.all([state.refresh("sample-trip"), state.refresh("sample-trip")]);
    assert.deepEqual(first, second); assert.equal(calls.length, 3); assert.equal(stored.payload.trip.name, "Test trip");
  } finally { globalThis.fetch = original; }
});

test("fixed-trip, method, and unsigned-webhook boundaries are maintained", async () => {
  for (const handler of [handleItineraryRequest, handleRefreshRequest]) {
    const method = handler === handleItineraryRequest ? "GET" : "POST";
    assert.equal((await handler(new Request("https://example.com/api?slug=another-trip", { method }), env)).status, 404);
    assert.equal((await handler(new Request("https://example.com/api", { method: "DELETE" }), env)).status, 405);
  }
  let processed = false;
  const unsigned = await handleNotionWebhook(new Request("https://example.com/api/notion-webhook", { method: "POST", body: JSON.stringify({ type: "page.created", entity: { id: "fixture" } }) }), env, { waitUntil() { processed = true; } });
  assert.equal(unsigned.status, 401); assert.equal(processed, false);
  assert.equal((await handleNotionWebhook(new Request("https://example.com/api/notion-webhook", { method: "POST", body: "{" }), env)).status, 400);
});

test("legacy Durable Object cache is served with public IDs without modifying stored data", async () => {
  const payload = buildTripPayload({ tripPage, placePages: [placePage], itemPages: [itemPage] });
  payload.places[0].mapsUrl = "https://private.notion.site/internal";
  const original = structuredClone(payload);
  const state = new ItineraryState({ storage: { async get(key) { return key === "payload" ? payload : Date.now(); } } }, {});
  const response = await state.fetch(new Request("https://internal/data?slug=sample-trip"));
  const published = await response.json();
  assert.equal(response.headers.get("X-Itinerary-Cache"), "hit"); assert.doesNotMatch(JSON.stringify(published), /internaltrip|internalplace|internalitem/);
  assert.equal(published.items[0].placeId, published.places[0].id); assert.deepEqual(payload, original);
  assert.equal(published.places[0].mapsUrl, null);
});

test("signed Notion publish webhook still validates parent and records its result", async () => {
  const original = globalThis.fetch;
  const webhookEnv = { ...env, NOTION_PUBLISH_REQUESTS_DATA_SOURCE_ID: "requests", NOTION_WEBHOOK_VERIFICATION_TOKEN: "fixture-secret" };
  const body = JSON.stringify({ type: "page.created", entity: { id: "request" } });
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(webhookEnv.NOTION_WEBHOOK_VERIFICATION_TOKEN), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const bytes = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
  const signature = `sha256=${[...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
  for (const validParent of [true, false]) {
    let pending, refreshes = 0; const updates = [];
    globalThis.fetch = async (url, options) => {
      if (options?.method === "PATCH") { updates.push(JSON.parse(options.body)); return Response.json({}); }
      if (url.endsWith("/pages/request")) return Response.json({ parent: { data_source_id: validParent ? "requests" : "unrelated" }, properties: { Trip: rel(tripPage.id) } });
      if (url.endsWith(`/pages/${tripPage.id.replaceAll("-", "")}`)) return Response.json(tripPage);
      assert.fail(`unexpected request ${url}`);
    };
    webhookEnv.ITINERARY_STATE = {
      idFromName(slug) { assert.equal(slug, "sample-trip"); return slug; },
      get() { return { async fetch() { refreshes++; return Response.json({}); } }; },
    };
    try {
      const response = await handleNotionWebhook(new Request("https://example.com/api/notion-webhook", { method: "POST", headers: { "X-Notion-Signature": signature }, body }), webhookEnv, { waitUntil(promise) { pending = promise; } });
      assert.equal(response.status, 202); await pending;
      assert.equal(refreshes, validParent ? 1 : 0); assert.equal(updates.length, validParent ? 1 : 0);
      if (validParent) assert.equal(updates[0].properties.Status.select.name, "Published");
    } finally { globalThis.fetch = original; }
  }
});
