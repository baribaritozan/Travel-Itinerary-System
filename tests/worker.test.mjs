import test from "node:test";
import assert from "node:assert/strict";
import {
  handleItineraryRequest,
  handleNotionWebhook,
  handleRefreshRequest,
  ItineraryState,
  verifyNotionSignature,
} from "../src/worker.mjs";

const payload = {
  generatedAt: "2026-10-08T00:00:00.000Z",
  trip: { name: "Kyoto", slug: "sample-trip" },
  places: [],
  items: [],
};

function namespace(response = Response.json(payload)) {
  return {
    idFromName(name) {
      assert.equal(name, "sample-trip");
      return name;
    },
    get() {
      return { fetch: async () => response.clone() };
    },
  };
}

test("serves the configured itinerary from its Durable Object", async () => {
  const env = { DEFAULT_TRIP_SLUG: "sample-trip", ITINERARY_STATE: namespace() };
  const response = await handleItineraryRequest(new Request("https://example.com/api/itinerary"), env);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).trip.name, "Kyoto");
});

test("rejects cross-origin refreshes", async () => {
  const env = { DEFAULT_TRIP_SLUG: "sample-trip", ITINERARY_STATE: namespace() };
  const request = new Request("https://example.com/api/refresh", {
    method: "POST",
    headers: { Origin: "https://attacker.example" },
  });
  const response = await handleRefreshRequest(request, env);
  assert.equal(response.status, 403);
});

test("accepts same-origin refreshes without a browser secret", async () => {
  const env = { DEFAULT_TRIP_SLUG: "sample-trip", ITINERARY_STATE: namespace() };
  const request = new Request("https://example.com/api/refresh?slug=sample-trip", {
    method: "POST",
    headers: { Origin: "https://example.com" },
  });
  const response = await handleRefreshRequest(request, env);
  assert.equal(response.status, 200);
});

test("validates Notion webhook HMAC signatures", async () => {
  const body = JSON.stringify({ type: "page.created" });
  const secret = "verification-secret";
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(body)));
  const signature = `sha256=${[...digest].map((value) => value.toString(16).padStart(2, "0")).join("")}`;
  assert.equal(await verifyNotionSignature(body, signature, secret), true);
  assert.equal(await verifyNotionSignature(body, signature, "wrong"), false);
});

test("acknowledges the Notion webhook verification request", async () => {
  const request = new Request("https://example.com/api/notion-webhook", {
    method: "POST",
    body: JSON.stringify({ verification_token: "token-from-notion" }),
  });
  const response = await handleNotionWebhook(request, {});
  assert.equal(response.status, 200);
});

test("returns a cached Durable Object payload during cooldown", async () => {
  const storage = {
    async get(key) {
      return key === "payload" ? payload : Date.now();
    },
  };
  const state = new ItineraryState({ storage }, {});
  const response = await state.fetch(new Request("https://internal/data?slug=sample-trip&refresh=1"));
  assert.equal(response.status, 200);
  assert.equal(response.headers.get("X-Itinerary-Cache"), "throttled");
});
