import test from "node:test";
import assert from "node:assert/strict";
import { handlePublishRequest, secretsMatch } from "../src/worker.mjs";

const env = {
  PUBLISH_KEY: "correct-secret",
  GITHUB_ACTIONS_TOKEN: "github-token",
  GITHUB_OWNER: "owner",
  GITHUB_REPO: "repo",
  GITHUB_WORKFLOW: "publish.yml",
  GITHUB_REF: "main",
  DEFAULT_TRIP_SLUG: "sample-trip",
};

test("compares publish keys", async () => {
  assert.equal(await secretsMatch("correct-secret", "correct-secret"), true);
  assert.equal(await secretsMatch("wrong", "correct-secret"), false);
});

test("rejects an invalid publish key", async () => {
  const request = new Request("https://example.com/api/publish", {
    method: "POST",
    headers: { "X-Publish-Key": "wrong" },
  });
  const response = await handlePublishRequest(request, env, () => assert.fail("GitHub must not be called"));
  assert.equal(response.status, 401);
});

test("dispatches the fixed GitHub workflow", async () => {
  const request = new Request("https://example.com/api/publish", {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Publish-Key": "correct-secret" },
    body: JSON.stringify({ trip_slug: "sample-trip" }),
  });
  let dispatched;
  const response = await handlePublishRequest(request, env, async (url, options) => {
    dispatched = { url, options, body: JSON.parse(options.body) };
    return new Response(null, { status: 204 });
  });
  assert.equal(response.status, 202);
  assert.equal(dispatched.url, "https://api.github.com/repos/owner/repo/actions/workflows/publish.yml/dispatches");
  assert.equal(dispatched.options.headers.Authorization, "Bearer github-token");
  assert.deepEqual(dispatched.body, { ref: "main", inputs: { trip_slug: "sample-trip" } });
});
