import test from "node:test";
import assert from "node:assert/strict";
import { buildTripPayload, publicTripPayload } from "../scripts/notion.mjs";
const txt = (s) => ({ rich_text: [{ plain_text: s }] });
const rel = (...ids) => ({ type: "relation", relation: ids.map((id) => ({ id })) });
const sel = (name) => ({ select: { name } });
const period = (start, end) => ({ date: { start, end } });
const trip = { id: "secret-trip", properties: { Trip: txt("Trip"), Slug: txt("trip"), Timezone: txt("Asia/Tokyo"), Period: period("2026-11-14", "2026-11-15") } };
const places = ["secret-p", "secret-q"].map(id => ({ id, properties: { Place: txt("Public place"), Latitude: { number: 35 }, Longitude: { number: 139 } } }));
function node(id, structure = "Item", parent = null, timed = false) {
  return { id, properties: { Item: txt(`Public ${id.replace("secret-", "")}`), Trip: rel(trip.id), Type: sel("Note"), Publish: { checkbox: true }, Structure: sel(structure), Parent: rel(...(parent ? [parent] : [])), Period: timed ? period("2026-11-14T00:00:00Z", "2026-11-14T01:00:00Z") : period(null, null) } };
}
function flexible(parent = null) { const f = node("secret-flex", "Flexible Block", parent, true); return [f, node("secret-child", "Item", f.id)]; }
function detour(structure = "Item") {
  const t = node("secret-transit", "Item", null, true); Object.assign(t.properties, { Type: sel("Transit"), From: rel("secret-p"), To: rel("secret-q") });
  const d = node("secret-detour", structure); Object.assign(d.properties, { "Detour For": rel(t.id), "Additional Duration Minutes": { number: 0 }, "Duration Minutes": { number: 20 }, "Rejoin Place": rel("secret-p"), "Opening Hours": txt("09:00–17:00") });
  const children = structure === "Item" ? [] : [node("secret-a", "Item", d.id), ...(structure === "Alternative Group" ? [node("secret-b", "Item", d.id)] : [])];
  children.forEach(c => c.properties["Duration Minutes"] = { number: 10 });
  return [t, d, ...children];
}
const build = itemPages => buildTripPayload({ tripPage: trip, placePages: places, itemPages });
test("Phase 3 sync permits every Flexible Block parent and maximum hierarchy, preserves untimed children", () => {
  for (const ancestors of [[], [node("secret-series", "Series")], [node("secret-group", "Alternative Group"), node("secret-peer", "Item", "secret-group", true)], [node("secret-group", "Alternative Group"), node("secret-peer", "Item", "secret-group", true), node("secret-series", "Series", "secret-group")]]) {
    const parent = ancestors.find(x => x.properties.Structure.select.name === "Series") || ancestors.find(x => x.properties.Structure.select.name === "Alternative Group");
    const p = build([...ancestors, ...flexible(parent?.id)]);
    assert.equal(p.items.find(x => x.id === "secretchild").start, null);
    assert.equal(p.items.find(x => x.id === "secretflex").end, "2026-11-14T01:00:00.000Z");
  }
});
for (const structure of ["Item", "Series", "Alternative Group"]) test(`Phase 3 sync accepts ${structure} detour, untimed duration and zero additional duration`, () => {
  const p = build(detour(structure)), d = p.items.find(x => x.id === "secretdetour");
  assert.equal(d.detourForId, "secrettransit"); assert.equal(d.additionalDurationMinutes, 0); assert.equal(d.rejoinPlaceId, "secretp"); assert.equal(d.openingHours, "09:00–17:00");
  assert.equal(d.start, null);
});
for (const [name, fixture, mutate, pattern] of [
  ["normal Item requires Period", () => [node("normal")], () => {}, /Period/],
  ["flex requires start", flexible, p => p[0].properties.Period = period(null, null), /Period/],
  ["flex requires end", flexible, p => p[0].properties.Period.date.end = null, /Period/],
  ["empty flex", flexible, p => p.pop(), /insufficient/],
  ["flex cannot hold series", flexible, p => p[1].properties.Structure = sel("Series"), /forbidden/],
  ["Item cannot hold flex", flexible, p => { p.push(node("normal", "Item", null, true)); p[0].properties.Parent = rel("normal"); }, /forbidden/],
  ["detour relation wrong type", detour, p => p[1].properties["Detour For"] = { type: "rich_text", rich_text: [] }, /Detour For/],
  ["detour multiple targets", detour, p => p[1].properties["Detour For"] = rel(p[0].id, "other"), /Detour For/],
  ["detour truncated targets", detour, p => p[1].properties["Detour For"].has_more = true, /Detour For/],
  ["detour self target", detour, p => p[1].properties["Detour For"] = rel(p[1].id), /Detour For/],
  ["detour non Transit target", detour, p => p[0].properties.Type = sel("Note"), /Detour For/],
  ["detour private target", detour, p => p[0].properties.Publish.checkbox = false, /Detour For/],
  ["detour different trip", detour, p => p[0].properties.Trip = rel("other-trip"), /Detour For/],
  ["detour missing target", detour, p => p[1].properties["Detour For"] = rel("absent"), /Detour For/],
  ["detour target container", () => detour("Series"), p => p[1].properties["Detour For"] = rel(p[1].id), /Detour For/],
  ["detour descendant target", () => detour("Series"), p => { p[1].properties["Detour For"] = rel(p[2].id); Object.assign(p[2].properties, { Type: sel("Transit"), From: rel("secret-p"), To: rel("secret-q") }); }, /Detour For/],
  ["child detour relation", () => detour("Series"), p => p[2].properties["Detour For"] = rel(p[0].id), /Detour For/],
  ["flex inside detour", () => detour("Series"), p => { p.push(...flexible(p[1].id)); }, /Flexible Block.*detour/],
  ["flex detour root", detour, p => p[1].properties.Structure = sel("Flexible Block"), /Flexible Block.*detour/],
  ["missing additional duration", detour, p => delete p[1].properties["Additional Duration Minutes"], /Additional Duration/],
  ["negative additional duration", detour, p => p[1].properties["Additional Duration Minutes"] = { number: -1 }, /Additional Duration/],
  ["NaN additional duration", detour, p => p[1].properties["Additional Duration Minutes"] = { number: NaN }, /Additional Duration/],
  ["missing untimed duration", detour, p => delete p[1].properties["Duration Minutes"], /Duration Minutes/],
  ["negative duration", detour, p => p[1].properties["Duration Minutes"] = { number: -1 }, /Duration Minutes/],
  ["rejoin relation wrong type", detour, p => p[1].properties["Rejoin Place"] = { type: "number", number: 2 }, /Rejoin Place/],
  ["multiple rejoin", detour, p => p[1].properties["Rejoin Place"] = rel("secret-p", "secret-q"), /Rejoin Place/],
  ["private rejoin", detour, p => p[1].properties["Rejoin Place"] = rel("absent"), /Rejoin Place/],
]) test(`Phase 3 sync rejects ${name}`, () => { const p = fixture(); mutate(p); assert.throws(() => build(p), pattern); });
test("Phase 3 public IDs convert secondary relations stably without leaking internal IDs or mutating input", async () => {
  const raw = build(detour()), p = await publicTripPayload(raw), d = p.items.find(x => x.title === "Public detour");
  assert.equal(d.detourForId, p.items.find(x => x.type === "Transit").id);
  assert.equal(d.rejoinPlaceId, p.places[0].id); assert.doesNotMatch(JSON.stringify(p), /secret[-]|secretdetour|secrettransit|secretp|secretq/);
  assert.deepEqual(p, await publicTripPayload(raw)); assert.equal(raw.items.find(x => x.id === "secretdetour").detourForId, "secrettransit");
  assert.deepEqual(await publicTripPayload(p), p);
});
test("Phase 3 Phase 2 payload missing new fields stays usable", async () => {
  const raw = build([node("legacy", "Item", null, true)]); for (const n of raw.items) for (const k of ["detourForId", "rejoinPlaceId", "openingHours", "additionalDurationMinutes"]) delete n[k];
  const p = await publicTripPayload(raw); assert.equal(p.items.length, 1); assert.equal(p.items[0].parentId, null); assert.equal(p.items[0].detourForId, null);
});
