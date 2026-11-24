import assert from "node:assert/strict";
import { createServer, request } from "node:http";
import { once } from "node:events";
import type { AddressInfo } from "node:net";
import test from "node:test";
import { createApp } from "../server/app.ts";
import { createProvider } from "../server/provider.ts";
import { demoExamples } from "../shared/demo.ts";

async function withServer(
  app: ReturnType<typeof createApp>,
  run: (url: string) => Promise<void>,
) {
  const server = createServer(app).listen(0, "127.0.0.1");
  await once(server, "listening");
  try {
    await run("http://127.0.0.1:" + (server.address() as AddressInfo).port);
  } finally {
    server.closeAllConnections();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

const proposal = demoExamples[0].proposal;
const post = (
  url: string,
  token: string,
  body: Record<string, unknown> = { proposal },
) =>
  fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer " + token,
    },
    body: JSON.stringify(body),
  });

test("SEC-01 and SEC-03 · server-led quota is shared, account scoped, reloadable and independent of authentication", async () => {
  const attempts = new Map<string, number>();
  let allowed = 15;
  const provider = createProvider("synthetic-key", "test", async () =>
    Response.json({
      status: "completed",
      output: [
        {
          type: "message",
          content: [
            {
              type: "output_text",
              text: JSON.stringify({
                scope: "engineering",
                explanation: "",
                claims: demoExamples[0].claims.map((claim) => ({
                  ...claim,
                  loadBearing: Boolean(claim.loadBearing),
                  risk: claim.risk ?? "technical",
                })),
              }),
            },
          ],
        },
      ],
    }),
  );
  const accounts: Record<string, string> = {
    first: "account-a",
    renewed: "account-a",
    second: "account-b",
  };
  await withServer(
    createApp(provider, {
      verifySession: async (token) => accounts[token] ?? null,
      reserveUsage: async (token) => {
        const account = accounts[token];
        const used = attempts.get(account) ?? 0;
        if (used >= allowed) return false;
        attempts.set(account, used + 1);
        return true;
      },
    }),
    async (url) => {
      const endpoint = url + "/api/claims";
      const anonymous = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ proposal }),
      });
      assert.equal(anonymous.status, 401);
      assert.equal((await post(endpoint, "expired")).status, 401);
      assert.equal(attempts.size, 0);
      for (let i = 0; i < allowed; i += 1) {
        const success = await post(endpoint, i % 2 ? "first" : "renewed");
        assert.equal(success.status, 200, await success.text());
      }
      const attemptedOverride = await post(
        endpoint + "?hourly_limit=120",
        "first",
        {
          proposal,
          hourly_limit: 120,
          account: "account-b",
        },
      );
      assert.equal(attemptedOverride.status, 429);
      assert.match(await attemptedOverride.text(), /hourly live review limit/);
      assert.equal((await post(endpoint, "second")).status, 200);
      allowed += 1;
      assert.equal((await post(endpoint, "first")).status, 200);
      attempts.clear();
      assert.equal((await post(endpoint, "first")).status, 200);
      const malformed = await fetch(endpoint, {
        method: "POST",
        headers: {
          Authorization: "Bearer first",
          "Content-Type": "application/json",
        },
        body: "{",
      });
      assert.equal(malformed.status, 400);
      assert.doesNotMatch(
        await malformed.text(),
        /SyntaxError|synthetic-key|stack/i,
      );
    },
  );
});

test("SEC-02 · a provider 429 has its own message and Retry-After without automatic retry", async () => {
  let calls = 0;
  const provider = createProvider(
    "synthetic-key",
    "test",
    async () => {
      calls += 1;
      return new Response("upstream diagnostic", {
        status: 429,
        headers: { "Retry-After": "17" },
      });
    },
    "meta",
  );
  const session =
    "synthetic." +
    Buffer.from(
      JSON.stringify({ session_id: "43376bc7-79ff-4fdd-ab13-a54a94a6b30d" }),
    ).toString("base64url") +
    ".fixture";
  await withServer(
    createApp(provider, {
      verifySession: async (token) =>
        token === session ? "test-account" : null,
      metaRequest: async () =>
        new Response("key validation response", {
          status: 429,
          headers: { "Retry-After": "23" },
        }),
    }),
    async (url) => {
      const claims = await post(url + "/api/claims", session);
      assert.equal(claims.status, 429);
      assert.equal(claims.headers.get("Retry-After"), "17");
      assert.equal(calls, 1);
      assert.match(
        await claims.text(),
        /provider returned a rate or quota limit without a clear cause/,
      );

      const stream = await post(url + "/api/reviews", session, {
        proposal,
        claims: demoExamples[0].claims,
      });
      assert.equal(
        stream.status,
        200,
        "The review has already started streaming",
      );
      const events = await stream.text();
      assert.match(
        events,
        /"type":"error","message":"The provider returned a rate or quota limit[^"]*","retryAfter":"17"/,
      );
      assert.doesNotMatch(
        events,
        /"type":"report"|upstream diagnostic|synthetic-key/,
      );

      const key = await post(url + "/api/settings/provider", session, {
        key: "synthetic-test-key",
      });
      assert.equal(key.status, 429);
      assert.equal(key.headers.get("Retry-After"), "23");
      const error = await key.text();
      assert.match(error, /provider_rate_limit/);
      assert.doesNotMatch(error, /synthetic-test-key|key validation response/);
      const settings = await fetch(url + "/api/settings/provider", {
        headers: { Authorization: "Bearer " + session },
      });
      assert.equal((await settings.json()).saved, false);
    },
  );
});

test("SEC-03 · settings bursts are capped and trusted ingress uses the nearest client IP", async () => {
  let verifies = 0;
  const app = createApp(undefined, {
    trustProxy: (peer, hop) => hop === 0 && peer === "127.0.0.1",
    verifySession: async () => {
      verifies += 1;
      return null;
    },
  });
  await withServer(app, async (url) => {
    const status = url + "/api/status";
    for (let i = 0; i < 31; i += 1) {
      const response = await fetch(status, {
        headers: {
          "X-Forwarded-For": "198.51.100." + (i + 1) + ", 192.0.2.3",
          Authorization: "Bearer expired",
        },
      });
      assert.equal(response.status, i === 30 ? 429 : 401);
      if (i === 30) {
        assert.match(await response.text(), /Too many sign-in checks/);
        assert.ok(Number(response.headers.get("Retry-After")) > 0);
      }
    }
    assert.equal(verifies, 30);
    for (let i = 0; i < 30; i += 1) {
      const response = await fetch(status, {
        headers: { "X-Forwarded-For": "192.0.2.3" },
      });
      assert.equal(response.status, i === 29 ? 429 : 200);
      if (i === 29)
        assert.match(
          await response.text(),
          /Too many status or provider settings requests/,
        );
    }
    const independentlyVerified = await fetch(status, {
      headers: {
        "X-Forwarded-For": "192.0.2.4",
        Authorization: "Bearer expired",
      },
    });
    assert.equal(independentlyVerified.status, 401);
    assert.equal(verifies, 31);
    const invalidHost = await new Promise<number | undefined>(
      (resolve, reject) => {
        request(
          status,
          {
            headers: {
              Host: "not-tactile.test",
              "X-Forwarded-Host": "127.0.0.1",
            },
          },
          (response) => {
            response.resume();
            resolve(response.statusCode);
          },
        )
          .on("error", reject)
          .end();
      },
    );
    assert.equal(invalidHost, 403);
  });
});
