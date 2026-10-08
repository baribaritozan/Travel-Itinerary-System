import test from "node:test";
import assert from "node:assert/strict";
import { buildTripPayload, publicTripPayload } from "../scripts/notion.mjs";
const text = (value) => ({ rich_text: [{ plain_text: value }] });
const rel = (...ids) => ({ relation: ids.map((id) => ({ id })) });
const select = (name) => ({ select: { name } });
const trip = { id: "internal-trip", properties: { Trip: text("Test"), Slug: text("test"), Timezone: text("Asia/Tokyo"), Period: { date: { start: "2026-11-01", end: "2026-11-02" } } } };
function page(id, structure = "Item", parent, start = "2026-11-01T01:00:00Z", end = "2026-11-01T02:00:00Z") {
  return { id, properties: { Item: text(id.replace("internal-", "Sample ")), Trip: rel(trip.id), Publish: { checkbox: true }, Structure: select(structure), Parent: rel(...(parent ? [parent] : [])), Type: select("Note"), Period: { date: { start: structure === "Item" ? start : null, end: structure === "Item" ? end : null } } } };
}
function fixture() { return [page("internal-group", "Alternative Group"), page("internal-series", "Series", "internal-group"), page("internal-a", "Item", "internal-series"), page("internal-b", "Item", "internal-group"), page("internal-root"), page("internal-rootseries", "Series"), page("internal-c", "Item", "internal-rootseries")]; }
const build = (itemPages) => buildTripPayload({ tripPage: trip, itemPages, placePages: [] });
test("all allowed roots and Alternative Group → Series → Item are flat, derive periods, never inherit properties", () => {
  const pages = fixture(); pages[0].properties.Status = select("Confirmed");
  const payload = build(pages), group = payload.items.find((node) => node.structure === "Alternative Group");
  assert.equal(payload.items.length, 7); assert.equal(group.start, "2026-11-01T01:00:00.000Z"); assert.equal(group.end, "2026-11-01T02:00:00.000Z");
  assert.equal(payload.items.find((node) => node.id === "internala").status, null); assert.ok(payload.items.every((node) => !node.children));
});
test("Structure absent means Item and Parent absent means root", () => {
  const item = page("legacy"); delete item.properties.Structure; delete item.properties.Parent;
  assert.equal(build([item]).items[0].structure, "Item"); assert.equal(build([item]).items[0].parentId, null);
});
test("all-day container Period contains timed children in the Trip timezone, including the end calendar day", () => {
  const pages = fixture(); pages[0].properties.Period = { date: { start: "2026-11-01" } };
  assert.equal(build(pages).items.find((node) => node.structure === "Alternative Group").start, "2026-11-01");
  pages[0].properties.Period = { date: { start: "2026-10-31", end: "2026-11-01" } };
  assert.doesNotThrow(() => build(pages));
  pages[0].properties.Period = { date: { start: "2026-10-31" } };
  assert.throws(() => build(pages), /contain/);
});
for (const [name, mutate, pattern] of [
  ["cycle", (p) => p[0].properties.Parent = rel(p[1].id), /cycle/],
  ["multiple parents", (p) => p[2].properties.Parent = rel(p[0].id, p[1].id), /multiple parents/],
  ["truncated parent relation", (p) => p[2].properties.Parent.has_more = true, /multiple parents/],
  ["different Trip", (p) => p[1].properties.Trip = rel("another-trip"), /same Trip/],
  ["multiple trips", (p) => p[2].properties.Trip = rel(trip.id, "another-trip"), /one Trip/],
  ["unpublished parent", (p) => p[1].properties.Publish.checkbox = false, /published/],
  ["orphan", (p) => p[2].properties.Parent = rel("absent"), /orphan/],
  ["group under group", (p) => { p[1].properties.Structure = select("Alternative Group"); }, /forbidden nesting/],
  ["series under series", (p) => p[5].properties.Parent = rel(p[1].id), /forbidden nesting/],
  ["group under series", (p) => p[0].properties.Parent = rel(p[5].id), /forbidden nesting/],
  ["Item has child", (p) => p[1].properties.Parent = rel(p[4].id), /Item parent/],
  ["empty series", (p) => p[6].properties.Publish.checkbox = false, /insufficient/],
  ["one candidate group", (p) => p[3].properties.Publish.checkbox = false, /insufficient/],
  ["unknown structure", (p) => p[1].properties.Structure = select("Nested"), /Structure/],
  ["Period not containing children", (p) => p[0].properties.Period = { date: { start: "2026-11-01T01:30:00Z", end: "2026-11-01T01:45:00Z" } }, /contain/],
]) test(`sync rejects ${name}`, () => { const pages = fixture(); mutate(pages); assert.throws(() => build(pages), pattern); });
test("explicit representative Period encompasses children, and stable public parentIds expose no internal IDs", async () => {
  const pages = fixture(); pages[0].properties.Period = { date: { start: "2026-11-01T00:00:00Z", end: "2026-11-01T03:00:00Z" } };
  const raw = build(pages), payload = await publicTripPayload(raw), again = await publicTripPayload(build(pages));
  const group = payload.items.find((node) => node.structure === "Alternative Group"), series = payload.items.find((node) => node.parentId === group.id && node.structure === "Series");
  assert.ok(series); assert.ok(payload.items.find((node) => node.parentId === series.id)); assert.equal(group.start, "2026-11-01T00:00:00.000Z");
  assert.deepEqual(payload.items, again.items); assert.doesNotMatch(JSON.stringify(payload), /internal[-]|internalgroup|internalseries|internaltrip/);
  assert.equal(raw.items.find((node) => node.id === "internalseries").parentId, "internalgroup");
});
