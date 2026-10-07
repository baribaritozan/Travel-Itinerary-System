const GITHUB_API_VERSION = "2026-03-10";

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

async function sha256(value) {
  return new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value)));
}

export async function secretsMatch(provided, expected) {
  if (!provided || !expected) return false;
  const [providedHash, expectedHash] = await Promise.all([sha256(provided), sha256(expected)]);
  let difference = 0;
  for (let index = 0; index < providedHash.length; index += 1) {
    difference |= providedHash[index] ^ expectedHash[index];
  }
  return difference === 0;
}

function validSlug(value) {
  return typeof value === "string" && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(value) && value.length <= 80;
}

async function requestBody(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

export async function handlePublishRequest(request, env, fetchImpl = fetch) {
  if (request.method !== "POST") {
    return jsonResponse({ error: "POSTを使用してください。" }, 405, { Allow: "POST" });
  }

  if (!env.PUBLISH_KEY || !env.GITHUB_ACTIONS_TOKEN) {
    return jsonResponse({ error: "更新APIのSecretsが未設定です。" }, 503);
  }

  const authorized = await secretsMatch(request.headers.get("X-Publish-Key"), env.PUBLISH_KEY);
  if (!authorized) return jsonResponse({ error: "更新キーが正しくありません。" }, 401);

  const body = await requestBody(request);
  const tripSlug = body.trip_slug || env.DEFAULT_TRIP_SLUG;
  if (!validSlug(tripSlug)) return jsonResponse({ error: "trip_slugが不正です。" }, 400);

  const owner = env.GITHUB_OWNER || "baribaritozan";
  const repository = env.GITHUB_REPO || "Travel-Itinerary-System";
  const workflow = env.GITHUB_WORKFLOW || "publish.yml";
  const ref = env.GITHUB_REF || "main";
  const response = await fetchImpl(
    `https://api.github.com/repos/${encodeURIComponent(owner)}/${encodeURIComponent(repository)}/actions/workflows/${encodeURIComponent(workflow)}/dispatches`,
    {
      method: "POST",
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${env.GITHUB_ACTIONS_TOKEN}`,
        "Content-Type": "application/json",
        "User-Agent": "travel-itinerary-publisher",
        "X-GitHub-Api-Version": GITHUB_API_VERSION,
      },
      body: JSON.stringify({ ref, inputs: { trip_slug: tripSlug } }),
    },
  );

  if (!response.ok) {
    console.error("GitHub workflow dispatch failed", response.status, await response.text());
    return jsonResponse({ error: "GitHub Actionsを開始できませんでした。" }, 502);
  }

  return jsonResponse({ queued: true, trip_slug: tripSlug }, 202);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname === "/api/publish") return handlePublishRequest(request, env);
    return env.ASSETS.fetch(request);
  },
};
