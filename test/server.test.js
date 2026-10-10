import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createApp } from "../server.js";
test("账户身份隔离、持久化、乐观并发、无效导入原子拒绝、同源保护", async () => {
  const dir = mkdtempSync(path.join(os.tmpdir(), "worktable-test-"));
  let server = createApp({ dataDir: dir, allowRegistration: true });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  let url = "http://127.0.0.1:" + server.address().port;
  const call = async (
    route,
    { cookie = "", method = "GET", payload, headers = {} } = {},
  ) => {
    const r = await fetch(url + route, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-Worktable-Request": "1",
        Cookie: cookie,
        ...headers,
      },
      body: payload === undefined ? undefined : JSON.stringify(payload),
    });
    return {
      status: r.status,
      data: await r.json(),
      cookie: r.headers.get("set-cookie")?.split(";")[0],
    };
  };
  try {
    assert.equal((await call("/api/state")).status, 401);
    const a = await call("/api/register", {
        method: "POST",
        payload: { username: "alice", password: "private-alice-123" },
      }),
      b = await call("/api/register", {
        method: "POST",
        payload: { username: "bob", password: "private-bob-123" },
      });
    assert.equal(a.status, 200);
    assert.ok(a.cookie);
    const x = await call("/api/state", { cookie: a.cookie });
    x.data.state.tasks[0].title = "账户A独有成果";
    const saved = await call("/api/state", {
      method: "PUT",
      cookie: a.cookie,
      payload: { state: x.data.state, revision: x.data.revision },
    });
    assert.equal(saved.status, 200);
    const bob = await call("/api/state", { cookie: b.cookie });
    assert.notEqual(bob.data.state.tasks[0].title, "账户A独有成果");
    assert.equal(
      (
        await call("/api/state", {
          method: "PUT",
          cookie: a.cookie,
          payload: { state: x.data.state, revision: x.data.revision },
        })
      ).status,
      409,
    );
    const invalid = structuredClone(x.data.state);
    invalid.schemaVersion = 99;
    assert.equal(
      (
        await call("/api/state", {
          method: "PUT",
          cookie: a.cookie,
          payload: { state: invalid, revision: saved.data.revision },
        })
      ).status,
      400,
    );
    assert.equal(
      (await call("/api/state", { cookie: a.cookie })).data.revision,
      saved.data.revision,
    );
    assert.equal(
      (
        await call("/api/logout", {
          method: "POST",
          cookie: a.cookie,
          payload: {},
          headers: { Origin: "https://evil.invalid" },
        })
      ).status,
      403,
    );
    await new Promise((r) => server.close(r));
    server = createApp({ dataDir: dir, allowRegistration: true });
    await new Promise((r) => server.listen(0, "127.0.0.1", r));
    url = "http://127.0.0.1:" + server.address().port;
    const restored = await call("/api/state", { cookie: a.cookie });
    assert.equal(restored.data.state.tasks[0].title, "账户A独有成果");
    assert.equal(restored.data.revision, 2);
    const login = await call("/api/login", {
      method: "POST",
      payload: { username: "alice", password: "private-alice-123" },
    });
    assert.equal(login.status, 200);
    assert.equal(
      (await call("/api/state", { cookie: login.cookie })).data.state.tasks[0]
        .title,
      "账户A独有成果",
    );
  } finally {
    await new Promise((r) => server.close(r));
    rmSync(dir, { recursive: true, force: true });
  }
});
