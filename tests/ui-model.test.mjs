import test from "node:test";
import assert from "node:assert/strict";
import { dayInZone, tripDays, chooseInitialDay, compareItems, formatDay, formatTime, safeUrl, escapeHtml, hasCoordinates, buildMapsUrl, nearestItem } from "../public/model.mjs";
import { normalizeDate } from "../scripts/notion.mjs";

test("trip dates and today are independent of UTC and the device zone", () => {
  const instant = "2026-10-08T16:30:00Z";
  assert.equal(dayInZone(instant, "Asia/Tokyo"), "2026-10-09");
  assert.equal(dayInZone(instant, "America/Los_Angeles"), "2026-10-08");
  assert.equal(chooseInitialDay(["2026-10-08", "2026-10-09"], "Asia/Tokyo", new Date(instant)), "2026-10-09");
  assert.equal(chooseInitialDay(["2026-10-01", "2026-10-12"], "UTC", new Date(instant)), "2026-10-12");
  assert.equal(chooseInitialDay(["2026-10-01", "2026-10-12"], "UTC", new Date("2026-09-01Z")), "2026-10-01");
  assert.equal(formatTime(instant, "Asia/Tokyo"), "01:30");
});

test("calendar dates and empty days retain labels even at UTC+14 and UTC-12", () => {
  for (const timezone of ["Pacific/Kiritimati", "Etc/GMT+12", "Asia/Tokyo"]) {
    assert.equal(dayInZone("2026-10-08", timezone), "2026-10-08");
    assert.deepEqual(tripDays({ start: "2026-10-08", end: "2026-10-10", timezone }, []), ["2026-10-08", "2026-10-09", "2026-10-10"]);
  }
  assert.match(formatDay("2026-10-08"), /10\/8.*木/);
  assert.equal(formatTime("2026-10-08", "Asia/Tokyo"), "終日");
});

test("itinerary ordering uses instants, display order, then title", () => {
  const items = [
    { title: "C", start: "2026-10-08T09:00:00+09:00", order: 2 },
    { title: "B", start: "2026-10-07T17:00:00-07:00", order: 1 },
    { title: "A", start: "2026-10-08T00:00:00Z", order: 1 },
    { title: "first", start: "2026-10-08T08:59:00+09:00", order: 9 },
  ];
  assert.deepEqual(items.sort(compareItems).map((item) => item.title), ["first", "A", "B", "C"]);
});

test("Notion wall times respect date.time_zone, DST, and fractional seconds", () => {
  assert.equal(normalizeDate("2026-10-08T09:30:00", "Asia/Tokyo"), "2026-10-08T00:30:00.000Z");
  assert.equal(normalizeDate("2026-10-08T09:30:00.123", "Asia/Tokyo"), "2026-10-08T00:30:00.123Z");
  assert.equal(normalizeDate("2026-07-08T09:30", "America/Los_Angeles"), "2026-07-08T16:30:00.000Z");
  assert.throws(() => normalizeDate("2026-03-08T02:30", "America/Los_Angeles"), /Nonexistent/);
  assert.throws(() => normalizeDate("2026-02-30", "UTC"));
  assert.throws(() => normalizeDate("2026-02-30T09:00:00Z", "UTC"));
});

test("HTML and attribute data are escaped and unsafe URLs rejected", () => {
  assert.equal(escapeHtml('<img onerror="x">&\''), "&lt;img onerror=&quot;x&quot;&gt;&amp;&#39;");
  for (const value of ["javascript:alert(1)", "data:text/html,<script>", "http://example.com", "//example.com", "https://user:pass@example.com", "not a URL"]) assert.equal(safeUrl(value), null);
  assert.equal(safeUrl("https://example.com/?a=1&b=2"), "https://example.com/?a=1&b=2");
});

test("maps links remain usable without a map library and invalid coordinates", () => {
  const places = new Map([["p", { name: "地点 & A", latitude: 0, longitude: 0 }], ["q", { name: "住所なし", latitude: 999, longitude: 0 }]]);
  assert.equal(hasCoordinates(places.get("p")), true); assert.equal(hasCoordinates(places.get("q")), false);
  assert.match(buildMapsUrl({ placeId: "p", navigationUrl: "javascript:x" }, places), /query=0%2C0/);
  assert.match(buildMapsUrl({ fromId: "p", toId: "p" }, places), /maps\/dir/);
  assert.match(buildMapsUrl({ placeId: "q" }, places), /query=/);
});

test("spot focus chooses the intersecting expanded card and otherwise the nearest", () => {
  const card = (id, top, bottom) => ({ dataset: { id }, getBoundingClientRect: () => ({ top, bottom }) });
  assert.equal(nearestItem([card("first", -100, 300), card("second", 320, 500)], 250), "first");
  assert.equal(nearestItem([card("first", -100, 100), card("second", 130, 300)], 120), "second");
});

test("all text color combinations meet WCAG AA for normal text", () => {
  const luminance = (hex) => {
    const values = hex.match(/\w\w/g).map((value) => parseInt(value, 16) / 255).map((value) => value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4);
    return values[0] * .2126 + values[1] * .7152 + values[2] * .0722;
  };
  for (const [fg, bg] of [["18312d", "f5f2e9"], ["4e625b", "fffefa"], ["9f3f26", "fff4ed"], ["7b321e", "f8dfd5"], ["78420e", "fff0d4"], ["ffffff", "163a35"]]) {
    const a = luminance(fg), b = luminance(bg); assert.ok((Math.max(a, b) + .05) / (Math.min(a, b) + .05) >= 4.5, `${fg}/${bg}`);
  }
});
