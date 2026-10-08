import test from "node:test";
import assert from "node:assert/strict";
import { buildTree, flattenTree, selectionState, toggleSelection, pruneState, defaultFilters, filterTree, initialTimeRange, overlapsRange, shiftTimeRange, mapNodes, focusedMapIds } from "../public/model.mjs";
const day = "2026-11-01", zone = "Asia/Tokyo";
const items = [
  { id: "group", title: "Compare", structure: "Alternative Group", start: `${day}T00:00:00Z`, end: `${day}T04:00:00Z`, type: "Activity", placeId: "fallback" },
  { id: "series", title: "Plan A", structure: "Series", parentId: "group", status: "Confirmed", start: `${day}T00:00:00Z`, end: `${day}T04:00:00Z`, type: "Activity" },
  { id: "a", title: "A", parentId: "series", type: "Meal", reservationStatus: "Required", transport: "Walk", start: `${day}T00:00:00Z`, end: `${day}T01:00:00Z`, placeId: "place" },
  { id: "b", title: "B", parentId: "series", type: "Stay", reservationStatus: "Pending", transport: "Bus", start: `${day}T02:00:00Z`, end: `${day}T04:00:00Z`, placeId: "place" },
  { id: "candidate", title: "Plan B", parentId: "group", status: "Candidate", order: -10, type: "Meal", reservationStatus: "Booked", start: `${day}T01:00:00Z`, end: `${day}T02:00:00Z`, placeId: "other" },
  { id: "cancel", title: "Cancel", status: "Cancelled", type: "Meal", start: `${day}T00:00:00Z` },
];
const tree = () => buildTree(items);
const filter = (f) => filterTree(tree().roots, { ...defaultFilters(), ...f }, new Set(["a"]), day, zone);
test("tree construction and candidate rank precede Order, Series children are chronological", () => {
  const t = tree(); assert.deepEqual(t.byId.get("group").children.map((x) => x.id), ["series", "candidate"]);
  assert.deepEqual(t.byId.get("series").children.map((x) => x.id), ["a", "b"]); assert.equal(t.roots.length, 2);
});
test("parent selection uses all public leaves, mixed selects all, full clears all, focus is independent", () => {
  const node = tree().byId.get("group"), focus = "a";
  let ids = new Set(); assert.equal(selectionState(node, ids), "false"); ids.add("a"); assert.equal(selectionState(node, ids), "mixed");
  ids = toggleSelection(node, ids); assert.deepEqual([...ids].sort(), ["a", "b", "candidate"]); assert.equal(selectionState(node, ids), "true");
  ids = toggleSelection(node, ids); assert.equal(ids.size, 0); assert.equal(focus, "a");
});
test("refresh prunes removed public IDs, keeps selection/details/date/range/filter and active valid candidates", () => {
  const state = { selectedIds: new Set(["a", "gone"]), expandedItemIds: new Set(["series", "gone"]), focusedItemId: "gone", activeCandidateByGroup: new Map([["group", "series"], ["gone", "gone"]]), selectedDay: day, mapTimeRange: { start: 600, end: 660 }, filters: defaultFilters() };
  pruneState(state, items); assert.deepEqual([...state.selectedIds], ["a"]); assert.deepEqual([...state.expandedItemIds], ["series"]); assert.equal(state.focusedItemId, null); assert.equal(state.activeCandidateByGroup.size, 1); assert.equal(state.selectedDay, day); assert.deepEqual(state.mapTimeRange, { start: 600, end: 660 });
});
test("OR within category, AND across categories, ancestor retention and cancelled default", () => {
  assert.deepEqual(flattenTree(filter({ type: ["Meal", "Stay"], reservationStatus: ["Required", "Pending"], transport: ["Walk"] })).map((x) => x.id), ["group", "series", "a"]);
  assert.ok(!flattenTree(filter({})).some((x) => x.id === "cancel")); assert.ok(flattenTree(filter({ showCancelled: true })).some((x) => x.id === "cancel"));
});
test("matching container retains descendants, nonmatching container keeps only matching descendants", () => {
  assert.deepEqual(flattenTree(filter({ type: ["Activity"] })).map((x) => x.id), ["group", "series", "a", "b", "candidate"]);
  assert.deepEqual(flattenTree(filter({ reservationStatus: ["Required", "Pending"] })).map((x) => x.id), ["group", "series", "a", "b"]);
  assert.deepEqual(flattenTree(filter({ selectedOnly: true })).map((x) => x.id), ["group", "series", "a"]);
});
test("time initial range rounds to 15 minutes, empty/all-day full day, instant has usable width", () => {
  assert.deepEqual(initialTimeRange(items.slice(0, 5), day, zone), { start: 540, end: 780 });
  assert.deepEqual(initialTimeRange([], day, zone), { start: 0, end: 1440 });
  assert.deepEqual(initialTimeRange([{ start: day }], day, zone), { start: 0, end: 1440 });
  assert.deepEqual(initialTimeRange([{ start: `${day}T00:07:00Z` }], day, zone), { start: 540, end: 570 });
  const instant = { start: `${day}T05:00:00Z` }, range = initialTimeRange([...items.slice(0, 5), instant], day, zone);
  assert.equal(range.end, 855); assert.equal(overlapsRange(instant, range, day, zone), true, "last instantaneous item is included initially");
});
test("half-open overlap, no end, all-day, representative containers and day boundaries", () => {
  const range = { start: 600, end: 660 };
  assert.equal(overlapsRange(items[2], range, day, zone), false); assert.equal(overlapsRange(items[3], range, day, zone), false);
  assert.equal(overlapsRange(items[0], range, day, zone), true);
  assert.equal(overlapsRange({ start: `${day}T01:00:00Z` }, range, day, zone), true);
  assert.equal(overlapsRange({ start: `${day}T02:00:00Z` }, range, day, zone), false);
  assert.equal(overlapsRange({ start: day }, range, day, zone), true);
  assert.equal(overlapsRange({ start: "2026-10-31T14:00:00Z", end: `${day}T02:00:00Z` }, { start: 0, end: 15 }, day, zone), true);
  assert.deepEqual(shiftTimeRange({ start: 15, end: 75 }, -1), { start: 0, end: 60 });
  assert.deepEqual(shiftTimeRange({ start: 1380, end: 1425 }, 1), { start: 1395, end: 1440 });
});
test("map active candidates, Series leaves, fallback only without descendant geographic data and group focus", () => {
  const places = new Map(["fallback", "place", "other"].map((id) => [id, { id, latitude: 35, longitude: 139 }]));
  const roots = filter({}), active = new Map([["group", "series"]]), range = { start: 0, end: 1440 };
  assert.deepEqual(mapNodes(roots, active, range, day, zone, places).map((x) => x.id), ["a", "b"]);
  assert.deepEqual([...focusedMapIds("group", roots, active)], ["group", "series", "a", "b"]);
  active.set("group", "candidate"); assert.deepEqual(mapNodes(roots, active, range, day, zone, places).map((x) => x.id), ["candidate"]);
  assert.deepEqual(mapNodes(roots, active, range, day, zone, new Map([["fallback", places.get("fallback")]])).map((x) => x.id), ["group"]);
});
