import test from "node:test";
import assert from "node:assert/strict";
import { publicSnapshot, nextRecord, expireRecord, RETENTION_MS } from "../public/offline.mjs";
import { resolvePlannedRoute, buildDirectionsUrl, directionsUrl } from "../public/model.mjs";
const trip = (generatedAt = "2026-10-12T00:00:00Z") => ({ generatedAt, trip: { name: "旅行", slug: "trip", timezone: "Asia/Tokyo" }, places: [{ id: "a", name: "駅", latitude: 35, longitude: 139 }, { id: "b", name: "宿", address: "住所 &?日本語" }], items: [{ id: "move", title: "移動", type: "Transit", fromId: "a", toId: "b", transport: "Bus" }] });
const origin = "https://example.test", now = Date.parse("2026-10-12T01:00:00Z");
test("offline serialization excludes unknown fields, nested state and GPS", () => {
  const input = trip(); input.currentLocation = { latitude: 12.3456 }; input.trip.notionId = "secret"; input.items[0].state = { location: input.currentLocation }; input.places[0].privateField = "private";
  assert.deepEqual(publicSnapshot(input), trip());
});
test("offline boundary rejects malformed data, references, cycles and timezone", () => {
  for (const mutate of [v => v.generatedAt = "bad", v => v.trip.timezone = "bad", v => v.items.push(v.items[0]), v => v.items[0].toId = "unknown", v => v.items[0].parentId = "move", v => v.places[0].latitude = {}, v => v.items[0].start = "bad"]) {
    const value = trip(); mutate(value); assert.throws(() => publicSnapshot(value));
  }
});
test("first save sets an exact thirty-day elapsed deadline", () => {
  const record = nextRecord(null, trip(), origin, now);
  assert.equal(record.expiresAt, now + RETENTION_MS); assert.equal(record.key, `${origin}|trip`);
  assert.equal(expireRecord(record, record.expiresAt - 1).payload.trip.name, "旅行");
  assert.equal(expireRecord(record, record.expiresAt).payload, undefined);
});
test("same and delayed older sync versions do not extend or replace the snapshot", () => {
  const record = nextRecord(null, trip(), origin, now), altered = trip(); altered.items = [];
  assert.deepEqual(nextRecord(record, altered, origin, now + 1000), record);
  assert.deepEqual(nextRecord(record, trip("2026-10-11T00:00:00Z"), origin, now + 2000), record);
});
test("new sync replaces the full payload and resets its deadline", () => {
  const record = nextRecord(null, trip(), origin, now), next = trip("2026-10-13T00:00:00Z"); next.items = []; next.places = [];
  const changed = nextRecord(record, next, origin, now + 1000);
  assert.equal(changed.firstSavedAt, now + 1000); assert.deepEqual(changed.payload.items, []);
});
test("stale and throttled sync cannot replace or renew; new consent also requires a usable response", () => {
  const record = nextRecord(null, trip(), origin, now);
  for (const header of ["stale", "throttled"]) {
    assert.deepEqual(nextRecord(record, trip("2026-10-13T00:00:00Z"), origin, now + 1, header), record);
    assert.equal(nextRecord(null, trip(), origin, now, header), null);
  }
});
test("expired tombstone blocks same-version resurrection but allows a newly synced version", () => {
  const record = nextRecord(null, trip(), origin, now), expired = expireRecord(record, now + RETENTION_MS);
  assert.equal(nextRecord(expired, trip(), origin, now + RETENTION_MS).payload, undefined);
  assert.ok(nextRecord(expired, trip("2026-11-13T00:00:00Z"), origin, now + RETENTION_MS).payload);
  assert.equal(expireRecord({ ...record, schema: 99 }), null);
  assert.equal(expireRecord({ ...record, expiresAt: 1 }), null);
});
test("latest single trip keeps an origin and slug boundary", () => {
  const record = nextRecord(null, trip(), origin, now), changed = trip(); changed.trip.slug = "other";
  assert.equal(nextRecord(record, changed, origin, now + 1).key, `${origin}|other`);
});
for (const [transport, mode] of [["Walk", "walking"], ["Train", "transit"], ["Bus", "transit"], ["Car", "driving"], ["Ferry", null], [undefined, null]]) test(`planned route mode ${transport}`, () => {
  const value = trip(), places = new Map(value.places.map(p => [p.id, p])); value.items[0].transport = transport;
  const result = resolvePlannedRoute(value.items[0], places), url = new URL(result.url);
  assert.equal(url.origin, "https://www.google.com"); assert.equal(url.pathname, "/maps/dir/"); assert.equal(url.searchParams.get("api"), "1");
  assert.equal(url.searchParams.get("origin"), "35,139"); assert.equal(url.searchParams.get("destination"), "住所 &?日本語"); assert.equal(url.searchParams.get("travelmode"), mode);
});
test("route resolution diagnoses each missing endpoint, whitespace and container", () => {
  const value = trip(), places = new Map(value.places.map(p => [p.id, p])), item = value.items[0];
  assert.match(resolvePlannedRoute({ ...item, fromId: null }, places).reason, /出発地/);
  assert.match(resolvePlannedRoute({ ...item, toId: null }, places).reason, /到着地/);
  assert.match(resolvePlannedRoute({ ...item, structure: "Series" }, places).reason, /個々/);
  assert.equal(directionsUrl({ address: "   " }, value.places[1]), null);
});
test("URLs prefer coordinates, encode dangerous text and enforce 2048 characters for both route types", () => {
  const target = { address: 'javascript:alert(1)&origin=evil#"<x>' };
  const url = new URL(directionsUrl({ address: "A & B" }, target, "Car"));
  assert.equal(url.searchParams.get("destination"), target.address); assert.equal(url.searchParams.get("origin"), "A & B");
  const place = { ...target, latitude: 34, longitude: 135 }; assert.equal(new URL(directionsUrl({ latitude: 35, longitude: 139 }, place)).searchParams.get("destination"), "34,135");
  const long = { address: "あ".repeat(1000) };
  assert.equal(directionsUrl({ address: "from" }, long), null);
  assert.equal(buildDirectionsUrl({ latitude: 35, longitude: 139 }, { place: long, item: {} }), null);
});
