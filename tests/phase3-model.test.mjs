import test from "node:test";
import assert from "node:assert/strict";
import * as m from "../public/model.mjs";
const day = "2026-11-14", zone = "Asia/Tokyo", range = { start: 540, end: 600 };
const items = [
  { id: "flex", structure: "Flexible Block", title: "Free", start: `${day}T00:00:00Z`, end: `${day}T01:00:00Z` },
  { id: "b", parentId: "flex", title: "B", order: 1, status: "Candidate", placeId: "b" },
  { id: "a", parentId: "flex", title: "A", order: 1, status: "Confirmed", placeId: "a", start: `${day}T00:30:00Z` },
  { id: "c", parentId: "flex", title: "C", order: 0, status: "Candidate", placeId: "c" },
  { id: "transit", title: "Transit", type: "Transit", transport: "Bus", fromId: "a", toId: "b", start: `${day}T01:00:00Z`, end: `${day}T02:00:00Z` },
  { id: "detour", title: "Detour", detourForId: "transit", placeId: "c", durationMinutes: 10, additionalDurationMinutes: 20 },
  { id: "next", title: "Next", placeId: "a", start: `${day}T02:30:00Z` },
];
const places = new Map(["a", "b", "c"].map((id, i) => [id, { id, latitude: 35 + i, longitude: 139, address: "公開住所 & ? 日本" }]));
const visible = () => m.filterTree(m.buildTree(items).roots, m.defaultFilters(), new Set(), day, zone);
test("Phase 3 model untimed candidates order/status/name, no inherited timestamps, tri-state and focus IDs", () => {
  const f = m.buildTree(items).byId.get("flex"); assert.deepEqual(f.children.map(x => x.id), ["c", "a", "b"]); assert.equal(f.children[0].start, undefined);
  assert.equal(m.selectionState(f, new Set(["a"])), "mixed"); assert.equal(m.toggleSelection(f, new Set(["a"])).size, 3);
  assert.deepEqual([...m.focusedMapIds("flex", visible(), new Map())], ["flex", "c", "a", "b"]);
  assert.deepEqual([...m.focusedMapIds("b", visible(), new Map())], ["b"]);
});
test("Phase 3 model Flexible children inherit day/range decisions only, filters preserve ancestors", () => {
  assert.equal(m.flattenTree(visible()).filter(x => x.parentId === "flex").length, 3);
  assert.deepEqual(m.mapNodes(visible(), new Map(), range, day, zone, places).map(x => x.id), ["c", "a", "b"]);
  assert.deepEqual(m.mapNodes(visible(), new Map(), { start: 570, end: 585 }, day, zone, places).map(x => x.id), ["c", "a", "b"]);
  assert.ok(!m.mapNodes(visible(), new Map(), { start: 600, end: 615 }, day, zone, places).some(x => x.parentId === "flex"));
  const filtered = m.filterTree(m.buildTree(items).roots, { ...m.defaultFilters(), selectedOnly: true }, new Set(["b"]), day, zone);
  assert.deepEqual(m.flattenTree(filtered).map(x => x.id), ["flex", "b"]);
});
test("Phase 3 model detour attaches separately, never root or automatic map, explicit expand/focus/selection enables it", () => {
  const tree = m.buildTree(items); assert.ok(!tree.roots.some(x => x.id === "detour")); assert.equal(tree.byId.get("transit").detours[0].id, "detour");
  const full = { start: 0, end: 1440 };
  const nodes = (s) => m.mapNodes(visible(), new Map(), full, day, zone, places, s).map(x => x.id);
  assert.ok(!nodes().includes("detour")); assert.ok(!nodes({ expandedItemIds: new Set(["transit"]) }).includes("detour"));
  for (const s of [{ expandedItemIds: new Set(["detour"]) }, { focusedItemId: "detour" }, { selectedIds: new Set(["detour"]) }]) assert.ok(nodes(s).includes("detour"));
});
test("Phase 3 model detour slack exact zero, positive, exceeded and no next, ignores filter projections", () => {
  const tree = m.buildTree(items), t = tree.byId.get("transit"), d = tree.byId.get("detour");
  assert.equal(m.detourAssessment(d, t, tree).minutes, 10);
  assert.equal(m.detourAssessment({ ...d, additionalDurationMinutes: 30 }, t, tree).text, "寄り道可能・0分余裕");
  assert.equal(m.detourAssessment({ ...d, additionalDurationMinutes: 45 }, t, tree).text, "予定超過・15分");
  assert.equal(m.detourAssessment(d, t, m.buildTree(items.filter(x => x.id !== "next"))).text, "次の予定がないため判定不可");
  assert.equal(m.detourAssessment(d, t, tree).minutes, 10);
});
test("Phase 3 model slack stays in Transit alternative branch and skips flexible candidates/detours", () => {
  const tree = m.buildTree([
    { id: "g", structure: "Alternative Group", title: "G" }, { id: "s", structure: "Series", parentId: "g", title: "S" },
    { ...items[4], parentId: "s" }, { ...items[6], parentId: "s" },
    { id: "other", parentId: "g", title: "Other", start: `${day}T02:05:00Z` }, items[5],
  ]);
  assert.equal(m.detourAssessment(tree.byId.get("detour"), tree.byId.get("transit"), tree).minutes, 10);
});
test("Phase 3 model destination resolution normal/Transit/flexible child/detour/Series focused or first/active group", () => {
  const tree = m.buildTree([...items, { id: "s", title: "S", structure: "Series" }, { id: "x", title: "X", parentId: "s", placeId: "a", transport: "Walk" }, { id: "y", title: "Y", parentId: "s", placeId: "c", transport: "Car" }, { id: "g", title: "G", structure: "Alternative Group" }, { id: "z", title: "Z", parentId: "g", placeId: "b" }]);
  const dest = (id, focus, active = new Map()) => m.resolveDestination(tree.byId.get(id), places, focus, active);
  assert.equal(dest("transit").place.id, "b"); assert.equal(dest("b").place.id, "b"); assert.equal(dest("detour").place.id, "c");
  assert.equal(dest("s").place.id, "a"); assert.equal(dest("s", "y").place.id, "c"); assert.equal(dest("g", null, new Map([["g", "z"]])).place.id, "b");
  assert.equal(dest("flex"), null);
});
test("Phase 3 model Directions URL fixed origin/allowed params/encoding/travel modes and no arbitrary navigation URL", () => {
  for (const [transport, mode] of [["Walk", "walking"], ["Train", "transit"], ["Bus", "transit"], ["Car", "driving"], ["Ferry", null], [null, null]]) {
    const url = new URL(m.buildDirectionsUrl({ latitude: 35.123, longitude: 139.456 }, { place: places.get("a"), item: { transport, navigationUrl: "javascript:alert(1)" } }));
    assert.equal(url.origin, "https://www.google.com"); assert.equal(url.pathname, "/maps/dir/"); assert.equal(url.searchParams.get("origin"), "35.123,139.456"); assert.equal(url.searchParams.get("travelmode"), mode);
    assert.ok([...url.searchParams.keys()].every(k => ["api", "origin", "destination", "travelmode"].includes(k)));
  }
  const address = { address: "公開住所 & ? 日本" }, url = m.buildDirectionsUrl({ latitude: 35, longitude: 139 }, { place: address, item: {} });
  assert.equal(new URL(url).searchParams.get("destination"), address.address); assert.ok(!url.includes(" 日本"));
  assert.equal(m.buildDirectionsUrl(null, { place: address, item: {} }), null);
  assert.equal(m.buildDirectionsUrl({ latitude: 95, longitude: 139 }, { place: address, item: {} }), null);
});
test("Phase 3 model stale after more than five minutes, not at boundary", () => {
  assert.equal(m.locationIsStale({ timestamp: 1000 }, 301000), false); assert.equal(m.locationIsStale({ timestamp: 1000 }, 301001), true); assert.equal(m.locationIsStale(null), true);
});
