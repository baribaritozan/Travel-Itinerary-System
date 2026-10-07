import {
  normalizeId,
  plainText,
  relationIds,
  retrievePage,
  syncTripFromNotion,
  updatePage,
} from "../scripts/notion.mjs";

const REFRESH_COOLDOWN_MS = 60_000;

function jsonResponse(body, status = 200, headers = {}) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      ...headers,
    },
  });
}

function validSlug(value) {
  return typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= 80;
}

function requiredEnv(env, name) {
  const value = env[name];
  if (!value) throw new Error(`Worker setting ${name} is missing.`);
  return value;
}

function stateStub(env, slug) {
  return env.ITINERARY_STATE.get(env.ITINERARY_STATE.idFromName(slug));
}

async function stateRequest(env, slug, force = false) {
  const url = new URL("https://itinerary-state.internal/data");
  url.searchParams.set("slug", slug);
  if (force) url.searchParams.set("refresh", "1");
  return stateStub(env, slug).fetch(url);
}

function selectedSlug(request, env) {
  const requested = new URL(request.url).searchParams.get("slug");
  const slug = requested || requiredEnv(env, "DEFAULT_TRIP_SLUG");
  if (!validSlug(slug) || slug !== env.DEFAULT_TRIP_SLUG) return null;
  return slug;
}

export async function handleItineraryRequest(request, env) {
  if (request.method !== "GET") return jsonResponse({ error: "GETを使用してください。" }, 405, { Allow: "GET" });
  const slug = selectedSlug(request, env);
  if (!slug) return jsonResponse({ error: "公開対象ではないtrip_slugです。" }, 404);
  return stateRequest(env, slug);
}

export async function handleRefreshRequest(request, env) {
  if (request.method !== "POST") return jsonResponse({ error: "POSTを使用してください。" }, 405, { Allow: "POST" });
  const origin = request.headers.get("Origin");
  if (origin && origin !== new URL(request.url).origin) return jsonResponse({ error: "別のサイトからは更新できません。" }, 403);
  const slug = selectedSlug(request, env);
  if (!slug) return jsonResponse({ error: "公開対象ではないtrip_slugです。" }, 404);
  return stateRequest(env, slug, true);
}

function hex(bytes) {
  return [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, "0")).join("");
}

function constantTimeEqual(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

export async function verifyNotionSignature(rawBody, signature, secret) {
  if (!signature || !secret) return false;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(rawBody));
  return constantTimeEqual(signature, `sha256=${hex(digest)}`);
}

async function setRequestResult(env, pageId, status, error = "") {
  await updatePage({
    token: requiredEnv(env, "NOTION_TOKEN"),
    pageId,
    properties: {
      Status: { select: { name: status } },
      "Processed At": { date: { start: new Date().toISOString() } },
      Error: { rich_text: error ? [{ type: "text", text: { content: error.slice(0, 1_900) } }] : [] },
    },
  });
}

async function processPublishRequest(event, env) {
  const pageId = event.entity?.id;
  if (event.type !== "page.created" || !pageId) return;

  let requestPage;
  try {
    requestPage = await retrievePage({ token: requiredEnv(env, "NOTION_TOKEN"), pageId });
    const parentId = requestPage.parent?.data_source_id || requestPage.parent?.database_id;
    if (normalizeId(parentId) !== normalizeId(requiredEnv(env, "NOTION_PUBLISH_REQUESTS_DATA_SOURCE_ID"))) return;

    const tripId = relationIds(requestPage.properties.Trip)[0];
    let slug = env.DEFAULT_TRIP_SLUG;
    if (tripId) {
      const tripPage = await retrievePage({ token: env.NOTION_TOKEN, pageId: tripId });
      slug = plainText(tripPage.properties.Slug);
    }
    if (!validSlug(slug)) throw new Error("Publish Requests.TripのSlugが不正です。");
    const response = await stateRequest(env, slug, true);
    if (!response.ok) throw new Error(`旅程の更新に失敗しました (${response.status})。`);
    await setRequestResult(env, pageId, "Published");
  } catch (error) {
    console.error("Notion publish request failed", error);
    if (requestPage) {
      try {
        await setRequestResult(env, pageId, "Error", error instanceof Error ? error.message : String(error));
      } catch (updateError) {
        console.error("Could not update Publish Requests status", updateError);
      }
    }
  }
}

export async function handleNotionWebhook(request, env, ctx = { waitUntil() {} }) {
  if (request.method !== "POST") return jsonResponse({ error: "POSTを使用してください。" }, 405, { Allow: "POST" });
  const rawBody = await request.text();
  let event;
  try {
    event = JSON.parse(rawBody);
  } catch {
    return jsonResponse({ error: "JSONが不正です。" }, 400);
  }

  if (typeof event.verification_token === "string") {
    console.log("Notion webhook verification token:", event.verification_token);
    return jsonResponse({ received: true });
  }

  const valid = await verifyNotionSignature(
    rawBody,
    request.headers.get("X-Notion-Signature"),
    env.NOTION_WEBHOOK_VERIFICATION_TOKEN,
  );
  if (!valid) return jsonResponse({ error: "署名を検証できません。" }, 401);
  ctx.waitUntil(processPublishRequest(event, env));
  return jsonResponse({ accepted: true }, 202);
}

export class ItineraryState {
  constructor(ctx, env) {
    this.ctx = ctx;
    this.env = env;
    this.refreshPromise = null;
  }

  async refresh(slug) {
    if (this.refreshPromise) return this.refreshPromise;
    this.refreshPromise = (async () => {
      const payload = await syncTripFromNotion({
        token: requiredEnv(this.env, "NOTION_TOKEN"),
        tripSlug: slug,
        tripsDataSourceId: requiredEnv(this.env, "NOTION_TRIPS_DATA_SOURCE_ID"),
        placesDataSourceId: requiredEnv(this.env, "NOTION_PLACES_DATA_SOURCE_ID"),
        itemsDataSourceId: requiredEnv(this.env, "NOTION_ITEMS_DATA_SOURCE_ID"),
      });
      const refreshedAt = Date.now();
      await this.ctx.storage.put({ payload, refreshedAt });
      return { payload, refreshedAt };
    })();
    try {
      return await this.refreshPromise;
    } finally {
      this.refreshPromise = null;
    }
  }

  async fetch(request) {
    const url = new URL(request.url);
    const slug = url.searchParams.get("slug");
    if (!validSlug(slug)) return jsonResponse({ error: "trip_slugが不正です。" }, 400);

    const [payload, refreshedAt] = await Promise.all([
      this.ctx.storage.get("payload"),
      this.ctx.storage.get("refreshedAt"),
    ]);
    const force = url.searchParams.get("refresh") === "1";
    if (payload && (!force || Date.now() - refreshedAt < REFRESH_COOLDOWN_MS)) {
      return jsonResponse(payload, 200, { "X-Itinerary-Cache": force ? "throttled" : "hit" });
    }

    try {
      const refreshed = await this.refresh(slug);
      return jsonResponse(refreshed.payload, 200, { "X-Itinerary-Cache": "refreshed" });
    } catch (error) {
      console.error("Notion refresh failed", error);
      if (payload) return jsonResponse(payload, 200, { "X-Itinerary-Cache": "stale" });
      return jsonResponse({ error: "Notionから旅程を取得できませんでした。" }, 502);
    }
  }
}

export default {
  async fetch(request, env, ctx) {
    const pathname = new URL(request.url).pathname;
    if (pathname === "/api/itinerary") return handleItineraryRequest(request, env);
    if (pathname === "/api/refresh") return handleRefreshRequest(request, env);
    if (pathname === "/api/notion-webhook") return handleNotionWebhook(request, env, ctx);
    return env.ASSETS.fetch(request);
  },
};
