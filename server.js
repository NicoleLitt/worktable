import http from "node:http";
import { DatabaseSync } from "node:sqlite";
import {
  randomBytes,
  scryptSync,
  timingSafeEqual,
  createHash,
} from "node:crypto";
import { mkdirSync, readFileSync, existsSync, chmodSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { makeSeed, validateState } from "./shared/model.js";
const ROOT = path.dirname(fileURLToPath(import.meta.url));
export function createApp({
  dataDir = process.env.DATA_DIR || path.join(ROOT, ".data"),
  allowRegistration = process.env.ALLOW_REGISTRATION === "1",
  setupToken = process.env.SETUP_TOKEN || "",
} = {}) {
  mkdirSync(dataDir, { recursive: true, mode: 0o700 });
  const db = new DatabaseSync(path.join(dataDir, "worktable.sqlite"));
  chmodSync(path.join(dataDir, "worktable.sqlite"), 0o600);
  db.exec(
    "PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, salt TEXT NOT NULL, hash TEXT NOT NULL); CREATE TABLE IF NOT EXISTS sessions(token TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id), expires INTEGER NOT NULL); CREATE TABLE IF NOT EXISTS states(user_id TEXT PRIMARY KEY REFERENCES users(id), revision INTEGER NOT NULL, body TEXT NOT NULL, saved_at TEXT NOT NULL);",
  );
  const attempts = new Map();
  const stmt = {
    session: db.prepare(
      "SELECT users.id,users.username FROM sessions JOIN users ON users.id=sessions.user_id WHERE token=? AND expires>?",
    ),
    user: db.prepare("SELECT * FROM users WHERE username=?"),
    state: db.prepare("SELECT * FROM states WHERE user_id=?"),
  };
  const hash = (x) => createHash("sha256").update(x).digest("hex");
  const reply = (res, status, obj) => {
    res.writeHead(status, {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
    });
    res.end(JSON.stringify(obj));
  };
  async function body(req) {
    let text = "";
    for await (const chunk of req) {
      text += chunk;
      if (Buffer.byteLength(text) > 8_000_000)
        throw Object.assign(Error("请求超过8MB"), { status: 413 });
    }
    try {
      return JSON.parse(text);
    } catch {
      throw Object.assign(Error("JSON格式无效"), { status: 400 });
    }
  }
  const server = http.createServer(async (req, res) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "same-origin");
    res.setHeader("X-Frame-Options", "DENY");
    res.setHeader(
      "Content-Security-Policy",
      "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    );
    const url = new URL(req.url, "http://local");
    try {
      if (url.pathname === "/api/health" && req.method === "GET")
        return reply(res, 200, {
          ok: true,
          storage: "sqlite",
          schemaVersion: 1,
        });
      const token = (req.headers.cookie || "")
        .split(";")
        .map((x) => x.trim())
        .find((x) => x.startsWith("session="))
        ?.slice(8);
      const user = token ? stmt.session.get(hash(token), Date.now()) : null;
      if (url.pathname.startsWith("/api/")) {
        if (req.method !== "GET") {
          const origin = req.headers.origin;
          if (origin && new URL(origin).host !== req.headers.host)
            return reply(res, 403, { error: "来源不受信任" });
          if (!req.headers["x-worktable-request"])
            return reply(res, 403, { error: "缺少同源请求标识" });
        }
        if (url.pathname === "/api/me" && req.method === "GET")
          return reply(
            res,
            user ? 200 : 401,
            user
              ? { user: { id: user.id, username: user.username } }
              : {
                  error: "请登录",
                  registrationAvailable:
                    allowRegistration ||
                    db.prepare("SELECT count(*) AS n FROM users").get().n === 0,
                },
          );
        if (
          ["/api/login", "/api/register"].includes(url.pathname) &&
          req.method === "POST"
        ) {
          const key = req.socket.remoteAddress;
          const rate = attempts.get(key) || { count: 0, since: Date.now() };
          if (Date.now() - rate.since > 600000) {
            rate.count = 0;
            rate.since = Date.now();
          }
          rate.count++;
          attempts.set(key, rate);
          if (rate.count > 30)
            return reply(res, 429, { error: "尝试过于频繁，请10分钟后重试" });
          const input = await body(req);
          const username = String(input.username || "").trim(),
            password = String(input.password || "");
          if (
            !/^[\p{L}\p{N}_@.\-]{2,64}$/u.test(username) ||
            password.length < 10 ||
            password.length > 256
          )
            return reply(res, 400, { error: "用户名2—64字符；密码至少10字符" });
          let row = stmt.user.get(username);
          if (url.pathname === "/api/register") {
            const count = db.prepare("SELECT count(*) AS n FROM users").get().n;
            const loopback = ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(
              req.socket.remoteAddress,
            );
            if (!allowRegistration && (count > 0 || (!loopback && !setupToken)))
              return reply(res, 403, {
                error:
                  "注册已关闭。请在服务器本机创建首个账户，或由管理员配置SETUP_TOKEN后注册。",
              });
            if (
              !allowRegistration &&
              (setupToken ? input.setupToken !== setupToken : !loopback)
            )
              return reply(res, 403, { error: "需要管理员初始化令牌" });
            if (row) return reply(res, 409, { error: "用户名已存在" });
            const salt = randomBytes(24).toString("hex"),
              id = randomBytes(16).toString("hex"),
              passwordHash = scryptSync(password, salt, 64).toString("hex");
            db.prepare("INSERT INTO users VALUES(?,?,?,?)").run(
              id,
              username,
              salt,
              passwordHash,
            );
            row = { id, username, salt, hash: passwordHash };
          } else if (
            !row ||
            !timingSafeEqual(
              scryptSync(password, row.salt, 64),
              Buffer.from(row.hash, "hex"),
            )
          )
            return reply(res, 401, { error: "用户名或密码错误" });
          const session = randomBytes(32).toString("hex");
          db.prepare("INSERT INTO sessions VALUES(?,?,?)").run(
            hash(session),
            row.id,
            Date.now() + 7 * 86400000,
          );
          res.setHeader(
            "Set-Cookie",
            `session=${session}; HttpOnly; SameSite=Strict; Path=/; Max-Age=604800${process.env.COOKIE_SECURE === "1" ? "; Secure" : ""}`,
          );
          return reply(res, 200, {
            user: { id: row.id, username: row.username },
          });
        }
        if (!user)
          return reply(res, 401, {
            error: "登录已过期，请重新登录；本机待同步修改会保留",
          });
        if (url.pathname === "/api/logout" && req.method === "POST") {
          if (token)
            db.prepare("DELETE FROM sessions WHERE token=?").run(hash(token));
          res.setHeader(
            "Set-Cookie",
            "session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0",
          );
          return reply(res, 200, { ok: true });
        }
        if (url.pathname === "/api/state" && req.method === "GET") {
          let row = stmt.state.get(user.id);
          if (!row) {
            const state = makeSeed(),
              saved = new Date().toISOString();
            db.prepare("INSERT OR IGNORE INTO states VALUES(?,1,?,?)").run(
              user.id,
              JSON.stringify(state),
              saved,
            );
            row = stmt.state.get(user.id);
          }
          return reply(res, 200, {
            state: JSON.parse(row.body),
            revision: row.revision,
            savedAt: row.saved_at,
          });
        }
        if (url.pathname === "/api/state" && req.method === "PUT") {
          const input = await body(req);
          if (!Number.isInteger(input.revision) || input.revision < 1)
            return reply(res, 400, { error: "版本号无效" });
          try {
            validateState(input.state);
          } catch (e) {
            return reply(res, 400, { error: e.message });
          }
          const saved = new Date().toISOString();
          const r = db
            .prepare(
              "UPDATE states SET revision=revision+1,body=?,saved_at=? WHERE user_id=? AND revision=?",
            )
            .run(JSON.stringify(input.state), saved, user.id, input.revision);
          if (!r.changes) {
            const row = stmt.state.get(user.id);
            return reply(res, 409, {
              error: "另一设备已保存新的版本",
              state: row ? JSON.parse(row.body) : null,
              revision: row?.revision,
              savedAt: row?.saved_at,
            });
          }
          return reply(res, 200, {
            revision: input.revision + 1,
            savedAt: saved,
          });
        }
        return reply(res, 404, { error: "接口不存在" });
      }
      if (req.method !== "GET" && req.method !== "HEAD")
        return reply(res, 405, { error: "方法不支持" });
      const allowed = {
        "/": "public/index.html",
        "/app.js": "public/app.js",
        "/sw.js": "public/sw.js",
        "/style.css": "public/style.css",
        "/shared/model.js": "shared/model.js",
      };
      const file = allowed[url.pathname];
      if (!file) return reply(res, 404, { error: "页面不存在" });
      const mime = file.endsWith(".html")
        ? "text/html"
        : file.endsWith(".css")
          ? "text/css"
          : "text/javascript";
      res.writeHead(200, {
        "Content-Type": mime + "; charset=utf-8",
        "Cache-Control": "no-cache",
      });
      res.end(req.method === "HEAD" ? "" : readFileSync(path.join(ROOT, file)));
    } catch (e) {
      console.error("请求失败:", e.name);
      if (!res.headersSent)
        reply(res, e.status || 500, {
          error: e.status ? e.message : "服务端处理失败，请重试",
        });
      else res.end();
    }
  });
  server.on("close", () => db.close());
  return server;
}
if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  const host = process.env.HOST || "127.0.0.1",
    port = Number(process.env.PORT || 3000);
  const app = createApp();
  app.listen(port, host, () =>
    console.log(
      `工作台已启动，监听${host}:${port}；使用SQLite持久化，首次注册在本机进行。`,
    ),
  );
}
