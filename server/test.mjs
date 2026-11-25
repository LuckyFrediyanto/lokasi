import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { LocationHubCore } from "./src/hub.js";

function createSqlAdapter() {
  const db = new DatabaseSync(":memory:");
  return {
    exec(query, ...params) {
      if (params.length === 0 && query.includes(";")) {
        db.exec(query);
        return { toArray: () => [], one: () => undefined };
      }
      const stmt = db.prepare(query);
      if (/^\s*SELECT\b/i.test(query)) {
        const rows = stmt.all(...params);
        return { toArray: () => rows, one: () => rows[0] };
      }
      stmt.run(...params);
      return { toArray: () => [], one: () => undefined };
    },
  };
}

function req(path, { method = "GET", token = null, body = null } = {}) {
  const headers = {};
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== null) headers["content-type"] = "application/json";
  return new Request(`https://example.test${path}`, {
    method,
    headers,
    body: body !== null ? JSON.stringify(body) : undefined,
  });
}

const events = [];
const hub = new LocationHubCore(createSqlAdapter(), (e) => events.push(e));

let res = await hub.handleApi(req("/api/health"));
assert.equal(res.status, 200);
assert.equal((await res.json()).ok, true);

res = await hub.handleApi(req("/api/locations"));
assert.equal(res.status, 401);

res = await hub.handleApi(req("/api/auth/login", {
  method: "POST",
  body: { username: "admin", password: "wrongpassword" },
}));
assert.equal(res.status, 401);

res = await hub.handleApi(req("/api/auth/login", {
  method: "POST",
  body: { username: "admin", password: "123456" },
}));
assert.equal(res.status, 200);
const adminAuth = await res.json();
assert.equal(adminAuth.user.username, "admin");
assert.equal(adminAuth.user.role, "admin");
assert.ok(adminAuth.token.length >= 64);

res = await hub.handleApi(req("/api/users", {
  method: "POST",
  token: adminAuth.token,
  body: { username: "iphone-saya", password: "secret123", role: "user" },
}));
assert.equal(res.status, 201);

res = await hub.handleApi(req("/api/auth/login", {
  method: "POST",
  body: { username: "iphone-saya", password: "secret123" },
}));
assert.equal(res.status, 200);
const iosAuth = await res.json();
assert.equal(iosAuth.user.username, "iphone-saya");
assert.equal(iosAuth.user.role, "user");

res = await hub.handleApi(req("/api/users", { token: iosAuth.token }));
assert.equal(res.status, 403);

res = await hub.handleApi(req("/api/location", {
  method: "POST",
  token: adminAuth.token,
  body: {
    device_id: "android-01",
    platform: "android",
    device_name: "Pixel 8",
    lat: -6.8048,
    lng: 110.8405,
    accuracy: 8.5,
    battery: 82,
    charging: false,
  },
}));
assert.equal(res.status, 200);
const andLoc = await res.json();
assert.equal(andLoc.device.username, "admin");
assert.equal(andLoc.device.device_id, "admin:android-01");
assert.equal(events[events.length - 1].type, "location");

res = await hub.handleApi(req("/api/location", {
  method: "POST",
  token: iosAuth.token,
  body: {
    device_id: "ios-01",
    platform: "ios",
    device_name: "iPhone 15",
    lat: -6.81,
    lng: 110.85,
    accuracy: 5,
    battery: 95,
    charging: true,
  },
}));
assert.equal(res.status, 200);
const iosLoc = await res.json();
assert.equal(iosLoc.device.username, "iphone-saya");
assert.equal(iosLoc.device.device_id, "iphone-saya:ios-01");

res = await hub.handleApi(req("/api/locations", { token: iosAuth.token }));
assert.equal(res.status, 200);
const list = await res.json();
assert.equal(list.devices.length, 2);

res = await hub.handleApi(req("/api/locations/iphone-saya%3Aios-01/history", { token: adminAuth.token }));
assert.equal(res.status, 200);
assert.equal((await res.json()).points.length, 1);

res = await hub.handleApi(req("/api/locations/iphone-saya%3Aios-01/ping", {
  method: "POST",
  token: adminAuth.token,
}));
assert.equal(res.status, 200);
assert.equal(events[events.length - 1].type, "ring");
assert.equal(events[events.length - 1].target_device_id, "iphone-saya:ios-01");

res = await hub.handleApi(req("/api/locations/admin%3Aandroid-01", {
  method: "DELETE",
  token: iosAuth.token,
}));
assert.equal(res.status, 403);

res = await hub.handleApi(req("/api/users/iphone-saya", {
  method: "DELETE",
  token: adminAuth.token,
}));
assert.equal(res.status, 200);
assert.equal(events[events.length - 1].type, "device_removed");

res = await hub.handleApi(req("/api/auth/me", { token: iosAuth.token }));
assert.equal(res.status, 401);

res = await hub.handleApi(req("/api/auth/logout", {
  method: "POST",
  token: adminAuth.token,
}));
assert.equal(res.status, 200);

res = await hub.handleApi(req("/api/auth/me", { token: adminAuth.token }));
assert.equal(res.status, 401);

console.log("ALL_TESTS_PASSED");
