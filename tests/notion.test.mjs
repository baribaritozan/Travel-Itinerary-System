import test from "node:test";
import assert from "node:assert/strict";
import { buildTripPayload, normalizeId, plainText } from "../scripts/notion.mjs";

const title = (text) => ({ title: [{ plain_text: text }] });
const richText = (text) => ({ rich_text: [{ plain_text: text }] });
const relation = (...ids) => ({ relation: ids.map((id) => ({ id })) });

test("normalizes Notion IDs", () => {
  assert.equal(normalizeId("AAAA-BBBB"), "aaaabbbb");
});

test("joins rich text fragments", () => {
  assert.equal(plainText({ rich_text: [{ plain_text: "京" }, { plain_text: "都" }] }), "京都");
});

test("builds and sorts a published trip payload", () => {
  const tripPage = {
    id: "trip-id",
    properties: {
      Trip: title("Kyoto"), Slug: richText("kyoto"), Timezone: richText("Asia/Tokyo"),
      Period: { date: { start: "2026-11-14", end: "2026-11-15" } }, Status: { select: { name: "Planning" } },
    },
  };
  const placePages = [{
    id: "place-id",
    properties: {
      Place: title("Kyoto Station"), Latitude: { number: 34.98 }, Longitude: { number: 135.75 },
      Address: richText("Kyoto"), "Maps URL": { url: null }, Phone: { phone_number: null }, Website: { url: null }, "Public Notes": richText("Meet here"),
    },
  }];
  const itemPages = [{
    id: "item-id",
    properties: {
      Item: title("Arrival"), Trip: relation("trip-id"), Period: { date: { start: "2026-11-14T09:00:00+09:00", end: null } },
      Order: { number: 1 }, Type: { select: { name: "Activity" } }, Status: { select: { name: "Confirmed" } }, Transport: { select: null },
      Place: relation("place-id"), From: relation(), To: relation(), "Navigation URL": { url: null }, "Reservation URL": { url: null }, "Public Notes": richText("Central gate"),
    },
  }];
  const payload = buildTripPayload({ tripPage, placePages, itemPages, generatedAt: "2026-10-07T00:00:00Z" });
  assert.equal(payload.trip.slug, "kyoto");
  assert.equal(payload.items[0].placeId, normalizeId("place-id"));
  assert.equal(payload.places.length, 1);
});
