import assert from "node:assert/strict";
import test from "node:test";
import { PageClient } from "../server/meta-client.js";

function json(data: unknown) {
  return new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

test("Page client reads comments and scheduled posts with bounded fields", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const request = async (input: URL | RequestInfo, init?: RequestInit) => {
    const url = String(input);
    requests.push({ url, init });
    if (url.includes("scheduled_posts"))
      return json({ data: [{ id: "1_2", scheduled_publish_time: 2_000_000_000 }] });
    return json({ data: [{ id: "1_2_3", message: "hello" }] });
  };
  const client = new PageClient("page-token", "v23.0", request as typeof fetch);
  const scheduled = await client.scheduledPosts("1");
  const comments = await client.comments("1_2");
  assert.equal((scheduled.posts[0] as any).id, "1_2");
  assert.equal(comments.comments[0].id, "1_2_3");
  assert.match(requests[0].url, /1\/scheduled_posts/);
  assert.match(requests[1].url, /1_2\/comments/);
  assert.match(requests[1].url, /fields=/);
  assert.equal(new Headers(requests[0].init?.headers).get("authorization"), "Bearer page-token");
});

test("Page client replies, deletes, and schedules through Graph API", async () => {
  const requests: Array<{ url: string; init?: RequestInit }> = [];
  const request = async (input: URL | RequestInfo, init?: RequestInit) => {
    requests.push({ url: String(input), init });
    if (init?.method === "DELETE") return json({ success: true });
    return json({ id: "1_2", post_id: "1_2" });
  };
  const client = new PageClient("page-token", "v23.0", request as typeof fetch);
  await client.replyToComment("1_2_3", "Thanks");
  await client.deleteObject("1_2_3");
  await client.scheduleText("1", "Scheduled text", 2_000_000_000);
  await client.schedulePhoto("1", "Scheduled photo", "https://cdn.example.com/a.jpg", 2_000_000_000);

  assert.equal(requests[0].init?.method, "POST");
  assert.match(String(requests[0].init?.body), /message=Thanks/);
  assert.equal(requests[1].init?.method, "DELETE");
  assert.match(String(requests[2].init?.body), /published=false/);
  assert.match(String(requests[2].init?.body), /scheduled_publish_time=2000000000/);
  assert.match(String(requests[3].init?.body), /url=https%3A%2F%2Fcdn\.example\.com%2Fa\.jpg/);
});
